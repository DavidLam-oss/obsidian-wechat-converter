/*
## 核心功能

覆盖共享剪贴板写入模块（views/shared/clipboard.js）的行为与「只写不读 / 单一入口」契约。

## 输入

接收被测模块、mock 的 navigator.clipboard、仓库源码文件清单。

## 输出

输出自动化断言结果，保护剪贴板写入语义与全仓库剪贴板使用边界不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、node:fs / node:path，以及被测的共享剪贴板模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 新增合法的剪贴板调用点时，同步更新本文件下方的 ALLOWED_CLIPBOARD_FILES 白名单并说明理由。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { writeClipboardText } from '../views/shared/clipboard.js';

/**
 * 允许直接触碰 `navigator.clipboard` 的源码（相对仓库根）。
 * - views/shared/clipboard.js：纯文本写入的唯一入口。
 * - views/converter/clipboard.js：富文本（text/html + ClipboardItem）写入，
 *   与纯文本不是同一套 API，故单独保留。
 */
const ALLOWED_CLIPBOARD_FILES = new Set([
  'views/shared/clipboard.js',
  'views/converter/clipboard.js',
]);

const SCAN_ROOTS = ['views', 'services', 'input.js'];

/** 收集扫描范围内的源码文件（排除 generated 产物） */
function collectSourceFiles() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    if (!fs.existsSync(root)) continue;
    const stat = fs.statSync(root);
    if (stat.isFile()) {
      if (root.endsWith('.js')) files.push(root);
      continue;
    }
    for (const rel of fs.readdirSync(root, { recursive: true })) {
      const p = path.join(root, String(rel));
      if (!p.endsWith('.js')) continue;
      if (p.includes('generated-')) continue;
      if (!fs.statSync(p).isFile()) continue;
      files.push(p.split(path.sep).join('/'));
    }
  }
  return files;
}

function setClipboard(value) {
  Object.defineProperty(global.navigator, 'clipboard', { configurable: true, value });
}

describe('共享剪贴板写入（views/shared/clipboard.js）', () => {
  beforeEach(() => {
    setClipboard(undefined);
  });

  it('写入成功返回 true，并把原文交给 writeText', async () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard({ writeText });
    await expect(writeClipboardText('===')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('===');
  });

  it('无 clipboard 对象 → false（不抛异常）', async () => {
    setClipboard(undefined);
    await expect(writeClipboardText('x')).resolves.toBe(false);
  });

  it('环境没有 writeText → false（不冒泡 TypeError）', async () => {
    setClipboard({});
    await expect(writeClipboardText('x')).resolves.toBe(false);
  });

  it('权限被拒 / 写入抛错 → false（由调用方决定提示，不谎报成功）', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    setClipboard({ writeText });
    await expect(writeClipboardText('x')).resolves.toBe(false);
  });

  it('模块本身只写不读', () => {
    const source = fs.readFileSync('views/shared/clipboard.js', 'utf8');
    expect(source).not.toMatch(/clipboard\s*\??\.\s*(?:read|readText)\s*\(/);
  });
});

describe('剪贴板使用边界（契约守卫）', () => {
  it('纯文本复制必须走共享模块：其余源码不得直接触碰 navigator.clipboard', () => {
    const offenders = collectSourceFiles()
      .filter((file) => !ALLOWED_CLIPBOARD_FILES.has(file))
      .filter((file) => /navigator\s*\.\s*clipboard/.test(fs.readFileSync(file, 'utf8')));
    // 失败即说明有人绕开了 views/shared/clipboard.js（历史上曾有 5 处重复实现）
    expect(offenders).toEqual([]);
  });

  it('全仓库源码都不得读取系统剪贴板', () => {
    const offenders = collectSourceFiles().filter((file) =>
      /clipboard\s*\??\.\s*(?:read|readText)\s*\(/.test(fs.readFileSync(file, 'utf8'))
    );
    // 读取剪贴板属隐私敏感能力，Obsidian 市场扫描会告警；见 OBSIDIAN_SCAN_CHECKLIST.md
    expect(offenders).toEqual([]);
  });
});
