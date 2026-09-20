// @vitest-environment node
import { describe, it, expect } from 'vitest';

/* 导出链路 × 封面（C01③）：page.fileName 覆盖文件名（card-000.png）、封面 ordinal=0 合法性。 */

import { createNoteCardSession } from "../services/card-session.js";
import { createCardExporter } from "../services/card-exporter.js";

function makePngBytes(width, height) {
  const bytes = new Uint8Array(24);
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach((b, i) => { bytes[i] = b; });
  const dv = new DataView(bytes.buffer);
  dv.setUint32(8, 13);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return bytes;
}

function createFakeFs() {
  const files = new Map();
  return {
    files,
    async exists(p) { return files.has(p); },
    async mkdir(p) { files.set(p, { type: "dir" }); },
    async createBinaryExclusive(p, bytes) {
      if (files.has(p)) return { ok: false, reason: "conflict" };
      files.set(p, { type: "file", bytes: Uint8Array.from(bytes) });
      return { ok: true };
    },
    async writeBinary(p, bytes) { files.set(p, { type: "file", bytes: Uint8Array.from(bytes) }); },
    async remove() {},
    async readText(p) {
      const f = files.get(p);
      if (!f || f.type !== "file") throw new Error(`missing: ${p}`);
      return new TextDecoder().decode(f.bytes);
    },
    async realpath(p) { return p === "" ? "/vault-root" : `/vault-root/${p}`; },
  };
}

function sessionWithSnapshot(pageCount = 1) {
  const session = createNoteCardSession({ sourcePath: "notes/笔记.md" });
  const snapshot = session.freezeSnapshot({
    plan: { pages: Array.from({ length: pageCount }, (_, i) => ({ index: i + 1, entries: [] })) },
  });
  return { session, snapshot };
}

function exportInput(ctx, pages, extra = {}) {
  return {
    rootPath: "卡片导出",
    configDir: ".obsidian",
    snapshotId: ctx.snapshot.snapshotId,
    sourcePath: "notes/笔记.md",
    scale: 2,
    pageSize: { width: 375, height: 500, heightExact: 500 },
    pages,
    ...extra,
  };
}

describe("导出 × 封面（C01③）", () => {
  it("封面页写 card-000.png，正文页写 card-001.png", async () => {
    const ctx = sessionWithSnapshot(1);
    const fakeFs = createFakeFs();
    const exporter = createCardExporter({
      session: ctx.session,
      fs: fakeFs,
      capturePageBytes: async () => ({ bytes: makePngBytes(750, 1000) }),
      now: () => new Date(2026, 8, 13, 9, 0, 0),
    });
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx, [
      { pageId: "cover", ordinal: 0, fileName: "card-000.png" },
      { pageId: "page-1", ordinal: 1 },
    ])));
    expect(outcome.status).toBe("completed");
    const names = [...fakeFs.files.keys()].filter((p) => p.endsWith(".png")).map((p) => p.split("/").pop());
    expect(names).toContain("card-000.png");
    expect(names).toContain("card-001.png");
    // 命名意图：整套导出按文件名排序时封面自然在第一位（card-000.png < card-001.png）
    expect([...names].sort()[0]).toBe("card-000.png");
  });

  it("封面页 fileName 不是 card-000.png → page-invalid 拒绝", async () => {
    const ctx = sessionWithSnapshot(1);
    const fakeFs = createFakeFs();
    const exporter = createCardExporter({
      session: ctx.session,
      fs: fakeFs,
      capturePageBytes: async () => ({ bytes: makePngBytes(750, 1000) }),
      now: () => new Date(2026, 8, 13, 9, 0, 0),
    });
    const outcome = /** @type {any} */ (await exporter.exportCards(exportInput(ctx, [
      { pageId: "cover", ordinal: 0, fileName: "card-099.png" },
    ])));
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("page-invalid");
  });
});
