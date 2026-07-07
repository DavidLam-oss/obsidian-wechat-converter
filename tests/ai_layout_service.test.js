/*
## 核心功能

覆盖 AI layout service 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 AI layout service 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, expect, it, vi } from 'vitest';
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');

const {
  validateAiLayoutPayload,
} = require('../services/ai-layout-skill-bundle');

const {
  normalizeAiSettings,
  getAiProviderIssues,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  extractImageRefsFromHtml,
  extractRenderedSectionFragments,
  extractMarkdownSections,
  extractMarkdownSignals,
  buildFallbackLayout,
  normalizeArticleLayout,
  normalizeArticleLayoutCacheEntry,
  normalizeLayoutGenerationMeta,
  deriveArticleLayoutStateForSelection,
  getArticleLayoutSelectionState,
  generateArticleLayout,
  AiLayoutSchemaError,
  renderArticleLayoutHtml,
  resolveColorPaletteForRender,
  AiLayoutTimeoutError,
} = require('../services/ai-layout');

describe('ai-layout service', () => {
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

  it('should render editorial-lite with a more magazine-like section rhythm', () => {
    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'graphite-rose',
      },
      stylePack: 'graphite-rose',
      title: '经验复盘',
      blocks: [
        { type: 'hero', eyebrow: 'Editorial Layout', title: '经验复盘', subtitle: '更轻、更有呼吸感的版式。', variant: 'cover-left' },
        { type: 'section-block', sectionIndex: 0, title: '第一部分', paragraphs: ['这里是正文。'] },
      ],
    }, {
      imageRefs: [],
    });

    expect(html).toContain('Editorial Layout');
    expect(html).toContain('Part 01');
    expect(html).toContain('#cc5f82');
    expect(html).not.toContain('SECTION 01');
    expect(html).toContain('Georgia');
    expect(html).toContain('width:48px;height:1px;background:#cc5f82');
    expect(html).toContain('width:100%;height:1px;background:');
    expect(html).toContain('display:block;width:48px;height:1px;background:#cc5f82');
    expect(html).toContain('&nbsp;');
    expect(html).not.toContain('gap:14px');
  });

  it('should render source-first and tutorial-cards with visibly different structural chrome', () => {
    const sourceHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'source-first',
        colorPalette: 'tech-green',
      },
      stylePack: 'tech-green',
      title: '知识整理',
      blocks: [
        { type: 'lead-quote', text: '一句导语。' },
        { type: 'section-block', sectionIndex: 0, title: '第一部分', paragraphs: ['这里是正文。'] },
      ],
    }, {
      imageRefs: [],
    });

    const tutorialHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      title: '操作教程',
      blocks: [
        { type: 'hero', eyebrow: 'AI Layout Draft', title: '操作教程', subtitle: '快速上手', variant: 'cover-right' },
        { type: 'section-block', sectionIndex: 0, title: '第一步', paragraphs: ['这里是正文。'] },
      ],
    }, {
      imageRefs: [],
    });

    expect(sourceHtml).toContain('Section 01');
    expect(sourceHtml).toContain('border-left:3px solid');
    expect(tutorialHtml).toContain('SECTION 01');
    expect(tutorialHtml).toContain('box-shadow:0 10px 30px -24px');
  });

  it('should render tutorial-cards in draft mode with wechat-safer markup', () => {
    const draftHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      title: '操作教程',
      blocks: [
        { type: 'hero', eyebrow: 'AI Layout Draft', title: '操作教程', subtitle: '快速上手', coverImageId: 'image-1', variant: 'cover-right' },
        { type: 'part-nav', items: [{ label: 'PART 01', text: '准备工作' }, { label: 'PART 02', text: '正式操作' }] },
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一步',
          paragraphs: ['这里是正文。'],
          subsections: [{ title: '子步骤', level: 3, paragraphs: ['补充说明。'] }],
        },
      ],
    }, {
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.png', alt: 'cover', caption: '封面' }],
      mode: 'draft',
    });

    expect(draftHtml).toContain('操作教程');
    expect(draftHtml).toContain('PART 01');
    expect(draftHtml).not.toContain('<h1');
    expect(draftHtml).not.toContain('<h2');
    expect(draftHtml).toContain('display:flex;align-items:center;');
    expect(draftHtml).toContain('overflow-x:scroll');
    expect(draftHtml).toContain('-webkit-overflow-scrolling:touch');
    expect(draftHtml).toContain('display:inline-block');
    expect(draftHtml).toContain('padding:12px 4px 10px');
    expect(draftHtml).toContain('height:10px;background:#2c6bed');
    expect(draftHtml).toContain('&nbsp;');
    expect(draftHtml).toContain('← 左右滑动');
    expect(draftHtml).toContain('padding:18px 24px 16px;box-sizing:border-box;border:1px solid #d8e2f2;border-left:3px solid #2c6bed;border-radius:14px;background:#f6f9fd;background-color:#f6f9fd;overflow:hidden');
    expect(draftHtml).not.toContain('<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border-spacing:0;border:none;border-width:0;margin:0;">');
    expect(draftHtml).toContain('height:116px');
    expect(draftHtml).toContain('height:60px;overflow:hidden');
    expect(draftHtml).not.toContain('padding:8px 10px;border:1px solid');
    expect(draftHtml).not.toContain('box-shadow:0 10px 30px -24px');
  });

  it('should render tutorial subsection rails with the same stable table markup in preview mode', () => {
    const previewHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      title: '操作教程',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一步',
          paragraphs: ['这里是正文。'],
          subsections: [{ title: '子步骤', level: 3, paragraphs: ['补充说明。'] }],
        },
      ],
    }, {
      imageRefs: [],
      mode: 'preview',
    });

    expect(previewHtml).not.toContain('<table role="presentation" cellspacing="0" cellpadding="0" border="0"');
    expect(previewHtml).toContain('border:1px solid #d8e2f2;border-left:3px solid #2c6bed;border-radius:14px;background:#f6f9fd;overflow:hidden');
    expect(previewHtml).toContain('padding:14px 16px 12px;');
  });

  it('should keep tutorial-cards preview roomier than the draft export spacing', () => {
    const previewHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      title: '操作教程',
      blocks: [
        { type: 'hero', eyebrow: 'AI Layout Draft', title: '操作教程', subtitle: '快速上手', variant: 'cover-right' },
        { type: 'section-block', sectionIndex: 0, title: '第一步', paragraphs: ['这里是正文。'] },
      ],
    }, {
      imageRefs: [],
      mode: 'preview',
    });

    expect(previewHtml).toContain('padding:22px 16px 30px');
    expect(previewHtml).toContain('margin:16px 0');
    expect(previewHtml).toContain('margin:22px 0');
  });

  it('should render editorial-lite draft part nav with stable divider rows', () => {
    const draftHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'graphite-rose',
      },
      stylePack: 'graphite-rose',
      blocks: [
        {
          type: 'part-nav',
          items: [
            { label: '01', text: '可视化思考' },
            { label: '02', text: 'Canvas 官方白板' },
          ],
        },
      ],
    }, {
      imageRefs: [],
      mode: 'draft',
    });

    expect(draftHtml).not.toContain('width:48px;height:2px');
    expect(draftHtml).not.toContain('border-top:1px solid');
    expect(draftHtml).toContain('border-bottom:1px solid');
    expect(draftHtml).toContain('font-size:17px;font-weight:500;line-height:1.72;');
  });

  it('should render editorial-lite draft hero divider once before part nav', () => {
    const draftHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'graphite-rose',
      },
      stylePack: 'graphite-rose',
      blocks: [
        { type: 'hero', eyebrow: 'OBSIDIAN', title: '标题', subtitle: '副标题', coverImageId: 'image-1', variant: 'cover-right' },
        { type: 'part-nav', items: [{ label: '01', text: '可视化思考' }] },
      ],
    }, {
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.png', alt: 'cover', caption: '封面' }],
      mode: 'draft',
    });

    expect(draftHtml.match(/width:48px;height:1px/g) || []).toHaveLength(1);
    expect(draftHtml).toContain('background:#cc5f82');
    expect(draftHtml).toContain('font-size:0;line-height:0;overflow:hidden;');
    expect(draftHtml).toContain('width:100%;height:1px;background:');
    expect(draftHtml).toContain('display:block;width:48px;height:1px;background:#cc5f82');
    expect(draftHtml).toContain('&nbsp;');
  });

  it('should avoid a duplicate top divider when editorial-lite lead quote follows part nav', () => {
    const draftHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'graphite-rose',
      },
      stylePack: 'graphite-rose',
      blocks: [
        { type: 'part-nav', items: [{ label: '04', text: '实战选择建议' }] },
        { type: 'lead-quote', text: '如果说文档是线性的，那大脑的思维往往是网状的。', note: '编者按' },
      ],
    }, {
      imageRefs: [],
      mode: 'draft',
    });

    expect(draftHtml).toContain('border-bottom:1px solid #e7dce3');
    expect(draftHtml).toContain('border-top:none');
    expect(draftHtml.match(/border-top:1px solid/g) || []).toHaveLength(0);
  });

  it('should render cta cards with dedicated padding and a stable pill button in draft mode', () => {
    const draftHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'source-first',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'cta-card',
          title: '进阶阅读',
          body: '如果你对 Obsidian 产生了兴趣，这里有更多实战经验。',
          buttonText: '查看系列教程',
          note: '记得关注，我们下期见。',
        },
      ],
    }, {
      imageRefs: [],
      mode: 'draft',
    });

    expect(draftHtml).toContain('padding:14px 14px 12px');
    expect(draftHtml).toContain('font-size:0;line-height:0;');
    expect(draftHtml).toContain('display:inline-block;padding:10px 16px;border-radius:999px;background:#2c6bed;color:#ffffff');
    expect(draftHtml).toContain('line-height:1.75;color:');
  });

  it('should render cta cards with readable spacing in preview mode', () => {
    const previewHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'source-first',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'cta-card',
          title: '进阶阅读',
          body: '如果你对 Obsidian 产生了兴趣，这里有更多实战经验。',
          buttonText: '查看系列教程',
          note: '记得关注，我们下期见。',
        },
      ],
    }, {
      imageRefs: [],
    });

    expect(previewHtml).toContain('padding:14px 14px 12px');
    expect(previewHtml).toContain('margin:0 0 10px;font-size:20px;line-height:1.35;');
    expect(previewHtml).toContain('display:inline-block;padding:10px 16px;border-radius:999px;background:#2c6bed;color:#ffffff');
  });

  it('should render extracted callouts as cards in ai layout preview', () => {
    const layout = buildFallbackLayout({
      title: 'Callout 测试',
      markdown: `
## 第一部分

> [!tip] 使用建议
> 先从一个小案例开始。

普通正文。
      `,
      stylePack: 'ocean-blue',
      selection: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      imageRefs: [],
    });

    const html = renderArticleLayoutHtml(layout, { imageRefs: [] });

    expect(html).toContain('使用建议');
    expect(html).toContain('先从一个小案例开始。');
    expect(html).toContain('background:#edf4ff');
    expect(html).not.toContain('[!tip]');
  });

  it('should preserve rendered special blocks from the base preview inside ai sections', () => {
    const renderedSectionFragments = extractRenderedSectionFragments(`
      <section>
        <h2>第一部分</h2>
        <p>普通正文。</p>
        <section class="code-snippet__fix"><pre>const x = 1;</pre></section>
        <h3>子步骤</h3>
        <table><tr><td>表格内容</td></tr></table>
      </section>
    `);

    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          paragraphs: ['降级正文'],
          subsections: [{ title: '子步骤', level: 3, paragraphs: ['降级子正文'] }],
        },
      ],
    }, {
      imageRefs: [],
      mode: 'draft',
      renderedSectionFragments,
    });

    expect(html).toContain('code-snippet__fix');
    expect(html).toContain('<table>');
    expect(html).not.toContain('降级子正文');
  });

  it('should preserve horizontal image swipe and wide table scroll containers inside ai sections', () => {
    const renderedSectionFragments = extractRenderedSectionFragments(`
      <section>
        <h2>第一部分</h2>
        <p>普通正文。</p>
        <section style="display:block;margin:18px 0;text-align:left;">
          <section style="display:block;width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;box-sizing:border-box;margin:0;padding:0;white-space:nowrap;">
            <section style="display:table;table-layout:fixed;width:200%;min-width:200%;border-spacing:0;font-size:0;line-height:0;margin:0;padding:0;">
              <section style="display:table-cell;vertical-align:top;width:1%;box-sizing:border-box;white-space:normal;padding:0 8px;margin:0;text-align:center;">
                <img src="https://example.com/a.png" alt="第一张" style="display:block;width:100%;height:auto;">
              </section>
              <section style="display:table-cell;vertical-align:top;width:1%;box-sizing:border-box;white-space:normal;padding:0 8px;margin:0;text-align:center;">
                <img src="https://example.com/b.png" alt="第二张" style="display:block;width:100%;height:auto;">
              </section>
            </section>
          </section>
          <section style="display:block;margin:8px 0 0;color:#888;text-align:center;">左右滑动查看图片</section>
        </section>
        <section style="display:block;box-sizing:border-box;width:100%;max-width:100%;overflow-x: scroll;overflow-y:hidden;-webkit-overflow-scrolling: touch;margin:16px 0;padding-bottom:10px;">
          <table style="width:770px;min-width:100%;"><tr><td style="white-space: nowrap;">很宽的表格内容</td></tr></table>
        </section>
      </section>
    `);

    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          paragraphs: ['降级正文'],
          imageIds: ['image-1', 'image-2'],
        },
      ],
    }, {
      imageRefs: [
        { id: 'image-1', src: 'https://example.com/a.png', alt: '第一张', caption: '第一张' },
        { id: 'image-2', src: 'https://example.com/b.png', alt: '第二张', caption: '第二张' },
      ],
      mode: 'draft',
      renderedSectionFragments,
    });
    const cleaned = cleanHtmlForDraft(html);

    expect(html).toContain('overflow-x:auto');
    expect(html).toContain('width:200%');
    expect(html).toContain('左右滑动查看图片');
    expect(html).toContain('overflow-x: scroll');
    expect(html).toContain('width:770px');
    expect(html.match(/https:\/\/example\.com\/a\.png/g) || []).toHaveLength(1);
    expect(html.match(/https:\/\/example\.com\/b\.png/g) || []).toHaveLength(1);
    expect(html).not.toContain('降级正文');
    expect(cleaned).toContain('overflow-x:auto');
    expect(cleaned).toContain('overflow-x: scroll');
  });

  it('should preserve rendered nested lists from the base preview and keep wechat draft cleanup compatibility', () => {
    const renderedSectionFragments = extractRenderedSectionFragments(`
      <section>
        <h2>第一部分</h2>
        <ul style="margin:12px 0 18px 20px;padding:0;">
          <li>
            <strong>父项：</strong> 说明
            <ul style="margin-left:20px;">
              <li>子项一</li>
              <li>
                子项二
                <ol style="margin-left:20px;">
                  <li>孙项</li>
                </ol>
              </li>
            </ul>
          </li>
        </ul>
      </section>
    `);

    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          paragraphs: ['降级正文'],
        },
      ],
    }, {
      imageRefs: [],
      mode: 'draft',
      renderedSectionFragments,
    });

    const cleaned = cleanHtmlForDraft(html);

    expect(html).toContain('父项');
    expect(html).toContain('子项一');
    expect(html).toContain('孙项');
    expect(html).not.toContain('降级正文');
    expect(cleaned).toContain('子项一');
    expect(cleaned).toContain('1. 孙项');
    expect(cleaned).not.toContain('margin-left:20px');
    expect(cleaned).toContain('margin: 0');
  });

  it('should remap preserved theme accent colors inside ai fragments to the active ai palette', () => {
    const renderedSectionFragments = extractRenderedSectionFragments(`
      <section>
        <h2>第一部分</h2>
        <p>普通正文里有 <strong style="font-weight:bold;color:#6f42c1;">强调文字</strong> 和 <a href="https://example.com" style="color:#6f42c1;text-decoration:none;border-bottom:1px dashed #6f42c1;">链接</a>。</p>
        <section style="margin:16px 0 16px 4px;border-left:3px solid #6f42c199;background:#6f42c11A;border-radius:3px;overflow:hidden;">
          <section style="display:flex;align-items:center;padding:8px 12px;background:#6f42c126;font-weight:bold;font-size:16px;color:#333;">
            <span style="margin-right:8px;">📌</span>
            <span>Tips</span>
          </section>
          <section style="padding:12px 16px;font-size:16px;line-height:1.8;color:#595959;">
            Callout 内容。
          </section>
        </section>
      </section>
    `);

    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          paragraphs: ['降级正文'],
        },
      ],
    }, {
      imageRefs: [],
      renderedSectionFragments,
    });

    expect(html).toContain('color: rgb(31, 79, 178);');
    expect(html).toContain('border-bottom: 1px dashed rgb(44, 107, 237);');
    expect(html).toContain('background: rgb(237, 244, 255);');
    expect(html).toContain('background: rgb(242, 246, 252);');
    expect(html).toContain('Callout 内容');
    expect(html).not.toContain('#6f42c1');
    expect(html).not.toContain('#6f42c199');
  });

  it('should trim trailing decorative separators from preserved rendered sections', () => {
    const renderedSectionFragments = extractRenderedSectionFragments(`
      <section>
        <h2>第一部分</h2>
        <p>正文。</p>
        <hr style="border:0;border-top:1px solid rgba(0,0,0,0.08);margin:40px 0;">
        <p>&nbsp;</p>
      </section>
    `);

    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          paragraphs: ['降级正文'],
        },
      ],
    }, {
      imageRefs: [],
      renderedSectionFragments,
    });

    expect(html).toContain('正文。');
    expect(html).not.toContain('<hr');
    expect(html).not.toContain('&nbsp;</p>');
    expect(html).not.toContain('降级正文');
  });

  it('should not duplicate the same image when preserved section html already contains it', () => {
    const renderedSectionFragments = extractRenderedSectionFragments(`
      <section>
        <h2>第一部分</h2>
        <p>正文。</p>
        <figure><img src="https://example.com/detail.png" alt="细节图"></figure>
      </section>
    `);

    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          imageIds: ['image-1'],
        },
      ],
    }, {
      imageRefs: [{ id: 'image-1', src: 'https://example.com/detail.png', alt: '细节图', caption: '细节图' }],
      renderedSectionFragments,
    });

    expect(html.match(/https:\/\/example\.com\/detail\.png/g) || []).toHaveLength(1);
  });

  it('should not duplicate a section image when the preserved subsection already contains it', () => {
    const renderedSectionFragments = extractRenderedSectionFragments(`
      <section>
        <h2>第一部分</h2>
        <p>正文。</p>
        <h3>子步骤</h3>
        <figure><img src="https://example.com/subsection.png" alt="子步骤配图"></figure>
      </section>
    `);

    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      stylePack: 'ocean-blue',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          imageIds: ['image-1'],
          subsections: [{ title: '子步骤', level: 3 }],
        },
      ],
    }, {
      imageRefs: [{ id: 'image-1', src: 'https://example.com/subsection.png', alt: '子步骤配图', caption: '子步骤配图' }],
      renderedSectionFragments,
    });

    expect(html.match(/https:\/\/example\.com\/subsection\.png/g) || []).toHaveLength(1);
  });

  it('should render subsection chrome differently across layout families', () => {
    const sourceHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'source-first',
        colorPalette: 'tech-green',
      },
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          paragraphs: ['这里是正文。'],
          subsections: [
            { title: '子节一', level: 3, paragraphs: ['补充说明。'], bulletGroups: [] },
          ],
        },
      ],
    });

    const tutorialHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          paragraphs: ['这里是正文。'],
          subsections: [
            { title: '子节一', level: 3, paragraphs: ['补充说明。'], bulletGroups: [] },
          ],
        },
      ],
    });

    const editorialHtml = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'graphite-rose',
      },
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          paragraphs: ['这里是正文。'],
          subsections: [
            { title: '子节一', level: 3, paragraphs: ['补充说明。'], bulletGroups: [] },
          ],
        },
      ],
    });

    expect(sourceHtml).toContain('Sub 01');
    expect(tutorialHtml).toContain('STEP 01');
    expect(editorialHtml).toContain('Scene 01');
    expect(tutorialHtml).toContain('background:#f6f9fd');
    expect(editorialHtml).toContain('border-top:1px dashed');
  });

  it('should derive a new color variant from an existing generated layout without rerunning ai', () => {
    const derivedState = deriveArticleLayoutStateForSelection({
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      selection: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'tech-green',
      },
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'tech-green',
      },
      recommendedLayoutFamily: 'editorial-lite',
      recommendedColorPalette: 'graphite-rose',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        layoutFamilyLabel: '轻杂志型',
        colorPaletteLabel: '科技绿',
        stylePackLabel: '科技绿',
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '经验复盘' }],
      },
      layoutJson: {
        articleType: 'article',
        selection: {
          layoutFamily: 'editorial-lite',
          colorPalette: 'tech-green',
        },
        resolved: {
          layoutFamily: 'editorial-lite',
          colorPalette: 'tech-green',
        },
        recommendedLayoutFamily: 'editorial-lite',
        recommendedColorPalette: 'graphite-rose',
        stylePack: 'tech-green',
        layoutFamily: 'editorial-lite',
        title: '经验复盘',
        summary: '这是一句摘要。',
        blocks: [
          { type: 'hero', title: '经验复盘' },
          { type: 'section-block', sectionIndex: 0, title: '第一部分' },
        ],
      },
    }, {
      layoutFamily: 'editorial-lite',
      colorPalette: 'graphite-rose',
    });

    expect(derivedState).toBeTruthy();
    expect(derivedState.selection.colorPalette).toBe('graphite-rose');
    expect(derivedState.resolved.colorPalette).toBe('graphite-rose');
    expect(derivedState.stylePack).toBe('graphite-rose');
    expect(derivedState.layoutJson.stylePack).toBe('graphite-rose');
    expect(derivedState.layoutJson.blocks).toHaveLength(2);
    expect(derivedState.generationMeta.colorPaletteLabel).toBe('石墨玫瑰');
  });

  it('should let auto selection reuse migrated legacy cache entries', () => {
    const now = Date.now();
    const migratedEntry = {
      lastSelectionKey: 'tutorial-cards::ocean-blue',
      selectionStates: {
        'tutorial-cards::tech-green': {
          version: 1,
          updatedAt: now - 1000,
          sourceHash: '123',
          stylePack: 'tech-green',
          status: 'ready',
          layoutJson: {
            articleType: 'tutorial',
            stylePack: 'tech-green',
            blocks: [{ type: 'hero', title: '历史缓存' }],
          },
        },
        'tutorial-cards::ocean-blue': {
          version: 1,
          updatedAt: now,
          sourceHash: '123',
          stylePack: 'ocean-blue',
          status: 'ready',
          layoutJson: {
            articleType: 'tutorial',
            stylePack: 'ocean-blue',
            blocks: [{ type: 'hero', title: '更新缓存' }],
          },
        },
      },
    };
    const normalizedEntry = normalizeArticleLayoutCacheEntry(migratedEntry);

    expect(getArticleLayoutSelectionState(migratedEntry, {
      layoutFamily: 'auto',
      colorPalette: 'auto',
    })?.layoutJson?.blocks?.[0]?.title).toBe('更新缓存');
    expect(getArticleLayoutSelectionState(migratedEntry, {
      layoutFamily: 'auto',
      colorPalette: 'tech-green',
    })?.stylePack).toBe('ocean-blue');
    expect(Object.keys(normalizedEntry.familyStates)).toEqual(['tutorial-cards']);
  });

  it('should keep schema-sized part nav, bullets and image ids during normalization', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        {
          type: 'part-nav',
          items: Array.from({ length: 6 }, (_, index) => ({
            label: `PART ${String(index + 1).padStart(2, '0')}`,
            text: `第 ${index + 1} 节`,
          })),
        },
        {
          type: 'case-block',
          caseLabel: 'CASE 01',
          title: '案例标题',
          bullets: Array.from({ length: 6 }, (_, index) => `要点 ${index + 1}`),
          imageIds: ['image-1', 'image-2', 'image-3', 'image-4'],
        },
      ],
    }, {
      title: '长导航测试',
      markdown: '## 第一节\n正文',
      stylePack: 'tech-green',
      imageRefs: [
        { id: 'image-1', src: 'https://example.com/1.png', alt: '1', caption: '1' },
        { id: 'image-2', src: 'https://example.com/2.png', alt: '2', caption: '2' },
        { id: 'image-3', src: 'https://example.com/3.png', alt: '3', caption: '3' },
        { id: 'image-4', src: 'https://example.com/4.png', alt: '4', caption: '4' },
      ],
    });

    const partNavBlock = layout.blocks.find((block) => block.type === 'part-nav');
    const caseBlock = layout.blocks.find((block) => block.type === 'case-block');

    expect(partNavBlock?.items).toHaveLength(6);
    expect(caseBlock?.bullets).toHaveLength(6);
    expect(caseBlock?.imageIds).toHaveLength(4);
  });

  it('should preserve more sections in fallback layout and avoid phone frame for normal images', () => {
    const layout = buildFallbackLayout({
      title: '标签入门',
      markdown: `
## 第一部分
第一段内容。

## 第二部分
第二段内容。

## 第三部分
第三段内容。

## 第四部分
第四段内容。
      `,
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.jpg', caption: '封面图', alt: '封面图' }],
    });

    expect(layout.blocks.filter((block) => block.type === 'section-block')).toHaveLength(4);
    expect(layout.blocks.some((block) => block.type === 'phone-frame')).toBe(false);
  });

  it('should keep fallback subsection-rich layouts valid against the shared schema contract', () => {
    const layout = buildFallbackLayout({
      title: '结构测试',
      selection: {
        layoutFamily: 'source-first',
        colorPalette: 'tech-green',
      },
      markdown: `
## 第一部分

### 子节一

第一段。

## 第二部分

第二段。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    const validation = validateAiLayoutPayload(layout);

    expect(validation.isValid).toBe(true);
    expect(validation.issueCount).toBe(0);
  });

  it('should keep later sections when ai output only covers the front half', () => {
    const markdown = Array.from({ length: 14 }, (_, index) => `## 第${index + 1}部分\n第${index + 1}段内容。`).join('\n\n');
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'hero', title: '长文测试' },
        { type: 'section-block', sectionIndex: 0 },
        { type: 'section-block', sectionIndex: 1 },
        { type: 'section-block', sectionIndex: 2 },
      ],
    }, {
      title: '长文测试',
      markdown,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    const sectionBlocks = layout.blocks.filter((block) => block.type === 'section-block');
    expect(sectionBlocks).toHaveLength(8);
    expect(sectionBlocks[7].subsections.some((item) => item.title === '第14部分')).toBe(true);
  });

  it('should not duplicate intro singleton blocks from fallback when ai already provides them', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'hero', title: '文章标题', subtitle: '导语' },
        { type: 'lead-quote', text: '一句重点摘要' },
      ],
    }, {
      title: '文章标题',
      markdown: `
## 第一部分
正文一。

## 第二部分
正文二。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    expect(layout.blocks.filter((block) => block.type === 'hero')).toHaveLength(1);
    expect(layout.blocks.filter((block) => block.type === 'lead-quote')).toHaveLength(1);
    expect(layout.blocks.filter((block) => block.type === 'part-nav')).toHaveLength(1);
  });

  it('should keep source section order before deferred ai tail blocks', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'hero', title: '文章标题', subtitle: '导语' },
        { type: 'lead-quote', text: '一句重点摘要' },
        { type: 'section-block', sectionIndex: 0 },
        { type: 'section-block', sectionIndex: 1 },
        { type: 'case-block', title: '今日挑战', summary: '补充练习' },
      ],
    }, {
      title: '文章标题',
      markdown: `
## 第一部分
正文一。

## 第二部分
正文二。

## 第三部分
正文三。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    const typesAndTitles = layout.blocks.map((block) => `${block.type}:${block.title || block.text || ''}`);
    expect(typesAndTitles.slice(0, 2)).toEqual([
      'hero:文章标题',
      'part-nav:',
    ]);
    expect(typesAndTitles[2]).toBe('lead-quote:一句重点摘要');
    expect(typesAndTitles[3]).toBe('section-block:第一部分');
    expect(typesAndTitles[4]).toBe('section-block:第二部分');
    expect(typesAndTitles[5]).toBe('section-block:第三部分');
    expect(typesAndTitles[6]).toBe('case-block:今日挑战');
  });

  it('should map ai case blocks back to source sections when titles match', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'case-block', title: '第二部分', summary: '模型摘要', bullets: ['模型要点'] },
      ],
    }, {
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是第一部分原文。

## 第二部分
这是第二部分原文。
- 原始要点
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    const mapped = layout.blocks.find((block) => block.type === 'section-block' && block.title === '第二部分');
    expect(mapped).toBeTruthy();
    expect(mapped.paragraphs.join(' ')).toContain('这是第二部分原文');
    expect(mapped.bulletGroups[0]).toContain('原始要点');
  });

  it('should keep generation meta when restoring cached article layouts', () => {
    const meta = normalizeLayoutGenerationMeta({
      providerName: 'DeepSeek',
      providerModel: 'deepseek-chat',
      sectionCount: 3,
      imageCount: 2,
      finalBlockCount: 4,
      fallbackBlockCount: 1,
      fallbackUsed: true,
      blockOrigins: [
        { index: 0, type: 'hero', source: 'ai', label: '封面卡' },
        { index: 1, type: 'cta-card', source: 'fallback', label: '收尾卡' },
      ],
    }, {
      blocks: [{ type: 'hero' }, { type: 'cta-card' }],
    });

    expect(meta.providerName).toBe('DeepSeek');
    expect(meta.fallbackUsed).toBe(true);
    expect(meta.blockOrigins[1].source).toBe('fallback');
  });

  it('should return generation meta and fallback info for sparse model output', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'lead-quote', text: '模型只给了一句摘要' },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是一段导语。

## 第二部分
这里是补充说明。
      `,
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/1.png', alt: '截图', caption: '截图' }],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.layoutJson.blocks.length).toBeGreaterThan(1);
    expect(result.generationMeta.providerName).toBe('测试 Provider');
    expect(result.generationMeta.imageCount).toBe(1);
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.generationMeta.blockOrigins.some((item) => item.source === 'fallback')).toBe(true);
  });

  it('should preserve schema validation warnings in generation meta', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'lead-quote', text: '模型给了一句摘要', extraField: 'should-warn' },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.generationMeta.schemaValidation.issueCount).toBeGreaterThan(0);
    expect(result.generationMeta.schemaValidation.fatal).toBe(false);
  });

  it('should infer missing block types from structured ai payloads', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { blockType: 'hero', title: '文章标题', subtitle: '导语' },
                  { blockType: 'lead-quote', text: '一句重点摘要' },
                  { blockType: 'section-block', sectionIndex: 0 },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这里是正文。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.layoutJson.blocks[0].type).toBe('hero');
    expect(result.layoutJson.blocks[1].type).toBe('lead-quote');
    expect(result.layoutJson.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(result.generationMeta.schemaValidation.issueCount).toBe(0);
  });

  it('should throw schema error when ai payload is fatally invalid', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'unknown-block' },
                ],
              }),
            },
          },
        ],
      }),
    });

    await expect(generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    })).rejects.toMatchObject({
      name: 'AiLayoutSchemaError',
      code: 'ai-layout-schema-invalid',
    });

    try {
      await generateArticleLayout({
        provider,
        title: 'AI 编排实践',
        markdown: '这是一段导语。',
        stylePack: 'tech-green',
        imageRefs: [],
        fetchImpl,
        timeoutMs: 2000,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AiLayoutSchemaError);
      expect(error.schemaValidation.fatal).toBe(true);
      expect(error.generationMeta.schemaValidation.issueCount).toBeGreaterThan(0);
    }
  });

  it('should truncate oversized markdown before sending provider request', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    let requestBody = null;
    const longMarkdown = `# 标题\n\n${'长内容 '.repeat(5000)}\n\n## 尾部\n${'收尾 '.repeat(1000)}`;
    const fetchImpl = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  articleType: 'tutorial',
                  stylePack: 'tech-green',
                  title: 'AI 编排实践',
                  summary: '一句摘要',
                  blocks: [
                    { type: 'lead-quote', text: '模型只给了一句摘要' },
                  ],
                }),
              },
            },
          ],
        }),
      };
    };

    await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: longMarkdown,
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    const userMessage = requestBody.messages[1].content;
    expect(userMessage.length).toBeLessThan(longMarkdown.length);
    expect(userMessage).toContain('内容已截断');
    expect(userMessage).toContain('原文如下');
  });

  it('should recover from raw control characters inside ai json strings', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const brokenJson = `{
  "articleType": "article",
  "selection": { "layoutFamily": "source-first", "colorPalette": "auto" },
  "resolved": { "layoutFamily": "source-first", "colorPalette": "tech-green" },
  "recommendedLayoutFamily": "source-first",
  "recommendedColorPalette": "tech-green",
  "title": "测试标题",
  "summary": "一句摘要",
  "blocks": [
    { "type": "lead-quote", "text": "第一行
第二行" }
  ]
}`;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${brokenJson}\n\`\`\``,
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: '测试标题',
      markdown: '## 第一部分\n这里是正文。',
      selection: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'auto',
      },
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    const quoteBlock = result.layoutJson.blocks.find((block) => block.type === 'lead-quote');
    expect(quoteBlock).toBeTruthy();
    expect(quoteBlock.text).toContain('第一行');
    expect(quoteBlock.text).toContain('第二行');
  });

  it('should fall back to local source-first layout when ai json stays malformed', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const brokenJson = `{
  "articleType": "article",
  "selection": { "layoutFamily": "source-first", "colorPalette": "auto" },
  "resolved": { "layoutFamily": "source-first", "colorPalette": "tech-green" },
  "recommendedLayoutFamily": "source-first",
  "recommendedColorPalette": "tech-green",
  "title": "测试标题",
  "summary": "一句摘要",
  "blocks": [
    { "type": "lead-quote", "text": "第一行\x00第二行" }
  ]`;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${brokenJson}\n\`\`\``,
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: '测试标题',
      markdown: '# 标题\n\n## 第一部分\n这里是正文。\n\n## 第二部分\n继续补充内容。',
      selection: {
        layoutFamily: 'source-first',
        colorPalette: 'auto',
      },
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.layoutJson.layoutFamily).toBe('source-first');
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.layoutJson.blocks.some((block) => block.type === 'section-block')).toBe(true);
  });

  it('should support gemini provider format', async () => {
    const provider = {
      id: 'g1',
      name: 'Gemini',
      kind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'secret',
      model: 'gemini-2.5-flash',
      enabled: true,
    };
    let request = null;
    const fetchImpl = vi.fn(async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      articleType: 'tutorial',
                      selection: { layoutFamily: 'tutorial-cards', colorPalette: 'tech-green' },
                      resolved: { layoutFamily: 'tutorial-cards', colorPalette: 'tech-green' },
                      recommendedLayoutFamily: 'tutorial-cards',
                      recommendedColorPalette: 'tech-green',
                      title: 'Gemini 测试',
                      summary: '一句摘要',
                      blocks: [{ type: 'lead-quote', text: 'Gemini 结果' }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const result = await generateArticleLayout({
      provider,
      title: 'Gemini 测试',
      markdown: '## 第一部分\n正文',
      imageRefs: [],
      timeoutMs: 2000,
      fetchImpl,
    });

    expect(request.url).toContain('/models/gemini-2.5-flash:generateContent');
    expect(request.options.headers['x-goog-api-key']).toBe('secret');
    expect(result.layoutJson.blocks.some((block) => block.type === 'lead-quote')).toBe(true);
  });

  it('should support anthropic provider format', async () => {
    const provider = {
      id: 'a1',
      name: 'Anthropic',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'secret',
      model: 'claude-3-5-haiku-latest',
      enabled: true,
    };
    let request = null;
    const fetchImpl = vi.fn(async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                articleType: 'tutorial',
                selection: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
                resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
                recommendedLayoutFamily: 'source-first',
                recommendedColorPalette: 'tech-green',
                title: 'Claude 测试',
                summary: '一句摘要',
                blocks: [{ type: 'lead-quote', text: 'Anthropic 结果' }],
              }),
            },
          ],
        }),
      };
    });

    const result = await generateArticleLayout({
      provider,
      title: 'Claude 测试',
      markdown: '## 第一部分\n正文',
      imageRefs: [],
      timeoutMs: 2000,
      fetchImpl,
    });

    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.options.headers['x-api-key']).toBe('secret');
    expect(request.options.headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(request.options.body).max_tokens).toBe(8192);
    expect(result.layoutJson.blocks[0].type).toBe('lead-quote');
  });

  it('should report a clear error when anthropic truncates output at max_tokens', async () => {
    const provider = {
      id: 'a1',
      name: 'Anthropic',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'secret',
      model: 'claude-3-5-haiku-latest',
      enabled: true,
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stop_reason: 'max_tokens',
        content: [
          {
            type: 'text',
            text: '{"articleType":"tutorial","blocks":[',
          },
        ],
      }),
    }));

    await expect(generateArticleLayout({
      provider,
      title: 'Claude 测试',
      markdown: '## 第一部分\n正文',
      imageRefs: [],
      timeoutMs: 2000,
      fetchImpl,
    })).rejects.toThrow('max_tokens 输出上限');
  });

  it('should convert aborted provider requests into timeout errors', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new Error('signal is aborted without reason'));
      }, { once: true });
    });

    await expect(generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 10,
    })).rejects.toMatchObject({
      name: 'AiLayoutTimeoutError',
      code: 'ai-layout-timeout',
      message: 'AI 请求超时（1s）',
    });

    try {
      await generateArticleLayout({
        provider,
        title: 'AI 编排实践',
        markdown: '这是一段导语。',
        stylePack: 'tech-green',
        imageRefs: [],
        fetchImpl,
        timeoutMs: 10,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AiLayoutTimeoutError);
      expect(error.timeoutMs).toBe(10);
    }
  });
});
