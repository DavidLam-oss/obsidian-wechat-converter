/*
## 核心功能

定义 Vitest 测试环境、mock 解析和覆盖率相关配置。

## 输入

接收 Vitest CLI、测试文件、jsdom 环境和仓库 mock 设置。

## 输出

输出测试运行配置，支撑 npm test 与覆盖率命令。

## 定位

位于根目录，是测试工具配置，不参与插件运行时。

## 依赖

关键依赖：`vitest/config`、`path`、`url`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 根目录 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, './__mocks__/obsidian.js'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/helpers/obsidian-resolver.cjs'],
    server: {
      deps: {
        inline: ['obsidian'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
