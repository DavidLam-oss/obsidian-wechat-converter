/*
## 核心功能

实现转换器悬浮面板、滚动边界和文章/贴图模式切换。

## 输入

接收 AppleStyleView 实例状态、活动笔记、渲染结果和用户交互事件。

## 输出

输出 `panelShellMethods`，由 AppleStyleView 统一组装。

## 定位

位于 views/converter/，只处理视图壳层状态，不创建具体设置控件或贴图内容。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查所属目录 README 是否仍准确。
- 保持现有 AppleStyleView 方法签名与 this 语义，业务规则优先委托 services/。
*/

import {
  toRecord,
  isElementLike,
  removeElementClass,
} from '../apple-style-view-shared.js';

/** 卡片模式骨架屏延迟防抖时间（ms）：排版耗时低于此门槛时完全不挂载骨架，消除 50~100ms 快速加载时的闪烁 */
const CARD_LOADING_DEBOUNCE_MS = 160;

/** 骨架屏最小展示时长（ms）：若排版慢于防抖门槛触发了骨架，至少保持该时长，避免闪烁骤变 */
const CARD_LOADING_MIN_DURATION_MS = 260;

/**
 * 安全创建子元素（兼容测试中只实现局部 DOM 接口的轻量替身）。
 * @param {unknown} parent
 * @param {string} tag
 * @param {Record<string, unknown>} options
 * @returns {ObsidianElementLike | null}
 */
function createChildEl(parent, tag, options) {
  if (!parent || typeof parent !== 'object' || typeof (/** @type {ObsidianElementLike} */ (parent)).createEl !== 'function') {
    return null;
  }
  return /** @type {ObsidianElementLike} */ (parent).createEl(tag, options);
}

/**
 * 渲染卡片模式「Design Studio 骨架 + 毛玻璃状态胶囊」加载态。
 * 保留 `.icard-preview-empty.is-loading` 与 `.icard-preview-empty-title` 类名，确保状态清理与可访问性一致。
 * @param {ObsidianElementLike | null | undefined} previewContainer
 */
function renderCardLoadingPlaceholder(previewContainer) {
  if (!previewContainer) return;
  previewContainer.empty?.();
  previewContainer.addClass?.('has-card-preview');

  const loading = createChildEl(previewContainer, 'div', {
    cls: 'icard-preview-empty is-loading',
    attr: {
      role: 'status',
      'aria-live': 'polite',
      'aria-busy': 'true',
    },
  });
  if (!loading) return;

  const toolbar = createChildEl(loading, 'div', {
    cls: 'icard-loading-toolbar',
    attr: { 'aria-hidden': 'true' },
  });
  createChildEl(toolbar, 'span', { cls: 'icard-loading-bar is-count icard-loading-shimmer' });
  createChildEl(toolbar, 'span', { cls: 'icard-loading-chip icard-loading-shimmer' });

  const stage = createChildEl(loading, 'div', { cls: 'icard-loading-stage' });
  const deck = createChildEl(stage, 'div', {
    cls: 'icard-loading-deck',
    attr: { 'aria-hidden': 'true' },
  });
  createChildEl(deck, 'div', { cls: 'icard-loading-card-back' });

  const card = createChildEl(deck, 'div', { cls: 'icard-loading-card' });
  createChildEl(card, 'div', { cls: 'icard-loading-card-badge' });
  createChildEl(card, 'div', { cls: 'icard-loading-card-hero icard-loading-shimmer' });

  const lines = createChildEl(card, 'div', { cls: 'icard-loading-card-lines' });
  createChildEl(lines, 'span', { cls: 'icard-loading-card-line is-title icard-loading-shimmer' });
  createChildEl(lines, 'span', { cls: 'icard-loading-card-line is-body icard-loading-shimmer' });
  createChildEl(lines, 'span', { cls: 'icard-loading-card-line is-short icard-loading-shimmer' });

  const footer = createChildEl(card, 'div', { cls: 'icard-loading-card-footer' });
  createChildEl(footer, 'span', { cls: 'icard-loading-card-meta' });
  createChildEl(footer, 'span', { cls: 'icard-loading-card-meta is-right' });

  const pill = createChildEl(stage, 'div', { cls: 'icard-loading-pill' });
  createChildEl(pill, 'progress', {
    cls: 'icard-loading-spinner',
    attr: { 'aria-label': '正在生成卡片预览' },
  });
  const copy = createChildEl(pill, 'div', { cls: 'icard-loading-copy' });
  createChildEl(copy, 'div', {
    cls: 'icard-preview-empty-title',
    text: '正在生成卡片预览...',
  });
  createChildEl(copy, 'div', {
    cls: 'icard-preview-empty-desc',
    text: '正在排版分页并准备卡片画布',
  });
}

/** @type {PanelShellMethodsContract & ThisType<AppleStyleViewContract>} */
export const panelShellMethods = {
resetSettingsPanelViewState() {
  const advancedOptions = this.settingsAdvancedOptions || this.settingsOverlay?.querySelector('.apple-settings-details');
  if (advancedOptions) advancedOptions.open = false;
  if (this.settingsSpacingGroup) this.settingsSpacingGroup.open = false;

  // 卡片模式：卡片面板的视图状态同口径复位（子 Tab / 两个折叠组，见 card-settings.js）。
  // 只在卡片面板是**当前可见面板**时做——文章模式下面板里根本没有卡片控件，
  // 复位它是白跑一趟 DOM 读写。
  if (this.previewMode === 'card' && typeof this.resetCardSettingsPanelViewState === 'function') {
    this.resetCardSettingsPanelViewState();
  }

  const scrollTargets = [
    this.settingsOverlay,
    this.settingsArea,
    this.settingsAdvancedArea,
  ].filter(Boolean);

  const resetScroll = () => {
    scrollTargets.forEach((target) => {
      target.scrollTop = 0;
    });
  };

  resetScroll();
  if (typeof requestAnimationFrame === 'function') {
    window.requestAnimationFrame(resetScroll);
  }
}
,

resetAiLayoutPanelViewState() {
  this.aiAdvancedOpen = false;
  this.aiLayoutDebugMode = '';
  this.aiLayoutPendingAnchor = null;

  const scrollTargets = [
    this.aiLayoutOverlay,
    this.aiLayoutArea,
    this.aiAdvancedBody,
    this.aiDebugPanelBody,
  ].filter(Boolean);

  const resetScroll = () => {
    scrollTargets.forEach((target) => {
      target.scrollTop = 0;
    });
  };

  resetScroll();
  if (typeof requestAnimationFrame === 'function') {
    window.requestAnimationFrame(resetScroll);
  }
}
,

togglePanel(overlay, button, onOpen) {
  if (!overlay || !button) return;
  const willOpen = !overlay.classList.contains('visible');
  this.closeTransientPanels();
  if (willOpen) {
    overlay.classList.add('visible');
    button.classList.add('active');
    if (typeof onOpen === 'function') onOpen();
  }
}
,

canScrollElementInDirection(element, deltaY) {
  if (!element) return false;
  const maxScroll = Math.max(0, (element.scrollHeight || 0) - (element.clientHeight || 0));
  if (maxScroll <= 0) return false;
  if (deltaY < 0) return (element.scrollTop || 0) > 0;
  if (deltaY > 0) return (element.scrollTop || 0) < maxScroll - 1;
  return true;
}
,

attachOverlayScrollGuard(overlay, nestedSelectors = []) {
  if (!overlay || overlay.__appleScrollGuardAttached) return;
  const normalizedSelectors = Array.isArray(nestedSelectors)
    ? nestedSelectors.filter(Boolean)
    : [];

  /** @param {WheelEvent} event */
  const handleWheel = (event) => {
    if (!overlay.classList.contains('visible')) return;
    const target = isElementLike(event.target) ? event.target : null;
    const nestedScrollable = /** @type {Element | null} */ (target
      ? normalizedSelectors
        .map((selector) => target.closest(selector))
        .find(Boolean)
      : null);
    const activeScrollable = nestedScrollable || overlay;

    if (!this.canScrollElementInDirection(activeScrollable, event.deltaY)) {
      event.preventDefault();
    }
    event.stopPropagation();
  };

  /** @param {TouchEvent} event */
  const handleTouchMove = (event) => {
    if (!overlay.classList.contains('visible')) return;
    event.stopPropagation();
  };

  overlay.addEventListener('wheel', handleWheel, { passive: false });
  overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
  overlay.__appleScrollGuardAttached = true;
}
,

closeTransientPanels() {
  removeElementClass(this.settingsOverlay, 'visible');
  removeElementClass(this.aiLayoutOverlay, 'visible');
  removeElementClass(this.settingsBtn, 'active');
  removeElementClass(this.aiLayoutBtn, 'active');
}
,


syncPreviewModeUi() {
  const mode = this.previewMode === 'sticker' || this.previewMode === 'card' ? this.previewMode : 'article';
  this.previewMode = mode;

  const articleBtn = /** @type {unknown} */ (this.btnArticleMode);
  const stickerBtn = /** @type {unknown} */ (this.btnStickerMode);
  const cardBtn = /** @type {unknown} */ (this.btnCardMode);

  if (isElementLike(articleBtn) && isElementLike(stickerBtn)) {
    articleBtn.classList.toggle('active', mode === 'article');
    stickerBtn.classList.toggle('active', mode === 'sticker');
    if (isElementLike(cardBtn)) {
      cardBtn.classList.toggle('active', mode === 'card');
    }
  }

  const artWrapper = /** @type {unknown} */ (this.articleSettingsWrapper);
  const stkWrapper = /** @type {unknown} */ (this.stickerSettingsWrapper);
  const cardWrapper = /** @type {unknown} */ (this.cardSettingsWrapper);

  /** @param {unknown} wrapper @param {boolean} hidden */
  const setWrapperHidden = (wrapper, hidden) => {
    if (wrapper && typeof wrapper === 'object' && 'classList' in wrapper) {
      const el = /** @type {HTMLElement} */ (wrapper);
      el.classList.toggle('hidden', hidden);
      if ('hidden' in el) {
        el.hidden = hidden;
      }
    }
  };
  setWrapperHidden(artWrapper, mode !== 'article');
  setWrapperHidden(stkWrapper, mode !== 'sticker');
  setWrapperHidden(cardWrapper, mode !== 'card');

  // 集中控制操作按钮显隐（B02 ①）
  this.applyModeActionVisibility();
}
,

toggleSettingsPanel() {
  this.syncPreviewModeUi();
  if (this.previewMode === 'sticker') {
    const toggleState = toRecord(this.stickerIndexToggleState);
    const checkbox = toggleState ? toRecord(toggleState.checkbox) : null;
    if (checkbox && typeof checkbox.checked === 'boolean') {
      checkbox.checked = Boolean(this.insertStickerImageIndex);
    }
  } else if (this.previewMode === 'card') {
    // 打开时同步当前会话设置值（换篇/重排后可能已变化）
    if (typeof this.renderCardSettingsValues === 'function') this.renderCardSettingsValues();
  }

  this.togglePanel(this.settingsOverlay, this.settingsBtn, () => this.resetSettingsPanelViewState());
}
,

/** 清除卡片模式骨架屏延迟计时器与已展示时间戳 */
clearCardLoadingTimer() {
  if (this.cardLoadingPlaceholderTimer) {
    window.clearTimeout(this.cardLoadingPlaceholderTimer);
    this.cardLoadingPlaceholderTimer = null;
  }
  this.cardLoadingPlaceholderShownAt = 0;
}
,

/**
 * 等待卡片模式骨架屏最小展示时长，避免排版在 170~250ms 落地时骨架屏突兀闪烁。
 * @param {number} [minDuration]
 */
async waitForCardLoadingMinDuration(minDuration = CARD_LOADING_MIN_DURATION_MS) {
  if (this.cardLoadingPlaceholderShownAt > 0) {
    const elapsed = Date.now() - this.cardLoadingPlaceholderShownAt;
    const remaining = minDuration - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, remaining);
      });
    }
    this.cardLoadingPlaceholderShownAt = 0;
  }
}
,

/**
 * 切换预览模式（文章 / 贴图 / 卡片）。
 * @param {'article' | 'sticker' | 'card'} mode
 * @param {{ loadingDelay?: number }} [options]
 */
switchPreviewMode(mode, options = {}) {
  if (this.previewMode === mode) return;
  if (mode !== 'article' && mode !== 'sticker' && mode !== 'card') return;
  if (this._modeRenderTimer) {
    window.clearTimeout(this._modeRenderTimer);
    this._modeRenderTimer = null;
  }
  if (this.loadingVisibilityTimer) {
    window.clearTimeout(this.loadingVisibilityTimer);
    this.loadingVisibilityTimer = null;
  }
  if (this.cardPreviewMergeTimer) {
    window.clearTimeout(this.cardPreviewMergeTimer);
    this.cardPreviewMergeTimer = null;
  }
  if (typeof this.clearCardLoadingTimer === 'function') {
    this.clearCardLoadingTimer();
  } else {
    if (this.cardLoadingPlaceholderTimer) {
      window.clearTimeout(this.cardLoadingPlaceholderTimer);
      this.cardLoadingPlaceholderTimer = null;
    }
    this.cardLoadingPlaceholderShownAt = 0;
  }
  this.previewMode = mode;
  this.landingGateActive = false;
  this.previewContainer?.removeClass('has-card-preview');

  // 作废在途的文章渲染（convertCurrent 的提交守卫读这两个值）。
  // 不作废的话：文章模式的渲染较慢，用户切到贴图/卡片后它才落地，
  // 会把新模式的预览覆盖回文章排版——表现为「模式选了，预览没变」。
  this.renderGeneration = (Number(this.renderGeneration) || 0) + 1;
  this.loadingGeneration = (Number(this.loadingGeneration) || 0) + 1;

  const loadingDelay = typeof options?.loadingDelay === 'number'
    ? options.loadingDelay
    : CARD_LOADING_DEBOUNCE_MS;

  if (mode === 'card') {
    if (this.previewContainer) {
      this.previewContainer.empty?.();
      this.previewContainer.addClass?.('has-card-preview');
    }
    if (loadingDelay <= 0) {
      renderCardLoadingPlaceholder(this.previewContainer);
      this.cardLoadingPlaceholderShownAt = Date.now();
      this.setPreviewLoading?.(true, '正在生成卡片预览...');
    } else {
      const generation = this.renderGeneration;
      this.cardLoadingPlaceholderTimer = window.setTimeout(() => {
        this.cardLoadingPlaceholderTimer = null;
        if (
          this.previewMode === 'card'
          && this.renderGeneration === generation
          && this.previewContainer
          && !this.previewContainer.querySelector?.('.icard-preview-shell')
        ) {
          renderCardLoadingPlaceholder(this.previewContainer);
          this.cardLoadingPlaceholderShownAt = Date.now();
          this.setPreviewLoading?.(true, '正在生成卡片预览...');
        }
      }, loadingDelay);
    }
  } else {
    this.setPreviewLoading?.(false);
  }

  this.syncPreviewModeUi();

  // 跨模式切换时收起悬浮面板：各模式设置内容不同，留在屏幕上会造成误解。
  this.closeTransientPanels();

  if (mode === 'sticker') {
    this.runModeRenderWithDiagnostics('贴图', this.renderStickerPreview(), 8000, 'sticker');
  } else if (mode === 'card') {
    this.runModeRenderWithDiagnostics('卡片', this.renderCardPreview(), 20000, 'card');
  } else {
    this.convertCurrent(true);
  }

  const headerEl = this.containerEl ? this.containerEl.querySelector('.apple-preview-header') : null;
  if (headerEl && this.containerEl) {
    const h = /** @type {HTMLElement} */ (headerEl).offsetHeight || 80;
    this.containerEl.style.setProperty('--apple-header-height', h + 'px');
  }
}
,

/**
 * 模式渲染的兜底观察器：贴图/卡片渲染是异步慢路径，抛错若无人接住就是
 * 「静默失败——模式选了、预览没变」。这里把两类异常变成可见症状：
 * ① promise 拒绝 → 预览区直接显示错误内容（同时 console.error 留全栈）；
 * ② 超时仍未落地 → 显示超时提示（识别「数据构建挂起」场景）。
 * 增加 expectedMode 与定时器句柄隔离，杜绝模式切走后的幽灵横幅污染。
 * @param {string} label 模式名（用于错误文案）
 * @param {unknown} renderPromise 模式渲染 promise
 * @param {number} timeoutMs 看门狗超时
 * @param {string} [expectedMode] 期待匹配的模式
 */
runModeRenderWithDiagnostics(label, renderPromise, timeoutMs, expectedMode) {
  const targetMode = expectedMode || this.previewMode;
  if (this._modeRenderTimer) {
    window.clearTimeout(this._modeRenderTimer);
    this._modeRenderTimer = null;
  }
  let settled = false;
  let timerId = null;

  timerId = window.setTimeout(() => {
    if (this._modeRenderTimer === timerId) {
      this._modeRenderTimer = null;
    }
    if (!settled && this.previewMode === targetMode && this.previewContainer) {
      console.error(`[wechat-converter] ${label}渲染超过 ${Math.round(timeoutMs / 1000)}s 未落地（可能在数据构建处挂起）`);
      this.showModeRenderFailure(label, new Error(`渲染超过 ${Math.round(timeoutMs / 1000)} 秒仍未完成，可能是数据构建卡住。请把开发者控制台里 [wechat-converter] 开头的输出发给开发者。`));
    }
  }, timeoutMs);
  this._modeRenderTimer = timerId;

  Promise.resolve(renderPromise)
    .catch((error) => {
      console.error(`[wechat-converter] ${label}渲染失败:`, error);
      if (!settled && this.previewMode === targetMode && this.previewContainer) {
        this.showModeRenderFailure(label, error instanceof Error ? error : new Error(String(error)));
      }
    })
    .finally(() => {
      settled = true;
      if (this._modeRenderTimer === timerId) {
        window.clearTimeout(timerId);
        this._modeRenderTimer = null;
      }
    });
}
,

/**
 * 在预览区渲染可见的错误面板（只读诊断，不影响导出链路）。
 * @param {string} label 模式名
 * @param {Error} error 渲染错误
 */
showModeRenderFailure(label, error) {
  this.setPreviewLoading?.(false);
  if (!this.previewContainer) return;
  this.previewContainer.empty();
  this.previewContainer.removeClass('has-card-preview');
  const failure = this.previewContainer.createEl('div', { cls: 'icard-preview-empty is-failure' });
  failure.createEl('div', {
    cls: 'icard-preview-empty-title',
    text: `${label}模式渲染失败`,
  });
  failure.createEl('div', {
    cls: 'icard-preview-empty-desc',
    text: error.message || String(error),
  });
  failure.createEl('div', {
    cls: 'icard-preview-empty-desc',
    text: '请打开开发者控制台（Ctrl/Cmd+Shift+I），把 [wechat-converter] 开头的红色输出发给开发者。',
  });
}
,

/**
 * 三模式操作按钮显隐的单一事实来源（B02 ①）。
 * article：全部可用；sticker：隐藏 AI/复制；card：仅显示禁用的卡片导出入口（B04/B05 接入前）。
 */
applyModeActionVisibility() {
  const mode = this.previewMode || 'article';
  /** @param {unknown} btn @param {boolean} visible */
  const setVisible = (btn, visible) => {
    if (btn && typeof btn === 'object' && 'classList' in /** @type {Element} */ (btn)) {
      const el = /** @type {HTMLElement} */ (btn);
      el.classList.toggle('hidden', !visible);
      if ('hidden' in el) {
        el.hidden = !visible;
      }
    }
  };
  setVisible(this.aiLayoutBtn, mode === 'article');
  setVisible(this.copyBtn, mode === 'article');
  // 卡片模式也显示设置入口（B03：打开卡片排版设置浮层），但 label 随模式切换
  setVisible(this.settingsBtn, true);
  this.updateSettingsButtonLabel();
  setVisible(this.cardExportBtn, mode === 'card');
  setVisible(this.publishBtn, mode !== 'card');
  if (typeof this.updateAiToolbarState === 'function') this.updateAiToolbarState();
}
,

/** 设置按钮 tooltip/aria-label 随模式切换（B03：卡片模式指向卡片排版设置） */
updateSettingsButtonLabel() {
  const btn = /** @type {unknown} */ (this.settingsBtn);
  if (!btn || typeof btn !== 'object' || !('setAttribute' in btn)) return;
  const label = this.previewMode === 'card' ? '图片卡片排版设置' : '公众号排版样式设置';
  const el = /** @type {Element} */ (btn);
  el.setAttribute('aria-label', label);
}
,
};
