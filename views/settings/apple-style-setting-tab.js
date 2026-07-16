/*
## 核心功能

实现插件设置页中的 apple style setting tab 配置界面能力。

## 输入

接收插件设置、SettingTab 生命周期、用户表单输入和账号/平台配置状态。

## 输出

输出 `AppleStyleSettingTab`，用于渲染设置项、保存配置或打开辅助 modal。

## 定位

位于 views/settings/，负责设置 UI 层；设置归一化交给 services/plugin-settings.js。

## 依赖

关键依赖：`../apple-style-view-shared.js`、`./settings-tab-shell.js`、`./wechat-tab.js`、`./ai-section.js`、`./wechat-account-modal.js`、`./confirm-modal.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/settings 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  PluginSettingTab,
  LEGACY_SETTING_RENDER_KEY,
  normalizeVaultPath,
  isAbsolutePathLike,
} from '../apple-style-view-shared.js';
import { settingsTabShellMethods } from './settings-tab-shell.js';
import { wechatSettingsMethods } from './wechat-tab.js';
import { aiSettingsMethods } from './ai-section.js';
import { wechatAccountModalMethods } from './wechat-account-modal.js';
import { confirmModalMethods } from './confirm-modal.js';

class AppleStyleSettingTab extends PluginSettingTab {
  /**
   * @param {AppLike} app
   * @param {AppleStylePluginLike} plugin
   */
  constructor(app, plugin) {
    super(app, plugin);
    /** @type {AppleStylePluginLike} */
    this.plugin = plugin;
  }

  /**
   * @param {string} vaultPath
   * @returns {string}
   */
  normalizeVaultPath(vaultPath) {
    return normalizeVaultPath(vaultPath);
  }

  /**
   * @param {string} vaultPath
   * @returns {boolean}
   */
  isAbsolutePathLike(vaultPath) {
    return isAbsolutePathLike(vaultPath);
  }

  refreshOpenConverterAiState() {
    const view = /** @type {ConverterViewRefreshLike | null} */ (this.plugin.getConverterView?.() || null);
    if (view && typeof view.updateAiToolbarState === 'function') {
      view.updateAiToolbarState();
    }
    if (view && typeof view.refreshAiLayoutPanel === 'function') {
      view.refreshAiLayoutPanel();
    }
  }

  display() {
    const renderSettingsContent = /** @type {() => void} */ (settingsTabShellMethods.renderSettingsContent);
    renderSettingsContent.call(this);
  }

  /** @returns {SettingDefinitionRenderLike[]} */
  getSettingDefinitions() {
    return [{
      name: 'Wechat Converter',
      desc: '微信发布助手设置',
      searchable: false,
      render: () => this.display(),
    }];
  }
}

Object.assign(
  AppleStyleSettingTab.prototype,
  confirmModalMethods,
  settingsTabShellMethods,
  wechatSettingsMethods,
  aiSettingsMethods,
  wechatAccountModalMethods,
);

/** @this {AppleStyleSettingTabContract} */
AppleStyleSettingTab.prototype[LEGACY_SETTING_RENDER_KEY] = function legacySettingsFallback() {
  this.renderSettingsContent();
};

export { AppleStyleSettingTab };
