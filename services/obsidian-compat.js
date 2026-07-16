/*
## 核心功能

提供服务层通用能力：obsidian compat。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `loadCommonJsDependency`、`obsidianApi`、`Plugin`、`MarkdownView`、`ItemView`、`Notice`、`Platform`、`PluginSettingTab`、`Setting`、`getObsidianModalClass`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

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

/** @type {typeof import('obsidian')} */
export const obsidianApi = /** @type {typeof import('obsidian')} */ (loadCommonJsDependency('obsidian'));

export const Plugin = obsidianApi.Plugin;
export const MarkdownView = obsidianApi.MarkdownView;
export const ItemView = obsidianApi.ItemView;
export const Notice = obsidianApi.Notice;
export const Platform = obsidianApi.Platform;
export const PluginSettingTab = obsidianApi.PluginSettingTab;
export const Setting = obsidianApi.Setting;

/** @returns {typeof import('obsidian').Modal} */
export function getObsidianModalClass() {
  return obsidianApi.Modal;
}

/**
 * @param {unknown} app
 * @returns {import('obsidian').Modal}
 */
export function createObsidianModal(app) {
  const ModalClass = getObsidianModalClass();
  if (typeof ModalClass !== 'function') {
    throw new Error('当前 Obsidian 版本不支持 Modal');
  }
  return new ModalClass(/** @type {import('obsidian').App} */ (app));
}

/** @returns {typeof import('obsidian').setIcon} */
export function getObsidianSetIcon() {
  return obsidianApi.setIcon;
}

/** @returns {typeof import('obsidian').requestUrl} */
export function getObsidianRequestUrl() {
  return obsidianApi.requestUrl;
}

/** @returns {typeof import('obsidian').request} */
export function getObsidianRequest() {
  return obsidianApi.request;
}
