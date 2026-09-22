import { describe, it, expect } from 'vitest';
import { getCardTheme } from '../services/card-themes.js';
import { normalizeCoverFields } from '../services/card-cover-model.js';
import { assembleCardCoverPage } from '../services/card-render-assembly.js';

describe('Card Adaptive Cover Assembly across 6 themes', () => {
  const coverImage = 'data:image/jpeg;base64,testbase64';

  describe('Magazine themes (simple-white, rose-gold)', () => {
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
  });

  describe('Centered themes (gradient-blue, forest-green)', () => {
    it('renders framed picture card inside body for gradient-blue', () => {
      const theme = getCardTheme('gradient-blue');
      const fields = normalizeCoverFields({
        title: '渐变蓝居中画报',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.classList.contains('icard-cover--has-image')).toBe(false);
      const frame = page.querySelector('.icard-cover-frame');
      expect(frame).not.toBeNull();
      const frameImg = frame?.querySelector('.icard-cover-frame-img');
      expect(frameImg?.getAttribute('src')).toBe(coverImage);
    });

    it('renders framed picture card inside body for forest-green', () => {
      const theme = getCardTheme('forest-green');
      const fields = normalizeCoverFields({
        title: '森林绿自然画框',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.querySelector('.icard-cover-frame')).not.toBeNull();
    });
  });

  describe('Luxury theme (dark-gold)', () => {
    it('renders arch framed window for dark-gold', () => {
      const theme = getCardTheme('dark-gold');
      const fields = normalizeCoverFields({
        title: '黑金古典拱门',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.classList.contains('icard-cover--has-image')).toBe(false);
      const arch = page.querySelector('.icard-cover-arch');
      expect(arch).not.toBeNull();
      const archImg = arch?.querySelector('.icard-cover-arch-img');
      expect(archImg?.getAttribute('src')).toBe(coverImage);
    });

    it('renders arch framed window for rose-gold', () => {
      const theme = getCardTheme('rose-gold');
      const fields = normalizeCoverFields({
        title: '玫瑰金轻奢拱门',
        author: '测试作者',
        coverImage,
        coverMode: 'adaptive',
      });
      const page = assembleCardCoverPage({ theme, fields });

      expect(page.classList.contains('icard-cover--adaptive')).toBe(true);
      expect(page.querySelector('.icard-cover-arch')).not.toBeNull();
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
});
