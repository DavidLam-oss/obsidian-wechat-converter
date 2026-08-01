/*
## 核心功能

覆盖图文志主题的动态颜色角色、可读性保护和微信公众号内联样式合同。

## 输入

接收 AppleTheme、图文志颜色工具和模拟的主题设置。

## 输出

输出自动化断言结果，保护新主题不会退化为固定色板或依赖网页 CSS 的实现。

## 定位

位于 tests/，是图文志主题的专属回归测试；不覆盖图片语义解析。

## 依赖

关键依赖：Vitest、render-runtime helper、themes/apple-theme-colors.js。

## 维护规则

- 断言用户可见颜色与内联输出合同，而不是绑定无关的空白字符。
- 新增颜色角色或标签样式时，同步覆盖亮色 customColor 和 coloredHeader 开关。
- 图片角色的 DOM 重写测试保留在 obsidian_triplet_serializer_pictorial.test.js。
*/

import { beforeAll, describe, expect, it } from 'vitest';
import {
  contrastRatio,
  createPictorialColorRoles,
} from '../themes/apple-theme-colors.js';
const { bootstrapLegacyRuntime } = require('./helpers/render-runtime');

describe('图文志主题', () => {
  let AppleTheme;

  beforeAll(() => {
    bootstrapLegacyRuntime();
    AppleTheme = window.AppleTheme;
  });

  it('registers 图文志 without replacing the existing theme set', () => {
    expect(AppleTheme.getThemeList()).toContainEqual({
      value: 'pictorial',
      label: '图文志',
    });
  });

  it('keeps the selected accent while deriving readable text color for a bright custom color', () => {
    const roles = createPictorialColorRoles({
      accent: '#fff4a3',
      headingColor: '#cfc27f',
      coloredHeader: true,
    });

    expect(roles.accent).toBe('#fff4a3');
    expect(roles.accentReadable).not.toBe(roles.accent);
    expect(contrastRatio(roles.accentReadable, roles.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(roles.accentDeep, roles.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back safely for invalid custom colors and preserves the title-color switch', () => {
    const invalid = createPictorialColorRoles({ accent: 'not-a-color' });
    const untinted = createPictorialColorRoles({
      accent: '#ffcc00',
      headingColor: '#aa8800',
      coloredHeader: false,
    });

    expect(invalid.accent).toBe('#0366d6');
    expect(contrastRatio(invalid.accentReadable, invalid.surface)).toBeGreaterThanOrEqual(4.5);
    expect(untinted.accentDeep).toBe('#3e3e3e');
  });

  it('uses dynamic roles rather than a fixed external palette in inline article styles', () => {
    const theme = new AppleTheme({
      theme: 'pictorial',
      themeColor: 'custom',
      customColor: '#ffcc00',
      coloredHeader: true,
      fontSize: 3,
      sidePadding: 16,
    });
    const roles = theme.getColorRoles();
    const styles = [
      theme.getStyle('section'),
      theme.getStyle('h1'),
      theme.getStyle('p'),
      theme.getStyle('blockquote'),
      theme.getStyle('a'),
      theme.getStyle('table'),
      theme.getStyle('code'),
      theme.getStyle('pictorial-hero-figure'),
      theme.getStyle('pictorial-caption'),
    ].join(' ');

    expect(theme.getStyle('a')).toContain(`color:${roles.accentReadable}`);
    expect(theme.getStyle('h1')).toContain(`color:${roles.accentDeep}`);
    expect(theme.getStyle('h1')).toContain('text-align:center');
    expect(theme.getStyle('blockquote')).toContain('border-top:1px solid');
    expect(theme.getStyle('blockquote')).toContain('border-bottom:1px solid');
    expect(theme.getStyle('blockquote')).toContain('border-left:0');
    expect(theme.getStyle('pictorial-hero-img')).toContain('width:100%');
    expect(theme.getStyle('pictorial-caption')).toContain(`color:${roles.muted}`);
    expect(styles).not.toContain('<style');
    expect(styles).not.toContain('class=');
    expect(styles).not.toContain('display:grid');
    expect(styles).not.toContain('linear-gradient');
    expect(styles).not.toContain('#ffcc00');
  });

  it('keeps a stable long-form layout when the article contains no images', () => {
    const theme = new AppleTheme({
      theme: 'pictorial',
      themeColor: 'teal',
      coloredHeader: false,
      fontSize: 3,
    });

    expect(theme.getStyle('section')).toContain('background:#ffffff');
    expect(theme.getStyle('section')).toContain('text-align:left');
    expect(theme.getStyle('p')).toContain('line-height:1.9');
    expect(theme.getStyle('p')).toContain('text-align:justify');
    expect(theme.getStyle('h1')).toContain('text-align:center');
    expect(theme.getStyle('h2')).toContain("font-family:'Times New Roman'");
    expect(theme.getStyle('h2')).toContain('color:#3e3e3e');
    expect(theme.getStyle('figure')).toContain('margin:28px 0 30px');
  });
});
