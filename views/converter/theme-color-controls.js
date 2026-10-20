/*
## 核心功能

构建转换器设置面板中的「主题色」控制组件。
支持在标准主题下快速选择预设品牌色与自定义 Hex 颜色，
而在激活自定义主题时自动切换为专属色系锁定状态，明确指示色彩由自定义主题自身驱动。

## 输入

- view: AppleStyleView 实例
- targetArea: 设置浮层宿主容器（通常为 articleSettingsWrapper）

## 输出

- buildThemeColorSection: 构建主题色视觉控制区并挂载动态刷新句柄
- refreshThemeColorSection: 响应主题切换，在标准色彩矩阵与专属色锁定状态间平滑切换

## 定位

- 位于 views/converter/，负责侧边栏文章样式面板的主题色交互与状态锁定。

## 依赖

- `../apple-style-view-shared.js`
- `../../services/custom-theme-adapter.js`

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 遵循 Obsidian 审查规范，使用 setCssStyles 替代直接样式赋值，避免直接依赖 innerHTML。
- 单文件软线严格控制在 800 行以内。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: AppleStyleView 实例动态挂载与方法协作 */

import {
  getAppleThemeApi,
  getEventTargetValue,
} from '../apple-style-view-shared.js';
import { findCustomTheme } from '../../services/custom-theme-adapter.js';

/**
 * @param {any} themeApi
 * @param {'getThemeList' | 'getColorList'} method
 * @returns {Array<Record<string, unknown>>}
 */
export function readThemeOptions(themeApi, method) {
  if (!themeApi || typeof themeApi[method] !== 'function') return [];
  try {
    const options = themeApi[method]();
    return Array.isArray(options) ? options : [];
  } catch (error) {
    console.warn(`读取${method === 'getThemeList' ? '主题' : '主题色'}列表失败:`, error);
    return [];
  }
}

/**
 * 更新主题色控制区域的显示状态（标准网格 vs 自定义专属色锁定）
 * @param {any} view AppleStyleView 实例
 * @param {HTMLElement} gridContainer 标准颜色选择按钮组
 * @param {HTMLElement} lockedContainer 自定义主题专属色锁定卡片
 * @param {HTMLElement} dotEl 专属色圆点元素
 * @param {HTMLElement} titleEl 专属色说明标题元素
 */
export function updateThemeColorDisplay(view, gridContainer, lockedContainer, dotEl, titleEl) {
  const customThemes = view?.plugin?.settings?.customThemes;
  const currentTheme = view?.plugin?.settings?.theme;
  const customToken = findCustomTheme(customThemes, currentTheme);

  if (customToken) {
    gridContainer.setCssStyles({ display: 'none' });
    lockedContainer.setCssStyles({ display: 'flex' });
    const accent = customToken.colors?.accent || '#0071e3';
    dotEl.setCssStyles({ backgroundColor: accent });
    titleEl.setText(`已应用主题专属色（${accent}）`);
  } else {
    gridContainer.setCssStyles({ display: 'flex' });
    lockedContainer.setCssStyles({ display: 'none' });
    const currentThemeColor = view?.plugin?.settings?.themeColor;
    if (typeof view.updateButtonActive === 'function') {
      view.updateButtonActive(gridContainer, currentThemeColor);
    }
  }
}

/**
 * 构建文章设置中的「主题色」控制组
 * @param {any} view AppleStyleView 实例
 * @param {HTMLElement} targetArea 宿主容器
 * @returns {HTMLElement} 构建的 Section 元素
 */
export function buildThemeColorSection(view, targetArea) {
  return view.createSection(targetArea, '主题色', (section) => {
    // 1. 自定义主题专属色锁定提示容器
    const lockedContainer = section.createEl('div', {
      cls: 'apple-custom-theme-color-locked',
    });
    const badgeRow = lockedContainer.createEl('div', {
      cls: 'apple-custom-theme-color-badge',
    });
    const dotEl = badgeRow.createEl('span', {
      cls: 'apple-custom-theme-color-dot',
    });
    const titleEl = badgeRow.createEl('span', {
      cls: 'apple-custom-theme-color-title',
      text: '已应用主题专属配色',
    });
    lockedContainer.createEl('div', {
      cls: 'apple-custom-theme-color-hint',
      text: '当前自定义主题拥有完整独立色系，已自动适配文章各层级排版颜色',
    });

    // 2. 标准预设色彩网格容器
    const grid = section.createEl('div', { cls: 'apple-color-grid' });
    const themeApi = getAppleThemeApi(view.theme?.constructor);
    const colors = readThemeOptions(themeApi, 'getColorList');

    // 预设颜色按钮
    colors.forEach((c) => {
      const btn = grid.createEl('button', {
        cls: `apple-btn-color ${view.plugin.settings.themeColor === c.value ? 'active' : ''}`,
      });
      btn.dataset.value = String(c.value);
      btn.style.setProperty('--btn-color', String(c.color));
      btn.addEventListener('click', () => view.onColorChange(c.value, grid));
    });

    // 自定义颜色按钮
    const customBtn = grid.createEl('button', {
      cls: `apple-btn-custom-text ${view.plugin.settings.themeColor === 'custom' ? 'active' : ''}`,
      text: '自定义',
      attr: { 'aria-label': '自定义颜色' },
    });
    customBtn.dataset.value = 'custom';

    // 隐藏的原生颜色选择器
    const colorInput = /** @type {HTMLInputElement} */ (grid.createEl('input', {
      type: 'color',
      cls: 'apple-color-picker-hidden',
    }));
    colorInput.value = view.plugin.settings.customColor || '#000000';
    colorInput.setCssStyles({
      visibility: 'hidden',
      width: '0',
      height: '0',
      position: 'absolute',
    });

    customBtn.addEventListener('click', () => {
      colorInput.click();
    });

    colorInput.addEventListener('input', (e) => {
      customBtn.style.setProperty('--btn-color', getEventTargetValue(e, view.plugin.settings.customColor));
    });

    colorInput.addEventListener('change', async (e) => {
      const newColor = getEventTargetValue(e, view.plugin.settings.customColor);
      customBtn.style.setProperty('--btn-color', newColor);
      view.plugin.settings.customColor = newColor;
      view.theme.update({ customColor: newColor });
      await view.onColorChange('custom', grid);
    });

    // 挂载动态刷新方法，供切主题时调用
    view._refreshThemeColorSection = () => {
      updateThemeColorDisplay(view, grid, lockedContainer, dotEl, titleEl);
    };
    view.refreshThemeColorSection = view._refreshThemeColorSection;

    // 首次渲染状态
    updateThemeColorDisplay(view, grid, lockedContainer, dotEl, titleEl);
  });
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: close the scoped disable block above */
