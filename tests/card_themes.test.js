/*
## 核心功能

验证图片卡片六套主题（2026-09-13 照搬 red-note）：主题定义齐全、未知 id 回落默认、
旧三主题 id 别名迁移、六主题差异真实存在（token + coverStyle 四式）、
scoped CSS 不泄漏宿主主题变量、B03 typography 覆盖兼容。

## 输入

接收被测模块 card-themes.js / card-settings-model.js 与断言数据（无 Obsidian/jsdom 依赖）。

## 输出

输出主题注册、回落、别名、CSS 内容与差异性的自动化断言。

## 定位

位于 tests/，保护卡片主题层的回归；red-note 照搬体系的机械化检查点。

## 依赖

关键依赖：Vitest；被测模块为纯数据 + 字符串模板，无运行时依赖。

## 维护规则

- 新增主题时：THEMES 同步 token + coverStyle，并在此补差异化断言。
- 主题 CSS 不得引用 Obsidian 宿主变量（--background-*、--theme-* 等算子）。
*/

import { describe, it, expect } from 'vitest';

const {
  CARD_THEME_IDS,
  CARD_THEME_ID_ALIASES,
  DEFAULT_CARD_THEME_ID,
  getCardTheme,
  hasCardTheme,
  buildCardPageCss,
} = await import('../services/card-themes.js');
const { VERIFIED_CARD_THEME_IDS, normalizeCardLayoutSettings } = await import('../services/card-settings-model.js');

describe('card themes (red-note 六主题)', () => {
  it('六套主题全部注册：simple-white / gradient-blue / dark-gold / neon-purple / forest-green / rose-gold', () => {
    expect([...CARD_THEME_IDS]).toEqual([
      'simple-white', 'gradient-blue', 'dark-gold', 'neon-purple', 'forest-green', 'rose-gold',
    ]);
    for (const id of CARD_THEME_IDS) {
      expect(hasCardTheme(id)).toBe(true);
      const theme = getCardTheme(id);
      expect(theme.id).toBe(id);
      expect(theme.name.length).toBeGreaterThan(0);
      // 双层卡 token 完整（red-note 骨架）
      expect(theme.tokens.cardBackground).toBeTruthy();
      expect(theme.tokens.cardShadow).toBeTruthy();
      // coverStyle 属于四式之一
      expect(['magazine', 'centered', 'luxury', 'neon']).toContain(theme.coverStyle);
    }
  });

  it('设置白名单与主题注册表一致', () => {
    expect([...VERIFIED_CARD_THEME_IDS]).toEqual([...CARD_THEME_IDS]);
  });

  it('未知 id 回落默认主题，默认是 simple-white', () => {
    expect(DEFAULT_CARD_THEME_ID).toBe('simple-white');
    expect(getCardTheme('not-exist').id).toBe('simple-white');
  });

  it('旧三主题 id 静默迁移：clear-notes→simple-white / paper-notes→rose-gold / dark-take→dark-gold', () => {
    for (const [oldId, newId] of Object.entries(CARD_THEME_ID_ALIASES)) {
      expect(normalizeCardLayoutSettings({ themeId: oldId }).themeId).toBe(newId);
      expect(hasCardTheme(oldId)).toBe(false); // 旧 id 不再是已注册主题
    }
  });

  it('六主题不是六种底色：coverStyle 分组、衬线、字重、强调色均有真实差异', () => {
    const themes = CARD_THEME_IDS.map((id) => getCardTheme(id));
    // coverStyle 四式分组：magazine×1 / centered×2 / luxury×2 / neon×1
    const styles = themes.map((t) => t.coverStyle);
    expect(styles.filter((s) => s === 'luxury')).toHaveLength(2);
    expect(styles.filter((s) => s === 'centered')).toHaveLength(2);
    expect(styles).toContain('magazine');
    expect(styles).toContain('neon');
    // 衬线主题（黑金/玫瑰金）全卡衬线
    for (const id of ['dark-gold', 'rose-gold']) {
      expect(getCardTheme(id).tokens.fontFamily).toContain('Songti');
    }
    for (const id of ['simple-white', 'neon-purple']) {
      expect(getCardTheme(id).tokens.fontFamily).not.toContain('Songti');
    }
    // 强调色互不相同
    expect(new Set(themes.map((t) => t.tokens.accentColor)).size).toBe(6);
  });

  it('buildCardPageCss：共享 red-note 骨架 + 双层卡 + 封面四式装饰', () => {
    for (const id of CARD_THEME_IDS) {
      const css = buildCardPageCss(getCardTheme(id));
      // 双层卡骨架
      expect(css).toContain('.icard-page');
      expect(css).toContain('border-radius: 12px');
      expect(css).toContain('.icard-footer');
      // red-note markdown 装饰
      expect(css).toContain('border-bottom: 3px solid');
      expect(css).toContain('border-left: 4px solid');
      // 封面 coverStyle 类
      expect(css).toContain(`.icard-cover--${getCardTheme(id).coverStyle}`);
    }
    // centered 式的圆角短条（red-note CoverCard default 装饰）
    expect(buildCardPageCss(getCardTheme('gradient-blue'))).toContain('border-radius: 999px');
    // neon 式顶栏 NOTES 标签
    expect(buildCardPageCss(getCardTheme('neon-purple'))).toContain('NOTES');
  });

  it('主题 CSS 全部显式字面量，禁止宿主主题变量', () => {
    for (const id of CARD_THEME_IDS) {
      const css = buildCardPageCss(getCardTheme(id));
      expect(css).not.toMatch(/--background-modi|--theme-|--text-normal|--text-muted/);
    }
  });

  it('typography 覆盖对新主题仍然生效（B03 兼容）', () => {
    const css = buildCardPageCss(getCardTheme('neon-purple'), { fontSize: 16, lineHeight: 1.9, pagePadding: 34 });
    expect(css).toContain('font-size: 16px');
    expect(css).toContain('line-height: 1.9');
    // pagePadding 现在落在内卡 padding（双层卡骨架），外框固定 14px
    expect(css).toContain('padding: 34px');
    expect(css).toContain('padding: 14px');
  });
});
