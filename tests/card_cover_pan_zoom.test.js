/*
## 核心功能

小红书卡片封面配图交互控制器与 11 款专属封面样式单测：
- attachCoverImagePanZoom 挂载与销毁
- 鼠标拖拽平移（Pan）与边界钳制（0~100%）
- 滚轮缩放（Zoom）与比例钳制（1.0~3.0x）及防抖提交
- 11 款情绪调色盘专属自适应封面样式生成
- 封面字段缩放与位置参数的归一化与引用保护
*/

import { describe, it, expect, vi } from 'vitest';
import { attachCoverImagePanZoom } from '../services/card-cover-pan-zoom.js';
import { getMoodPaletteCoverCss, MOOD_PALETTE_THEME_IDS } from '../services/card-mood-palettes.js';
import { getCardTheme, buildCardPageCss } from '../services/card-themes.js';
import { normalizeCoverFields, EMPTY_COVER_FIELDS } from '../services/card-cover-model.js';

describe('card-cover-pan-zoom 控制器', () => {
  it('入参无效或未包含配图目标时安全返回 null', () => {
    expect(attachCoverImagePanZoom(null, vi.fn())).toBeNull();
    expect(attachCoverImagePanZoom(undefined, vi.fn())).toBeNull();

    const emptyDiv = document.createElement('div');
    expect(attachCoverImagePanZoom(emptyDiv, vi.fn())).toBeNull();
  });

  it('成功找到配图目标并初始化交互容器', () => {
    const coverPage = document.createElement('div');
    coverPage.className = 'icard-cover';
    const heroWrap = document.createElement('div');
    heroWrap.className = 'icard-cover-hero';
    const heroImg = document.createElement('img');
    heroImg.className = 'icard-cover-hero-img';
    heroImg.dataset.scale = '1.5';
    heroImg.dataset.posX = '40';
    heroImg.dataset.posY = '60';
    heroWrap.appendChild(heroImg);
    coverPage.appendChild(heroWrap);

    const onCommit = vi.fn();
    const cleanup = attachCoverImagePanZoom(coverPage, onCommit);

    expect(typeof cleanup).toBe('function');
    expect(heroWrap.classList.contains('icard-cover-interactive-image-wrap')).toBe(true);

    cleanup();
    expect(heroWrap.classList.contains('is-dragging')).toBe(false);
  });

  it('鼠标拖拽（Pan）更新视觉并在释放时提交变更', () => {
    const coverPage = document.createElement('div');
    const heroWrap = document.createElement('div');
    const heroImg = document.createElement('img');
    heroImg.className = 'icard-cover-hero-img';
    heroWrap.appendChild(heroImg);
    coverPage.appendChild(heroWrap);

    // 模拟容器尺寸
    heroWrap.getBoundingClientRect = () => ({
      width: 200,
      height: 200,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const onCommit = vi.fn();
    const cleanup = attachCoverImagePanZoom(coverPage, onCommit);

    // 模拟 mousedown
    const mouseDownEv = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    heroWrap.dispatchEvent(mouseDownEv);
    expect(heroWrap.classList.contains('is-dragging')).toBe(true);

    // 模拟 mousemove：向右下拖动 40px
    const mouseMoveEv = new MouseEvent('mousemove', {
      clientX: 140,
      clientY: 140,
    });
    window.dispatchEvent(mouseMoveEv);

    // 拖动后视觉更新
    expect(heroImg.style.objectPosition).toBeTruthy();

    // 模拟 mouseup
    const mouseUpEv = new MouseEvent('mouseup', {});
    window.dispatchEvent(mouseUpEv);
    expect(heroWrap.classList.contains('is-dragging')).toBe(false);

    expect(onCommit).toHaveBeenCalledTimes(1);
    const change = onCommit.mock.calls[0][0];
    expect(change.coverImagePosition).toBeDefined();
    expect(change.coverImagePosition.x).toBeLessThan(50); // 向右拖，露出左侧，pos 百分比降低
    expect(change.coverImagePosition.y).toBeLessThan(50);

    cleanup();
  });

  it('滚轮缩放（Zoom）更新缩放比例并在防抖后提交', async () => {
    vi.useFakeTimers();

    const coverPage = document.createElement('div');
    const heroWrap = document.createElement('div');
    const heroImg = document.createElement('img');
    heroImg.className = 'icard-cover-hero-img';
    heroWrap.appendChild(heroImg);
    coverPage.appendChild(heroWrap);

    const onCommit = vi.fn();
    const cleanup = attachCoverImagePanZoom(coverPage, onCommit);

    // 模拟向上滚动（放大）
    const wheelUpEv = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    });
    heroWrap.dispatchEvent(wheelUpEv);

    expect(heroImg.style.transform).toContain('scale(');
    expect(onCommit).not.toHaveBeenCalled();

    // 快进防抖 250ms
    vi.advanceTimersByTime(250);

    expect(onCommit).toHaveBeenCalledTimes(1);
    const change = onCommit.mock.calls[0][0];
    expect(change.coverImageScale).toBeGreaterThan(1.0);
    expect(change.coverImageScale).toBeLessThanOrEqual(3.0);

    cleanup();
    vi.useRealTimers();
  });
});

describe('11 套情绪调色盘专属个性化封面 CSS', () => {
  it('11 款主题均具备独特的个性化自适应封面构图', () => {
    for (const themeId of MOOD_PALETTE_THEME_IDS) {
      const theme = getCardTheme(themeId);
      const customCss = getMoodPaletteCoverCss(themeId, theme.tokens);
      expect(customCss.length).toBeGreaterThan(0);
      expect(customCss).toContain(`.icard-cover--${themeId}`);
    }
  });

  it('各类专属个性化样式特征准确', () => {
    const warmTheme = getCardTheme('warm');
    const warmCss = getMoodPaletteCoverCss('warm', warmTheme.tokens);
    expect(warmCss).toContain('.icard-cover-hero');
    expect(warmCss).toContain('border-radius: 0 0 16px 16px');

    const oceanTheme = getCardTheme('ocean');
    const oceanCss = getMoodPaletteCoverCss('ocean', oceanTheme.tokens);
    expect(oceanCss).toContain('mask-image');
    expect(oceanCss).toContain('linear-gradient');

    const yuelingTheme = getCardTheme('yueling');
    const yuelingCss = getMoodPaletteCoverCss('yueling', yuelingTheme.tokens);
    expect(yuelingCss).toContain('border-radius: 120px 120px 8px 8px');

    const sakuraTheme = getCardTheme('sakura');
    const sakuraCss = getMoodPaletteCoverCss('sakura', sakuraTheme.tokens);
    expect(sakuraCss).toContain('rgba(255, 105, 180');
  });

  it('buildCardPageCss 完整融合专属个性化封面样式', () => {
    const warmCss = buildCardPageCss(getCardTheme('warm'));
    expect(warmCss).toContain('.icard-cover--warm.icard-cover--adaptive');

    const oceanCss = buildCardPageCss(getCardTheme('ocean'));
    expect(oceanCss).toContain('.icard-cover--ocean.icard-cover--adaptive');
  });
});

describe('封面字段模型参数归一化与引用保护', () => {
  it('scale 钳制在 1.0 ~ 3.0 范围', () => {
    const result1 = normalizeCoverFields({ coverImageScale: 0.5 });
    expect(result1.coverImageScale).toBe(1.0);

    const result2 = normalizeCoverFields({ coverImageScale: 5.0 });
    expect(result2.coverImageScale).toBe(3.0);

    const result3 = normalizeCoverFields({ coverImageScale: 1.75 });
    expect(result3.coverImageScale).toBe(1.75);
  });

  it('position 钳制在 0 ~ 100 范围', () => {
    const result1 = normalizeCoverFields({ coverImagePosition: { x: -10, y: 150 } });
    expect(result1.coverImagePosition).toEqual({ x: 0, y: 100 });

    const result2 = normalizeCoverFields({ coverImagePosition: { x: 33.3, y: 66.7 } });
    expect(result2.coverImagePosition).toEqual({ x: 33, y: 67 });
  });

  it('未修改 position 时保持对象引用不变（避免 card-session 误判变更）', () => {
    const base = {
      ...EMPTY_COVER_FIELDS,
      coverImagePosition: { x: 50, y: 50 },
    };
    const updated = normalizeCoverFields({ title: '新标题' }, base);
    expect(updated.title).toBe('新标题');
    expect(updated.coverImagePosition).toBe(base.coverImagePosition);
  });
});
