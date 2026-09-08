/*
## 核心功能

阶段 A 实验入口（可移除）：注册两个 Obsidian 命令——
「图片卡片实验：单页捕获」（A03）：固定样本单主题（清晰笔记·3:4）页面，modern-screenshot / snapdom 两引擎 × 2×/3× PNG 落盘；
「图片卡片实验：分页样本捕获」（A05）：分页压力样本（超长段落/中文标点/emoji 组合字符/强调链接跨行/嵌套列表/超高 callout/手动分页）
走 renderCardPages 全流程（测量 → 装箱 → 溢出核验），逐页以 modern-screenshot 2× 落盘（单引擎避免冗余输出，引擎对照归 A06）。

## 输入

插件实例（app.vault 用于落盘）；无用户输入。

## 输出

vault 内 `卡片导出/_experiment/<时间戳>/` 下 PNG（单页实验 4 张：两引擎 × 两倍率；分页实验 N 张：每页 1 张）
+ Notice 汇总（耗时/布局轮次/落盘路径）+ console.debug 详细记录。证据文件由执行人按规划 §8.6 归档。

## 定位

位于 services/，仅服务于阶段 A 选型验证；**A06 选型完成后整个文件与 input.js 接线一并移除**。

## 依赖

`card-document.js`、`card-themes.js`、`card-render-engine.js`；obsidian（Notice/normalizePath）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 本文件为实验代码：不参与生产功能链路，不写全局设置，不触碰用户笔记正文。
*/

import { Notice } from "./obsidian-compat.js";
import { createCardDocument } from "./card-document.js";
import { getCardTheme } from "./card-themes.js";
import {
  assembleCardPage,
  attachOffscreenContainer,
  capturePage,
  ensurePageStyle,
  renderCardPages,
  readPngSize,
  CAPTURE_LIBRARY_IDS,
  DEFAULT_CAPTURE_TIMEOUT_MS,
} from "./card-render-engine.js";

/** vault 路径规范化（obsidian-compat 未单独导出 normalizePath，本地实现等价逻辑） */
function normalizeVaultPath(path) {
  const raw = String(path || "").trim();
  const normalized = raw.replace(/([\\/])+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized || "/";
}

/**
 * 逐级确保 vault 内目录存在（vault.createFolder 不递归，createBinary 也不建父目录）。
 * @param {CardExperimentPlugin["app"]["vault"]} vault
 * @param {string} dirPath 目录路径（不含文件名）
 */
async function ensureVaultFolder(vault, dirPath) {
  const normalized = normalizeVaultPath(dirPath);
  if (!normalized || normalized === "/") return;
  const segments = normalized.split("/");
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await vault.createFolder(current);
    } catch (error) {
      // 目录已存在等场景：存在即视为成功，其余错误上抛
      const message = error instanceof Error ? error.message : String(error);
      if (!/exist/i.test(message)) throw error;
    }
  }
}

/** 8×8 红色 PNG（与 tests/fixtures/image-card/assets/sample.png 同源） */
const SAMPLE_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFEAcAefUDqDxUAd0AAAAASUVORK5CYII=";

const SAMPLE_MARKDOWN = [
  "# 清晰笔记 · 单页捕获样本",
  "",
  "这是一段包含**加粗**、*斜体*、~~删除线~~、[链接](https://example.com)与行内代码 `engine_probe = 1` 的正文。",
  "",
  "## 列表与任务",
  "",
  "- 列表项一：中文标点、emoji 😀、组合字符 👨‍👩‍👧‍👦",
  "- 列表项二：包含**强调**的项",
  "  - 嵌套项 2.1",
  "- [x] 已完成任务",
  "- [ ] 未完成任务",
  "",
  "1. 有序第一项",
  "2. 有序第二项",
  "3. 有序第三项",
  "",
  "> [!note] 捕获提示",
  "> 这是一个 note callout，用于验证容器样式与标题行。",
  "> 第二行用于验证多行内容。",
  "",
  "## 小表格",
  "",
  "| 引擎 | 倍率 | 预期宽度 |",
  "| --- | --- | --- |",
  "| modern-screenshot | 2x | 750 |",
  "| snapdom | 3x | 1125 |",
  "",
  "![固定静态资源](./assets/sample.png)",
  "",
  "结尾段落：验证页脚页码 1 / 1 与底部信息区。",
].join("\n");

/**
 * 实验所需插件实例的最小接口（仅声明用到的成员，避免 any 传播）。
 * @typedef {Object} CardExperimentPlugin
 * @property {{ vault: { createBinary: (path: string, data: ArrayBuffer) => Promise<any>, createFolder: (path: string) => Promise<any>, create: (path: string, data: string) => Promise<any> } }} app
 * @property {(cmd: { id: string, name: string, callback: () => void }) => void} addCommand
 */

/**
 * @param {number} ms
 */
function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

/**
 * @param {CardExperimentPlugin} plugin
 */
async function runExperiment(plugin) {
  const vault = plugin.app.vault;
  const document = window.document;
  const results = [];
  const offscreen = attachOffscreenContainer(document);

  try {
    const doc = createCardDocument(SAMPLE_MARKDOWN);
    const theme = getCardTheme("clear-notes");
    ensurePageStyle(theme, document);

    const page = assembleCardPage({
      theme,
      doc,
      pageNumber: 1,
      pageCount: 1,
      resolveImageSrc: (ref) => (ref.endsWith("sample.png") ? SAMPLE_IMAGE_DATA_URL : null),
      document,
    });
    offscreen.container.append(page);
    // 强制一次布局（等待字体）
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outDir = normalizeVaultPath(`卡片导出/_experiment/${stamp}`);
    await ensureVaultFolder(vault, outDir);
    for (const library of CAPTURE_LIBRARY_IDS) {
      for (const pixelRatio of [2, 3]) {
        const started = performance.now();
        try {
          const blob = await capturePage(page, { library, pixelRatio });
          const elapsed = performance.now() - started;
          const path = normalizeVaultPath(
            `卡片导出/_experiment/${stamp}/${library.replace(/[^a-z-]/gi, "")}-${pixelRatio}x.png`
          );
          const buffer = await blob.arrayBuffer();
          await vault.createBinary(path, buffer);
          results.push({ library, pixelRatio, ok: true, elapsed, path, size: blob.size });
          console.debug("[ImageCardExperiment] captured", {
            library,
            pixelRatio,
            elapsed: formatMs(elapsed),
            path,
            bytes: blob.size,
            type: blob.type,
          });
        } catch (error) {
          const elapsed = performance.now() - started;
          const message = error instanceof Error ? error.message : String(error);
          results.push({ library, pixelRatio, ok: false, elapsed, error: message });
          console.error("[ImageCardExperiment] capture failed", { library, pixelRatio, elapsed, error: message });
        }
      }
    }

    const okList = results.filter((r) => r.ok);
    const failList = results.filter((r) => !r.ok);
    const summary = okList
      .map((r) => `${r.library} ${r.pixelRatio}x：${formatMs(r.elapsed)}（${r.path}）`)
      .join("\n");
    const failText = failList.map((r) => `${r.library} ${r.pixelRatio}x：失败（${r.error}）`).join("\n");
    new Notice(
      `图片卡片实验完成：成功 ${okList.length} / ${results.length}\n${summary}${failText ? `\n失败：\n${failText}` : ""}`,
      10000
    );
    return results;
  } finally {
    offscreen.detach();
  }
}

/** A05 分页压力样本：超长段落（跨行/跨页）、中文标点、emoji/组合字符、强调与链接跨行、嵌套列表、超高 callout、手动分页 */
const PAGINATION_SAMPLE_MARKDOWN = [
  "# 清晰笔记 · 分页样本",
  "",
  "这一段是刻意准备的长正文，用来验证段落按真实行拆分跨页续排。句子里混排了中文标点（，。：；！？「」『』）、",
  "英文单词 pagination、数字 20260908，以及**跨越换行的加粗强调**和 [跨越换行的链接文字](https://example.com/very-long-anchor)。",
  "后面继续补充足够多的字数：一页纸装不下的时候，段落应当从行边界断开，下一页承接剩余的行，而不是把整段裁掉或者把字吞掉。",
  "组合字符与 emoji 也要保持在行内不散架：👨‍👩‍👧‍👦、🏳️‍🌈、e\u0301（组合尖音符）、👍🏽。",
  "",
  "第二段同样偏长，覆盖加粗、斜体、删除线与行内代码的组合：**粗体**、*斜体*、~~删除线~~、`const page = plan.pages[i]`。",
  "结尾处放一张小图，验证含图段落保持原子不被拆分：见下。",
  "",
  "![固定静态资源](./assets/sample.png)",
  "",
  "## 长列表（验证逐项拆分与续号）",
  "",
  "1. 第一项：简短说明。",
  "2. 第二项：带强调的 **列表项**。",
  "3. 第三项：中文标点、emoji 😀、组合字符 👨‍👩‍👧‍👦。",
  "4. 第四项：嵌套结构。",
  "   - 嵌套项 4.1",
  "   - 嵌套项 4.2",
  "5. 第五项：刻意写长一点，让它在不同宽度下可能折行，验证列表项高度的逐项测量与跨页承接是否稳定，不会出现圆点丢失或者编号错乱的问题。",
  "6. 第六项。",
  "7. 第七项。",
  "8. 第八项：收尾项。",
  "",
  "## 超高 callout（验证子块拆分与续标题）",
  "",
  "> [!note] 分页提示",
  "> callout 第一段：用于验证标题行与首段的标题剥离。",
  ">",
  "> callout 第二段：这一段也写了长一点。分页之后每一页都应该重新出现容器样式，续页标题追加「（续）」，子块内容恰好覆盖一次，不重复也不遗漏。",
  ">",
  "> callout 第三段：短句收尾。",
  ">",
  "> callout 第四段：加高样本，迫使引用块跨页，验证子块级拆分。",
  ">",
  "> callout 第五段：再写长一点，让第四、五、六段加起来明显超过单页可用高度，确保拆分必然发生而不是恰好整放。",
  ">",
  "> callout 第六段：跨页后本段应出现在续页，且续页引用块带「（续）」标题、样式完整。",
  "",
  "<!-- card:break -->",
  "",
  "## 手动分页之后",
  "",
  "上面存在一个 `<!-- card:break -->` 标记：本节必须从新页开始，且上一页以手动分页收尾。",
  "结尾段落：验证末页页脚页码与总页数一致，页面没有空白尾页。",
].join("\n");

/** A05 分页实验：renderCardPages 全流程 + 逐页 PNG（单引擎 2×，避免冗余输出；引擎对照归 A06） */
/**
 * @param {CardExperimentPlugin} plugin
 */
async function runPaginationExperiment(plugin) {
  const vault = plugin.app.vault;
  const document = window.document;
  const theme = getCardTheme("clear-notes");
  ensurePageStyle(theme, document);
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const doc = createCardDocument(PAGINATION_SAMPLE_MARKDOWN);
  const started = performance.now();
  const result = await renderCardPages(doc, {
    theme,
    document,
    resolveImageSrc: (ref) => (ref.endsWith("sample.png") ? SAMPLE_IMAGE_DATA_URL : null),
  });
  if (!result.ok) {
    const detail = result.diagnostics.map((d) => `[${d.reason}] ${d.message}`).join("\n");
    new Notice(`图片卡片分页实验：布局被阻断（不裁剪）\n${detail}`, 12000);
    console.error("[ImageCardExperiment] pagination blocked", result.diagnostics);
    result.detach();
    return result;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = normalizeVaultPath(`卡片导出/_experiment/${stamp}`);
  await ensureVaultFolder(vault, outDir);

  const captureStart = performance.now();
  const saved = [];
  try {
    for (let i = 0; i < result.pages.length; i += 1) {
      const page = result.pages[i];
      const blob = await capturePage(page, { library: "modern-screenshot", pixelRatio: 2 });
      const path = normalizeVaultPath(`${outDir}/page-${String(i + 1).padStart(2, "0")}.png`);
      const buffer = await blob.arrayBuffer();
      await vault.createBinary(path, buffer);
      saved.push(path);
      console.debug("[ImageCardExperiment] page captured", { index: i + 1, path, bytes: blob.size });
    }
  } finally {
    result.detach();
  }

  const totalMs = performance.now() - started;
  const captureMs = performance.now() - captureStart;
  new Notice(
    `图片卡片分页实验完成：${result.pages.length} 页（布局 ${formatMs(totalMs - captureMs)} / 捕获 ${formatMs(captureMs)}，布局轮次 ${result.rounds}）\n${saved.join("\n")}`,
    12000
  );
  return result;
}

/**
 * 注册实验命令（input.js onload 调用；A06 后移除）。
 * @param {CardExperimentPlugin} plugin
 */
export function registerCardExperiment(plugin) {
  plugin.addCommand({
    id: "image-card-experiment-capture",
    name: "图片卡片实验：单页捕获（A03，选型后移除）",
    callback: () => {
      runExperiment(plugin).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[ImageCardExperiment] run failed", error);
        new Notice(`图片卡片实验失败：${message}`, 8000);
      });
    },
  });
  plugin.addCommand({
    id: "image-card-experiment-paginate",
    name: "图片卡片实验：分页样本捕获（A05，选型后移除）",
    callback: () => {
      runPaginationExperiment(plugin).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[ImageCardExperiment] pagination run failed", error);
        new Notice(`图片卡片分页实验失败：${message}`, 8000);
      });
    },
  });
  plugin.addCommand({
    id: "image-card-experiment-engine-compare",
    name: "图片卡片实验：引擎对照（A06，选型后移除）",
    callback: () => {
      runEngineComparisonExperiment(plugin).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[ImageCardExperiment] engine compare failed", error);
        new Notice(`图片卡片引擎对照实验失败：${message}`, 8000);
      });
    },
  });
}

/** 引擎短名（文件名用） */
function engineShort(library) {
  return library === "modern-screenshot" ? "ms" : "sd";
}

/** 环境信息（§5.6 要求记录设备/应用/DPR） */
function collectEnv() {
  const nav = /** @type {any} */ (window.navigator || {});
  const mem = /** @type {any} */ (window.performance || {}).memory;
  return {
    userAgent: nav.userAgent || "",
    platform: nav.platform || "",
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: nav.hardwareConcurrency || null,
    heapLimitMB: mem && mem.jsHeapSizeLimit ? Math.round(mem.jsHeapSizeLimit / 1048576) : null,
    capturedAt: new Date().toISOString(),
  };
}

/** 单次捕获并落盘，返回指标记录 */
async function captureAndSave(vault, page, library, pixelRatio, outDir, name) {
  const started = performance.now();
  try {
    const blob = await capturePage(page, { library, pixelRatio });
    const elapsed = performance.now() - started;
    const buffer = await blob.arrayBuffer();
    const dims = readPngSize(buffer);
    const path = normalizeVaultPath(`${outDir}/${name}.png`);
    await vault.createBinary(path, buffer);
    return { ok: true, library, pixelRatio, elapsedMs: Math.round(elapsed), bytes: blob.size, width: dims.width, height: dims.height, path };
  } catch (error) {
    const elapsed = performance.now() - started;
    return { ok: false, library, pixelRatio, elapsedMs: Math.round(elapsed), error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * A06 引擎对照：A01 单页样本（双引擎 × 2×/3×）+ A05 分页样本全量落盘（双引擎 2×，首页另出 3×）
 * + 双引擎各 20 张批次计时（不落盘，只记指标）。全部结果写 metrics.json。
 * @param {CardExperimentPlugin} plugin
 */
async function runEngineComparisonExperiment(plugin) {
  const vault = plugin.app.vault;
  const document = window.document;
  const theme = getCardTheme("clear-notes");
  ensurePageStyle(theme, document);
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  const startedAt = performance.now();
  const metrics = {
    env: collectEnv(),
    engineVersions: { "modern-screenshot": "4.7.0", "@zumer/snapdom": "2.24.15" },
    captureTimeoutMs: DEFAULT_CAPTURE_TIMEOUT_MS,
    singlePage: [],
    paginated: [],
    scale3Probe: [],
    batch: {},
    residualOffscreenContainers: null,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = normalizeVaultPath(`卡片导出/_experiment/${stamp}`);
  await ensureVaultFolder(vault, outDir);

  // ── 阶段 1：A01 单页样本（双引擎 × 2×/3×） ──
  const offscreen = attachOffscreenContainer(document);
  try {
    const a01Doc = createCardDocument(SAMPLE_MARKDOWN);
    const a01Page = assembleCardPage({
      theme,
      doc: a01Doc,
      pageNumber: 1,
      pageCount: 1,
      resolveImageSrc: (ref) => (ref.endsWith("sample.png") ? SAMPLE_IMAGE_DATA_URL : null),
      document,
    });
    offscreen.container.append(a01Page);
    for (const library of CAPTURE_LIBRARY_IDS) {
      for (const pixelRatio of [2, 3]) {
        const record = await captureAndSave(vault, a01Page, library, pixelRatio, outDir, `a01-${engineShort(library)}-${pixelRatio}x`);
        metrics.singlePage.push(record);
        console.debug("[ImageCardCompare] a01", record);
      }
    }
    a01Page.remove();

    // ── 阶段 2：A05 分页样本全量（双引擎 2×）+ 首页 3× 探针 ──
    const paginated = await renderCardPages(createCardDocument(PAGINATION_SAMPLE_MARKDOWN), {
      theme,
      document,
      resolveImageSrc: (ref) => (ref.endsWith("sample.png") ? SAMPLE_IMAGE_DATA_URL : null),
    });
    if (!paginated.ok) {
      const detail = paginated.diagnostics.map((d) => `[${d.reason}] ${d.message}`).join("\n");
      new Notice(`引擎对照实验：布局被阻断\n${detail}`, 12000);
      paginated.detach();
      return;
    }
    metrics.pageCount = paginated.pages.length;
    for (const library of CAPTURE_LIBRARY_IDS) {
      for (let i = 0; i < paginated.pages.length; i += 1) {
        const record = await captureAndSave(vault, paginated.pages[i], library, 2, outDir, `a05-${engineShort(library)}-page-${String(i + 1).padStart(2, "0")}`);
        metrics.paginated.push(record);
      }
      const probe3x = await captureAndSave(vault, paginated.pages[0], library, 3, outDir, `a05-${engineShort(library)}-page-01-3x`);
      metrics.scale3Probe.push(probe3x);
    }

    // ── 阶段 3：批次 20 张（双引擎 2×，轮转取页，不落盘只计时） ──
    for (const library of CAPTURE_LIBRARY_IDS) {
      const perCapture = [];
      const heapBefore = /** @type {any} */ (window.performance || {}).memory;
      const heapStart = heapBefore ? heapBefore.usedJSHeapSize : null;
      const batchStart = performance.now();
      let batchFailures = 0;
      for (let i = 0; i < 20; i += 1) {
        const page = paginated.pages[i % paginated.pages.length];
        const t0 = performance.now();
        try {
          const blob = await capturePage(page, { library, pixelRatio: 2 });
          perCapture.push(Math.round(performance.now() - t0));
          void blob;
        } catch (error) {
          batchFailures += 1;
          perCapture.push(Math.round(performance.now() - t0));
          console.error("[ImageCardCompare] batch capture failed", { library, index: i, error });
        }
      }
      const totalMs = Math.round(performance.now() - batchStart);
      const heapEnd = /** @type {any} */ (window.performance || {}).memory;
      metrics.batch[library] = {
        count: 20,
        failures: batchFailures,
        totalMs,
        avgMs: Math.round(perCapture.reduce((a, b) => a + b, 0) / perCapture.length),
        maxMs: Math.max(...perCapture),
        perCaptureMs: perCapture,
        heapStartMB: heapStart != null ? Math.round(heapStart / 1048576) : null,
        heapEndMB: heapEnd ? Math.round(heapEnd.usedJSHeapSize / 1048576) : null,
      };
    }
    paginated.detach();
    metrics.residualOffscreenContainers = document.querySelectorAll("[data-icard-offscreen]").length;
    metrics.totalMs = Math.round(performance.now() - startedAt);

    // ── 落盘 metrics.json + 汇总 ──
    const metricsPath = normalizeVaultPath(`${outDir}/metrics.json`);
    await vault.create(metricsPath, JSON.stringify(metrics, null, 2));
    const lines = [];
    for (const library of CAPTURE_LIBRARY_IDS) {
      const singles = metrics.singlePage.filter((r) => r.library === library);
      const pag = metrics.paginated.filter((r) => r.library === library && r.ok);
      const batch = metrics.batch[library];
      const avgPag = pag.length ? Math.round(pag.reduce((a, r) => a + r.elapsedMs, 0) / pag.length) : -1;
      lines.push(`${library}：单页 ${singles.map((r) => `${r.pixelRatio}x=${formatMs(r.elapsedMs || 0)}`).join(" / ")}｜分页均 ${formatMs(avgPag)}｜20 张批 ${formatMs(batch.totalMs)}（败 ${batch.failures}）`);
    }
    lines.push(`metrics.json → ${metricsPath}`);
    new Notice(`图片卡片引擎对照完成（${metrics.pageCount} 页/批 20 张）\n${lines.join("\n")}`, 15000);
    console.info("[ImageCardCompare] metrics", metrics);
  } finally {
    offscreen.detach();
  }
}
