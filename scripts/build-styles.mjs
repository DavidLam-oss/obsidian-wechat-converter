/*
## 核心功能

提供 build styles 开发脚本，服务构建、校验、生成或发布前检查。

## 输入

接收命令行参数、package scripts、仓库源码文件和生成物状态。

## 输出

输出终端校验结果、生成文件、失败退出码或发布前诊断信息。

## 定位

位于 scripts/，只处理仓库工程化任务，不被 Obsidian 插件运行时直接加载。

## 依赖

关键依赖：`node:fs/promises`、`node:process`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 scripts 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const STYLE_FRAGMENTS = [
  "styles/base.css",
  "styles/toolbar.css",
  "styles/ai-layout.css",
  "styles/style-panel.css",
  "styles/preview.css",
  "styles/settings-base.css",
  "styles/wechat-settings.css",
  "styles/wechat-publish.css",
  "styles/multi-platform.css",
  "styles/settings-tabs.css",
  "styles/feishu.css",
  "styles/material-picker.css",
];

async function buildStyles() {
  const chunks = await Promise.all(STYLE_FRAGMENTS.map((filePath) => readFile(filePath, "utf8")));
  return chunks.join("");
}

const checkOnly = process.argv.includes("--check");
const outputPath = "styles.css";
const nextContent = await buildStyles();

if (checkOnly) {
  const currentContent = await readFile(outputPath, "utf8");
  if (currentContent !== nextContent) {
    console.error("[build-styles] styles.css is out of date. Run npm run generate:styles.");
    process.exit(1);
  }
  console.log("[build-styles] styles.css is up to date.");
} else {
  await writeFile(outputPath, nextContent, "utf8");
  console.log("[build-styles] generated styles.css from CSS fragments.");
}
