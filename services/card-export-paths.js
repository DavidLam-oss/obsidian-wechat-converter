/*
## 核心功能

卡片导出路径安全层（B04，§6.1）：vault 相对路径校验、保留目录拒绝、文件名净化、
批次目录命名与图片文件名生成。纯逻辑、无 DOM / 无 Obsidian 依赖，可在 node 下独立测试。

## 输入

- `sanitizeFileSegment(raw, options)`：净化目录/文件名段（非法字符、Windows 保留名、尾随点/空格、长度）。
- `validateExportRoot(rootPath, { configDir })`：校验导出根目录配置（空回落默认；非法配置拒绝而非静默修改）。
- `isReservedOutputPath(path, configDir)`：保留目录判断（保留目录 + `.` 开头段，大小写等价）。
- `shortSourceKey(sourcePath)`：源路径短标识（供诊断与测试区分同名来源；不进入目录名）。
- `buildNoteDirName(sourcePath)`：笔记分组目录名 = `<安全笔记名>`。
- `buildBatchDirName({ now, attempt })`：`<YYYY-MM-DD HH-mm-ss>`，同秒冲突追加 `-2`、`-3`。
- `imageFileName(ordinal)`：`card-001.png`（正文页号 1-based，编号可不连续）。
- `sanitizeExportMessage(message)`：剥离错误信息中的绝对路径样式片段（不泄露宿主敏感路径）。

## 输出

见上；全部为纯函数或纯数据，无副作用。

## 关键规则（§6.1）

- 只允许 vault 相对路径；拒绝绝对路径、盘符/网络共享、`..` 路径段、空字节、空结果。
- 拒绝实际 configDir（含用户自定义位置）、`.obsidian`、`.trash`、`.git` 及其子目录；
  额外拒绝任何以 `.` 开头的目录段；保留判断按路径段 + 小写等价，不用字符串前缀。
- 文件名净化覆盖 Windows 保留名、非法字符、控制字符、尾随点/空格与长度上限；
  清理后为空回落中性占位名。
- 目录名一律人可读：笔记分组用净化后的笔记名，批次用本地时间戳；不引入随机/哈希后缀。
  批次目录名必须唯一（同秒冲突追加序号），保证不同来源、不同次导出永不落入同一批次目录。

## 定位

位于 services/，卡片导出的路径安全纯逻辑层；card-exporter.js 消费。
符号链接/目录联接与「检查后变化」防护不在本层（需要真实文件系统，由 exporter 经注入的
fs.realpath 适配器完成）。

## 依赖

`./path-utils.js`（normalizeVaultPath / isAbsolutePathLike）；无运行时其他依赖。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 目录命名不得再引入随机串或哈希后缀（用户看不懂）；需要区分来源时写在清单数据里，
  不要写进路径。安全规则变更须同步 `tests/card_export_paths.test.js` 与规划 §6.1。
*/

import { isAbsolutePathLike, normalizeVaultPath } from './path-utils.js';

/** 默认导出根目录（vault 相对） */
export const DEFAULT_EXPORT_ROOT = '卡片导出';
/** 清单文件名（每批一份，§6.1） */
export const EXPORT_MANIFEST_NAME = 'export-manifest.json';
/** 保留目录（大小写等价比较） */
export const RESERVED_EXPORT_DIRS = ['.obsidian', '.trash', '.git'];
/** 批次目录冲突时的重新生成尝试上限（§6.1） */
export const MAX_BATCH_DIR_ATTEMPTS = 5;
/** 笔记名段长度上限（字符） */
export const NOTE_SEGMENT_MAX_LENGTH = 60;
/** 净化后为空时的中性占位名 */
export const NEUTRAL_SEGMENT_FALLBACK = 'note';

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ILLEGAL_SEGMENT_CHARS = /[<>:"|?*\u0000-\u001f\\/]/g;
/** 非法字符检测用（无 g 标志，避免 RegExp.test 的 lastIndex 状态陷阱） */
const ILLEGAL_SEGMENT_CHECK = /[<>:"|?*\u0000-\u001f\\/]/;

/**
 * 净化单个路径段：非法字符/控制字符替换为 `-`，去尾随点与空格，钳制长度，空回落占位名。
 * @param {string} raw
 * @param {{ maxLength?: number }} [options]
 * @returns {string}
 */
export function sanitizeFileSegment(raw, options = {}) {
  const maxLength = Math.max(1, Number(options.maxLength) || NOTE_SEGMENT_MAX_LENGTH);
  let value = String(raw ?? '')
    .replace(ILLEGAL_SEGMENT_CHARS, '-')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  // 去尾随点与空格（Windows 文件名语义）
  value = value.replace(/[. ]+$/g, '');
  if ([...value].length > maxLength) {
    value = [...value].slice(0, maxLength).join('').replace(/[. ]+$/g, '');
  }
  if (!value || WINDOWS_RESERVED_NAMES.test(value)) {
    return NEUTRAL_SEGMENT_FALLBACK;
  }
  return value;
}

/**
 * 源路径短标识：djb2 变体 → base36（6 位）。仅为诊断与测试提供「同名不同来源」的
 * 稳定可读标识（例如清单排查时区分两条同路径名）；**不再进入目录名**，避免用户看不懂。
 * @param {string} sourcePath
 * @returns {string}
 */
export function shortSourceKey(sourcePath) {
  const text = String(sourcePath ?? '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).padStart(6, '0').slice(-6);
}

/**
 * 按路径段判断保留输出路径（§6.1）：保留目录、`.` 开头段、configDir 本体及子目录。
 * 大小写等价比较；输入应已是 vault 相对规范化路径。
 * @param {string} vaultRelativePath
 * @param {string} configDir vault 相对配置目录（如 `.obsidian`）
 * @returns {boolean}
 */
export function isReservedOutputPath(vaultRelativePath, configDir) {
  const normalized = normalizeVaultPath(vaultRelativePath);
  if (!normalized) return true;
  const segments = normalized.split('/').filter(Boolean).map((s) => s.toLowerCase());
  const reserved = RESERVED_EXPORT_DIRS.map((dir) => dir.toLowerCase());
  if (segments.some((segment) => segment.startsWith('.') || reserved.includes(segment))) return true;
  // configDir 本体及子目录（支持用户自定义配置目录，逐段大小写等价前缀匹配）
  const configSegments = normalizeVaultPath(configDir).toLowerCase().split('/').filter(Boolean);
  if (configSegments.length > 0 && segments.length >= configSegments.length) {
    const isConfigPrefix = configSegments.every((seg, i) => segments[i] === seg);
    if (isConfigPrefix) return true;
  }
  return false;
}

/**
 * 校验导出根目录配置（§6.1）：空回落默认；绝对路径、`..`、空字节、保留目录、非法字符一律拒绝，
 * 不将非法配置静默修成另一条路径。
 * @param {string} rootPath 用户配置的 vault 相对目录（可空）
 * @param {{ configDir?: string }} [context]
 * @returns {{ ok: true, root: string } | { ok: false, reason: string }}
 */
export function validateExportRoot(rootPath, context = {}) {
  const raw = String(rootPath ?? '').trim();
  if (!raw) return { ok: true, root: DEFAULT_EXPORT_ROOT };
  if (raw.includes('\u0000')) return { ok: false, reason: 'path-null-byte' };
  if (isAbsolutePathLike(raw)) return { ok: false, reason: 'path-absolute' };
  if (/^\\\\/.test(raw)) return { ok: false, reason: 'path-absolute' };
  const normalized = normalizeVaultPath(raw);
  if (!normalized) return { ok: false, reason: 'path-empty' };
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    return { ok: false, reason: 'path-parent-escape' };
  }
  if (segments.some((segment) => ILLEGAL_SEGMENT_CHECK.test(segment))) {
    return { ok: false, reason: 'path-illegal-chars' };
  }
  if (isReservedOutputPath(normalized, context.configDir || '.obsidian')) {
    return { ok: false, reason: 'path-reserved' };
  }
  return { ok: true, root: normalized };
}

/**
 * 笔记分组目录名：`<安全笔记名>`（人可读）。
 * 同一篇笔记的多次导出都归到这一个目录下，再按批次子目录区分；同名笔记共享同一分组，
 * 来源区分由每批清单里的 `sourcePath` 承担——目录名不再塞哈希后缀。
 * `noteKey` 仍随返回值提供，供诊断/测试使用。
 * @param {string} sourcePath
 * @returns {{ dirName: string, noteSegment: string, noteKey: string }}
 */
export function buildNoteDirName(sourcePath) {
  const path = String(sourcePath ?? '');
  const base = path.split('/').pop() || '';
  const withoutExt = base.replace(/\.[^.]+$/, '');
  const noteSegment = sanitizeFileSegment(withoutExt);
  const noteKey = shortSourceKey(path);
  return { dirName: noteSegment, noteSegment, noteKey };
}

/**
 * 批次目录名：`<YYYY-MM-DD HH-mm-ss>`（本地时间；冒号已替换为 `-`，Windows 安全）。
 * 同一秒内重复导出时由 `attempt` 追加 `-2`、`-3`…，既保持人可读，又保证绝不覆盖旧结果。
 * @param {{ now?: () => Date, attempt?: number }} [input]
 * @returns {string}
 */
export function buildBatchDirName(input = {}) {
  const date = typeof input.now === 'function' ? input.now() : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const attempt = Math.max(0, Math.floor(Number(input.attempt) || 0));
  return attempt === 0 ? stamp : `${stamp}-${attempt + 1}`;
}

/**
 * 正文图片文件名：`card-001.png`（1-based 正文页号；选中导出保留原页号，编号可不连续）。
 * @param {number} ordinal
 * @returns {string}
 */
export function imageFileName(ordinal) {
  const index = Math.max(1, Math.floor(Number(ordinal) || 0));
  return `card-${String(index).padStart(3, '0')}.png`;
}

/**
 * 剥离错误信息中的绝对路径样式片段（`/...`、`X:\...`、`\\srv\...`），避免泄露宿主敏感路径（§6.2）。
 * @param {string} message
 * @returns {string}
 */
export function sanitizeExportMessage(message) {
  return String(message ?? '')
    .replace(/[a-zA-Z]:[\\/][^\s"'`]*/g, '[路径]') // Windows 盘符路径 X:\foo 或 X:/foo
    .replace(/\\\\[^\s"'`]*/g, '[路径]') // UNC 网络共享 \\srv\share
    .replace(/(^|[\s"'`=(])(\/[^\s"'`]*\/[^\s"'`]*)/g, '$1[路径]') // POSIX 绝对路径（至少两级）
    .slice(0, 200);
}
