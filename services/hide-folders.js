/**
 * 隐藏图片附件文件夹
 * 通过 CSS 注入在文件浏览器中隐藏匹配目录模式的文件夹
 */

/** 用于标识隐藏文件夹的 CSS 类名 */
const HIDDEN_FOLDER_CLASS = 'wechat-converter-hidden-folder';

/** 注入到 <head> 的 <style> 元素 ID */
const STYLE_ELEMENT_ID = 'wechat-converter-hide-folders-style';

/**
 * 转义正则特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 收集 vault 中所有匹配图片附件目录模式的文件夹路径
 * @param {object} app - Obsidian app 实例
 * @param {string} pattern - 路径模式，如 "${filename}_assets"
 * @returns {string[]} 匹配的文件夹路径列表
 */
function collectAssetFolderPaths(app, pattern) {
  const folders = app.vault.getAllLoadedFiles()
    .filter((f) => f.children !== undefined);

  const normalized = pattern
    .replace(/\$\{filename\}/g, '{{PLACEHOLDER}}')
    .replace(/\{\{note\}\}/g, '{{PLACEHOLDER}}');

  const parts = normalized.split('{{PLACEHOLDER}}');
  if (parts.length !== 2) {
    return folders
      .filter((f) => f.name === pattern)
      .map((f) => f.path);
  }

  const [prefix, suffix] = parts;
  const re = new RegExp(`^${escapeRegExp(prefix)}.+${escapeRegExp(suffix)}$`);
  return folders
    .filter((f) => re.test(f.name))
    .map((f) => f.path);
}

/**
 * 注入隐藏文件夹的 CSS 样式
 * @param {boolean} shouldHide - 是否隐藏
 */
function injectHideFolderStyle(shouldHide) {
  let styleEl = document.getElementById(STYLE_ELEMENT_ID);

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    document.head.appendChild(styleEl);
  }

  if (shouldHide) {
    styleEl.textContent = `
      .${HIDDEN_FOLDER_CLASS},
      .${HIDDEN_FOLDER_CLASS} ~ .nav-folder-children,
      .${HIDDEN_FOLDER_CLASS} ~ .tree-item-children {
        display: none !important;
      }
    `;
  } else {
    styleEl.textContent = '';
  }
}

/**
 * 给匹配的文件夹 DOM 元素添加/移除隐藏类
 * @param {string[]} folderPaths - 需要隐藏的文件夹路径列表
 * @param {boolean} shouldHide - true 添加隐藏类，false 移除
 */
function toggleFolderDomClass(folderPaths, shouldHide) {
  for (const path of folderPaths) {
    const escapedPath = CSS.escape(path);
    const selectors = [
      `.nav-folder-title[data-path="${escapedPath}"]`,
      `.tree-item-self[data-path="${escapedPath}"]`,
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (shouldHide) {
          el.classList.add(HIDDEN_FOLDER_CLASS);
        } else {
          el.classList.remove(HIDDEN_FOLDER_CLASS);
        }
      });
    }
  }
}

/**
 * 移除所有已添加的隐藏类
 */
function removeAllHiddenClasses() {
  document.querySelectorAll(`.${HIDDEN_FOLDER_CLASS}`).forEach((el) => {
    el.classList.remove(HIDDEN_FOLDER_CLASS);
  });
}

/**
 * 初始化隐藏图片文件夹功能
 * 在插件 onload 或设置变更时调用
 * @param {object} app - Obsidian app 实例
 * @param {{ hideImageFolders: boolean, imageAttachmentLocation: string }} settings
 */
function applyHideImageFolders(app, settings) {
  if (settings.hideImageFolders) {
    const folderPaths = collectAssetFolderPaths(app, settings.imageAttachmentLocation || '${filename}_assets');
    injectHideFolderStyle(true);
    toggleFolderDomClass(folderPaths, true);
  } else {
    injectHideFolderStyle(false);
    removeAllHiddenClasses();
  }
}

/**
 * 清理隐藏功能（插件卸载时调用）
 */
function cleanupHideImageFolders() {
  const styleEl = document.getElementById(STYLE_ELEMENT_ID);
  if (styleEl) styleEl.remove();
  removeAllHiddenClasses();
}

module.exports = {
  applyHideImageFolders,
  cleanupHideImageFolders,
};
