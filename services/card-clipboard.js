/*
## 核心功能

图片卡片单张复制服务（C03）：
- 检查系统剪贴板图片写入能力（支持浏览器 ClipboardItem 与 Electron nativeImage 兜底）；
- 将 PNG 图片以 Blob / Buffer 格式写入系统剪贴板（零磁盘写入、纯内存流）；
- 编排单张复制完整流程（统一资格检查 → 内存捕获 → PNG 尺寸核验 → 剪贴板写入）。

## 输入

- `canCopyImageToClipboard()`：无入参。
- `writeImageBlobToClipboard(blob, bytes?)`：PNG Blob 与可选的原始字节。
- `copySingleCardImage(deps)`：包含 session、pageId、ordinal、outcome、capturePageBytes 等。

## 输出

- `{ ok: true, size: { width, height }, bytes: number }` 或
- `{ ok: false, reason: string, message: string, blockers?: Array<{ code, message }> }`。

## 定位

位于 services/，卡片剪贴板与单张输出逻辑；不直接操作 DOM，纯服务与平台适配层。

## 依赖

`./card-render-capture.js`（`readPngSize`）；
`./card-settings-model.js`（`checkCardOutputEligibility`）。

## 维护规则

- 严格遵守单文件 800 行软线规范。
- 绝不向 vault 或本地文件系统写入任何临时文件。
- 遵循与批量导出相同的诊断门禁（省略接受/排版正常/资源就绪）。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- reason: Electron 为桌面端按需动态加载，环境不含 Electron 静态类型定义，通过 any/unknown 处理 */

import { readPngSize } from './card-render-capture.js';
import { checkCardOutputEligibility } from './card-settings-model.js';
import { loadCommonJsDependency } from './obsidian-compat.js';

export const DEFAULT_CARD_CLIPBOARD_SCALE = 2;

/**
 * 检查当前环境是否具备写入 PNG 图片到剪贴板的能力。
 * @returns {boolean}
 */
export function canCopyImageToClipboard() {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined"
  ) {
    return true;
  }
  return canUseElectronClipboard();
}

/**
 * 检查 Electron 剪贴板能力是否可用（惰性检测，不产生静态依赖）。
 * @returns {boolean}
 */
function canUseElectronClipboard() {
  try {
    const electron = /** @type {any} */ (loadCommonJsDependency('electron'));
    return Boolean(
      electron &&
      electron.clipboard &&
      typeof electron.clipboard.writeImage === 'function' &&
      electron.nativeImage &&
      typeof electron.nativeImage.createFromBuffer === 'function',
    );
  } catch {
    return false;
  }
}

/**
 * Electron 兜底写入剪贴板。
 * @param {Uint8Array | Blob} data
 * @returns {{ ok: boolean, reason?: string, message?: string }}
 */
function tryElectronClipboardWrite(data) {
  try {
    const electron = /** @type {any} */ (loadCommonJsDependency('electron'));
    if (!electron?.clipboard?.writeImage || !electron?.nativeImage?.createFromBuffer) {
      return { ok: false, reason: 'unsupported' };
    }
    let buffer;
    if (data instanceof Uint8Array) {
      buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
      buffer = data;
    } else {
      return { ok: false, reason: 'invalid-data', message: '无法将数据转换为 Electron 兼容的图片缓冲' };
    }
    const img = electron.nativeImage.createFromBuffer(buffer);
    electron.clipboard.writeImage(img);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "electron-failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 将图片 Blob 写入系统剪贴板。
 * 优先标准 ClipboardItem，若失败或不可用则在桌面环境尝试 Electron 兜底。
 * @param {Blob} blob
 * @param {Uint8Array} [bytes]
 * @returns {Promise<{ ok: boolean, reason?: string, message?: string }>}
 */
export async function writeImageBlobToClipboard(blob, bytes) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      return { ok: true };
    } catch (webErr) {
      if (bytes) {
        const fallback = tryElectronClipboardWrite(bytes);
        if (fallback.ok) return fallback;
      }
      return {
        ok: false,
        reason: "clipboard-failed",
        message: webErr instanceof Error ? webErr.message : String(webErr),
      };
    }
  }

  if (bytes) {
    const fallback = tryElectronClipboardWrite(bytes);
    if (fallback.ok) return fallback;
  }

  return {
    ok: false,
    reason: "clipboard-unsupported",
    message: "当前环境不支持直接写入图片到剪贴板，请使用导出功能保存图片",
  };
}

/**
 * 编排单张卡片图片复制全流程（零磁盘写入）。
 * @param {{
 *   session: import("./card-session.js").CardNoteSessionLike,
 *   pageId: string,
 *   ordinal: number,
 *   outcome: {
 *     ok: boolean,
 *     plan?: unknown,
 *     pages?: unknown[],
 *     coverPage?: unknown,
 *     layoutKey: string,
 *     omissionSummary?: { total?: number },
 *     resources?: { hasBlockingFailures?: boolean },
 *   },
 *   capturePageBytes: (input: { pageId: string, ordinal: number, scale?: number }) => Promise<{ bytes: Uint8Array }>,
 *   scale?: number,
 *   writeClipboard?: (blob: Blob, bytes: Uint8Array) => Promise<{ ok: boolean, reason?: string, message?: string }>,
 * }} deps
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   blockers?: Array<{ code: string, message: string }>,
 *   size?: { width: number, height: number },
 *   bytes?: number,
 *   message?: string,
 * }>}
 */
export async function copySingleCardImage(deps) {
  const {
    session,
    pageId,
    ordinal,
    outcome,
    capturePageBytes,
    scale = DEFAULT_CARD_CLIPBOARD_SCALE,
    writeClipboard = writeImageBlobToClipboard,
  } = deps;

  if (!session) {
    return { ok: false, reason: "no-session", message: "未找到卡片会话" };
  }
  if (!outcome) {
    return { ok: false, reason: "no-result", message: "当前没有可用的排版结果" };
  }

  const pageCount = Array.isArray(outcome.pages) ? outcome.pages.length : 0;
  const hasCover = Boolean(outcome.coverPage);
  const omissionTotal = Number(outcome.omissionSummary?.total || 0);

  // 1. 统一资格检查
  const eligibility = checkCardOutputEligibility(session, {
    hasResult: Boolean(outcome),
    planOk: outcome.ok === true,
    pageCount,
    hasCover,
    diagnosticVersion: String(outcome.layoutKey || ""),
    omissionTotal,
    resourceBlockingFailures: outcome.resources?.hasBlockingFailures === true,
  });

  // 单张复制由用户直接点击该卡片触发，不受「勾选为空（empty-selection）」阻断
  const relevantBlockers = eligibility.blockers.filter((b) => b.code !== "empty-selection");
  if (relevantBlockers.length > 0) {
    const primary = relevantBlockers[0];
    return {
      ok: false,
      reason: primary.code,
      blockers: relevantBlockers,
      message: primary.message,
    };
  }

  // 2. 目标页面有效性核验
  const isCover = pageId === "cover";
  if (isCover && !hasCover) {
    return { ok: false, reason: "page-not-found", message: "未开启封面或封面未生成" };
  }
  if (!isCover && (ordinal < 1 || ordinal > pageCount)) {
    return { ok: false, reason: "page-not-found", message: "未找到第 " + ordinal + " 页" };
  }

  // 3. 内存捕获 PNG 字节（不写盘）
  let captured;
  try {
    captured = await capturePageBytes({ pageId, ordinal, scale });
  } catch (error) {
    return {
      ok: false,
      reason: "capture-failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (!captured || !(captured.bytes instanceof Uint8Array) || captured.bytes.byteLength === 0) {
    return { ok: false, reason: "capture-failed", message: "未捕获到有效的图片数据" };
  }

  // 4. PNG 格式与尺寸核验
  let size;
  try {
    size = readPngSize(captured.bytes);
  } catch {
    return { ok: false, reason: 'capture-invalid', message: '捕获输出非有效 PNG 格式' };
  }
  if (!size) {
    return { ok: false, reason: 'capture-invalid', message: '捕获输出非有效 PNG 格式' };
  }

  const blob = new Blob([captured.bytes], { type: "image/png" });

  // 5. 写入系统剪贴板
  const writeResult = await writeClipboard(blob, captured.bytes);
  if (!writeResult || writeResult.ok !== true) {
    return {
      ok: false,
      reason: writeResult?.reason || "clipboard-failed",
      message: writeResult?.message || "写入系统剪贴板失败，请使用右上角导出保存图片",
    };
  }

  return {
    ok: true,
    size,
    bytes: captured.bytes.byteLength,
  };
}
