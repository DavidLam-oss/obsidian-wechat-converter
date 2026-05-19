/**
 * 粘贴图片自动保存到指定目录
 * 参考 chararch/obsidian-enhanced-publisher 的图片粘贴功能
 */

const { Notice } = require('obsidian');

/** MIME 类型 → 文件扩展名映射 */
const IMAGE_TYPE_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

/**
 * 根据路径模式和当前文件计算图片保存目录
 * 支持 ${filename} 和 {{note}} 占位符
 * 以 / 开头视为 vault 根目录的绝对路径，否则相对于文档所在目录
 * @param {string} pattern - 路径模式，如 "${filename}_assets"
 * @param {{ basename: string, parent: { path: string } | null }} file - 当前文件信息
 * @returns {string} vault 内相对目录路径
 */
function resolveImageSavePath(pattern, file) {
  const parentPath = file.parent ? file.parent.path : '/';
  const basename = file.basename;

  // 同时支持 ${filename} 和 {{note}} 占位符
  let resolved = pattern.replace(/\$\{filename\}/g, basename).replace(/\{\{note\}\}/g, basename);

  // 绝对路径（以 / 开头）
  if (resolved.startsWith('/')) {
    return resolved.substring(1);
  }

  // 相对路径：拼接到文档所在目录
  if (parentPath === '/' || parentPath === '') {
    return resolved;
  }
  return `${parentPath}/${resolved}`;
}

/**
 * 确保 vault 目录存在，支持多级嵌套
 * @param {object} app - Obsidian app 实例
 * @param {string} folderPath - vault 内相对路径
 */
async function ensureVaultFolder(app, folderPath) {
  const existing = app.vault.getAbstractFileByPath(folderPath);
  if (existing) return;

  // 逐级创建嵌套目录
  const parts = folderPath.split('/');
  let currentPath = '';
  for (const part of parts) {
    currentPath += (currentPath ? '/' : '') + part;
    const folder = app.vault.getAbstractFileByPath(currentPath);
    if (!folder) {
      await app.vault.createFolder(currentPath);
    }
  }
}

/**
 * MIME 类型转文件扩展名
 * @param {string} mimeType - 如 "image/png"
 * @returns {string} 扩展名，未知类型默认 "png"
 */
function imageExtensionFromMime(mimeType) {
  return IMAGE_TYPE_MAP[mimeType] || 'png';
}

/**
 * 基于时间戳生成唯一图片文件名
 * @param {string} extension - 文件扩展名
 * @returns {string} 如 "image-20260519T101530123.png"
 */
function generateImageFileName(extension) {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').replace('T', '').slice(0, 17);
  return `image-${ts}.${extension}`;
}

/**
 * 粘贴事件主处理函数
 * @param {object} plugin - AppleStylePlugin 实例
 * @param {ClipboardEvent} evt - 粘贴事件
 * @param {object} editor - Obsidian Editor 实例
 * @param {object} view - MarkdownView 实例
 */
async function handleImagePaste(plugin, evt, editor, view) {
  // 检查功能开关
  if (!plugin.settings.autoSaveImages) return;

  // 检查剪贴板是否有文件
  const files = evt.clipboardData?.files;
  if (!files || files.length === 0) return;

  const file = files[0];

  // 检查是否为图片
  if (!file.type.startsWith('image/')) return;

  // 阻止默认粘贴行为
  evt.preventDefault();

  // 获取当前编辑文件
  const activeFile = view?.file;
  if (!activeFile) {
    new Notice('无法确定当前文件');
    return;
  }

  try {
    // 计算图片保存目录
    const pattern = plugin.settings.imageAttachmentLocation || '${filename}_assets';
    const saveDir = resolveImageSavePath(pattern, activeFile);

    // 确保目录存在
    await ensureVaultFolder(plugin.app, saveDir);

    // 生成文件名并保存
    const ext = imageExtensionFromMime(file.type);
    const fileName = generateImageFileName(ext);
    const filePath = `${saveDir}/${fileName}`;

    const buffer = await file.arrayBuffer();
    await plugin.app.vault.createBinary(filePath, buffer);

    // 在编辑器光标位置插入 wiki-link 格式的图片引用
    editor.replaceSelection(`![[${fileName}]]`);

    new Notice(`图片已保存至: ${filePath}`);
  } catch (error) {
    console.error('保存粘贴图片失败:', error);
    new Notice(`保存图片失败: ${error.message}`);
  }
}

/** 用于标识隐藏文件夹的 CSS 类名 */
const HIDDEN_FOLDER_CLASS = 'wechat-converter-hidden-folder';

/** 注入到 <head> 的 <style> 元素 ID */
const STYLE_ELEMENT_ID = 'wechat-converter-hide-folders-style';

/**
 * 收集 vault 中所有匹配图片附件目录模式的文件夹路径
 * @param {object} app - Obsidian app 实例
 * @param {string} pattern - 路径模式，如 "${filename}_assets"
 * @returns {string[]} 匹配的文件夹路径列表
 */
function collectAssetFolderPaths(app, pattern) {
  const folders = app.vault.getAllLoadedFiles()
    .filter((f) => f.children !== undefined);

  // 将模式转为正则：${filename} 或 {{note}} 替换为通用匹配
  const normalized = pattern
    .replace(/\$\{filename\}/g, '{{PLACEHOLDER}}')
    .replace(/\{\{note\}\}/g, '{{PLACEHOLDER}}');

  const parts = normalized.split('{{PLACEHOLDER}}');
  if (parts.length !== 2) {
    // 不含占位符，直接按固定名称匹配
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
 * 转义正则特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  handleImagePaste,
  resolveImageSavePath,
  ensureVaultFolder,
  imageExtensionFromMime,
  generateImageFileName,
  applyHideImageFolders,
  cleanupHideImageFolders,
};
