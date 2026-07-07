/*
## 核心功能

覆盖 brand icon 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 brand icon 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Brand Icon Data URL Validation', () => {
  it('contains a valid, untruncated PNG base64 string for the placeholder icon', () => {
    const source = readFileSync('views/shared/view-constants.js', 'utf8');
    const match = source.match(/const PLACEHOLDER_ICON_DATA_URL = 'data:image\/png;base64,([^']+)';/);
    
    expect(match).not.toBeNull();
    const base64 = match[1];
    
    // 1. Should be a reasonable length (the original is around 7872 characters)
    expect(base64.length).toBeGreaterThan(7500);
    
    const buf = Buffer.from(base64, 'base64');
    
    // 2. Verify PNG signature (89 50 4E 47 0D 0A 1A 0A)
    const signature = buf.slice(0, 8).toString('hex');
    expect(signature).toBe('89504e470d0a1a0a');
    
    // 3. Verify chunk layout and existence of IEND chunk
    let pos = 8;
    let hasIHDR = false;
    let hasIEND = false;
    
    while (pos < buf.length) {
      if (pos + 8 > buf.length) {
        break;
      }
      const length = buf.readUInt32BE(pos);
      const type = buf.slice(pos + 4, pos + 8).toString('ascii');
      
      if (type === 'IHDR') hasIHDR = true;
      if (type === 'IEND') {
        hasIEND = true;
        // The IEND chunk length must be 0, and Pos + 8 + 0 + 4 must match the buffer length exactly
        expect(length).toBe(0);
        expect(pos + 12).toBe(buf.length);
      }
      
      pos += 8 + length + 4;
    }
    
    expect(hasIHDR).toBe(true);
    expect(hasIEND).toBe(true);
  });
});
