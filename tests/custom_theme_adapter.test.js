/*
## 核心功能

自定义排版主题适配器（custom-theme-adapter.js）编译为 AppleThemeConfig、
AppleThemeOptions 以及主题列表检索单元测试。

## 输入

自定义主题 Token 对象及待检索主题数组。

## 输出

测试套件运行断言结果。

## 定位

位于 tests/，测试层。
*/

import { describe, it, expect } from 'vitest';
import {
  BUILTIN_ARTICLE_THEMES,
  compileCustomThemeToAppleConfig,
  compileCustomThemeToAppleOptions,
  findCustomTheme,
  listAllThemes,
  getCustomThemeCss,
  applyCustomThemeCssToHtml,
  resolveThemeUpdateOptions,
} from '../services/custom-theme-adapter.js';

describe('custom-theme-adapter', () => {
  const sampleToken = {
    schemaVersion: 1,
    id: 'cyber-neon',
    name: '赛博霓虹',
    description: '科技极客黑金风格',
    headingStyle: 'badge',
    colors: {
      accent: '#00FFA3',
      light: '#0A1A14',
      title: '#E0FFF4',
      border: '#005537',
      codeBackground: '#050D0A',
    },
    typography: {
      fontPreset: 'monospace',
      baseFontSize: 15,
      lineHeight: 1.75,
      paragraphGap: 16,
      letterSpacing: 0.5,
    },
    rawCssOverrides: 'h1 { text-transform: uppercase; }',
  };

  describe('compileCustomThemeToAppleConfig', () => {
    it('正确将 Token 映射为运行时 AppleThemeConfig 结构', () => {
      const config = compileCustomThemeToAppleConfig(sampleToken);
      expect(config.name).toBe('赛博霓虹');
      expect(config.primaryColor).toBe('#00FFA3');
      expect(config.lightColor).toBe('#0A1A14');
      expect(config.titleColor).toBe('#E0FFF4');
      expect(config.borderColor).toBe('#005537');
      expect(config.codeBackground).toBe('#050D0A');
      expect(config.headingStyle).toBe('badge');
      expect(config.fontFamily).toBe('monospace');
      expect(config.baseFontSize).toBe(15);
      expect(config.lineHeight).toBe(1.75);
      expect(config.paragraphGap).toBe(16);
      expect(config.letterSpacing).toBe(0.5);
      expect(config.rawCssOverrides).toBe('h1 { text-transform: uppercase; }');
    });

    it('对未填写的次要属性提供安全回退', () => {
      const minimalToken = {
        name: '极简',
        colors: { accent: '#123456' },
      };
      const config = compileCustomThemeToAppleConfig(minimalToken);
      expect(config.name).toBe('极简');
      expect(config.primaryColor).toBe('#123456');
      expect(config.lightColor).toBeDefined();
      expect(config.headingStyle).toBe('default');
      expect(config.blockquoteStyle).toBe('soft');
      expect(config.h3Decoration).toBe('bottom-line-left');
      expect(config.strongStyle).toBe('color');
      expect(config.sectionBg).toBe('#ffffff');
    });

    it('正确映射自定义 blockquoteStyle、h3Style、strongStyle 与 canvas 背景色', () => {
      const advancedToken = {
        name: '复古人文',
        colors: {
          accent: '#8C6239',
          canvas: '#FAF8F5',
        },
        blockquote: {
          style: 'center',
        },
        heading: {
          h3Style: 'left-border',
        },
        typography: {
          strongStyle: 'highlight',
        },
      };
      const config = compileCustomThemeToAppleConfig(advancedToken);
      expect(config.sectionBg).toBe('#FAF8F5');
      expect(config.blockquoteStyle).toBe('center');
      expect(config.h3Decoration).toBe('left-border');
      expect(config.strongStyle).toBe('highlight');
      expect(config.strongBg).toBe(true);

      const minimalStyleToken = {
        name: '极简冷色',
        colors: { accent: '#2563EB' },
        blockquoteStyle: 'minimal',
        h3Style: 'simple',
        strongStyle: 'neutral',
      };
      const config2 = compileCustomThemeToAppleConfig(minimalStyleToken);
      expect(config2.blockquoteStyle).toBe('minimal');
      expect(config2.h3Decoration).toBe('simple');
      expect(config2.strongStyle).toBe('neutral');
      expect(config2.strongBg).toBe(false);
    });
  });

  describe('compileCustomThemeToAppleOptions', () => {
    it('生成包含 customThemeConfig 的完整 AppleThemeOptions', () => {
      const options = compileCustomThemeToAppleOptions(sampleToken);
      expect(options.theme).toBe('cyber-neon');
      expect(options.fontFamily).toBe('monospace');
      expect(options.fontSize).toBe(15);
      expect(options.lineHeight).toBe(1.75);
      expect(options.customThemeConfig).toBeDefined();
      expect(options.customThemeConfig?.primaryColor).toBe('#00FFA3');
    });
  });

  describe('findCustomTheme', () => {
    const list = [
      { id: 'theme-1', name: '主题 1' },
      { id: 'theme-2', name: '主题 2' },
    ];

    it('根据 ID 返回对应的 Token', () => {
      const found = findCustomTheme(list, 'theme-2');
      expect(found).toBeDefined();
      expect(found?.name).toBe('主题 2');
    });

    it('不存在或输入非法时安全返回 null', () => {
      expect(findCustomTheme(list, 'non-existent')).toBeNull();
      expect(findCustomTheme(null, 'theme-1')).toBeNull();
      expect(findCustomTheme(list, '')).toBeNull();
    });
  });

  describe('listAllThemes', () => {
    it('合并官方内置与用户自定义主题', () => {
      const customList = [
        { id: 'custom-a', name: '自定义 A' },
      ];
      const all = listAllThemes(customList);
      expect(all.length).toBe(BUILTIN_ARTICLE_THEMES.length + 1);
      const builtins = all.filter((t) => !t.isCustom);
      const customs = all.filter((t) => t.isCustom);
      expect(builtins.length).toBe(BUILTIN_ARTICLE_THEMES.length);
      expect(customs.length).toBe(1);
      expect(customs[0].value).toBe('custom-a');
      expect(customs[0].label).toBe('自定义 A');
    });

    it('空列表时只返回官方内置主题', () => {
      const all = listAllThemes([]);
      expect(all.length).toBe(BUILTIN_ARTICLE_THEMES.length);
      expect(all.every((t) => !t.isCustom)).toBe(true);
    });
  });

  describe('CSS-driven custom theme compilation & inline override', () => {
    it('CSS 主题默认禁用 h3 干扰底线与 blockquote 左竖线，并保护互动卡/代码块及仅匹配根 section::before', () => {
      const cssToken = {
        id: 'custom-editorial-paper',
        name: '刊物人文',
        colors: { accent: '#8C5A3C' },
        css: 'section { background: #FCF9F2; counter-reset: h2sec; } section::before { content: "HEADER "; color: #8C5A3C; } h2 { counter-increment: h2sec; color: #8C5A3C; } h2::before { content: counter(h2sec, decimal-leading-zero) " · "; color: #8C5A3C; } p { color: #3A332D; text-align: left; }',
      };

      expect(getCustomThemeCss(cssToken)).toContain('counter-reset');
      const config = compileCustomThemeToAppleConfig(cssToken);
      expect(config.h3Decoration).toBe('none');
      expect(config.blockquoteStyle).toBe('none');

      const baseHtml = [
        '<section style="color:#3e3e3e;">',
        '<h2 style="color:#3e3e3e;">章节标题</h2>',
        '<p style="color:#3e3e3e;">正文内容</p>',
        '<section class="code-snippet__fix" style="background:#0d1117;"><section style="color:#fff;">code</section></section>',
        '<section class="owc-engagement-card" style="text-align:center;"><p style="text-align:center;font-size:14px;">欢迎点赞</p></section>',
        '</section>',
      ].join('');
      const result = applyCustomThemeCssToHtml(baseHtml, cssToken);

      expect(result).toContain('#8C5A3C');
      expect(result).toContain('#3A332D');
      expect(result).toContain('01 · ');
      expect(result).toContain('HEADER ');
      // 根 section::before 仅注入一次（不注入到嵌套代码块/互动卡 section）
      expect(result.match(/HEADER /g)).toHaveLength(1);
      // 嵌套代码块与互动卡样式完整保留，不被 section / p 规则覆盖
      expect(result).toContain('class="code-snippet__fix" style="background:#0d1117;"');
      expect(result).toContain('<p style="text-align:center;font-size:14px;">欢迎点赞</p>');
    });

    it('resolveThemeUpdateOptions 在内置主题与自定义主题间切换时正确同步 themeColor 与 customColor', () => {
      const customTheme = {
        id: 'custom-amber',
        name: '琥珀',
        colors: { accent: '#D97706' },
        css: 'h2 { color: #D97706; }',
      };
      const settings = {
        theme: 'github',
        themeColor: 'blue',
        customColor: '#0366d6',
        customThemes: [customTheme],
      };

      const toCustom = resolveThemeUpdateOptions(settings, 'custom-amber');
      expect(toCustom.themeColor).toBe('custom');
      expect(toCustom.customColor).toBe('#D97706');
      expect(toCustom.customThemeConfig?.primaryColor).toBe('#D97706');

      const backToBuiltin = resolveThemeUpdateOptions(settings, 'github');
      expect(backToBuiltin.themeColor).toBe('blue');
      expect(backToBuiltin.customColor).toBe('#0366d6');
      expect(backToBuiltin.customThemeConfig).toBeNull();
    });
  });
});
