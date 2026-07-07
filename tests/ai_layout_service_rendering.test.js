/*
## 核心功能

覆盖 ai-layout service rendering 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护布局族渲染、草稿兼容、保留片段和特殊块渲染行为不回归。

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
  extractRenderedSectionFragments,
  buildFallbackLayout,
  renderArticleLayoutHtml,
} = require('../services/ai-layout');

describe('ai-layout service rendering', () => {
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
});
