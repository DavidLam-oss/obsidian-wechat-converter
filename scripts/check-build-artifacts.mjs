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

const before = new Map(GENERATED_ARTIFACTS.map((filePath) => [filePath, readArtifact(filePath)]));

execFileSync("npm", ["run", "build"], { stdio: "inherit" });

const changed = GENERATED_ARTIFACTS.filter((filePath) => {
  const previous = before.get(filePath);
  const current = readArtifact(filePath);
  return !buffersEqual(previous, current);
});

if (changed.length > 0) {
  console.error("[check-build-artifacts] Build changed generated artifacts:");
  for (const filePath of changed) {
    console.error(`- ${filePath}`);
  }
  console.error("[check-build-artifacts] Commit the regenerated files, then rerun npm run check:build-artifacts.");
  process.exit(1);
}

console.log("[check-build-artifacts] Generated build artifacts are reproducible.");
