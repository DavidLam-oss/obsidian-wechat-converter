
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

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
    const themePath = path.join(__dirname, '../themes/apple-theme.js');
    const themeContent = fs.readFileSync(themePath, 'utf8');

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
});
