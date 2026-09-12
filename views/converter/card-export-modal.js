/*
## 核心功能

图片卡片导出弹窗的生命周期与编排层（B05）：承载 Obsidian 原生 Modal 外壳
（打开 / 恢复 / 关闭 / 释放）、任务编排（冻结快照 → 建任务 → 逐页输出）、
进度事件接收与失败重试入口。DOM 渲染委托 card-export-modal-view.js。

关闭语义（§6.2）：关闭 / Escape / 遮罩统一只关展示层——任务在会话里后台继续，
只有显式「取消导出」或视图 dispose 才停止。Escape 与遮罩由 Obsidian Modal 原生处理，
统一汇入 onClose，因此不再自行监听键盘。

## 输入

AppleStyleView 实例（app / 会话 / 预览负载）与用户交互（开始 / 取消 / 关闭 / 重试 / 改目录与倍率）。

## 输出

导出 `cardExportMethods`（由 AppleStyleView 组装）：
- `openCardExportModal()`：打开或恢复弹窗（恢复运行中任务 / 待查看结果；不新建重复任务）；
- `closeCardExportModal()`：仅关展示层，任务存活；
- `startCardExport()`：按导出范围（全部 / 预览勾选的页）冻结合格快照 → 建任务 → 逐页输出 → 进度刷新；
- `startNewCardExport()`：结果已读后回到表单（允许换倍率/目录再导一批，不新开任务窗口）；
- `cancelCardExport()` / `retryCardExportFailedPages()` / `retryCardExportManifest()`；
- `handleCardExportProgress()`：接收导出器进度事件并驱动重绘。

## 定位

位于 views/converter/，卡片导出的编排层；展示在 card-export-modal-view.js，
导出规则（资格 / 路径安全 / 清单 / 部分成功）在 services/card-exporter.js，
能力适配在 card-export-bridge.js。

## 依赖

`../../services/obsidian-compat.js`（createObsidianModal，经 apple-style-view-shared 转出）、
`./card-export-modal-view.js`（渲染方法组与 formatExportReason）、`./card-export-bridge.js`（默认倍率与目录）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的 README 是否仍准确。
- 弹窗不决定任务存活（§6.2）：关闭 / 换篇 / 换模式不得取消任务；只有显式取消或视图 dispose 才停止。
- 重开必须复用原任务（禁止第二个任务），由会话 beginExportJob 的单任务语义兜底。
- 一切关闭路径（关闭按钮 / Escape / 遮罩）都必须汇入 modal.onClose，避免两套清理逻辑分叉。
- 导出范围由预览勾选推导（`resolveCardExportScope`，实现在 card-export-modal-view）：
  'selected' 只在勾选非空时带页 id；空选绝不改判成全部，直接不建任务，由表单禁用态兜底。
- 进度只反映导出器上报的事实（onProgress / 会话任务），本层不得自行猜测进度。
- 样式在 styles/card-export.css（icard-export- 前缀），新增选择器不得污染宿主 UI。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- reason: 视图方法组跨模块动态组合（同 card-preview），会话/任务/负载以 unknown 持有，运行时语义由 card_export_flow 与 B01/B04 契约约束 */

import { createObsidianModal } from '../apple-style-view-shared.js';
import { DEFAULT_CARD_EXPORT_ROOT, DEFAULT_CARD_EXPORT_SCALE } from './card-export-bridge.js';
import { formatExportReason } from './card-export-modal-view.js';

/** @type {CardExportMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardExportMethods = {
/** 当前笔记的卡片会话（与设置 / 预览共用会话注册表） */
getCardExportSession() {
  const selfRecord = /** @type {any} */ (this);
  const sourcePathKey = String(selfRecord.cardPreviewPendingInput?.sourcePathKey || '');
  if (!sourcePathKey) return null;
  return /** @type {import('../../services/card-session.js').CardNoteSessionLike} */ (
    /** @type {any} */ (this.getCardSessions()).getSession(sourcePathKey)
  );
}
,

/**
 * 打开或恢复导出弹窗（§B05 ⑤）：优先恢复运行中任务，其次待查看结果；
 * 都没有才展示可开始的新弹窗。禁止重复打开创建第二任务。
 * 外壳用 Obsidian 原生 Modal：焦点陷阱 / Escape / 遮罩 / 层叠 / 移动端全屏交给宿主。
 */
openCardExportModal() {
  const selfRecord = /** @type {any} */ (this);
  if (selfRecord.cardExportModal) {
    this.renderCardExportModal();
    return;
  }
  this.closeTransientPanels();

  const modal = /** @type {any} */ (createObsidianModal(this.app));
  modal.modalEl?.addClass?.('icard-export-modal');
  modal.titleEl?.setText?.('图片卡片导出');
  modal.contentEl?.addClass?.('icard-export-content');
  // 关闭按钮语义提示：关闭不是取消
  const closeButton = modal.modalEl?.querySelector?.('.modal-close-button');
  closeButton?.setAttribute?.('aria-label', '关闭（导出会在后台继续）');
  closeButton?.setAttribute?.('title', '关闭（导出会在后台继续）');

  selfRecord.cardExportScrollTop = 0;
  selfRecord.cardExportScrollBound = false;
  modal.onClose = () => {
    selfRecord.cardExportModal = null;
    const session = this.getCardExportSession();
    if (session && typeof session.closeExportModal === 'function') session.closeExportModal();
  };

  selfRecord.cardExportModal = modal;
  this.renderCardExportModal();
  modal.open();
}
,

/** 关闭弹窗：仅关展示层，任务继续（后台）；再次打开可恢复 */
closeCardExportModal() {
  const selfRecord = /** @type {any} */ (this);
  const modal = selfRecord.cardExportModal;
  if (!modal) return;
  if (typeof modal.close === 'function') modal.close();
  // 兜底：运行时 Modal 未回调 onClose 时也要断开引用，避免下次打开拿到死弹窗
  if (selfRecord.cardExportModal === modal) {
    selfRecord.cardExportModal = null;
    const session = this.getCardExportSession();
    if (session && typeof session.closeExportModal === 'function') session.closeExportModal();
  }
}
,

/** 打开弹窗后的会话状态：优先运行中任务，其次待查看结果，最后 none */
resolveCardExportView() {
  const session = this.getCardExportSession();
  if (session && typeof session.reopenExportView === 'function') {
    const view = session.reopenExportView();
    if (view && view.kind) return view;
  }
  return { kind: 'none' };
}
,

/**
 * 进度事件接收（B05 进度反馈）：写入视图态并重绘。
 * stage 为 "preparing" 表示图片资源准备阶段（下载并内联，首次可能数秒）；其余阶段任务已建立。
 * 弹窗关闭时只记录状态不重绘，重开时按最新任务态展示。
 * @param {any} event
 */
handleCardExportProgress(event) {
  const selfRecord = /** @type {any} */ (this);
  selfRecord.cardExportProgress = event || null;
  selfRecord.cardExportStage = event && event.stage === 'preparing' ? 'resources' : null;
  if (selfRecord.cardExportModal) this.renderCardExportModal();
}
,

/**
 * 开始导出（§B05 ②③）：组装入参 → 冻结快照 → 建任务 → 启动逐页输出。
 * 资格不满足时不建任务并提示。
 */
async startCardExport() {
  const selfRecord = /** @type {any} */ (this);
  const session = this.getCardExportSession();
  if (!session) return;
  if (typeof session.hasActiveJob === 'function' && session.hasActiveJob()) {
    this.renderCardExportModal();
    return;
  }
  // 导出范围：'all' 不带页 id；'selected' 用预览里的勾选集合（空选兜底：不建任务，表单本已禁用按钮）
  const scope = this.resolveCardExportScope();
  const pageIds = scope === 'selected' ? this.getCardPageSelection() : null;
  if (scope === 'selected' && !pageIds) {
    this.renderCardExportModal();
    return;
  }
  const collected = this.collectCardExportInput({
    rootPath: selfRecord.cardExportRootPath || DEFAULT_CARD_EXPORT_ROOT,
    scale: selfRecord.cardExportScale || DEFAULT_CARD_EXPORT_SCALE,
    pageIds,
  });
  if (!collected || collected.ok !== true) {
    this.renderCardExportModal();
    return;
  }
  // 冻结合格快照：导出期间编辑 / 换篇不影响本次批次
  const snapshot = session.freezeSnapshot({
    plan: selfRecord.cardPreviewOutcome?.plan,
    meta: { settings: collected.settings, sourcePath: collected.input.sourcePath },
  });

  // 上一批的图片资源回收（每批一份内联图片快照，避免跨批累积）
  if (selfRecord.cardExportController && typeof selfRecord.cardExportController.disposeResources === 'function') {
    selfRecord.cardExportController.disposeResources();
  }
  selfRecord.cardExportResourceSummary = null;
  selfRecord.cardExportPagesExpanded = false;
  selfRecord.cardExportScrollTop = 0;

  const controller = this.createCardExportController(session, {
    settings: collected.settings,
    markdown: collected.markdown,
    sourcePath: collected.input.sourcePath,
    scale: collected.input.scale,
    onProgress: (/** @type {any} */ event) => this.handleCardExportProgress(event),
  });
  selfRecord.cardExportController = controller;
  // 立即切到「准备中」并清掉上一批的进度：导出期间由进度事件驱动重绘，
  // 不再等到整批结束才刷新（否则用户看到的是「点了没动静」）。
  selfRecord.cardExportStage = 'preparing';
  selfRecord.cardExportProgress = null;
  this.renderCardExportModal();

  const outcome = await controller.exportCards({
    ...collected.input,
    snapshotId: snapshot.snapshotId,
    configDir: String(/** @type {any} */ (this.app)?.vault?.configDir || '.obsidian'),
  });
  const batchInfo = typeof controller.getBatchInfo === 'function' ? controller.getBatchInfo() : null;
  if (batchInfo) selfRecord.cardExportLastBatchInfo = batchInfo;
  const resourceSummary = typeof controller.getResourceSummary === 'function' ? controller.getResourceSummary() : null;
  selfRecord.cardExportResourceSummary = resourceSummary || null;
  selfRecord.cardExportStage = null;
  selfRecord.cardExportProgress = null;
  this.renderCardExportModal();
  if (outcome && outcome.ok === false) {
    notifyExportFailure(outcome.reason);
  }
}
,

/**
 * 结果页「再次导出」：标记本次结果已读 → 回到导出表单（保留上次的倍率与目录选择；
 * 导出范围回到「跟随预览勾选」，因为用户可能已改过勾选）。
 * 不删除已导出的批次目录，也不复用上一次的任务。
 */
startNewCardExport() {
  const selfRecord = /** @type {any} */ (this);
  const session = this.getCardExportSession();
  if (session && typeof session.markResultSeen === 'function') session.markResultSeen();
  selfRecord.cardExportStage = null;
  selfRecord.cardExportProgress = null;
  selfRecord.cardExportPagesExpanded = false;
  selfRecord.cardExportScrollTop = 0;
  selfRecord.cardExportScope = null;
  this.renderCardExportModal();
}
,

/** 显式取消（唯一停止任务的用户操作；关闭弹窗不取消） */
cancelCardExport() {
  const session = this.getCardExportSession();
  const job = session && typeof session.getActiveJob === 'function' ? session.getActiveJob() : null;
  if (session && job && typeof session.requestCancel === 'function') {
    session.requestCancel(job.jobId);
    this.renderCardExportModal();
  }
}
,

/** 同快照重试失败页（§6.2；成功页不重写） */
async retryCardExportFailedPages() {
  const selfRecord = /** @type {any} */ (this);
  const controller = selfRecord.cardExportController;
  if (!controller || typeof controller.retryFailedPages !== 'function') return;
  const result = await controller.retryFailedPages();
  const batchInfo = typeof controller.getBatchInfo === 'function' ? controller.getBatchInfo() : null;
  if (batchInfo) selfRecord.cardExportLastBatchInfo = batchInfo;
  this.renderCardExportModal();
  if (result && result.ok === false) notifyExportFailure(result.reason);
}
,

/** 清单单独重试（结果记录未完成时收尾） */
async retryCardExportManifest() {
  const selfRecord = /** @type {any} */ (this);
  const controller = selfRecord.cardExportController;
  if (!controller || typeof controller.retryManifest !== 'function') return;
  const result = await controller.retryManifest();
  this.renderCardExportModal();
  if (result && result.ok === false) notifyExportFailure(result.reason);
}
,

/** 视图关闭 / 卸载：关掉弹窗并回收本批图片资源（任务生命周期由 disposeCardPreview 的会话 dispose 负责） */
disposeCardExportModal() {
  const selfRecord = /** @type {any} */ (this);
  if (selfRecord.cardExportController && typeof selfRecord.cardExportController.disposeResources === 'function') {
    selfRecord.cardExportController.disposeResources();
  }
  selfRecord.cardExportController = null;
  selfRecord.cardExportResourceSummary = null;
  selfRecord.cardExportStage = null;
  selfRecord.cardExportProgress = null;
  selfRecord.cardExportPagesExpanded = false;
  selfRecord.cardExportScrollTop = 0;
  selfRecord.cardExportScope = null;
  const modal = selfRecord.cardExportModal;
  if (modal) {
    selfRecord.cardExportModal = null;
    if (typeof modal.close === 'function') modal.close();
  }
}
,
};

/** 导出失败提示（Notice；卡模式导出入口的失败反馈） */
function notifyExportFailure(reason) {
  import('obsidian').then(({ Notice }) => {
    /** @type {any} */ (Notice).call(null, `卡片导出未完成：${formatExportReason(reason)}`);
  }).catch(() => {});
}
