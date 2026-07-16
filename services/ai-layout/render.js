/*
## 核心功能

实现 AI layout 服务的 render 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `normalizeWechatTaskMarkerText`、`escapeHtml`、`normalizeAiLayoutDisplayText`、`escapeAiLayoutText`、`normalizeInlineFontFamily`、`renderStyledText`、`renderEditorialDraftDivider`、`renderEditorialPreviewDivider`、`renderArticleLayoutHtml`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`../dom-utils.js`、`./constants.js`、`./catalog.js`、`./prompt-context.js`、`./utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import { createHtmlContainer } from '../dom-utils.js';
import { AI_WECHAT_SAFE_STYLE_PRIMITIVES } from './constants.js';
import { getLayoutFamilyById, getWechatSafeRenderProfile, resolveColorPaletteForRender } from './catalog.js';
import {
  formatCalloutLabel,
  normalizeTitleKey,
  remapPreservedFragmentColors,
} from './prompt-context.js';
import { coerceString, isRecord, toAiImageRefs, toAiLayoutBlocks, toRecord } from './utils.js';

/** @param {unknown} text @returns {string} */
function normalizeWechatTaskMarkerText(text) {
  return String(text || '').replace(
    /(^|\n)(\s*)\[([ xX])\]\s+/g,
    (_match, lineStart, indent, state) =>
      `${lineStart}${indent}${String(state || '').trim().toLowerCase() === 'x' ? '☑' : '☐'} `,
  );
}

/** @param {unknown} text @returns {string} */
function escapeHtml(text) {
  /** @type {Record<string, string>} */
  const replacements = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return normalizeWechatTaskMarkerText(text).replace(/[&<>"']/g, (char) => replacements[char] || char);
}

/** @param {unknown} text @returns {string} */
function normalizeAiLayoutDisplayText(text) {
  return String(text || '')
    .replace(/!\[\[[^[\]\r\n]+]]/g, '')
    .replace(/!\[[^\]\r\n]*]\([^) \r\n]+(?:\s+"[^"]*")?\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** @param {unknown} text @returns {string} */
function escapeAiLayoutText(text) {
  return escapeHtml(normalizeAiLayoutDisplayText(text));
}

/** @param {unknown} fontFamily @returns {string} */
function normalizeInlineFontFamily(fontFamily = '') {
  return String(fontFamily || '').replace(/"/g, '\'');
}

/** @param {string} tagName @param {unknown} text @param {string} style @param {{ mode?: string }} options @returns {string} */
function renderStyledText(tagName, text, style, { mode = 'preview' } = {}) {
  if (text === undefined || text === null || text === '') return '';
  const actualTagName = mode === 'draft' && /^h[1-6]$/i.test(tagName) ? 'p' : tagName;
  return `<${actualTagName} style="${style}">${escapeHtml(text)}</${actualTagName}>`;
}

/** @param {AiColorTokens} tokens @returns {string} */
function renderEditorialDraftDivider(tokens) {
  return `<section style="margin:24px 0 0;padding:0;font-size:0;line-height:0;overflow:hidden;">
    <section style="width:100%;height:1px;background:${tokens.border};font-size:0;line-height:0;overflow:hidden;">
      <span style="display:block;width:48px;height:1px;background:${tokens.accent};font-size:0;line-height:0;overflow:hidden;">&nbsp;</span>
    </section>
  </section>`;
}

/** @param {AiColorTokens} tokens @returns {string} */
function renderEditorialPreviewDivider(tokens) {
  return `<div style="margin-top:24px;font-size:0;line-height:0;overflow:hidden;">
    <div style="width:100%;height:1px;background:${tokens.border};font-size:0;line-height:0;overflow:hidden;">
      <span style="display:block;width:48px;height:1px;background:${tokens.accent};font-size:0;line-height:0;overflow:hidden;">&nbsp;</span>
    </div>
  </div>`;
}

/** @param {unknown} layout @param {{ imageRefs?: unknown, mode?: string, renderedSectionFragments?: unknown, colorPaletteOverride?: Record<string, unknown> | null }} options @returns {string} */
function renderArticleLayoutHtml(layout, { imageRefs = [], mode = 'preview', renderedSectionFragments = null, colorPaletteOverride = null } = {}) {
  const layoutRecord = toRecord(layout);
  const layoutJson = /** @type {AiLayoutJsonLike} */ (toRecord(layoutRecord.layoutJson || layoutRecord));
  const layoutFamily = getLayoutFamilyById(layoutJson.resolved?.layoutFamily || layoutJson.layoutFamily);
  const colorPalette = /** @type {AiLayoutColorPalette} */ (resolveColorPaletteForRender(
    layoutJson.resolved?.colorPalette || layoutJson.stylePack,
    colorPaletteOverride
  ));
  const tokens = /** @type {AiColorTokens} */ (colorPalette.tokens || {});
  const renderProfile = getWechatSafeRenderProfile(layoutFamily.id);
  const typography = toRecord(AI_WECHAT_SAFE_STYLE_PRIMITIVES.typography);
  const sectionLabelPrefix = AI_WECHAT_SAFE_STYLE_PRIMITIVES.sectionLabels?.[layoutFamily.id] || 'SECTION';
  const isSourceFirst = layoutFamily.id === 'source-first';
  const isTutorialCards = layoutFamily.id === 'tutorial-cards';
  const isEditorialLite = layoutFamily.id === 'editorial-lite';
  const isDraft = mode === 'draft';
  const editorialDisplayFont = normalizeInlineFontFamily(
    typography.editorialDisplayFont || 'Georgia,"Times New Roman","Songti SC","Noto Serif SC",serif'
  );
  const bodyFontFamily = normalizeInlineFontFamily(
    typography.bodyFontFamily || '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
  );
  const safeImageRefs = toAiImageRefs(imageRefs);
  const imageMap = new Map(safeImageRefs.map((image) => [coerceString(image.id), image]));
  const renderedSectionContainer = isRecord(renderedSectionFragments)
    ? /** @type {{ sections?: RenderedSectionFragmentLike[] }} */ (toRecord(renderedSectionFragments))
    : {};
  /** @type {RenderedSectionFragmentLike[]} */
  const renderedSections = Array.isArray(renderedSectionContainer.sections)
    ? renderedSectionContainer.sections
    : [];
  /** @type {Map<string, RenderedSectionFragmentLike>} */
  const renderedSectionByTitle = new Map(renderedSections.map((section) => [normalizeTitleKey(section?.title || ''), section]));
  const tutorialSpacing = isTutorialCards
    ? (isDraft
      ? {
        wrapperPadding: '12px 4px 10px',
        cardPadding: '10px',
        cardMargin: 8,
        bodyParagraphGap: 12,
        heroPadding: '12px',
        leadQuoteMarginY: 8,
        leadQuotePadding: '10px',
        sectionMarginY: 10,
        sectionCardPadding: '10px',
        subsectionSpacingTop: 6,
        subsectionCardPadding: '18px 24px 16px',
      }
      : {
        wrapperPadding: '22px 16px 30px',
        cardPadding: '18px',
        cardMargin: 16,
        bodyParagraphGap: 18,
        heroPadding: '20px',
        leadQuoteMarginY: 16,
        leadQuotePadding: '18px',
        sectionMarginY: 22,
        sectionCardPadding: '18px',
        subsectionSpacingTop: 16,
        subsectionCardPadding: '14px 16px 12px',
      })
    : null;
  const bodyFontSize = Number(typography.bodyFontSize || 16);
  const bodyLineHeight = Number(typography.bodyLineHeight || 1.8);
  const bodyParagraphGap = tutorialSpacing?.bodyParagraphGap || Number(typography.paragraphGap || 20);
  const sharedImageRadius = Number(AI_WECHAT_SAFE_STYLE_PRIMITIVES.image?.borderRadius || 14);
  const wrapperPadding = isTutorialCards
    ? tutorialSpacing.wrapperPadding
    : (renderProfile.wrapperPadding || (isEditorialLite ? '30px 22px 40px' : '20px 16px 28px'));
  const cardRadius = Number(renderProfile.cardRadius ?? (isSourceFirst ? 10 : (isEditorialLite ? 0 : 18)));
  const cardPadding = isTutorialCards
    ? tutorialSpacing.cardPadding
    : (renderProfile.cardPadding ?? (isSourceFirst ? '0' : (isEditorialLite ? '0' : '18px')));
  const cardMargin = isTutorialCards
    ? tutorialSpacing.cardMargin
    : Number(renderProfile.cardMargin ?? (isSourceFirst ? 8 : (isEditorialLite ? 30 : 18)));
  const cardShadow = isDraft
    ? 'none'
    : (renderProfile.cardShadow ?? (isTutorialCards ? '0 10px 30px -24px rgba(0,0,0,0.18)' : 'none'));
  const heroProfile = toRecord(renderProfile.hero);
  const partNavProfile = toRecord(renderProfile.partNav);
  const leadQuoteProfile = toRecord(renderProfile.leadQuote);
  const caseBlockProfile = toRecord(renderProfile.caseBlock);
  const subsectionProfile = toRecord(renderProfile.subsection);
  const wrapperStyle = [
    `font-family:${bodyFontFamily}`,
    `color:${tokens.text}`,
    `font-size:${bodyFontSize}px`,
    `line-height:${bodyLineHeight}`,
    `letter-spacing:${typography.letterSpacing || '0'}`,
    `padding:${wrapperPadding}`,
    `background:${tokens.surface}`,
  ].join(';');

  const cardStyle = [
    `background:${tokens.surface}`,
    `border:1px solid ${tokens.border}`,
    `border-radius:${cardRadius}px`,
    `padding:${cardPadding}`,
    `margin:${cardMargin}px 0`,
    `box-shadow:${cardShadow}`,
  ].join(';');
  const ctaCardPadding = isTutorialCards
    ? (isDraft ? '14px 14px 12px' : '18px 18px 16px')
    : (isEditorialLite
      ? (isDraft ? '16px 18px 14px' : '18px 20px 16px')
      : (isSourceFirst ? '14px 14px 12px' : '16px 16px 14px'));

  /**
   * @param {unknown} imageId
   * @param {string} [extraStyle='']
   * @returns {string}
   */
  const renderImage = (imageId, extraStyle = '') => {
    const image = imageMap.get(imageId);
    if (!image) return '';
    const style = [
      'display:block',
      'width:100%',
      'height:auto',
      `border-radius:${sharedImageRadius}px`,
      extraStyle,
    ].filter(Boolean).join(';');
    return `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || image.caption)}" style="${style}">`;
  };

  /**
   * @param {unknown} html
   * @returns {Set<string>}
   */
  const collectImageSrcsFromHtml = (html = '') => {
    const normalizedHtml = coerceString(html);
    if (!normalizedHtml) return new Set();
    const container = createHtmlContainer('div', normalizedHtml);
    if (!container) return new Set();
    return new Set(
      Array.from(container.querySelectorAll('img'))
        .map((img) => {
          const imageElement = /** @type {HTMLImageElement} */ (img);
          return coerceString(imageElement.getAttribute('src') || imageElement.src);
        })
        .filter(Boolean)
    );
  };

  /** @param {RenderedSectionFragmentLike | null | undefined} [sectionFragment=null] */
  const collectImageSrcsFromRenderedSection = (sectionFragment = null) => {
    /** @type {Set<string>} */
    const allSrcs = new Set();
    collectImageSrcsFromHtml(sectionFragment?.leadHtml).forEach((src) => allSrcs.add(src));
    const subsectionFragments = Array.isArray(sectionFragment?.subsections) ? sectionFragment.subsections : [];
    subsectionFragments.forEach((subsection) => {
      collectImageSrcsFromHtml(subsection?.contentHtml).forEach((src) => allSrcs.add(src));
    });
    return allSrcs;
  };

  /**
   * @param {AiLayoutBlockLike} [block={}]
   * @returns {RenderedSectionFragmentLike | null}
   */
  const findRenderedSection = (block = {}) => {
    if (Number.isInteger(block.sectionIndex) && block.sectionIndex >= 0 && renderedSections[block.sectionIndex]) {
      const renderedSection = /** @type {RenderedSectionFragmentLike | undefined} */ (renderedSections.at(block.sectionIndex));
      return renderedSection || null;
    }
    return renderedSectionByTitle.get(normalizeTitleKey(block.title || '')) || null;
  };

  /**
   * @param {RenderedSectionFragmentLike | null | undefined} sectionFragment
   * @param {AiLayoutSubsectionLike} [subsection={}]
   * @param {number} [subsectionIndex=0]
   */
  const findRenderedSubsection = (sectionFragment, subsection = {}, subsectionIndex = 0) => {
    const candidates = Array.isArray(sectionFragment?.subsections) ? sectionFragment.subsections : [];
    const titleKey = normalizeTitleKey(subsection?.title || '');
    if (titleKey) {
      const matched = candidates.find((item) => item.titleKey === titleKey);
      if (matched) return matched;
    }
    return candidates[subsectionIndex] || null;
  };

  /**
   * @param {AiLayoutCalloutLike} [callout={}]
   * @param {{ compact?: boolean }} [options={}]
   * @returns {string}
   */
  const renderCalloutCard = (callout = {}, { compact = false } = {}) => {
    const label = coerceString(callout?.title || formatCalloutLabel(callout?.type));
    const body = coerceString(callout?.body);
    if (!label && !body) return '';
    const chipHtml = label
      ? `<div style="margin-bottom:${compact ? 8 : 10}px;">
          <span style="display:inline-block;padding:${compact ? '3px 8px' : '4px 10px'};border-radius:999px;background:${tokens.accentSoft};font-size:10px;font-weight:700;letter-spacing:0.8px;color:${tokens.accentDeep};text-transform:uppercase;">${escapeHtml(label)}</span>
        </div>`
      : '';
    return `<section style="margin:${compact ? '10px 0 16px' : '14px 0 20px'};padding:${compact ? '12px 12px 10px' : '14px 14px 12px'};border:1px solid ${tokens.border};border-left:${compact ? 3 : 4}px solid ${tokens.accent};border-radius:${compact ? 12 : 14}px;background:${isDraft && isTutorialCards ? tokens.surface : tokens.accentSoft};">
      ${chipHtml}
      ${body ? `<p style="margin:0;color:${tokens.text};font-size:${compact ? bodyFontSize : Math.max(bodyFontSize, 15)}px;line-height:${bodyLineHeight};font-weight:${compact ? 500 : 600};letter-spacing:0;">${escapeAiLayoutText(body)}</p>` : ''}
    </section>`;
  };

  const layoutBlocks = toAiLayoutBlocks(layoutJson.blocks);
  const blocksHtml = layoutBlocks.map((block, index) => {
    const previousBlock = layoutBlocks[index - 1] || null;
    const nextBlock = layoutBlocks[index + 1] || null;
    if (block.type === 'hero') {
      const heroImageStyle = isDraft
        ? (isTutorialCards
          ? `width:100%;max-width:none;height:100%;object-fit:cover;border-radius:${heroProfile.imageRadius || 12}px;`
          : `width:100%;max-width:none;border-radius:${heroProfile.imageRadius || (isEditorialLite ? 28 : 18)}px;`)
        : (isEditorialLite
          ? `width:100%;max-width:none;flex:none;border-radius:${heroProfile.imageRadius || 28}px;`
          : (isSourceFirst
            ? `max-width:none;width:100%;flex:none;border-radius:${heroProfile.imageRadius || 18}px;`
            : `max-width:116px;flex:0 0 116px;border-radius:${heroProfile.imageRadius || 18}px;`));
      const imageHtml = block.coverImageId ? renderImage(block.coverImageId, heroImageStyle) : '';
      const contentHtml = [
        block.eyebrow ? `<div style="font-size:${heroProfile.eyebrowSize || (isEditorialLite ? 10 : 11)}px;font-weight:700;letter-spacing:${heroProfile.eyebrowLetterSpacing || (isEditorialLite ? 2 : 1.2)}px;color:${tokens.accentDeep};text-transform:uppercase;margin-bottom:${isSourceFirst ? 8 : 10}px;">${escapeHtml(block.eyebrow)}</div>` : '',
        renderStyledText(
          'h1',
          block.title,
          `margin:0 0 ${isSourceFirst ? 6 : (isEditorialLite ? 14 : 10)}px;font-size:${heroProfile.titleSize || (isSourceFirst ? 26 : (isEditorialLite ? 36 : 28))}px;line-height:${isEditorialLite ? 1.12 : 1.24};color:${tokens.text};font-weight:${isEditorialLite ? 700 : 700};font-family:${isEditorialLite ? editorialDisplayFont : 'inherit'};`,
          { mode }
        ),
        block.subtitle ? `<p style="margin:0;color:${tokens.muted};font-size:${heroProfile.subtitleSize || (isSourceFirst ? 16 : (isEditorialLite ? 17 : 14))}px;line-height:${heroProfile.subtitleLineHeight || (isSourceFirst ? 1.8 : (isEditorialLite ? 1.88 : 1.7))};letter-spacing:0;">${escapeHtml(block.subtitle)}</p>` : '',
      ].join('');
      const flexDirection = block.variant === 'cover-left' ? 'row-reverse' : 'row';
      const heroFooter = isDraft
        ? (heroProfile.footerMode === 'editorial-divider'
          ? ((isEditorialLite && nextBlock?.type === 'part-nav')
            ? renderEditorialDraftDivider(tokens)
            : `<p style="margin:24px 0 0;height:1px;background:${tokens.border};border-radius:999px;font-size:0;line-height:0;overflow:hidden;">&nbsp;</p>`)
          : `<p style="margin:18px 0 0;height:${heroProfile.footerMode === 'accent-bar' ? 10 : 1}px;background:${heroProfile.footerMode === 'accent-bar' ? tokens.accent : tokens.border};border-radius:999px;font-size:0;line-height:0;overflow:hidden;">&nbsp;</p>`)
        : (heroProfile.footerMode === 'editorial-divider'
          ? renderEditorialPreviewDivider(tokens)
          : (heroProfile.footerMode === 'divider'
            ? `<div style="height:1px;margin-top:18px;background:${tokens.border};border-radius:999px;"></div>`
            : `<div style="height:10px;margin-top:18px;background:${tokens.accent};border-radius:999px;"></div>`));
      if (isDraft) {
        if (isTutorialCards) {
          const heroThumbHtml = imageHtml
            ? `<div style="width:112px;height:112px;padding:6px;border-radius:18px;background:linear-gradient(135deg, ${tokens.accentDeep} 0%, ${tokens.accent} 60%, ${tokens.accentSoft} 100%);box-sizing:border-box;">
                ${imageHtml}
              </div>`
            : '';
          const heroBodyHtml = heroThumbHtml
            ? `<section style="display:flex;align-items:center;${block.variant === 'cover-left' ? 'flex-direction:row-reverse;' : ''}">
                <section style="flex:1;min-width:0;${block.variant === 'cover-left' ? 'padding-left:16px;' : 'padding-right:16px;'}">${contentHtml}</section>
                <section style="flex-shrink:0;width:124px;">${heroThumbHtml}</section>
              </section>`
            : `<div>${contentHtml}</div>`;
          return `<section style="${cardStyle};padding:${tutorialSpacing?.heroPadding || '16px'};background:${tokens.surfaceSoft};overflow:hidden;">
            ${heroBodyHtml}
            ${heroFooter}
          </section>`;
        }
        const draftHeroStyle = isTutorialCards
          ? `${cardStyle};padding:14px;background:${tokens.surfaceSoft};`
          : `margin:${isEditorialLite ? '4px 0 34px' : '2px 0 24px'};`;
        return `<section style="${draftHeroStyle}">
          <div>${contentHtml}</div>
          ${imageHtml ? `<div style="margin-top:14px;">${imageHtml}</div>` : ''}
          ${heroFooter}
        </section>`;
      }
      if (isEditorialLite) {
        return `<section style="margin:4px 0 34px;">
          <div style="max-width:680px;">${contentHtml}</div>
          ${imageHtml ? `<div style="margin-top:20px;">${imageHtml}</div>` : ''}
          ${heroFooter}
        </section>`;
      }
      if (isSourceFirst) {
        return `<section style="margin:2px 0 24px;">
          ${imageHtml ? `<div style="margin-bottom:14px;">${imageHtml}</div>` : ''}
          <div style="max-width:720px;">${contentHtml}</div>
          ${heroFooter}
        </section>`;
      }
      return `<section style="${cardStyle};padding:${isTutorialCards ? tutorialSpacing?.heroPadding || '18px' : '22px'};background:linear-gradient(180deg, ${tokens.surfaceSoft} 0%, ${tokens.surface} 100%);">
        <div style="display:flex;flex-direction:${flexDirection};gap:16px;align-items:center;">
          <div style="flex:1 1 auto;min-width:0;">${contentHtml}</div>
          ${imageHtml}
        </div>
        ${heroFooter}
      </section>`;
    }

    if (block.type === 'part-nav') {
      if (isDraft) {
        if (isTutorialCards) {
          const navHintHtml = `<p style="margin:0 2px 6px 0;font-size:11px;line-height:1.5;color:${tokens.muted};text-align:right;">← 左右滑动</p>`;
          const itemsHtml = block.items.map((item, itemIndex) => `
            <section style="display:inline-block;white-space:normal;vertical-align:top;width:${partNavProfile.cardWidth || 112}px;height:${partNavProfile.cardHeight || 116}px;padding:10px 10px 12px;margin-right:${itemIndex === block.items.length - 1 ? 0 : 8}px;border:1px solid ${tokens.border};border-radius:${partNavProfile.useCard ? 16 : 12}px;background:${partNavProfile.useCard ? tokens.surfaceSoft : tokens.surface};box-sizing:border-box;overflow:hidden;">
              <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:${tokens.accentDeep};letter-spacing:0.8px;text-transform:uppercase;">${escapeHtml(item.label)}</p>
              <p style="margin:0;height:60px;overflow:hidden;font-size:13px;font-weight:600;color:${tokens.text};line-height:1.55;">${escapeHtml(item.text)}</p>
            </section>
          `).join('');
          return `<section style="margin:${isEditorialLite ? 20 : (isSourceFirst ? 20 : 10)}px 0 ${isSourceFirst ? 18 : 4}px;">
            ${navHintHtml}
            <section style="overflow-x:scroll;-webkit-overflow-scrolling:touch;white-space:nowrap;padding-bottom:8px;">
              ${itemsHtml}
            </section>
          </section>`;
        }
        if (isEditorialLite) {
          const itemsHtml = block.items.map((item) => `
            <section style="padding:14px 0 16px;border-bottom:1px solid ${tokens.border};">
              <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:1.2px;color:${tokens.accentDeep};text-transform:uppercase;">${escapeHtml(item.label)}</p>
              <p style="margin:0;font-size:17px;font-weight:500;line-height:1.72;color:${tokens.text};font-family:${editorialDisplayFont};">${escapeHtml(item.text)}</p>
            </section>
          `).join('');
          return `<section style="margin:14px 0 8px;">
            <section>
              ${itemsHtml}
            </section>
          </section>`;
        }
        const itemsHtml = block.items.map((item, itemIndex) => `
          <div style="margin:${itemIndex === 0 ? 0 : 8}px 0 0;padding:12px 12px;border:1px solid ${tokens.border};border-radius:${partNavProfile.useCard ? 14 : 10}px;background:${partNavProfile.useCard ? tokens.surfaceSoft : tokens.surface};">
            <div style="font-size:10px;font-weight:700;color:${tokens.accentDeep};letter-spacing:${isEditorialLite ? 1.2 : 0.8}px;text-transform:uppercase;">${escapeHtml(item.label)}</div>
            <div style="margin-top:8px;font-size:${isSourceFirst ? 14 : (isEditorialLite ? 17 : 13)}px;font-weight:${isSourceFirst ? 500 : (isEditorialLite ? 500 : 600)};color:${tokens.text};line-height:${isEditorialLite ? 1.72 : 1.55};font-family:${isEditorialLite ? editorialDisplayFont : 'inherit'};">${escapeHtml(item.text)}</div>
          </div>
        `).join('');
        return `<section style="margin:${isEditorialLite ? 20 : (isSourceFirst ? 20 : 16)}px 0 ${isSourceFirst ? 18 : 8}px;">
          <div>${itemsHtml}</div>
        </section>`;
      }
      const itemsHtml = block.items.map((item) => `
        <div style="flex:${partNavProfile.direction === 'column' ? '1 1 100%' : (isEditorialLite ? '1 1 100%' : '1 1 0')};min-width:0;padding:${isSourceFirst ? '0 0 0 0' : (isEditorialLite ? '14px 0' : '12px 10px')};border:${partNavProfile.useCard ? `1px solid ${tokens.border}` : 'none'};border-radius:${partNavProfile.useCard ? 14 : 0}px;background:${partNavProfile.useCard ? tokens.surfaceSoft : 'transparent'};border-bottom:${partNavProfile.useDivider ? `1px solid ${tokens.border}` : 'none'};">
          <div style="font-size:10px;font-weight:700;color:${tokens.accentDeep};letter-spacing:${isEditorialLite ? 1.2 : 0.8}px;text-transform:uppercase;">${escapeHtml(item.label)}</div>
          <div style="margin-top:8px;font-size:${isSourceFirst ? 14 : (isEditorialLite ? 17 : 13)}px;font-weight:${isSourceFirst ? 500 : (isEditorialLite ? 500 : 600)};color:${tokens.text};line-height:${isEditorialLite ? 1.72 : 1.55};font-family:${isEditorialLite ? editorialDisplayFont : 'inherit'};">${escapeHtml(item.text)}</div>
        </div>
      `).join('');
      return `<section style="margin:${isEditorialLite ? 20 : (isSourceFirst ? 20 : 16)}px 0 ${isSourceFirst ? 18 : 8}px;">
        <div style="display:flex;gap:${partNavProfile.gap || (isSourceFirst ? 16 : 10)}px;flex-wrap:wrap;${partNavProfile.useDivider && isSourceFirst ? `padding:0 0 10px;border-bottom:1px solid ${tokens.border};` : ''}${partNavProfile.direction === 'column' ? 'flex-direction:column;' : ''}">${itemsHtml}</div>
      </section>`;
    }

    if (block.type === 'lead-quote') {
      const leadQuoteFontSize = leadQuoteProfile.fontSize || (isSourceFirst ? 16 : (isEditorialLite ? 26 : (isDraft && isTutorialCards ? 20 : 18)));
      const editorialLeadQuoteBorderTop = isEditorialLite && previousBlock?.type !== 'part-nav'
        ? `1px solid ${tokens.border}`
        : 'none';
      return `<section style="margin:${isSourceFirst ? 14 : (isEditorialLite ? 26 : (isTutorialCards ? tutorialSpacing?.leadQuoteMarginY || 14 : 18))}px 0;padding:${isSourceFirst ? '0 0 0 14px' : (isEditorialLite ? '24px 0' : (isTutorialCards ? tutorialSpacing?.leadQuotePadding || '14px' : '18px'))};border-radius:${isTutorialCards ? 16 : 0}px;background:${leadQuoteProfile.background === 'quoteBg' ? tokens.quoteBg : 'transparent'};border:${isTutorialCards ? `1px solid ${tokens.border}` : 'none'};border-left:${leadQuoteProfile.borderLeft ? `3px solid ${tokens.accent}` : 'none'};border-top:${editorialLeadQuoteBorderTop};border-bottom:${isEditorialLite ? `1px solid ${tokens.border}` : 'none'};">
        <p style="margin:0;font-size:${leadQuoteFontSize}px;font-weight:${leadQuoteProfile.fontWeight || (isSourceFirst ? 600 : (isEditorialLite ? 600 : 700))};line-height:${isEditorialLite ? 1.7 : 1.75};color:${tokens.text};font-family:${isEditorialLite ? editorialDisplayFont : 'inherit'};letter-spacing:0;">${escapeAiLayoutText(block.text)}</p>
        ${block.note ? `<p style="margin:${isTutorialCards ? 8 : 10}px 0 0;font-size:${isTutorialCards ? 13 : 12}px;line-height:1.8;color:${tokens.muted};letter-spacing:0;">${escapeAiLayoutText(block.note)}</p>` : ''}
      </section>`;
    }

    if (block.type === 'case-block') {
      const caseImageIds = Array.isArray(block.imageIds) ? block.imageIds : [];
      const caseBullets = Array.isArray(block.bullets) ? block.bullets : [];
      const imagesHtml = caseImageIds.map((imageId) => `<div style="margin-top:14px;">${renderImage(imageId)}</div>`).join('');
      const bulletsHtml = caseBullets.length
        ? `<ul style="margin:12px 0 0 18px;padding:0;color:${tokens.text};">${caseBullets.map((bullet) => `<li style="margin:6px 0;">${escapeAiLayoutText(bullet)}</li>`).join('')}</ul>`
        : '';
      const caseHeaderHtml = isDraft
        ? `<div style="margin-bottom:8px;">
            <span style="display:inline-block;font-size:${caseBlockProfile.indexSize || (isSourceFirst ? 22 : (isEditorialLite ? 14 : 28))}px;font-weight:${isEditorialLite ? 700 : 800};color:${tokens.accent};line-height:1;letter-spacing:${isEditorialLite ? 1.2 : 0};text-transform:${isEditorialLite ? 'uppercase' : 'none'};">${String(index + 1).padStart(2, '0')}</span>
            <span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:700;letter-spacing:1px;color:${tokens.muted};text-transform:uppercase;">${escapeHtml(block.caseLabel)}</span>
          </div>`
        : `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="font-size:${caseBlockProfile.indexSize || (isSourceFirst ? 22 : (isEditorialLite ? 14 : 28))}px;font-weight:${isEditorialLite ? 700 : 800};color:${tokens.accent};line-height:1;letter-spacing:${isEditorialLite ? 1.2 : 0};text-transform:${isEditorialLite ? 'uppercase' : 'none'};">${String(index + 1).padStart(2, '0')}</div>
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${tokens.muted};text-transform:uppercase;">${escapeHtml(block.caseLabel)}</div>
          </div>`;
      return `<section style="margin:${isSourceFirst ? 22 : (isEditorialLite ? 32 : (isTutorialCards ? tutorialSpacing?.sectionMarginY || 18 : 26))}px 0;${caseBlockProfile.useCard ? `padding:${isTutorialCards ? tutorialSpacing?.sectionCardPadding || '14px' : '18px'};border:1px solid ${tokens.border};border-radius:${cardRadius}px;background:${tokens.surfaceSoft};` : ''}">
        ${caseHeaderHtml}
        ${renderStyledText(
          'h2',
          block.title,
          `margin:0 0 ${isEditorialLite ? 10 : 8}px;font-size:${caseBlockProfile.titleSize || (isSourceFirst ? 20 : (isEditorialLite ? 26 : 22))}px;line-height:${isEditorialLite ? 1.28 : 1.4};color:${tokens.text};font-family:${isEditorialLite ? editorialDisplayFont : 'inherit'};`,
          { mode }
        )}
        ${block.summary ? `<p style="margin:0 0 ${bodyParagraphGap}px;color:${tokens.muted};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${escapeAiLayoutText(block.summary)}</p>` : ''}
        ${block.highlight ? `<div style="margin-top:12px;padding:10px 12px;border-left:4px solid ${tokens.accent};background:${tokens.accentSoft};border-radius:10px;color:${tokens.accentDeep};font-weight:600;font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${escapeAiLayoutText(block.highlight)}</div>` : ''}
        ${bulletsHtml}
        ${imagesHtml}
      </section>`;
    }

    if (block.type === 'section-block') {
      const renderedSection = findRenderedSection(block);
      const numericSectionIndex = Number.isInteger(block.sectionIndex) ? Number(block.sectionIndex) : -1;
      const sectionDisplayIndex = numericSectionIndex >= 0
        ? numericSectionIndex + 1
        : index + 1;
      const headingLevel = Number.isInteger(block.headingLevel) ? block.headingLevel : 2;
      const titleFontSize = headingLevel >= 3 ? (isSourceFirst ? 17 : (isEditorialLite ? 18 : 18)) : (isSourceFirst ? 20 : (isEditorialLite ? 26 : 22));
      const titleMarginBottom = headingLevel >= 3 ? 10 : (isEditorialLite ? 14 : 12);
      const titleColor = headingLevel >= 3 ? tokens.accentDeep : tokens.text;
      const paragraphsHtml = Array.isArray(block.paragraphs)
        ? block.paragraphs.map((paragraph) => `<p style="margin:0 0 ${bodyParagraphGap}px;color:${tokens.text};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${escapeAiLayoutText(paragraph)}</p>`).join('')
        : '';
      const bulletGroupsHtml = Array.isArray(block.bulletGroups)
        ? block.bulletGroups.map((group) => {
          if (!Array.isArray(group) || !group.length) return '';
          return `<ul style="margin:12px 0 ${bodyParagraphGap}px 20px;padding:0;color:${tokens.text};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${group.map((bullet) => `<li style="margin:4px 0;">${escapeAiLayoutText(bullet)}</li>`).join('')}</ul>`;
        }).join('')
        : '';
      const calloutsHtml = Array.isArray(block.callouts)
        ? block.callouts.map((callout) => renderCalloutCard(callout)).join('')
        : '';
      const preservedLeadHtml = remapPreservedFragmentColors(renderedSection?.leadHtml, tokens);
      const preservedSectionImageSrcs = collectImageSrcsFromRenderedSection(renderedSection);
      const uniqueImageIds = Array.isArray(block.imageIds)
        ? block.imageIds.filter((imageId) => {
          const imageSrc = coerceString(imageMap.get(imageId)?.src);
          return imageSrc && !preservedSectionImageSrcs.has(imageSrc);
        })
        : [];
      const imagesHtml = uniqueImageIds.map((imageId) => `<div style="margin-top:14px;">${renderImage(imageId)}</div>`).join('');
      const subsectionsHtml = Array.isArray(block.subsections)
        ? block.subsections.map((subsection, subsectionIndex) => {
          const renderedSubsection = /** @type {RenderedSubsectionFragmentLike | null} */ (findRenderedSubsection(renderedSection, subsection, subsectionIndex));
          const subsectionLevel = Number.isInteger(subsection?.level) ? subsection.level : 3;
          const subsectionParagraphs = Array.isArray(subsection?.paragraphs)
            ? subsection.paragraphs.map((paragraph) => `<p style="margin:0 0 ${bodyParagraphGap}px;color:${tokens.text};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${escapeAiLayoutText(paragraph)}</p>`).join('')
            : '';
          const subsectionBullets = Array.isArray(subsection?.bulletGroups)
            ? subsection.bulletGroups.map((group) => {
              if (!Array.isArray(group) || !group.length) return '';
              return `<ul style="margin:10px 0 ${bodyParagraphGap}px 20px;padding:0;color:${tokens.text};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${group.map((bullet) => `<li style="margin:4px 0;">${escapeAiLayoutText(bullet)}</li>`).join('')}</ul>`;
            }).join('')
            : '';
          const subsectionCallouts = Array.isArray(subsection?.callouts)
            ? subsection.callouts.map((callout) => renderCalloutCard(callout, { compact: true })).join('')
            : '';
          const preservedSubsectionHtml = remapPreservedFragmentColors(renderedSubsection?.contentHtml, tokens);
          const subsectionTitle = coerceString(subsection?.title);
          const subsectionLabel = isTutorialCards
            ? `STEP ${String(subsectionIndex + 1).padStart(2, '0')}`
            : (isEditorialLite ? `Scene ${String(subsectionIndex + 1).padStart(2, '0')}` : `Sub ${String(subsectionIndex + 1).padStart(2, '0')}`);
          const subsectionHasAccentRail = !!subsectionProfile.useBorderLeft;
          const tutorialSubsectionContentPadding = isTutorialCards
            ? (tutorialSpacing?.subsectionCardPadding || (isDraft ? '18px 24px 16px' : '14px 16px 12px'))
            : null;
          const tutorialPreviewSubsectionContentPadding = isTutorialCards ? '14px 16px 12px' : null;
          const tutorialSubsectionShellStyle = isTutorialCards && subsectionProfile.useCard
            ? (isDraft
              ? `padding:${tutorialSubsectionContentPadding || '18px 24px 16px'};box-sizing:border-box;border:1px solid ${tokens.border};border-left:3px solid ${tokens.accent};border-radius:14px;background:${tokens.surfaceSoft};background-color:${tokens.surfaceSoft};overflow:hidden`
              : `border:1px solid ${tokens.border};border-left:3px solid ${tokens.accent};border-radius:14px;background:${tokens.surfaceSoft};overflow:hidden`)
            : null;
          const subsectionContainerStyle = [
            `margin-top:${subsectionProfile.spacingTop || (isEditorialLite ? 18 : (isTutorialCards ? tutorialSpacing?.subsectionSpacingTop || 12 : 14))}px`,
            subsectionProfile.useCard
              ? (tutorialSubsectionShellStyle
                ? tutorialSubsectionShellStyle
                : `padding:${isTutorialCards ? tutorialSpacing?.subsectionCardPadding || '18px 24px 16px' : '0'};border:1px solid ${tokens.border};border-radius:${isTutorialCards ? 14 : 0}px;background:${isTutorialCards ? (isDraft ? tokens.surface : tokens.surfaceSoft) : 'transparent'}`)
              : '',
            isEditorialLite ? `padding-top:6px;border-top:1px dashed ${tokens.border};` : '',
          ].filter(Boolean).join(';');
          const subsectionTitleSize = subsectionLevel >= 4
            ? Math.max(14, Number(subsectionProfile.titleSize || (isEditorialLite ? 18 : 16)) - 1)
            : Number(subsectionProfile.titleSize || (isEditorialLite ? 18 : 16));
          const subsectionLabelHtml = subsectionTitle
            ? (isDraft
              ? `<div style="margin-bottom:8px;">
                  <span style="display:inline-block;padding:${isTutorialCards ? '3px 8px' : '0'};border-radius:${isTutorialCards ? '999px' : '0'};background:${isTutorialCards ? tokens.accentSoft : 'transparent'};font-size:10px;font-weight:700;letter-spacing:${isEditorialLite ? 1.4 : 1}px;color:${tokens.accentDeep};text-transform:uppercase;${isEditorialLite ? `font-family:${editorialDisplayFont};` : ''}">${escapeHtml(subsectionLabel)}</span>
                </div>`
              : `<div style="display:flex;align-items:center;gap:${isEditorialLite ? 10 : 8}px;margin-bottom:8px;">
                  <span style="font-size:10px;font-weight:700;letter-spacing:${isEditorialLite ? 1.4 : 1}px;color:${tokens.accentDeep};text-transform:uppercase;${isEditorialLite ? `font-family:${editorialDisplayFont};` : ''}">${escapeHtml(subsectionLabel)}</span>
                  <div style="flex:1;height:1px;background:${isEditorialLite ? tokens.border : 'transparent'};"></div>
                </div>`)
            : '';
          const subsectionTitleStyle = isDraft && isTutorialCards
            ? `margin:0 0 8px;font-size:${subsectionTitleSize}px;line-height:1.5;font-weight:${subsectionProfile.titleWeight || 700};color:${tokens.accentDeep};font-family:inherit;`
            : `margin:0 0 8px;font-size:${subsectionTitleSize}px;line-height:${isEditorialLite ? 1.45 : 1.5};font-weight:${subsectionProfile.titleWeight || (isEditorialLite ? 600 : 700)};color:${tokens.accentDeep};font-family:${isEditorialLite ? editorialDisplayFont : 'inherit'};`;
          const subsectionInnerHtml = `
            ${subsectionLabelHtml}
            ${renderStyledText(
              'h3',
              subsectionTitle,
              subsectionTitleStyle,
              { mode }
            )}
            ${preservedSubsectionHtml || `${subsectionParagraphs}${subsectionBullets}${subsectionCallouts}`}
          `;
          const subsectionContentHtml = subsectionHasAccentRail
            ? (isDraft && isTutorialCards
              ? subsectionInnerHtml
              : `<div style="${tutorialPreviewSubsectionContentPadding ? `padding:${tutorialPreviewSubsectionContentPadding};` : ''}">${subsectionInnerHtml}</div>`)
            : subsectionInnerHtml;
          const subsectionWrapperTag = isTutorialCards && isDraft ? 'section' : 'div';
          return `<${subsectionWrapperTag} style="${subsectionContainerStyle}">
            ${subsectionContentHtml}
          </${subsectionWrapperTag}>`;
        }).join('')
        : '';
      const sectionHead = isDraft
        ? (isTutorialCards
          ? `<div style="margin-bottom:8px;">
              <span style="display:inline-block;font-size:28px;font-weight:800;color:${tokens.accent};line-height:1;">${String(sectionDisplayIndex).padStart(2, '0')}</span>
              <span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:700;letter-spacing:1px;color:${tokens.muted};text-transform:uppercase;">${escapeHtml(block.sectionLabel || `${sectionLabelPrefix} ${String(sectionDisplayIndex).padStart(2, '0')}`)}</span>
            </div>`
          : `<div style="margin-bottom:${isEditorialLite ? 14 : 10}px;">
              <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:${isEditorialLite ? 1.4 : 1.2}px;color:${tokens.accentDeep};text-transform:uppercase;">${escapeHtml(`${sectionLabelPrefix} ${String(sectionDisplayIndex).padStart(2, '0')}`)}</span>
            </div>`)
        : (isSourceFirst
          ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:${tokens.accentDeep};text-transform:uppercase;">${escapeHtml(`${sectionLabelPrefix} ${String(sectionDisplayIndex).padStart(2, '0')}`)}</div>
              <div style="height:1px;flex:1;background:${tokens.border};"></div>
            </div>`
          : isEditorialLite
            ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;color:${tokens.accentDeep};text-transform:uppercase;">${escapeHtml(`${sectionLabelPrefix} ${String(sectionDisplayIndex).padStart(2, '0')}`)}</div>
                <div style="width:42px;height:1px;background:${tokens.border};"></div>
              </div>`
            : `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="font-size:28px;font-weight:800;color:${tokens.accent};line-height:1;">${String(sectionDisplayIndex).padStart(2, '0')}</div>
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${tokens.muted};text-transform:uppercase;">${escapeHtml(block.sectionLabel || `${sectionLabelPrefix} ${String(sectionDisplayIndex).padStart(2, '0')}`)}</div>
            </div>`);
      return `<section style="margin:${isSourceFirst ? 22 : (isEditorialLite ? 36 : (isTutorialCards ? tutorialSpacing?.sectionMarginY || 18 : 26))}px 0;${caseBlockProfile.useCard && isTutorialCards ? `padding:${tutorialSpacing?.sectionCardPadding || '14px'};border:1px solid ${tokens.border};border-radius:${cardRadius}px;background:${tokens.surfaceSoft};box-shadow:${cardShadow};` : ''}${isSourceFirst ? `padding-top:4px;` : ''}">
        ${sectionHead}
        ${renderStyledText(
          'h2',
          block.title,
          `margin:0 0 ${titleMarginBottom}px;font-size:${titleFontSize}px;line-height:${isEditorialLite ? 1.28 : 1.4};color:${titleColor};font-family:${isEditorialLite ? editorialDisplayFont : 'inherit'};`,
          { mode }
        )}
        ${preservedLeadHtml || `${paragraphsHtml}${bulletGroupsHtml}${calloutsHtml}${imagesHtml}`}
        ${subsectionsHtml}
        ${preservedLeadHtml ? imagesHtml : ''}
      </section>`;
    }

    if (block.type === 'phone-frame') {
      return `<section style="margin:24px auto;max-width:${isSourceFirst ? 420 : (isEditorialLite ? 460 : 380)}px;padding:${isSourceFirst ? 10 : (isEditorialLite ? 12 : 14)}px;border:1px solid ${tokens.border};border-radius:${isSourceFirst ? 24 : (isEditorialLite ? 18 : 42)}px;background:${isDraft ? tokens.surfaceSoft : `linear-gradient(180deg, ${tokens.surfaceSoft} 0%, ${tokens.surface} 100%)`};${isDraft ? '' : 'box-shadow:0 20px 40px -28px rgba(36,50,61,0.18);'}">
        <div style="width:${isEditorialLite ? 28 : 42}%;height:${isEditorialLite ? 2 : 18}px;margin:0 auto 14px;border-radius:999px;background:${tokens.border};"></div>
        <div style="background:${tokens.surface};border:1px solid ${tokens.border};border-radius:${isSourceFirst ? 16 : (isEditorialLite ? 14 : 28)}px;padding:10px;overflow:hidden;">
          ${renderImage(block.imageId, `border-radius:${isSourceFirst ? 12 : (isEditorialLite ? 12 : 22)}px;`)}
        </div>
        ${block.caption ? `<div style="margin-top:10px;font-size:12px;text-align:center;color:${tokens.muted};">${escapeHtml(block.caption)}</div>` : ''}
      </section>`;
    }

    if (block.type === 'cta-card') {
      const ctaButtonHtml = `<p style="margin:14px 0 0;font-size:0;line-height:0;">
        <span style="display:inline-block;padding:${isEditorialLite ? '9px 18px' : '10px 16px'};border-radius:999px;background:${tokens.accent};color:#ffffff;font-weight:700;font-size:14px;line-height:1.2;letter-spacing:0;white-space:nowrap;">${escapeHtml(block.buttonText || '继续阅读')}</span>
      </p>`;
      return `<section style="${cardStyle};padding:${ctaCardPadding};background:${isDraft ? tokens.accentSoft : `linear-gradient(135deg, ${tokens.accentSoft} 0%, #ffffff 100%)`};">
        ${renderStyledText(
          'h3',
          block.title,
          `margin:0 0 10px;font-size:${isEditorialLite ? 22 : 20}px;line-height:${isEditorialLite ? 1.3 : 1.35};color:${tokens.text};`,
          { mode }
        )}
        ${block.body ? `<p style="margin:0;color:${tokens.muted};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${escapeHtml(block.body)}</p>` : ''}
        ${ctaButtonHtml}
        ${block.note ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.75;color:${tokens.muted};letter-spacing:0;">${escapeAiLayoutText(block.note)}</p>` : ''}
      </section>`;
    }

    return '';
  }).join('');

  return `<section style="${wrapperStyle}">${blocksHtml}</section>`;
}

export {
  normalizeWechatTaskMarkerText,
  escapeHtml,
  normalizeAiLayoutDisplayText,
  escapeAiLayoutText,
  normalizeInlineFontFamily,
  renderStyledText,
  renderEditorialDraftDivider,
  renderEditorialPreviewDivider,
  renderArticleLayoutHtml,
};
