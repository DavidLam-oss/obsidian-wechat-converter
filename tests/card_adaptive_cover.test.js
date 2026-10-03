import { describe, it, expect } from 'vitest';
import { getCardTheme, buildCardPageCss } from '../services/card-themes.js';
import { normalizeCoverFields } from '../services/card-cover-model.js';
import { assembleCardCoverPage } from '../services/card-render-assembly.js';

/** 把主题 CSS 拆成规则列表，便于按选择器精确断言声明块（避免在整份 CSS 里做子串匹配导致假阳性） */
function cssRules(css) {
  const clean = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    out.push({
      selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean),
      body: m[2].replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

/**
 * 取某条选择器命中的**全部**声明块并拼接；找不到返回空串。
 * 必须合并而不是取第一条：同一选择器可能既出现在共享规则里（如
 * `.icard-cover--luxury::before, .icard-cover--luxury::after { content… }`）又出现在专属规则里。
 */
function ruleOf(css, selector) {
  const bodies = cssRules(css)
    .filter((r) => r.selectors.includes(selector))
    .map((r) => r.body);
  return bodies.join(' ; ');
}

/** 取某条规则的 margin 分量（1/2/3/4 值简写都归一成「最后一个 = 底边」） */
function marginTokens(rule) {
  const m = /margin:\s*([^;]+);/.exec(rule);
  return m ? m[1].trim().split(/\s+/) : null;
}

/** 五套主题里「承载照片的容器」（neon 走整页底图，不在此列） */
const IMAGE_CONTAINERS = {
  'simple-white': '.icard-cover--adaptive.icard-cover--magazine .icard-cover-hero',
  'gradient-blue': '.icard-cover--gradient-blue.icard-cover--adaptive .icard-cover-frame',
  'forest-green': '.icard-cover--forest-green.icard-cover--adaptive .icard-cover-frame',
  'dark-gold': '.icard-cover--dark-gold.icard-cover--adaptive .icard-cover-arch',
  'rose-gold': '.icard-cover--rose-gold.icard-cover--adaptive .icard-cover-arch',
};

describe('Card Adaptive Cover Assembly across 6 themes', () => {
  const coverImage = 'data:image/jpeg;base64,testbase64';

  describe('Magazine theme (simple-white)', () => {
    it('renders hero image container before body for simple-white', () => {
      const theme = getCardTheme('simple-white');
      const fields = normalizeCoverFields({
        title: '极简白杂志封面',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.classList.contains('icard-cover--has-image')).toBe(false);
      const hero = page.querySelector('.icard-cover-hero');
      expect(hero).not.toBeNull();
      const heroImg = hero?.querySelector('.icard-cover-hero-img');
      expect(heroImg?.getAttribute('src')).toBe(coverImage);
      // Body is present below hero
      const body = page.querySelector('.icard-cover-body');
      expect(body).not.toBeNull();
      expect(body?.querySelector('.icard-cover-title')?.textContent).toBe('极简白杂志封面');
    });

    it('bleeds the hero to the top and both sides, with the bottom dissolving into the page', () => {
      const css = buildCardPageCss(getCardTheme('simple-white'));
      const hero = ruleOf(css, '.icard-cover--adaptive.icard-cover--magazine .icard-cover-hero');
      // 贴边派：顶 + 左右出血（内边距 18px 20px → 横向 +40px、顶部 -18px 负边距）
      expect(hero).toContain('width: calc(100% + 40px)');
      expect(hero).toContain('margin: -18px -20px 0');
      // 方角 + 零投影 + 解除原始高度上限
      expect(hero).toContain('border-radius: 0');
      expect(hero).toContain('box-shadow: none');
      expect(hero).toContain('max-height: none');
      // ③ 图让位于文字：可收缩 + 下限
      expect(hero).toContain('flex: 0 1 auto');
      expect(hero).toContain('min-height: 204px');
      // ① 接缝化开：照片下缘 mask 化进页面底色
      expect(ruleOf(css, '.icard-cover--adaptive.icard-cover--magazine .icard-cover-hero-img'))
        .toContain('mask-image: linear-gradient(to bottom');
      // 文字块不参与收缩，缺口全由图吸收
      expect(ruleOf(css, '.icard-cover--adaptive.icard-cover--magazine .icard-cover-body'))
        .toContain('flex-shrink: 0');
    });
  });

  describe('Centered themes (gradient-blue, forest-green)', () => {
    it('renders framed picture card inside body for gradient-blue with modern gallery styling', () => {
      const theme = getCardTheme('gradient-blue');
      const fields = normalizeCoverFields({
        title: '渐变蓝居中画报',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.classList.contains('icard-cover--gradient-blue')).toBe(true);
      expect(page.getAttribute('data-icard-theme')).toBe('gradient-blue');
      expect(page.classList.contains('icard-cover--has-image')).toBe(false);
      const frame = page.querySelector('.icard-cover-frame');
      expect(frame).not.toBeNull();
      const frameImg = frame?.querySelector('.icard-cover-frame-img');
      expect(frameImg?.getAttribute('src')).toBe(coverImage);

      const css = buildCardPageCss(theme);
      const frameRule = ruleOf(css, '.icard-cover--gradient-blue.icard-cover--adaptive .icard-cover-frame');
      // 贴边派 · 画报中带：图回到「标题之下 · 摘要之上」（order 3，排掉旧的沉底 order 9）
      expect(frameRule).toContain('order: 3');
      expect(frameRule).toContain('width: calc(100% + 40px)');
      expect(frameRule).toContain('margin: 12px -20px 8px');
      expect(frameRule).toContain('border-radius: 0');
      expect(frameRule).toContain('box-shadow: none');
      expect(frameRule).toContain('flex: 0 1 auto');
      expect(ruleOf(css, '.icard-cover--gradient-blue.icard-cover--adaptive .icard-cover-meta')).toContain('order: 8');
      expect(ruleOf(css, '.icard-cover--gradient-blue.icard-cover--adaptive .icard-cover-title')).toContain('order: 2');
      // 上下两端都化开：图是浮出版面的一条带
      const maskRule = ruleOf(css, '.icard-cover--gradient-blue.icard-cover--adaptive .icard-cover-frame-img');
      expect(maskRule).toContain('mask-image: linear-gradient(to bottom');
      expect(maskRule).toContain('rgba(0, 0, 0, 0) 0%');
    });

    it('renders framed picture card inside body for forest-green with botanical panorama styling', () => {
      const theme = getCardTheme('forest-green');
      const fields = normalizeCoverFields({
        title: '森林绿自然画框',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.classList.contains('icard-cover--forest-green')).toBe(true);
      expect(page.getAttribute('data-icard-theme')).toBe('forest-green');
      expect(page.querySelector('.icard-cover-frame')).not.toBeNull();

      const css = buildCardPageCss(theme);
      const frameRule = ruleOf(css, '.icard-cover--forest-green.icard-cover--adaptive .icard-cover-frame');
      // 贴边派变体：顶 + 左右出血 + 方角零投影，并用 order: -1 把图提到 kicker 之前
      expect(frameRule).toContain('order: -1');
      expect(frameRule).toContain('width: calc(100% + 40px)');
      expect(frameRule).toContain('margin: -18px -20px 0');
      expect(frameRule).toContain('border-radius: 0');
      expect(frameRule).toContain('box-shadow: none');
      expect(frameRule).toContain('flex: 0 1 auto');
      // 底部 mask 渐隐溶入墨绿底（导出实测已确认 modern-screenshot 能保留 mask）
      expect(ruleOf(css, '.icard-cover--forest-green.icard-cover--adaptive .icard-cover-frame-img'))
        .toContain('mask-image: linear-gradient(to bottom');
    });
  });

  describe('Luxury theme (dark-gold, rose-gold)', () => {
    it('renders arch framed window for dark-gold with imperial arch styling', () => {
      const theme = getCardTheme('dark-gold');
      const fields = normalizeCoverFields({
        title: '黑金古典拱门',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.classList.contains('icard-cover--dark-gold')).toBe(true);
      expect(page.getAttribute('data-icard-theme')).toBe('dark-gold');
      expect(page.classList.contains('icard-cover--has-image')).toBe(false);
      const arch = page.querySelector('.icard-cover-arch');
      expect(arch).not.toBeNull();
      const archImg = arch?.querySelector('.icard-cover-arch-img');
      expect(archImg?.getAttribute('src')).toBe(coverImage);

      const css = buildCardPageCss(theme);
      const archRule = ruleOf(css, '.icard-cover--dark-gold.icard-cover--adaptive .icard-cover-arch');
      // 画框派：方角画心 + 零投影，页面双细线框（::before/::after）才是主角
      expect(archRule).toContain('border-radius: 0');
      expect(archRule).toContain('box-shadow: none');
      expect(archRule).toContain('flex: 0 1 auto');
      // 照片齐平内圈细线：宽度 = 100% + 12px（20px 内边距 - 6px 负边距 = 内圈 inset 14px）
      expect(archRule).toContain('width: calc(100% + 12px)');
      expect(archRule).toContain('margin: 8px -6px 16px');
      expect(ruleOf(css, '.icard-cover--luxury::before')).toContain('inset: 10px');
      expect(ruleOf(css, '.icard-cover--luxury::after')).toContain('inset: 14px');
      // 照片下缘一层极淡主题色，让照片「坐进」卡面而不是被贴上去
      expect(ruleOf(css, '.icard-cover--dark-gold.icard-cover--adaptive .icard-cover-arch::after'))
        .toContain('linear-gradient(180deg, transparent 78%, rgba(24, 24, 27, 0.28) 100%)');
    });

    it('renders arch framed window for rose-gold with french cameo arch styling', () => {
      const theme = getCardTheme('rose-gold');
      const fields = normalizeCoverFields({
        title: '玫瑰金轻奢拱门',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.classList.contains('icard-cover--rose-gold')).toBe(true);
      expect(page.getAttribute('data-icard-theme')).toBe('rose-gold');
      expect(page.querySelector('.icard-cover-arch')).not.toBeNull();

      const css = buildCardPageCss(theme);
      const archRule = ruleOf(css, '.icard-cover--rose-gold.icard-cover--adaptive .icard-cover-arch');
      // 画框派：同黑金，方角画心 + 齐平内圈细线
      expect(archRule).toContain('border-radius: 0');
      expect(archRule).toContain('box-shadow: none');
      expect(archRule).toContain('width: calc(100% + 12px)');
      expect(archRule).toContain('margin: 8px -6px 16px');
      expect(ruleOf(css, '.icard-cover--luxury::before')).toContain('inset: 10px');
      expect(ruleOf(css, '.icard-cover--rose-gold.icard-cover--adaptive .icard-cover-arch::after'))
        .toContain('linear-gradient(180deg, transparent 78%, rgba(131, 24, 67, 0.14) 100%)');
    });
  });

  describe('Neon theme (neon-purple)', () => {
    it('renders full background and cyber overlay for neon-purple', () => {
      const theme = getCardTheme('neon-purple');
      const fields = normalizeCoverFields({
        title: '霓虹紫赛博底图',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.classList.contains('icard-cover--has-image')).toBe(true);
      expect(page.querySelector('.icard-cover-bg')).not.toBeNull();
      expect(page.querySelector('.icard-cover-cyber-overlay')).not.toBeNull();
    });

    it('遮罩层把网格与深色渐变写在同一个 background-image 列表里（拆开会让深色遮罩整个失效）', () => {
      const css = buildCardPageCss(getCardTheme('neon-purple'));
      const overlay = ruleOf(css, '.icard-cover-cyber-overlay');
      expect(overlay).toContain('background: none');
      expect(overlay).toContain('linear-gradient(#ffffff0a 1px, transparent 1px)');
      expect(overlay).toContain('linear-gradient(90deg, #ffffff0a 1px, transparent 1px)');
      expect(overlay).toContain('rgba(2, 6, 23, 0.42) 0%');
      expect(overlay).toContain('rgba(2, 6, 23, 0.94) 100%');
      // 三层背景必须共用一条 background-size（否则深色渐变会退回 auto 尺寸）
      expect(overlay).toContain('background-size: 32px 32px, 32px 32px, 100% 100%');
    });
  });

  describe('Pure text mode (coverMode: none)', () => {
    it('does not render any hero/frame/arch/bg/placeholder in pure text mode', () => {
      const theme = getCardTheme('simple-white');
      const fields = normalizeCoverFields({
        title: '纯文字排版封面',
        author: '测试作者',
        coverMode: 'none',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(false);
      expect(page.querySelector('.icard-cover-hero')).toBeNull();
      expect(page.querySelector('.icard-cover-frame')).toBeNull();
      expect(page.querySelector('.icard-cover-arch')).toBeNull();
      expect(page.querySelector('.icard-cover-placeholder')).toBeNull();
      expect(page.querySelector('.icard-cover-title')?.textContent).toBe('纯文字排版封面');
    });
  });

  describe('Adaptive placeholder when coverImage is empty', () => {
    it('renders hero with placeholder for magazine theme when coverImage is empty', () => {
      const theme = getCardTheme('simple-white');
      const fields = normalizeCoverFields({
        title: '自适应未选图',
        author: '测试作者',
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      const hero = page.querySelector('.icard-cover-hero');
      expect(hero).not.toBeNull();
      const placeholder = hero?.querySelector('.icard-cover-placeholder');
      expect(placeholder).not.toBeNull();
      // 对标 WeChat Tool：纯实底 + 单枚 Lucide ImageIcon，无冗余文字
      expect(placeholder?.querySelector('.icard-cover-placeholder-icon')).not.toBeNull();
      expect(placeholder?.querySelector('.icard-cover-placeholder-text')).toBeNull();
      expect(page.querySelector('.icard-cover-title')?.textContent).toBe('自适应未选图');
    });

    it('renders frame with placeholder for centered theme when coverImage is empty', () => {
      const theme = getCardTheme('gradient-blue');
      const fields = normalizeCoverFields({
        title: '渐变蓝未选图',
        author: '测试作者',
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      const frame = page.querySelector('.icard-cover-frame');
      expect(frame).not.toBeNull();
      expect(frame?.querySelector('.icard-cover-placeholder')).not.toBeNull();
      expect(frame?.querySelector('.icard-cover-placeholder-icon')).not.toBeNull();
    });

    it('renders arch with placeholder for luxury theme when coverImage is empty', () => {
      const theme = getCardTheme('dark-gold');
      const fields = normalizeCoverFields({
        title: '黑金未选图',
        author: '测试作者',
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      const arch = page.querySelector('.icard-cover-arch');
      expect(arch).not.toBeNull();
      expect(arch?.querySelector('.icard-cover-placeholder')).not.toBeNull();
      expect(arch?.querySelector('.icard-cover-placeholder-icon')).not.toBeNull();
    });

    it('safely falls back to placeholder when local coverImage cannot be resolved (no broken img)', () => {
      const theme = getCardTheme('simple-white');
      const fields = normalizeCoverFields({
        title: '不存在的本地路径',
        author: '测试作者',
        coverImage: 'Wechat/published/img/non-existent.jpg',
        coverMode: 'adaptive',
      });
      // 未传 resolveImageSrc 或解析返回 null 时
      const page = assembleCardCoverPage({
        theme,
        fields,
        resolveImageSrc: () => null,
      });

      const hero = page.querySelector('.icard-cover-hero');
      expect(hero).not.toBeNull();
      // 绝无破损的 <img> 节点
      expect(hero?.querySelector('img')).toBeNull();
      // 安全回退到 WeChat Tool 纯净占位框
      expect(hero?.querySelector('.icard-cover-placeholder')).not.toBeNull();
    });

    it('renders valid image when resolveImageSrc successfully resolves local path', () => {
      const theme = getCardTheme('simple-white');
      const fields = normalizeCoverFields({
        title: '本地有效图片',
        author: '测试作者',
        coverImage: 'Wechat/published/img/cover-combined.jpg',
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({
        theme,
        fields,
        resolveImageSrc: (ref) => ref.endsWith('.jpg') ? 'app://local/resolved-cover.jpg' : null,
      });

      const hero = page.querySelector('.icard-cover-hero');
      expect(hero).not.toBeNull();
      const img = hero?.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('app://local/resolved-cover.jpg');
    });
  });

  describe('封面配图与版面融合总纲（2026-10-03 v2）', () => {
    it('五套主题的配图容器一律方角、零投影，不再把照片裱成一个独立物件', () => {
      for (const [id, selector] of Object.entries(IMAGE_CONTAINERS)) {
        const rule = ruleOf(buildCardPageCss(getCardTheme(id)), selector);
        expect(rule, `${id} 的配图容器规则应存在`).not.toBe('');
        expect(rule, `${id} 的配图应方角`).toContain('border-radius: 0');
        expect(rule, `${id} 的配图应去掉投影`).toContain('box-shadow: none');
      }
    });

    it('基础通用规则也不残留圆角与投影（避免与总纲自相矛盾）', () => {
      const css = buildCardPageCss(getCardTheme('forest-green'));
      for (const selector of [
        '.icard-cover--adaptive.icard-cover--centered .icard-cover-frame',
        '.icard-cover--adaptive.icard-cover--luxury .icard-cover-arch',
      ]) {
        const rule = ruleOf(css, selector);
        expect(rule, `${selector} 应存在`).not.toBe('');
        expect(rule, `${selector} 不应残留圆角`).toContain('border-radius: 0');
        expect(rule, `${selector} 不应残留投影`).toContain('box-shadow: none');
      }
    });

    it('贴边派三套主题都横向出血（+40px / 左右 -20px）', () => {
      for (const id of ['simple-white', 'gradient-blue', 'forest-green']) {
        const rule = ruleOf(buildCardPageCss(getCardTheme(id)), IMAGE_CONTAINERS[id]);
        expect(rule, `${id} 应横向出血`).toContain('width: calc(100% + 40px)');
        expect(rule, `${id} 应用负边距抵消内边距`).toContain('-20px');
      }
    });

    it('画框派两套主题保留页面双细线框，照片齐平内圈（不是横穿照片的出血）', () => {
      for (const id of ['dark-gold', 'rose-gold']) {
        const css = buildCardPageCss(getCardTheme(id));
        expect(ruleOf(css, '.icard-cover--luxury::before'), `${id} 外圈细线`).toContain('border: 1px solid');
        expect(ruleOf(css, '.icard-cover--luxury::after'), `${id} 内圈细线`).toContain('border: 1px solid');
        // 图容器宽度 = 100% + 12px（正好落到内圈 inset 14px 上），不是 x 轴的 40px 出血
        const rule = ruleOf(css, IMAGE_CONTAINERS[id]);
        expect(rule).toContain('width: calc(100% + 12px)');
        expect(rule).not.toContain('calc(100% + 40px)');
      }
    });

    it('neon-purple 维持整页铺图，不走贴边改造', () => {
      const page = assembleCardCoverPage({
        theme: getCardTheme('neon-purple'),
        fields: normalizeCoverFields({ title: '霓虹赛博', coverImage, coverMode: 'adaptive' }),
      });
      expect(page.querySelector('.icard-cover-bg')).not.toBeNull();
      expect(page.querySelector('.icard-cover-hero')).toBeNull();
      expect(page.querySelector('.icard-cover-frame')).toBeNull();
      expect(page.querySelector('.icard-cover-arch')).toBeNull();
    });

    it('封面页高度钉死：不随文案变长而悄悄长高（否则导出比例静默失真）', () => {
      for (const id of ['simple-white', 'gradient-blue', 'forest-green', 'dark-gold', 'rose-gold', 'neon-purple']) {
        const rule = ruleOf(buildCardPageCss(getCardTheme(id)), '.icard-cover--adaptive');
        expect(rule, `${id} 的 adaptive 封面应钉死高度`).toContain('height: var(--icard-page-height');
        expect(rule, `${id} 的 adaptive 封面不应保留可增长的 min-height`).toContain('min-height: 0');
      }
    });

    it('图容器一律可收缩 + 有下限：文案变长时图先让位，而不是把文字挤爆', () => {
      for (const [id, selector] of Object.entries(IMAGE_CONTAINERS)) {
        const rule = ruleOf(buildCardPageCss(getCardTheme(id)), selector);
        expect(rule, `${id} 的图容器应可收缩`).toContain('flex: 0 1 auto');
        expect(rule, `${id} 的图容器应有高度下限`).toMatch(/min-height: \d+px/);
      }
    });

    it('配图容器不得用「往底部撑」的负边距（会被封面溢出核验误判成内容超出画布）', () => {
      for (const [id, selector] of Object.entries(IMAGE_CONTAINERS)) {
        const tokens = marginTokens(ruleOf(buildCardPageCss(getCardTheme(id)), selector));
        expect(tokens, `${id} 应显式给出 margin`).not.toBeNull();
        const bottom = tokens[tokens.length - 1];
        expect(bottom.startsWith('-'), `${id} 的底边距不得为负（底部出血请改用页面 padding-bottom: 0）`).toBe(false);
      }
    });

    it('图与文字相接的那条边一律用 mask 化开（接缝不留硬边）', () => {
      const masks = {
        'simple-white': '.icard-cover--adaptive.icard-cover--magazine .icard-cover-hero-img',
        'gradient-blue': '.icard-cover--gradient-blue.icard-cover--adaptive .icard-cover-frame-img',
        'forest-green': '.icard-cover--forest-green.icard-cover--adaptive .icard-cover-frame-img',
      };
      for (const [id, selector] of Object.entries(masks)) {
        const rule = ruleOf(buildCardPageCss(getCardTheme(id)), selector);
        expect(rule, `${id} 的接缝应化开`).toContain('-webkit-mask-image: linear-gradient(to bottom');
        expect(rule, `${id} 的接缝应化开`).toContain('mask-image: linear-gradient(to bottom');
      }
    });
  });
});
