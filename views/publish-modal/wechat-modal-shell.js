/*
## 核心功能

实现发布弹窗中的 wechat modal shell 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `wechatModalShellMethods`，用于微信、飞书或多平台发布流程的 UI 编排。

## 定位

位于 views/publish-modal/，负责发布弹窗 UI 层；API 调用委托 services/。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  MULTI_PLATFORM_TAB_LABEL,
} from '../apple-style-view-shared.js';

/** @type {WechatModalShellMethodsContract & ThisType<AppleStyleViewContract>} */
const wechatModalShellMethods = {
preparePublishModalShell(modal, { mode = 'wechat', mobileSync = false } = {}) {
  // 每次切换发布页签都会让上一个贴图异步刷新失效，避免旧数据写回新页面。
  this.stickerModalGeneration = (this.stickerModalGeneration || 0) + 1;
  modal.titleEl.setText('发布与分发');
  modal.titleEl.removeClass?.('wechat-multiplatform-title');
  if (typeof modal.contentEl.empty === 'function') {
    modal.contentEl.empty();
  } else {
    modal.contentEl.replaceChildren?.();
  }
  modal.contentEl.addClass('wechat-sync-modal');
  modal.contentEl.removeClass?.('wechat-multiplatform-modal');
  modal.contentEl.removeClass?.('wechat-multiplatform-result-modal');
  modal.contentEl.removeClass?.('wechat-feishu-modal-content');
  modal.modalEl?.addClass('wechat-publish-shell');
  modal.modalEl?.removeClass?.('wechat-multiplatform-shell');
  if (mobileSync) {
    modal.contentEl.addClass('wechat-sync-modal-mobile');
    modal.modalEl?.addClass('wechat-sync-shell-mobile');
  }
  if (mode === 'multi') {
    modal.titleEl.addClass?.('wechat-multiplatform-title');
    modal.contentEl.addClass('wechat-multiplatform-modal');
    modal.modalEl?.addClass('wechat-multiplatform-shell');
  }
}
,

createPublishModeTabs(modal, activeMode = 'wechat') {
  const publishModeTabs = modal.contentEl.createDiv({ cls: 'wechat-publish-mode-tabs' });
  const wechatTab = publishModeTabs.createEl('button', {
    text: '微信草稿箱',
    cls: `wechat-publish-mode-tab${activeMode === 'wechat' ? ' is-active' : ''}`,
  });

  const multiPlatformTab = publishModeTabs.createEl('button', {
    cls: `wechat-publish-mode-tab${activeMode === 'multi' ? ' is-active' : ''}`,
  });
  multiPlatformTab.createEl('span', { text: MULTI_PLATFORM_TAB_LABEL });

  const feishuTab = publishModeTabs.createEl('button', {
    text: '飞书云文档',
    cls: `wechat-publish-mode-tab${activeMode === 'feishu' ? ' is-active' : ''}`,
  });

  return { wechatTab, feishuTab, multiPlatformTab };
}
};

export { wechatModalShellMethods };
