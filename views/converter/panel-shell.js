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
  removeElementClass,
} from '../apple-style-view-shared.js';

/** @type {PanelShellMethodsContract & ThisType<AppleStyleViewContract>} */
export const panelShellMethods = {
resetSettingsPanelViewState() {
  const advancedOptions = this.settingsAdvancedOptions || this.settingsOverlay?.querySelector('.apple-settings-details');
  if (advancedOptions) advancedOptions.open = false;
  if (this.settingsSpacingGroup) this.settingsSpacingGroup.open = false;

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
    const target = event.target instanceof HTMLElement ? event.target : null;
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


toggleSettingsPanel() {
  const artWrapper = /** @type {unknown} */ (this.articleSettingsWrapper);
  const stkWrapper = /** @type {unknown} */ (this.stickerSettingsWrapper);

  if (this.previewMode === 'sticker') {
    if (artWrapper && typeof artWrapper === 'object' && 'classList' in artWrapper) {
      /** @type {Element} */ (artWrapper).classList.add('hidden');
    }
    if (stkWrapper && typeof stkWrapper === 'object' && 'classList' in stkWrapper) {
      /** @type {Element} */ (stkWrapper).classList.remove('hidden');
    }
    const toggleState = toRecord(this.stickerIndexToggleState);
    const checkbox = toggleState ? toRecord(toggleState.checkbox) : null;
    if (checkbox && typeof checkbox.checked === 'boolean') {
      checkbox.checked = Boolean(this.insertStickerImageIndex);
    }
  } else {
    if (stkWrapper && typeof stkWrapper === 'object' && 'classList' in stkWrapper) {
      /** @type {Element} */ (stkWrapper).classList.add('hidden');
    }
    if (artWrapper && typeof artWrapper === 'object' && 'classList' in artWrapper) {
      /** @type {Element} */ (artWrapper).classList.remove('hidden');
    }
  }

  this.togglePanel(this.settingsOverlay, this.settingsBtn, () => this.resetSettingsPanelViewState());
}
,

switchPreviewMode(mode) {
  if (this.previewMode === mode) return;
  this.previewMode = mode;

  const articleBtn = /** @type {unknown} */ (this.btnArticleMode);
  const stickerBtn = /** @type {unknown} */ (this.btnStickerMode);

  if (articleBtn && stickerBtn) {
    const aEl = /** @type {Element} */ (articleBtn);
    const sEl = /** @type {Element} */ (stickerBtn);
    if (mode === 'article') {
      aEl.classList.add('active');
      sEl.classList.remove('active');
    } else {
      sEl.classList.add('active');
      aEl.classList.remove('active');
    }
  }

  // 跨模式切换时收起悬浮面板：文章设置与贴图设置内容不同，留在屏幕上会造成误解。
  this.closeTransientPanels();

  if (mode === 'sticker') {
    if (this.aiLayoutBtn && typeof this.aiLayoutBtn.classList === 'object') this.aiLayoutBtn.classList.add('hidden');
    if (this.copyBtn && typeof this.copyBtn.classList === 'object') this.copyBtn.classList.add('hidden');
    this.renderStickerPreview();
  } else {
    if (this.aiLayoutBtn && typeof this.aiLayoutBtn.classList === 'object') this.aiLayoutBtn.classList.remove('hidden');
    if (this.copyBtn && typeof this.copyBtn.classList === 'object') this.copyBtn.classList.remove('hidden');
    this.convertCurrent(true);
  }

  const headerEl = this.containerEl ? this.containerEl.querySelector('.apple-preview-header') : null;
  if (headerEl && this.containerEl) {
    const h = /** @type {HTMLElement} */ (headerEl).offsetHeight || 80;
    this.containerEl.style.setProperty('--apple-header-height', h + 'px');
  }
}
,
};
