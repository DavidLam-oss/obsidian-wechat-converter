/*
## 核心功能

验证手机仿真框样式规范与小屏适配规则（自适应视口高度、消除画布双滚动条、保持移动端 375px 排版宽）。

## 输入

读取 styles/preview.css、styles/toolbar.css 与 views/apple-style-view。

## 输出

断言 CSS 规约不包含硬编码 812px 锁死尺寸，支持自适应高度与触底防联动，且在启用手机框时 DOM 结构正确。

## 定位

位于 tests/，为 Issue #83 修复提供样式回归与视图挂载守护。
*/

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppleStyleView } from '../views/apple-style-view.js';

const readProjectFile = (filePath) => readFileSync(resolve(process.cwd(), filePath), 'utf8');

function createObsidianLikeElement(tag = 'div') {
  const el = document.createElement(tag);
  el.createEl = (childTag, options = {}) => {
    const child = createObsidianLikeElement(childTag);
    if (options.cls) child.className = options.cls;
    if (options.text) child.textContent = options.text;
    el.appendChild(child);
    return child;
  };
  el.createSvg = (childTag, options = {}) => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', childTag);
    if (options.cls) child.setAttribute('class', options.cls);
    if (options.attr) {
      for (const [k, v] of Object.entries(options.attr)) child.setAttribute(k, v);
    }
    child.createSvg = el.createSvg;
    el.appendChild(child);
    return child;
  };
  el.createDiv = (options = {}) => el.createEl('div', options);
  el.empty = () => {
    while (el.firstChild) el.removeChild(el.firstChild);
  };
  el.addClass = (cls) => el.classList.add(cls);
  el.removeClass = (cls) => el.classList.remove(cls);
  return el;
}

describe('phone frame preview styles and small screen adaptation', () => {
  it('does not lock phone frame to a fixed 812px height and uses sleek 340px width', () => {
    const previewCss = readProjectFile('styles/preview.css');
    const phoneFrameRule = previewCss.match(/(?:^|\n)\.apple-phone-frame\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';

    // 宽度收窄至 340px（视觉更修长，避免小屏横向发胖）
    expect(phoneFrameRule).toMatch(/width:\s*340px;/);
    expect(phoneFrameRule).toMatch(/min-width:\s*340px;/);

    // 高度自适应视口，最大高度 740px（对齐 iPhone 19.5:9 修长比例）
    expect(phoneFrameRule).toMatch(/height:\s*100%;/);
    expect(phoneFrameRule).toMatch(/max-height:\s*740px;/);
    expect(phoneFrameRule).not.toMatch(/(?<![a-z-])height:\s*812px;/);
    expect(phoneFrameRule).not.toMatch(/min-height:\s*812px;/);
  });

  it('prevents vertical double-scrolling on preview wrapper while keeping flex shrink capability', () => {
    const previewCss = readProjectFile('styles/preview.css');
    const wrapperRule = previewCss.match(/\.apple-preview-wrapper\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';

    expect(wrapperRule).toMatch(/min-height:\s*0;/);
    expect(wrapperRule).toMatch(/overflow-y:\s*hidden;/);
    expect(wrapperRule).toMatch(/overflow-x:\s*auto;/);
  });

  it('contains scroll within preview container and allows flex shrinking', () => {
    const previewCss = readProjectFile('styles/preview.css');
    const previewRule = previewCss.match(/\.apple-converter-preview\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';

    expect(previewRule).toMatch(/flex:\s*1;/);
    expect(previewRule).toMatch(/min-height:\s*0;/);
    expect(previewRule).toMatch(/overflow-y:\s*auto;/);
    expect(previewRule).toMatch(/overscroll-behavior:\s*contain;/);
  });

  it('provides compact styling rules for smaller height viewports and status bar elements', () => {
    const previewCss = readProjectFile('styles/preview.css');
    const toolbarCss = readProjectFile('styles/toolbar.css');

    expect(previewCss).toContain('.apple-phone-status-bar');
    expect(previewCss).toContain('.apple-status-island');
    expect(previewCss).toContain('.apple-status-time');
    expect(previewCss).toContain('.apple-status-signal');
    expect(previewCss).toContain('.apple-status-battery');
    expect(previewCss).toContain('.apple-phone-capsule');
    expect(previewCss).toContain('@media (max-height: 760px)');
    expect(toolbarCss).toContain('@media (max-height: 760px)');
  });

  it('mounts phone frame structure correctly with status bar and capsule when usePhoneFrame is enabled', async () => {
    const view = new AppleStyleView(null, {
      settings: { usePhoneFrame: true },
    });
    view.containerEl.appendChild(createObsidianLikeElement());
    view.containerEl.appendChild(createObsidianLikeElement());
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => null),
        on: vi.fn(() => ({})),
      },
      vault: {
        read: vi.fn(async () => ''),
      },
    };
    view.registerEvent = vi.fn();
    vi.spyOn(view, 'loadDependencies').mockResolvedValue(undefined);
    vi.spyOn(view, 'createSettingsPanel').mockImplementation(() => {});

    await view.onOpen();

    const container = view.containerEl.children[1];
    const wrapper = container.querySelector('.apple-preview-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains('mode-phone')).toBe(true);

    const phoneFrame = wrapper?.querySelector('.apple-phone-frame');
    expect(phoneFrame).not.toBeNull();

    // 验证状态栏结构
    const statusBar = phoneFrame?.querySelector('.apple-phone-status-bar');
    expect(statusBar).not.toBeNull();
    expect(statusBar?.querySelector('.apple-status-time')?.textContent).toBe('9:41');
    expect(statusBar?.querySelector('.apple-status-island')).not.toBeNull();
    expect(statusBar?.querySelector('.apple-status-icons')).not.toBeNull();
    expect(statusBar?.querySelector('.apple-status-signal')).not.toBeNull();
    expect(statusBar?.querySelector('.apple-status-battery')).not.toBeNull();

    // 验证导航栏与胶囊
    const header = phoneFrame?.querySelector('.apple-phone-header');
    expect(header).not.toBeNull();
    expect(header?.querySelector('.apple-phone-capsule')).not.toBeNull();

    // 验证正文预览区与底部指示条
    expect(phoneFrame?.querySelector('.apple-converter-preview')).not.toBeNull();
    expect(phoneFrame?.querySelector('.apple-home-indicator')).not.toBeNull();
  });
});
