/*
## 核心功能

验证样式源文件的职责拆分、构建顺序和旧贴图规则清理结果。

## 输入

读取样式构建脚本与 styles/ 下的 CSS 源文件。

## 输出

断言专属片段按稳定顺序参与构建，且已移除的旧选择器不会回流。

## 定位

位于 tests/，覆盖样式源文件模块化的静态合同。

## 依赖

关键依赖：Vitest、node:fs、node:path。

## 维护规则

- 新增或调整样式片段时同步更新顺序断言。
- 只断言职责和级联合同，不复制具体视觉数值。
*/

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readProjectFile = (filePath) => readFileSync(resolve(process.cwd(), filePath), 'utf8');

describe('stylesheet source structure', () => {
  it('keeps responsibility-specific fragments in stable cascade order', () => {
    const buildScript = readProjectFile('scripts/build-styles.mjs');
    const expectedOrder = [
      'styles/style-panel.css',
      'styles/style-controls.css',
      'styles/sticker-settings.css',
      'styles/preview.css',
      'styles/sticker-preview.css',
      'styles/wechat-publish.css',
      'styles/sticker-publish.css',
      'styles/multi-platform.css',
    ];

    let previousIndex = -1;
    for (const fragment of expectedOrder) {
      const currentIndex = buildScript.indexOf(`"${fragment}"`);
      expect(currentIndex, `${fragment} should participate in the stylesheet build`).toBeGreaterThan(-1);
      expect(currentIndex, `${fragment} should follow the previous fragment`).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }
  });

  it('does not retain the replaced sticker preview selector families', () => {
    const stickerPreview = readProjectFile('styles/sticker-preview.css');
    const removedSelectors = [
      'apple-sticker-option-bar',
      'apple-sticker-switch',
      'apple-sticker-image-grid',
      'apple-sticker-image-item',
      'apple-sticker-img-thumb',
      'apple-sticker-image-badge',
      'apple-sticker-img-remove-btn',
      'apple-sticker-empty-notice',
      'apple-sticker-empty-icon',
    ];

    for (const selector of removedSelectors) {
      expect(stickerPreview).not.toContain(selector);
    }
    expect(stickerPreview).toContain('.sticker-image-list__item');
  });

  it('keeps article setting sections spaced after the article/sticker mode wrapper', () => {
    const stylePanel = readProjectFile('styles/style-panel.css');
    const stickerSettings = readProjectFile('styles/sticker-settings.css');

    expect(stylePanel).toMatch(/\.apple-settings-article-wrapper:not\(\.hidden\)\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*24px;/s);
    expect(stylePanel).toMatch(/\.apple-converter-container\.apple-converter-mobile\s+\.apple-settings-article-wrapper:not\(\.hidden\)\s*\{[^}]*gap:\s*12px;/s);
    expect(stylePanel).not.toMatch(/\.apple-settings-article-wrapper\s*\{[^}]*display:\s*flex;/s);
    expect(stickerSettings).toMatch(/\.apple-settings-sticker-wrapper:not\(\.hidden\)\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*24px;/s);
    expect(stickerSettings).toMatch(/\.apple-converter-container\.apple-converter-mobile\s+\.apple-settings-sticker-wrapper:not\(\.hidden\)\s*\{[^}]*gap:\s*12px;/s);
    expect(stickerSettings).not.toContain('.apple-settings-sticker-header');
    expect(stickerSettings).not.toMatch(/\.apple-settings-sticker-wrapper\s+\.apple-setting-section/);
  });

  it('positions the AI layout overlay below the measured preview header', () => {
    const aiLayout = readProjectFile('styles/ai-layout.css');
    const overlayRule = aiLayout.match(/\.apple-ai-layout-overlay\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';

    expect(overlayRule).toContain('top: var(--apple-header-height');
    expect(overlayRule).toMatch(/max-height:\s*min\([\s\S]*var\(--apple-header-height/);
    expect(overlayRule).not.toMatch(/top:\s*48px/);
  });

  it('keeps the AI layout heading within the compact settings hierarchy', () => {
    const aiLayout = readProjectFile('styles/ai-layout.css');
    const titleRule = aiLayout.match(/\.apple-ai-layout-title\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';

    expect(titleRule).toMatch(/font-size:\s*14px/);
    expect(titleRule).toMatch(/font-weight:\s*600/);
    expect(titleRule).not.toMatch(/font-size:\s*18px/);
    expect(titleRule).not.toMatch(/font-weight:\s*800/);
  });
});
