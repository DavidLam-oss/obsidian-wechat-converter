// @vitest-environment node
import { describe, it, expect } from "vitest";

/* 卡片导出编排测试（B04，规划 §5.4/§6.1/§6.2）：
   输出资格再校验（快照/版本/省略确认/预算/页序）、批次目录冲突重生成（≤5 次）、
   逐页「捕获 → PNG 核验 → realpath 核验 → 排他写盘 → 落账 → 清单更新」顺序、
   取消检查点（已启动页写入成功仍计入）、捕获失败继续、批次内同名冲突立即停止整批、
   符号链接重定向与能力不可验证拒绝、错误信息脱敏。清单语义见 card_export_manifest.test.js。 */

import { createNoteCardSession } from "../services/card-session.js";
import { createCardExporter, CARD_EXPORT_LIMITS } from "../services/card-exporter.js";
import { EXPORT_MANIFEST_NAME } from "../services/card-export-paths.js";

/** 最小 PNG 字节（仅头 24 字节，供 readPngSize 核验） */
function makePngBytes(width, height) {
  const bytes = new Uint8Array(24);
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach((b, i) => { bytes[i] = b; });
  const dv = new DataView(bytes.buffer);
  dv.setUint32(8, 13);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return bytes;
}

/**
 * 可注入故障的 vault 适配器替身。
 * @param {{
 *   failManifestOverwriteFrom?: number, // 第 N 次起覆盖写清单失败（清单更新失败注入点）
 *   failCreateFor?: (path: string) => boolean, // 图片排他创建 io 失败注入
 *   conflictFor?: (path: string) => boolean,   // 图片排他创建冲突注入（非本任务同名文件）
 *   redirectRealpath?: (path: string) => boolean, // realpath 重定向注入
 *   realpathUnavailable?: boolean,    // realpath 能力不可验证
 *   failMkdir?: boolean,
 * }} [options]
 */
function createFakeFs(options = {}) {
  const files = new Map();
  const calls = { created: [], written: [], removed: [], mkdirs: [] };
  let manifestOverwrites = 0;
  return {
    files,
    calls,
    async exists(p) { return files.has(p); },
    async mkdir(p) {
      calls.mkdirs.push(p);
      if (options.failMkdir) throw new Error(`EACCES: mkdir /Users/vault/${p} denied`);
      files.set(p, { type: "dir" });
    },
    async createBinaryExclusive(p, bytes) {
      calls.created.push(p);
      if (options.conflictFor && options.conflictFor(p)) return { ok: false, reason: "conflict" };
      if (options.failCreateFor && options.failCreateFor(p)) {
        return { ok: false, reason: "io", message: "EIO: write /Users/vault failed" };
      }
      if (files.has(p)) return { ok: false, reason: "conflict" };
      files.set(p, { type: "file", bytes: Uint8Array.from(bytes) });
      return { ok: true };
    },
    async writeBinary(p, bytes) {
      calls.written.push(p);
      if (p.endsWith(EXPORT_MANIFEST_NAME)) {
        manifestOverwrites += 1;
        if (options.failManifestOverwriteFrom && manifestOverwrites >= options.failManifestOverwriteFrom) {
          throw new Error("EIO: manifest overwrite /Users/vault failed");
        }
      }
      files.set(p, { type: "file", bytes: Uint8Array.from(bytes) });
    },
    async remove(p) { calls.removed.push(p); files.delete(p); },
    async readText(p) {
      const f = files.get(p);
      if (!f || f.type !== "file") throw new Error(`missing: ${p}`);
      return new TextDecoder().decode(f.bytes);
    },
    async realpath(p) {
      if (options.realpathUnavailable) throw new Error("realpath not verifiable");
      if (options.redirectRealpath && options.redirectRealpath(p)) return "/outside/root";
      if (p === "") return "/vault-root";
      return `/vault-root/${p}`;
    },
  };
}

/**
 * 会话 + 快照替身。
 * @param {{ sourcePath?: string, pageCount?: number, scale?: number }} [options]
 */
function sessionWithSnapshot(options = {}) {
  const sourcePath = options.sourcePath || "notes/我的笔记.md";
  const scale = options.scale || 2;
  const session = createNoteCardSession({ sourcePath });
  const pageCount = options.pageCount || 3;
  const snapshot = session.freezeSnapshot({
    plan: { pages: Array.from({ length: pageCount }, (_, i) => ({ index: i + 1, entries: [] })) },
  });
  const pages = Array.from({ length: pageCount }, (_, i) => ({ pageId: `page-${i + 1}`, ordinal: i + 1 }));
  return { session, snapshot, pages, scale, sourcePath };
}

/** @param {ReturnType<sessionWithSnapshot>} ctx */
function buildExporter(ctx, fakeFs, capturePageBytes, extra = {}) {
  return createCardExporter({
    session: ctx.session,
    fs: fakeFs,
    capturePageBytes: capturePageBytes || (async () => ({ bytes: makePngBytes(750, 1000) })),
    now: () => new Date(2026, 8, 10, 22, 30, 0),
    ...extra,
  });
}

function exportInput(ctx, extra = {}) {
  return {
    rootPath: "卡片导出",
    configDir: ".obsidian",
    snapshotId: ctx.snapshot.snapshotId,
    sourcePath: ctx.sourcePath,
    scale: ctx.scale,
    pageSize: { width: 375, height: 500 },
    pages: ctx.pages,
    ...extra,
  };
}

describe("导出资格再校验（§5.4 出口防线）", () => {
  it("快照不存在 → snapshot-missing", async () => {
    const ctx = sessionWithSnapshot();
    const exporter = buildExporter(ctx, createFakeFs());
    const result = await exporter.exportCards(exportInput(ctx, { snapshotId: "nope" }));
    expect(result).toEqual({ ok: false, reason: "snapshot-missing" });
  });

  it("版本已变化（bump 后导出旧快照）→ version-changed，禁止导出旧结果", async () => {
    const ctx = sessionWithSnapshot();
    ctx.session.bumpContent();
    const exporter = buildExporter(ctx, createFakeFs());
    const result = await exporter.exportCards(exportInput(ctx));
    expect(result).toEqual({ ok: false, reason: "version-changed" });
  });

  it("有省略未确认 → omission-unconfirmed；确认后放行", async () => {
    const ctx = sessionWithSnapshot();
    const exporter = buildExporter(ctx, createFakeFs());
    const blocked = await exporter.exportCards(exportInput(ctx, { omissionTotal: 2 }));
    expect(blocked).toEqual({ ok: false, reason: "omission-unconfirmed" });
    ctx.session.confirmOmissions(ctx.snapshot.layoutKey);
    const okRun = await exporter.exportCards(exportInput(ctx, { omissionTotal: 2 }));
    expect(okRun.status).toBe("completed");
  });

  it("页序重复/非法/超出快照页计划 → 拒绝", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 2 });
    const exporter = buildExporter(ctx, createFakeFs());
    expect(await exporter.exportCards(exportInput(ctx, {
      pages: [{ pageId: "page-1", ordinal: 1 }, { pageId: "page-1", ordinal: 2 }],
    }))).toEqual({ ok: false, reason: "page-duplicate" });
    expect(await exporter.exportCards(exportInput(ctx, {
      pages: [{ pageId: "page-1", ordinal: 0 }],
    }))).toEqual({ ok: false, reason: "page-invalid" });
    expect(await exporter.exportCards(exportInput(ctx, {
      pages: [{ pageId: "page-9", ordinal: 9 }],
    }))).toEqual({ ok: false, reason: "page-out-of-range" });
    expect(await exporter.exportCards(exportInput(ctx, { pages: [] }))).toEqual({ ok: false, reason: "no-pages" });
  });

  it("预算：超过每批页数或总输出像素 → 拒绝（§5.5）", async () => {
    const ctx = sessionWithSnapshot();
    const exporter = buildExporter(ctx, createFakeFs());
    const manyPages = Array.from({ length: CARD_EXPORT_LIMITS.MAX_PAGES_PER_BATCH + 1 }, (_, i) => ({
      pageId: `page-${i + 1}`, ordinal: i + 1,
    }));
    expect(await exporter.exportCards(exportInput(ctx, { pages: manyPages }))).toEqual({ ok: false, reason: "budget-pages" });
    expect(await exporter.exportCards(exportInput(ctx, {
      pageSize: { width: 12000, height: 16000 },
    }))).toEqual({ ok: false, reason: "budget-pixels" });
  });

  it("路径配置非法 → 对应 reason，不写任何文件", async () => {
    const ctx = sessionWithSnapshot();
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs);
    const result = await exporter.exportCards(exportInput(ctx, { rootPath: "/etc" }));
    expect(result).toEqual({ ok: false, reason: "path-absolute" });
    expect(fakeFs.calls.mkdirs).toHaveLength(0);
  });

  it("mkdir 失败 → mkdir-failed，错误信息脱敏", async () => {
    const ctx = sessionWithSnapshot();
    const fakeFs = createFakeFs({ failMkdir: true });
    const exporter = buildExporter(ctx, fakeFs);
    const result = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("mkdir-failed");
    expect(result.detail).not.toContain("/Users/vault");
  });
});

describe("批次目录与逐页安全（§6.1）", () => {
  it("批次目录冲突重新生成标识，最多 5 次后停止且未覆盖任何旧文件", async () => {
    const ctx = sessionWithSnapshot();
    // 任何 "卡片导出/<笔记目录>/..." 的存在检查一律命中 → 5 次尝试全部冲突
    const fakeFs = createFakeFs();
    fakeFs.exists = async (p) => p.startsWith("卡片导出/") && p.split("/").length === 3;
    const exporter = buildExporter(ctx, fakeFs);
    const result = await exporter.exportCards(exportInput(ctx));
    expect(result).toEqual({ ok: false, reason: "batch-conflict" });
    expect(fakeFs.calls.mkdirs).toHaveLength(0);
  });

  it("批次内排他创建遇非本任务同名文件 → 立即停止整批，剩余页跳过，不覆盖不删除", async () => {
    const ctx = sessionWithSnapshot();
    const fakeFs = createFakeFs({
      conflictFor: (p) => p.endsWith("card-002.png"),
    });
    const exporter = buildExporter(ctx, fakeFs);
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("partial");
    const byId = Object.fromEntries(outcome.results.map((r) => [r.pageId, r]));
    expect(byId["page-1"].status).toBe("saved");
    expect(byId["page-2"].status).toBe("failed");
    expect(byId["page-2"].reason).toBe("path-conflict");
    expect(byId["page-3"].status).toBe("skipped");
    // 冲突文件未被写入（内容仍为非本任务占位）
    expect(String(fakeFs.calls.created.filter((p) => p.endsWith("card-002.png")).length)).toBe("1");
    expect(fakeFs.calls.removed.filter((p) => p.endsWith("card-002.png"))).toHaveLength(0);
  });

  it("捕获失败按页失败继续，不中断批次", async () => {
    const ctx = sessionWithSnapshot();
    const exporter = buildExporter(ctx, createFakeFs(), async ({ ordinal }) => {
      if (ordinal === 2) throw new Error("capture boom");
      return { bytes: makePngBytes(750, 1000) };
    });
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("partial");
    const byId = Object.fromEntries(outcome.results.map((r) => [r.pageId, r]));
    expect(byId["page-2"].status).toBe("failed");
    expect(byId["page-2"].reason).toBe("capture-failed");
    expect(byId["page-3"].status).toBe("saved");
  });

  it("非 PNG 输出 → capture-invalid 拒绝该页（PNG 头核验）", async () => {
    const ctx = sessionWithSnapshot();
    const exporter = buildExporter(ctx, createFakeFs(), async ({ ordinal }) => ({
      bytes: ordinal === 1 ? new Uint8Array([1, 2, 3]) : makePngBytes(750, 1000),
    }));
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    const byId = Object.fromEntries(outcome.results.map((r) => [r.pageId, r]));
    expect(byId["page-1"].reason).toBe("capture-invalid");
    expect(byId["page-1"].status).toBe("failed");
    expect(outcome.summary.saved).toBe(2);
  });

  it("符号链接重定向（祖先 realpath 越界）→ 拒绝该页并停止整批", async () => {
    const ctx = sessionWithSnapshot();
    // 批次目录（3 段）放行；更深层（图片路径 4 段）重定向 → 模拟「检查后目标变化/链接指向外部」
    const fakeFs = createFakeFs({
      redirectRealpath: (p) => p.split("/").length >= 4,
    });
    const exporter = buildExporter(ctx, fakeFs);
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("failed");
    expect(outcome.results[0].status).toBe("failed");
    expect(outcome.results[0].reason).toBe("path-redirect");
    expect(fakeFs.calls.created.filter((p) => p.endsWith(".png"))).toHaveLength(0);
  });

  it("realpath 能力不可验证 → 拒绝输出（不用词法路径冒充安全验证）", async () => {
    const ctx = sessionWithSnapshot();
    const fakeFs = createFakeFs({ realpathUnavailable: true });
    const exporter = buildExporter(ctx, fakeFs);
    const result = await exporter.exportCards(exportInput(ctx));
    expect(result).toEqual({ ok: false, reason: "realpath-unavailable" });
    expect(fakeFs.calls.created.filter((p) => p.endsWith(".png"))).toHaveLength(0);
  });
});

describe("取消语义（§6.2）", () => {
  it("取消后不再调度下一页；已启动页写入成功仍计入已保存", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 4 });
    const exporter = buildExporter(ctx, createFakeFs(), async ({ ordinal }) => {
      if (ordinal === 2) {
        // 第 2 页捕获启动前请求取消：该页已启动 → 写入成功仍计入
        const active = ctx.session.getActiveJob();
        if (active) ctx.session.requestCancel(active.jobId);
      }
      return { bytes: makePngBytes(750, 1000) };
    });
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("canceled");
    expect(outcome.summary.saved).toBe(2);
    expect(outcome.summary.canceled).toBe(2);
    // 任务收尾
    expect(ctx.session.hasActiveJob()).toBe(false);
    expect(ctx.session.getLastJob()?.state).toBe("canceled");
  });

  it("运行中不允许第二个导出任务（单会话单任务）", async () => {
    const ctx = sessionWithSnapshot();
    let releaseCapture;
    const gate = new Promise((resolve) => { releaseCapture = resolve; });
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs, async () => {
      await gate;
      return { bytes: makePngBytes(750, 1000) };
    });
    const first = exporter.exportCards(exportInput(ctx));
    const second = await exporter.exportCards(exportInput(ctx));
    expect(second).toEqual({ ok: false, reason: "export-in-progress" });
    releaseCapture();
    const outcome = await first;
    expect(/** @type {any} */ (outcome).status).toBe("completed");
  });
});

describe("逐页顺序与结果结构", () => {
  it("按页序捕获/保存/登记；尺寸取自 PNG 头；成功 PNG 不可变（写入一次）", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 2 });
    const fakeFs = createFakeFs();
    const sizes = { 1: [750, 1000], 2: [1125, 1500] };
    const exporter = buildExporter(ctx, fakeFs, async ({ ordinal }) => ({
      bytes: makePngBytes(sizes[ordinal][0], sizes[ordinal][1]),
    }));
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("completed");
    const pngWrites = fakeFs.calls.created.filter((p) => p.endsWith(".png"));
    expect(pngWrites).toHaveLength(2);
    expect(pngWrites[0].endsWith("card-001.png")).toBe(true);
    expect(pngWrites[1].endsWith("card-002.png")).toBe(true);
    // 尺寸取自 PNG 头，落到任务结果上（干净批次不写清单，见下方「写盘足迹」用例）
    expect(outcome.results.map((r) => [r.width, r.height])).toEqual([[750, 1000], [1125, 1500]]);
    // 选中导出保留正文页号：只导第 2 页时文件名仍为 card-002.png
    const onlySecond = /** @type {any} */ (await exporter.exportCards(exportInput(ctx, {
      pages: [{ pageId: "page-2", ordinal: 2 }],
    })));
    expect(onlySecond.status).toBe("completed");
    expect(fakeFs.calls.created.some((p) => p.endsWith("card-002.png") && p.split("/").length >= 4)).toBe(true);
  });

  it("错误细节脱敏：结果不泄露宿主绝对路径", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 1 });
    const exporter = buildExporter(ctx, createFakeFs(), async () => {
      throw new Error("EACCES: permission denied, open /Users/david/secret/x.png");
    });
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("failed");
    expect(outcome.results[0].detail).not.toContain("/Users/david");
  });

  it("同快照重复导出（同版本无编辑）→ 新批次，互不影响", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 1 });
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs);
    const first = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    const second = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    expect(first.batchDir).not.toBe(second.batchDir);
  });
});

describe("进度回调与写盘足迹（B05 进度反馈 / §6.1 不在 vault 留瞬时文件）", () => {
  it("onProgress 依 begin → page（含当前页号）→ done 上报，计数以清单为准", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 3 });
    const fakeFs = createFakeFs();
    /** @type {any[]} */
    const events = [];
    const exporter = buildExporter(ctx, fakeFs, undefined, { onProgress: (e) => events.push(e) });
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("completed");

    expect(events[0]).toMatchObject({ stage: "begin", total: 3, settled: 0, saved: 0, failed: 0 });
    const pageEvents = events.filter((e) => e.stage === "page");
    expect(pageEvents.map((e) => e.current)).toEqual([1, 2, 3]);
    // 页首事件：前序页已定页
    expect(pageEvents[2]).toMatchObject({ settled: 2, saved: 2 });
    expect(events[events.length - 1]).toMatchObject({ stage: "done", total: 3, settled: 3, saved: 3, failed: 0 });
  });

  it("失败页同样计入进度与任务结果（进度与结果页同源）", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 2 });
    const fakeFs = createFakeFs();
    /** @type {any[]} */
    const events = [];
    const exporter = buildExporter(ctx, fakeFs, async ({ ordinal }) => {
      if (ordinal === 1) throw new Error("capture boom");
      return { bytes: makePngBytes(750, 1000) };
    }, { onProgress: (e) => events.push(e) });
    await exporter.exportCards(exportInput(ctx));

    const done = events[events.length - 1];
    expect(done).toMatchObject({ stage: "done", settled: 2, saved: 1, failed: 1 });
    const job = /** @type {any} */ (ctx.session.getLastJob());
    expect(job.results.map((r) => `${r.pageId}:${r.status}`).sort()).toEqual(["page-1:failed", "page-2:saved"]);
  });

  it("进度回调抛错不影响导出结果", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 2 });
    const exporter = buildExporter(ctx, createFakeFs(), undefined, {
      onProgress: () => { throw new Error("view boom"); },
    });
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("completed");
  });

  it("导出全程不在 vault 创建/删除临时文件（避免同步类插件的删除事件）", async () => {
    const ctx = sessionWithSnapshot({ pageCount: 3 });
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs);
    await exporter.exportCards(exportInput(ctx));

    // 不产生任何删除；产物只有图片与清单，无 .tmp 瞬时文件
    expect(fakeFs.calls.removed).toEqual([]);
    const touched = [...fakeFs.calls.created, ...fakeFs.calls.written];
    expect(touched.some((p) => p.includes(".tmp"))).toBe(false);
    expect(touched.every((p) => p.endsWith(".png") || p.endsWith(EXPORT_MANIFEST_NAME))).toBe(true);
    // 干净批次不落清单（2026-09-12 策略）：全部成功时一次清单写入都没有
    const manifestWrites = fakeFs.calls.written.filter((p) => p.endsWith(EXPORT_MANIFEST_NAME));
    expect(manifestWrites).toEqual([]);
  });
});
