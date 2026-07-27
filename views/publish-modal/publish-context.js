/*
## 核心功能

实现发布账号、当前文件、frontmatter 元数据和发布后清理的视图适配能力。

## 输入

接收 AppleStyleView 的 app、plugin settings、当前 HTML 和活动文件状态。

## 输出

输出 `publishContextMethods`，保持发布弹窗和同步服务使用的既有方法契约。

## 定位

位于 views/publish-modal/，只负责发布上下文适配；目录安全与清理规则委托 services/publish-cleanup.js。

## 依赖

关键依赖：`../apple-style-view-shared.js`、`../../services/publish-cleanup.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持 AppleStyleView 对外方法签名不变，不在视图层复制清理规则。
*/

import {
  createHtmlContainer,
  getEventTargetValue,
  toRecord,
} from '../apple-style-view-shared.js';
import { normalizeVaultPath } from '../../services/path-utils.js';
import {
  cleanupConfiguredDirectory,
  clearInvalidPublishMetaAfterCleanup,
  clearInvalidPublishMetaByTextFallback,
  clearInvalidPublishMetaInFrontmatter,
  getFrontmatterKeyMap,
  isPathInsideDirectory,
  isPathInsideDirectoryByTail,
  isSafeCleanupDirPath,
  normalizeFrontmatterKey,
  resolveCleanupDirPath,
  shouldClearFrontmatterPathAfterCleanup,
} from '../../services/publish-cleanup.js';

/** @type {PublishContextMethodsContract & ThisType<AppleStyleViewContract>} */
export const publishContextMethods = {
createAccountSelector(parent) {
  /** @type {WechatAccountLike[]} */
  const accounts = this.plugin.settings.wechatAccounts || [];
  if (accounts.length === 0) return;

  const section = parent.createEl('div', { cls: 'apple-setting-section wechat-account-selector' });
  section.createEl('label', { cls: 'apple-setting-label', text: '同步账号' });
  const select = /** @type {ObsidianInputLike} */ (section.createEl('select', { cls: 'wechat-account-select' }));
  const defaultId = this.plugin.settings.defaultAccountId;

  for (const account of accounts) {
    const option = /** @type {ObsidianInputLike} */ (select.createEl('option', {
      value: account.id,
      text: account.id === defaultId ? `${account.name} (默认)` : account.name
    }));
    if (account.id === defaultId) option.selected = true;
  }

  this.selectedAccountId = defaultId;
  select.addEventListener('change', (event) => {
    this.selectedAccountId = getEventTargetValue(event, defaultId);
  });
},

getFirstImageFromArticle() {
  if (!this.currentHtml) return null;
  const tempDiv = createHtmlContainer('div', this.currentHtml);
  const imgs = Array.from(tempDiv.querySelectorAll('img'));
  for (const img of imgs) {
    if (img.alt === 'logo') continue;
    const src = String(img.getAttribute('src') || img.src || '').trim();
    if (src) return src;
  }
  return null;
},

getPublishContextFile() {
  return this.app?.workspace?.getActiveFile?.() || this.lastActiveFile || null;
},

getFrontmatterPublishMeta(activeFile) {
  if (!activeFile) {
    return { excerpt: '', cover: '', cover_dir: '', coverSrc: null, title: '' };
  }

  const frontmatter = this.app?.metadataCache?.getFileCache?.(activeFile)?.frontmatter;
  const excerpt = this.getFrontmatterString(frontmatter, ['excerpt']);
  const cover = this.getFrontmatterString(frontmatter, ['cover']);
  const cover_dir = this.getFrontmatterString(
    frontmatter,
    ['cover_dir', 'coverDir', 'cover-dir', 'coverdir', 'CoverDIR']
  );
  const title = this.getFrontmatterString(frontmatter, ['title']);
  const coverSrc = cover ? this.resolveVaultPathToResourceSrc(cover) : null;
  return { excerpt, cover, cover_dir, coverSrc, title };
},

getFrontmatterString(frontmatter, keys) {
  const frontmatterRecord = toRecord(frontmatter);
  if (!frontmatterRecord || !Array.isArray(keys) || keys.length === 0) return '';

  const normalizedTargets = new Set(keys.map(normalizeFrontmatterKey));
  for (const key of keys) {
    const value = frontmatterRecord[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const [key, value] of Object.entries(frontmatterRecord)) {
    if (!normalizedTargets.has(normalizeFrontmatterKey(key))) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
},

normalizeFrontmatterKey,
getFrontmatterKeyMap,
isPathInsideDirectory,
isPathInsideDirectoryByTail,
shouldClearFrontmatterPathAfterCleanup,
clearInvalidPublishMetaInFrontmatter,

clearInvalidPublishMetaByTextFallback(activeFile, cleanedDir) {
  return clearInvalidPublishMetaByTextFallback({
    vault: this.app?.vault,
    activeFile,
    cleanedDir,
  });
},

clearInvalidPublishMetaAfterCleanup(activeFile, cleanedDirPath) {
  return clearInvalidPublishMetaAfterCleanup({
    app: this.app,
    activeFile,
    cleanedDirPath,
  });
},

resolveVaultPathToResourceSrc(vaultPath) {
  if (typeof vaultPath !== 'string') return null;
  const normalized = vaultPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;

  try {
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!file || typeof file.extension !== 'string') return null;
    return this.app.vault.getResourcePath(file);
  } catch {
    return null;
  }
},

normalizeVaultPath,

getVaultConfigDir() {
  return normalizeVaultPath(this.app?.vault?.configDir);
},

getCleanupDirTemplate() {
  return normalizeVaultPath(this.plugin?.settings?.cleanupDirTemplate);
},

resolveCleanupDirPath(activeFile) {
  return resolveCleanupDirPath(this.getCleanupDirTemplate(), activeFile);
},

isSafeCleanupDirPath(vaultPath) {
  return isSafeCleanupDirPath(vaultPath, this.getVaultConfigDir());
},

cleanupConfiguredDirectory(activeFile) {
  return cleanupConfiguredDirectory({
    app: this.app,
    settings: this.plugin.settings,
    activeFile,
  });
},
};
