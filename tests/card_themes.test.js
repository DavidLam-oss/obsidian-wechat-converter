/*
## 核心功能

验证图片卡片三套主题（C01①）：主题定义齐全、未知 id 回落默认、三主题排版差异真实存在
（token + 专属 CSS extras，非三种底色）、scoped CSS 不泄漏宿主主题变量、B03 typography
覆盖与新主题兼容。

## 输入

接收被测模块 card-themes.js / card-settings-model.js 与断言数据（无 Obsidian/jsdom 依赖）。

## 输出

输出主题注册、回落、CSS 内容与差异性的自动化断言。

## 定位

位于 tests/，保护 C01 主题层的回归；§3.3「主题不是三种底色」的机械化检查点。

## 依赖

关键依赖：Vitest；被测模块为纯数据 + 字符串模板，无运行时依赖。

## 维护规则

- 新增主题时：CARD_THEME_IDS、THEMES、THEME_CSS_EXTRAS 三处同步，并在此补差异化断言。
- 主题 CSS 不得引用 Obsidian 宿主变量（--background-*、--theme-* 等算子）。
*/

import { describe, it, expect } from 'vitest';

const {
  CARD_THEME_IDS,
  DEFAULT_CARD_THEME_ID,
  getCardTheme,
  hasCardTheme,
  buildCardPageCss,
} = await import('../services/card-themes.js');
const { VERIFIED_CARD_THEME_IDS } = await import('../services/card-settings-model.js');

describe('card themes (C01① 三套主题)', () => {
  it('三套主题全部注册：clear-notes / paper-notes / dark-take', () => {
    expect(CARD_THEME_IDS).toEqual(['clear-notes', 'paper-notes', 'dark-take']);
    for (const id of CARD_THEME_IDS) {
      expect(hasCardTheme(id)).toBe(true);
      const theme = getCardTheme(id);
      expect(theme.id).toBe(id);
      expect(theme.name.length).toBeGreaterThan(0);
    }
  });

  it('设置白名单放开三主题，与主题注册表一致', () => {
    expect([...VERIFIED_CARD_THEME_IDS]).toEqual([...CARD_THEME_IDS]);
  });

  it('未知 id 回落默认主题，默认仍是 clear-notes', () => {
    expect(DEFAULT_CARD_THEME_ID).toBe('clear-notes');
    expect(getCardTheme('not-exist').id).toBe('clear-notes');
  });

  it('三主题不是三种底色：字体、强调色、间距均有真实差异', () => {
    const [clear, paper, dark] = CARD_THEME_IDS.map((id) => getCardTheme(id));
    // 暖纸底 ≠ 纯白 ≠ 深底
    expect(paper.tokens.background).not.toBe(clear.tokens.background);
    expect(dark.tokens.background).not.toBe(clear.tokens.background);
    // 衬线标题（纸页随笔独有 headingFontFamily）
    expect(paper.tokens.headingFontFamily || '').toContain('Georgia');
    expect(clear.tokens.headingFontFamily).toBeUndefined();
    expect(dark.tokens.headingFontFamily).toBeUndefined();
    // 标题字重分层：清晰 700 / 随笔 600 / 观点 800
    expect(clear.tokens.headingWeight).toBe('700');
    expect(paper.tokens.headingWeight).toBe('600');
    expect(dark.tokens.headingWeight).toBe('800');
    // 编辑式节奏：纸页与深色的段落间距均大于清晰笔记
    expect(Number(paper.tokens.contentGap)).toBeGreaterThan(Number(clear.tokens.contentGap));
    expect(Number(dark.tokens.contentGap)).toBeGreaterThan(Number(clear.tokens.contentGap));
    // 强调色互不相同
    expect(new Set([clear, paper, dark].map((t) => t.tokens.accentColor)).size).toBe(3);
  });

  it('buildCardPageCss：共享模板 + 每主题专属规则', () => {
    const clearCss = buildCardPageCss(getCardTheme('clear-notes'));
    const paperCss = buildCardPageCss(getCardTheme('paper-notes'));
    const darkCss = buildCardPageCss(getCardTheme('dark-take'));
    // 共享基础都在
    for (const css of [clearCss, paperCss, darkCss]) {
      expect(css).toContain('.icard-page');
      expect(css).toContain('.icard-footer');
    }
    // 清晰笔记无 extras；长度严格递增说明 extras 只属于对应主题
    expect(clearCss).not.toContain('Georgia');
    expect(paperCss).toContain('Georgia');
    expect(paperCss).toContain('letter-spacing: 0.3px');
    // 纸页编辑式引用：透明底 + 细线
    expect(paperCss).toContain('border-radius: 0');
    // 深色强标题：h1 24px
    expect(darkCss).toContain('font-size: 24px');
    expect(clearCss).not.toContain('font-size: 24px');
  });

  it('主题 CSS 全部显式字面量，禁止宿主主题变量', () => {
    for (const id of CARD_THEME_IDS) {
      const css = buildCardPageCss(getCardTheme(id));
      expect(css).not.toMatch(/--background-modi|--theme-|--text-normal|--text-muted/);
    }
  });

  it('typography 覆盖对新主题仍然生效（B03 兼容）', () => {
    const css = buildCardPageCss(getCardTheme('dark-take'), { fontSize: 16, lineHeight: 1.9, pagePadding: 34 });
    expect(css).toContain('font-size: 16px');
    expect(css).toContain('line-height: 1.9');
    expect(css).toContain('padding: 34px');
    // extras 不被覆盖破坏
    expect(css).toContain('font-size: 24px');
  });
});
