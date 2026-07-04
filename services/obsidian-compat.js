import { getActiveWindowValue } from './dom-utils.js';

/**
 * @param {string} specifier
 * @returns {unknown}
 */
export const loadCommonJsDependency = (specifier) => {
  if (typeof require === 'function') {
    const requireFn = /** @type {(specifier: string) => unknown} */ (require);
    return requireFn(specifier);
  }
  const activeWindowRequire = getActiveWindowValue('require');
  if (typeof activeWindowRequire === 'function') {
    const requireFn = /** @type {(specifier: string) => unknown} */ (activeWindowRequire);
    return requireFn(specifier);
  }
  throw new Error(`CommonJS loader unavailable for ${specifier}`);
};

/** @type {Record<string, unknown>} */
export const obsidianApi = /** @type {Record<string, unknown>} */ (loadCommonJsDependency('obsidian'));

export const Plugin = obsidianApi.Plugin;
export const MarkdownView = obsidianApi.MarkdownView;
export const ItemView = obsidianApi.ItemView;
export const Notice = obsidianApi.Notice;
export const Platform = obsidianApi.Platform;
export const PluginSettingTab = obsidianApi.PluginSettingTab;
export const Setting = obsidianApi.Setting;

export function getObsidianModalClass() {
  return obsidianApi.Modal;
}

/**
 * @param {unknown} app
 * @returns {unknown}
 */
export function createObsidianModal(app) {
  const ModalClass = getObsidianModalClass();
  if (typeof ModalClass !== 'function') {
    throw new Error('当前 Obsidian 版本不支持 Modal');
  }
  return new ModalClass(app);
}

export function getObsidianSetIcon() {
  return obsidianApi.setIcon;
}

export function getObsidianRequestUrl() {
  return obsidianApi.requestUrl;
}

export function getObsidianRequest() {
  return obsidianApi.request;
}
