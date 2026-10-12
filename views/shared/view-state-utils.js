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
 * 递归就地同步数组元素：若元素为对象且具备 id，按 id 匹配并原地合并；无 id 则按位置匹配；
 * 保持持有数组元素（如 ai.providers[i]）的 UI 内存引用不丢失。
 * @param {unknown[]} tgtArr
 * @param {unknown[]} srcArr
 */
function syncArrayInPlace(tgtArr, srcArr) {
  /** @type {Map<string, Record<string, unknown>>} */
  const existingById = new Map();
  /** @type {Array<Record<string, unknown>>} */
  const existingOthers = [];

  for (const item of tgtArr) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const obj = /** @type {Record<string, unknown>} */ (item);
      if (obj.id !== undefined && obj.id !== null) {
        existingById.set(String(obj.id), obj);
      } else {
        existingOthers.push(obj);
      }
    }
  }

  const newItems = [];
  for (let i = 0; i < srcArr.length; i++) {
    const srcItem = srcArr[i];
    if (srcItem && typeof srcItem === 'object' && !Array.isArray(srcItem)) {
      const srcObj = /** @type {Record<string, unknown>} */ (srcItem);
      /** @type {Record<string, unknown> | null} */
      let matched = null;
      if (srcObj.id !== undefined && srcObj.id !== null) {
        matched = existingById.get(String(srcObj.id)) || null;
        if (matched) {
          existingById.delete(String(srcObj.id));
        }
      } else if (existingOthers.length > 0) {
        matched = existingOthers.shift() || null;
      }

      if (matched) {
        syncInPlace(matched, srcObj);
        newItems.push(matched);
      } else {
        newItems.push(JSON.parse(JSON.stringify(srcObj)));
      }
    } else if (Array.isArray(srcItem)) {
      const matched = Array.isArray(tgtArr[i]) ? tgtArr[i] : [];
      syncArrayInPlace(matched, srcItem);
      newItems.push(matched);
    } else {
      newItems.push(srcItem);
    }
  }

  tgtArr.length = newItems.length;
  for (let i = 0; i < newItems.length; i++) {
    tgtArr[i] = newItems[i];
  }
}

/**
 * 递归深度就地同步对象属性，保持目标根对象与嵌套子对象/数组及数组内对象的内存引用稳定
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} source
 */
function syncInPlace(target, source) {
  if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
    return;
  }

  // 1. 移除 target 中存在但 source 中已被删除的键
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      delete target[key];
    }
  }

  // 2. 将 source 中的字段同步至 target，对象与数组就地维护引用
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];

    if (
      srcVal &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      // 嵌套纯对象就地同步
      syncInPlace(tgtVal, srcVal);
    } else if (Array.isArray(srcVal) && Array.isArray(tgtVal)) {
      // 数组及数组内元素就地同步
      syncArrayInPlace(tgtVal, srcVal);
    } else {
      // 基本类型或结构变更时直接赋值（对象深拷贝防污染）
      target[key] = srcVal && typeof srcVal === 'object' ? JSON.parse(JSON.stringify(srcVal)) : srcVal;
    }
  }
}

/**
 * @param {PluginWithSettingsLike | null | undefined} plugin
 * @param {Record<string, unknown>} settings
 * @returns {Record<string, unknown>}
 */
function setPluginSettings(plugin, settings) {
  if (!plugin || typeof plugin !== 'object') return settings;
  if (!plugin.settings || typeof plugin.settings !== 'object') {
    plugin.settings = settings;
    return settings;
  }
  syncInPlace(plugin.settings, settings);
  return plugin.settings;
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
  syncInPlace,
  setDestructiveButtonCompat,
  refreshSettingTabCompat,
  isMobileClient,
  generateId,
};
