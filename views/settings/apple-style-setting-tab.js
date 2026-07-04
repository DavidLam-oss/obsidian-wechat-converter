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
}

Object.assign(
  AppleStyleSettingTab.prototype,
  confirmModalMethods,
  settingsTabShellMethods,
  wechatSettingsMethods,
  aiSettingsMethods,
  wechatAccountModalMethods,
);

AppleStyleSettingTab.prototype[LEGACY_SETTING_RENDER_KEY] = function legacySettingsFallback() {
  this.renderSettingsContent();
};

export { AppleStyleSettingTab };
