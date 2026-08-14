/*
## 核心功能

提供 release validate 开发脚本，服务构建、校验、生成或发布前检查。

## 输入

接收命令行参数、package scripts、仓库源码文件和生成物状态。

## 输出

输出终端校验结果、生成文件、失败退出码或发布前诊断信息。

## 定位

位于 scripts/，只处理仓库工程化任务，不被 Obsidian 插件运行时直接加载。

## 依赖

关键依赖：`node:fs`、`node:path`、`node:child_process`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 scripts 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const MAIN_JS_MAX_BYTES = 5_000_000;
const DIRECT_FS_IMPORT_PATTERN = /require\(\s*["'](?:node:)?fs["']\s*\)/;
const CLIPBOARD_READ_PATTERN = /\.clipboard\??\.(?:read|readText)\s*\(/;

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Failed to parse JSON: ${filePath}\n${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function resolveZipPath() {
  const argZip = process.argv.find((arg) => arg.startsWith("--zip="));
  if (argZip) return argZip.slice("--zip=".length);

  const pkg = readJson(path.join(ROOT, "package.json"));
  return `${pkg.name}.zip`;
}

function listZipEntries(zipPath) {
  const cmd = `unzip -Z1 "${zipPath}"`;
  try {
    return execSync(cmd, { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    fail(`Failed to read zip entries via unzip command: ${zipPath}\n${error.message}`);
  }
}

function main() {
  const manifest = readJson(path.join(ROOT, "manifest.json"));
  const versions = readJson(path.join(ROOT, "versions.json"));

  assert(typeof manifest.version === "string" && manifest.version.length > 0, "manifest.json: missing version");
  assert(typeof manifest.minAppVersion === "string" && manifest.minAppVersion.length > 0, "manifest.json: missing minAppVersion");
  assert(Object.prototype.hasOwnProperty.call(versions, manifest.version), `versions.json: missing key for version ${manifest.version}`);
  assert(
    versions[manifest.version] === manifest.minAppVersion,
    `versions.json: expected ${manifest.version} -> ${manifest.minAppVersion}, got ${versions[manifest.version]}`
  );
  ok(`versions.json mapping OK: ${manifest.version} -> ${manifest.minAppVersion}`);

  const mainJsPath = path.join(ROOT, "main.js");
  assert(fs.existsSync(mainJsPath), `Missing production bundle: ${mainJsPath}. Run npm run build first.`);
  const mainJsSize = fs.statSync(mainJsPath).size;
  assert(
    mainJsSize <= MAIN_JS_MAX_BYTES,
    `main.js is ${mainJsSize} bytes, exceeding the ${MAIN_JS_MAX_BYTES}-byte Obsidian Sync Standard limit.`
  );
  ok(`main.js size OK: ${mainJsSize} / ${MAIN_JS_MAX_BYTES} bytes`);

  const mainJsSource = fs.readFileSync(mainJsPath, "utf8");
  assert(
    !DIRECT_FS_IMPORT_PATTERN.test(mainJsSource),
    "main.js contains a direct Node.js fs import. Use the browser-safe dependency build instead."
  );
  ok("main.js contains no direct Node.js fs import");
  assert(
    !CLIPBOARD_READ_PATTERN.test(mainJsSource),
    "main.js reads the system clipboard. Clipboard access must be limited to user-initiated writes."
  );
  ok("main.js contains no system clipboard reads");

  const zipPath = path.join(ROOT, resolveZipPath());
  assert(fs.existsSync(zipPath), `Missing release zip: ${zipPath}. Run npm run release:pack first.`);

  const entries = listZipEntries(zipPath);
  const requiredFiles = ["main.js", "manifest.json", "styles.css"];
  for (const file of requiredFiles) {
    assert(entries.includes(file), `Zip missing required file: ${file}`);
  }

  const sortedEntries = [...entries].sort();
  assert(
    sortedEntries.length === requiredFiles.length && requiredFiles.every((file) => sortedEntries.includes(file)),
    `Zip must contain only official Obsidian plugin assets: ${requiredFiles.join(", ")}. Found: ${entries.join(", ")}`
  );

  assert(!entries.some((entry) => entry.startsWith("/") || entry.includes("..")), "Zip contains unsafe paths");
  ok(`Zip artifact validated as official three-file package: ${path.basename(zipPath)} (${entries.length} entries)`);

  console.log("Release artifact validation passed.");
}

main();
