/*
## 核心功能

提供 check build artifacts 开发脚本，服务构建、校验、生成或发布前检查。

## 输入

接收命令行参数、package scripts、仓库源码文件和生成物状态。

## 输出

输出终端校验结果、生成文件、失败退出码或发布前诊断信息。

## 定位

位于 scripts/，只处理仓库工程化任务，不被 Obsidian 插件运行时直接加载。

## 依赖

关键依赖：`node:fs`、`node:child_process`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 scripts 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
- 比对范围由 git 跟踪状态决定：仍入库的产物要求构建前后逐字节一致；已移出跟踪的产物（当前为 main.js、services/generated-embedded-deps.js）仅要求构建成功产出，避免全新 checkout 中“无 → 有”被误判为不可复现。
*/

import fs from "node:fs";
import { execFileSync } from "node:child_process";

const GENERATED_ARTIFACTS = [
  "main.js",
  "styles.css",
  "services/generated-embedded-deps.js",
  "services/ai-layout-runtime/generated-skills.js",
];

function readArtifact(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

function buffersEqual(left, right) {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

/**
 * 返回仓库中被 git 跟踪的路径集合。
 *
 * 语义说明：本脚本只在「产物必须与源码同步入库」时才有比对意义。
 * 产物一旦移出 Git 跟踪（改由 Release 资产分发），全新 checkout 中本就不存在该文件，
 * 构建前后必然出现“无 → 有”的差异，这不代表构建不可复现。
 * 因此比对范围只取「仍被跟踪的产物」，未跟踪的产物仅要求构建成功产出。
 *
 * 无 git 上下文时（如 git archive 导出的目录）无法判定跟踪状态，此时必须显式失败，
 * 不允许静默退化成“全部按已跟踪比对”，否则会把 CI 的合法构建误判为不可复现。
 */
function listTrackedPaths() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(output.split("\0").filter(Boolean));
  } catch {
    console.error("[check-build-artifacts] Unable to read git tracked files (not a git work tree).");
    console.error("[check-build-artifacts] This check needs a repository to decide which artifacts are tracked.");
    process.exit(1);
  }
}

const tracked = listTrackedPaths();
const trackedArtifacts = GENERATED_ARTIFACTS.filter((filePath) => tracked.has(filePath));
const untrackedArtifacts = GENERATED_ARTIFACTS.filter((filePath) => !tracked.has(filePath));

const before = new Map(trackedArtifacts.map((filePath) => [filePath, readArtifact(filePath)]));

execFileSync("npm", ["run", "build"], { stdio: "inherit" });

// 未跟踪产物没有基线可比：只要求构建后存在且非空。
const missingArtifacts = untrackedArtifacts.filter((filePath) => {
  const current = readArtifact(filePath);
  return current === null || current.length === 0;
});

if (missingArtifacts.length > 0) {
  console.error("[check-build-artifacts] Build did not produce these generated artifacts:");
  for (const filePath of missingArtifacts) {
    console.error(`- ${filePath}`);
  }
  console.error("[check-build-artifacts] Check the build pipeline, then rerun npm run check:build-artifacts.");
  process.exit(1);
}

const changed = trackedArtifacts.filter((filePath) => {
  const previous = before.get(filePath);
  const current = readArtifact(filePath);
  return !buffersEqual(previous, current);
});

if (changed.length > 0) {
  console.error("[check-build-artifacts] Build changed tracked generated artifacts:");
  for (const filePath of changed) {
    console.error(`- ${filePath}`);
  }
  console.error("[check-build-artifacts] Commit the regenerated files, then rerun npm run check:build-artifacts.");
  process.exit(1);
}

if (untrackedArtifacts.length > 0) {
  console.log(
    `[check-build-artifacts] Skipped byte comparison for untracked artifacts (distributed via Release): ${untrackedArtifacts.join(", ")}`,
  );
}

console.log("[check-build-artifacts] Generated build artifacts are reproducible.");
