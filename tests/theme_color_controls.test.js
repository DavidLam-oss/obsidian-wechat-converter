/*
## 核心功能

转换器设置面板「主题色」控制组件（theme-color-controls.js）测试。
验证在标准主题下的预设色彩网格展现、切换至自定义主题时的专属色系锁定状态与专属色值提取。

## 输入

- 模拟的 AppleStyleView 实例与宿主容器 DOM 节点。

## 输出

- Vitest 自动化单元测试结果。

## 定位

- 位于 tests/，测试层。
*/

import { describe, it, expect, vi } from 'vitest';
import { buildThemeColorSection } from '../views/converter/theme-color-controls.js';
import { createObsidianLikeElement } from './helpers/obsidian-dom.js';

describe('theme-color-controls', () => {
  function createMockView(initialSettings = {}) {
    const parent = createObsidianLikeElement('div');
    const settings = {
      theme: 'github',
      themeColor: 'blue',
      customColor: '#123456',
      customThemes: [],
      ...initialSettings,
    };

    const view = {
      plugin: {
        settings,
        saveSettings: vi.fn().mockResolvedValue({ success: true }),
      },
      theme: {
        update: vi.fn(),
      },
      createSection(parentEl, title, builder) {
        const sec = createObsidianLikeElement('div');
        sec.className = 'apple-settings-section';
        const label = sec.createDiv();
        label.textContent = title;
        builder(sec);
        parentEl.appendChild(sec);
        return sec;
      },
      updateButtonActive(grid, value) {
        grid.querySelectorAll('button').forEach((b) => {
          if (b.dataset.value === value) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      },
      onColorChange: vi.fn(),
    };

    return { view, parent };
  }

  it('标准主题下显示颜色选择网格，隐藏自定义主题专属色锁定卡片', () => {
    const { view, parent } = createMockView({ theme: 'github' });
    buildThemeColorSection(view, parent);

    const lockedEl = parent.querySelector('.apple-custom-theme-color-locked');
    const gridEl = parent.querySelector('.apple-color-grid');

    expect(lockedEl).not.toBeNull();
    expect(gridEl).not.toBeNull();
    expect(lockedEl.style.display).toBe('none');
    expect(gridEl.style.display).toBe('flex');
  });

  it('自定义主题下隐藏网格，展示专属色锁定卡片并提取主题主色', () => {
    const { view, parent } = createMockView({
      theme: 'custom-forest',
      customThemes: [
        {
          id: 'custom-forest',
          name: '秋日森林',
          colors: { accent: '#B45309' },
        },
      ],
    });

    buildThemeColorSection(view, parent);

    const lockedEl = parent.querySelector('.apple-custom-theme-color-locked');
    const gridEl = parent.querySelector('.apple-color-grid');
    const dotEl = parent.querySelector('.apple-custom-theme-color-dot');
    const titleEl = parent.querySelector('.apple-custom-theme-color-title');

    expect(lockedEl.style.display).toBe('flex');
    expect(gridEl.style.display).toBe('none');
    expect(dotEl.style.backgroundColor).toBe('rgb(180, 83, 9)'); // #B45309
    expect(titleEl.textContent).toContain('#B45309');
  });

  it('切换主题后调用 refreshThemeColorSection 正确同步显示状态', () => {
    const { view, parent } = createMockView({
      theme: 'github',
      customThemes: [
        {
          id: 'custom-forest',
          name: '秋日森林',
          colors: { accent: '#10B981' },
        },
      ],
    });

    buildThemeColorSection(view, parent);

    const lockedEl = parent.querySelector('.apple-custom-theme-color-locked');
    const gridEl = parent.querySelector('.apple-color-grid');

    expect(lockedEl.style.display).toBe('none');
    expect(gridEl.style.display).toBe('flex');

    // 切换至自定义主题
    view.plugin.settings.theme = 'custom-forest';
    view.refreshThemeColorSection();

    expect(lockedEl.style.display).toBe('flex');
    expect(gridEl.style.display).toBe('none');

    // 切换回标准主题
    view.plugin.settings.theme = 'wechat';
    view.refreshThemeColorSection();

    expect(lockedEl.style.display).toBe('none');
    expect(gridEl.style.display).toBe('flex');
  });
});
