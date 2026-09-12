// @vitest-environment node
import { describe, it, expect } from "vitest";

/* 卡片导出清单（export-manifest.json）语义测试（B04，规划 §6.1）。
   2026-09-12 策略变更（David）：清单只在**批次出现失败页**时才落盘——
   干净批次（全部成功）与用户取消且无失败页的批次都不写文件，
   因为清单的价值只在「哪几页没导成、为什么」；全部成功时它是零信息量噪声。
   本文件覆盖：干净批次零写入 / 失败页触发首次写入 / 写入失败 → paused-manifest 与
   manifestPending 的修复收尾 / 清单内容不含正文与私有 URL / 重试失败页的批次归属核验。
   捕获与路径行为见 card_exporter.test.js。 */

import { createNoteCardSession } from "../services/card-session.js";
import { createCardExporter } from "../services/card-exporter.js";
import { EXPORT_MANIFEST_NAME } from "../services/card-export-paths.js";

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
 * 清单故障注入替身（清单更新即覆盖写 export-manifest.json，按写入次序计数）。
 * @param {{ failManifestOverwriteFrom?: number, failManifestOverwriteUntil?: number }} [options]
 */
function createFakeFs(options = {}) {
  const files = new Map();
  const calls = { created: [], written: [], removed: [], mkdirs: [] };
  let manifestOverwrites = 0;
  return {
    files,
    calls,
    /** 本批次的清单写入次数（干净批次应为 0） */
    manifestWrites() {
      return calls.written.filter((p) => p.endsWith(EXPORT_MANIFEST_NAME));
    },
    async exists(p) { return files.has(p); },
    async mkdir(p) { calls.mkdirs.push(p); files.set(p, { type: "dir" }); },
    async createBinaryExclusive(p, bytes) {
      calls.created.push(p);
      if (files.has(p)) return { ok: false, reason: "conflict" };
      files.set(p, { type: "file", bytes: Uint8Array.from(bytes) });
      return { ok: true };
    },
    async writeBinary(p, bytes) {
      calls.written.push(p);
      if (p.endsWith(EXPORT_MANIFEST_NAME)) {
        manifestOverwrites += 1;
        const inFailRange = manifestOverwrites >= options.failManifestOverwriteFrom &&
          (!options.failManifestOverwriteUntil || manifestOverwrites <= options.failManifestOverwriteUntil);
        if (inFailRange) {
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
      if (p === "") return "/vault-root";
      return `/vault-root/${p}`;
    },
  };
}

function sessionWithSnapshot(pageCount = 3) {
  const session = createNoteCardSession({ sourcePath: "notes/清单笔记.md" });
  const snapshot = session.freezeSnapshot({
    plan: { pages: Array.from({ length: pageCount }, (_, i) => ({ index: i + 1, entries: [] })) },
  });
  const pages = Array.from({ length: pageCount }, (_, i) => ({ pageId: `page-${i + 1}`, ordinal: i + 1 }));
  return { session, snapshot, pages };
}

function buildExporter(ctx, fakeFs, capturePageBytes) {
  return createCardExporter({
    session: ctx.session,
    fs: fakeFs,
    capturePageBytes: capturePageBytes || (async () => ({ bytes: makePngBytes(750, 1000) })),
    now: () => new Date(2026, 8, 10, 22, 30, 0),
  });
}

function exportInput(ctx, extra = {}) {
  return {
    rootPath: "卡片导出",
    configDir: ".obsidian",
    snapshotId: ctx.snapshot.snapshotId,
    sourcePath: ctx.sourcePath,
    scale: 2,
    pageSize: { width: 375, height: 500 },
    pages: ctx.pages,
    ...extra,
  };
}

/** 只在指定页码捕获失败（其余正常产 PNG） */
function failOnOrdinal(ordinals) {
  const failSet = new Set(Array.isArray(ordinals) ? ordinals : [ordinals]);
  return async ({ ordinal }) => {
    if (failSet.has(ordinal)) throw new Error("capture boom");
    return { bytes: makePngBytes(750, 1000) };
  };
}

describe("清单：干净批次不落盘", () => {
  it("全部成功 → 导出目录里没有 export-manifest.json", async () => {
    const ctx = sessionWithSnapshot(3);
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs);
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("completed");
    expect(outcome.manifestPending).toBe(false);
    expect(fakeFs.manifestWrites()).toEqual([]);
    expect(fakeFs.calls.created.filter((p) => p.endsWith(".png"))).toHaveLength(3);
    // 结果仍完整可读（账本在内存里，不依赖清单文件）
    expect(outcome.results.map((r) => r.status)).toEqual(["saved", "saved", "saved"]);
  });

  it("用户取消且无失败页 → 同样不落清单", async () => {
    const ctx = sessionWithSnapshot(4);
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs, async ({ ordinal }) => {
      if (ordinal === 2) {
        const active = ctx.session.getActiveJob();
        if (active) ctx.session.requestCancel(active.jobId);
      }
      return { bytes: makePngBytes(750, 1000) };
    });
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("canceled");
    expect(outcome.summary).toMatchObject({ saved: 2, failed: 0, canceled: 2 });
    expect(fakeFs.manifestWrites()).toEqual([]);
  });
});

describe("清单：出现失败页才落盘", () => {
  it("首个失败页即启用落盘；收尾再写一次，全部为同一路径的覆盖写", async () => {
    const ctx = sessionWithSnapshot(3);
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs, failOnOrdinal(2));
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("partial");
    expect(outcome.summary).toMatchObject({ total: 3, saved: 2, failed: 1 });
    // 第 2 页失败启用落盘 → 第 3 页成功后写一次 + 收尾写一次
    const writes = fakeFs.manifestWrites();
    expect(writes.length).toBe(2);
    expect(new Set(writes).size).toBe(1); // 覆盖写同一路径，不产生第二个文件
    expect(writes.every((p) => p === outcome.manifestPath)).toBe(true);
    expect(fakeFs.calls.removed).toEqual([]);
    expect(writes.some((p) => p.includes(".tmp"))).toBe(false);
  });

  it("清单含批次/快照/页序/尺寸/结果与失败原因，不含正文与图片 URL", async () => {
    const ctx = sessionWithSnapshot(2);
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs, failOnOrdinal(2));
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    const manifest = JSON.parse(await fakeFs.readText(outcome.manifestPath));
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.batchId).toBeTruthy();
    expect(manifest.snapshotId).toBe(ctx.snapshot.snapshotId);
    expect(manifest.layoutKey).toBe(ctx.snapshot.layoutKey);
    expect(manifest.scale).toBe(2);
    expect(manifest.pages).toHaveLength(2);
    expect(manifest.pages[0]).toMatchObject({
      pageId: "page-1", ordinal: 1, fileName: "card-001.png", status: "saved",
      width: 750, height: 1000,
    });
    expect(manifest.pages[1]).toMatchObject({ pageId: "page-2", status: "failed", reason: "capture-failed" });
    const serialized = JSON.stringify(manifest);
    expect(serialized.includes("data:image")).toBe(false);
    expect(serialized.includes("http")).toBe(false);
    // 正文内容不写入清单（本层不接触正文）
    expect(serialized.includes("markdown")).toBe(false);
  });
});

describe("清单：写入失败 → paused-manifest / manifestPending", () => {
  it("清单写不进去 → 图片保留、停止后续页、报 paused-manifest；修复后 resume 只跑剩余页", async () => {
    const ctx = sessionWithSnapshot(4);
    // 清单写入次序：p2 成功后(1) 失败 → 暂停；retryManifest(2) 恢复；resume 后 p3(3)/p4(4) 与收尾(5) 成功
    const fakeFs = createFakeFs({ failManifestOverwriteFrom: 1, failManifestOverwriteUntil: 1 });
    /** @type {string[]} */
    const capturedPages = [];
    const exporter = buildExporter(ctx, fakeFs, async ({ ordinal }) => {
      capturedPages.push(`page-${ordinal}`);
      // p1 仅首次捕获失败（模拟瞬时故障），重试时恢复
      if (ordinal === 1 && capturedPages.filter((p) => p === "page-1").length === 1) {
        throw new Error("capture boom");
      }
      return { bytes: makePngBytes(750, 1000) };
    });
    const paused = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(paused.status).toBe("paused-manifest");
    expect(paused.manifestPending).toBe(true);
    // p1 失败（未产图）、p2 已保存；p3/p4 未捕获
    expect(fakeFs.calls.created.filter((p) => p.endsWith(".png"))).toHaveLength(1);
    expect(capturedPages).toEqual(["page-1", "page-2"]);
    expect(ctx.session.hasActiveJob()).toBe(true); // 任务未收尾
    expect(paused.summary).toMatchObject({ saved: 1, failed: 1 });

    // 修复清单：仍有剩余页 → 不在这里收尾
    const repaired = await exporter.retryManifest();
    expect(repaired.ok).toBe(true);
    expect(/** @type {any} */ (repaired).finalized).toBeUndefined();

    // 续跑：不再捕获已保存页
    const resumed = /** @type {any} */ (await exporter.resume());
    expect(resumed.ok).toBe(true);
    expect(resumed.outcome.status).toBe("partial"); // p1 仍失败
    expect(capturedPages).toEqual(["page-1", "page-2", "page-3", "page-4"]);
    expect(fakeFs.calls.created.filter((p) => p.endsWith(".png"))).toHaveLength(3);
    expect(ctx.session.hasActiveJob()).toBe(false);

    // 重试失败页 → 全绿收尾
    const retry = /** @type {any} */ (await exporter.retryFailedPages());
    expect(retry.ok).toBe(true);
    expect(retry.outcome.status).toBe("completed");
    expect(capturedPages).toEqual(["page-1", "page-2", "page-3", "page-4", "page-1"]);
    const manifest = JSON.parse(await fakeFs.readText(paused.manifestPath));
    expect(manifest.summary).toEqual({ total: 4, saved: 4, failed: 0, canceled: 0, skipped: 0 });
  });

  it("清单重试失败仍可再次重试；resume 仅在修复后允许", async () => {
    const ctx = sessionWithSnapshot(3);
    const fakeFs = createFakeFs({ failManifestOverwriteFrom: 1 });
    const exporter = buildExporter(ctx, fakeFs, failOnOrdinal(1));
    const paused = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(paused.status).toBe("paused-manifest");
    // 仍失败
    const failedRetry = await exporter.retryManifest();
    expect(failedRetry.ok).toBe(false);
    // 直接 resume（清单未修复）→ 修复尝试仍失败 → 拒绝续跑
    const blocked = await exporter.resume();
    expect(blocked).toEqual({ ok: false, reason: "manifest-unhealthy" });
  });

  it("收尾清单写失败 → partial + manifestPending；重试清单成功后收尾并清除标记", async () => {
    const ctx = sessionWithSnapshot(2);
    // 写入次序：p2 成功后(1) 成功，收尾(2) 失败，重试清单(3) 成功，重新收尾(4) 成功
    const fakeFs = createFakeFs({ failManifestOverwriteFrom: 2, failManifestOverwriteUntil: 2 });
    const exporter = buildExporter(ctx, fakeFs, failOnOrdinal(1));
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    // 有失败页（p1）才是 partial 的原因；manifestPending 表示记录本身也没落成
    expect(outcome.status).toBe("partial");
    expect(outcome.manifestPending).toBe(true);
    expect(outcome.summary).toMatchObject({ saved: 1, failed: 1 });
    expect(ctx.session.hasActiveJob()).toBe(false);

    const retry = await exporter.retryManifest();
    expect(retry.ok).toBe(true);
    expect(/** @type {any} */ (retry).finalized).toBe(true);
    expect(/** @type {any} */ (retry).outcome.status).toBe("partial");
    expect(/** @type {any} */ (retry).outcome.manifestPending).toBe(false);
    const manifest = JSON.parse(await fakeFs.readText(outcome.manifestPath));
    expect(manifest.pages[0].status).toBe("failed");
    expect(manifest.pages[1].status).toBe("saved");
  });
});

describe("清单：归属与批次信息", () => {
  it("重试失败页：外部清单（批次不匹配）→ manifest-foreign 拒绝，不覆盖他人清单", async () => {
    const ctx = sessionWithSnapshot(2);
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs, failOnOrdinal(2));
    const first = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(first.status).toBe("partial");
    // 篡改清单归属（模拟非本任务的清单）
    const tampered = JSON.parse(await fakeFs.readText(first.manifestPath));
    tampered.batchId = "someone-else";
    const encoder = new TextEncoder();
    await fakeFs.writeBinary(first.manifestPath, encoder.encode(JSON.stringify(tampered)));
    const retry = await exporter.retryFailedPages();
    expect(retry).toEqual({ ok: false, reason: "manifest-foreign" });
  });

  it("失败页同快照重试：只重捕失败页，成功页不重写，最终 completed", async () => {
    const ctx = sessionWithSnapshot(3);
    const fakeFs = createFakeFs();
    /** @type {string[]} */
    const capturedPages = [];
    const exporter = buildExporter(ctx, fakeFs, async ({ ordinal }) => {
      capturedPages.push(`page-${ordinal}`);
      // ordinal 2 仅第一次捕获失败（模拟瞬时故障），重试时恢复
      if (ordinal === 2 && capturedPages.filter((p) => p === "page-2").length === 1) {
        throw new Error("capture boom");
      }
      return { bytes: makePngBytes(750, 1000) };
    });
    const first = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(first.status).toBe("partial");
    expect(first.summary).toMatchObject({ total: 3, saved: 2, failed: 1 });

    // 换正常捕获后重试失败页
    const retry = /** @type {any} */ (await exporter.retryFailedPages());
    expect(retry.ok).toBe(true);
    expect(retry.outcome.status).toBe("completed");
    expect(capturedPages).toEqual(["page-1", "page-2", "page-3", "page-2"]);
    // 成功页只写过一次
    expect(fakeFs.calls.created.filter((p) => p.endsWith("card-001.png"))).toHaveLength(1);
    expect(fakeFs.calls.created.filter((p) => p.endsWith("card-002.png"))).toHaveLength(1);
    const manifest = JSON.parse(await fakeFs.readText(first.manifestPath));
    expect(manifest.summary).toEqual({ total: 3, saved: 3, failed: 0, canceled: 0, skipped: 0 });
    expect(ctx.session.getLastJob()?.state).toBe("completed");
  });

  it("getBatchInfo 暴露批次目录与清单路径（供结果定位）", async () => {
    const ctx = sessionWithSnapshot(1);
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs);
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    const info = exporter.getBatchInfo();
    expect(info).toBeTruthy();
    expect(info.batchDir).toBe(outcome.batchDir);
    expect(info.manifestPath).toBe(`${outcome.batchDir}/${EXPORT_MANIFEST_NAME}`);
  });
});
