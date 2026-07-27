/*
## 核心功能

提供发布后目录清理、路径安全校验和失效 frontmatter 引用清理能力。

## 输入

接收 vault、插件清理设置、活动文件和 frontmatter 数据。

## 输出

输出纯路径判断函数及可注入 Obsidian 依赖的清理编排函数。

## 定位

位于 services/，承载发布清理业务规则；视图层仅保留兼容方法适配。

## 依赖

关键依赖：`./path-utils.js`、`./readable-error.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 目录删除必须先经过安全校验；失败只返回 warning，不改变同步成功状态。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: the service accepts injected Obsidian vault/fileManager capabilities whose runtime shapes vary by app version */

import { normalizeVaultPath } from './path-utils.js';
import { toReadableError } from './readable-error.js';

function toRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
}

export function normalizeFrontmatterKey(key) {
  return String(key || '').toLowerCase().replace(/[_-]/g, '');
}

export function getFrontmatterKeyMap(frontmatter, keys) {
  /** @type {Record<string, string>} */
  const result = {};
  const frontmatterRecord = toRecord(frontmatter);
  if (!frontmatterRecord || !Array.isArray(keys) || keys.length === 0) return result;

  const normalizedTargets = new Set(keys.map(normalizeFrontmatterKey));
  for (const [key, value] of Object.entries(frontmatterRecord)) {
    if (!normalizedTargets.has(normalizeFrontmatterKey(key))) continue;
    if (typeof value !== 'string') continue;
    const normalizedValue = normalizeVaultPath(value);
    if (normalizedValue) result[key] = normalizedValue;
  }
  return result;
}

export function isPathInsideDirectory(filePath, dirPath) {
  const file = normalizeVaultPath(filePath);
  const dir = normalizeVaultPath(dirPath);
  if (!file || !dir) return false;
  return file === dir || file.startsWith(`${dir}/`);
}

export function isPathInsideDirectoryByTail(filePath, dirPath) {
  const file = normalizeVaultPath(filePath);
  const dir = normalizeVaultPath(dirPath);
  if (!file || !dir) return false;

  const dirSegments = dir.split('/').filter(Boolean);
  if (dirSegments.length < 2) return false;

  for (let index = 1; index <= dirSegments.length - 2; index += 1) {
    const tailDir = dirSegments.slice(index).join('/');
    if (isPathInsideDirectory(file, tailDir)) return true;
  }
  return false;
}

export function shouldClearFrontmatterPathAfterCleanup(pathValue, cleanedDir) {
  const normalized = normalizeVaultPath(pathValue);
  if (!normalized) return false;
  return isPathInsideDirectory(normalized, cleanedDir)
    || isPathInsideDirectoryByTail(normalized, cleanedDir);
}

export function clearInvalidPublishMetaInFrontmatter(frontmatter, cleanedDir) {
  const frontmatterRecord = toRecord(frontmatter);
  if (!frontmatterRecord) return false;

  let changed = false;
  const coverMap = getFrontmatterKeyMap(frontmatter, ['cover']);
  const coverDirMap = getFrontmatterKeyMap(
    frontmatter,
    ['cover_dir', 'coverDir', 'cover-dir', 'coverdir', 'CoverDIR']
  );

  for (const [key, value] of Object.entries(coverMap)) {
    if (shouldClearFrontmatterPathAfterCleanup(value, cleanedDir)) {
      frontmatterRecord[key] = '';
      changed = true;
    }
  }

  for (const [key, value] of Object.entries(coverDirMap)) {
    if (shouldClearFrontmatterPathAfterCleanup(value, cleanedDir)) {
      frontmatterRecord[key] = '';
      changed = true;
    }
  }

  return changed;
}

export async function clearInvalidPublishMetaByTextFallback({
  vault,
  activeFile,
  cleanedDir,
}) {
  if (!vault || typeof vault.read !== 'function' || typeof vault.modify !== 'function') {
    return false;
  }

  const source = await vault.read(activeFile);
  if (typeof source !== 'string' || !source.startsWith('---')) return false;

  const match = source.match(/^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$))/);
  if (!match) return false;

  let changed = false;
  const body = match[2].replace(
    /^([ \t]*)(cover|cover_dir|coverDir|cover-dir|coverdir|CoverDIR)([ \t]*:[ \t]*)(.*)$/gmi,
    (line, indent, key, separator, rawValue) => {
      const value = String(rawValue || '').trim().replace(/^['"]|['"]$/g, '');
      if (!shouldClearFrontmatterPathAfterCleanup(value, cleanedDir)) return line;
      changed = true;
      return `${indent}${key}${separator}''`;
    }
  );

  if (!changed) return false;
  await vault.modify(activeFile, `${match[1]}${body}${match[3]}${source.slice(match[0].length)}`);
  return true;
}

export async function clearInvalidPublishMetaAfterCleanup({
  app,
  activeFile,
  cleanedDirPath,
}) {
  if (!activeFile || !cleanedDirPath) return null;

  const cleanedDir = normalizeVaultPath(cleanedDirPath);
  if (!cleanedDir) return null;

  try {
    const processFrontMatter = app?.fileManager?.['processFrontMatter'];
    if (typeof processFrontMatter === 'function') {
      await processFrontMatter.call(app.fileManager, activeFile, (frontmatter) => {
        clearInvalidPublishMetaInFrontmatter(frontmatter, cleanedDir);
      });
    } else {
      await clearInvalidPublishMetaByTextFallback({
        vault: app?.vault,
        activeFile,
        cleanedDir,
      });
    }
  } catch (error) {
    return `资源已删除，但清理 frontmatter 中失效的 cover/cover_dir 失败: ${toReadableError(error).message}`;
  }

  return null;
}

export function resolveCleanupDirPath(templateValue, activeFile) {
  const template = normalizeVaultPath(templateValue);
  if (!template) {
    return { path: '', warning: '未配置清理目录，请在插件设置中先填写目录后再启用自动清理' };
  }

  const hasNotePlaceholder = /\{\{\s*note\s*\}\}/i.test(template);
  if (hasNotePlaceholder && !activeFile) {
    return { path: '', warning: '当前没有活动文档，无法解析清理目录中的 {{note}}' };
  }

  const noteName = typeof activeFile?.basename === 'string' ? activeFile.basename.trim() : '';
  const resolved = template.replace(/\{\{\s*note\s*\}\}/gi, noteName);
  const normalized = normalizeVaultPath(resolved);
  if (!normalized) return { path: '', warning: '清理目录为空，请检查设置值' };
  return { path: normalized };
}

export function isSafeCleanupDirPath(vaultPath, configDirValue) {
  const normalized = normalizeVaultPath(vaultPath);
  if (!normalized || normalized === '.' || normalized.includes('..')) return false;

  const configDir = normalizeVaultPath(configDirValue);
  return !configDir
    || (normalized !== configDir && !normalized.startsWith(`${configDir}/`));
}

export async function cleanupConfiguredDirectory({
  app,
  settings,
  activeFile,
}) {
  if (!settings?.cleanupAfterSync) return { attempted: false };

  const useSystemTrash = settings.cleanupUseSystemTrash !== false;
  const resolved = resolveCleanupDirPath(settings.cleanupDirTemplate, activeFile);
  if (!resolved.path) {
    return { attempted: true, success: false, warning: resolved.warning || '未解析到清理目录' };
  }

  const normalized = resolved.path;
  if (!isSafeCleanupDirPath(normalized, app?.vault?.configDir)) {
    return { attempted: true, success: false, warning: `清理目录不安全，已跳过: ${normalized}` };
  }

  const abstractFile = app?.vault?.getAbstractFileByPath?.(normalized);
  if (!abstractFile) {
    return { attempted: true, success: false, warning: `清理目录不存在: ${normalized}` };
  }
  if (typeof abstractFile.extension === 'string') {
    return { attempted: true, success: false, warning: `清理路径不是目录，已跳过: ${normalized}` };
  }

  try {
    if (typeof app.vault.trash === 'function') {
      await app.vault.trash(abstractFile, useSystemTrash);
    } else if (typeof app.vault.delete === 'function') {
      await app.vault.delete(abstractFile, true);
    } else {
      throw new Error('当前 Obsidian 版本不支持删除接口');
    }
  } catch (error) {
    return {
      attempted: true,
      success: false,
      warning: `删除失败 (${normalized}): ${toReadableError(error).message}`,
    };
  }

  const frontmatterWarning = await clearInvalidPublishMetaAfterCleanup({
    app,
    activeFile,
    cleanedDirPath: normalized,
  });
  return frontmatterWarning
    ? { attempted: true, success: true, cleanedPath: normalized, warning: frontmatterWarning }
    : { attempted: true, success: true, cleanedPath: normalized };
}
