/*
## 核心功能

构建转换器设置面板中的「分节标题」控制组件。
支持快速切换「默认」、「序号」、「徽标」、「禅意」四种二级标题装饰风格，
点击后实时更新设置并触发当前文档的实时预览刷新（WYSIWYG）。

## 输入

接收 AppleStyleView 实例与宿主容器。

## 输出

输出 `buildHeadingStyleSection` 与 `onHeadingStyleChange`。

## 定位

位于 views/converter/，负责文章排版标题分节风格的高频侧边栏控制；
样式渲染由 services/heading-style-renderer.js 负责，全局配置由 services/plugin-settings.js 维护。

## 依赖

关键依赖：`../../services/heading-style-renderer.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 保持轻量解耦，单文件软线严格控制在 800 行以内。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: AppleStyleView 实例动态挂载与方法协作 */

import { HEADING_STYLES } from '../../services/heading-style-renderer.js';

/**
 * 标题风格选项配置
 */
export const HEADING_STYLE_OPTIONS = [
  { value: HEADING_STYLES.DEFAULT, label: '默认', title: '经典极简（默认主题样式）' },
  { value: HEADING_STYLES.SERIAL_NUMBER, label: '序号', title: '大数字序号（01、02 分节序号）' },
  { value: HEADING_STYLES.BADGE, label: '徽标', title: '胶囊徽标（Badge 胶囊圆角标签）' },
  { value: HEADING_STYLES.ZEN, label: '禅意', title: '留白禅意（Zen 优雅留白细线）' },
];

/**
 * 构建文章设置浮层中的「分节标题」视觉控制组
 * @param {any} view AppleStyleView 实例
 * @param {HTMLElement} parent 宿主容器（通常为 articleSettingsWrapper）
 * @returns {HTMLElement} 构建的 Section 元素
 */
export function buildHeadingStyleSection(view, parent) {
  return view.createSection(parent, '分节标题', (section) => {
    const grid = section.createEl('div', { cls: 'apple-btn-row apple-btn-heading-row' });
    view.settingsHeadingStyleGrid = grid;

    const currentStyle = view.plugin?.settings?.headingStyle || HEADING_STYLES.DEFAULT;

    HEADING_STYLE_OPTIONS.forEach((opt) => {
      const btn = grid.createEl('button', {
        cls: `apple-btn-size ${currentStyle === opt.value ? 'active' : ''}`,
        text: opt.label,
        attr: {
          'data-value': opt.value,
          'aria-label': opt.title,
          title: opt.title,
        },
      });
      btn.dataset.value = opt.value;

      btn.addEventListener('click', async () => {
        await onHeadingStyleChange(view, opt.value, grid);
      });
    });
  });
}

/**
 * 响应分节标题风格切换：持久化并立即触发强制预览重渲染
 * @param {any} view AppleStyleView 实例
 * @param {string} value 选中的标题风格标识
 * @param {HTMLElement} grid 按钮组容器
 */
export async function onHeadingStyleChange(view, value, grid) {
  if (view.plugin?.settings) {
    view.plugin.settings.headingStyle = value;
    try {
      await view.plugin.saveSettings();
    } catch (error) {
      console.warn('保存分节标题设置失败:', error);
    }
  }

  if (typeof view.updateButtonActive === 'function') {
    view.updateButtonActive(grid, value);
  }

  if (typeof view.convertCurrent === 'function') {
    await view.convertCurrent(true);
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: close the scoped disable block above */

