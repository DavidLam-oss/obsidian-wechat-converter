/*
## 核心功能

卡片图片/字体资源就绪层：解析 local/wiki/相对/受控远程图片来源，做 MIME、编码体积与解码像素校验；提供有超时、可取消的图片与字体等待；以「冻结快照 + 引用计数」管理所有权，预览与导出可持有同一份资源，最后一个持有者释放时回收。

## 输入

- `createCardResourcePool({ app, sourcePath, session?, loaders? })`：插件 app（vault/metadataCache）、笔记 sourcePath、可选共享会话预算与可注入加载器（测试用）。
- `pool.prepare(imageRefs, opts)`：card-document 产出的 images 引用（{ref, kind, gif, excluded}）。
- `pool.waitForFonts(document, opts)`：目标 Document。

## 输出

- 常量 `CARD_IMAGE_TIMEOUT_MS` 等预算值（§5.5/§5.6 初始值）。
- `resolveCardImageSource(ref, ctx)`：ref → {src, mime, vaultPath} | null。
- `createCardResourcePool(...)`：`prepare()` 返回冻结的 CardResourceSnapshot（images/诊断/hasBlockingFailures），含 `retain()/release()` 引用计数；`waitForFonts()` 返回 {status:"ok"|"timeout"}。
- `createSnapshotResolver(snapshot)`：ref → 可渲染 src | null，接入 assembleCardPage 的 resolveImageSrc。
- `createCardResourceSession()`：会话级累计字节预算。

## 定位

位于 services/，属于卡片导出的资源层；不存全局 Base64，不触碰文章渲染链路。资源句柄经 `resources` 参数进入 `assembleCardPage`。

## 依赖

`./path-utils.js`、`./image-source-utils.js`、`./dom-utils.js`；运行环境 window/AbortSignal（可注入替换）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 预算与超时常量改动须同步规划 §5.5/§5.6 的记录要求（原值/新值/原因）。
*/

import { normalizeVaultPath } from "./path-utils.js";
import {
  inferLocalImageMimeType,
  safeDecodeUriText,
  getVaultRelativePathFromLocalPath,
} from "./image-source-utils.js";
import { getObsidianRequestUrl } from "./obsidian-compat.js";

/** 单张图片获取与解码上限（不含排队，§5.6） */
export const CARD_IMAGE_TIMEOUT_MS = 15000;
/** 字体就绪上限（§5.6）；超时选择可用字体并重测 */
export const CARD_FONT_TIMEOUT_MS = 10000;
/** 整份资源准备上限（含排队，§5.6）；到期终止本轮，未就绪列为失败 */
export const CARD_WHOLE_PREP_TIMEOUT_MS = 60000;
/** 单资源编码体积上限（§5.5） */
export const CARD_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** 单图解码像素上限：24 MP（§5.5） */
export const CARD_MAX_IMAGE_PIXELS = 24 * 1024 * 1024;
/** 会话资源累计上限（§5.5） */
export const CARD_SESSION_MAX_BYTES = 100 * 1024 * 1024;
/** 资源加载并发上限（§5.5） */
export const CARD_LOAD_CONCURRENCY = 3;

/**
 * 资源诊断状态。
 * - ok：就绪可用
 * - filtered：上游已过滤（GIF 等），不算失败
 * - resolve-failed / error / timeout / budget-exceeded：显式失败，导出侧据此阻断或提示
 * @typedef {"ok"|"filtered"|"resolve-failed"|"error"|"timeout"|"budget-exceeded"} CardResourceStatus
 */

/**
 * @typedef {object} CardResourceImageEntry
 * @property {string} ref 原始引用
 * @property {string} src 可渲染 src（app:// 资源路径 / 受控远程 / data:）
 * @property {string} mime 校验通过的 MIME
 * @property {number} bytes 编码体积
 * @property {number} width 解码宽
 * @property {number} height 解码高
 * @property {string} [vaultPath] vault 内路径（本地资源）
 */

/**
 * @typedef {object} CardResourceDiagnostic
 * @property {string} ref
 * @property {"local"|"wiki"|"remote"} kind
 * @property {CardResourceStatus} status
 * @property {string} [reason]
 */

/**
 * 冻结快照：构建后不可变；迟到结果不得修改（§5.6「迟到字体不得静默改变已完成页面」同理适用于图片）。
 * @typedef {object} CardResourceSnapshot
 * @property {{ readonly [ref: string]: CardResourceImageEntry }} images
 * @property {readonly CardResourceDiagnostic[]} diagnostics
 * @property {boolean} hasBlockingFailures 非 filtered 的失败存在（超限/坏图/超时），导出侧不得静默少导
 * @property {{ status: "ok"|"timeout" } | null} fonts 字体等待结论（由 waitForFonts 结论回填，快照构建后锁定）
 * @property {() => CardResourceSnapshot} retain 增加持有计数
 * @property {() => void} release 释放持有；计数归零时回收（撤销 object URL 等清理钩子）
 */

/**
 * @typedef {object} CardAppLike
 * @property {{ getFirstLinkpathDest?: (linkpath: string, sourcePath: string) => unknown }} [metadataCache]
 * @property {{ getAbstractFileByPath?: (path: string) => unknown, getResourcePath?: (file: unknown) => string }} [vault]
 */

/**
 * @typedef {object} VaultFileLike
 * @property {string} path
 */

/**
 * @typedef {object} CardResourceLoaders 可注入加载器（默认用活动窗口实现；测试注入替身）
 * @property {(src: string, signal: AbortSignal) => Promise<{ blob: Blob }>} fetchBlob
 * @property {(src: string, signal: AbortSignal) => Promise<{ width: number, height: number }>} decodeImage
 * @property {(doc: Document, signal: AbortSignal) => Promise<"ok">} waitFonts
 */

/**
 * 会话级累计预算（createCardResourceSession 产出）。
 * @typedef {object} CardResourceSession
 * @property {number} maxBytes
 * @property {number} used
 * @property {(n: number) => boolean} addBytes
 * @property {() => void} reset
 */

/**
 * @typedef {object} CardResourcePoolOptions
 * @property {CardAppLike} [app]
 * @property {string} [sourcePath] 当前笔记路径（相对路径解析锚点）
 * @property {CardResourceSession} [session] 共享会话预算（createCardResourceSession 产出）
 * @property {Partial<CardResourceLoaders>} [loaders]
 */

const IMAGE_MIME_PREFIX = "image/";

/**
 * 会话级累计预算：超过上限（默认 CARD_SESSION_MAX_BYTES）时 addBytes 返回 false。
 * @param {number} [maxBytes]
 * @returns {{ maxBytes: number, used: number, addBytes: (n: number) => boolean, reset: () => void }}
 */
export function createCardResourceSession(maxBytes = CARD_SESSION_MAX_BYTES) {
  /** @type {CardResourceSession} */
  const session = {
    maxBytes,
    used: 0,
    addBytes(n) {
      if (session.used + n > session.maxBytes) return false;
      session.used += n;
      return true;
    },
    reset() {
      session.used = 0;
    },
  };
  return session;
}

/**
 * 解析 wiki/本地/相对路径引用为 vault 文件，再转可渲染资源 URL。
 * 解析顺序与 article-image-assets.resolveVaultFile 一致：metadataCache 优先，路径候选兜底（原样 + 笔记目录拼接）。
 * @param {CardAppLike|null} app
 * @param {string} sourcePath
 * @param {string} ref
 * @returns {{ src: string, mime: string, vaultPath: string } | null}
 */
function resolveVaultImage(app, sourcePath, ref) {
  const vault = app?.vault || {};
  const metadataCache = app?.metadataCache || {};
  const decoded = safeDecodeUriText(ref);
  const lookup = getVaultRelativePathFromLocalPath(/** @type {any} */ (app), decoded) || decoded;
  /** @type {VaultFileLike | null} */
  let file = null;
  try {
    const linked = metadataCache.getFirstLinkpathDest?.(lookup, sourcePath || "");
    if (isVaultFile(linked)) file = { path: String(/** @type {{path: unknown}} */ (linked).path) };
  } catch {
    // 落到路径候选
  }
  if (!file) {
    const noteDir = sourcePath ? sourcePath.slice(0, Math.max(sourcePath.lastIndexOf("/"), 0)) : "";
    /** @type {string[]} */
    const candidates = [];
    const normalized = normalizeVaultPath(lookup);
    if (normalized) candidates.push(normalized);
    if (normalized && !normalized.startsWith("/")) candidates.push(noteDir ? `${noteDir}/${normalized}` : normalized);
    for (const candidate of candidates) {
      try {
        const found = vault.getAbstractFileByPath?.(candidate);
        if (isVaultFile(found)) {
          file = { path: String(/** @type {{path: unknown}} */ (found).path) };
          break;
        }
      } catch {
        // 尝试下一个候选
      }
    }
  }
  if (!file) return null;
  let src = "";
  try {
    src = vault.getResourcePath?.(file) || "";
  } catch {
    src = "";
  }
  if (!src) return null;
  return { src, mime: inferLocalImageMimeType(file.path || ""), vaultPath: file.path || "" };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isVaultFile(value) {
  return !!value && typeof value === "object" && "path" in value && !Array.isArray(value);
}

/**
 * 来源解析结论（过滤分支）。注意：判别键用字符串而非布尔——本项目 tsconfig strict 关闭，
 * 布尔字面量会被放宽为 boolean 导致判别联合窄化失效。
 * @typedef {{ state: "filtered" }} CardImageSourceFiltered
 */

/**
 * 来源解析结论（就绪分支）。
 * @typedef {{ state: "ready", src: string, mime: string, vaultPath?: string }} CardImageSourceReady
 */

/**
 * 解析单个图片引用为可加载来源。
 * - wiki/本地 → vault 资源路径；remote → 仅允许 http(s) 与 data:image/*（受控远程），file: 等协议拒绝。
 * - GIF / excluded 由上游过滤策略决定：这里返回 filtered 标记，不算加载失败。
 * @param {{ ref: string, kind: "local"|"wiki"|"remote", gif?: boolean, excluded?: boolean }} refEntry
 * @param {{ app?: CardAppLike|null, sourcePath?: string }} ctx
 * @returns {CardImageSourceFiltered | CardImageSourceReady | null}
 */
export function resolveCardImageSource(refEntry, ctx = {}) {
  if (!refEntry || typeof refEntry.ref !== "string") return null;
  if (refEntry.gif || refEntry.excluded) return { state: "filtered" };
  const ref = refEntry.ref.trim();
  if (!ref) return null;
  if (refEntry.kind === "remote") {
    if (/^data:image\//i.test(ref)) {
      const mime = /^data:([^;,]*)/i.exec(ref);
      return { state: "ready", src: ref, mime: mime ? mime[1] : "image/png" };
    }
    if (/^https?:\/\//i.test(ref)) {
      return { state: "ready", src: ref, mime: inferLocalImageMimeType(ref) };
    }
    return null; // file: 等协议不受控，拒绝
  }
  const resolved = resolveVaultImage(ctx.app || null, ctx.sourcePath || "", ref);
  if (!resolved) return null;
  return { state: "ready", src: resolved.src, mime: resolved.mime, vaultPath: resolved.vaultPath };
}

/**
 * 默认加载器：基于活动窗口（支持 popout window 的 Document）。
 * @returns {CardResourceLoaders}
 */
function createDefaultLoaders() {
  return {
    /**
     * 远程 http(s) 优先走 Obsidian requestUrl（主进程转发，不受渲染进程 CORS 限制；
     * 参考 Export Img remote-images 的做法），失败或不可用时回退标准 fetch。
     * requestUrl 不支持 AbortSignal，取消语义由外层「晚到结果丢弃」兜底（§5.6）。
     * @param {string} src
     * @param {AbortSignal} signal
     * @returns {Promise<{ blob: Blob }>}
     */
    async fetchBlob(src, signal) {
      if (/^https?:\/\//i.test(src)) {
        try {
          const requestUrl = getObsidianRequestUrl();
          if (typeof requestUrl === "function") {
            const response = await requestUrl({ url: src, throw: false });
            if (response && response.status >= 200 && response.status < 300) {
              const buffer = /** @type {ArrayBufferLike} */ (response.arrayBuffer);
              const mime = String(response.headers?.["content-type"] || "").split(";")[0] || "image/png";
              return { blob: new Blob([/** @type {BlobPart} */ (buffer)], { type: mime }) };
            }
            throw new Error(`HTTP ${response?.status ?? "unknown"}（requestUrl）`);
          }
        } catch (error) {
          if (signal.aborted) throw abortError();
          // 回退 fetch（可能因 CORS 失败，届时进入显式资源失败诊断）
          void error;
        }
      }
      const response = await fetch(src, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return { blob };
    },
    /**
     * @param {string} src
     * @param {AbortSignal} signal
     * @returns {Promise<{ width: number, height: number }>}
     */
    decodeImage(src, signal) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        const onAbort = () => {
          image.src = "";
          reject(abortError());
        };
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
        image.onload = () => {
          signal.removeEventListener("abort", onAbort);
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
          signal.removeEventListener("abort", onAbort);
          reject(new Error("图片解码失败"));
        };
        image.src = src;
      });
    },
    /**
     * @param {Document} doc
     * @param {AbortSignal} signal
     * @returns {Promise<"ok">}
     */
    waitFonts(doc, signal) {
      return new Promise((resolve, reject) => {
        // Document.fonts 在部分 TS lib 中缺失，经 any 中转后按最小接口断言（双 cast 规避 no-unsafe-assignment）
        const docLike = /** @type {{ fonts?: { ready?: Promise<unknown> } }} */ (
          /** @type {unknown} */ (doc)
        );
        const fonts = docLike.fonts;
        if (!fonts || typeof fonts.ready?.then !== "function") {
          resolve("ok");
          return;
        }
        fonts.ready.then(
          () => {
            if (!signal.aborted) resolve("ok");
          },
          () => {
            if (!signal.aborted) resolve("ok"); // 字体查询失败按可用字体继续
          }
        );
        signal.addEventListener(
          "abort",
          () => reject(abortError()),
          { once: true }
        );
      });
    },
  };
}

/** @returns {Error} */
function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/**
 * 有界并发 all-settle：与 concurrency.pMap 的 fail-fast 语义不同，资源准备需要收集全部失败。
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => Promise<R>} worker
 * @param {number} concurrency
 * @param {() => boolean} shouldStop 返回 true 时不再启动新任务（整轮超时/中止后）
 * @returns {Promise<Array<{ item: T, settled: { ok: boolean, value?: R, error?: unknown } }>>}
 */
async function boundedAllSettle(items, worker, concurrency, shouldStop) {
  /** @type {Array<{ item: T, settled: { ok: boolean, value?: R, error?: unknown } }>} */
  const results = [];
  let cursor = 0;
  /** @type {Promise<void>[]} */
  const running = [];
  const launch = () => {
    if (cursor >= items.length || shouldStop()) return;
    const index = cursor;
    cursor += 1;
    const task = worker(items[index])
      .then((value) => {
        results[index] = { item: items[index], settled: { ok: true, value } };
      })
      .catch((error) => {
        results[index] = { item: items[index], settled: { ok: false, error } };
      })
      .then(() => {
        running.splice(running.indexOf(task), 1);
      });
    running.push(task);
  };
  while (cursor < items.length && !shouldStop()) {
    while (running.length < concurrency && cursor < items.length && !shouldStop()) {
      launch();
    }
    if (running.length > 0) await Promise.race(running);
  }
  await Promise.all(running);
  // 截止后未启动的任务补占位
  while (results.length < items.length) results.push(null);
  for (let i = 0; i < items.length; i += 1) {
    if (!results[i]) results[i] = { item: items[i], settled: { ok: false, error: new Error("未启动（资源准备已截止）") } };
  }
  return results;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isAbortError(error) {
  return !!error && typeof error === "object" && /** @type {Error} */ (error).name === "AbortError";
}

/**
 * 创建卡片资源池。
 * @param {CardResourcePoolOptions} [options]
 */
export function createCardResourcePool(options = {}) {
  const app = options.app || null;
  const sourcePath = options.sourcePath || "";
  const session = options.session || createCardResourceSession();
  const loaders = { ...createDefaultLoaders(), ...(options.loaders || {}) };

  /**
   * 等待字体就绪：有超时上限；超时返回 {status:"timeout"}，由调用方以可用字体重测并锁定快照。
   * 迟到字体不会修改任何已构建快照（快照冻结）。
   * @param {Document} doc
   * @param {{ timeoutMs?: number, signal?: AbortSignal }} [opts]
   * @returns {Promise<{ status: "ok"|"timeout" }>}
   */
  async function waitForFonts(doc, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? CARD_FONT_TIMEOUT_MS;
    const controller = new AbortController();
    const externalSignal = opts.signal;
    if (externalSignal) {
      if (externalSignal.aborted) throw abortError();
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await loaders.waitFonts(doc, controller.signal);
      return { status: "ok" };
    } catch (error) {
      if (externalSignal?.aborted || isAbortError(error)) {
        if (externalSignal?.aborted) throw error;
        return { status: "timeout" };
      }
      return { status: "timeout" };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 准备一份冻结资源快照。
   * - 并发上限 CARD_LOAD_CONCURRENCY；单图 15s（从实际加载起算）；整轮 60s 截止后不开新请求。
   * - 校验 MIME / 编码体积 / 解码像素；会话预算超限 → budget-exceeded（显式阻断，不静默少导）。
   * - 中止（外部 signal）→ 抛 AbortError，任何结果不写入快照。
   * @param {Array<{ ref: string, kind: "local"|"wiki"|"remote", gif?: boolean, excluded?: boolean }>} imageRefs
   * @param {{ timeoutMs?: number, signal?: AbortSignal }} [opts]
   * @returns {Promise<CardResourceSnapshot>}
   */
  async function prepare(imageRefs, opts = {}) {
    const wholeTimeoutMs = opts.timeoutMs ?? CARD_WHOLE_PREP_TIMEOUT_MS;
    const controller = new AbortController();
    const externalSignal = opts.signal;
    if (externalSignal) {
      if (externalSignal.aborted) throw abortError();
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const wholeTimer = setTimeout(() => controller.abort(), wholeTimeoutMs);
    const refs = (imageRefs || []).filter(Boolean);

    /** @type {{ [ref: string]: CardResourceImageEntry }} */
    const imageMap = {};
    /** @type {CardResourceDiagnostic[]} */
    const diagnostics = [];

    const settledList = await boundedAllSettle(
      refs,
      async (refEntry) => {
        /** @type {CardImageSourceFiltered | CardImageSourceReady | null} */
        const resolved = resolveCardImageSource(refEntry, { app, sourcePath });
        if (!resolved) {
          return { status: /** @type {CardResourceStatus} */ ("resolve-failed"), refEntry };
        }
        if (resolved.state === "filtered") {
          return { status: /** @type {CardResourceStatus} */ ("filtered"), refEntry };
        }
        // —— 单图加载：计时从实际启动开始（不含排队）——
        const imageController = new AbortController();
        const onOuterAbort = () => imageController.abort();
        controller.signal.addEventListener("abort", onOuterAbort, { once: true });
        const perImageTimer = setTimeout(() => imageController.abort(), CARD_IMAGE_TIMEOUT_MS);
        try {
          const { blob } = await loaders.fetchBlob(resolved.src, imageController.signal);
          const decode = await loaders.decodeImage(resolved.src, imageController.signal);
          clearTimeout(perImageTimer);
          if (controller.signal.aborted) throw abortError(); // 中止后结果不采用
          const mime = blob.type || resolved.mime;
          if (!mime.startsWith(IMAGE_MIME_PREFIX)) {
            return { status: /** @type {CardResourceStatus} */ ("error"), refEntry, reason: `非图片 MIME：${mime}` };
          }
          const bytes = blob.size;
          if (bytes > CARD_MAX_IMAGE_BYTES) {
            return {
              status: /** @type {CardResourceStatus} */ ("budget-exceeded"),
              refEntry,
              reason: `编码体积 ${bytes} 超过 ${CARD_MAX_IMAGE_BYTES}`,
            };
          }
          const pixels = decode.width * decode.height;
          if (pixels > CARD_MAX_IMAGE_PIXELS) {
            return {
              status: /** @type {CardResourceStatus} */ ("budget-exceeded"),
              refEntry,
              reason: `解码像素 ${pixels} 超过 ${CARD_MAX_IMAGE_PIXELS}`,
            };
          }
          if (!session.addBytes(bytes)) {
            return {
              status: /** @type {CardResourceStatus} */ ("budget-exceeded"),
              refEntry,
              reason: `会话累计资源超过 ${session.maxBytes}`,
            };
          }
          /** @type {CardResourceImageEntry} */
          const entry = {
            ref: refEntry.ref,
            src: resolved.src,
            mime,
            bytes,
            width: decode.width,
            height: decode.height,
          };
          if (resolved.vaultPath) entry.vaultPath = resolved.vaultPath;
          return { status: /** @type {CardResourceStatus} */ ("ok"), refEntry, entry };
        } catch (error) {
          clearTimeout(perImageTimer);
          if (externalSignal?.aborted) {
            throw abortError(); // 外部取消：结果不采用
          }
          if (controller.signal.aborted) {
            return { status: /** @type {CardResourceStatus} */ ("timeout"), refEntry, reason: "整轮准备截止" };
          }
          if (imageController.signal.aborted || isAbortError(error)) {
            return { status: /** @type {CardResourceStatus} */ ("timeout"), refEntry, reason: `单图加载超时（${CARD_IMAGE_TIMEOUT_MS}ms）` };
          }
          throw error;
        } finally {
          controller.signal.removeEventListener("abort", onOuterAbort);
        }
      },
      CARD_LOAD_CONCURRENCY,
      () => controller.signal.aborted
    );

    clearTimeout(wholeTimer);
    if (externalSignal?.aborted) {
      throw abortError(); // 取消：不产出快照，已加载结果全部丢弃
    }

    /** @type {number} */
    let blocking = 0;
    for (const settled of settledList) {
      const refEntry = settled.item;
      const s = settled.settled;
      if (!s.ok) {
        const aborted = isAbortError(s.error);
        const message = s.error instanceof Error ? s.error.message : String(s.error);
        diagnostics.push(
          aborted
            ? { ref: refEntry.ref, kind: refEntry.kind, status: "timeout", reason: "已取消" }
            : { ref: refEntry.ref, kind: refEntry.kind, status: "error", reason: message }
        );
        blocking += 1;
        continue;
      }
      const r = s.value;
      if (r.status === "ok") {
        imageMap[refEntry.ref] = r.entry;
        continue;
      }
      diagnostics.push({
        ref: refEntry.ref,
        kind: refEntry.kind,
        status: r.status,
        reason: r.reason,
      });
      if (r.status !== "filtered") blocking += 1;
    }

    return freezeSnapshot({
      images: imageMap,
      diagnostics,
      hasBlockingFailures: blocking > 0,
      fonts: null,
    });
  }

  return { prepare, waitForFonts, session };
}

/**
 * 冻结快照并挂引用计数。清理钩子（撤销 object URL 等）在最后一个持有者释放时执行。
 * @param {{ images: { [ref: string]: CardResourceImageEntry }, diagnostics: CardResourceDiagnostic[], hasBlockingFailures: boolean, fonts: { status: "ok"|"timeout" } | null, onFinalRelease?: () => void }} parts
 * @returns {CardResourceSnapshot}
 */
function freezeSnapshot(parts) {
  let holders = 1;
  let released = false;
  const frozenImages = Object.freeze(
    Object.fromEntries(Object.entries(parts.images).map(([ref, entry]) => [ref, Object.freeze({ ...entry })]))
  );
  const snapshot = /** @type {CardResourceSnapshot} */ ({
    images: frozenImages,
    diagnostics: Object.freeze(parts.diagnostics.map((d) => Object.freeze({ ...d }))),
    hasBlockingFailures: parts.hasBlockingFailures,
    fonts: parts.fonts,
    retain() {
      if (released) throw new Error("资源快照已最终释放，不能再次持有");
      holders += 1;
      return snapshot;
    },
    release() {
      if (released) throw new Error("重复释放资源快照");
      holders -= 1;
      if (holders <= 0) {
        released = true;
        // 清理钩子：当前实现使用 app:// 资源路径与受控远程 URL，无 object URL 需要撤销；
        // 引入 blob/objectURL 资源时在此统一撤销，保证不留 URL/监听器/隐藏节点。
        if (parts.onFinalRelease) parts.onFinalRelease();
      }
    },
  });
  return Object.freeze(snapshot);
}

/**
 * 从快照构造 renderProfile 的 resolveImageSrc：只有就绪资源才返回 src，其余返回 null（渲染器跳过）。
 * @param {CardResourceSnapshot | null | undefined} snapshot
 * @returns {(ref: string) => string | null}
 */
export function createSnapshotResolver(snapshot) {
  return (ref) => {
    const entry = snapshot && snapshot.images[ref];
    return entry ? entry.src : null;
  };
}
