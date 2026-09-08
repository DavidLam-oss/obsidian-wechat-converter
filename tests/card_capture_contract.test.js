// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* 捕获契约测试（A06）：尺寸、PNG 类型守卫、超时语义、捕获槽（§5.6：超时后底层仍占用槽位，实际退出才启动下一次）。
   引擎库 mock，通过 deferred 手动控制底层调用生命周期。A06 选型后仅 modern-screenshot。 */

const state = vi.hoisted(() => ({
  modern: { /** @type {any[]} */ calls: [], impl: null },
  reset() {
    this.modern = { calls: [], impl: null };
  },
}));

vi.mock("modern-screenshot", () => ({
  domToBlob: (...args) => {
    state.modern.calls.push(args);
    if (state.modern.impl) return state.modern.impl(...args);
    return Promise.resolve(null);
  },
}));

const { capturePage, readPngSize, getCaptureSlotState, resetCaptureSlotForTests } = await import(
  "../services/card-render-engine.js"
);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PNG_8X8 = readFileSync(path.join(HERE, "fixtures/image-card/assets/sample.png"));

const pngBlob = () => new Blob([PNG_8X8], { type: "image/png" });

/** 手动控制resolution的deferred */
function deferred() {
  /** @type {(v: any) => void} */
  let resolve;
  /** @type {(e: any) => void} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: /** @type {(v: any) => void} */ (resolve), reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("readPngSize（PNG 尺寸契约）", () => {
  it("从 IHDR 读取 8×8 fixture 的像素尺寸", () => {
    expect(readPngSize(PNG_8X8)).toEqual({ width: 8, height: 8 });
  });

  it("拒绝非 PNG 字节", () => {
    const notPng = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    expect(() => readPngSize(notPng)).toThrow(/not a PNG/);
  });
});

describe("capturePage 契约", () => {
  beforeEach(() => {
    state.reset();
    resetCaptureSlotForTests();
  });

  it("modern-screenshot：返回 PNG blob 且尺寸可解析", async () => {
    state.modern.impl = () => Promise.resolve(pngBlob());
    const root = /** @type {any} */ ({}); // 引擎已 mock，root 不参与 DOM
    const blob = await capturePage(root, { library: "modern-screenshot", pixelRatio: 2 });
    expect(blob.type).toBe("image/png");
    expect(readPngSize(await blob.arrayBuffer())).toEqual({ width: 8, height: 8 });
    expect(state.modern.calls[0][1]).toEqual({ scale: 2 });
  });

  it("非 PNG blob 与空结果都被拒绝", async () => {
    state.modern.impl = () => Promise.resolve(new Blob(["x"], { type: "image/svg+xml" }));
    await expect(capturePage(/** @type {any} */ ({}), { library: "modern-screenshot" })).rejects.toThrow(
      /non-PNG/
    );
    state.modern.impl = () => Promise.resolve(null);
    await expect(capturePage(/** @type {any} */ ({}), { library: "modern-screenshot" })).rejects.toThrow(
      /empty blob/
    );
  });

  it("未知引擎直接报错且不占用捕获槽", async () => {
    await expect(
      capturePage(/** @type {any} */ ({}), { library: "html2canvas" })
    ).rejects.toThrow(/unknown capture library/);
    expect(getCaptureSlotState()).toEqual({ busy: false, queued: 0 });
    expect(state.modern.calls).toHaveLength(0);
  });

  it("逻辑超时：CAPTURE_TIMEOUT 立即返回、结果不提交，但槽位被底层占用直到其真正结束", async () => {
    const gate = deferred();
    state.modern.impl = () => gate.promise;
    const root = /** @type {any} */ ({}); // 引擎已 mock，root 不参与 DOM
    const first = capturePage(root, { library: "modern-screenshot", timeoutMs: 30 });
    await tick(); // 让底层任务启动
    await expect(first).rejects.toMatchObject({ code: "CAPTURE_TIMEOUT" });
    // 底层尚未结束 → 槽位仍被占用
    expect(getCaptureSlotState()).toEqual({ busy: true, queued: 0 });

    // 第二次捕获必须排队，不得叠加底层捕获
    state.modern.impl = () => Promise.resolve(pngBlob());
    const second = capturePage(root, { library: "modern-screenshot", timeoutMs: 1000 });
    await tick();
    expect(getCaptureSlotState()).toEqual({ busy: true, queued: 1 });
    expect(state.modern.calls).toHaveLength(1); // 底层第二次调用尚未启动

    // 底层第一次调用真正退出 → 槽位释放 → 第二次捕获启动并成功
    gate.resolve(pngBlob());
    const blob = await second;
    expect(blob.type).toBe("image/png");
    expect(state.modern.calls).toHaveLength(2);
    expect(getCaptureSlotState()).toEqual({ busy: false, queued: 0 });
  });

  it("串行队列：前一次底层结束前，下一次不启动底层调用", async () => {
    const gate = deferred();
    state.modern.impl = () => gate.promise;
    const root = /** @type {any} */ ({}); // 引擎已 mock，root 不参与 DOM
    const first = capturePage(root, { library: "modern-screenshot", timeoutMs: 1000 });
    await tick();
    expect(state.modern.calls).toHaveLength(1);
    const second = capturePage(root, { library: "modern-screenshot", timeoutMs: 1000 });
    await tick();
    expect(state.modern.calls).toHaveLength(1); // 仍在等槽
    gate.resolve(pngBlob());
    await first;
    await second;
    expect(state.modern.calls).toHaveLength(2);
    expect(getCaptureSlotState().busy).toBe(false);
  });
});
