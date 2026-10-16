/*
## 核心功能

把仓库自带的 `.githooks/` 目录注册为 git 的 hooks 路径，让版本化的钩子（当前为 pre-commit）在本机生效。
不引入 husky 等第三方依赖：钩子文件进 git、可 review、可回滚，安装本身只是一条 `git config`。

## 输入

无命令行参数。读取 `.githooks/` 目录内容与当前 git 配置。

## 输出

设置 `core.hooksPath` 并给钩子文件补可执行位。遇到「不在 git 仓库」「目录不存在」「core.hooksPath 已指向别处」的情况只打印说明并跳过，绝不抛错。

## 定位

位于 scripts/，由 package.json 的 `prepare` 生命周期在 `npm install` / `npm ci` 之后自动调用；也可手动 `node scripts/install-git-hooks.mjs` 运行。

## 依赖

关键依赖：`node:fs`、`node:path`、`node:child_process`。

## 维护规则

- 新增钩子文件后确认本脚本的补执行位逻辑仍覆盖得到（当前按目录内容遍历）。
- 必须保持幂等且永不抛错：它挂在 prepare 上，失败会直接打断 `npm install`。
*/

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const HOOKS_DIR = ".githooks";
const HOOKS_PATH = path.join(ROOT, HOOKS_DIR);

/**
 * 运行 git 命令；失败（非零退出、不在仓库中）统一返回 null，调用方据此降级。
 * @param {string[]} args
 * @returns {string | null}
 */
function tryGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function main() {
  if (tryGit(["rev-parse", "--git-dir"]) === null) {
    console.log("[install-git-hooks] not a git repository — skipped.");
    return;
  }

  if (!fs.existsSync(HOOKS_PATH) || !fs.statSync(HOOKS_PATH).isDirectory()) {
    console.log(`[install-git-hooks] ${HOOKS_DIR}/ not found — skipped.`);
    return;
  }

  const hooks = fs.readdirSync(HOOKS_PATH).filter((name) => !name.startsWith("."));
  if (hooks.length === 0) {
    console.log(`[install-git-hooks] ${HOOKS_DIR}/ holds no hook — skipped.`);
    return;
  }

  // chmod 在 Windows 上是 no-op，不会抛错，故无需分支处理。
  for (const name of hooks) {
    const file = path.join(HOOKS_PATH, name);
    if (fs.statSync(file).isFile()) fs.chmodSync(file, 0o755);
  }

  const current = tryGit(["config", "--get", "core.hooksPath"]);
  if (current === HOOKS_DIR) {
    console.log(`[install-git-hooks] already active (core.hooksPath=${HOOKS_DIR}).`);
    return;
  }
  if (current !== null && current !== "") {
    console.log(`[install-git-hooks] core.hooksPath is already pointed at "${current}" — left untouched.`);
    console.log(`[install-git-hooks] to use the repo hooks instead: git config core.hooksPath ${HOOKS_DIR}`);
    return;
  }

  tryGit(["config", "core.hooksPath", HOOKS_DIR]);
  console.log(`[install-git-hooks] core.hooksPath -> ${HOOKS_DIR} (versioned hooks are now live).`);
  console.log(`[install-git-hooks] installed: ${hooks.join(", ")}`);
}

try {
  main();
} catch (error) {
  // 绝不能因为钩子安装失败而打断 npm install。
  console.log(`[install-git-hooks] skipped after an unexpected error: ${error instanceof Error ? error.message : String(error)}`);
}
