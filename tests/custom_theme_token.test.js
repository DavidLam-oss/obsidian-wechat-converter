/*
## 核心功能

自定义排版主题 Token（Theme Token）校验器、色值清洗、CSS 安全审查与归一化单元测试。

## 输入

各种正常、边界与异常的 Token 对象及 JSON 字符串。

## 输出

测试套件运行断言结果。

## 定位

位于 tests/，测试层。
*/

import { describe, it, expect } from 'vitest';
import {
  isValidHexColor,
  tintColorWithWhite,
  sanitizeRawCssOverrides,
  validateCustomThemeToken,
  normalizeCustomThemeToken,
  normalizeCustomThemesList,
  AI_THEME_PROMPT_TEMPLATE,
} from '../services/theme-token-validator.js';

describe('theme-token-validator', () => {
  describe('isValidHexColor & tintColorWithWhite', () => {
    it('正确识别 3 位和 6 位 Hex 颜色', () => {
      expect(isValidHexColor('#fff')).toBe(true);
      expect(isValidHexColor('#FFFFFF')).toBe(true);
      expect(isValidHexColor('#007AFF')).toBe(true);
      expect(isValidHexColor('#123')).toBe(true);

      expect(isValidHexColor('blue')).toBe(false);
      expect(isValidHexColor('#12345')).toBe(false);
      expect(isValidHexColor('#1234567')).toBe(false);
      expect(isValidHexColor('')).toBe(false);
      expect(isValidHexColor(null)).toBe(false);
    });

    it('混合白色生成浅色底色', () => {
      const tinted = tintColorWithWhite('#000000', 0.9);
      expect(tinted).toBe('#E6E6E6');
      const whiteTint = tintColorWithWhite('#FFFFFF', 0.9);
      expect(whiteTint).toBe('#FFFFFF');
    });
  });

  describe('sanitizeRawCssOverrides', () => {
    it('允许常规安全 CSS 规则', () => {
      const css = 'h1 { font-weight: 700; color: #111; } p { line-height: 1.8; }';
      const result = sanitizeRawCssOverrides(css);
      expect(result.safe).toBe(true);
      expect(result.sanitized).toContain('font-weight');
    });

    it('拦截含高危关键字的 CSS 规则', () => {
      expect(sanitizeRawCssOverrides('body { background: url(http://evil.com/a.jpg); }').safe).toBe(false);
      expect(sanitizeRawCssOverrides('<script>alert(1)</script>').safe).toBe(false);
      expect(sanitizeRawCssOverrides('@import "http://evil.com/style.css";').safe).toBe(false);
      expect(sanitizeRawCssOverrides('a { behavior: url(x.htc); }').safe).toBe(false);
      expect(sanitizeRawCssOverrides('div { width: expression(alert(1)); }').safe).toBe(false);
    });
  });

  describe('validateCustomThemeToken', () => {
    it('通过合法的 Token 对象', () => {
      const validToken = {
        name: '极简北欧风',
        colors: {
          accent: '#2B5B84',
          light: '#F0F4F8',
          title: '#1D2A3A',
        },
        headingStyle: 'serial-number',
      };
      const res = validateCustomThemeToken(validToken);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.token?.name).toBe('极简北欧风');
    });

    it('支持解析包含 Markdown 代码围栏的代码字符串', () => {
      const jsonString = '```json\n{\n  "name": "温暖拿铁",\n  "colors": {\n    "accent": "#8C6239"\n  }\n}\n```';
      const res = validateCustomThemeToken(jsonString);
      expect(res.valid).toBe(true);
      expect(res.token?.name).toBe('温暖拿铁');
      expect(res.token?.colors.accent).toBe('#8C6239');
    });

    it('捕获缺失必要字段或非法色值错误', () => {
      const emptyRes = validateCustomThemeToken('');
      expect(emptyRes.valid).toBe(false);

      const missingAccent = { name: '无主色主题', colors: {} };
      const missingAccentRes = validateCustomThemeToken(missingAccent);
      expect(missingAccentRes.valid).toBe(false);
      expect(missingAccentRes.errors.some((e) => e.includes('accent'))).toBe(true);

      const invalidColor = {
        name: '非法色值',
        colors: { accent: 'not-a-hex' },
      };
      const invalidColorRes = validateCustomThemeToken(invalidColor);
      expect(invalidColorRes.valid).toBe(false);
      expect(invalidColorRes.errors.some((e) => e.includes('16 进制颜色'))).toBe(true);
    });

    it('校验非法的标题样式与装饰配置', () => {
      const invalidHeadingType = {
        name: '标题测试',
        colors: { accent: '#112233' },
        headingStyle: 123,
      };
      const res = validateCustomThemeToken(invalidHeadingType);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('headingStyle'))).toBe(true);

      const invalidHeadingAlign = {
        name: '对齐测试',
        colors: { accent: '#112233' },
        heading: { align: 'invalid-align' },
      };
      const res2 = validateCustomThemeToken(invalidHeadingAlign);
      expect(res2.valid).toBe(false);
      expect(res2.errors.some((e) => e.includes('heading.align'))).toBe(true);

      const dangerousHeadingStyle = {
        name: '危险样式测试',
        colors: { accent: '#112233' },
        heading: { customStyle: 'border: url(http://evil.com/x)' },
      };
      const res3 = validateCustomThemeToken(dangerousHeadingStyle);
      expect(res3.valid).toBe(false);
      expect(res3.errors.some((e) => e.includes('heading.customStyle'))).toBe(true);
    });
  });

  describe('normalizeCustomThemeToken', () => {
    it('补充缺失的 ID 并生成缺省底色', () => {
      const raw = {
        name: '深蓝商务',
        colors: {
          accent: '#003366',
        },
      };
      const normalized = normalizeCustomThemeToken(raw);
      expect(normalized.id).toBeDefined();
      expect(normalized.colors.accent).toBe('#003366');
      expect(normalized.colors.light).toBeDefined();
      expect(isValidHexColor(normalized.colors.light)).toBe(true);
    });

    it('钳制超限排版数值到合法安全范围', () => {
      const raw = {
        name: '排版极限测试',
        colors: { accent: '#123456' },
        typography: {
          baseFontSize: 999,
          lineHeight: 0.1,
          paragraphGap: 500,
          letterSpacing: 20,
        },
      };
      const normalized = normalizeCustomThemeToken(raw);
      expect(normalized.typography.baseFontSize).toBe(22);
      expect(normalized.typography.lineHeight).toBe(1.4);
      expect(normalized.typography.paragraphGap).toBe(40);
      expect(normalized.typography.letterSpacing).toBe(2);
    });

    it('严格前向兼容：保留未知外部字段', () => {
      const raw = {
        id: 'brand-pro',
        name: '前向兼容测试',
        colors: { accent: '#007AFF' },
        futureFeatureFlag: true,
        nestedCustomMeta: { version: '2.0' },
      };
      const normalized = normalizeCustomThemeToken(raw);
      expect(normalized.futureFeatureFlag).toBe(true);
      expect(normalized.nestedCustomMeta).toEqual({ version: '2.0' });
    });

    it('对 heading.prefix 进行 30 字符长度截断并保留原文字符（转义由渲染边界负责）', () => {
      const raw = {
        name: '字符保留测试',
        colors: { accent: '#2563EB' },
        heading: {
          style: 'left-border',
          prefix: 'Q&A 专栏 // 超长内容截断 1234567890 额外文字',
        },
      };
      const normalized = normalizeCustomThemeToken(raw);
      expect(normalized.heading.prefix.length).toBeLessThanOrEqual(30);
      expect(normalized.heading.prefix).toContain('Q&A 专栏');
      // 不在此处进行 HTML 转义，避免与 renderer 产生双重转义 (&amp;amp;)
      expect(normalized.heading.prefix).not.toContain('&amp;');
    });
  });

  describe('normalizeCustomThemesList', () => {
    it('去除非法项并处理 ID 冲突重名', () => {
      const input = [
        { id: 'theme-a', name: '主题 A', colors: { accent: '#111111' } },
        { id: 'theme-a', name: '主题 A 副本', colors: { accent: '#222222' } },
        null,
        'invalid-item',
      ];
      const list = normalizeCustomThemesList(input);
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('custom-theme-a');
      expect(list[1].id).toBe('custom-theme-a-1');
    });
  });

  describe('AI_THEME_PROMPT_TEMPLATE', () => {
    it('包含有效的 JSON 结构指导和主要字段说明', () => {
      expect(AI_THEME_PROMPT_TEMPLATE).toContain('schemaVersion');
      expect(AI_THEME_PROMPT_TEMPLATE).toContain('colors');
      expect(AI_THEME_PROMPT_TEMPLATE).toContain('heading');
    });
  });
});
