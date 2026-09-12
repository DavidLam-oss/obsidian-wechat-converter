/*
## 核心功能

图片卡片会话层（B01）：按笔记隔离的会话注册表 + 单笔记会话状态机。
管理内容/配置/主题/资源四元版本键、排版设置（B03）、预览任务状态、不可变冻结快照、
页选择与省略确认的版本绑定；导出任务生命周期委托 card-export-job.js（任务存活状态与弹窗显示状态分离）。

## 输入

- `createCardSessionRegistry()`：无参数；每个转换器视图一个注册表。
- `registry.getSession(sourcePath)`：按笔记路径取/建会话。
- `createNoteCardSession({ sourcePath })`：也可独立创建（测试用）。
- `createPreviewRunner(session, runLayout)`：编排预览异步任务（runLayout 为注入的排版函数）。

## 输出

- 注册表：`getSession/has/renameNote/removeNote/disposeAll/listSessions`。- 会话（createNoteCardSession 产出）：
  - 版本：`bumpContent/bumpConfig/bumpTheme/bumpResource`（任一 bump 使选择与省略确认失效）；
    `currentLayoutKey()` = `c{content}.k{config}.t{theme}.r{resource}`。
  - 排版设置（B03）：`getLayoutSettings/applyLayoutSettings/resetLayoutSettings`，归一化与
    变化检测委托 card-settings-model.js；值实际变化才 bumpConfig（选择/确认随之失效）。
  - 预览：`beginPreviewUpdate()` → token（{seq, layoutKey}）；`settlePreviewUpdate(token, outcome)`
    仅在 token 仍为最新且版本未变时生效（晚到结果丢弃）；`cancelPreviewUpdate()`；
    `getPreviewState()`（idle/updating/ready/failed + stale 旧预览暂留标记）。
  - 快照：`freezeSnapshot({ plan, resources, ... })` → 深拷贝冻结 + retain 资源，
    快照不受后续调用方原地修改污染；`retainSnapshot/releaseSnapshot/getSnapshot`；
    超过 MAX_RECENT_SNAPSHOTS 淘汰最旧并释放其资源。
  - 选择/省略确认：`setSelection` / `clearSelection` / `getValidSelection`（版本不符返回 null → 调用方默认恢复全部并提示）；
    `confirmOmissions/isOmissionConfirmed`（确认不能跨版本复用）。
  - 导出任务：`beginExportJob`（单会话同时只允许一个运行中任务，任务持有快照引用）；
    `shouldStartNextPage`（仅 running 为 true，取消后不再调度下一页）；
    `recordPageResult`（running/canceling 均接受——写入已启动后取消仍计入已保存，§6.2）；
    `requestCancel/lifecycleCancel/completeExport`；
    `closeExportModal`（只关展示层，不取消任务、不释放快照）；
    `reopenExportView`（恢复运行中任务或待查看结果，不新建重复任务）；`markResultSeen`；
    `dispose()`（视图关闭/卸载：生命周期取消 + 释放全部快照，之后不再接受新任务）。

## 定位

位于 services/，卡片功能的状态层；不导入 Obsidian/DOM，可在 node 下独立测试（B02 起 UI 绑定本层）。
2026-09 拆分：导出任务生命周期 → card-export-job.js（依赖注入，无反向依赖）。

## 依赖

无运行时依赖；structuredClone（Electron/Node 18+ 均可用）。
设置归一化/资格检查委托 card-settings-model.js（纯逻辑，无 DOM）；导出任务生命周期委托 card-export-job.js。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 任务/预览状态枚举变更须同步 project-types.js 的视图状态类型与规划 §5.4/§6.2。
- 会话为纯状态层：禁止在此引入 DOM、Obsidian app 或直接调用渲染/捕获引擎。
*/

import { createCardLayoutSettingsState } from './card-settings-model.js';
import { createExportJobState } from './card-export-job.js';

/** 快照缓存上限（§5.3：缓存只覆盖当前会话及有限近期版本） */
export const MAX_RECENT_SNAPSHOTS = 5;

/** @type {number} */
let idCounter = 0;

/**
 * @param {string} prefix
 * @returns {string}
 */
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 深拷贝并深冻结：快照与其内部对象此后不受调用方原地修改影响。
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneAndFreeze(value) {
  const cloned = structuredClone(value);
  deepFreeze(cloned);
  return cloned;
}

/**
 * @param {unknown} value
 * @returns {void}
 */
function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    Object.freeze(value);
    return;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(/** @type {object} */ (value))) {
      deepFreeze((/** @type {Record<string, unknown>} */ (value))[key]);
    }
    Object.freeze(value);
  }
}

/**
 * @typedef {{ content: number, config: number, theme: number, resource: number }} CardVersionSet
 */

/**
 * 四元版本键（§5.4：以笔记身份＋内容版本＋设置版本＋资源版本隔离任务，不能仅比较文件名）。
 * @param {CardVersionSet} versions
 * @returns {string}
 */
function toLayoutKey(versions) {
  return `c${versions.content}.k${versions.config}.t${versions.theme}.r${versions.resource}`;
}

/** @typedef {"idle"|"updating"|"ready"|"failed"} CardPreviewState */

/** 任务/快照等类型定义迁移至 card-export-job.js，会话侧经 import() 类型引用。 */

/**
 * 冻结快照（plan/meta 深冻结；resources 引用挂快照生命周期）。
 * @typedef {{
 *   snapshotId: string, noteId: string, sourcePath: string, versions: CardVersionSet,
 *   layoutKey: string, plan: unknown, resources: import('./card-export-job.js').CardReleasableLike | null,
 *   meta: Record<string, unknown>, createdAt: number
 * }} CardSnapshotLike
 */

/** 可释放资源（与 card-resources.js 的 CardResourceSnapshot retain/release 契约一致的最小接口） */
/**
 * @typedef {{ retain(): any, release(): void }} CardReleasableLike
 */

/**
 * @typedef {{
 *   noteId: string, disposed: boolean,
 *   currentLayoutKey(): string,
 *   bumpContent(): string, bumpConfig(): string, bumpTheme(): string, bumpResource(): string,
 *   getLayoutSettings(): import('./card-settings-model.js').CardLayoutSettings,
 *   applyLayoutSettings(partial: Partial<import('./card-settings-model.js').CardLayoutSettings> | Record<string, unknown>): { changed: boolean, settings: import('./card-settings-model.js').CardLayoutSettings, layoutKey?: string },
 *   resetLayoutSettings(): { changed: boolean, settings: import('./card-settings-model.js').CardLayoutSettings, layoutKey?: string },
 *   beginPreviewUpdate(): { seq: number, layoutKey: string } | null,
 *   settlePreviewUpdate(token: { seq: number, layoutKey: string } | null, outcome: Record<string, unknown>): { applied: boolean, reason?: string },
 *   cancelPreviewUpdate(): void,
 *   getPreviewState(): { state: CardPreviewState, layoutKey: string | null, stale: boolean, hasOmissions: boolean, hasResult: boolean },
 *   freezeSnapshot(input: { plan?: unknown, resources?: CardReleasableLike | null, meta?: Record<string, unknown> }): CardSnapshotLike,
 *   retainSnapshot(id: string): boolean, releaseSnapshot(id: string): void, getSnapshot(id: string): CardSnapshotLike | null,
 *   setSelection(pageIds: string[]): void,
 *   clearSelection(): void,
 *   getValidSelection(): { pageIds: string[], layoutKey: string } | null,
 *   confirmOmissions(diagnosticVersion: string): void,
 *   isOmissionConfirmed(diagnosticVersion: string): boolean,
 *   beginExportJob(input: { snapshotId: string, pageIds: string[], scale: number }): { ok: boolean, reason?: string, job?: import('./card-export-job.js').CardExportJobView },
 *   shouldStartNextPage(jobId: string): boolean,
 *   recordPageResult(jobId: string, pageId: string, result: Omit<import('./card-export-job.js').CardExportPageResult, "snapshotId">): { applied: boolean },
 *   requestCancel(jobId: string): { applied: boolean },
 *   lifecycleCancel(): void,
 *   completeExport(jobId: string, result: { status: "completed"|"partial"|"failed"|"canceled", summary?: string }): { applied: boolean },
 *   closeExportModal(): void,
 *   reopenExportView(): { kind: "job"|"result"|"none", job?: import('./card-export-job.js').CardExportJobView },
 *   markResultSeen(): void,
 *   hasActiveJob(): boolean,
 *   getActiveJob(): import('./card-export-job.js').CardExportJobView | null,
 *   getLastJob(): import('./card-export-job.js').CardExportJobView | null,
 *   getSourcePath(): string,
 *   renameSourcePath(path: string): void,
 *   dispose(): void
 * }} CardNoteSessionLike
 */

/**
 * 创建单笔记卡片会话（纯状态机，无 DOM/Obsidian 依赖）。
 * @param {{ sourcePath?: string }} [options]
 * @returns {CardNoteSessionLike}
 */
export function createNoteCardSession(options = {}) {
  let sourcePath = options.sourcePath || "";
  const noteId = nextId("note");

  /** @type {CardVersionSet} */
  const versions = { content: 1, config: 1, theme: 1, resource: 1 };
  let disposed = false;

  // —— 排版设置（B03）：值实际变化 → bumpConfig（选择/省略确认自动失效）——
  const layoutSettings = createCardLayoutSettingsState({ onChanged: () => bump("config") });

  // —— 预览状态 ——
  /** @type {CardPreviewState} */
  let previewState = "idle";
  let previewSeq = 0;
  let previewHasOmissions = false;
  let previewHasResult = false;
  /** @type {string | null} 结果产出时的 layoutKey（bump 后保留旧值供 UI 判断过期） */
  let previewResultKey = null;

  // —— 选择与省略确认（绑定 layoutKey，任一版本变化即失效）——
  /** @type {{ pageIds: string[], layoutKey: string } | null} */
  let selection = null;
  /** @type {{ diagnosticVersion: string, layoutKey: string } | null} */
  let omissionConfirm = null;

  // —— 快照缓存（插入序 = 创建序）——
  /** @type {Map<string, { data: CardSnapshotLike, resources: CardReleasableLike | null }>} */
  const snapshots = new Map();

  // —— 导出任务（生命周期状态机在 card-export-job.js；依赖注入，无反向依赖）——
  const jobState = createExportJobState({
    nextId,
    toLayoutKey: (/** @type {CardVersionSet} */ v) => toLayoutKey(v),
    cloneAndFreeze,
  });

  /** @returns {string} */
  function currentLayoutKey() {
    return toLayoutKey(versions);
  }

  /**
   * 任一版本 bump 后：选择与省略确认自动失效（§5.4 / B03「更新后自动失效」）。
   * @param {keyof CardVersionSet} key
   * @returns {string}
   */
  function bump(key) {
    if (disposed) return currentLayoutKey();
    versions[key] += 1;
    selection = null;
    omissionConfirm = null;
    return currentLayoutKey();
  }

  /**
   * 释放并移除快照；资源由最后一个持有者（本会话内即此处）释放。
   * @param {string} id
   * @returns {void}
   */
  function releaseSnapshotInternal(id) {
    const entry = snapshots.get(id);
    if (!entry) return;
    snapshots.delete(id);
    if (entry.resources && typeof entry.resources.release === "function") entry.resources.release();
  }

  return {
    noteId,
    get disposed() {
      return disposed;
    },

    /** @returns {string} */
    getSourcePath() {
      return sourcePath;
    },

    /**
     * 文件改名迁移会话身份（仅注册表 renameNote 调用）：noteId 与状态保持，路径更新。
     * @param {string} path
     */
    renameSourcePath(path) {
      if (!disposed && path) sourcePath = path;
    },

    /** @returns {string} */
    currentLayoutKey,

    bumpContent: () => bump("content"),
    bumpConfig: () => bump("config"),
    bumpTheme: () => bump("theme"),
    bumpResource: () => bump("resource"),

    // —— 排版设置（B03；归一化/变化检测在 card-settings-model.js）——

    /** @returns {import('./card-settings-model.js').CardLayoutSettings} */
    getLayoutSettings() {
      return layoutSettings.get();
    },

    /**
     * 应用排版设置：值实际变化才 bumpConfig（返回新 layoutKey）。
     * @param {Partial<import('./card-settings-model.js').CardLayoutSettings> | Record<string, unknown>} partial
     * @returns {{ changed: boolean, settings: import('./card-settings-model.js').CardLayoutSettings, layoutKey?: string }}
     */
    applyLayoutSettings(partial) {
      return layoutSettings.apply(partial);
    },

    /** 恢复当前默认设置（B03 为内置默认；C02 接全局默认后由其提供基准）。 */
    resetLayoutSettings() {
      return layoutSettings.reset();
    },

    // —— 预览 ——

    /**
     * 开始一次预览更新；返回 token 供异步回调核验身份（§5.4「每次异步返回再次核验版本」）。
     */
    beginPreviewUpdate() {
      if (disposed) return null;
      previewSeq += 1;
      previewState = "updating";
      return { seq: previewSeq, layoutKey: currentLayoutKey() };
    },

    /**
     * 预览结果落账：token 被更新请求取代、版本已变化或会话已销毁时丢弃（晚到结果不覆盖新视图）。
     * @param {{ seq: number, layoutKey: string } | null} token
     * @param {Record<string, unknown>} outcome { ok, omissions?, diagnostics?, ... }
     */
    settlePreviewUpdate(token, outcome) {
      if (!token) return { applied: false, reason: "no-token" };
      if (disposed) return { applied: false, reason: "disposed" };
      if (token.seq !== previewSeq) return { applied: false, reason: "superseded" };
      if (token.layoutKey !== currentLayoutKey()) return { applied: false, reason: "version-changed" };
      const ok = !!outcome && /** @type {{ok?: unknown}} */ (outcome).ok === true;
      previewHasOmissions = ok && outcome.omissions !== undefined && outcome.omissions !== null;
      previewHasResult = true;
      previewResultKey = token.layoutKey;
      previewState = ok ? "ready" : "failed";
      return { applied: true };
    },

    /** 取消在途预览（快速编辑/切篇）；回退旧结果状态或空态。 */
    cancelPreviewUpdate() {
      if (disposed) return;
      previewSeq += 1;
      previewState = previewHasResult ? "ready" : "idle";
    },

    /** @returns {{ state: CardPreviewState, layoutKey: string | null, stale: boolean, hasOmissions: boolean, hasResult: boolean }} */
    getPreviewState() {
      return {
        state: previewState,
        // 旧预览暂留时显示其产出版本；bump 后与新 layoutKey 不一致 → UI 据此提示「正在更新」
        layoutKey: previewHasResult ? previewResultKey : null,
        stale: previewState === "updating" && previewHasResult,
        hasOmissions: previewHasOmissions,
        hasResult: previewHasResult,
      };
    },

    // —— 快照 ——

    /**
     * 冻结一份不可变快照：plan/meta 深拷贝冻结，resources retain 并挂到快照生命周期。
     * 后续调用方对入参对象的原地修改不影响快照（完成标准）。
     * @param {{ plan?: unknown, resources?: CardReleasableLike | null, meta?: Record<string, unknown> }} input
     * @returns {CardSnapshotLike}
     */
    freezeSnapshot(input = {}) {
      if (disposed) throw new Error("会话已销毁，不能冻结快照");
      const resources = input.resources || null;
      if (resources && typeof resources.retain === "function") resources.retain();
      /** @type {CardSnapshotLike} */
      const snapshot = {
        snapshotId: nextId("snap"),
        noteId,
        sourcePath,
        versions: { ...versions },
        layoutKey: currentLayoutKey(),
        plan: input.plan === undefined ? null : cloneAndFreeze(input.plan),
        resources,
        meta: input.meta === undefined ? {} : cloneAndFreeze(input.meta),
        createdAt: Date.now(),
      };
      // 只冻结快照自身数据字段；resources 是外部不可变句柄（card-resources 已自冻结），
      // 不得递归进入（避免冻结调用方对象/句柄内部状态）
      deepFreeze(snapshot.versions);
      deepFreeze(snapshot.meta);
      if (snapshot.plan && typeof snapshot.plan === "object") deepFreeze(snapshot.plan);
      Object.freeze(snapshot);
      snapshots.set(snapshot.snapshotId, { data: snapshot, resources });
      // 淘汰最旧并释放其资源（§5.3：缓存只覆盖有限近期版本；Map 插入序 = 创建序）
      while (snapshots.size > MAX_RECENT_SNAPSHOTS) {
        /** @type {string | undefined} */
        let oldestKey;
        for (const key of snapshots.keys()) {
          oldestKey = key;
          break;
        }
        if (oldestKey) releaseSnapshotInternal(oldestKey);
      }
      return snapshot;
    },

    /**
     * 增加快照持有（供导出任务以外场景复用）。
     * @param {string} id
     * @returns {boolean}
     */
    retainSnapshot(id) {
      return snapshots.has(id);
    },

    /**
     * @param {string} id
     * @returns {void}
     */
    releaseSnapshot(id) {
      releaseSnapshotInternal(id);
    },

    /**
     * @param {string} id
     * @returns {CardSnapshotLike | null}
     */
    getSnapshot(id) {
      const entry = snapshots.get(id);
      return entry ? entry.data : null;
    },

    // —— 选择与省略确认 ——

    /** @param {string[]} pageIds */
    setSelection(pageIds) {
      if (disposed) return;
      selection = { pageIds: [...pageIds], layoutKey: currentLayoutKey() };
    },

    /**
     * 清空选择（回到「未选择 → 导出全部」语义）。
     * 与 `setSelection([])` 的区别：这里保持「非 null 选择必含 ≥1 页」的不变量，
     * 避免空数组被资格检查判成 empty-selection 而堵住「全部」导出。
     * @returns {void}
     */
    clearSelection() {
      if (disposed) return;
      selection = null;
    },

    /**
     * 版本不符返回 null：调用方应默认恢复全部并提示（§5.2「不能把旧页号对应到新的错误内容」）。
     * @returns {{ pageIds: string[], layoutKey: string } | null}
     */
    getValidSelection() {
      if (!selection || selection.layoutKey !== currentLayoutKey()) return null;
      return { pageIds: [...selection.pageIds], layoutKey: selection.layoutKey };
    },

    /**
     * 省略确认绑定当前版本与诊断版本；跨版本不得复用（完成标准）。
     * @param {string} diagnosticVersion
     */
    confirmOmissions(diagnosticVersion) {
      if (disposed) return;
      omissionConfirm = { diagnosticVersion, layoutKey: currentLayoutKey() };
    },

    /**
     * @param {string} diagnosticVersion
     * @returns {boolean}
     */
    isOmissionConfirmed(diagnosticVersion) {
      if (!omissionConfirm) return false;
      if (omissionConfirm.layoutKey !== currentLayoutKey()) return false;
      return omissionConfirm.diagnosticVersion === diagnosticVersion;
    },

    // —— 导出任务（生命周期状态机委托 card-export-job.js）——

    /**
     * 开始导出任务：单会话同时只允许一个运行/取消中任务（§5.4）；任务期间持有快照引用。
     * @param {{ snapshotId: string, pageIds: string[], scale: number }} input
     * @returns {{ ok: boolean, reason?: string, job?: import('./card-export-job.js').CardExportJobView }}
     */
    beginExportJob(input) {
      if (disposed) return { ok: false, reason: "disposed" };
      return jobState.beginExportJob(input, snapshots);
    },

    /**
     * 下一页调度许可：仅 running 为 true；canceling 后停止调度（已启动页不受影响）。
     * @param {string} jobId
     * @returns {boolean}
     */
    shouldStartNextPage(jobId) {
      return jobState.shouldStartNextPage(jobId);
    },

    /**
     * 记录单页结果：running/canceling 均接受（§6.2「写入已启动后取消仍计入已保存」）。
     * @param {string} jobId
     * @param {string} pageId
     * @param {Omit<import('./card-export-job.js').CardExportPageResult, "snapshotId">} result
     * @returns {{ applied: boolean }}
     */
    recordPageResult(jobId, pageId, result) {
      return jobState.recordPageResult(jobId, pageId, result);
    },

    /**
     * 请求取消：running → canceling；不中断已启动页。
     * @param {string} jobId
     * @returns {{ applied: boolean }}
     */
    requestCancel(jobId) {
      return jobState.requestCancel(jobId);
    },

    /** 视图关闭/插件卸载的生命周期取消（§6.2）：标记取消、收起展示层；结果仍可落账后收尾。 */
    lifecycleCancel() {
      jobState.lifecycleCancel();
    },

    /**
     * 任务收尾：final state 落账、释放快照引用、结果转入待查看（unseenResult）。
     * @param {string} jobId
     * @param {{ status: "completed"|"partial"|"failed"|"canceled", summary?: string }} result
     * @returns {{ applied: boolean }}
     */
    completeExport(jobId, result) {
      return jobState.completeExport(jobId, result);
    },

    /** 关闭导出弹窗：只关展示层，任务继续、快照不释放（§6.2）。 */
    closeExportModal() {
      jobState.closeExportModal();
    },

    /**
     * 再次打开导出入口：优先恢复运行中任务；有待查看结果先展示原结果，不直接开始新批次（§6.2）。
     * 会话已销毁（视图关闭）时一律无任务。
     * @returns {{ kind: "job"|"result"|"none", job?: import('./card-export-job.js').CardExportJobView }}
     */
    reopenExportView() {
      return jobState.reopenExportView(disposed);
    },

    /** 查看待查看结果后标记已读。 */
    markResultSeen() {
      jobState.markResultSeen();
    },

    /** @returns {boolean} */
    hasActiveJob() {
      return jobState.hasActiveJob();
    },

    /** @returns {import('./card-export-job.js').CardExportJobView | null} */
    getActiveJob() {
      return jobState.getActiveJob();
    },

    /** @returns {import('./card-export-job.js').CardExportJobView | null} */
    getLastJob() {
      return jobState.getLastJob();
    },

    /** 视图关闭/卸载：生命周期取消未完成任务（任务与结果随视图终止，不跨视图存活）+ 释放全部快照；此后本会话不再接受新工作。 */
    dispose() {
      if (disposed) return;
      jobState.lifecycleCancel();
      disposed = true;
      // 任务随视图终止：释放任务对快照的持有（任务本体不再可用，结果不承诺保留）
      jobState.releaseActiveJob();
      for (const id of [...snapshots.keys()]) releaseSnapshotInternal(id);
      previewHasResult = false;
      previewResultKey = null;
      previewHasOmissions = false;
      previewState = "idle";
      selection = null;
      omissionConfirm = null;
    },
  };
}

/**
 * 创建预览任务编排器：begin → runLayout（注入）→ settle；晚到/换版结果自动丢弃（§5.4）。
 * @param {CardNoteSessionLike} session
 * @param {(ctx: { layoutKey: string, isStale: () => boolean }) => Promise<Record<string, unknown>>} runLayout
 * @returns {{ schedule(): Promise<{ applied: boolean, reason?: string } | null>, cancel(): void }}
 */
export function createPreviewRunner(session, runLayout) {
  /** @type {{ seq: number, layoutKey: string } | null} */
  let current = null;
  return {
    async schedule() {
      const token = session.beginPreviewUpdate();
      if (!token) return null;
      current = token;
      try {
        const outcome = await runLayout({
          layoutKey: token.layoutKey,
          isStale: () => current !== token,
        });
        return session.settlePreviewUpdate(token, outcome);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return session.settlePreviewUpdate(token, { ok: false, error: message });
      }
    },
    cancel() {
      current = null;
      session.cancelPreviewUpdate();
    },
  };
}

/**
 * 按笔记隔离的会话注册表（每个转换器视图一个，§5.4）。
 * @typedef {{
 *   getSession(sourcePath: string): CardNoteSessionLike,
 *   has(sourcePath: string): boolean,
 *   renameNote(oldPath: string, newPath: string): boolean,
 *   removeNote(sourcePath: string): void,
 *   listSessions(): string[],
 *   disposeAll(): void
 * }} CardSessionRegistryLike
 */

/**
 * @returns {CardSessionRegistryLike}
 */
export function createCardSessionRegistry() {
  /** @type {Map<string, CardNoteSessionLike>} */
  const sessions = new Map();

  return {
    /**
     * @param {string} sourcePath
     * @returns {CardNoteSessionLike}
     */
    getSession(sourcePath) {
      let session = sessions.get(sourcePath);
      if (!session) {
        session = createNoteCardSession({ sourcePath });
        sessions.set(sourcePath, session);
      }
      return session;
    },

    /**
     * @param {string} sourcePath
     * @returns {boolean}
     */
    has(sourcePath) {
      return sessions.has(sourcePath);
    },

    /**
     * 文件改名迁移会话身份（§5.4）：noteId 与会话状态保持，路径键更新。
     * 目标路径已有会话时先销毁旧目标（视为覆盖）。
     * @param {string} oldPath
     * @param {string} newPath
     * @returns {boolean}
     */
    renameNote(oldPath, newPath) {
      const session = sessions.get(oldPath);
      if (!session || oldPath === newPath) return false;
      const existing = sessions.get(newPath);
      if (existing) {
        existing.dispose();
        sessions.delete(newPath);
      }
      sessions.delete(oldPath);
      session.renameSourcePath(newPath);
      sessions.set(newPath, session);
      return true;
    },

    /**
     * 删除文件 → 会话失效（dispose 后同路径再取会话会得到全新身份）。
     * @param {string} sourcePath
     * @returns {void}
     */
    removeNote(sourcePath) {
      const session = sessions.get(sourcePath);
      if (!session) return;
      session.dispose();
      sessions.delete(sourcePath);
    },

    /** @returns {string[]} */
    listSessions() {
      return [...sessions.keys()];
    },

    /** 视图卸载：全部会话生命周期取消并释放（§5.4「关闭视图/卸载插件时取消未完成工作」）。 */
    disposeAll() {
      for (const session of sessions.values()) session.dispose();
      sessions.clear();
    },
  };
}
