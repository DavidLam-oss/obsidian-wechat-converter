/*
## 核心功能

提供 check file size baseline 开发脚本，冻结「已超标的核心源码文件」的行数上限，防止只冻结不拆分的大文件被悄悄改胖。

## 输入

接收命令行参数（`--update` / `--json`）、git 跟踪清单、仓库源码文件和 scripts/file-size-baseline.json。

## 输出

输出违规文件清单（基线 → 当前 + 增量）与失败退出码；`--update` 时写回基线文件。

## 定位

位于 scripts/，只处理仓库工程化任务，不被 Obsidian 插件运行时直接加载。

## 依赖

关键依赖：`node:fs`、`node:path`、`node:child_process`（git ls-files）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 scripts 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "scripts", "file-size-baseline.json");

/** 未登记文件允许的最大行数；达到或超过即视为「新的超标文件」。 */
const SOFT_LIMIT = 800;

/** 参与体量治理的源码扩展名（markup 与样式同样计入）。 */
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".html"]);

/** 生成物：由构建/生成脚本产出，不适用人工行数约束。 */
const GENERATED_FILES = new Set([
  "main.js",
  "styles.css",
  "services/generated-embedded-deps.js",
  "services/ai-layout-runtime/generated-skills.js",
]);

/** 不属于插件产品源码的目录（独立服务、测试、样例、文档、依赖）。 */
const EXCLUDED_DIR_PREFIXES = [
  "node_modules/",
  "tests/",
  "samples/",
  "server/",
  "docs/",
  "dist/",
  "lib/",
  "coverage/",
  "__mocks__/",
];

/**
 * 统计文件行数，语义与 `wc -l` 一致（按换行符计数）。
 * @param {string} absolutePath
 * @returns {number}
 */
function countLines(absolutePath) {
  const source = fs.readFileSync(absolutePath, "utf8");
  let lines = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") lines += 1;
  }
  return lines;
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function isGovernedSource(relativePath) {
  if (GENERATED_FILES.has(relativePath)) return false;
  if (EXCLUDED_DIR_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) return false;
  return SOURCE_EXTENSIONS.has(path.extname(relativePath));
}

/**
 * @returns {string[]} 仓库中被 git 跟踪的源码文件（POSIX 相对路径，已排序）
 */
function listTrackedSourceFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  return output
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.split(path.sep).join("/"))
    .filter(isGovernedSource)
    .sort();
}

/**
 * @returns {{ softLimit: number, files: Record<string, number>, generatedBytes: Record<string, number> }}
 */
function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { softLimit: SOFT_LIMIT, files: {}, generatedBytes: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  return {
    softLimit: typeof parsed.softLimit === "number" ? parsed.softLimit : SOFT_LIMIT,
    files: parsed && typeof parsed.files === "object" && parsed.files !== null ? parsed.files : {},
    generatedBytes: parsed && typeof parsed.generatedBytes === "object" && parsed.generatedBytes !== null ? parsed.generatedBytes : {},
  };
}

/**
 * 收集当前行数快照。
 * @param {string[]} files
 * @returns {Map<string, number>}
 */
function measure(files) {
  const snapshot = new Map();
  for (const file of files) {
    snapshot.set(file, countLines(path.join(ROOT, file)));
  }
  return snapshot;
}

/**
 * 计算新的基线：**只允许下调或新增,绝不抬升**。
 * @param {Map<string, number>} snapshot
 * @param {{ softLimit: number, files: Record<string, number>, generatedBytes: Record<string, number> }} baseline
 * @returns {Record<string, number>}
 */
function nextBaseline(snapshot, baseline) {
  /** @type {Record<string, number>} */
  const next = {};
  const names = [...snapshot.keys()].sort();
  for (const name of names) {
    const current = snapshot.get(name) ?? 0;
    const previous = typeof baseline.files[name] === "number" ? baseline.files[name] : null;
    if (previous !== null) {
      // 已冻结文件：上限取「旧基线」与「当前行数」的较小值 → --update 无法用来放宽。
      next[name] = Math.min(previous, current);
      continue;
    }
    // 新文件：只有达到软线才纳入冻结名单。
    if (current >= baseline.softLimit) next[name] = current;
  }
  return next;
}

/**
 * 测量生成物文件的字节数。
 * @returns {Map<string, number>}
 */
function measureGeneratedBytes() {
  const sizes = new Map();
  for (const file of GENERATED_FILES) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      sizes.set(file, fs.statSync(fullPath).size);
    }
  }
  return sizes;
}

/**
 * 计算生成物字节数基线：**只允许下调或新增，绝不抬升**。
 * @param {Map<string, number>} bytesSnapshot
 * @param {Record<string, number>} baselineBytes
 * @returns {Record<string, number>}
 */
function nextGeneratedBytesBaseline(bytesSnapshot, baselineBytes) {
  /** @type {Record<string, number>} */
  const next = {};
  const names = [...bytesSnapshot.keys()].sort();
  for (const name of names) {
    const current = bytesSnapshot.get(name) ?? 0;
    const previous = typeof baselineBytes[name] === "number" ? baselineBytes[name] : null;
    if (previous !== null) {
      // 已冻结：取较小值，不允许抬升
      next[name] = Math.min(previous, current);
    } else {
      // 新文件：直接记录当前值
      next[name] = current;
    }
  }
  return next;
}


const args = process.argv.slice(2);
const shouldUpdate = args.includes("--update");
const useJson = args.includes("--json");

const baseline = readBaseline();
const snapshot = measure(listTrackedSourceFiles());
const bytesSnapshot = measureGeneratedBytes();

/** @type {{ file: string, baseline: number, current: number, delta: number }[]} */
const grown = [];
/** @type {{ file: string, current: number }[]} */
const newOversized = [];
/** @type {string[]} */
const staleEntries = [];
/** @type {string[]} */
const shrank = [];
/** @type {{ file: string, baseline: number, current: number, delta: number }[]} */
const bytesGrown = [];
/** @type {string[]} */
const bytesShrankOrNew = [];

for (const [file, current] of snapshot) {
  const previous = baseline.files[file];
  if (typeof previous !== "number") {
    if (current >= baseline.softLimit) newOversized.push({ file, current });
    continue;
  }
  if (current > previous) {
    grown.push({ file, baseline: previous, current, delta: current - previous });
  } else if (current < previous) {
    shrank.push(file);
  }
}

for (const file of Object.keys(baseline.files)) {
  if (!snapshot.has(file)) staleEntries.push(file);
}

// Check generated file byte sizes
for (const [file, currentBytes] of bytesSnapshot) {
  const previousBytes = baseline.generatedBytes[file];
  if (typeof previousBytes === "number") {
    if (currentBytes > previousBytes) {
      bytesGrown.push({ file, baseline: previousBytes, current: currentBytes, delta: currentBytes - previousBytes });
    } else if (currentBytes < previousBytes) {
      bytesShrankOrNew.push(file);
    }
  } else {
    // New generated file - record but don't fail
    bytesShrankOrNew.push(file);
  }
}

grown.sort((a, b) => b.delta - a.delta);
newOversized.sort((a, b) => b.current - a.current);
bytesGrown.sort((a, b) => b.delta - a.delta);

if (shouldUpdate) {
  const next = nextBaseline(snapshot, baseline);
  const nextBytes = nextGeneratedBytesBaseline(bytesSnapshot, baseline.generatedBytes);
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        note: "Auto-maintained by scripts/check-file-size-baseline.mjs. Values are frozen upper bounds for first-party source files at or above the soft limit. This check never lets a file grow past its bound; `--update` can only lower bounds, add newly-qualifying files, or prune deleted files.",
        softLimit: baseline.softLimit,
        files: next,
        generatedBytes: nextBytes,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`[check-file-size-baseline] baseline updated: ${Object.keys(next).length} file(s) frozen.`);
  console.log(
    grown.length > 0
      ? `[check-file-size-baseline] refused to raise ${grown.length} grown bound(s); they remain enforced.`
      : "[check-file-size-baseline] no bound was raised.",
  );
  if (Object.keys(nextBytes).length > 0) {
    console.log(`[check-file-size-baseline] generated file byte sizes: ${Object.keys(nextBytes).length} file(s) tracked.`);
  }
}

if (useJson) {
  console.log(
    JSON.stringify(
      { softLimit: baseline.softLimit, grown, newOversized, shrank, staleEntries, bytesGrown, bytesShrankOrNew },
      null,
      2,
    ),
  );
}

let failed = false;

if (grown.length > 0) {
  failed = true;
  console.error("\n[check-file-size-baseline] Frozen file(s) grew past their bound:");
  for (const item of grown) {
    console.error(`  - ${item.file}: ${item.baseline} -> ${item.current} (+${item.delta})`);
  }
  console.error("  These files are intentionally frozen (split deferred). New capability must live in a new file.");
  console.error("  If you genuinely split one, run: npm run check:size -- --update");
}

if (newOversized.length > 0) {
  failed = true;
  console.error(`\n[check-file-size-baseline] New file(s) at or above the ${baseline.softLimit}-line soft limit:`);
  for (const item of newOversized) {
    console.error(`  - ${item.file}: ${item.current}`);
  }
  console.error("  Register it after review: npm run check:size -- --update");
}

if (bytesGrown.length > 0) {
  failed = true;
  console.error("\n[check-file-size-baseline] Generated file(s) grew past their byte size bound:");
  for (const item of bytesGrown) {
    const baselineKB = (item.baseline / 1024).toFixed(1);
    const currentKB = (item.current / 1024).toFixed(1);
    const deltaKB = (item.delta / 1024).toFixed(1);
    console.error(`  - ${item.file}: ${baselineKB} KB -> ${currentKB} KB (+${deltaKB} KB)`);
  }
  console.error("  Generated files should not grow unbounded. Review the changes and update baseline if justified: npm run check:size -- --update");
}

if (shrank.length > 0 && !shouldUpdate) {
  console.log(`\n[check-file-size-baseline] ${shrank.length} frozen file(s) shrank — tighten the bound with: npm run check:size -- --update`);
  for (const file of shrank) {
    console.log(`  - ${file}: ${baseline.files[file]} -> ${snapshot.get(file)}`);
  }
}

if (bytesShrankOrNew.length > 0 && !shouldUpdate) {
  console.log(`\n[check-file-size-baseline] ${bytesShrankOrNew.length} generated file(s) shrank or are new — update baseline with: npm run check:size -- --update`);
  for (const file of bytesShrankOrNew) {
    const current = bytesSnapshot.get(file) ?? 0;
    const previous = baseline.generatedBytes[file];
    const currentKB = (current / 1024).toFixed(1);
    if (typeof previous === "number") {
      const previousKB = (previous / 1024).toFixed(1);
      console.log(`  - ${file}: ${previousKB} KB -> ${currentKB} KB`);
    } else {
      console.log(`  - ${file}: (new) ${currentKB} KB`);
    }
  }
}

if (staleEntries.length > 0 && !shouldUpdate) {
  console.log(`\n[check-file-size-baseline] ${staleEntries.length} baseline entr(y/ies) point at removed files — prune with: npm run check:size -- --update`);
  for (const file of staleEntries) {
    console.log(`  - ${file}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  const generatedCount = Object.keys(baseline.generatedBytes).length;
  const generatedMsg = generatedCount > 0 ? `, ${generatedCount} generated file(s) within byte limit` : "";
  console.log(
    `[check-file-size-baseline] OK: ${Object.keys(baseline.files).length} frozen file(s) within bound, no new file at or above ${baseline.softLimit} lines${generatedMsg}.`,
  );
}
