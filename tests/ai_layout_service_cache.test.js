/*
## 核心功能

覆盖 ai-layout service cache and normalization 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护缓存选择、布局归一化、schema 校验和 generation meta 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 AI layout service 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, expect, it } from 'vitest';
const {
  validateAiLayoutPayload,
} = require('../services/ai-layout-skill-bundle');

const {
  buildFallbackLayout,
  normalizeArticleLayout,
  normalizeArticleLayoutCacheEntry,
  normalizeLayoutGenerationMeta,
  deriveArticleLayoutStateForSelection,
  getArticleLayoutSelectionState,
} = require('../services/ai-layout');

describe('ai-layout service cache and normalization', () => {
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
});
