/*
## 核心功能

验证 AppleStyleView 卡片模式（第三模式）的接入行为：模式矩阵、操作按钮显隐、
预览状态（空/失败/就绪/移动端）、B01 会话绑定、版本安全源定位、缩放与编辑合并。

## 输入

接收 mock 的 Obsidian 运行时、注入的排版管线替身与受控 Promise。

## 输出

输出三模式矩阵与卡片预览状态的自动化断言。

## 定位

位于 tests/，保护卡片模式的视图入口、状态隔离与回归边界。

## 依赖

关键依赖：Vitest、tests/helpers/input-module.cjs、tests/helpers/obsidian-dom.js。

## 维护规则

- 模式入口、显隐矩阵或渲染分支变化时同步更新断言。
- 不在测试中运行真实排版管线（runCardLayoutPipeline 注入替身）；管线契约由 A05/A06 套件覆盖。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');

/** 构造带 classList 的操作按钮替身集合 */
function attachActionButtons(view) {
  const make = () => {
    const el = createObsidianLikeElement();
    el.classList.add('hidden'); // 先置为 hidden，断言 toggle 行为
    el.classList.remove('hidden');
    return el;
  };
  view.aiLayoutBtn = make();
  view.copyBtn = make();
  view.settingsBtn = make();
  view.cardExportBtn = make();
  view.publishBtn = make();
}

describe('AppleStyleView - Card Mode (B02)', () => {
  let AppleStyleView;
  let obsidianMock;

  beforeEach(() => {
    vi.resetModules();
    obsidianMock = require('obsidian');
    obsidianMock.requestUrl = vi.fn().mockResolvedValue({ json: {}, status: 200 });

    const inputModule = loadInputModule();
    AppleStyleView = inputModule.AppleStyleView;
  });

  it('默认仍是 article 模式', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    expect(view.previewMode).toBe('article');
  });

  it('切换到 card：renderCardPreview 被调用；切回 article 恢复 convertCurrent', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.convertCurrent = vi.fn();
    view.renderStickerPreview = vi.fn();
    view.renderCardPreview = vi.fn();
    view.closeTransientPanels = vi.fn();

    view.switchPreviewMode('card');
    expect(view.previewMode).toBe('card');
    expect(view.renderCardPreview).toHaveBeenCalled();

    view.switchPreviewMode('sticker');
    expect(view.previewMode).toBe('sticker');
    expect(view.renderStickerPreview).toHaveBeenCalled();

    view.switchPreviewMode('article');
    expect(view.previewMode).toBe('article');
    expect(view.convertCurrent).toHaveBeenCalled();
  });

  it('未知模式名不改变当前模式', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.convertCurrent = vi.fn();
    view.switchPreviewMode('bogus');
    expect(view.previewMode).toBe('article');
    expect(view.convertCurrent).not.toHaveBeenCalled();
  });

  it('三模式操作按钮显隐矩阵（集中控制）', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    attachActionButtons(view);
    view.updateAiToolbarState = vi.fn();

    view.previewMode = 'article';
    view.applyModeActionVisibility();
    expect(view.aiLayoutBtn.classList.contains('hidden')).toBe(false);
    expect(view.copyBtn.classList.contains('hidden')).toBe(false);
    expect(view.settingsBtn.classList.contains('hidden')).toBe(false);
    expect(view.cardExportBtn.classList.contains('hidden')).toBe(true);
    expect(view.publishBtn.classList.contains('hidden')).toBe(false);

    view.previewMode = 'sticker';
    view.applyModeActionVisibility();
    expect(view.aiLayoutBtn.classList.contains('hidden')).toBe(true);
    expect(view.copyBtn.classList.contains('hidden')).toBe(true);
    expect(view.settingsBtn.classList.contains('hidden')).toBe(false);
    expect(view.cardExportBtn.classList.contains('hidden')).toBe(true);
    expect(view.publishBtn.classList.contains('hidden')).toBe(false);

    view.previewMode = 'card';
    view.applyModeActionVisibility();
    expect(view.aiLayoutBtn.classList.contains('hidden')).toBe(true);
    expect(view.copyBtn.classList.contains('hidden')).toBe(true);
    // 卡片设置 B03 接入前隐藏文章设置入口
    expect(view.settingsBtn.classList.contains('hidden')).toBe(true);
    expect(view.cardExportBtn.classList.contains('hidden')).toBe(false);
    expect(view.publishBtn.classList.contains('hidden')).toBe(true);
  });

  it('updateAiToolbarState 在 card 模式隐藏 AI 入口', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.aiLayoutBtn = createObsidianLikeElement();
    view.previewMode = 'card';
    view.updateAiToolbarState();
    expect(view.aiLayoutBtn.classList.contains('hidden')).toBe(true);
  });

  it('移动端：卡片模式只显示桌面端说明，不进入排版管线', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.app = { isMobile: true, vault: {} };
    view.previewMode = 'card';
    view.previewContainer = createObsidianLikeElement();
    view.runCardLayoutPipeline = vi.fn();

    await view.renderCardPreview();

    expect(view.runCardLayoutPipeline).not.toHaveBeenCalled();
    expect(view.previewContainer.querySelector('.icard-preview-empty-title')?.textContent)
      .toBe('图片卡片目前仅支持桌面端');
  });

  it('无文档/空正文：显示空态', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.previewMode = 'card';
    view.previewContainer = createObsidianLikeElement();
    view.resolveCardMarkdownSource = vi.fn().mockResolvedValue({ ok: false });

    await view.renderCardPreview();
    expect(view.previewContainer.querySelector('.icard-preview-empty-title')?.textContent)
      .toBe('暂无可排版的卡片内容');
  });

  it('就绪态：摘要、省略 chip、缩略页与缩放（管线替身）', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.previewMode = 'card';
    view.previewContainer = createObsidianLikeElement();
    view.simpleHash = () => 'h1';
    view.resolveCardMarkdownSource = vi.fn().mockResolvedValue({
      ok: true, markdown: '# 标题\n\n正文', sourcePath: 'notes/a.md',
    });
    const pageEl = createObsidianLikeElement();
    view.runCardLayoutPipeline = vi.fn(async (ctx) => ({
      ok: true,
      stale: false,
      pages: [pageEl],
      plan: { ok: true, pages: [{ index: 1, entries: [{ blockId: 'b1' }] }], diagnostics: [] },
      cardDoc: { blocks: [{ id: 'b1', sourceStart: 3 }] },
      resources: { hasBlockingFailures: false },
      diagnostics: [],
      omissionSummary: { total: 1, codeBlock: 1 },
      pageCount: 1,
      layoutKey: ctx.layoutKey,
      sourcePath: 'notes/a.md',
    }));

    await view.renderCardPreview();

    expect(view.runCardLayoutPipeline).toHaveBeenCalledTimes(1);
    const shell = view.previewContainer.querySelector('.icard-preview-shell');
    expect(shell).not.toBeNull();
    expect(view.previewContainer.querySelector('.icard-preview-summary-count')?.textContent).toBe('共 1 页');
    expect(view.previewContainer.querySelector('.icard-preview-chip')?.textContent).toBe('1 处内容未进入卡片');
    const item = view.previewContainer.querySelector('.icard-preview-page-item');
    expect(item).not.toBeNull();
    // 缩放只改展示（默认 0.6；逻辑宽 375，750 是 2× 输出像素）
    expect(view.getCardPreviewZoom()).toBeCloseTo(0.6);
    expect(item.style.width).toBe(`${Math.round(375 * 0.6)}px`);
  });

  it('排版失败：落账为失败态并展示诊断信息', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.previewMode = 'card';
    view.previewContainer = createObsidianLikeElement();
    view.simpleHash = () => 'h1';
    view.resolveCardMarkdownSource = vi.fn().mockResolvedValue({
      ok: true, markdown: '# 标题', sourcePath: 'a.md',
    });
    view.runCardLayoutPipeline = vi.fn(async (ctx) => ({
      ok: false,
      diagnostics: [{ blockId: '', reason: 'oversized-atomic', message: '布局在 3 轮内未能消除溢出' }],
      pageCount: 0,
      layoutKey: ctx.layoutKey,
    }));

    await view.renderCardPreview();
    expect(view.previewContainer.querySelector('.icard-preview-empty-title')?.textContent).toBe('卡片排版失败');
    expect(view.previewContainer.querySelector('.icard-preview-empty-desc')?.textContent)
      .toContain('布局在 3 轮内未能消除溢出');
  });

  it('编辑合并：连续 scheduleCardPreviewUpdate 只在停顿后触发一次渲染', async () => {
    vi.useFakeTimers();
    try {
      const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
      view.previewMode = 'card';
      view.renderCardPreview = vi.fn().mockResolvedValue(undefined);
      view.scheduleCardPreviewUpdate();
      view.scheduleCardPreviewUpdate();
      view.scheduleCardPreviewUpdate();
      await vi.advanceTimersByTimeAsync(299);
      expect(view.renderCardPreview).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2);
      expect(view.renderCardPreview).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('缩放控制：钳制在范围内且不影响页计划', () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.setCardPreviewZoom(1.5);
    expect(view.getCardPreviewZoom()).toBeLessThanOrEqual(1);
    view.setCardPreviewZoom(0.01);
    expect(view.getCardPreviewZoom()).toBeGreaterThanOrEqual(0.35);
  });

  it('源定位版本安全：结果过期后不跳转编辑器；版本一致才定位', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.previewMode = 'card';
    view.previewContainer = createObsidianLikeElement();
    view.simpleHash = () => 'h1';
    view.resolveCardMarkdownSource = vi.fn().mockResolvedValue({
      ok: true, markdown: '# 标题', sourcePath: 'a.md',
    });
    view.runCardLayoutPipeline = vi.fn(async (ctx) => ({
      ok: true,
      pages: [createObsidianLikeElement()],
      plan: { ok: true, pages: [{ index: 1, entries: [{ blockId: 'b1' }] }], diagnostics: [] },
      cardDoc: { blocks: [{ id: 'b1', sourceStart: 7 }] },
      resources: { hasBlockingFailures: false },
      diagnostics: [],
      omissionSummary: { total: 0 },
      pageCount: 1,
      layoutKey: ctx.layoutKey,
      sourcePath: 'a.md',
    }));
    const editor = { setCursor: vi.fn(), scrollIntoView: vi.fn() };
    view.app = { workspace: { getActiveViewOfType: vi.fn().mockReturnValue({ editor }) } };

    await view.renderCardPreview();
    view.locateCardPageSource(1);
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 6, ch: 0 });

    // 正文变化 → bump → 结果过期 → 不再跳转
    const session = view.getCardSessions().getSession('a.md');
    session.bumpContent();
    editor.setCursor.mockClear();
    view.locateCardPageSource(1);
    expect(editor.setCursor).not.toHaveBeenCalled();
  });

  it('disposeCardPreview：销毁会话注册表；同路径再取得新身份', async () => {
    const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
    view.previewMode = 'card';
    view.simpleHash = () => 'h1';
    view.resolveCardMarkdownSource = vi.fn().mockResolvedValue({ ok: true, markdown: 'x', sourcePath: 'a.md' });
    view.runCardLayoutPipeline = vi.fn(async (ctx) => ({
      ok: true, pages: [], plan: { ok: true, pages: [] }, cardDoc: { blocks: [] },
      resources: null, diagnostics: [], omissionSummary: { total: 0 }, pageCount: 0,
      layoutKey: ctx.layoutKey, sourcePath: 'a.md',
    }));
    view.previewContainer = createObsidianLikeElement();
    await view.renderCardPreview();
    const before = view.getCardSessions().getSession('a.md');
    view.disposeCardPreview();
    expect(view.cardSessionRegistry).toBeNull();
    const after = view.getCardSessions().getSession('a.md');
    expect(after.noteId).not.toBe(before.noteId);
  });
});
