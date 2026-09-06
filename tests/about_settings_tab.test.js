/*
## 核心功能

覆盖设置页“关于”Tab 与赞助者名单的 Vitest 测试用例。

## 输入

接收 mock 的 DOM 容器、Plugin 与 SettingTab 实例、以及 sponsors-data。

## 输出

输出自动化断言结果，保护关于页结构、版本号动态读取和赞助者鸣谢榜不回归。

## 定位

位于 tests/，是设置界面的回归测试。

## 依赖

关键依赖：Vitest、`views/settings/about-tab.js`、`services/sponsors-data.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 保证测试覆盖版本号动态读取、二维码展示与赞助鸣谢榜渲染。
*/

import { describe, it, expect, vi } from 'vitest';
import { renderAboutSettingsTab } from '../views/settings/about-tab.js';
import { SPONSORS } from '../services/sponsors-data.js';

describe('Settings - About Tab & Sponsor Hall of Fame', () => {
  it('SPONSORS data contains the first sponsor record', () => {
    expect(SPONSORS.length).toBeGreaterThanOrEqual(1);
    const first = SPONSORS[0];
    expect(first.name).toBe('*哥');
    expect(first.tag).toBe('首位支持者');
    expect(first.message).toBe('公众号排版助手真不错');
    expect(first.date).toBe('2026-09');
  });

  it('renders about tab with dynamic version and title', () => {
    // 模拟 DOM 容器
    const container = document.createElement('div');

    // 模拟 Obsidian 宿主元素工厂方法
    const enhanceElement = (el) => {
      el.empty = () => { el.innerHTML = ''; };
      el.createDiv = (opts = {}) => {
        const div = document.createElement('div');
        if (opts.cls) div.className = opts.cls;
        if (opts.text) div.textContent = opts.text;
        el.appendChild(div);
        return enhanceElement(div);
      };
      el.createEl = (tag, opts = {}) => {
        const child = document.createElement(tag);
        if (opts.cls) child.className = opts.cls;
        if (opts.text) child.textContent = opts.text;
        el.appendChild(child);
        return enhanceElement(child);
      };
      el.createSpan = (opts = {}) => {
        const span = document.createElement('span');
        if (opts.cls) span.className = opts.cls;
        if (opts.text) span.textContent = opts.text;
        el.appendChild(span);
        return enhanceElement(span);
      };
      return el;
    };

    const containerEl = enhanceElement(container);

    const mockTabInstance = {
      app: {
        vault: {
          configDir: '.config/obsidian',
          adapter: {
            getResourcePath: vi.fn((p) => `app://local/${p}`),
          },
        },
      },
      plugin: {
        manifest: {
          id: 'obsidian-wechat-converter',
          version: '2.10.6',
        },
        openExternalUrl: vi.fn(),
      },
    };

    renderAboutSettingsTab(mockTabInstance, containerEl);

    expect(mockTabInstance.app.vault.adapter.getResourcePath).toHaveBeenNthCalledWith(
      1,
      '.config/obsidian/plugins/obsidian-wechat-converter/images/support-wechat.png',
    );
    expect(mockTabInstance.app.vault.adapter.getResourcePath).toHaveBeenNthCalledWith(
      2,
      '.config/obsidian/plugins/obsidian-wechat-converter/images/support-alipay.jpg',
    );

    // 检查标题与版本徽章
    const titleEl = containerEl.querySelector('.apple-settings-about-title');
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe('Obsidian 发布助手');

    const badgeEl = containerEl.querySelector('.apple-settings-about-version-badge');
    expect(badgeEl?.textContent).toBe('v2.10.6');

    const taglineEl = containerEl.querySelector('.apple-settings-about-tagline');
    expect(taglineEl?.textContent).toContain('Obsidian 与全网发布 (Wechat Converter)');

    // 检查是否有 4 个快捷操作链接
    const actionLinks = containerEl.querySelectorAll('.apple-settings-about-link');
    expect(actionLinks.length).toBe(4);

    // 检查赞助二维码卡片（微信 + 支付宝）
    const sponsorCards = containerEl.querySelectorAll('.apple-settings-sponsor-card');
    expect(sponsorCards.length).toBe(2);

    // 检查赞助鸣谢榜
    const fameItems = containerEl.querySelectorAll('.apple-settings-fame-item');
    expect(fameItems.length).toBeGreaterThanOrEqual(1);

    const firstName = containerEl.querySelector('.apple-settings-fame-item-name');
    expect(firstName?.textContent).toBe('*哥');

    const firstTag = containerEl.querySelector('.apple-settings-fame-item-tag');
    expect(firstTag?.textContent).toBe('首位支持者');

    const firstMsg = containerEl.querySelector('.apple-settings-fame-item-message');
    expect(firstMsg?.textContent).toContain('公众号排版助手真不错');
  });
});
