// @vitest-environment node
import { describe, it, expect } from "vitest";

/* 卡片导出清单（export-manifest.json）语义测试（B04，规划 §6.1 部分成功语义）：
   首份空清单失败 → 不写图片；逐页清单更新失败 → 图片保留、停止后续页、
   清单单独重试成功后续跑剩余页（不重新捕获已保存图片）；最终清单失败 →
   partial + manifestPending，重试收尾后 completed；清单内容不含正文/私有 URL；
   重试失败页时核验批次归属（外部清单拒绝）。捕获/路径行为见 card_exporter.test.js。 */

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

describe("清单：首份空清单失败 → 不开始写图片", () => {
  it("首份清单写入失败即失败收尾，任何图片都未写入", async () => {
    const ctx = sessionWithSnapshot(3);
    const fakeFs = createFakeFs({ failManifestOverwriteFrom: 1 });
    const exporter = buildExporter(ctx, fakeFs);
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("failed");
    expect(outcome.manifestPending).toBe(false); // 首份清单失败属于「未开始」而非「记录未完成」
    expect(outcome.reason).toBe("manifest-write-failed");
    expect(fakeFs.calls.created.filter((p) => p.endsWith(".png"))).toHaveLength(0);
    // 任务收尾，不留运行中任务
    expect(ctx.session.hasActiveJob()).toBe(false);
  });
});

describe("清单：逐页更新失败 → 部分成功 + 可修复续跑", () => {
  it("图片保留、停止后续页、报 paused-manifest；修复清单后 resume 续跑不重捕已存页", async () => {
    const ctx = sessionWithSnapshot(3);
    // 仅第 3 次清单写入失败（p2 的清单更新）：首份(1)+p1(2) 成功，p2(3) 失败，之后恢复
    const fakeFs = createFakeFs({ failManifestOverwriteFrom: 3, failManifestOverwriteUntil: 3 });
    /** @type {string[]} */
    const capturedPages = [];
    const exporter = buildExporter(ctx, fakeFs, async ({ ordinal }) => {
      capturedPages.push(`page-${ordinal}`);
      return { bytes: makePngBytes(750, 1000) };
    });
    const paused = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(paused.status).toBe("paused-manifest");
    expect(paused.manifestPending).toBe(true);
    // p1、p2 已保存（p2 写盘在清单更新前），p3 未捕获
    expect(fakeFs.calls.created.filter((p) => p.endsWith(".png"))).toHaveLength(2);
    expect(capturedPages).toEqual(["page-1", "page-2"]);
    expect(ctx.session.hasActiveJob()).toBe(true); // 任务仍在运行（未收尾）
    expect(paused.summary.saved).toBe(2);

    // 修复后继续：不再捕获已保存页，仅剩余页
    const resumed = /** @type {any} */ (await exporter.resume());
    expect(resumed.ok).toBe(true);
    expect(resumed.outcome.status).toBe("completed");
    expect(capturedPages).toEqual(["page-1", "page-2", "page-3"]);
    expect(fakeFs.calls.created.filter((p) => p.endsWith(".png"))).toHaveLength(3);
    expect(ctx.session.hasActiveJob()).toBe(false);
    const manifest = JSON.parse(await fakeFs.readText(paused.manifestPath));
    expect(manifest.summary).toEqual({ total: 3, saved: 3, failed: 0, canceled: 0, skipped: 0 });
  });

  it("清单重试失败仍可再次重试；resume 仅在修复后允许", async () => {
    const ctx = sessionWithSnapshot(2);
    const fakeFs = createFakeFs({ failManifestOverwriteFrom: 3 });
    const exporter = buildExporter(ctx, fakeFs);
    const paused = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(paused.status).toBe("paused-manifest");
    // 仍失败
    const failedRetry = await exporter.retryManifest();
    expect(failedRetry.ok).toBe(false);
    // 直接 resume（清单未修复）→ 修复尝试仍失败 → 拒绝续跑
    const blocked = await exporter.resume();
    expect(blocked).toEqual({ ok: false, reason: "manifest-unhealthy" });
  });
});

describe("清单：最终写入失败 → partial + manifestPending，重试收尾", () => {
  it("逐页更新成功但最终清单失败 → 报部分成功；重试清单成功后收尾 completed", async () => {
    const ctx = sessionWithSnapshot(3);
    // 清单覆盖写：首份(1) + p1(2) + p2(3) + p3(4) 成功，最终(5) 失败（仅此一次），重试(6) 恢复
    const fakeFs = createFakeFs({ failManifestOverwriteFrom: 5, failManifestOverwriteUntil: 5 });
    const exporter = buildExporter(ctx, fakeFs);
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx)));
    expect(outcome.status).toBe("partial");
    expect(outcome.manifestPending).toBe(true);
    expect(outcome.summary.saved).toBe(3);
    expect(ctx.session.hasActiveJob()).toBe(false);
    expect(ctx.session.getLastJob()?.state).toBe("partial");

    const retry = await exporter.retryManifest();
    expect(retry.ok).toBe(true);
    expect(/** @type {any} */ (retry).finalized).toBe(true);
    expect(/** @type {any} */ (retry).outcome.status).toBe("completed");
    expect(/** @type {any} */ (retry).outcome.manifestPending).toBe(false);
  });
});

describe("清单：内容与归属", () => {
  it("清单含批次/快照/页序/尺寸/结果，不含正文与图片 URL", async () => {
    const ctx = sessionWithSnapshot(2);
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs);
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
    const serialized = JSON.stringify(manifest);
    expect(serialized.includes("data:image")).toBe(false);
    expect(serialized.includes("http")).toBe(false);
    // 正文内容不写入清单（本层不接触正文）
    expect(serialized.includes("markdown")).toBe(false);
  });

  it("重试失败页：外部清单（批次不匹配）→ manifest-foreign 拒绝，不覆盖他人清单", async () => {
    const ctx = sessionWithSnapshot(2);
    const fakeFs = createFakeFs();
    const exporter = buildExporter(ctx, fakeFs, async ({ ordinal }) => {
      if (ordinal === 2) throw new Error("capture boom");
      return { bytes: makePngBytes(750, 1000) };
    });
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
