/*
## 核心功能

验证图片卡片导出弹窗与完整工作流（B05）：原生 Modal 外壳（打开/恢复/关闭语义统一汇入
onClose）、后台继续、重开复用原任务（不建第二任务）、显式取消 vs 关闭弹窗的区别、
清单失败恢复、失败页重试、视图释放清理、进度反馈（准备中 / 逐页渲染中的事件驱动重绘）、
完成态与失败态的视觉规则（状态区色调、明细折叠、失败着色）、结果定位（打开所在文件夹 /
失败降级为复制路径 / 无能力时不渲染入口）、导出范围（全部 / 选中 N 页：默认跟随预览勾选、
空选禁用不静默改成全部、子集导出按原始页序显示），以及导出接线层（fs 适配器 create-only
语义、不提供 remove、绝对路径解析、入参组装）。

## 输入

接收 mock 的 Obsidian 运行时、B01 会话、注入的导出控制器替身与受控 Promise。

## 输出

输出导出弹窗状态机与接线层契约的自动化断言。

## 定位

位于 tests/，保护 B05 弹窗编排与会话任务边界的回归。

## 依赖

关键依赖：Vitest、tests/helpers/input-module.cjs、tests/helpers/obsidian-dom.js。

## 维护规则

- 弹窗状态机、任务存活语义或接线契约变化时同步更新断言。
- 不在测试中运行真实捕获（createCardCaptureCallback 以替身验证参数）；捕获契约由 A06 套件覆盖。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');

/** 带预览负载就绪的视图（跳过真实排版） */
function readyView(AppleStyleView) {
  const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
  view.previewMode = 'card';
  view.containerEl = createObsidianLikeElement();
  view.previewContainer = createObsidianLikeElement();
  view.simpleHash = () => 'h1';
  view.cardPreviewPendingInput = { markdown: '# 标题\n\n正文', sourcePath: 'notes/a.md', sourcePathKey: 'notes/a.md' };
  view.cardPreviewOutcome = {
    ok: true,
    pages: [createObsidianLikeElement(), createObsidianLikeElement()],
    plan: { ok: true, pages: [{ index: 1, entries: [] }, { index: 2, entries: [] }], diagnostics: [] },
    cardDoc: { blocks: [] },
    resources: { hasBlockingFailures: false },
    diagnostics: [],
    omissionSummary: { total: 0 },
    pageCount: 2,
    sourcePath: 'notes/a.md',
  };
  return view;
}

/** 会话：冻结一份快照（模拟预览后的会话状态） */
function withSession(view, pageCount = 2) {
  const session = view.getCardSessions().getSession('notes/a.md');
  const snapshot = session.freezeSnapshot({
    plan: { pages: Array.from({ length: pageCount }, (_, i) => ({ index: i + 1, entries: [] })) },
  });
  return { session, snapshot };
}

describe('AppleStyleView - Card Export Modal (B05)', () => {
  let AppleStyleView;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    obsidianMock.requestUrl = vi.fn().mockResolvedValue({ json: {}, status: 200 });
    AppleStyleView = loadInputModule().AppleStyleView;
  });

  it('未知模式名不改变当前模式（保持 card 入口不被误切）', () => {
    const view = readyView(AppleStyleView);
    view.convertCurrent = vi.fn();
    view.switchPreviewMode('bogus');
    expect(view.previewMode).toBe('card');
    expect(view.convertCurrent).not.toHaveBeenCalled();
  });

  it('collectCardExportInput：无预览负载 → not-ready；有负载 → 全页范围与尺寸', () => {
    // 空视图：无会话/无负载 → not-ready
    const blank = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    blank.previewMode = 'card';
    expect(blank.collectCardExportInput({}).ok).toBe(false);

    const view = readyView(AppleStyleView);
    const collected = view.collectCardExportInput({ scale: 2 });
    expect(collected.ok).toBe(true);
    expect(collected.input.pages).toHaveLength(2);
    expect(collected.input.pages[0]).toEqual({ pageId: 'page-1', ordinal: 1 });
    expect(collected.input.pageSize.width).toBeGreaterThan(0);
    // 倍率白名单外的值回落默认
    const bad = view.collectCardExportInput({ scale: 7 });
    expect(bad.input.scale).toBe(2);
  });

  it('collectCardExportInput：页选择过滤非法页 id，仅保留合法子集', () => {
    const view = readyView(AppleStyleView);
    const collected = view.collectCardExportInput({ pageIds: ['page-2', 'page-9'] });
    expect(collected.ok).toBe(true);
    expect(collected.input.pages).toEqual([{ pageId: 'page-2', ordinal: 2 }]);
  });

  it('打开弹窗：用 Obsidian 原生 Modal，展示摘要、倍率、目录与省略摘要（未开始态）', () => {
    const view = readyView(AppleStyleView);
    view.openCardExportModal();
    const modal = view.cardExportModal;
    expect(modal).not.toBeNull();
    expect(modal.titleEl?.textContent).toBe('图片卡片导出');
    expect(modal.contentEl.querySelector('.icard-export-start')).not.toBeNull();
    expect(modal.contentEl.querySelector('.icard-export-segmented')).not.toBeNull();

    const rows = [...modal.contentEl.querySelectorAll('.icard-export-info-row')].map((row) => {
      const value = row.querySelector('.icard-export-info-value');
      return {
        label: row.querySelector('.icard-export-info-label')?.textContent,
        value: value?.textContent,
        title: value?.getAttribute('title'),
      };
    });
    // 来源只说笔记名；vault 相对路径只作悬停提示，不进正文
    expect(rows[0]).toEqual({ label: '来源', value: 'a', title: 'notes/a.md' });
    // 范围不在摘要里重复：由「导出范围」分段控件表达（全部 N 页 / 选中 N 页）
    expect(rows).toHaveLength(2);
    expect([...modal.contentEl.querySelectorAll('.icard-export-scope-btn')].map((btn) => btn.textContent))
      .toEqual(['全部 2 页', '选中 0 页']);
    // 尺寸说人话：不再堆「3:4 · 2x · 750 × 1000 px」这类术语
    expect(rows[1]).toEqual({ label: '尺寸', value: '每张 750 × 1000 像素', title: '每张 750 × 1000 像素' });
  });

  it('关闭弹窗仅关展示层：任务继续（closeExportModal 被调用，Modal 引用清空）', () => {
    const view = readyView(AppleStyleView);
    withSession(view);
    view.openCardExportModal();
    const session = view.getCardExportSession();
    const spy = vi.spyOn(session, 'closeExportModal');
    view.closeCardExportModal();
    expect(spy).toHaveBeenCalled();
    expect(view.cardExportModal).toBeNull();
  });

  it('关闭后重开：恢复原任务（不新建重复任务）', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1'], scale: 2 });
    expect(began.ok).toBe(true);

    view.openCardExportModal();
    view.closeCardExportModal();
    view.openCardExportModal();
    const view2 = view.resolveCardExportView();
    expect(view2.kind).toBe('job');
    expect(view2.job.jobId).toBe(began.job.jobId);
    // 会话仍只有一个任务（单任务语义）
    expect(session.hasActiveJob()).toBe(true);
  });

  it('Escape / 遮罩与关闭按钮同源：Obsidian Modal 的 close 一律汇入「后台继续」', () => {
    const view = readyView(AppleStyleView);
    withSession(view);
    view.openCardExportModal();
    const session = view.getCardExportSession();
    const spy = vi.spyOn(session, 'closeExportModal');
    // Obsidian 在 Escape / 点遮罩时直接调用 modal.close()，不经过我们的关闭按钮
    view.cardExportModal.close();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(view.cardExportModal).toBeNull();
  });

  it('cancelCardExport：仅对当前任务请求取消（关闭弹窗不取消）', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1'], scale: 2 });
    const spy = vi.spyOn(session, 'requestCancel');
    view.openCardExportModal();
    view.closeCardExportModal(); // 关闭不取消
    expect(spy).not.toHaveBeenCalled();
    view.cancelCardExport();
    expect(spy).toHaveBeenCalledWith(began.job.jobId);
  });

  it('渲染任务视图：进度、逐页状态与失败原因（脱敏）', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1', 'page-2'], scale: 2 });
    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 750, height: 1000 });
    session.recordPageResult(began.job.jobId, 'page-2', { status: 'failed', reason: 'capture-failed' });

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    const rows = overlay.querySelectorAll('.icard-export-page-row');
    expect(rows).toHaveLength(2);
    expect(overlay.querySelector('.icard-export-status')?.textContent).toContain('导出中');
    expect(overlay.querySelectorAll('.icard-export-page-reason')[0]?.textContent).toBe('捕获失败');
    expect(overlay.querySelector('.icard-export-cancel')).not.toBeNull();
  });

  it('部分完成：展示重试失败页与重试结果记录入口', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1', 'page-2'], scale: 2 });
    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 750, height: 1000 });
    session.recordPageResult(began.job.jobId, 'page-2', { status: 'failed', reason: 'write-failed' });
    session.completeExport(began.job.jobId, { status: 'partial', summary: '已保存 1 / 2 张' });

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    expect(overlay.querySelector('.icard-export-status')?.textContent).toContain('部分完成');
    expect(overlay.querySelector('.icard-export-status.is-warning')).not.toBeNull();
    expect(overlay.querySelector('.icard-export-retry')).not.toBeNull();
    expect(overlay.querySelector('.icard-export-retry-manifest')).not.toBeNull();
  });

  it('完成态视觉：状态区取成功色、逐页明细默认折叠、徽标为「全部成功」', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1', 'page-2'], scale: 2 });
    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 750, height: 1000 });
    session.recordPageResult(began.job.jobId, 'page-2', { status: 'saved', width: 750, height: 1000 });
    session.completeExport(began.job.jobId, { status: 'completed' });

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    expect(overlay.querySelector('.icard-export-status.is-success')).not.toBeNull();
    // 全部成功时不再铺成功色底，也不再重复张数（只在状态区说一次）
    expect(overlay.querySelector('.icard-export-progress')).toBeNull();
    const details = overlay.querySelector('.icard-export-pages-details');
    expect(details).not.toBeNull();
    expect(details.hasAttribute('open')).toBe(false);
    expect(overlay.querySelector('.icard-export-chip.is-success')?.textContent).toBe('全部成功');
    // 尺寸全一致 → 不逐行重复，只在摘要处说一次
    expect(overlay.querySelectorAll('.icard-export-page-size')).toHaveLength(0);
    expect(overlay.querySelector('.icard-export-pages-size-note')?.textContent).toBe('750 × 1000');
  });

  it('失败态视觉：逐页明细自动展开，失败行带语义色标记', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1', 'page-2'], scale: 2 });
    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 750, height: 1000 });
    session.recordPageResult(began.job.jobId, 'page-2', { status: 'failed', reason: 'capture-failed' });
    session.completeExport(began.job.jobId, { status: 'partial' });

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    expect(overlay.querySelector('.icard-export-pages-details').hasAttribute('open')).toBe(true);
    expect(overlay.querySelectorAll('.icard-export-page-row.is-failed')).toHaveLength(1);
    expect(overlay.querySelector('.icard-export-chip.is-error')?.textContent).toBe('1 张失败');
  });

  it('逐页明细：尺寸不一致时逐行显示尺寸，不在摘要处给统一尺寸', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1', 'page-2'], scale: 2 });
    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 750, height: 1000 });
    session.recordPageResult(began.job.jobId, 'page-2', { status: 'saved', width: 750, height: 1333 });
    session.completeExport(began.job.jobId, { status: 'completed' });

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    expect(overlay.querySelector('.icard-export-pages-size-note')).toBeNull();
    const sizes = [...overlay.querySelectorAll('.icard-export-page-size')].map((el) => el.textContent);
    expect(sizes).toEqual(['750 × 1000', '750 × 1333']);
  });

  it('逐页明细：有失败页时不重复报尺寸（逐行与摘要都不出现）', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1', 'page-2'], scale: 2 });
    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 750, height: 1000 });
    session.recordPageResult(began.job.jobId, 'page-2', { status: 'failed', reason: 'capture-failed' });
    session.completeExport(began.job.jobId, { status: 'partial' });

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    expect(overlay.querySelector('.icard-export-pages-size-note')).toBeNull();
    expect(overlay.querySelectorAll('.icard-export-page-size')).toHaveLength(0);
  });

  it('逐页明细：程序化展开（进行中）不被记成用户意图，完成后恢复折叠', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1', 'page-2'], scale: 2 });

    view.openCardExportModal();
    let details = view.cardExportModal.contentEl.querySelector('.icard-export-pages-details');
    // 进行中：自动展开
    expect(details.hasAttribute('open')).toBe(true);
    // 浏览器对程序化 open 会触发 toggle —— 模拟它，不应被固化成用户意图
    details.dispatchEvent(new window.Event('toggle'));

    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 750, height: 1000 });
    session.recordPageResult(began.job.jobId, 'page-2', { status: 'saved', width: 750, height: 1000 });
    session.completeExport(began.job.jobId, { status: 'completed' });

    view.renderCardExportModal();
    details = view.cardExportModal.contentEl.querySelector('.icard-export-pages-details');
    expect(details.hasAttribute('open')).toBe(false);
  });

  it('startCardExport：冻结快照建任务并调用控制器（入参含 snapshotId/configDir）', async () => {
    const view = readyView(AppleStyleView);
    view.app = { vault: { configDir: '.obsidian' } };
    const exportCards = vi.fn().mockResolvedValue({
      status: 'completed', manifestPending: false, batchDir: '卡片导出/n-1/b1',
      manifestPath: '卡片导出/n-1/b1/export-manifest.json',
      summary: { total: 2, saved: 2, failed: 0, canceled: 0, skipped: 0 }, results: [],
    });
    view.createCardExportController = vi.fn(() => ({
      exportCards,
      getBatchInfo: () => ({ batchDir: '卡片导出/n-1/b1', manifestPath: '卡片导出/n-1/b1/export-manifest.json', batchId: 'b1' }),
    }));

    await view.startCardExport();

    expect(view.createCardExportController).toHaveBeenCalledTimes(1);
    const call = exportCards.mock.calls[0][0];
    expect(call.snapshotId).toBeTruthy();
    expect(call.configDir).toBe('.obsidian');
    expect(call.pages).toHaveLength(2);
    expect(view.cardExportLastBatchInfo.batchDir).toBe('卡片导出/n-1/b1');
  });

  it('已有运行中任务时不重复建任务', async () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1'], scale: 2 });
    const createSpy = vi.fn();
    view.createCardExportController = createSpy;

    await view.startCardExport();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('disposeCardExportModal：关闭弹窗并回收本批图片资源（幂等）', () => {
    const view = readyView(AppleStyleView);
    withSession(view);
    const disposeResources = vi.fn();
    view.openCardExportModal();
    view.cardExportController = { disposeResources };
    expect(view.cardExportModal).not.toBeNull();
    view.disposeCardExportModal();
    expect(view.cardExportModal).toBeNull();
    expect(view.cardExportController).toBeNull();
    expect(disposeResources).toHaveBeenCalled();
    expect(() => view.disposeCardExportModal()).not.toThrow();
  });

  it('结果页提供「再次导出」：标记结果已读后回到表单（可换倍率再导一批）', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1'], scale: 1 });
    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 375, height: 500 });
    session.completeExport(began.job.jobId, { status: 'completed' });

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    expect(overlay.querySelector('.icard-export-status')?.textContent).toContain('导出完成');
    const again = overlay.querySelector('.icard-export-again');
    expect(again).not.toBeNull();

    // 已显式选过导出范围：再次导出应回到「跟随预览勾选」，不沿用上一批的范围
    view.cardExportScope = 'all';
    again.dispatchEvent(new window.Event('click'));

    // 回到表单：出现开始按钮与倍率选择，结果状态区消失
    expect(view.cardExportScope).toBeNull();
    expect(overlay.querySelector('.icard-export-start')).not.toBeNull();
    expect(overlay.querySelector('.icard-export-scale-btn')).not.toBeNull();
    expect(overlay.querySelector('.icard-export-status')).toBeNull();
    expect(view.resolveCardExportView().kind).toBe('none');

    // 关闭后重开仍是表单（结果已读不再挡路）→ 可二次导出
    view.closeCardExportModal();
    view.openCardExportModal();
    expect(view.cardExportModal.contentEl.querySelector('.icard-export-start')).not.toBeNull();
  });

  it('图片加载失败摘要出现在结果页（不静默少图）', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1'], scale: 2 });
    session.recordPageResult(began.job.jobId, 'page-1', { status: 'saved', width: 750, height: 1000 });
    session.completeExport(began.job.jobId, { status: 'completed' });
    view.cardExportResourceSummary = { ready: 1, failed: 2, hasBlockingFailures: true, failures: [] };

    view.openCardExportModal();
    const warn = view.cardExportModal.contentEl.querySelector('.icard-export-omission.is-warning');
    expect(warn).not.toBeNull();
    expect(warn?.textContent).toContain('2 张图片未能加载');
  });

  it('startCardExport：开始新一批前释放上一批图片资源并记录本批摘要', async () => {
    const view = readyView(AppleStyleView);
    view.app = { vault: { configDir: '.obsidian' } };
    const disposeResources = vi.fn();
    view.cardExportController = { disposeResources };
    view.createCardExportController = vi.fn(() => ({
      exportCards: vi.fn().mockResolvedValue({
        status: 'completed', manifestPending: false,
        summary: { total: 2, saved: 2, failed: 0, canceled: 0, skipped: 0 }, results: [],
      }),
      getBatchInfo: () => ({ batchDir: 'out/b1', manifestPath: 'out/b1/export-manifest.json', batchId: 'b1' }),
      getResourceSummary: () => ({ ready: 2, failed: 0, hasBlockingFailures: false, failures: [] }),
      disposeResources: vi.fn(),
    }));

    await view.startCardExport();

    expect(disposeResources).toHaveBeenCalled();
    expect(view.cardExportResourceSummary).toEqual({ ready: 2, failed: 0, hasBlockingFailures: false, failures: [] });
  });

  it('进度事件驱动弹窗：准备中视图 → 逐页渲染中（不再整批完成后才反馈）', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    view.openCardExportModal();
    view.cardExportStage = 'preparing';
    view.renderCardExportModal();

    // 任务尚未建立：显示准备中，且不显示可点击的开始按钮（避免误触重复导出）
    const preparing = view.cardExportModal.contentEl;
    expect(preparing.querySelector('.icard-export-status.is-accent')).not.toBeNull();
    expect(preparing.querySelector('.icard-export-status-title')?.textContent).toBe('正在准备导出');
    expect(preparing.querySelector('.icard-export-start')).toBeNull();

    // 图片资源准备信号：文案切换为内联说明
    view.handleCardExportProgress({ stage: 'preparing', total: 0, settled: 0, saved: 0, failed: 0 });
    expect(view.cardExportModal.contentEl.querySelector('.icard-export-status-desc')?.textContent).toContain('内联');

    // 任务建立后的逐页进度：显示 spinner、当前页与进度条
    session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1', 'page-2'], scale: 2 });
    view.handleCardExportProgress({ stage: 'page', total: 2, settled: 1, saved: 1, failed: 0, current: 2 });

    const overlay = view.cardExportModal.contentEl;
    expect(overlay.querySelector('.icard-export-status-title')?.textContent).toBe('导出中');
    expect(overlay.querySelector('.icard-export-spinner')).not.toBeNull();
    expect(overlay.querySelector('.icard-export-status-desc')?.textContent).toContain('正在渲染第 2 页');
    expect(overlay.querySelector('.icard-export-progress-track')).not.toBeNull();
    expect(overlay.querySelector('.icard-export-progress-label')?.textContent).toBe('0%');
    expect(overlay.querySelectorAll('.icard-export-page-row.is-rendering')).toHaveLength(1);
    expect(overlay.querySelector('.icard-export-page-row.is-rendering .icard-export-page-state')?.textContent).toBe('渲染中…');
    expect(overlay.querySelector('.icard-export-cancel')).not.toBeNull();
    // 进行中页脚左侧解释「关闭 ≠ 取消」，避免用户不敢关窗
    expect(overlay.querySelector('.icard-export-footer-hint')?.textContent).toBe('关闭窗口不会中断导出');
    expect(view.cardExportStage).toBeNull();
  });

  it('startCardExport：导出期间显示准备中，结束后清空进度态', async () => {
    const view = readyView(AppleStyleView);
    view.app = { vault: { configDir: '.obsidian' } };
    withSession(view);
    view.openCardExportModal();
    /** @type {((value: unknown) => void) | null} */
    let resolveExport = null;
    const pending = new Promise((resolve) => { resolveExport = resolve; });
    view.createCardExportController = vi.fn(() => ({
      exportCards: vi.fn().mockReturnValue(pending),
      getBatchInfo: () => null,
    }));

    const run = view.startCardExport();
    // 挂起期间即为准备中（此前会原地重绘成表单，看起来像「点了没反应」）
    expect(view.cardExportModal.contentEl.querySelector('.icard-export-status.is-accent')).not.toBeNull();
    expect(view.cardExportModal.contentEl.querySelector('.icard-export-start')).toBeNull();

    resolveExport({
      status: 'completed', manifestPending: false,
      summary: { total: 2, saved: 2, failed: 0, canceled: 0, skipped: 0 }, results: [],
    });
    await run;
    expect(view.cardExportStage).toBeNull();
    expect(view.cardExportProgress).toBeNull();
  });

  it('结果页主操作是「打开所在文件夹」：成功时调用系统文件管理器并给出提示', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1'], scale: 2 });
    session.completeExport(began.job.jobId, { status: 'completed' });
    const dir = '卡片导出/我的笔记/2026-09-12 16-04-33';
    view.cardExportLastBatchInfo = { batchDir: dir };
    view.resolveCardExportAbsPath = vi.fn(() => '/Volumes/vault/' + dir);
    view.canRevealCardExportOutput = vi.fn(() => true);
    view.revealCardExportOutput = vi.fn(() => ({ ok: true, absPath: '/Volumes/vault/' + dir }));

    view.openCardExportModal();
    const content = view.cardExportModal.contentEl;
    const open = content.querySelector('.icard-export-result-open');
    expect(open).not.toBeNull();
    expect(open.textContent).toContain('打开所在文件夹');
    // 路径展示的是 vault 相对路径，title 给出绝对路径
    const pathEl = content.querySelector('.icard-export-result-path');
    expect(pathEl.getAttribute('title')).toBe('/Volumes/vault/' + dir);
    expect(pathEl.textContent).toBe(dir);
    // 每个目录分隔符后有一个 <wbr> 换行机会（不产生文本，textContent 不受影响）
    expect(pathEl.querySelectorAll('wbr').length).toBe(dir.split('/').length - 1);
    // 路径独占整行（不在表头行内），才能拿到完整宽度、过长时换行而不是被截断
    expect(content.querySelector('.icard-export-result-head .icard-export-result-path')).toBeNull();
    // 有「打开」能力时不再渲染复制按钮（打开失败会自动降级为复制路径，两个入口做同一件事只增噪音）
    expect(content.querySelector('.icard-export-result-copy')).toBeNull();

    open.dispatchEvent(new window.Event('click'));
    expect(view.revealCardExportOutput).toHaveBeenCalledWith(dir);
    expect(content.querySelector('.icard-export-result-hint').textContent).toBe('已在文件管理器中打开');
  });

  it('打开文件夹失败不谎报成功：退回复制完整路径并说明原因', async () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1'], scale: 2 });
    session.completeExport(began.job.jobId, { status: 'completed' });
    const dir = '卡片导出/我的笔记/2026-09-12 16-04-33';
    const abs = '/Volumes/vault/' + dir;
    view.cardExportLastBatchInfo = { batchDir: dir };
    view.resolveCardExportAbsPath = vi.fn(() => abs);
    view.canRevealCardExportOutput = vi.fn(() => true);
    view.revealCardExportOutput = vi.fn(() => ({ ok: false, absPath: abs, reason: 'reveal-failed' }));

    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(global.navigator, 'clipboard', { configurable: true, value: { writeText } });

    view.openCardExportModal();
    const content = view.cardExportModal.contentEl;
    content.querySelector('.icard-export-result-open').dispatchEvent(new window.Event('click'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeText).toHaveBeenCalledWith(abs);
    expect(content.querySelector('.icard-export-result-hint').textContent).toBe('无法打开文件夹，已复制路径');
  });

  it('无文件管理器能力时不渲染打开按钮：只保留复制，路径仍完整展示', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-1'], scale: 2 });
    session.completeExport(began.job.jobId, { status: 'completed' });
    const dir = '卡片导出/我的笔记/2026-09-12 16-04-33';
    view.cardExportLastBatchInfo = { batchDir: dir };
    view.canRevealCardExportOutput = vi.fn(() => false);

    view.openCardExportModal();
    const content = view.cardExportModal.contentEl;
    expect(content.querySelector('.icard-export-result-open')).toBeNull();
    expect(content.querySelector('.icard-export-result-copy')).not.toBeNull();
    expect(content.querySelector('.icard-export-result-path').textContent).toBe(dir);
  });
});

describe('Card export bridge - fs adapter (B05/§6.1)', () => {
  let AppleStyleView;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    obsidianMock.requestUrl = vi.fn().mockResolvedValue({ json: {}, status: 200 });
    AppleStyleView = loadInputModule().AppleStyleView;
  });

  /** vault adapter 替身 */
  function fakeAdapter(initial = {}) {
    const files = new Map(Object.entries(initial));
    return {
      files,
      exists: vi.fn(async (p) => files.has(p)),
      mkdir: vi.fn(async (p) => { files.set(p, { dir: true }); }),
      writeBinary: vi.fn(async (p, bytes) => { files.set(p, { bytes }); }),
      read: vi.fn(async (p) => {
        const f = files.get(p);
        if (!f) throw new Error(`missing: ${p}`);
        return new TextDecoder().decode(f.bytes);
      }),
      remove: vi.fn(async (p) => { files.delete(p); }),
      getFullPath: (p) => `/vault/${p}`,
    };
  }

  it('createBinaryExclusive：目标已存在 → conflict（不覆盖）', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    const adapter = fakeAdapter({ 'out/card-001.png': { bytes: new Uint8Array([1]) } });
    view.app = { vault: { adapter } };
    const fsAdapter = view.buildCardExportFsAdapter();
    const result = await fsAdapter.createBinaryExclusive('out/card-001.png', new Uint8Array([9]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('conflict');
    expect(adapter.writeBinary).not.toHaveBeenCalled();
  });

  it('createBinaryExclusive：目标不存在 → 写入成功', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    const adapter = fakeAdapter();
    view.app = { vault: { adapter } };
    const fsAdapter = view.buildCardExportFsAdapter();
    const result = await fsAdapter.createBinaryExclusive('out/card-001.png', new Uint8Array([1, 2]));
    expect(result.ok).toBe(true);
    expect(adapter.writeBinary).toHaveBeenCalledWith('out/card-001.png', new Uint8Array([1, 2]));
  });

  it('realpath：根路径解析为绝对路径；不存在路径 → null（交由排他创建兜底）', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    const adapter = fakeAdapter({ 'out': { dir: true } });
    view.app = { vault: { adapter } };
    const fsAdapter = view.buildCardExportFsAdapter();
    expect(await fsAdapter.realpath('')).toBe('/vault');
    expect(await fsAdapter.realpath('out')).toBe('/vault/out');
    expect(await fsAdapter.realpath('out/missing/x.png')).toBe('/vault/out');
  });

  it('无 vault 能力：所有操作拒绝（不静默产出）', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.app = {};
    const fsAdapter = view.buildCardExportFsAdapter();
    await expect(fsAdapter.exists('x')).rejects.toThrow();
  });

  it('适配器不提供 remove：导出流程不得删除 vault 内任何文件（含临时文件）', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.app = { vault: { adapter: fakeAdapter() } };
    const fsAdapter = view.buildCardExportFsAdapter();
    expect(fsAdapter.remove).toBeUndefined();
  });

  it('prepareCardExportResources：契约形状（ensure / summary / release 幂等）', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    const resources = view.prepareCardExportResources({ markdown: '', sourcePath: 'notes/a.md' });
    expect(typeof resources.ensure).toBe('function');
    expect(typeof resources.summary).toBe('function');
    expect(typeof resources.release).toBe('function');
    // 未准备 → 无摘要；释放幂等（可重复调用）
    expect(resources.summary()).toBeNull();
    expect(() => resources.release()).not.toThrow();
    expect(() => resources.release()).not.toThrow();
  });

  it('resolveCardExportAbsPath：优先 getFullPath；退化 getBasePath；都不可用 → null', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    const rel = '卡片导出/我的笔记/2026-09-12 16-04-33';

    view.app = { vault: { adapter: fakeAdapter() } };
    expect(view.resolveCardExportAbsPath(rel)).toBe(`/vault/${rel}`);

    // 只有 getBasePath：自行拼接并去掉尾部分隔符
    view.app = { vault: { adapter: { getBasePath: () => '/Users/me/Vault/' } } };
    expect(view.resolveCardExportAbsPath('卡片导出/a')).toBe('/Users/me/Vault/卡片导出/a');

    // 两者都没有 / 空路径 → null（调用方据此隐藏「打开所在文件夹」）
    view.app = { vault: { adapter: {} } };
    expect(view.resolveCardExportAbsPath(rel)).toBeNull();
    expect(view.resolveCardExportAbsPath('')).toBeNull();
  });

  it('canRevealCardExportOutput：无 electron shell（移动端 / 测试环境）→ false', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.app = { vault: { adapter: fakeAdapter() } };
    expect(view.canRevealCardExportOutput()).toBe(false);
  });

  it('revealCardExportOutput：解析不出绝对路径 → ok:false 且 absPath 为 null（不谎报）', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.app = { vault: { adapter: {} } };
    expect(view.revealCardExportOutput('卡片导出/a')).toEqual({
      ok: false, absPath: null, reason: 'path-unresolved',
    });
  });

  it('revealCardExportOutput：有绝对路径但 shell 不可用 → ok:false 且回传 absPath 供降级复制', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.app = { vault: { adapter: fakeAdapter() } };
    const outcome = view.revealCardExportOutput('卡片导出/a');
    expect(outcome.ok).toBe(false);
    expect(outcome.absPath).toBe('/vault/卡片导出/a');
    expect(outcome.reason).toBe('reveal-unavailable');
  });
});

describe('AppleStyleView - Card Export Scope (B05 全部 / 选中)', () => {
  let AppleStyleView;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    obsidianMock.requestUrl = vi.fn().mockResolvedValue({ json: {}, status: 200 });
    AppleStyleView = loadInputModule().AppleStyleView;
  });

  /** 可观测的导出控制器替身（记录 exportCards 入参） */
  function stubController(view, payload) {
    const exportCards = vi.fn().mockResolvedValue({
      status: 'completed', manifestPending: false,
      summary: { total: 1, saved: 1, failed: 0, canceled: 0, skipped: 0 }, results: [],
    });
    view.createCardExportController = vi.fn(() => ({ exportCards, getBatchInfo: () => payload || null }));
    return exportCards;
  }

  it('范围控件默认跟随预览勾选：未勾选时「选中」禁用并说明', () => {
    const view = readyView(AppleStyleView);
    view.openCardExportModal();
    let overlay = view.cardExportModal.contentEl;

    let btns = [...overlay.querySelectorAll('.icard-export-scope-btn')];
    expect(btns.map((b) => b.textContent)).toEqual(['全部 2 页', '选中 0 页']);
    expect(btns[0].classList.contains('is-active')).toBe(true);
    expect(btns[1].classList.contains('is-disabled')).toBe(true);
    expect(overlay.querySelector('.icard-export-field-hint.is-scope')?.textContent)
      .toBe('在卡片预览里勾选页面后，可只导出勾选的页');

    // 勾选 1 页后重开：默认切到「选中 1 页」且可选
    view.applyCardPageSelection(['page-2']);
    view.renderCardExportModal();
    overlay = view.cardExportModal.contentEl;
    btns = [...overlay.querySelectorAll('.icard-export-scope-btn')];
    expect(btns.map((b) => b.textContent)).toEqual(['全部 2 页', '选中 1 页']);
    expect(btns[1].classList.contains('is-active')).toBe(true);
    expect(btns[1].classList.contains('is-disabled')).toBe(false);
    expect(overlay.querySelector('.icard-export-start').hasAttribute('disabled')).toBe(false);
    expect(overlay.querySelector('.icard-export-field-hint.is-scope')).toBeNull();
  });

  it('范围可显式切换回「全部」：切回后不导出选中子集', async () => {
    const view = readyView(AppleStyleView);
    view.app = { vault: { configDir: '.obsidian' } };
    const exportCards = stubController(view);
    view.applyCardPageSelection(['page-2']);
    view.openCardExportModal();

    const overlay = view.cardExportModal.contentEl;
    const allBtn = [...overlay.querySelectorAll('.icard-export-scope-btn')][0];
    allBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(view.cardExportScope).toBe('all');

    await view.startCardExport();
    expect(exportCards.mock.calls[0][0].pages).toHaveLength(2);
  });

  it('startCardExport：范围「选中」只导出勾选的页（原始页序）', async () => {
    const view = readyView(AppleStyleView);
    view.app = { vault: { configDir: '.obsidian' } };
    const exportCards = stubController(view);
    view.applyCardPageSelection(['page-2']);

    await view.startCardExport();
    expect(exportCards.mock.calls[0][0].pages).toEqual([{ pageId: 'page-2', ordinal: 2 }]);
  });

  it('范围「选中」但一页未勾：开始按钮禁用、不建任务（不静默改成全部）', async () => {
    const view = readyView(AppleStyleView);
    view.app = { vault: { configDir: '.obsidian' } };
    const exportCards = stubController(view);
    // 用户显式选了「选中」，随后勾选随排版更新失效
    view.cardExportScope = 'selected';

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    expect(overlay.querySelector('.icard-export-start').hasAttribute('disabled')).toBe(true);
    expect(overlay.querySelector('.icard-export-scope-btn.is-active.is-disabled')).not.toBeNull();
    expect(overlay.querySelector('.icard-export-field-hint.is-scope')?.textContent)
      .toContain('已随排版更新失效');

    await view.startCardExport();
    expect(view.createCardExportController).not.toHaveBeenCalled();
    expect(exportCards).not.toHaveBeenCalled();
  });

  it('子集导出：逐页明细用原始页序，进行中页与进度事件按页序对齐', () => {
    const view = readyView(AppleStyleView);
    const { session, snapshot } = withSession(view, 4);
    const began = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ['page-3', 'page-4'], scale: 2 });
    session.recordPageResult(began.job.jobId, 'page-3', { status: 'saved', width: 750, height: 1000 });

    view.openCardExportModal();
    const overlay = view.cardExportModal.contentEl;
    expect([...overlay.querySelectorAll('.icard-export-page-name')].map((el) => el.textContent))
      .toEqual(['第 3 页', '第 4 页']);

    // 进度事件的 current 是原始页序（page-4 → 4），据此高亮正在渲染的那一行
    view.handleCardExportProgress({ stage: 'page', total: 2, settled: 1, saved: 1, failed: 0, current: 4 });
    const rendering = overlay.querySelectorAll('.icard-export-page-row.is-rendering');
    expect(rendering).toHaveLength(1);
    expect(rendering[0].querySelector('.icard-export-page-name')?.textContent).toBe('第 4 页');
  });
});
