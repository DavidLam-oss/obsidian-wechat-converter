/*
## 核心功能

提供 check file size baseline 开发脚本，冻结「已超标的核心源码文件」的行数上限，防止只冻结不拆分的大文件被悄悄改胖。

## 输入

接收命令行参数（`--update` / `--json` / `--against <git-ref>`）、git 跟踪清单、仓库源码文件、scripts/file-size-baseline.json，
以及 `--against` 指定 ref（默认 `HEAD`）中已提交的同名基线文件。

## 输出

输出违规文件清单（基线 → 当前 + 增量）与失败退出码；`--update` 时写回基线文件（保留 `waivers` 字段）。

## 防线设计（两道，缺一不可）

1. **值越界**：当前实测值 > 基线上限 → fail（原有行为）。
2. **上限被无声调高**：工作区基线里某个上限 > 已提交基线里的同一项 → 必须有 `waivers` 条目覆盖，否则 fail。
   注意第 2 道只在「工作区 vs 已提交」这一层有效，因此必须配合 pre-commit hook（提交前跑）或 CI（对比 base 分支）才真正闭环；
   若某人先抬高再 commit，事后跑本检查已看不出差异。

## 豁免（waivers）

`file-size-baseline.json` 的 `waivers` 字段是「合法放宽」的唯一出口，每条必须写明 `max`（新上限，必须 >= 目标值）
与 `reason`（非空且不少于 10 个字符）。命中豁免时基线会被对齐到 `waiver.max` 作为**天花板**（保留余量，避免每次
微小增长都触发），并在输出中以警告形式留痕。没有豁免的项一律沿用「只降不升」。

## 定位

位于 scripts/，只处理仓库工程化任务，不被 Obsidian 插件运行时直接加载。

## 依赖

关键依赖：`node:fs`、`node:path`、`node:child_process`（git ls-files / git show）。

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
 * @typedef {{ max?: number, reason?: string, date?: string, ref?: string }} Waiver
 * @typedef {{ section: string, file: string, previous: number, current: number, delta: number }} RaisedBound
 * @typedef {RaisedBound & { problem: string }} UnwaivedRaisedBound
 * @typedef {RaisedBound & { max: number, reason: string }} WaivedRaisedBound
 */

/** 合法豁免理由的最短长度；防止用「fix」「tmp」这类无信息量字符串绕过。 */
const MIN_WAIVER_REASON_LENGTH = 10;

/** 参与「上限无声调高」检测的两个基线分区。 */
const BASELINE_SECTIONS = ["files", "generatedBytes"];

/** 写回基线时附带的豁免使用说明。 */
const WAIVER_NOTE =
  "`waivers` is the only sanctioned escape hatch for raising a bound. Each entry needs `max` (the new ceiling, must be >= the intended value) and `reason` (>= 10 chars). Adding one is an explicit, reviewable decision: the diff is the audit trail. Entries whose reason is missing or too short are ignored, and the bound stays frozen.";

/**
 * @returns {{ softLimit: number, files: Record<string, number>, generatedBytes: Record<string, number>, waivers: Record<string, Waiver> }}
 */
function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { softLimit: SOFT_LIMIT, files: {}, generatedBytes: {}, waivers: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  return {
    softLimit: typeof parsed.softLimit === "number" ? parsed.softLimit : SOFT_LIMIT,
    files: isPlainObject(parsed.files) ? parsed.files : {},
    generatedBytes: isPlainObject(parsed.generatedBytes) ? parsed.generatedBytes : {},
    waivers: isPlainObject(parsed.waivers) ? parsed.waivers : {},
  };
}

/**
 * 读取 `--against` 指定 ref 中已提交的基线（默认 HEAD）。
 * 用于检出「只改了工作区基线、没写豁免」的无声放宽。
 * @param {string} ref
 * @returns {{ files: Record<string, number>, generatedBytes: Record<string, number> } | null}
 */
function readCommittedBaseline(ref) {
  try {
    const raw = execFileSync("git", ["show", `${ref}:scripts/file-size-baseline.json`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(raw);
    const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    return {
      files: isPlainObject(parsed.files) ? parsed.files : {},
      generatedBytes: isPlainObject(parsed.generatedBytes) ? parsed.generatedBytes : {},
    };
  } catch {
    // ref 不存在、文件尚未被跟踪、或不在 git 仓库中 —— 降级为「无法比对」，不阻断本地开发。
    return null;
  }
}

/**
 * 判定一条 waiver 是否足以覆盖某个目标值。
 * @param {Waiver | undefined} waiver
 * @param {number} value
 * @returns {{ ok: boolean, problem: string }}
 */
function waiverStatus(waiver, value) {
  if (waiver === undefined || waiver === null || typeof waiver !== "object") {
    return { ok: false, problem: "no waiver declared" };
  }
  if (typeof waiver.max !== "number" || !Number.isFinite(waiver.max)) {
    return { ok: false, problem: "waiver.max is missing or not a number" };
  }
  if (waiver.max < value) {
    return { ok: false, problem: `waiver.max ${waiver.max} is below the requested ${value}` };
  }
  if (typeof waiver.reason !== "string" || waiver.reason.trim().length < MIN_WAIVER_REASON_LENGTH) {
    return { ok: false, problem: `waiver.reason must be a string of at least ${MIN_WAIVER_REASON_LENGTH} characters` };
  }
  return { ok: true, problem: "" };
}

/**
 * 在「工作区基线」与「已提交基线」之间比对每个上限，挑出被调高的项。
 * 新增条目（已提交基线里没有该键）不算调高；豁免不足的项进入 `unwaived`。
 * @param {{ files: Record<string, number>, generatedBytes: Record<string, number>, waivers: Record<string, Waiver> }} working
 * @param {{ files: Record<string, number>, generatedBytes: Record<string, number> } | null} committed
 * @param {string} ref
 * @returns {{ available: boolean, ref: string, unwaived: UnwaivedRaisedBound[], waived: WaivedRaisedBound[] }}
 */
function detectRaisedBounds(working, committed, ref) {
  /** @type {UnwaivedRaisedBound[]} */
  const unwaived = [];
  /** @type {WaivedRaisedBound[]} */
  const waived = [];
  if (committed === null) {
    return { available: false, ref, unwaived, waived };
  }
  for (const section of BASELINE_SECTIONS) {
    const workingSection = working[section] ?? {};
    const committedSection = committed[section] ?? {};
    for (const [file, value] of Object.entries(workingSection)) {
      const previous = committedSection[file];
      if (typeof previous !== "number" || typeof value !== "number") continue;
      if (value <= previous) continue;
      const entry = { section, file, previous, current: value, delta: value - previous };
      const waiver = working.waivers[file];
      const status = waiverStatus(waiver, value);
      if (status.ok && waiver !== undefined) {
        waived.push({ ...entry, max: waiver.max ?? value, reason: waiver.reason ?? "" });
      } else {
        unwaived.push({ ...entry, problem: status.problem });
      }
    }
  }
  unwaived.sort((a, b) => b.delta - a.delta);
  waived.sort((a, b) => b.delta - a.delta);
  return { available: true, ref, unwaived, waived };
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
 * 单个上限的下一版取值。
 * 默认「只降不升」；只有当豁免明确覆盖当前值、且豁免上限确实高于现有上限时，才对齐到豁免上限（留出余量）。
 * @param {number} previous
 * @param {number} current
 * @param {Waiver | undefined} waiver
 * @returns {number}
 */
function resolveNextBound(previous, current, waiver) {
  const status = waiverStatus(waiver, current);
  if (status.ok && waiver !== undefined && typeof waiver.max === "number" && waiver.max > previous) {
    return waiver.max;
  }
  return Math.min(previous, current);
}

/**
 * 计算新的基线：**默认只允许下调或新增，绝不抬升**；命中豁免的项改为对齐豁免上限。
 * @param {Map<string, number>} snapshot
 * @param {{ softLimit: number, files: Record<string, number>, generatedBytes: Record<string, number>, waivers: Record<string, Waiver> }} baseline
 * @returns {Record<string, number>}
 */
function nextBaseline(snapshot, baseline) {
  /** @type {Record<string, number>} */
  const next = {};
  for (const name of [...snapshot.keys()].sort()) {
    const current = snapshot.get(name) ?? 0;
    const previous = typeof baseline.files[name] === "number" ? baseline.files[name] : null;
    if (previous === null) {
      // 新文件：只有达到软线才纳入冻结名单。
      if (current >= baseline.softLimit) next[name] = current;
      continue;
    }
    next[name] = resolveNextBound(previous, current, baseline.waivers[name]);
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
 * 计算生成物字节数基线：**默认只允许下调或新增，绝不抬升**；命中豁免的项改为对齐豁免上限。
 * @param {Map<string, number>} bytesSnapshot
 * @param {Record<string, number>} baselineBytes
 * @param {Record<string, Waiver>} waivers
 * @returns {Record<string, number>}
 */
function nextGeneratedBytesBaseline(bytesSnapshot, baselineBytes, waivers) {
  /** @type {Record<string, number>} */
  const next = {};
  for (const name of [...bytesSnapshot.keys()].sort()) {
    const current = bytesSnapshot.get(name) ?? 0;
    const previous = typeof baselineBytes[name] === "number" ? baselineBytes[name] : null;
    if (previous === null) {
      // 新文件：直接记录当前值
      next[name] = current;
      continue;
    }
    next[name] = resolveNextBound(previous, current, waivers[name]);
  }
  return next;
}


const args = process.argv.slice(2);
const shouldUpdate = args.includes("--update");
const useJson = args.includes("--json");
// `--against <ref>`：检出「上限被无声调高」时的对照版本，默认 HEAD（最近一次提交）。
const againstIndex = args.indexOf("--against");
const rawAgainstRef = againstIndex === -1 ? "HEAD" : (args[againstIndex + 1] ?? "");
const AGAINST_REF = rawAgainstRef !== "" && !rawAgainstRef.startsWith("-") ? rawAgainstRef : "HEAD";

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
  } else if (current < previous && baseline.waivers[file] === undefined) {
    // 命中豁免的项，基线是对齐到「上限 + 余量」的天花板，实测低于它属预期，不算「可收紧」。
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
    } else if (currentBytes < previousBytes && baseline.waivers[file] === undefined) {
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
  const nextBytes = nextGeneratedBytesBaseline(bytesSnapshot, baseline.generatedBytes, baseline.waivers);
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        note: "Auto-maintained by scripts/check-file-size-baseline.mjs. Values are frozen upper bounds for first-party source files at or above the soft limit. Without a matching entry in `waivers`, this check never lets a file grow past its bound and `--update` can only lower bounds, add newly-qualifying files, or prune deleted files.",
        waiverNote: WAIVER_NOTE,
        softLimit: baseline.softLimit,
        files: next,
        generatedBytes: nextBytes,
        waivers: baseline.waivers,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`[check-file-size-baseline] baseline updated: ${Object.keys(next).length} file(s) frozen.`);
  console.log(
    grown.length > 0
      ? `[check-file-size-baseline] ${grown.length} grown bound(s) left frozen (no waiver covers them); they remain enforced.`
      : "[check-file-size-baseline] no bound was raised without a waiver.",
  );
  if (Object.keys(nextBytes).length > 0) {
    console.log(`[check-file-size-baseline] generated file byte sizes: ${Object.keys(nextBytes).length} file(s) tracked.`);
  }
}

// 第二道防线：工作区基线相对 --against（默认 HEAD）有没有被无声调高。
// --update 刚重写过基线，所以那里要重新读一次再比对。
const committedBaseline = readCommittedBaseline(AGAINST_REF);
const raiseCheck = detectRaisedBounds(shouldUpdate ? readBaseline() : baseline, committedBaseline, AGAINST_REF);

if (useJson) {
  console.log(
    JSON.stringify(
      {
        softLimit: baseline.softLimit,
        grown,
        newOversized,
        shrank,
        staleEntries,
        bytesGrown,
        bytesShrankOrNew,
        againstRef: raiseCheck.ref,
        committedBaselineAvailable: raiseCheck.available,
        raisedWithoutWaiver: raiseCheck.unwaived,
        raisedWithWaiver: raiseCheck.waived,
      },
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

if (raiseCheck.unwaived.length > 0) {
  failed = true;
  console.error(`\n[check-file-size-baseline] Bound(s) raised above ${raiseCheck.ref} with no valid waiver:`);
  for (const item of raiseCheck.unwaived) {
    const unit = item.section === "generatedBytes" ? " bytes" : " lines";
    console.error(`  - ${item.file}: ${item.previous}${unit} -> ${item.current}${unit} (+${item.delta})`);
    console.error(`      ${item.problem}`);
  }
  console.error("  Raising a frozen bound has to be an explicit, reviewable decision — not a quiet edit of the JSON.");
  console.error('  Declare it under "waivers" in scripts/file-size-baseline.json:');
  console.error('    "<file>": { "max": <new ceiling>, "reason": "<why this is justified>", "date": "<YYYY-MM-DD>" }');
  console.error(`  This gate compares the working tree against ${raiseCheck.ref}, so it only catches UNCOMMITTED raises —`);
  console.error("  which is exactly what .githooks/pre-commit and CI exist to cover.");
}

if (raiseCheck.waived.length > 0) {
  console.log(
    `\n[check-file-size-baseline] ${raiseCheck.waived.length} bound(s) raised above ${raiseCheck.ref} under an explicit waiver:`,
  );
  for (const item of raiseCheck.waived) {
    const unit = item.section === "generatedBytes" ? " bytes" : " lines";
    console.log(`  - ${item.file}: ${item.previous}${unit} -> ${item.current}${unit} (ceiling ${item.max}${unit})`);
    console.log(`      reason: ${item.reason}`);
  }
}

if (!raiseCheck.available) {
  console.log(`\n[check-file-size-baseline] baseline at ${raiseCheck.ref} could not be read — skipped the "silently raised bound" check.`);
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
