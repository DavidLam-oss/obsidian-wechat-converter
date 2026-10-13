/*
## 核心功能

已废弃：独立 MathJax 构建已统一收敛至 scripts/generate-embedded-deps.mjs 单一构建源。
本脚本保留仅用于向后兼容，直接委托至 generate-embedded-deps。

## 定位

位于根目录，仅作向后兼容委托，不包含独立打包配置。
*/

import { execFileSync } from "node:child_process";
import process from "node:process";

console.warn("⚠️ esbuild.math.mjs 已废弃，统一通过 scripts/generate-embedded-deps.mjs 构建 MathJax。正在自动委托...");

try {
  execFileSync(process.execPath, ["scripts/generate-embedded-deps.mjs"], { stdio: "inherit" });
} catch (error) {
  process.exit(error.status || 1);
}
