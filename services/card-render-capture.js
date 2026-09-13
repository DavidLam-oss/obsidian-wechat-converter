/*
## 核心功能

卡片页面捕获层（A06，自 card-render-engine.js 拆出）：modern-screenshot 适配、全局单捕获槽 +
FIFO 队列、逻辑超时与底层任务生命周期分离（槽位跟随底层任务，超时不得提前放开）、
PNG 头部尺寸解析（测试核对用）。

## 输入

- `capturePage(root, {library, pixelRatio?, timeoutMs?})` → PNG Blob。
- `getCaptureSlotState()` / `resetCaptureSlotForTests()`：槽位状态查询与测试隔离。

## 输出

PNG Blob；槽位状态 { busy, queued }；`computeCardPixelSize`（§4.3 倍率取整唯一口径）。

## 关键约束（§5.6 捕获槽）

- 逻辑超时立即向调用方返回 CAPTURE_TIMEOUT（结果不得提交），但底层不可中断调用仍占用捕获槽，
  直到其真正结束才释放、才允许下一次捕获启动——不因逻辑超时叠加新的底层捕获。
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

/**
 * 逻辑尺寸 × 导出倍率 → 最终像素尺寸（规划 §4.3 统一取整口径：Math.round）。
 * 导出预算（card-exporter）、导出弹窗尺寸摘要、PNG 实际尺寸核验共用，
 * 不得再各自 ceil/round 造成口径漂移。非法倍率按 1 处理。
 * @param {{ width: number, height: number }} size 逻辑尺寸（RATIO_PRESETS 值）
 * @param {number} scale 导出倍率（1/2/3）
 * @returns {{ width: number, height: number }}
 */
export function computeCardPixelSize(size, scale) {
  const s = Number(scale) > 0 ? Number(scale) : 1;
  return {
    width: Math.round(Number(size.width) * s),
    height: Math.round(Number(size.height) * s),
  };
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, timeoutMs, label) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error(`capture timeout: ${label} (${timeoutMs}ms)`), { code: "CAPTURE_TIMEOUT" });
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const captureSlot = { busy: false, queue: [] };

/** @returns {Promise<void>} */
function acquireCaptureSlot() {
  return new Promise((resolve) => {
    if (!captureSlot.busy) {
      captureSlot.busy = true;
      resolve();
      return;
    }
    captureSlot.queue.push(resolve);
  });
}

/* FIFO 队列元素为隐式 resolve 函数（TS 推断 any），仅本模块内部使用，此处关闭 unsafe-* 检查 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- 捕获槽 FIFO 队列存取隐式 resolve 函数 */

function releaseCaptureSlot() {
  const next = captureSlot.queue.shift();
  if (next) next();
  else captureSlot.busy = false;
}

/** 槽位状态（测试/诊断用）：{ busy, queued } */
export function getCaptureSlotState() {
  return { busy: captureSlot.busy, queued: captureSlot.queue.length };
}

/** 清空槽位状态（仅测试隔离用；生产代码不得调用） */
export function resetCaptureSlotForTests() {
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
 * @param {{library: string, pixelRatio?: number, timeoutMs?: number}} options
 * @returns {Promise<Blob>}
 */
export async function capturePage(root, options) {
  const library = options.library;
  const pixelRatio = options.pixelRatio || 2;
  const timeoutMs = options.timeoutMs || DEFAULT_CAPTURE_TIMEOUT_MS;
  if (!CAPTURE_LIBRARY_IDS.includes(/** @type {any} */ (library))) {
    throw new Error(`unknown capture library: ${library}`);
  }
  // 捕获前临时移除离屏 hidden 类（部分引擎对 visibility:hidden 的祖先会渲染为空白），捕获后恢复
  const offscreenParent = root.parentElement;
  const isOffscreenParent = Boolean(
    offscreenParent && offscreenParent.hasAttribute("data-icard-offscreen")
  );
  await acquireCaptureSlot();
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
    const blob = await withTimeout(task, timeoutMs, library);
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
