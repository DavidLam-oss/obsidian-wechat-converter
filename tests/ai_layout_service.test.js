/*
## 核心功能

覆盖 ai-layout service basics 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护AI 设置归一化、内容提取、基础 fallback 和基础渲染行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 AI layout service 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, expect, it } from 'vitest';
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');

const {
  normalizeAiSettings,
  getAiProviderIssues,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  extractImageRefsFromHtml,
  extractMarkdownSections,
  extractMarkdownSignals,
  buildFallbackLayout,
  normalizeArticleLayout,
  generateArticleLayout,
  renderArticleLayoutHtml,
  resolveColorPaletteForRender,
} = require('../services/ai-layout');

describe('ai-layout service basics', () => {
  it('should normalize ai settings with safe defaults', () => {
    const normalized = normalizeAiSettings({
      enabled: true,
      providers: [{ id: 'provider-1', apiKey: 'secret' }],
    });

    expect(normalized.enabled).toBe(true);
    expect(normalized.defaultStylePack).toBe('tech-green');
    expect(normalized.providers).toHaveLength(1);
    expect(normalized.providers[0].model).toBe('gpt-4.1-mini');
    expect(normalized.articleLayoutsByPath).toEqual({});
    expect(normalized.requestTimeoutMs).toBe(120000);
  });

  it('should normalize gemini and anthropic providers with kind-specific defaults', () => {
    const normalized = normalizeAiSettings({
      enabled: true,
      providers: [
        { id: 'g1', kind: 'gemini', apiKey: 'secret' },
        { id: 'a1', kind: 'anthropic', apiKey: 'secret' },
      ],
    });

    expect(normalized.providers[0].baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(normalized.providers[0].model).toBe('gemini-2.5-flash');
    expect(normalized.providers[1].baseUrl).toBe('https://api.anthropic.com/v1');
    expect(normalized.providers[1].model).toBe('claude-3-5-haiku-latest');
  });

  it('should report provider readiness issues clearly', () => {
    const incompleteProvider = {
      id: 'provider-1',
      name: '测试 Provider',
      baseUrl: '',
      apiKey: '',
      model: '',
      enabled: true,
    };

    expect(getAiProviderIssues(incompleteProvider)).toEqual([
      'missing-base-url',
      'missing-api-key',
      'missing-model',
    ]);
    expect(isAiProviderRunnable(incompleteProvider)).toBe(false);
    expect(summarizeAiProviderIssues(incompleteProvider)).toContain('缺少 Base URL');
  });

  it('should allow local http provider urls while rejecting public http urls', () => {
    const localProvider = {
      id: 'provider-1',
      name: '本地 Provider',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const lanProvider = {
      ...localProvider,
      id: 'provider-2',
      baseUrl: 'http://192.168.1.20:11434/v1',
    };
    const publicHttpProvider = {
      ...localProvider,
      id: 'provider-3',
      baseUrl: 'http://example.com/v1',
    };

    expect(getAiProviderIssues(localProvider)).not.toContain('invalid-base-url');
    expect(isAiProviderRunnable(localProvider)).toBe(true);
    expect(getAiProviderIssues(lanProvider)).not.toContain('invalid-base-url');
    expect(isAiProviderRunnable(lanProvider)).toBe(true);
    expect(getAiProviderIssues(publicHttpProvider)).toContain('invalid-base-url');
    expect(isAiProviderRunnable(publicHttpProvider)).toBe(false);
    expect(summarizeAiProviderIssues(publicHttpProvider)).toContain('本机/局域网');
  });

  it('should extract image refs from rendered figures', () => {
    const refs = extractImageRefsFromHtml(`
      <section>
        <figure><img src="https://example.com/cover.png" alt="封面图"><figcaption>封面图</figcaption></figure>
        <figure><img src="https://example.com/detail.png" alt="细节图"></figure>
      </section>
    `);

    expect(refs).toHaveLength(2);
    expect(refs[0].id).toBe('image-1');
    expect(refs[0].caption).toBe('封面图');
    expect(refs[1].id).toBe('image-2');
  });

  it('should extract markdown sections while skipping frontmatter', () => {
    const structure = extractMarkdownSections(`---
title: 示例
---

前言段落。

## 第一部分

第一段。

- 要点一
- 要点二

## 第二部分

第二段。
`);

    expect(structure.sections).toHaveLength(2);
    expect(structure.sections[0].title).toBe('第一部分');
    expect(structure.sections[0].paragraphs[0]).toContain('第一段');
    expect(structure.sections[0].bulletGroups[0]).toEqual(['要点一', '要点二']);
    expect(structure.introParagraphs[0]).toContain('前言段落');
  });

  it('should keep h3 content inside the parent h2 section as subsections', () => {
    const structure = extractMarkdownSections(`
# AI 编排实践

这是一段导语。

## 第一部分

### 子节一

第一段。

#### 子节二

- 要点一

## 第二部分

第二段。
    `);

    expect(structure.sections).toHaveLength(2);
    expect(structure.sections[0].title).toBe('第一部分');
    expect(structure.sections[0].subsections).toHaveLength(2);
    expect(structure.sections[0].subsections[0].title).toBe('子节一');
    expect(structure.sections[0].subsections[0].paragraphs[0]).toContain('第一段');
    expect(structure.sections[0].subsections[1].title).toBe('子节二');
    expect(structure.sections[0].subsections[1].bulletGroups[0]).toEqual(['要点一']);
  });

  it('should extract obsidian callouts separately instead of flattening them into plain paragraphs', () => {
    const structure = extractMarkdownSections(`
## 第一部分

> [!note] 提示信息
> 这是一个 callout 内容。

普通正文。
    `);

    expect(structure.sections[0].callouts).toEqual([
      {
        type: 'note',
        title: '提示信息',
        body: '这是一个 callout 内容。',
      },
    ]);
    expect(structure.sections[0].paragraphs).toEqual(['普通正文。']);
  });

  it('should render structured layout json into inline html', () => {
    const html = renderArticleLayoutHtml({
      stylePack: 'tech-green',
      title: '测试文章',
      blocks: [
        { type: 'hero', eyebrow: 'AI Layout', title: '测试标题', subtitle: '测试副标题', coverImageId: 'image-1', variant: 'cover-right' },
        { type: 'lead-quote', text: '一句重点摘要', note: '附加说明' },
        { type: 'case-block', caseLabel: 'CASE 01', title: '案例标题', summary: '案例摘要', bullets: ['第一点'], imageIds: ['image-1'], highlight: '重点高亮' },
      ],
    }, {
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.png', alt: 'cover', caption: '封面' }],
    });

    expect(html).toContain('测试标题');
    expect(html).toContain('一句重点摘要');
    expect(html).toContain('https://example.com/cover.png');
    expect(html).toContain('重点高亮');
  });

  it('should render cached task markers as WeChat-safe checkbox glyphs', () => {
    const html = renderArticleLayoutHtml({
      stylePack: 'tech-green',
      title: '清单文章',
      blocks: [
        {
          type: 'section-block',
          title: '展位物料',
          bulletGroups: [
            ['[ ] 展位设计稿', '[x] 产品陈列台'],
          ],
        },
      ],
    }, { imageRefs: [] });

    expect(html).toContain('☐ 展位设计稿');
    expect(html).toContain('☑ 产品陈列台');
    expect(html).not.toContain('[ ] 展位设计稿');
    expect(html).not.toContain('[x] 产品陈列台');
  });

  it('should hide raw local image markdown from rendered ai text cards', () => {
    const html = renderArticleLayoutHtml({
      stylePack: 'tech-green',
      title: '测试文章',
      blocks: [
        {
          type: 'lead-quote',
          text: '本地图片 ![[attachments/音乐卡点调整.png]] 需要隐藏路径',
          note: '附注 ![alt](attachments/x.png)',
        },
        {
          type: 'section-block',
          title: '第一部分',
          paragraphs: ['正文里有 ![[attachments/图.png]] 文本'],
        },
      ],
    }, { imageRefs: [] });

    expect(html).not.toContain('attachments/音乐卡点调整.png');
    expect(html).not.toContain('attachments/x.png');
    expect(html).toContain('本地图片 需要隐藏路径');
    expect(html).toContain('正文里有 文本');
  });

  it('should render custom ai colors from independent ai color settings', () => {
    const palette = resolveColorPaletteForRender('custom', { customColor: '#ff3366' });
    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'source-first',
        colorPalette: 'custom',
      },
      stylePack: 'custom',
      title: '自定义颜色',
      blocks: [
        { type: 'hero', title: '自定义颜色标题', subtitle: '独立于普通预览主题色' },
      ],
    }, {
      colorPaletteOverride: { customColor: '#ff3366' },
    });

    expect(palette.tokens.accent).toBe('#ff3366');
    expect(html).toContain(palette.tokens.border);
    expect(html).toContain('自定义颜色标题');
  });

  it('should keep custom out of automatic color recommendations while respecting explicit custom selection', () => {
    const autoLayout = normalizeArticleLayout({
      articleType: 'article',
      title: '自动颜色',
      selection: { layoutFamily: 'auto', colorPalette: 'auto' },
      resolved: { layoutFamily: 'source-first', colorPalette: 'custom' },
      recommendedColorPalette: 'custom',
      stylePack: 'custom',
      blocks: [{ type: 'hero', title: '自动颜色' }],
    }, {
      title: '自动颜色',
      markdown: '## 小节\n正文',
      selection: { layoutFamily: 'auto', colorPalette: 'auto' },
    });

    const customLayout = normalizeArticleLayout({
      articleType: 'article',
      title: '自定义颜色',
      selection: { layoutFamily: 'auto', colorPalette: 'custom' },
      resolved: { layoutFamily: 'source-first', colorPalette: 'custom' },
      recommendedColorPalette: 'custom',
      stylePack: 'custom',
      blocks: [{ type: 'hero', title: '自定义颜色' }],
    }, {
      title: '自定义颜色',
      markdown: '## 小节\n正文',
      selection: { layoutFamily: 'auto', colorPalette: 'custom' },
    });

    expect(autoLayout.resolved.colorPalette).toBe('tech-green');
    expect(autoLayout.recommendedColorPalette).toBe('tech-green');
    expect(customLayout.resolved.colorPalette).toBe('custom');
    expect(customLayout.recommendedColorPalette).toBe('tech-green');
  });

  it('should keep core ai layout structure after wechat draft cleaning', () => {
    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      title: '测试文章',
      blocks: [
        { type: 'hero', eyebrow: 'AI Layout Draft', title: '测试标题', subtitle: '测试副标题', coverImageId: 'image-1', variant: 'cover-right' },
        { type: 'lead-quote', text: '一句重点摘要', note: '附加说明' },
        { type: 'section-block', sectionIndex: 0, title: '第一部分', paragraphs: ['这里是正文。'], imageIds: ['image-1'] },
      ],
    }, {
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.png', alt: 'cover', caption: '封面' }],
    });

    const cleaned = cleanHtmlForDraft(html);

    expect(cleaned).toContain('测试标题');
    expect(cleaned).toContain('一句重点摘要');
    expect(cleaned).toContain('第一部分');
    expect(cleaned).toContain('https://example.com/cover.png');
  });

  it('should extract markdown structure signals for prompt building', () => {
    const signals = extractMarkdownSignals(`
# AI 编排实践

这是一段导语。

## 第一部分

- 第一点
- 第二点

## 第二部分

这里是正文解释。
    `);

    expect(signals.sectionTitles).toEqual(['第一部分', '第二部分']);
    expect(signals.leadParagraphs[0]).toContain('这是一段导语');
    expect(signals.bulletGroups[0]).toEqual(['第一点', '第二点']);
  });

  it('should build fallback layout with tutorial-friendly blocks', () => {
    const layout = buildFallbackLayout({
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是一段导语。

- 第一点
- 第二点

## 第二部分
这里是总结。
      `,
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/1.png', caption: '截图 1', alt: '截图 1' }],
    });

    expect(layout.blocks[0].type).toBe('hero');
    expect(layout.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'cta-card')).toBe(false);
  });

  it('should keep source-first fallback closer to the original article flow', () => {
    const layout = buildFallbackLayout({
      title: '知识整理',
      selection: {
        layoutFamily: 'source-first',
        colorPalette: 'tech-green',
      },
      markdown: `
## 第一部分
这是一段导语。

## 第二部分
这里是补充说明。
      `,
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.png', caption: '封面图', alt: '封面图' }],
    });

    expect(layout.blocks.some((block) => block.type === 'hero')).toBe(false);
    expect(layout.blocks.some((block) => block.type === 'part-nav')).toBe(false);
    expect(layout.blocks[0]?.type).toBe('lead-quote');
  });

  it('should allow source-first to generate local fallback blocks without provider', async () => {
    const result = await generateArticleLayout({
      provider: null,
      title: '知识整理',
      markdown: `
## 第一部分
这是一段导语。

## 第二部分
这里是补充说明。
      `,
      selection: {
        layoutFamily: 'source-first',
        colorPalette: 'auto',
      },
      imageRefs: [],
      timeoutMs: 1000,
    });

    expect(result.layoutJson.layoutFamily).toBe('source-first');
    expect(result.layoutJson.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(result.generationMeta.executionMode).toBe('local-fallback');
    expect(result.generationMeta.skillVersion).toBeTruthy();
  });

  it('should preserve at least one image for source-first image-only notes', () => {
    const layout = buildFallbackLayout({
      title: '配图短文',
      selection: {
        layoutFamily: 'source-first',
        colorPalette: 'tech-green',
      },
      markdown: '![封面](cover.png)',
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.png', caption: '封面图', alt: '封面图' }],
    });

    expect(layout.blocks.some((block) => Array.isArray(block.imageIds) && block.imageIds.includes('image-1'))).toBe(true);
  });

  it('should keep editorial-lite fallback focused on masthead and lead without tutorial chrome', () => {
    const layout = buildFallbackLayout({
      title: '写作经验复盘',
      selection: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'graphite-rose',
      },
      markdown: `
## 为什么我后来改了写法
这里是导语。

## 写作中的一个误区
这里是补充说明。
      `,
      stylePack: 'graphite-rose',
      imageRefs: [
        { id: 'image-1', src: 'https://example.com/cover.png', caption: '封面图', alt: '封面图' },
        { id: 'image-2', src: 'https://example.com/screen.png', caption: '截图', alt: '截图' },
      ],
    });

    expect(layout.blocks[0]?.type).toBe('hero');
    expect(layout.blocks.some((block) => block.type === 'lead-quote')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'part-nav')).toBe(false);
    expect(layout.blocks.some((block) => block.type === 'phone-frame')).toBe(false);
  });

  it('should preserve non-cover images for editorial-lite when ai output is sparse', () => {
    const layout = buildFallbackLayout({
      title: '写作经验复盘',
      selection: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'graphite-rose',
      },
      markdown: `
## 第一部分
这里是正文。
      `,
      stylePack: 'graphite-rose',
      imageRefs: [
        { id: 'image-1', src: 'https://example.com/cover.png', caption: '封面图', alt: '封面图' },
        { id: 'image-2', src: 'https://example.com/detail.png', caption: '细节图', alt: '细节图' },
      ],
    });

    expect(layout.blocks.some((block) => Array.isArray(block.imageIds) && block.imageIds.includes('image-2'))).toBe(true);
  });

  it('should merge sparse ai output with fallback section blocks without forcing cta', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'lead-quote', text: '模型只给了一句摘要' },
      ],
    }, {
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是一段导语。

## 第二部分
这里是补充说明。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    expect(layout.blocks.length).toBeGreaterThan(1);
    expect(layout.blocks[0].type).toBe('hero');
    expect(layout.blocks[1].type).toBe('part-nav');
    expect(layout.blocks[2].type).toBe('lead-quote');
    expect(layout.blocks.some((block) => block.type === 'hero')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'cta-card')).toBe(false);
  });

  it('should honor the user-selected style pack over ai-returned style pack', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'hero', title: '文章标题' },
      ],
    }, {
      title: '文章标题',
      markdown: `
## 第一部分
正文一。
      `,
      stylePack: 'ocean-blue',
      imageRefs: [],
    });

    expect(layout.stylePack).toBe('ocean-blue');
  });

  it('should render different colors when a non-green style pack is selected', () => {
    const html = renderArticleLayoutHtml({
      stylePack: 'ocean-blue',
      title: '测试文章',
      blocks: [
        { type: 'hero', eyebrow: 'AI Layout', title: '测试标题', subtitle: '测试副标题', variant: 'cover-right' },
      ],
    }, {
      imageRefs: [],
    });

    expect(html).toContain('#1f4fb2');
    expect(html).not.toContain('#14b37d');
  });

  it('should emit inline-safe font family values in wrapper styles', () => {
    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [{ type: 'hero', title: '测试标题' }],
    });

    expect(html).toContain("font-family:-apple-system,BlinkMacSystemFont,'Segoe UI'");
    expect(html).not.toContain('font-family:-apple-system,BlinkMacSystemFont,"Segoe UI"');
  });

  it('should recommend editorial-lite for essay-like content signals', () => {
    const layout = normalizeArticleLayout({
      articleType: 'article',
      title: '写作经验复盘',
      blocks: [
        { type: 'lead-quote', text: '这是开头的一句观点。' },
      ],
    }, {
      title: '写作经验复盘',
      markdown: `
## 为什么我后来改了写法
这里是第一段正文。

## 写作中的一个误区
这里是第二段正文。
      `,
      imageRefs: [],
    });

    expect(layout.resolved.layoutFamily).toBe('editorial-lite');
  });
});
