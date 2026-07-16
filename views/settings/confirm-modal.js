/*
## 核心功能

实现插件设置页中的 confirm modal 配置界面能力。

## 输入

接收插件设置、SettingTab 生命周期、用户表单输入和账号/平台配置状态。

## 输出

输出 `confirmModalMethods`，用于渲染设置项、保存配置或打开辅助 modal。

## 定位

位于 views/settings/，负责设置 UI 层；设置归一化交给 services/plugin-settings.js。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/settings 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  createObsidianModal,
} from '../apple-style-view-shared.js';

/** @type {ConfirmModalMethodsContract & ThisType<AppleStyleSettingTabContract>} */
const confirmModalMethods = {
  /**
   * @param {{ title?: string, message?: string, confirmText?: string, cancelText?: string }} options
   * @returns {Promise<boolean>}
   */
  confirmDestructiveAction({ title, message, confirmText = '确认', cancelText = '取消' }) {
    return new Promise((resolve) => {
      const modal = createObsidianModal(this.app);
      let settled = false;
      /** @param {boolean} value */
      const settle = (value) => {
        if (settled) return;
        settled = true;
        modal.close();
        resolve(value);
      };

      modal.titleEl.setText(title || '确认操作');
      const body = modal.contentEl.createDiv({ cls: 'wechat-confirm-modal' });
      body.createEl('p', { text: message || '确定要继续吗？' });
      const actions = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });
      actions.createEl('button', { text: cancelText }).onclick = () => settle(false);
      const confirmBtn = actions.createEl('button', { text: confirmText, cls: 'mod-warning' });
      confirmBtn.onclick = () => settle(true);
      const originalOnClose = typeof modal.onClose === 'function'
        ? /** @type {() => void} */ (modal.onClose.bind(modal))
        : null;
      modal.onClose = () => {
        if (originalOnClose) originalOnClose();
        if (!settled) {
          settled = true;
          resolve(false);
        }
      };
      modal.open();
    });
  }
};

export { confirmModalMethods };
