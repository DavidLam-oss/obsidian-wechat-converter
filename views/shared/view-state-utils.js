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
