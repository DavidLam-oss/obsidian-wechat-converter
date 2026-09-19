/*
## 核心功能

卡片页面捕获层（A06，自 card-render-engine.js 拆出；C04 强化）：modern-screenshot 适配、
全局单捕获槽 + 有界 FIFO 队列（MAX_CAPTURE_QUEUE_SIZE）、支持 AbortSignal 取消排队与引用释放、
逻辑超时与底层任务生命周期分离（槽位跟随底层任务，超时/取消不得提前放开底层运行中的槽位）、
PNG 头部尺寸解析（测试核对用）。

## 输入

- `capturePage(root, {library, pixelRatio?, timeoutMs?, signal?})` → PNG Blob。
- `getCaptureSlotState()` / `resetCaptureSlotForTests()`：槽位状态查询与测试隔离。
- `drainCaptureQueue(reason?)`：清空排队并以 AbortError 中止所有等待中的任务（卸载用）。

## 输出

PNG Blob；槽位状态 { busy, queued }；`computeCardPixelSize`（§4.3 倍率取整唯一口径）。

## 关键约束（§5.6 捕获槽）

- 逻辑超时或排队取消立即向调用方返回 CAPTURE_TIMEOUT / AbortError（结果不得提交），但底层不可中断调用仍占用捕获槽，
  直到其真正结束才释放、才允许下一次捕获启动——不因逻辑超时叠加新的底层捕获。
- 排队任务在被取消或 drain 时立即从队列移除并释放引用，避免内存泄露与幽灵任务调度。
- 捕获前临时移除离屏 hidden 类（部分引擎对 visibility:hidden 祖先渲染为空白），捕获后恢复。

## 定位

位于 services/，卡片捕获层；动态 import modern-screenshot（A06 选型：0 失败稳定性优于 snapdom，
详见 docs/plans/evidence/image-card-phase1/A06/record.md）。

## 依赖

`modern-screenshot@4.7.0`（MIT，唯一捕获引擎）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 引擎选型结论回写规划文档附录；落选库连同其适配代码一并移除。
*/

/** 捕获引擎白名单（A06 选型定案：仅 modern-screenshot；snapdom 因真实内容页 URI malformed 落选移除） */
export const CAPTURE_LIBRARY_IDS = /** @type {const} */ (["modern-screenshot"]);
export const DEFAULT_CAPTURE_TIMEOUT_MS = 15000;
/** 捕获等待队列上限（§5.5 资源预算与有界队列防护） */
export const MAX_CAPTURE_QUEUE_SIZE = 100;

/**
 * 逻辑尺寸 × 导出倍率 → 最终像素尺寸（规划 §4.3 统一取整口径：先乘后 Math.round）。
 * size 若带 `heightExact`（RATIO_PRESETS 的未取整原始高度，如 9:16 = 666.67）则优先采用，
 * 保证 9:16 2× = 750×1333 而非 750×1334；否则按 height。
 * 导出预算（card-exporter）、导出弹窗尺寸摘要、PNG 实际尺寸核验共用，
 * 不得再各自 ceil/round 造成口径漂移。非法倍率按 1 处理。
 * @param {{ width: number, height: number, heightExact?: number }} size 逻辑尺寸（RATIO_PRESETS 值）
 * @param {number} scale 导出倍率（1/2/3）
 * @returns {{ width: number, height: number }}
 */
export function computeCardPixelSize(size, scale) {
  const s = Number(scale) > 0 ? Number(scale) : 1;
  const rawWidth = Number(size.width);
  const rawHeight = Number.isFinite(Number(size.heightExact)) && Number(size.heightExact) > 0
    ? Number(size.heightExact)
    : Number(size.height);
  return {
    width: Math.round(rawWidth * s),
    height: Math.round(rawHeight * s),
  };
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} label
 * @param {AbortSignal} [signal]
 * @returns {Promise<T>}
 */
function withTimeout(promise, timeoutMs, label, signal) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {(() => void) | null} */
  let onAbort = null;
  const abortPromise = new Promise((_, reject) => {
    if (signal?.aborted) {
      const error = new Error(`capture aborted: ${label}`);
      error.name = "AbortError";
      reject(error);
      return;
    }
    if (signal) {
      onAbort = () => {
        const error = new Error(`capture aborted: ${label}`);
        error.name = "AbortError";
        reject(error);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error(`capture timeout: ${label} (${timeoutMs}ms)`), { code: "CAPTURE_TIMEOUT" });
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout, abortPromise]).finally(() => {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  });
}

/**
 * 捕获槽等待者对象。
 * @typedef {{ resolve: () => void, reject: (err: any) => void, cleanup?: () => void }} CaptureSlotWaiter
 */

const captureSlot = {
  busy: false,
  /** @type {Array<CaptureSlotWaiter | (() => void)>} */
  queue: [],
};

/**
 * 获取全局单捕获槽（§5.6：单捕获槽 + 有界 FIFO 队列，超额立即拒绝；支持 AbortSignal 取消排队与引用释放）。
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<void>}
 */
function acquireCaptureSlot(options = {}) {
  const signal = options.signal;
  if (signal?.aborted) {
    const error = new Error("capture aborted before queueing");
    error.name = "AbortError";
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    if (!captureSlot.busy) {
      captureSlot.busy = true;
      resolve();
      return;
    }
    if (captureSlot.queue.length >= MAX_CAPTURE_QUEUE_SIZE) {
      const error = Object.assign(
        new Error(`capture queue limit reached (${MAX_CAPTURE_QUEUE_SIZE})`),
        { code: "CAPTURE_QUEUE_FULL" }
      );
      reject(error);
      return;
    }
    /** @type {CaptureSlotWaiter} */
    const waiter = { resolve, reject };
    if (signal) {
      const onAbort = () => {
        const idx = captureSlot.queue.indexOf(waiter);
        if (idx >= 0) {
          captureSlot.queue.splice(idx, 1);
        }
        const error = new Error("capture aborted while queued");
        error.name = "AbortError";
        reject(error);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      waiter.cleanup = () => {
        signal.removeEventListener("abort", onAbort);
      };
    }
    captureSlot.queue.push(waiter);
  });
}

function releaseCaptureSlot() {
  while (captureSlot.queue.length > 0) {
    const next = captureSlot.queue.shift();
    if (typeof next === "function") {
      next();
      return;
    }
    if (next && typeof next.resolve === "function") {
      if (typeof next.cleanup === "function") next.cleanup();
      next.resolve();
      return;
    }
  }
  captureSlot.busy = false;
}

/**
 * 清空并以 AbortError 中止排队中的全部捕获任务（视图卸载/插件卸载用）。
 * 正在占用槽位的底层任务不中断，但所有等待中的排队任务立即以 AbortError 释放引用。
 * @param {string} [reason]
 */
export function drainCaptureQueue(reason = "capture queue drained") {
  const waiters = captureSlot.queue.splice(0, captureSlot.queue.length);
  for (const waiter of waiters) {
    if (typeof waiter === "function") {
      continue;
    }
    if (waiter && typeof waiter.reject === "function") {
      if (typeof waiter.cleanup === "function") waiter.cleanup();
      const error = new Error(reason);
      error.name = "AbortError";
      waiter.reject(error);
    }
  }
}

/** 槽位状态（测试/诊断用）：{ busy, queued } */
export function getCaptureSlotState() {
  return { busy: captureSlot.busy, queued: captureSlot.queue.length };
}

/**
 * 占有槽位（仅测试用）：直接测试有界排队与超时放行机制
 * @param {{ signal?: AbortSignal }} [options]
 */
export function acquireCaptureSlotForTests(options) {
  return acquireCaptureSlot(options);
}

/** 释放槽位（仅测试用） */
export function releaseCaptureSlotForTests() {
  releaseCaptureSlot();
}

/** 清空槽位状态（仅测试隔离用；生产代码不得调用） */
export function resetCaptureSlotForTests() {
  drainCaptureQueue("reset for tests");
  captureSlot.queue.length = 0;
  captureSlot.busy = false;
}

/**
 * 解析 PNG 头部像素尺寸（IHDR）：capturePage 不逐张解码（性能），实验/契约测试用它核对尺寸。
 * @param {ArrayBuffer | Uint8Array} bytes PNG 文件字节
 * @returns {{width: number, height: number}}
 */
export function readPngSize(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (view.length < 24 || signature.some((b, i) => view[i] !== b)) {
    throw new Error("not a PNG buffer");
  }
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/**
 * modern-screenshot 适配：domToBlob(root, {scale})
 * @param {HTMLElement} root
 * @param {number} pixelRatio
 * @returns {Promise<Blob>}
 */
async function captureWithModernScreenshot(root, pixelRatio) {
  const mod = /** @type {{domToBlob: (el: HTMLElement, opts: {scale: number}) => Promise<Blob|null>}} */ (
    await import("modern-screenshot")
  );
  const blob = await mod.domToBlob(root, { scale: pixelRatio });
  if (!blob) throw new Error("modern-screenshot returned empty blob");
  return /** @type {Blob} */ (blob);
}

/**
 * 捕获页面为 PNG Blob。
 * @param {HTMLElement} root `.icard-page`
 * @param {{library: string, pixelRatio?: number, timeoutMs?: number, signal?: AbortSignal}} options
 * @returns {Promise<Blob>}
 */
export async function capturePage(root, options) {
  const library = options.library;
  const pixelRatio = options.pixelRatio || 2;
  const timeoutMs = options.timeoutMs || DEFAULT_CAPTURE_TIMEOUT_MS;
  const signal = options.signal;
  if (!CAPTURE_LIBRARY_IDS.includes(/** @type {any} */ (library))) {
    throw new Error(`unknown capture library: ${library}`);
  }
  // 捕获前临时移除离屏 hidden 类（部分引擎对 visibility:hidden 的祖先会渲染为空白），捕获后恢复
  const offscreenParent = root.parentElement;
  const isOffscreenParent = Boolean(
    offscreenParent && offscreenParent.hasAttribute("data-icard-offscreen")
  );
  await acquireCaptureSlot({ signal });
  if (isOffscreenParent) {
    offscreenParent.classList.remove("icard-offscreen");
  }
  /** @type {Promise<Blob>} */
  let task;
  try {
    task = captureWithModernScreenshot(root, pixelRatio);
  } catch (error) {
    if (isOffscreenParent) offscreenParent.classList.add("icard-offscreen");
    releaseCaptureSlot();
    throw error;
  }
  // 槽位跟随底层任务生命周期：逻辑超时提前返回，但槽位等底层真正结束才释放（§5.6）
  let slotReleased = false;
  const releaseOnce = () => {
    if (slotReleased) return;
    slotReleased = true;
    releaseCaptureSlot();
  };
  task.then(releaseOnce, releaseOnce);
  try {
    const blob = await withTimeout(task, timeoutMs, library, signal);
    if (!blob || blob.type !== "image/png") {
      throw new Error(`capture returned non-PNG blob (type: ${blob ? blob.type : "null"})`);
    }
    return blob;
  } finally {
    // 注意：此处只恢复离屏类，不释放捕获槽——槽位由底层 task 的 settle 回调释放（§5.6，超时不得提前放开）
    if (isOffscreenParent) {
      offscreenParent.classList.add("icard-offscreen");
    }
  }
}
