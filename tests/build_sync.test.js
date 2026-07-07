/*
## 核心功能

覆盖 build sync 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 build sync 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('build is up to date with source', () => {
  const rootDir = path.resolve(__dirname, '..');
  const inputPath = path.join(rootDir, 'input.js');
  const outputPath = path.join(rootDir, 'main.js');

  if (!fs.existsSync(inputPath)) {
    throw new Error('input.js not found');
  }

  if (!fs.existsSync(outputPath)) {
    expect(false, 'main.js does not exist. Please run npm run build.').toBe(true);
    return;
  }

  const inputStats = fs.statSync(inputPath);
  const outputStats = fs.statSync(outputPath);

  const inputMtime = inputStats.mtime.getTime();
  const outputMtime = outputStats.mtime.getTime();

  // 允许 2 秒的误差，以应对文件系统精度或构建过程中的微小延迟
  const isUpToDate = outputMtime >= inputMtime - 2000;

  expect(isUpToDate, `Build is out of date. input.js was modified at ${inputStats.mtime}, but main.js was last built at ${outputStats.mtime}. Please run "npm run build" before testing or releasing.`).toBe(true);
});
