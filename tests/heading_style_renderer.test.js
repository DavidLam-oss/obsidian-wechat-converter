/*
## 核心功能

覆盖 heading-style-renderer.js 的自动化测试：
- default 样式原样返回
- serial-number 大数字序号样式（34px 加粗序号下沉、基线对齐、底部细线）
- badge 胶囊徽标样式（圆角纯色徽标、白色字、渐变分割线）
- zen 留白禅意样式（居中 PART 01、衬线字体、42px 居中微细分割线）
- 现有标题序号剥离与去重（避免 01 01. 标题）
- 属性保留（id、class）与 WeChat 纯内联样式兼容性
- 颜色解析与回退机制

## 输入

被测模块、模拟参数与测试 HTML。

## 输出

Vitest 断言结果。
*/

import { describe, it, expect } from 'vitest';
import {
  HEADING_STYLES,
  VALID_HEADING_STYLES,
  resolvePrimaryColor,
  parseHeadingNumberAndTitle,
  decorateArticleHeadings,
} from '../services/heading-style-renderer.js';

describe('Heading Style Renderer - Constants & Helpers', () => {
  it('should define valid styles', () => {
    expect(VALID_HEADING_STYLES).toEqual(['default', 'serial-number', 'badge', 'zen']);
  });

  it('should resolve primary color correctly', () => {
    expect(resolvePrimaryColor({ customColor: '#ff5500' })).toBe('#ff5500');
    expect(resolvePrimaryColor({ themeColor: 'green' })).toBe('#28a745');
    expect(resolvePrimaryColor({ themeColor: 'purple' })).toBe('#6f42c1');
    expect(resolvePrimaryColor({})).toBe('#0366d6');
  });

  it('should parse leading numbers in heading titles', () => {
    expect(parseHeadingNumberAndTitle('1. 第一章 绪论', 1)).toEqual({
      numStr: '01',
      cleanTitle: '第一章 绪论',
    });
    expect(parseHeadingNumberAndTitle('02. 架构设计', 1)).toEqual({
      numStr: '02',
      cleanTitle: '架构设计',
    });
    expect(parseHeadingNumberAndTitle('3、核心要点', 1)).toEqual({
      numStr: '03',
      cleanTitle: '核心要点',
    });
    expect(parseHeadingNumberAndTitle('无序号标题', 4)).toEqual({
      numStr: '04',
      cleanTitle: '无序号标题',
    });
  });
});

describe('Heading Style Renderer - decorateArticleHeadings', () => {
  const baseHtml = `
    <section>
      <h2 id="sec-1" class="custom-h2">1. 导言</h2>
      <p>正文内容一</p>
      <h2>核心设计与实施</h2>
      <p>正文内容二</p>
    </section>
  `;

  it('should return HTML unmodified when headingStyle is default or not set', () => {
    expect(decorateArticleHeadings(baseHtml, { headingStyle: 'default' })).toBe(baseHtml);
    expect(decorateArticleHeadings(baseHtml, {})).toBe(baseHtml);
  });

  it('should render serial-number variant with bold numbers and baseline alignment', () => {
    const output = decorateArticleHeadings(baseHtml, {
      headingStyle: HEADING_STYLES.SERIAL_NUMBER,
      themeColor: 'blue',
    });

    expect(output).toContain('font-size: 34px');
    expect(output).toContain('font-weight: 800');
    expect(output).toContain('vertical-align: baseline');
    expect(output).toContain('01');
    expect(output).toContain('导言');
    expect(output).toContain('02');
    expect(output).toContain('核心设计与实施');
    // 保留已有的 id 和 class
    expect(output).toContain('id="sec-1"');
    expect(output).toContain('class="custom-h2"');
  });

  it('should render badge variant with pill badge and gradient line', () => {
    const output = decorateArticleHeadings(baseHtml, {
      headingStyle: HEADING_STYLES.BADGE,
      themeColor: 'green',
    });

    expect(output).toContain('border-radius: 10px');
    expect(output).toContain('background-color: #28a745');
    expect(output).toContain('color: #ffffff');
    expect(output).toContain('background-image: linear-gradient(to right, #28a745, transparent)');
    expect(output).toContain('01');
    expect(output).toContain('导言');
    expect(output).toContain('02');
  });

  it('should render zen variant with centered micro PART and serif title', () => {
    const output = decorateArticleHeadings(baseHtml, {
      headingStyle: HEADING_STYLES.ZEN,
      customColor: '#10b981',
    });

    expect(output).toContain('PART 01');
    expect(output).toContain('PART 02');
    expect(output).toContain('letter-spacing: 3px');
    expect(output).toContain('text-transform: uppercase');
    expect(output).toContain('width: 42px; height: 1px');
    expect(output).toContain('Songti SC');
    expect(output).toContain('text-align: center');
  });

  it('should ensure all decorated output uses WeChat-safe inline styles', () => {
    const output = decorateArticleHeadings(baseHtml, {
      headingStyle: HEADING_STYLES.SERIAL_NUMBER,
    });

    expect(output).not.toContain('<style');
    // 所有的 h2 都有 style="..."
    const h2Matches = output.match(/<h2[^>]*style="[^"]*"[^>]*>/g);
    expect(h2Matches).toHaveLength(2);
  });
});
