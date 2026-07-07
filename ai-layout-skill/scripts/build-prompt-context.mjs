/*
## 核心功能

为 AI layout skill 构建提示词上下文和可嵌入运行时材料。

## 输入

接收 skill 源文件、脚本执行参数和项目内 AI layout 约束。

## 输出

输出 prompt context 文本或构建结果，供 AI layout runtime 使用。

## 定位

位于 ai-layout-skill/scripts/，服务 AI layout skill 工程化，不参与插件主入口运行。

## 依赖

关键依赖：`node:fs`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 ai-layout-skill/scripts 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import fs from 'node:fs';

const args = process.argv.slice(2);
const fileArgIndex = args.findIndex((arg) => arg === '--file');
const input = fileArgIndex !== -1 && args[fileArgIndex + 1]
  ? fs.readFileSync(args[fileArgIndex + 1], 'utf8')
  : fs.readFileSync(0, 'utf8');

const snapshot = String(input || '').trim();

if (!snapshot) {
  console.error('No snapshot content provided.');
  process.exit(1);
}

const output = [
  '# 公众号 AI 编排调试上下文',
  '',
  '请基于下面的调试快照，分析当前 Obsidian 微信公众号 AI 编排结果，并给出最值得优先修正的一处。',
  '',
  '## 调试快照',
  '```text',
  snapshot,
  '```',
].join('\n');

process.stdout.write(output);
