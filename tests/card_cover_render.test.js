import { describe, it, expect } from 'vitest';

/* 封面页装配与输出元素渲染（C01③）：封面页结构 / 页码开关 / 水印元素 / 结果形状。 */

import { createCardDocument } from '../services/card-document.js';
import { renderCardPages, RATIO_PRESETS, assembleCardCoverPage } from '../services/card-render-engine.js';
import { getCardTheme } from '../services/card-themes.js';
import { buildCardPageCss } from '../services/card-themes.js';

const THEME = getCardTheme('simple-white');
const SIZE = { width: 375, height: 500 };

describe('assembleCardCoverPage（DOM 装配）', () => {
  it('封面页含标题/摘要/署名，无页脚不编号，带 coverStyle 类', () => {
    const page = assembleCardCoverPage({
      theme: THEME,
      fields: { title: '我的标题', author: 'David', date: '2026-09-13', excerpt: '摘要一句' },
      size: SIZE,
      document: document,
    });
    expect(page.classList.contains('icard-cover')).toBe(true);
    expect(page.classList.contains('icard-cover--magazine')).toBe(true);
    expect(page.querySelector('.icard-cover-title')?.textContent).toBe('我的标题');
    expect(page.querySelector('.icard-cover-excerpt')?.textContent).toBe('摘要一句');
    // 单一事实只说一次：kicker（顶部）= 日期，meta（置底）= 作者，不重复
    expect(page.querySelector('.icard-cover-kicker')?.textContent).toBe('2026-09-13');
    expect(page.querySelector('.icard-cover-meta')?.textContent).toBe('David');
    expect(page.querySelector('.icard-footer')).toBeNull(); // 封面永不编号
  });

  it('空字段段落整体省略（无摘要则不渲染该节点）', () => {
    const page = assembleCardCoverPage({
      theme: THEME,
      fields: { title: '只有标题', author: '', date: '', excerpt: '' },
      size: SIZE,
      document: document,
    });
    expect(page.querySelector('.icard-cover-excerpt')).toBeNull();
    expect(page.querySelector('.icard-cover-meta')).toBeNull();
    expect(page.querySelector('.icard-cover-kicker')).toBeNull();
  });
});

describe('renderCardPages × 封面/页码/水印（C01③）', () => {
  it('开启封面：结果含 coverPage 与 hasCover，正文页列表不变且从第 1 页编号', async () => {
    const doc = createCardDocument('# 标题\n\n第一段正文。');
    const result = await renderCardPages(doc, {
      theme: THEME,
      size: SIZE,
      contentHeight: 300,
      cover: { fields: { title: '封面标题', author: '', date: '', excerpt: '' } },
      document,
    });
    expect(result.ok).toBe(true);
    expect(result.hasCover).toBe(true);
    expect(result.coverPage instanceof HTMLElement).toBe(true);
    expect(result.coverPage.querySelector('.icard-cover-title')?.textContent).toBe('封面标题');
    expect(result.pages).toHaveLength(1); // 正文页列表不含封面
    expect(result.pages[0].querySelector('.icard-page-num')?.textContent).toBe('1 / 1');
  });

  it('关闭封面（默认）：无 coverPage', async () => {
    const doc = createCardDocument('# 标题\n\n第一段正文。');
    const result = await renderCardPages(doc, { theme: THEME, size: SIZE, contentHeight: 300, document });
    expect(result.ok).toBe(true);
    expect(result.hasCover).toBe(false);
    expect(result.coverPage).toBeNull();
  });

  it('标题为空的封面字段不生效（无有效封面）', async () => {
    const doc = createCardDocument('# 标题');
    const result = await renderCardPages(doc, {
      theme: THEME, size: SIZE, contentHeight: 300,
      cover: { fields: { title: '', author: 'x', date: '', excerpt: '' } },
      document,
    });
    expect(result.hasCover).toBe(false);
  });

  it('pageNumberEnabled=false：正文页无页脚', async () => {
    const doc = createCardDocument('# 标题\n\n第一段正文。');
    const result = await renderCardPages(doc, {
      theme: THEME, size: SIZE, contentHeight: 300, pageNumberEnabled: false, document,
    });
    expect(result.ok).toBe(true);
    expect(result.pages[0].querySelector('.icard-footer')).toBeNull();
  });

  it('watermarkText 非空：正文页各含 .icard-watermark；封面并入底部 meta 行（不渲染独立层）', async () => {
    const doc = createCardDocument('# 标题\n\n第一段正文。');
    const result = await renderCardPages(doc, {
      theme: THEME, size: SIZE, contentHeight: 300,
      watermarkText: '内部资料',
      cover: { fields: { title: '封面', author: 'David', date: '', excerpt: '' } },
      document,
    });
    expect(result.ok).toBe(true);
    for (const page of result.pages) {
      expect(page.querySelector('.icard-watermark')?.textContent).toBe('内部资料');
    }
    // David 2026-09-13：封面作者与水印合并为一行，不再单独渲染水印覆盖层
    expect(result.coverPage?.querySelector('.icard-watermark')).toBeNull();
    expect(result.coverPage?.querySelector('.icard-cover-meta')?.textContent).toBe('David · 内部资料');
  });

  it('封面 CSS：六主题各出 coverStyle 变体、四式装饰与页脚水印防回退', () => {
    const cases = [
      ['simple-white', 'magazine'], ['gradient-blue', 'centered'], ['dark-gold', 'luxury'],
      ['neon-purple', 'neon'], ['forest-green', 'centered'], ['rose-gold', 'luxury'],
    ];
    for (const [id, style] of cases) {
      const css = buildCardPageCss(getCardTheme(id));
      expect(css).toContain(`.icard-cover--${style}`);
      expect(css).toContain('.icard-watermark');
    }
    // 四式装饰（red-note）：luxury 双细线框、neon 渐变条 + NOTES、centered 圆角短条
    const luxury = buildCardPageCss(getCardTheme('dark-gold'));
    expect(luxury).toContain('.icard-cover--luxury::before');
    expect(luxury).toContain('text-align: center');
    const neon = buildCardPageCss(getCardTheme('neon-purple'));
    expect(neon).toContain('linear-gradient');
    expect(neon).toContain('NOTES');
    const centered = buildCardPageCss(getCardTheme('gradient-blue'));
    expect(centered).toContain('border-radius: 999px');
    // 封面不再有独立水印层（水印并入 meta 行 / 正文页脚条）
    expect(centered).not.toContain('.icard-cover .icard-watermark');
  });

  it('比例预设与正文页尺寸一致（封面与正文同画布）', () => {
    const size = RATIO_PRESETS['3:4'];
    expect(size.width).toBe(375);
  });
});
