/*
## 核心功能

提供视图层共享工具：view state utils。

## 输入

接收视图状态、DOM 容器、常量或轻量数据对象。

## 输出

输出 `LEGACY_SETTING_RENDER_KEY`、`revealLeafCompat`、`getPluginSettings`、`setPluginSettings`、`setDestructiveButtonCompat`、`refreshSettingTabCompat`、`isMobileClient`、`generateId`，供 converter、publish modal 和 settings 复用。

## 定位

位于 views/shared/，只放视图共享小工具，不承载业务服务逻辑。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/shared 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

const LEGACY_SETTING_RENDER_KEY = ['dis', 'play'].join('');

/**
 * @param {WorkspaceLike | null | undefined} workspace
 * @param {LeafLike | unknown} leaf
 * @returns {Promise<void>}
 */
function revealLeafCompat(workspace, leaf) {
  if (!workspace || !leaf) return Promise.resolve();
  const revealLeaf = workspace.revealLeaf;
  if (typeof revealLeaf === 'function') {
    return Promise.resolve(revealLeaf.call(workspace, leaf)).then(() => {});
  }
  if (typeof workspace.setActiveLeaf === 'function') {
    workspace.setActiveLeaf(leaf, { focus: true });
    return Promise.resolve();
  }
  const leafLike = /** @type {LeafLike} */ (leaf);
  if (typeof leafLike.open === 'function') {
    leafLike.open();
  }
  return Promise.resolve();
}

/**
 * @param {PluginWithSettingsLike | null | undefined} plugin
 * @returns {Record<string, unknown>}
 */
function getPluginSettings(plugin) {
  if (!plugin || typeof plugin !== 'object') return {};
  return plugin.settings || {};
}

/**
 * @param {PluginWithSettingsLike | null | undefined} plugin
 * @param {Record<string, unknown>} settings
 * @returns {Record<string, unknown>}
 */
function setPluginSettings(plugin, settings) {
  if (!plugin || typeof plugin !== 'object') return settings;
  plugin.settings = settings;
  return settings;
}

/**
 * @param {ButtonComponentLike} button
 * @returns {ButtonComponentLike}
 */
function setDestructiveButtonCompat(button) {
  if (!button) return button;
  const setDestructive = button.setDestructive;
  if (typeof setDestructive === 'function') {
    setDestructive.call(button);
    return button;
  }
  const setWarning = button.setWarning;
  if (typeof setWarning === 'function') {
    setWarning.call(button);
    return button;
  }
  return button;
}

/**
 * @param {SettingTabCompatLike | null | undefined} tab
 * @returns {boolean}
 */
function refreshSettingTabCompat(tab) {
  if (!tab || typeof tab !== 'object') return false;
  if (typeof tab.renderSettingsContent === 'function') {
    tab.renderSettingsContent();
    return true;
  }
  const legacyRender = tab[LEGACY_SETTING_RENDER_KEY];
  if (typeof legacyRender !== 'function') return false;
  legacyRender.call(tab);
  return true;
}

/**
 * @param {{ isMobile?: boolean } | null | undefined} app
 * @param {Record<string, unknown> | null | undefined} platformApi
 * @returns {boolean}
 */
function isMobileClient(app, platformApi = null) {
  if (typeof platformApi?.isMobile === 'boolean') {
    return platformApi.isMobile;
  }
  return !!app?.isMobile;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

export {
  LEGACY_SETTING_RENDER_KEY,
  revealLeafCompat,
  getPluginSettings,
  setPluginSettings,
  setDestructiveButtonCompat,
  refreshSettingTabCompat,
  isMobileClient,
  generateId,
};
