/*
## 核心功能

覆盖 theme color 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 theme color 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/


import { describe, it, expect, beforeAll } from 'vitest';

const { getBundledThemeSource } = require('./helpers/theme-runtime-source.js');

// Mock window
global.window = {};

describe('AppleTheme Color Logic', () => {
  let AppleTheme;

  beforeAll(() => {
    global.window.AppleImportedThemeConfigs = {
      'candidate-test-theme': {
        name: '候选·测试主题',
        kind: 'imported-css-candidate',
        overrides: {
          section: 'background-color: #f8f0df; color: #333333;',
          h1: 'color: #123456; margin: 8px 0;',
        },
      },
    };

    // Load the AppleTheme class directly from the file
    // Note: In a real module system we would import it, but since it's a non-exported browser script
    // we read and eval it.
    const themeContent = getBundledThemeSource();

    // Evaluate the file content to load the class into window.AppleTheme
    // using Function constructor to execute in global scope
    // Fix: The file has a line `window.AppleTheme = AppleTheme;` at the end which causes ReferenceError
    // because AppleTheme is a named class expression assigned to window.AppleTheme, not a var.
    // We strip that line for testing.
    // Use a regex to be robust against whitespace or changes in the exact string
    const safeContent = themeContent.replace(/window\.AppleTheme\s*=\s*AppleTheme\s*;?/, '');
    new Function(safeContent)();

    AppleTheme = global.window.AppleTheme;
  });

  describe('Tone-on-Tone Mapping', () => {
    it('should have a deep color mapping for every standard theme color', () => {
      const standardColors = Object.keys(AppleTheme.THEME_COLORS);
      const deepColors = Object.keys(AppleTheme.THEME_COLORS_DEEP);

      expect(standardColors.sort()).toEqual(deepColors.sort());
    });

    it('should return default dark grey when coloredHeader is false', () => {
      const theme = new AppleTheme({
        themeColor: 'purple',
        coloredHeader: false
      });
      expect(theme.getHeadingColorValue()).toBe('#3e3e3e');
    });

    it('should return deep purple when coloredHeader is true and theme is purple', () => {
      const theme = new AppleTheme({
        themeColor: 'purple',
        coloredHeader: true
      });
      // Standard Purple: #6f42c1 -> Deep Purple: #4a2b82
      expect(theme.getHeadingColorValue()).toBe('#4a2b82');
    });
  });

  describe('Custom Color Algorithm', () => {
    it('should darken custom color by ~20% when coloredHeader is true', () => {
      const customHex = '#FF0000'; // Pure Red
      const theme = new AppleTheme({
        themeColor: 'custom',
        customColor: customHex,
        coloredHeader: true
      });

      const result = theme.getHeadingColorValue();

      // We expect it to be darker.
      // R: 255 * 0.8 = 204 (CC) -> #cc0000
      expect(result.toLowerCase()).toBe('#cc0000');
    });

    it('should handle custom color black correctly (clamped)', () => {
        const theme = new AppleTheme({
            themeColor: 'custom',
            customColor: '#000000',
            coloredHeader: true
        });
        // 0 * 0.8 = 0
        expect(theme.getHeadingColorValue()).toBe('#000000');
    });

    it('should handle hex strings with or without hash', () => {
        const theme = new AppleTheme();
        expect(theme.adjustColorBrightness('FFFFFF', -20).toLowerCase()).toBe('#cccccc');
        expect(theme.adjustColorBrightness('#FFFFFF', -20).toLowerCase()).toBe('#cccccc');
    });
  });

  describe('Avatar Watermark Layout', () => {
    it('should keep avatar and caption styles inline-friendly for hostile editor defaults', () => {
      const theme = new AppleTheme({ theme: 'wechat' });
      const avatarStyle = theme.getStyle('avatar');
      const captionStyle = theme.getStyle('avatar-caption');
      const headerStyle = theme.getStyle('avatar-header');

      expect(avatarStyle).toContain('display: inline-block !important;');
      expect(avatarStyle).toContain('vertical-align: middle !important;');
      expect(captionStyle).toContain('display: inline-block !important;');
      expect(captionStyle).toContain('vertical-align: middle !important;');
      expect(headerStyle).toContain('flex-wrap: nowrap !important;');
    });
  });

  describe('Chinese paragraph wrapping', () => {
    it('should keep paragraph styles from orphaning closing punctuation', () => {
      const theme = new AppleTheme({ theme: 'grid' });
      const paragraphStyle = theme.getStyle('p');
      const sectionStyle = theme.getStyle('section');

      expect(paragraphStyle).toContain('text-align-last: left');
      expect(paragraphStyle).toContain('word-break: normal');
      expect(paragraphStyle).toContain('overflow-wrap: break-word');
      expect(paragraphStyle).toContain('line-break: strict');
      expect(sectionStyle).toContain('word-break: normal');
      expect(sectionStyle).toContain('line-break: strict');
    });
  });

  describe('Consolidated Theme List', () => {
    it('should expose only the consolidated built-in theme set', () => {
      const themeList = AppleTheme.getThemeList();

      expect(themeList).toEqual([
        { value: 'github', label: '简约' },
        { value: 'wechat', label: '经典' },
        { value: 'serif', label: '优雅' },
        { value: 'paper', label: '纸张长文' },
        { value: 'grid', label: '网格文档' },
        { value: 'typo', label: 'Typo' },
        { value: 'media', label: '清爽媒体' },
        { value: 'colorful', label: '彩色强调' },
      ]);
    });

    it('should ignore stale imported candidate theme globals', () => {
      const themeList = AppleTheme.getThemeList();

      expect(themeList.some((theme) => theme.value.startsWith('candidate-'))).toBe(false);
      expect(new AppleTheme({ theme: 'candidate-test-theme' }).getThemeConfig().name).toBe('简约');
    });
  });

  describe('Consolidated Theme Templates', () => {
    it('should enhance the default minimal theme without adding a Maple duplicate', () => {
      const theme = new AppleTheme({
        theme: 'github',
        themeColor: 'green',
      });

      expect(theme.getStyle('p')).toContain('margin: 0 0 18px 0;');
      expect(theme.getStyle('h3')).toContain('border-bottom: 2px solid #28a745;');
      expect(theme.getStyle('th')).toContain('background: #f6f8fa;');
      expect(theme.getStyle('mark')).toBe('background-color: #fff1a8; padding: 0 2px; border-radius: 2px;');
      expect(theme.getStyle('strong')).toContain('color: #28a745;');
    });

    it('should keep the new templates driven by the selected theme color', () => {
      const paper = new AppleTheme({ theme: 'paper', themeColor: 'rose' });
      const grid = new AppleTheme({ theme: 'grid', themeColor: 'teal' });
      const media = new AppleTheme({ theme: 'media', themeColor: 'orange' });
      const colorful = new AppleTheme({ theme: 'colorful', themeColor: 'purple' });

      expect(paper.getStyle('h1')).toContain('border-top: 2px solid #e83e8c;');
      expect(grid.getStyle('h2')).toContain('border: 1px solid #20c99755;');
      expect(media.getStyle('h2')).toContain('background-size: 100% 2px;');
      expect(colorful.getStyle('h1')).toContain('background: #6f42c1;');
    });

    it('should shift distinctive new-theme heading treatments down to article section levels', () => {
      const paper = new AppleTheme({ theme: 'paper', themeColor: 'rose' });
      const grid = new AppleTheme({ theme: 'grid', themeColor: 'teal' });
      const typo = new AppleTheme({ theme: 'typo' });
      const media = new AppleTheme({ theme: 'media', themeColor: 'orange' });
      const colorful = new AppleTheme({ theme: 'colorful', themeColor: 'purple' });

      expect(paper.getStyle('h2')).toContain('border-top: 2px solid #e83e8c;');
      expect(paper.getStyle('h2')).toContain('font-size: 22px;');
      expect(paper.getStyle('h3')).toContain('border-bottom: 2px solid #e83e8c;');
      expect(paper.getStyle('h4')).toContain('border-top: 1px solid #e83e8c55;');
      expect(grid.getStyle('h2')).toContain('border: 1px solid #20c99755;');
      expect(grid.getStyle('h3')).toContain('border-left: 3px solid #20c997;');
      expect(grid.getStyle('h4')).toContain('background-image: linear-gradient(#20c997, #20c997);');
      expect(typo.getStyle('h2')).toContain('border-bottom: 1px solid #d8d8d8;');
      expect(typo.getStyle('h3')).toContain('background-image: linear-gradient(#d8d8d8, #d8d8d8);');
      expect(typo.getStyle('h4')).toContain('border-left: 2px solid #d8d8d8;');
      expect(media.getStyle('h2')).toContain('background-size: 100% 2px;');
      expect(media.getStyle('h3')).toContain('background-size: 60% 2px;');
      expect(media.getStyle('h4')).toContain('border: 1px solid #fd7e1433;');
      expect(colorful.getStyle('h2')).toContain('background: #6f42c1;');
      expect(colorful.getStyle('h3')).toContain('border-left: 4px solid #6f42c1;');
      expect(colorful.getStyle('h4')).toContain('border-bottom: 2px solid #6f42c1;');
    });

    it('should keep new theme surfaces and regular quotes distinct from callout cards', () => {
      const grid = new AppleTheme({ theme: 'grid', themeColor: 'teal' });
      const media = new AppleTheme({ theme: 'media', themeColor: 'orange' });
      const colorful = new AppleTheme({ theme: 'colorful', themeColor: 'purple' });

      expect(grid.getStyle('section')).toContain('background-color: #ffffff;');
      expect(grid.getStyle('section')).toContain('background-image: linear-gradient(rgba(32, 201, 151, 0.035) 1px, transparent 1px)');
      expect(grid.getStyle('section')).toContain('padding: 20px 22px;');
      expect(grid.getStyle('section')).toContain('box-sizing: border-box;');
      expect(grid.getStyle('section')).toContain('color: #344054;');
      expect(grid.getStyle('section')).not.toContain('light-dark(');
      expect(grid.getStyle('section')).not.toContain('color-scheme:');
      expect(grid.getStyle('section')).not.toContain('text-shadow:');
      expect(grid.getStyle('p')).toContain('color: #344054;');
      expect(grid.getStyle('p')).not.toContain('light-dark(');
      expect(grid.getStyle('li p')).not.toContain('color:');
      expect(grid.getStyle('blockquote')).toContain('border-left: 4px solid #20c99799;');
      expect(grid.getStyle('blockquote')).toContain('color: #4b5565;');
      expect(grid.getStyle('blockquote')).not.toContain('light-dark(');
      expect(media.getStyle('blockquote')).toContain('border-left: 3px solid #fd7e1499;');
      expect(colorful.getStyle('blockquote')).toContain('border-left: 4px solid #6f42c199;');
      expect(grid.getStyle('blockquote')).not.toContain('border: 1px solid');
      expect(media.getStyle('blockquote')).not.toContain('border: 1px solid');
      expect(colorful.getStyle('blockquote')).not.toContain('border: 1px solid');
    });

    it('should give background-backed paper and grid themes responsive extra side breathing room', () => {
      const paperDefault = new AppleTheme({ theme: 'paper', sidePadding: 16 });
      const gridDefault = new AppleTheme({ theme: 'grid', sidePadding: 16 });
      const paperCustom = new AppleTheme({ theme: 'paper', sidePadding: 32 });
      const gridCustom = new AppleTheme({ theme: 'grid', sidePadding: 36 });
      const gridNudged = new AppleTheme({ theme: 'grid', sidePadding: 17 });
      const github = new AppleTheme({ theme: 'github', sidePadding: 16 });

      expect(paperDefault.getStyle('section')).toContain('padding: 20px 22px;');
      expect(gridDefault.getStyle('section')).toContain('padding: 20px 22px;');
      expect(paperDefault.getStyle('section')).toContain('box-sizing: border-box;');
      expect(gridDefault.getStyle('section')).toContain('box-sizing: border-box;');
      expect(gridNudged.getStyle('section')).toContain('padding: 20px 23px;');
      expect(paperCustom.getStyle('section')).toContain('padding: 20px 38px;');
      expect(gridCustom.getStyle('section')).toContain('padding: 20px 42px;');
      expect(github.getStyle('section')).toContain('padding: 20px 16px;');
      expect(github.getStyle('section')).not.toContain('box-sizing: border-box;');
    });

    it('should keep grid-specific section background handling out of other built-in themes', () => {
      const themeNames = AppleTheme.getThemeList()
        .map((theme) => theme.value)
        .filter((themeName) => themeName !== 'grid');

      for (const themeName of themeNames) {
        const sectionStyle = new AppleTheme({ theme: themeName, themeColor: 'teal' }).getStyle('section');

        expect(sectionStyle).toContain('background:');
        expect(sectionStyle).not.toContain('background-image:');
        expect(sectionStyle).not.toContain('background-color:');
        expect(sectionStyle).not.toContain('rgba(32, 201, 151, 0.035)');
      }
    });

    it('should keep neutral quote styling distinct from neutral callouts in soft themes', () => {
      const theme = new AppleTheme({
        theme: 'wechat',
        themeColor: 'blue',
        quoteCalloutStyleMode: 'neutral',
      });

      const blockquoteStyle = theme.getStyle('blockquote');

      expect(blockquoteStyle).toContain('border-left: 3px solid #d9d9d9');
      expect(blockquoteStyle).toContain('margin: 16px 0 16px 8px');
      expect(blockquoteStyle).not.toContain('border: 1px solid #d9d9d9');
    });

    it('should render serif blockquotes without a left accent bar', () => {
      const theme = new AppleTheme({ theme: 'serif', themeColor: 'blue' });
      const blockquoteStyle = theme.getStyle('blockquote');

      expect(blockquoteStyle).not.toContain('border-left:');
      expect(blockquoteStyle).toContain('width: 92%;');
      expect(blockquoteStyle).toContain('margin: 24px auto;');
      expect(blockquoteStyle).toContain('border-top: 1px solid #0366d655;');
      expect(blockquoteStyle).toContain('border-bottom: 1px solid #0366d655;');
      expect(blockquoteStyle).toContain("font-family: 'Times New Roman', Georgia, 'SimSun', serif;");
    });

    it('should give Typo an independent long-form typography structure', () => {
      const theme = new AppleTheme({ theme: 'typo' });

      expect(theme.getStyle('p')).toContain('text-indent: 2em;');
      expect(theme.getStyle('h1')).toContain('text-align: left;');
      expect(theme.getStyle('h1')).toContain('border-bottom: 1px solid #d8d8d8;');
    });

    it('should keep paragraph indentation exclusive to Typo', () => {
      const themeNames = AppleTheme.getThemeList().map((theme) => theme.value);

      for (const themeName of themeNames) {
        const paragraphStyle = new AppleTheme({ theme: themeName }).getStyle('p');
        if (themeName === 'typo') {
          expect(paragraphStyle).toContain('text-indent: 2em;');
        } else {
          expect(paragraphStyle).not.toContain('text-indent:');
        }
      }
    });
  });

  describe('Heading Typography Scale', () => {
    it('should keep the recommended size preset in a compact WeChat-friendly range', () => {
      const recommended = AppleTheme.FONT_SIZES[3];

      expect(recommended).toMatchObject({
        base: 16,
        h1: 30,
        h2: 22,
        h3: 18,
        h4: 16,
        h5: 16,
        h6: 16,
      });
    });

    it('should apply tighter spacing for h2 and h3 in the default theme', () => {
      const theme = new AppleTheme({
        theme: 'wechat',
        fontSize: 3,
      });

      const h2Style = theme.getStyle('h2');
      const h3Style = theme.getStyle('h3');

      expect(h2Style).toContain('font-size: 22px;');
      expect(h2Style).toContain('margin: 34px auto 20px;');
      expect(h3Style).toContain('font-size: 18px;');
      expect(h3Style).toContain('margin: 24px 0 12px;');
    });

    it('should keep classic heading decorations compatible with serif fonts', () => {
      const theme = new AppleTheme({
        theme: 'wechat',
        themeColor: 'blue',
        fontFamily: 'serif',
      });

      const h2Style = theme.getStyle('h2');
      const h3Style = theme.getStyle('h3');

      expect(h2Style).toContain("font-family: 'Times New Roman', Georgia, 'SimSun', serif;");
      expect(h2Style).toContain('background-image: linear-gradient(to right, transparent, #0366d6, transparent);');
      expect(h3Style).toContain('border-left: 3px solid #0366d6;');
      expect(h3Style).toContain('background: #0366d60A;');
    });
  });

  describe('Spacing overrides (line / paragraph / letter spacing)', () => {
    it('should override line-height when set explicitly', () => {
      const theme = new AppleTheme({ theme: 'serif', lineHeight: 1.5 });
      const pStyle = theme.getStyle('p');
      expect(pStyle).toContain('line-height: 1.5');
      expect(pStyle).not.toContain('line-height: 1.8');
    });

    it('should fall back to theme default line-height when null/undefined', () => {
      expect(new AppleTheme({ theme: 'serif', lineHeight: null }).getStyle('p')).toContain('line-height: 1.8');
      expect(new AppleTheme({ theme: 'serif' }).getStyle('p')).toContain('line-height: 1.8');
    });

    it('should override paragraph gap when set explicitly', () => {
      const pStyle = new AppleTheme({ theme: 'serif', paragraphGap: 30 }).getStyle('p');
      expect(pStyle).toContain('margin: 0 0 30px 0');
      expect(pStyle).not.toContain('margin: 0 0 26px 0');
    });

    it('should use updated serif default paragraph gap (26) when not overridden', () => {
      const pStyle = new AppleTheme({ theme: 'serif' }).getStyle('p');
      expect(pStyle).toContain('margin: 0 0 26px 0');
    });

    it('should apply explicit letter-spacing to p and li, and default to 0px', () => {
      // Explicit nonzero override applies to both p and li.
      expect(new AppleTheme({ theme: 'serif', letterSpacing: 1 }).getStyle('p')).toContain('letter-spacing: 1px');
      expect(new AppleTheme({ theme: 'serif', letterSpacing: 1 }).getStyle('li')).toContain('letter-spacing: 1px');
      // Default (0): p keeps the legacy byte-identical "letter-spacing: 0;" and li emits no letter-spacing at all.
      expect(new AppleTheme({ theme: 'serif' }).getStyle('p')).toContain('letter-spacing: 0;');
      expect(new AppleTheme({ theme: 'serif' }).getStyle('li')).not.toContain('letter-spacing');
    });

    it('should NOT apply body letter-spacing to headings (headings keep their own)', () => {
      const theme = new AppleTheme({ theme: 'serif', letterSpacing: 2 });
      const h2 = theme.getStyle('h2');
      // editorial-h1 decoration uses its own 1px, not the body 2px
      expect(h2).toContain('letter-spacing: 1px');
      expect(h2).not.toContain('letter-spacing: 2px');
    });

    it('should update spacing values at runtime via update()', () => {
      const theme = new AppleTheme({ theme: 'serif' });
      theme.update({ lineHeight: 2.0, paragraphGap: 40, letterSpacing: 0.5 });
      const pStyle = theme.getStyle('p');
      expect(pStyle).toContain('line-height: 2');
      expect(pStyle).toContain('margin: 0 0 40px 0');
      expect(pStyle).toContain('letter-spacing: 0.5px');
    });

    it('should reset to inherited default when update() receives null', () => {
      const theme = new AppleTheme({ theme: 'serif', lineHeight: 1.5 });
      theme.update({ lineHeight: null });
      expect(theme.getStyle('p')).toContain('line-height: 1.8');
    });

    it('should apply line-height globally across body elements (section, blockquote, ul, li)', () => {
      const theme = new AppleTheme({ theme: 'serif', lineHeight: 1.6 });
      expect(theme.getStyle('section')).toContain('line-height: 1.6');
      expect(theme.getStyle('ul')).toContain('line-height: 1.6');
      expect(theme.getStyle('li')).toContain('line-height: 1.6');
    });

    it('should reflect update() overrides in getStyle (runtime panel sequence)', () => {
      // 模拟真实面板流程：以默认设置构造（lineHeight=null），拖动滑块后 update() 覆盖。
      const theme = new AppleTheme({ theme: 'serif' });
      expect(theme.getStyle('p')).toContain('line-height: 1.8');
      theme.update({ lineHeight: 1.5, paragraphGap: 30, letterSpacing: 1 });
      expect(theme.getStyle('p')).toContain('line-height: 1.5');
      expect(theme.getStyle('p')).toContain('margin: 0 0 30px 0');
      expect(theme.getStyle('p')).toContain('letter-spacing: 1px');
      expect(theme.getStyle('li')).toContain('letter-spacing: 1px');
    });
  });
});
