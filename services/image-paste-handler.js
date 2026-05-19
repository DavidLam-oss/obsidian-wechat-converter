/**
 * 粘贴图片自动保存到指定目录
 * 参考 chararch/obsidian-enhanced-publisher 的图片粘贴功能
 */

const { Notice } = require('obsidian');
const { resolveSyncAccount } = require('./sync-context');

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
 * 将 vault 中的本地图片上传到微信 CDN
 * @param {object} plugin - AppleStylePlugin 实例
 * @param {object} WechatAPI - WechatAPI 类
 * @param {string} filePath - vault 内图片路径
 * @returns {Promise<string|null>} 微信 CDN URL，失败返回 null
 */
async function uploadLocalImageToWechat(plugin, WechatAPI, filePath) {
  const account = resolveSyncAccount({
    accounts: plugin.settings.wechatAccounts || [],
    selectedAccountId: '',
    defaultAccountId: plugin.settings.defaultAccountId,
  });
  if (!account) return null;

  const api = new WechatAPI(account.appId, account.appSecret, plugin.settings.proxyUrl);
  const abstractFile = plugin.app.vault.getAbstractFileByPath(filePath);
  if (!abstractFile) return null;

  const buffer = await plugin.app.vault.readBinary(abstractFile);
  const ext = filePath.split('.').pop().toLowerCase();
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
  const mimeType = mimeMap[ext] || 'image/png';
  const blob = new Blob([buffer], { type: mimeType });

  const result = await api.uploadImage(blob);
  return result.url || null;
}

/**
 * 解析编辑器光标所在行的图片引用
 * @param {object} editor - Obsidian Editor 实例
 * @returns {{ type: 'wiki-link'|'markdown', path: string, isLocal: boolean, lineStart: number, lineEnd: number, raw: string } | null}
 */
function resolveImageReferenceAtCursor(editor) {
  const cursor = editor.getCursor();
  const lineText = editor.getLine(cursor.line);

  // 匹配 wiki-link 图片：![[path]] 或 ![[path|alt]]
  const wikiMatch = lineText.match(/(!\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\])/);
  if (wikiMatch) {
    const raw = wikiMatch[1];
    const path = wikiMatch[2].trim();
    const isLocal = !path.startsWith('http://') && !path.startsWith('https://');
    return { type: 'wiki-link', path, isLocal, raw, line: cursor.line };
  }

  // 匹配标准 Markdown 图片：![alt](url)
  const mdMatch = lineText.match(/(!\[[^\]]*\]\(([^)]+)\))/);
  if (mdMatch) {
    const raw = mdMatch[1];
    const path = mdMatch[2].trim();
    const isLocal = !path.startsWith('http://') && !path.startsWith('https://');
    return { type: 'markdown', path, isLocal, raw, line: cursor.line };
  }

  return null;
}

/**
 * 粘贴事件主处理函数
 * @param {object} plugin - AppleStylePlugin 实例
 * @param {ClipboardEvent} evt - 粘贴事件
 * @param {object} editor - Obsidian Editor 实例
 * @param {object} view - MarkdownView 实例
 * @param {object} WechatAPI - WechatAPI 类（用于上传）
 */
async function handleImagePaste(plugin, evt, editor, view, WechatAPI) {
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

    // 检查是否需要上传到微信
    if (plugin.settings.uploadOnPaste) {
      // 先插入上传中占位符
      const placeholder = `![⏳ 图片上传中...]()`;
      const cursor = editor.getCursor();
      editor.replaceSelection(placeholder);

      try {
        const wxUrl = await uploadLocalImageToWechat(plugin, WechatAPI, filePath);
        if (wxUrl) {
          // 替换占位符为微信 URL
          editor.replaceRange(`![](${wxUrl})`, cursor, { line: cursor.line, ch: cursor.ch + placeholder.length });
          new Notice(`图片已上传微信并保存本地: ${fileName}`);
          return;
        }
      } catch (uploadError) {
        console.error('上传微信失败:', uploadError);
        new Notice(`上传微信失败: ${uploadError.message}，已保留本地副本`);
      }

      // 上传失败，替换占位符为本地引用
      editor.replaceRange(`![[${fileName}]]`, cursor, { line: cursor.line, ch: cursor.ch + placeholder.length });
      return;
    }

    // 未开启上传，插入本地引用
    editor.replaceSelection(`![[${fileName}]]`);
    new Notice(`图片已保存至: ${filePath}`);
  } catch (error) {
    console.error('保存粘贴图片失败:', error);
    new Notice(`保存图片失败: ${error.message}`);
  }
}

module.exports = {
  handleImagePaste,
  uploadLocalImageToWechat,
  resolveImageReferenceAtCursor,
  resolveImageSavePath,
  ensureVaultFolder,
  imageExtensionFromMime,
  generateImageFileName,
};
