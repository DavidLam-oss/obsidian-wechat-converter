/*
## 核心功能

实现发布弹窗中的 wechat preview export 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `wechatPreviewExportMethods`，用于微信、飞书或多平台发布流程的 UI 编排。

## 定位

位于 views/publish-modal/，负责发布弹窗 UI 层；API 调用委托 services/。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  extractImageRefsFromHtml,
  extractRenderedSectionFragments,
  renderArticleLayoutHtml,
  setElementHtml,
  Notice,
  getActiveDocumentCompat,
  OBSIDIAN_PUBLISHER_PRO_URL,
  OBSIDIAN_PUBLISHER_GUIDE_URL,
  OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL,
  OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL,
} from '../apple-style-view-shared.js';

/** @type {WechatPreviewExportMethodsContract & ThisType<AppleStyleViewContract>} */
const wechatPreviewExportMethods = {
/**
 * @param {{ target?: 'wechat-copy'|'wechat-draft'|'multi-platform' }} [options]
 */
resolveArticleHtmlSource(options = {}) {
  const { target } = options;
  const resolvedTarget = target || 'wechat-copy';
  if (!['wechat-copy', 'wechat-draft', 'multi-platform'].includes(resolvedTarget)) {
    return null;
  }
  if (!this.aiPreviewApplied) {
    if (!this.baseRenderedHtml) return null;
    return {
      html: this.baseRenderedHtml,
      layoutMode: 'native',
      sourceKind: 'base',
    };
  }

  const context = this.getCurrentLayoutContext();
  const state = this.getCurrentArticleLayoutState();
  const visibleSnapshot = this.getVisibleAiLayoutSnapshot(state);
  if (!state || !visibleSnapshot.layoutJson?.blocks?.length) {
    return null;
  }
  if (context.sourceHash && state.sourceHash && context.sourceHash !== state.sourceHash) {
    return null;
  }

  const imageRefs = extractImageRefsFromHtml(this.baseRenderedHtml || '');
  const renderedSectionFragments = extractRenderedSectionFragments(this.baseRenderedHtml || '');
  const renderLayout = this.getAiRenderLayoutJson(visibleSnapshot.layoutJson);
  const html = renderArticleLayoutHtml(renderLayout, {
    imageRefs,
    mode: 'draft',
    renderedSectionFragments,
    colorPaletteOverride: this.getAiColorPaletteOverride(renderLayout?.resolved?.colorPalette || renderLayout?.stylePack),
  });
  if (!html) return null;
  return {
    html,
    layoutMode: 'ai',
    sourceKind: 'ai-export',
  };
}
,

getCurrentExportHtml() {
  return this.resolveArticleHtmlSource({ target: 'wechat-copy' })?.html || null;
}
,

async restoreBasePreview() {
  if (!this.baseRenderedHtml || !this.previewContainer) return;
  const scrollTop = this.previewContainer.scrollTop;
  try {
    const html = await this.deriveNativePreviewHtml(this.baseRenderedHtml);
    this.currentHtml = html;
    this.aiPreviewApplied = false;
    setElementHtml(this.previewContainer, html);
    this.previewContainer.scrollTop = scrollTop;
    this.previewContainer.addClass('apple-has-content');
    this.syncPreviewPresentationMode();
    this.refreshAiLayoutPanel();
  } catch (error) {
    console.warn('恢复普通预览失败，已回退基础主题:', error);
    this.currentHtml = this.baseRenderedHtml;
    this.aiPreviewApplied = false;
    setElementHtml(this.previewContainer, this.baseRenderedHtml);
    this.previewContainer.scrollTop = scrollTop;
    this.previewContainer.addClass('apple-has-content');
    this.syncPreviewPresentationMode();
    this.refreshAiLayoutPanel();
    new Notice('恢复普通预览时未能应用自定义 CSS，已显示基础主题。');
  }
}
,

syncPreviewPresentationMode() {
  if (!this.previewContainer) return;
  const hasAiPreview = this.aiPreviewApplied === true;
  this.previewContainer.classList.toggle('apple-ai-preview-active', hasAiPreview);
  const previewWrapper = this.previewContainer.closest('.apple-preview-wrapper');
  previewWrapper?.classList.toggle('apple-ai-preview-active', hasAiPreview);
}
,

openPluginSettings() {
  const settingApi = this.app?.setting;
  if (!settingApi || typeof settingApi.open !== 'function') return false;

  settingApi.open();
  const tabId = this.plugin?.manifest?.id || 'wechat-converter';
  if (typeof settingApi.openTabById === 'function') {
    settingApi.openTabById(tabId);
  }
  return true;
}
,

openExternalUrl(url, options = {}) {
  const target = String(url || '').trim();
  const allowExtensionUrls = options?.allowExtensionUrls === true;
  const isHttpUrl = /^https?:\/\//i.test(target);
  const isExtensionUrl = /^(chrome|edge|brave|moz)-extension:\/\//i.test(target);
  if (!isHttpUrl && !(allowExtensionUrls && isExtensionUrl)) {
    new Notice('草稿链接不可用');
    return false;
  }

  if (typeof window !== 'undefined') {
    try {
      const activeDoc = getActiveDocumentCompat();
      if (!activeDoc) return false;
      const a = activeDoc.createElement('a');
      a.href = target;
      a.target = '_blank';
      a.click();
      return true;
    } catch {
      if (typeof window.open === 'function') {
        window.open(target, '_blank', 'noopener');
        return true;
      }
    }
  }

  new Notice('无法打开草稿链接，请在浏览器插件中查看同步结果');
  return false;
}
,

openPublisherProPage() {
  return this.openExternalUrl(OBSIDIAN_PUBLISHER_PRO_URL);
}
,

openPublisherGuidePage(section = '') {
  if (section === 'bridge') {
    return this.openExternalUrl(OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL);
  }
  if (section === 'install-extension') {
    return this.openExternalUrl(OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL);
  }
  return this.openExternalUrl(OBSIDIAN_PUBLISHER_GUIDE_URL);
}
};

export { wechatPreviewExportMethods };
