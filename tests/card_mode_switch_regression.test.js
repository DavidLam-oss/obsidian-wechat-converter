/*
## 核心功能

验证文章模式切换卡片模式偶发失效修复（生命周期重置、Landing Gate 竞态、onResize 防打断、跨窗口元素判断、早期会话绑定与版本重排）。

## 输入

使用 jsdom + Obsidian 测试辅助构造 AppleStyleView / 视图方法组、伪造异窗 DOM 节点和卡片会话替身。

## 输出

作为 Vitest 自动化回归测试套件运行，确保问题 1 的所有根因修复持续有效。

## 定位

位于 tests/，只服务自动化测试。

## 依赖

关键依赖：`../views/converter/core.js`、`../views/converter/panel-shell.js`、`../views/converter/card-preview.js`、`../views/shared/view-dom-helpers.js`。

## 维护规则

- 修改逻辑后同步检查对应源码接口与回归测试场景是否仍一致。
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isElementLike, removeElementClass } from '../views/shared/view-dom-helpers.js';
import { panelShellMethods } from '../views/converter/panel-shell.js';
import { cardPreviewMethods } from '../views/converter/card-preview.js';
import { coreMethods } from '../views/converter/core.js';
import { createObsidianLikeElement } from './helpers/obsidian-dom.js';
import { resetViewTestGlobals } from './helpers/view-test-helpers.js';

function enhanceObsidianEl(el) {
  if (!el) return el;
  el.empty = function () {
    this.innerHTML = '';
    return this;
  };
  el.addClass = function (...cls) {
    cls.forEach((c) => c && this.classList.add(...String(c).split(/\s+/).filter(Boolean)));
    return this;
  };
  el.removeClass = function (...cls) {
    cls.forEach((c) => c && this.classList.remove(...String(c).split(/\s+/).filter(Boolean)));
    return this;
  };
  el.setCssStyles = function (styles = {}) {
    Object.entries(styles).forEach(([k, v]) => this.style.setProperty(k, String(v)));
    return this;
  };
  el.setText = function (text) {
    this.textContent = String(text ?? '');
    return this;
  };
  el._foreignChildren = [];
  const origAppendChild = el.appendChild.bind(el);
  el.appendChild = function (child) {
    if (typeof Node !== 'undefined' && child instanceof Node) {
      return origAppendChild(child);
    }
    this._foreignChildren.push(child);
    return child;
  };
  el.createEl = function (tag, opts = {}) {
    const child = enhanceObsidianEl(document.createElement(tag));
    if (opts.cls) child.addClass(opts.cls);
    if (opts.text !== undefined) child.textContent = String(opts.text);
    if (opts.attr) {
      Object.entries(opts.attr).forEach(([k, v]) => child.setAttribute(k, String(v)));
    }
    this.appendChild(child);
    return child;
  };
  el.createDiv = function (opts = {}) {
    return this.createEl('div', opts);
  };
  return el;
}

function createFakeForeignElement(tagName = 'DIV') {
  const classes = new Set();
  const styles = new Map();
  const attrs = new Map();
  const children = [];
  return {
    nodeType: 1,
    tagName,
    children,
    dataset: {},
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        if (force === true) classes.add(name);
        else if (force === false) classes.delete(name);
        else if (classes.has(name)) classes.delete(name);
        else classes.add(name);
        return classes.has(name);
      },
      contains: (name) => classes.has(name),
    },
    style: {
      setProperty: (k, v) => styles.set(k, String(v)),
      getPropertyValue: (k) => styles.get(k) || '',
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

describe('card mode switch regressions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetViewTestGlobals(vi);
  });

  afterEach(() => {
    resetViewTestGlobals(vi);
  });

  it('onClose resets previewMode, clears pending timers/input/hashes, and syncPreviewModeUi aligns wrappers & buttons', async () => {
    const containerEl = enhanceObsidianEl(createObsidianLikeElement('div'));
    const previewContainer = enhanceObsidianEl(createObsidianLikeElement('div'));
    const btnArticleMode = enhanceObsidianEl(createObsidianLikeElement('button'));
    const btnStickerMode = enhanceObsidianEl(createObsidianLikeElement('button'));
    const btnCardMode = enhanceObsidianEl(createObsidianLikeElement('button'));
    const articleSettingsWrapper = enhanceObsidianEl(createObsidianLikeElement('div'));
    const stickerSettingsWrapper = enhanceObsidianEl(createObsidianLikeElement('div'));
    const cardSettingsWrapper = enhanceObsidianEl(createObsidianLikeElement('div'));

    const view = {
      containerEl,
      previewContainer,
      previewMode: 'card',
      btnArticleMode,
      btnStickerMode,
      btnCardMode,
      articleSettingsWrapper,
      stickerSettingsWrapper,
      cardSettingsWrapper,
      _customCssLastValidBySource: new Map(),
      cardPreviewPendingInput: { markdown: 'hi', sourcePath: 'a.md', sourcePathKey: 'a.md' },
      cardContentHashes: new Map([['a.md', '123']]),
      resizeTimeout: setTimeout(() => {}, 5000),
      _modeRenderTimer: setTimeout(() => {}, 5000),
      setPreviewLoading: coreMethods.setPreviewLoading,
      closeTransientPanels: vi.fn(),
      applyModeActionVisibility: vi.fn(),
      disposeCardExportModal: vi.fn(),
      disposeCardPreview: cardPreviewMethods.disposeCardPreview,
      syncPreviewModeUi: panelShellMethods.syncPreviewModeUi,
      onClose: coreMethods.onClose,
    };

    // Simulate out-of-sync DOM when a view already has previewMode='card'
    view.syncPreviewModeUi();
    expect(btnCardMode.classList.contains('active')).toBe(true);
    expect(btnArticleMode.classList.contains('active')).toBe(false);
    expect(articleSettingsWrapper.classList.contains('hidden')).toBe(true);
    expect(articleSettingsWrapper.hidden).toBe(true);
    expect(cardSettingsWrapper.classList.contains('hidden')).toBe(false);
    expect(cardSettingsWrapper.hidden).toBe(false);
    expect(view.applyModeActionVisibility).toHaveBeenCalledTimes(1);

    await view.onClose();

    expect(view.previewMode).toBe('article');
    expect(view.cardPreviewPendingInput).toBeNull();
    expect(view.cardContentHashes.size).toBe(0);
    expect(view.resizeTimeout).toBeNull();
    expect(view._modeRenderTimer).toBeNull();
    expect(previewContainer.classList.contains('apple-preview-loading')).toBe(false);
  });

  it('onOpen unlocks Landing Gate without spawning article convertCurrent when clicking .apple-preview-mode-segment', async () => {
    const root = enhanceObsidianEl(document.createElement('div'));
    const topChild = enhanceObsidianEl(document.createElement('div'));
    const contentChild = enhanceObsidianEl(document.createElement('div'));
    root.appendChild(topChild);
    root.appendChild(contentChild);
    document.body.appendChild(root);

    const previewContainer = enhanceObsidianEl(document.createElement('div'));
    const segment = enhanceObsidianEl(document.createElement('div'));
    segment.addClass('apple-preview-mode-segment');
    const cardBtn = enhanceObsidianEl(document.createElement('button'));
    segment.appendChild(cardBtn);

    const activeFile = { path: 'notes/demo.md', extension: 'md', basename: 'demo' };
    const view = {
      containerEl: root,
      previewContainer,
      previewMode: 'card',
      lastActiveFile: activeFile,
      converter: {},
      app: {
        workspace: {
          on: vi.fn(() => ({ id: 'evt' })),
          getActiveViewOfType: vi.fn(() => ({ file: activeFile })),
        },
      },
      plugin: {
        settings: { customCss: '' },
        loadCardCoverCache: vi.fn(async () => {}),
      },
      registerEvent: vi.fn(),
      register: vi.fn(),
      registerActiveFileChange: vi.fn(),
      loadDependencies: vi.fn(async () => {}),
      createSettingsPanel: vi.fn((c) => {
        c.appendChild(segment);
      }),
      createPlaceholderPanel: vi.fn(() => previewContainer.createDiv({ cls: 'apple-placeholder' })),
      renderPlaceholderIcon: vi.fn(),
      setPlaceholder: coreMethods.setPlaceholder,
      setPreviewLoading: coreMethods.setPreviewLoading,
      convertCurrent: vi.fn(async () => {}),
      updateDocumentStats: vi.fn(),
      scheduleActiveLeafRender: vi.fn(),
      resolveActiveFileForLeaf: vi.fn(() => activeFile),
      refreshToolbarAccountIndicator: vi.fn(),
      refreshToolbarAiLayoutIndicator: vi.fn(),
      refreshCustomCssPreview: vi.fn(),
      updateCurrentDoc: vi.fn(),
      registerScrollSync: vi.fn(),
      registerInterval: vi.fn(),
      syncPreviewModeUi: panelShellMethods.syncPreviewModeUi,
      applyModeActionVisibility: vi.fn(),
      closeTransientPanels: vi.fn(),
      runModeRenderWithDiagnostics: panelShellMethods.runModeRenderWithDiagnostics,
      showModeRenderFailure: panelShellMethods.showModeRenderFailure,
      renderCardPreview: vi.fn(async () => {
        view.previewContainer.empty();
        view.previewContainer.createDiv({ cls: 'icard-preview-shell' });
        view.setPreviewLoading(false);
        return view.previewContainer;
      }),
      renderStickerPreview: vi.fn(async () => {}),
      switchPreviewMode: panelShellMethods.switchPreviewMode,
      onOpen: coreMethods.onOpen,
    };

    await view.onOpen();

    expect(view.previewMode).toBe('article');
    expect(view.landingGateActive).toBe(true);

    const pointerDownEvent = new Event('pointerdown', { bubbles: true });
    cardBtn.dispatchEvent(pointerDownEvent);

    expect(view.landingGateActive).toBe(false);
    expect(view.landingGateUserInteracted).toBe(true);
    expect(view.convertCurrent).not.toHaveBeenCalled();

      let resolveCardRender;
      const cardRenderGate = new Promise((resolve) => {
        resolveCardRender = resolve;
      });
      view.renderCardPreview = vi.fn(async () => {
        await cardRenderGate;
        view.previewContainer.empty();
        view.previewContainer.createDiv({ cls: 'icard-preview-shell' });
        view.setPreviewLoading(false);
        return view.previewContainer;
      });
      view.switchPreviewMode('card');
      expect(view.previewMode).toBe('card');
      expect(view.previewContainer.querySelector('.icard-preview-empty.is-loading')).not.toBeNull();
      expect(view.previewContainer.classList.contains('apple-preview-loading')).toBe(true);
      resolveCardRender();
      await Promise.resolve();
      await Promise.resolve();
      expect(view.renderCardPreview).toHaveBeenCalledTimes(1);
      expect(view.previewContainer.querySelector('.icard-preview-shell')).not.toBeNull();
      expect(view.previewContainer.classList.contains('apple-preview-loading')).toBe(false);
  });

  it('onResize in card mode calls refitCardPreviewZoom without triggering convertCurrent', () => {
    vi.useFakeTimers();
    const containerEl = { offsetParent: {} };
    const inner = createFakeForeignElement('DIV');
    const item = {
      dataset: { pageWidth: '400', pageHeight: '500' },
      style: {
        props: new Map(),
        setProperty(k, v) { this.props.set(k, String(v)); },
      },
      querySelector: (selector) => (selector === '.icard-page' ? inner : null),
    };
    const shell = {
      clientWidth: 256, // available = 256 - 56 = 200 -> zoom = 0.5
      querySelector: () => null,
      querySelectorAll: (selector) => (selector === '.icard-preview-page-item' ? [item] : []),
    };

    const view = {
      containerEl,
      previewMode: 'card',
      landingGateActive: false,
      resizeTimeout: null,
      cardPreviewShell: shell,
      cardPreviewOutcome: { ready: true },
      cardPreviewPageWidth: 400,
      cardPreviewZoom: 1,
      convertCurrent: vi.fn(),
      getCardPreviewZoom: cardPreviewMethods.getCardPreviewZoom,
      maybeAutoFitCardPreviewZoom: cardPreviewMethods.maybeAutoFitCardPreviewZoom,
      applyCardPreviewZoom: cardPreviewMethods.applyCardPreviewZoom,
      refitCardPreviewZoom: cardPreviewMethods.refitCardPreviewZoom,
      onResize: coreMethods.onResize,
    };

    view.onResize();
    vi.advanceTimersByTime(350);

    expect(view.convertCurrent).not.toHaveBeenCalled();
    expect(view.cardPreviewZoom).toBeCloseTo(0.5, 4);
    expect(inner.style.getPropertyValue('transform')).toBe('scale(0.5)');
  });

  it('cross-window foreign elements work in isElementLike, removeElementClass, switchPreviewMode, and renderCardPreviewDom', () => {
    const foreignBtnArt = createFakeForeignElement('BUTTON');
    const foreignBtnStk = createFakeForeignElement('BUTTON');
    const foreignBtnCard = createFakeForeignElement('BUTTON');
    foreignBtnArt.classList.add('active');

    expect(isElementLike(foreignBtnCard)).toBe(true);
    expect(isElementLike(null)).toBe(false);
    expect(isElementLike({ nodeType: 3 })).toBe(false);

    removeElementClass(foreignBtnArt, 'active');
    expect(foreignBtnArt.classList.contains('active')).toBe(false);

    const container = enhanceObsidianEl(document.createElement('div'));
    const coverPage = createFakeForeignElement('DIV');
    const contentPage = createFakeForeignElement('DIV');
    const session = {
      noteId: 'note-1',
      currentLayoutKey: () => 'lk-1',
      getPreviewState: () => ({
        hasResult: true,
        state: 'ready',
        stale: false,
        snapshotId: 'snap-1',
      }),
      applyCoverFields: vi.fn(),
      getSourcePath: () => 'notes/a.md',
      getCoverFields: () => ({}),
    };

    const view = {
      previewMode: 'article',
      previewContainer: container,
      btnArticleMode: foreignBtnArt,
      btnStickerMode: foreignBtnStk,
      btnCardMode: foreignBtnCard,
      cardSessionRegistry: {
        getSession: () => session,
      },
      cardPreviewPendingInput: { markdown: '# Demo', sourcePath: 'notes/a.md', sourcePathKey: 'notes/a.md' },
      cardPreviewOutcome: {
        ready: true,
        layoutKey: 'lk-1',
        aspectRatio: '3:4',
        pageCount: 1,
        hasCover: true,
        coverPage,
        pages: [contentPage],
        omissionSummary: { total: 0 },
      },
      setPreviewLoading: coreMethods.setPreviewLoading,
      closeTransientPanels: vi.fn(),
      applyModeActionVisibility: vi.fn(),
      syncPreviewModeUi: panelShellMethods.syncPreviewModeUi,
      runModeRenderWithDiagnostics: panelShellMethods.runModeRenderWithDiagnostics,
      showModeRenderFailure: panelShellMethods.showModeRenderFailure,
      renderCardPreview: vi.fn(async () => undefined),
      renderStickerPreview: vi.fn(async () => undefined),
      convertCurrent: vi.fn(async () => {}),
      switchPreviewMode: panelShellMethods.switchPreviewMode,
      getCardSessions: cardPreviewMethods.getCardSessions,
      getCardPreviewZoom: cardPreviewMethods.getCardPreviewZoom,
      maybeAutoFitCardPreviewZoom: cardPreviewMethods.maybeAutoFitCardPreviewZoom,
      applyCardPreviewZoom: cardPreviewMethods.applyCardPreviewZoom,
      renderCardPreviewDom: cardPreviewMethods.renderCardPreviewDom,
    };

    view.switchPreviewMode('card');
    expect(foreignBtnArt.classList.contains('active')).toBe(false);
    expect(foreignBtnCard.classList.contains('active')).toBe(true);

    const renderedShell = view.renderCardPreviewDom();
    expect(renderedShell).toBeTruthy();
    expect(container.classList.contains('apple-preview-loading')).toBe(false);
    const pageItems = Array.from(container.querySelectorAll('.icard-preview-page-item'));
    expect(pageItems).toHaveLength(2);
    expect(pageItems[0].dataset.pageId).toBe('cover');
    expect(pageItems[0]._foreignChildren).toContain(coverPage);
    expect(pageItems[1].dataset.pageId).toBe('page-1');
    expect(pageItems[1]._foreignChildren).toContain(contentPage);
    expect(view.cardPreviewPageWidth).toBeGreaterThan(0);
  });

  it('renderCardPreview binds cardPreviewPendingInput early and retries once on version-changed', async () => {
    const container = enhanceObsidianEl(document.createElement('div'));
    let resolveDiskCache;
    const diskCacheGate = new Promise((resolve) => {
      resolveDiskCache = resolve;
    });

    const sessionState = {
      hasResult: true,
      state: 'ready',
      stale: false,
      snapshotId: 'snap-1',
    };
    const fakeSession = {
      noteId: 'note-retry',
      currentLayoutKey: () => 'lk-2',
      getPreviewState: () => sessionState,
      bumpContent: vi.fn(),
      setCoverSeed: vi.fn(),
      isCoverFieldsDirty: () => false,
      applyCoverFields: vi.fn(),
      getSourcePath: () => 'notes/retry.md',
      getCoverFields: () => ({}),
    };

    let runnerCalls = 0;
    const fakeRunner = {
      schedule: vi.fn(async () => {
        runnerCalls += 1;
        if (runnerCalls === 1) {
          return { applied: false, reason: 'version-changed' };
        }
        view.cardPreviewLastOutcome = {
          ready: true,
          layoutKey: 'lk-2',
          aspectRatio: '3:4',
          pageCount: 1,
          hasCover: false,
          pages: [enhanceObsidianEl(document.createElement('div'))],
          omissionSummary: { total: 0 },
        };
        return { applied: true };
      }),
    };

    const view = {
      previewMode: 'card',
      previewContainer: container,
      app: { isMobile: false },
      plugin: {
        settings: {},
        loadCardCoverCache: vi.fn(() => diskCacheGate),
      },
      cardPreviewRunnerNoteId: 'note-retry',
      cardPreviewRunner: fakeRunner,
      getCardSessions: () => ({ getSession: () => fakeSession }),
      resolveCardMarkdownSource: vi.fn(async () => ({
        ok: true,
        markdown: '# Heading\n\nBody copy',
        sourcePath: 'notes/retry.md',
      })),
      setPreviewLoading: vi.fn(),
      getCardPreviewZoom: cardPreviewMethods.getCardPreviewZoom,
      maybeAutoFitCardPreviewZoom: cardPreviewMethods.maybeAutoFitCardPreviewZoom,
      applyCardPreviewZoom: cardPreviewMethods.applyCardPreviewZoom,
      renderCardPreviewDom: cardPreviewMethods.renderCardPreviewDom,
      renderCardPreview: cardPreviewMethods.renderCardPreview,
    };

    view.setPreviewLoading(true, '正在生成卡片预览...');
    const renderPromise = view.renderCardPreview();
    await Promise.resolve();
    await Promise.resolve();

    // Already bound while async disk cache is still pending
    expect(view.cardPreviewPendingInput).toEqual({
      markdown: '# Heading\n\nBody copy',
      sourcePath: 'notes/retry.md',
      sourcePathKey: 'notes/retry.md',
    });

    resolveDiskCache();
    const result = await renderPromise;

    expect(fakeRunner.schedule).toHaveBeenCalledTimes(2);
    expect(result).toBeTruthy();
    expect(view.setPreviewLoading).toHaveBeenCalledWith(false);
    expect(container.querySelectorAll('.icard-preview-page-item')).toHaveLength(1);
  });

  it('renderCardPreview replaces stuck .icard-preview-empty.is-loading with empty state on non-applied schedule, while keeping existing cards intact', async () => {
    const container = enhanceObsidianEl(document.createElement('div'));
    const loadingPlaceholder = container.createEl('div', { cls: 'icard-preview-empty is-loading' });
    loadingPlaceholder.createEl('div', { cls: 'icard-preview-empty-title', text: '正在生成卡片预览...' });

    const fakeSession = {
      noteId: 'note-stuck',
      currentLayoutKey: () => 'lk-stuck',
      getPreviewState: () => ({ hasResult: false, state: 'idle', stale: false, snapshotId: '' }),
      bumpContent: vi.fn(),
      setCoverSeed: vi.fn(),
      isCoverFieldsDirty: () => false,
      applyCoverFields: vi.fn(),
      getSourcePath: () => 'notes/stuck.md',
      getCoverFields: () => ({}),
    };

    const view = {
      previewMode: 'card',
      previewContainer: container,
      app: { isMobile: false },
      plugin: { settings: {}, loadCardCoverCache: vi.fn(async () => {}) },
      cardPreviewRunnerNoteId: 'note-stuck',
      cardPreviewRunner: { schedule: vi.fn(async () => ({ applied: false, reason: 'disposed' })) },
      getCardSessions: () => ({ getSession: () => fakeSession }),
      resolveCardMarkdownSource: vi.fn(async () => ({
        ok: true,
        markdown: '# Stuck Loading Check',
        sourcePath: 'notes/stuck.md',
      })),
      setPreviewLoading: vi.fn(),
      renderCardEmptyState: cardPreviewMethods.renderCardEmptyState,
      renderCardPreview: cardPreviewMethods.renderCardPreview,
    };

    await view.renderCardPreview();
    expect(view.setPreviewLoading).toHaveBeenCalledWith(false);
    expect(container.querySelector('.icard-preview-empty.is-loading')).toBeNull();
    expect(container.textContent).toContain('暂无可排版的卡片内容');

    // When existing rendered card shell is displayed (no .is-loading placeholder), keep existing DOM intact
    container.empty();
    const existingShell = container.createEl('div', { cls: 'icard-preview-shell', text: 'Existing cards' });
    view.setPreviewLoading.mockClear();
    view.cardPreviewRunner.schedule.mockResolvedValueOnce({ applied: false, reason: 'error' });
    await view.renderCardPreview();
    expect(view.setPreviewLoading).toHaveBeenCalledWith(false);
    expect(container.querySelector('.icard-preview-shell')).toBe(existingShell);
    expect(container.textContent).toBe('Existing cards');
  });

  it('switchPreviewMode works cleanly when optional setPreviewLoading is omitted', () => {
    const previewContainer = enhanceObsidianEl(createObsidianLikeElement('div'));
    const view = {
      previewMode: 'article',
      landingGateActive: true,
      previewContainer,
      syncPreviewModeUi: vi.fn(),
      closeTransientPanels: vi.fn(),
      runModeRenderWithDiagnostics: vi.fn(),
      renderCardPreview: vi.fn(async () => undefined),
      convertCurrent: vi.fn(async () => undefined),
      switchPreviewMode: panelShellMethods.switchPreviewMode,
    };

    expect(() => view.switchPreviewMode('card')).not.toThrow();
    expect(view.previewMode).toBe('card');
    expect(view.landingGateActive).toBe(false);
    expect(previewContainer.querySelector('.icard-preview-empty.is-loading')).toBeTruthy();

    expect(() => view.switchPreviewMode('article')).not.toThrow();
    expect(view.previewMode).toBe('article');
  });
});
