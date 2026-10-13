/*
## 核心功能

覆盖小红书卡片导出 AI 封面装配渲染（full-bleed/mixed）与侧边栏设置交互的 Vitest 测试用例。

## 输入

接收 mock 的 CardTheme、CardCoverFields、jsdom Document 与 mock 的 AppleStyleView 环境。

## 输出

输出自动化断言结果，确保图文混排模式、全图纯海报模式以及侧边栏 AI 封面控件交互不回归。

## 定位

位于 tests/，是针对 C06.3 的集成/组件级单元测试。

## 依赖

关键依赖：Vitest、`services/card-cover-model.js`、`services/card-render-assembly.js`、`services/card-themes.js`。
*/

import { describe, it, expect } from 'vitest';
import {
  deriveCoverFields,
  normalizeCoverFields,
} from '../services/card-cover-model.js';
import { assembleCardCoverPage } from '../services/card-render-assembly.js';
import { getCardTheme } from '../services/card-themes.js';

describe('Card AI Cover Assembly & Fields (C06.3)', () => {
  const theme = getCardTheme('simple-white');

  it('normalizes cover fields with AI cover properties', () => {
    const raw = {
      title: '测试标题',
      author: '作者名',
      coverImage: 'data:image/png;base64,fake-image',
      coverMode: 'full-bleed',
      coverImageStyle: 'editorial-magazine',
      coverPrompt: 'Editorial concept of {title}',
    };
    const fields = normalizeCoverFields(raw);

    expect(fields.title).toBe('测试标题');
    expect(fields.author).toBe('作者名');
    expect(fields.coverImage).toBe('data:image/png;base64,fake-image');
    expect(fields.coverMode).toBe('full-bleed');
    expect(fields.coverImageStyle).toBe('editorial-magazine');
    expect(fields.coverPrompt).toBe('Editorial concept of {title}');
  });

  it('derives cover fields from frontmatter including cover and coverMode', () => {
    const markdown = [
      '---',
      'title: Frontmatter 标题',
      'author: 独立创作者',
      'cover: https://example.com/banner.png',
      'coverMode: full-bleed',
      'coverStyle: cyberpunk-tech',
      '---',
      '正文内容',
    ].join('\n');

    const derived = deriveCoverFields({ markdown, sourcePath: 'notes/demo.md' });
    expect(derived.title).toBe('Frontmatter 标题');
    expect(derived.author).toBe('独立创作者');
    expect(derived.coverImage).toBe('https://example.com/banner.png');
    expect(derived.coverMode).toBe('full-bleed');
    expect(derived.coverImageStyle).toBe('cyberpunk-tech');
  });

  it('assembles pure text cover when coverImage is empty', () => {
    const fields = normalizeCoverFields({
      title: '纯文字封面',
      author: '测试作者',
      date: '2026-09-15',
    });
    const page = assembleCardCoverPage({
      theme,
      fields,
      watermarkText: '小红书号123',
    });

    expect(page.classList.contains('icard-cover')).toBe(true);
    expect(page.classList.contains('icard-cover--full-bleed')).toBe(false);
    expect(page.classList.contains('icard-cover--has-image')).toBe(false);
    expect(page.querySelector('.icard-cover-title')?.textContent).toBe('纯文字封面');
    expect(page.querySelector('.icard-cover-meta')?.textContent).toBe('测试作者 · 小红书号123');
  });

  it('assembles full-bleed cover with pure image poster and zero text overlay', () => {
    const fields = normalizeCoverFields({
      title: '海报封面',
      author: '作者',
      coverImage: 'data:image/png;base64,poster123',
      coverMode: 'full-bleed',
    });
    const page = assembleCardCoverPage({
      theme,
      fields,
    });

    expect(page.classList.contains('icard-cover--full-bleed')).toBe(true);
    const img = page.querySelector('.icard-cover-full-bleed-img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,poster123');
    // Full-bleed mode does not render body text overlay
    expect(page.querySelector('.icard-cover-body')).toBeNull();
  });

  it('assembles mixed mode cover with background image, dark overlay, and readable text', () => {
    const fields = normalizeCoverFields({
      title: '图文混排封面',
      author: '作者名',
      date: '2026-09-15',
      excerpt: '精彩摘要内容',
      coverImage: 'data:image/png;base64,background456',
      coverMode: 'mixed',
    });
    const page = assembleCardCoverPage({
      theme,
      fields,
    });

    expect(page.classList.contains('icard-cover--has-image')).toBe(true);
    expect(page.classList.contains('icard-cover--full-bleed')).toBe(false);

    const bg = page.querySelector('.icard-cover-bg');
    expect(bg).not.toBeNull();

    const overlay = page.querySelector('.icard-cover-overlay');
    expect(overlay).not.toBeNull();

    const body = page.querySelector('.icard-cover-body');
    expect(body).not.toBeNull();
    expect(page.querySelector('.icard-cover-title')?.textContent).toBe('图文混排封面');
    expect(page.querySelector('.icard-cover-excerpt')?.textContent).toBe('精彩摘要内容');
  });
});
