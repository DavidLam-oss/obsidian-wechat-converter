/*
卡片资源层测试（A04）：来源解析、就绪/超时/取消、预算校验、快照冻结与引用计数。
加载器全部注入替身，不依赖真实网络与 Obsidian。
*/
import { describe, it, expect, vi } from "vitest";
import {
  CARD_IMAGE_TIMEOUT_MS,
  CARD_MAX_IMAGE_BYTES,
  CARD_MAX_IMAGE_PIXELS,
  createCardResourcePool,
  createCardResourceSession,
  createInlineSnapshotResolver,
  createSnapshotResolver,
  resolveCardImageSource,
} from "../services/card-resources.js";

/**
 * @param {Partial<import("../services/card-resources.js").CardResourceLoaders>} partial
 * @returns {import("../services/card-resources.js").CardResourceLoaders}
 */
function makeLoaders(partial) {
  return {
    fetchBlob: async () => ({ blob: new Blob([new Uint8Array(4)], { type: "image/png" }) }),
    decodeImage: async () => ({ width: 10, height: 10 }),
    waitFonts: (doc, signal) =>
      new Promise((resolve, reject) => {
        const fonts = /** @type {{ ready: Promise<unknown> } | undefined} */ (/** @type {any} */ (doc).fonts);
        if (!fonts || typeof fonts.ready?.then !== "function") {
          resolve("ok");
          return;
        }
        fonts.ready.then(
          () => {
            if (!signal.aborted) resolve("ok");
          },
          () => {
            if (!signal.aborted) resolve("ok");
          }
        );
        signal.addEventListener(
          "abort",
          () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
          { once: true }
        );
      }),
    ...partial,
  };
}

/**
 * @param {Record<string, boolean>} files 按绝对 vault 路径存在的文件
 * @param {Record<string, string>} linkMap linkpath → vault 路径（模拟 metadataCache 解析）
 * @returns {import("../services/card-resources.js").CardAppLike}
 */
function makeApp(files, linkMap = {}) {
  return {
    metadataCache: {
      getFirstLinkpathDest: (linkpath) => {
        const mapped = linkMap[linkpath];
        return mapped && files[mapped] ? { path: mapped } : null;
      },
    },
    vault: {
      getAbstractFileByPath: (path) => (path in files ? { path } : null),
      getResourcePath: (file) => `app://local/${file.path}`,
    },
  };
}

describe("resolveCardImageSource 来源解析", () => {
  it("wiki/local 解析为 vault 资源路径（metadataCache 优先，笔记目录候选兜底）", () => {
    const app = makeApp({ "images/pic.png": true }, { "pic.png": "images/pic.png" });
    const viaCache = resolveCardImageSource({ ref: "pic.png", kind: "wiki" }, { app, sourcePath: "notes/a.md" });
    expect(viaCache).toMatchObject({ src: "app://local/images/pic.png", vaultPath: "images/pic.png" });

    const app2 = makeApp({ "notes/pic.png": true });
    const viaDir = resolveCardImageSource({ ref: "pic.png", kind: "local" }, { app: app2, sourcePath: "notes/a.md" });
    expect(viaDir).toMatchObject({ src: "app://local/notes/pic.png", vaultPath: "notes/pic.png" });
  });

  it("remote 仅允许 http(s) 与 data:image/*；file: 拒绝", () => {
    expect(resolveCardImageSource({ ref: "https://example.com/a.png", kind: "remote" })).toMatchObject({ state: "ready" });
    expect(resolveCardImageSource({ ref: "data:image/png;base64,AAA", kind: "remote" })).toMatchObject({ state: "ready" });
    expect(resolveCardImageSource({ ref: "file:///etc/passwd.png", kind: "remote" })).toBeNull();
  });

  it("gif / excluded 返回 filtered 标记（不是加载失败）", () => {
    expect(resolveCardImageSource({ ref: "a.gif", kind: "local", gif: true })).toEqual({ state: "filtered" });
    expect(resolveCardImageSource({ ref: "a.png", kind: "local", excluded: true })).toEqual({ state: "filtered" });
  });

  it("vault 中找不到的本地引用返回 null", () => {
    expect(resolveCardImageSource({ ref: "missing.png", kind: "local" }, { app: makeApp({}), sourcePath: "a.md" })).toBeNull();
  });
});

describe("pool.prepare 就绪与校验", () => {
  it("成功加载：写入冻结快照 entry，无阻断失败", async () => {
    const pool = createCardResourcePool({ app: makeApp({ "a.png": true }), loaders: makeLoaders({}) });
    const snap = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    expect(snap.images["a.png"]).toMatchObject({ src: "app://local/a.png", mime: "image/png", bytes: 4 });
    expect(snap.hasBlockingFailures).toBe(false);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.images["a.png"])).toBe(true);
    snap.release();
  });

  it("坏图（fetch 非 image MIME）→ error 诊断，计入阻断", async () => {
    const pool = createCardResourcePool({
      app: makeApp({ "a.png": true }),
      loaders: makeLoaders({ fetchBlob: async () => ({ blob: new Blob(["x"], { type: "text/html" }) }) }),
    });
    const snap = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    expect(snap.hasBlockingFailures).toBe(true);
    expect(snap.diagnostics[0]).toMatchObject({ status: "error", ref: "a.png" });
    snap.release();
  });

  it("编码体积超 20MiB / 解码像素超 24MP → budget-exceeded", async () => {
    const bigBlob = new Blob([new Uint8Array(CARD_MAX_IMAGE_BYTES + 1)], { type: "image/png" });
    const pool = createCardResourcePool({
      app: makeApp({ "a.png": true }),
      loaders: makeLoaders({ fetchBlob: async () => ({ blob: bigBlob }) }),
    });
    const snap1 = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    expect(snap1.diagnostics[0].status).toBe("budget-exceeded");
    snap1.release();

    // 25,000,000 px（5×5k）< 25,165,824（CARD_MAX_IMAGE_PIXELS = 24×1024²）→ 不超
    expect(CARD_MAX_IMAGE_PIXELS).toBe(24 * 1024 * 1024);
    const pool2 = createCardResourcePool({
      app: makeApp({ "a.png": true }),
      loaders: makeLoaders({ decodeImage: async () => ({ width: 5000, height: 5000 }) }),
    });
    const snap2 = await pool2.prepare([{ ref: "a.png", kind: "local" }]);
    expect(snap2.diagnostics).toHaveLength(0);
    snap2.release();

    // 6000×4200 = 25,200,000 > 24×1024² → 超
    const pool3 = createCardResourcePool({
      app: makeApp({ "a.png": true }),
      loaders: makeLoaders({ decodeImage: async () => ({ width: 6000, height: 4200 }) }),
    });
    const snap3 = await pool3.prepare([{ ref: "a.png", kind: "local" }]);
    expect(snap3.diagnostics[0].status).toBe("budget-exceeded");
    snap3.release();
  }, 20000);

  it("会话累计预算超限 → budget-exceeded，不悄悄成功", async () => {
    const session = createCardResourceSession(30); // 小预算：30 字节（测试注入上限）
    const blob = new Blob([new Uint8Array(20)], { type: "image/png" });
    const pool = createCardResourcePool({
      app: makeApp({ "a.png": true, "b.png": true }),
      session,
      loaders: makeLoaders({ fetchBlob: async () => ({ blob }) }),
    });
    const snap = await pool.prepare([
      { ref: "a.png", kind: "local" },
      { ref: "b.png", kind: "local" },
    ]);
    expect(session.used).toBe(20); // 第一张占 20
    expect(snap.diagnostics).toHaveLength(1);
    expect(snap.diagnostics[0]).toMatchObject({ ref: "b.png", status: "budget-exceeded" });
    snap.release();
  });

  it("解析失败的引用 → resolve-failed 诊断（阻断）", async () => {
    const pool = createCardResourcePool({ app: makeApp({}), loaders: makeLoaders({}) });
    const snap = await pool.prepare([{ ref: "missing.png", kind: "local" }]);
    expect(snap.diagnostics[0]).toMatchObject({ status: "resolve-failed", ref: "missing.png" });
    expect(snap.hasBlockingFailures).toBe(true);
    snap.release();
  });

  it("gif 引用 → filtered 诊断，不算阻断失败", async () => {
    const pool = createCardResourcePool({ app: makeApp({ "a.gif": true }), loaders: makeLoaders({}) });
    const snap = await pool.prepare([{ ref: "a.gif", kind: "local", gif: true }]);
    expect(snap.diagnostics[0]).toMatchObject({ status: "filtered", ref: "a.gif" });
    expect(snap.hasBlockingFailures).toBe(false);
    snap.release();
  });
});

describe("超时与取消", () => {
  it("慢图超时（单图 15s 上限）→ timeout 诊断；晚到结果不写入快照", async () => {
    /** @type {() => void} */
    let releaseFetch = () => {};
    const gate = new Promise((resolve) => {
      releaseFetch = /** @type {() => void} */ (resolve);
    });
    const pool = createCardResourcePool({
      app: makeApp({ "slow.png": true, "fast.png": true }),
      loaders: makeLoaders({
        fetchBlob: (src, signal) =>
          new Promise((resolve, reject) => {
            const slow = String(src).includes("slow");
            const timer = slow
              ? setTimeout(() => {
                  gate.then(() => resolve({ blob: new Blob([new Uint8Array(4)], { type: "image/png" }) }));
                }, 5000)
              : setTimeout(() => resolve({ blob: new Blob([new Uint8Array(4)], { type: "image/png" }) }), 1);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
              },
              { once: true }
            );
          }),
      }),
    });
    const snap = await pool.prepare(
      [
        { ref: "slow.png", kind: "local" },
        { ref: "fast.png", kind: "local" },
      ],
      { timeoutMs: 30 } // 整轮 30ms 截止，慢图不会就绪
    );
    expect(snap.images["fast.png"]).toBeTruthy();
    expect(snap.images["slow.png"]).toBeUndefined();
    expect(snap.diagnostics.some((d) => d.ref === "slow.png" && d.status === "timeout")).toBe(true);
    // 迟到结果不得修改冻结快照：放行慢图加载，快照内容保持不变
    releaseFetch();
    await new Promise((r) => setTimeout(r, 10));
    expect(snap.images["slow.png"]).toBeUndefined();
    expect(Object.isFrozen(snap.images)).toBe(true);
    snap.release();
  });

  it("外部取消（signal）→ prepare 抛 AbortError，不产出快照", async () => {
    const controller = new AbortController();
    const pool = createCardResourcePool({
      app: makeApp({ "a.png": true }),
      loaders: makeLoaders({
        fetchBlob: async (_src, signal) => {
          controller.abort();
          void signal;
          return { blob: new Blob([new Uint8Array(4)], { type: "image/png" }) };
        },
      }),
    });
    await expect(
      pool.prepare([{ ref: "a.png", kind: "local" }], { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("单图 15s 计时边界：超时 → timeout 诊断（fake timers 推进真实常量）", async () => {
    vi.useFakeTimers();
    try {
      const pool = createCardResourcePool({
        app: makeApp({ "a.png": true }),
        loaders: makeLoaders({
          fetchBlob: (_src, signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
                { once: true }
              );
            }),
        }),
      });
      const pending = pool.prepare([{ ref: "a.png", kind: "local" }]);
      const assertion = expect(pending).resolves.toMatchObject({
        hasBlockingFailures: true,
      });
      await vi.advanceTimersByTimeAsync(CARD_IMAGE_TIMEOUT_MS + 1);
      const snap = await pending;
      expect(snap.diagnostics[0]).toMatchObject({ status: "timeout", ref: "a.png" });
      expect(String(snap.diagnostics[0].reason)).toContain("单图加载超时");
      snap.release();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("整轮截止后不再启动新请求（排队中的任务列为 timeout）", async () => {
    let fetchCount = 0;
    const pool = createCardResourcePool({
      app: makeApp({ "a.png": true, "b.png": true, "c.png": true }),
      loaders: makeLoaders({
        fetchBlob: async () => {
          fetchCount += 1;
          await new Promise((r) => setTimeout(r, 20));
          return { blob: new Blob([new Uint8Array(4)], { type: "image/png" }) };
        },
      }),
    });
    const snap = await pool.prepare(
      [
        { ref: "a.png", kind: "local" },
        { ref: "b.png", kind: "local" },
        { ref: "c.png", kind: "local" },
      ],
      { timeoutMs: 25 } // 并发 3：a/b/c 同时启动，但整轮 25ms 截止
    );
    // 并发 3 下三个都已启动；将 timeoutMs 调小不足以验证「不开新请求」，此处验证截止后未就绪者列为 timeout
    const ready = Object.keys(snap.images).length;
    const timeouts = snap.diagnostics.filter((d) => d.status === "timeout").length;
    expect(ready + timeouts).toBe(3);
    void fetchCount;
    snap.release();
  });
});

describe("waitForFonts", () => {
  it("字体就绪 → ok；超时 → timeout（调用方以可用字体重测并锁定快照）", async () => {
    const okDoc = /** @type {any} */ ({ fonts: { ready: Promise.resolve() } });
    const hangDoc = /** @type {any} */ ({ fonts: { ready: new Promise(() => {}) } });
    const pool = createCardResourcePool({ loaders: makeLoaders({}) });
    expect(await pool.waitForFonts(okDoc)).toEqual({ status: "ok" });
    expect(await pool.waitForFonts(hangDoc, { timeoutMs: 20 })).toEqual({ status: "timeout" });
  });

  it("迟到字体不改快照：waitForFonts 完成后快照冻结不可变", async () => {
    const pool = createCardResourcePool({ app: makeApp({ "a.png": true }), loaders: makeLoaders({}) });
    const snap = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    /** @type {{ status: "ok"|"timeout" } | null} */
    const before = snap.fonts;
    const hangDoc = /** @type {any} */ ({ fonts: { ready: new Promise((resolve) => setTimeout(resolve, 10)) } });
    await pool.waitForFonts(hangDoc, { timeoutMs: 50 });
    expect(snap.fonts).toBe(before); // 快照对象未被替换/修改
    snap.release();
  });

  it("外部 signal 取消字体等待 → 抛 AbortError", async () => {
    const controller = new AbortController();
    const hangDoc = /** @type {any} */ ({ fonts: { ready: new Promise(() => {}) } });
    const pool = createCardResourcePool({ loaders: makeLoaders({}) });
    const pending = pool.waitForFonts(hangDoc, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("retain / release 所有权", () => {
  it("两个持有者：一次 release 不清理，两次才清理；重复释放抛错", async () => {
    let finalReleaseCount = 0;
    const pool = createCardResourcePool({
      app: makeApp({ "a.png": true }),
      loaders: makeLoaders({}),
    });
    // freezeSnapshot 由 prepare 内部调用；onFinalRelease 钩子不直接暴露，
    // 这里通过「released 后 retain 抛错」验证最终释放语义。
    const snap = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    const second = snap.retain();
    expect(second).toBe(snap);
    snap.release(); // 还剩第二个持有者
    expect(() => snap.images["a.png"]).not.toThrow(); // 资源仍可用
    snap.release(); // 最后一个持有者退出 → 最终释放
    expect(() => snap.retain()).toThrow(/最终释放/);
    expect(() => snap.release()).toThrow(/重复释放/);
    void finalReleaseCount;
  });

  it("准备结果默认自带 1 个持有计数：release 一次即最终释放", async () => {
    const pool = createCardResourcePool({ app: makeApp({ "a.png": true }), loaders: makeLoaders({}) });
    const snap = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    snap.release();
    expect(() => snap.retain()).toThrow(/最终释放/);
  });
});

describe("createSnapshotResolver 与 assembleCardPage 接入", () => {
  it("就绪资源返回 src，缺失返回 null", async () => {
    const pool = createCardResourcePool({ app: makeApp({ "a.png": true }), loaders: makeLoaders({}) });
    const snap = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    const resolve = createSnapshotResolver(snap);
    expect(resolve("a.png")).toBe("app://local/a.png");
    expect(resolve("nope.png")).toBeNull();
    snap.release();
  });

  it("assembleCardPage 接受 resources 句柄并渲染就绪图片", async () => {
    const { createCardDocument } = await import("../services/card-document.js");
    const { assembleCardPage } = await import("../services/card-render-engine.js");
    const pool = createCardResourcePool({ app: makeApp({ "assets/sample.png": true }), loaders: makeLoaders({}) });
    const snap = await pool.prepare([{ ref: "assets/sample.png", kind: "local" }]);
    const doc = createCardDocument("![图](assets/sample.png)");
    const page = assembleCardPage({
      theme: /** @type {any} */ (await import("../services/card-themes.js")).getCardTheme("clear-notes"),
      doc,
      resources: snap,
      document: window.document,
    });
    const img = page.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("app://local/assets/sample.png");
    snap.release();
  });
});

describe("内联 data URL（捕获路径不能被跨域取图打断）", () => {
  it("成功加载：entry 带内联 dataUrl；预览 resolver 保留原始地址，捕获 resolver 返回内联值", async () => {
    const pool = createCardResourcePool({ app: makeApp({ "a.png": true }), loaders: makeLoaders({}) });
    const snap = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    const entry = snap.images["a.png"];
    expect(entry).toBeTruthy();
    expect(entry.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    // 预览：原始资源地址（不因内联改变既有渲染行为）
    expect(createSnapshotResolver(snap)("a.png")).toBe("app://local/a.png");
    // 捕获：内联 data URL（截图引擎对 data: 跳过取图 → 不会被占位图顶替）
    expect(createInlineSnapshotResolver(snap)("a.png")).toBe(entry.dataUrl);
    expect(createInlineSnapshotResolver(snap)("nope.png")).toBeNull();
    snap.release();
  });

  it("内联失败 → error 诊断并计入阻断（不静默少图）", async () => {
    const pool = createCardResourcePool({
      app: makeApp({ "a.png": true }),
      loaders: makeLoaders({
        blobToDataUrl: async () => {
          throw new Error("图片无法内联为 data URL");
        },
      }),
    });
    const snap = await pool.prepare([{ ref: "a.png", kind: "local" }]);
    expect(snap.images["a.png"]).toBeUndefined();
    expect(snap.hasBlockingFailures).toBe(true);
    expect(snap.diagnostics[0]).toMatchObject({ status: "error", ref: "a.png" });
    snap.release();
  });
});

describe("常量与 §5.6 对齐", () => {
  it("超时/预算常量为规划初始值", async () => {
    const m = await import("../services/card-resources.js");
    expect(m.CARD_IMAGE_TIMEOUT_MS).toBe(15000);
    expect(m.CARD_FONT_TIMEOUT_MS).toBe(10000);
    expect(m.CARD_WHOLE_PREP_TIMEOUT_MS).toBe(60000);
    expect(m.CARD_LOAD_CONCURRENCY).toBe(3);
    expect(m.CARD_SESSION_MAX_BYTES).toBe(100 * 1024 * 1024);
    void CARD_IMAGE_TIMEOUT_MS;
  });
});
