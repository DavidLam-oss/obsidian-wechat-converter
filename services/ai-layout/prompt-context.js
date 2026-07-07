/*
## 核心功能

实现 AI layout 服务的 prompt context 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `truncateMarkdownForPrompt`、`normalizeTitleKey`、`toSectionIndex`、`toTextArray`、`toImageIdArray`、`buildSectionBlockFromSource`、`mergeSectionBlocksByBudget`、`findSourceSectionByTitle`、`normalizeLayoutBlock`、`summarizeText`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`../dom-utils.js`、`./constants.js`、`./catalog.js`、`./utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import { createHtmlContainer, getActiveDocument } from '../dom-utils.js';
import {
  AI_COLOR_PALETTES,
  AI_LAYOUT_FAMILY_DEFS,
  MAX_CASE_BLOCK_BULLETS,
  MAX_CASE_BLOCK_IMAGE_IDS,
  MAX_PART_NAV_ITEMS,
} from './constants.js';
import {
  normalizeResolvedColorPalette,
  normalizeResolvedLayoutFamily,
} from './catalog.js';
import { applyElementCssStyles, coerceString, toRecord } from './utils.js';

function truncateMarkdownForPrompt(markdown = '', maxChars = 12000) {
  const content = String(markdown || '').trim();
  if (!content || content.length <= maxChars) return content;
  const headLength = Math.max(2000, Math.floor(maxChars * 0.72));
  const tailLength = Math.max(800, maxChars - headLength);
  const head = content.slice(0, headLength).trimEnd();
  const tail = content.slice(-tailLength).trimStart();
  return [
    head,
    '',
    '[内容已截断，为了控制请求规模，这里省略了中间部分正文。]',
    '',
    tail,
  ].join('\n');
}

function normalizeTitleKey(value) {
  return coerceString(value).toLowerCase().replace(/\s+/g, '');
}

function toSectionIndex(value, fallback = -1) {
  if (Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = parseInt(value.trim(), 10);
    return parsed >= 0 ? parsed : fallback;
  }
  return fallback;
}

function toTextArray(value, limit = 6) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function toImageIdArray(value, imageIds, limit = 4) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceString(item))
    .filter((item) => imageIds.has(item))
    .slice(0, limit);
}

function buildSectionBlockFromSource(section, {
  imageIds = [],
  fallbackIndex = 0,
} = {}) {
  if (!section || typeof section !== 'object') return null;
  const sectionRecord = /** @type {AiLayoutSourceSectionLike} */ (section);
  const title = coerceString(sectionRecord.title || sectionRecord.heading || '');
  const paragraphs = Array.isArray(section.paragraphs)
    ? section.paragraphs.map((item) => coerceString(item)).filter(Boolean)
    : [];
  const bulletGroups = Array.isArray(section.bulletGroups)
    ? section.bulletGroups
      .map((group) => Array.isArray(group) ? group.map((item) => coerceString(item)).filter(Boolean).slice(0, 10) : [])
      .filter((group) => group.length)
    : [];
  const callouts = Array.isArray(section.callouts)
    ? section.callouts
      .map((callout) => ({
        type: coerceString(callout?.type),
        title: coerceString(callout?.title),
        body: coerceString(callout?.body),
      }))
      .filter((callout) => callout.title || callout.body || callout.type)
    : [];
  const normalizedImageIds = Array.isArray(imageIds)
    ? imageIds.map((item) => coerceString(item)).filter(Boolean).slice(0, 3)
    : [];
  const subsections = Array.isArray(section.subsections)
    ? section.subsections.map((subsection) => ({
      title: coerceString(subsection?.title || subsection?.heading || ''),
      level: Number.isInteger(subsection?.level) ? subsection.level : 3,
      paragraphs: Array.isArray(subsection?.paragraphs)
        ? subsection.paragraphs.map((item) => coerceString(item)).filter(Boolean)
        : [],
      bulletGroups: Array.isArray(subsection?.bulletGroups)
        ? subsection.bulletGroups
          .map((group) => Array.isArray(group) ? group.map((item) => coerceString(item)).filter(Boolean).slice(0, 10) : [])
          .filter((group) => group.length)
        : [],
      callouts: Array.isArray(subsection?.callouts)
        ? subsection.callouts
          .map((callout) => ({
            type: coerceString(callout?.type),
            title: coerceString(callout?.title),
            body: coerceString(callout?.body),
          }))
          .filter((callout) => callout.title || callout.body || callout.type)
        : [],
    })).filter((subsection) => subsection.title || subsection.paragraphs.length || subsection.bulletGroups.length || subsection.callouts.length)
    : [];
  if (!title && !paragraphs.length && !bulletGroups.length && !callouts.length) return null;
  return {
    type: 'section-block',
    sectionIndex: toSectionIndex(sectionRecord.index, fallbackIndex),
    sectionLabel: (sectionRecord.level || 2) >= 3 ? `SUB ${String(fallbackIndex + 1).padStart(2, '0')}` : `PART ${String(fallbackIndex + 1).padStart(2, '0')}`,
    headingLevel: Number.isInteger(sectionRecord.level) ? sectionRecord.level : 2,
    title,
    paragraphs,
    bulletGroups,
    callouts,
    imageIds: normalizedImageIds,
    subsections,
  };
}

function mergeSectionBlocksByBudget(blocks = [], maxSectionBlocks = 0) {
  if (!Number.isInteger(maxSectionBlocks) || maxSectionBlocks <= 0) return blocks.slice();
  let sectionCount = 0;
  /** @type {AiLayoutBlockLike[]} */
  const merged = [];

  /** @returns {AiLayoutBlockLike | null} */
  const getLastSectionBlock = () => {
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      if (merged[index]?.type === 'section-block') return merged[index];
    }
    return null;
  };

  blocks.forEach((block) => {
    if (!block || block.type !== 'section-block') {
      merged.push(block);
      return;
    }

    if (sectionCount < maxSectionBlocks) {
      merged.push({
        ...block,
        paragraphs: Array.isArray(block.paragraphs) ? block.paragraphs.slice() : [],
        bulletGroups: Array.isArray(block.bulletGroups) ? block.bulletGroups.map((group) => Array.isArray(group) ? group.slice() : []).filter((group) => group.length) : [],
        callouts: Array.isArray(block.callouts) ? block.callouts.map((callout) => ({ ...callout })) : [],
        imageIds: Array.isArray(block.imageIds) ? block.imageIds.slice() : [],
        subsections: Array.isArray(block.subsections) ? block.subsections.map((subsection) => ({
          ...subsection,
          paragraphs: Array.isArray(subsection.paragraphs) ? subsection.paragraphs.slice() : [],
          bulletGroups: Array.isArray(subsection.bulletGroups) ? subsection.bulletGroups.map((group) => Array.isArray(group) ? group.slice() : []).filter((group) => group.length) : [],
          callouts: Array.isArray(subsection.callouts) ? subsection.callouts.map((callout) => ({ ...callout })) : [],
        })) : [],
      });
      sectionCount += 1;
      return;
    }

    const lastSectionBlock = getLastSectionBlock();
    if (!lastSectionBlock) {
      merged.push(block);
      return;
    }

    /** @type {AiLayoutSubsectionLike} */
    const promotedSubsection = {
      title: coerceString(block.title || block.sectionLabel || `Section ${sectionCount + 1}`),
      level: Math.max(3, Number.isInteger(block.headingLevel) ? block.headingLevel : 2),
      paragraphs: Array.isArray(block.paragraphs) ? block.paragraphs.slice() : [],
      bulletGroups: Array.isArray(block.bulletGroups)
        ? block.bulletGroups.map((group) => Array.isArray(group) ? group.slice() : []).filter((group) => group.length)
        : [],
      callouts: Array.isArray(block.callouts) ? block.callouts.map((callout) => ({ ...callout })) : [],
    };
    /** @type {AiLayoutSubsectionLike[]} */
    const nestedSubsections = Array.isArray(block.subsections)
      ? block.subsections.map((subsection) => ({
        title: coerceString(subsection?.title || ''),
        level: Math.max(3, Number.isInteger(subsection?.level) ? subsection.level : 3),
        paragraphs: Array.isArray(subsection?.paragraphs) ? subsection.paragraphs.slice() : [],
        bulletGroups: Array.isArray(subsection?.bulletGroups)
          ? subsection.bulletGroups.map((group) => Array.isArray(group) ? group.slice() : []).filter((group) => group.length)
          : [],
        callouts: Array.isArray(subsection?.callouts) ? subsection.callouts.map((callout) => ({ ...callout })) : [],
      })).filter((subsection) => subsection.title || subsection.paragraphs.length || subsection.bulletGroups.length || subsection.callouts.length)
      : [];

    lastSectionBlock.subsections = (Array.isArray(lastSectionBlock.subsections) ? lastSectionBlock.subsections : [])
      .concat([promotedSubsection], nestedSubsections);
    if (Array.isArray(block.imageIds) && block.imageIds.length) {
      lastSectionBlock.imageIds = Array.from(new Set([...(Array.isArray(lastSectionBlock.imageIds) ? lastSectionBlock.imageIds : []), ...block.imageIds])).slice(0, 3);
    }
  });

  return merged;
}

function findSourceSectionByTitle(sourceSections = [], title = '') {
  const expectedKey = normalizeTitleKey(title);
  if (!expectedKey) return null;
  return sourceSections.find((section) => normalizeTitleKey(section?.title) === expectedKey) || null;
}

function normalizeLayoutBlock(block, imageIds, sourceSections, index) {
  if (!block || typeof block !== 'object') return null;
  const type = coerceString(block.type);
  if (!type) return null;

  if (type === 'hero') {
    return {
      type,
      eyebrow: coerceString(block.eyebrow),
      title: coerceString(block.title),
      subtitle: coerceString(block.subtitle),
      coverImageId: imageIds.has(coerceString(block.coverImageId)) ? coerceString(block.coverImageId) : '',
      variant: ['cover-right', 'cover-left'].includes(block.variant) ? block.variant : 'cover-right',
    };
  }

  if (type === 'part-nav') {
    const items = Array.isArray(block.items)
      ? block.items.map((item, itemIndex) => {
        const itemRecord = toRecord(item);
        return {
          label: coerceString(itemRecord.label || `PART ${String(itemIndex + 1).padStart(2, '0')}`),
          text: coerceString(itemRecord.text || itemRecord.title),
        };
      }).filter((item) => item.text).slice(0, MAX_PART_NAV_ITEMS)
      : [];
    return items.length ? { type, items } : null;
  }

  if (type === 'lead-quote') {
    const text = coerceString(block.text || block.quote);
    if (!text) return null;
    return {
      type,
      text,
      note: coerceString(block.note),
    };
  }

  if (type === 'case-block') {
    const title = coerceString(block.title);
    const summary = coerceString(block.summary);
    if (!title && !summary) return null;
    const matchedSection = findSourceSectionByTitle(sourceSections, title);
    if (matchedSection) {
      return buildSectionBlockFromSource(matchedSection, {
        imageIds: toImageIdArray(block.imageIds, imageIds, MAX_CASE_BLOCK_IMAGE_IDS),
        fallbackIndex: toSectionIndex(matchedSection.index, index),
      });
    }
    return {
      type,
      caseLabel: coerceString(block.caseLabel || `CASE ${String(index + 1).padStart(2, '0')}`),
      title,
      summary,
      bullets: toTextArray(block.bullets, MAX_CASE_BLOCK_BULLETS),
      imageIds: toImageIdArray(block.imageIds, imageIds, MAX_CASE_BLOCK_IMAGE_IDS),
      highlight: coerceString(block.highlight),
    };
  }

  if (type === 'section-block') {
    const sectionIndex = toSectionIndex(block.sectionIndex, -1);
    const sourceSection = sectionIndex >= 0 ? sourceSections.find((item) => toSectionIndex(item?.index, -1) === sectionIndex) : null;
    if (!sourceSection) return null;
    return buildSectionBlockFromSource(sourceSection, {
      imageIds: toImageIdArray(block.imageIds, imageIds, 3),
      fallbackIndex: sectionIndex,
    });
  }

  if (type === 'phone-frame') {
    const imageId = coerceString(block.imageId);
    if (!imageIds.has(imageId)) return null;
    return {
      type,
      imageId,
      caption: coerceString(block.caption),
    };
  }

  if (type === 'cta-card') {
    const title = coerceString(block.title);
    const body = coerceString(block.body);
    if (!title && !body) return null;
    return {
      type,
      title,
      body,
      buttonText: coerceString(block.buttonText || '继续阅读'),
      note: coerceString(block.note),
    };
  }

  return null;
}

function summarizeText(value, maxLength = 80) {
  const text = coerceString(value).replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function looksLikeScreenshotRef(image = {}) {
  const signature = [
    image.id,
    image.alt,
    image.caption,
    image.src,
  ].map((item) => coerceString(item).toLowerCase()).join(' ');
  if (!signature) return false;
  return /(截图|界面|对话|聊天|微信|面板|后台|screenshot|screen|cleanshot|dialog|chat|ui)/i.test(signature);
}

function stripFrontmatterBlock(markdown = '') {
  const content = String(markdown || '').replace(/^\uFEFF/, '');
  if (!content.startsWith('---')) return content;
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return match ? content.slice(match[0].length) : content;
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~#>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMarkdownCalloutStart(line = '') {
  const quoteLine = String(line || '').trim();
  const match = quoteLine.match(/^>\s*\[!\s*([^\]\r\n]+?)\s*\](?:\s*(.*))?$/u);
  if (!match) return null;
  return {
    type: coerceString(match[1]).toLowerCase(),
    title: stripMarkdown(match[2] || ''),
  };
}

function formatCalloutLabel(type = '') {
  const normalized = coerceString(type).toLowerCase();
  /** @type {Record<string, string>} */
  const labels = {
    note: 'Note',
    info: 'Info',
    tip: 'Tip',
    warning: 'Warning',
    caution: 'Caution',
    danger: 'Danger',
    success: 'Success',
    abstract: 'Abstract',
    summary: 'Summary',
    quote: 'Quote',
    important: 'Important',
    todo: 'Todo',
  };
  if (labels[normalized]) return labels[normalized];
  if (!normalized) return 'Callout';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function serializeClonedNodes(nodes = []) {
  const activeDocument = getActiveDocument();
  if (!activeDocument) return '';
  const container = activeDocument.createElement('div');
  trimTrailingDecorativeNodes(nodes).forEach((node) => {
    if (!node) return;
    container.appendChild(node.cloneNode(true));
  });
  return container.innerHTML.trim();
}

function hasMeaningfulNodeContent(node) {
  const currentNode = /** @type {Node | null} */ (node || null);
  if (!currentNode) return false;
  if (currentNode.nodeType === Node.TEXT_NODE) return /\S/.test(currentNode.textContent || '');
  if (currentNode.nodeType !== Node.ELEMENT_NODE) return false;

  const element = /** @type {HTMLElement} */ (currentNode);
  const tagName = String(element.tagName || '').toUpperCase();
  if (['IMG', 'TABLE', 'PRE', 'UL', 'OL', 'BLOCKQUOTE', 'FIGURE', 'SVG', 'VIDEO', 'AUDIO', 'CANVAS'].includes(tagName)) {
    return true;
  }
  if (element.querySelector('img,table,pre,ul,ol,blockquote,figure,svg,video,audio,canvas')) {
    return true;
  }
  return /\S/.test((element.textContent || '').replace(/\u00a0/g, ''));
}

function isTrailingDecorativeNode(node) {
  const currentNode = /** @type {Node | null} */ (node || null);
  if (!currentNode) return true;
  if (currentNode.nodeType === Node.TEXT_NODE) return !/\S/.test(currentNode.textContent || '');
  if (currentNode.nodeType !== Node.ELEMENT_NODE) return true;

  const tagName = String(/** @type {HTMLElement} */ (currentNode).tagName || '').toUpperCase();
  if (tagName === 'HR') return true;
  if (['P', 'DIV', 'SECTION'].includes(tagName) && !hasMeaningfulNodeContent(node)) {
    return true;
  }
  return false;
}

function trimTrailingDecorativeNodes(nodes = []) {
  /** @type {Node[]} */
  const trimmed = [];
  if (Array.isArray(nodes)) {
    nodes.forEach((node) => {
      if (node instanceof Node) trimmed.push(node);
    });
  }
  while (trimmed.length && isTrailingDecorativeNode(trimmed[trimmed.length - 1])) {
    trimmed.pop();
  }
  return trimmed;
}

function remapPreservedFragmentColors(html = '', tokens = {}) {
  const source = coerceString(html);
  if (!source) return source;

  const container = createHtmlContainer('div', source);
  if (!container) return source;

  /** @param {Element | null | undefined} element */
  const isInsideCodeChrome = (element) => {
    if (!element || typeof element.closest !== 'function') return false;
    return !!element.closest('.code-snippet__fix, pre, code, svg, mjx-container');
  };

  container.querySelectorAll('strong, b').forEach((element) => {
    if (isInsideCodeChrome(element)) return;
    const htmlElement = /** @type {HTMLElement} */ (element);
    applyElementCssStyles(htmlElement, {
      color: tokens.accentDeep || tokens.accent || '',
      fontWeight: htmlElement.style.fontWeight || '700',
    });
  });

  container.querySelectorAll('span').forEach((element) => {
    if (isInsideCodeChrome(element)) return;
    const inlineStyle = (element.getAttribute('style') || '').toLowerCase();
    if (!/font-weight\s*:\s*(bold|[6-9]00)/.test(inlineStyle)) return;
    applyElementCssStyles(element, { color: tokens.accentDeep || tokens.accent || '' });
  });

  container.querySelectorAll('a').forEach((element) => {
    if (isInsideCodeChrome(element)) return;
    applyElementCssStyles(element, {
      color: tokens.accentDeep || tokens.accent || '',
      textDecoration: 'none',
      borderBottom: `1px dashed ${tokens.accent || tokens.accentDeep || '#000000'}`,
    });
  });

  container.querySelectorAll('section, div, blockquote').forEach((element) => {
    if (isInsideCodeChrome(element)) return;
    const inlineStyle = (element.getAttribute('style') || '').toLowerCase();
    const looksLikeLegacyCallout = /border-left\s*:/.test(inlineStyle)
      && /overflow\s*:\s*hidden/.test(inlineStyle)
      && /background\s*:/.test(inlineStyle);
    if (!looksLikeLegacyCallout) return;

    const htmlElement = /** @type {HTMLElement} */ (element);
    applyElementCssStyles(htmlElement, {
      borderLeftColor: tokens.accent || '',
      borderLeftStyle: htmlElement.style.borderLeftStyle || 'solid',
      borderLeftWidth: htmlElement.style.borderLeftWidth || '3px',
      background: tokens.accentSoft || '',
      backgroundColor: tokens.accentSoft || '',
    });

    const [header, body] = Array.from(element.children || []);
    if (header && !isInsideCodeChrome(header)) {
      applyElementCssStyles(header, {
        background: tokens.quoteBg || tokens.accentSoft || '',
        backgroundColor: tokens.quoteBg || tokens.accentSoft || '',
        color: tokens.text || '',
      });
    }
    if (body && !isInsideCodeChrome(body)) {
      applyElementCssStyles(body, { color: tokens.text || '' });
    }
  });

  return container.innerHTML.trim();
}

function extractRenderedSectionFragments(html = '') {
  if (!html) {
    return { sections: [] };
  }

  const container = createHtmlContainer('div', String(html || ''));
  if (!container) return { sections: [] };
  const root = container.children.length === 1 ? container.firstElementChild : container;
  const childNodes = Array.from(root?.childNodes || []).filter((node) => (
    node.nodeType !== 3 || /\S/.test(node.textContent || '')
  ));
  /** @type {AiLayoutSourceSectionLike[]} */
  const sections = [];
  /** @type {{ title: string, titleKey: string, leadNodes: Node[], subsections: Array<{ title: string, titleKey: string, nodes: Node[] }> } | null} */
  let currentSection = null;
  /** @type {{ title: string, titleKey: string, nodes: Node[] } | null} */
  let currentSubsection = null;

  const finalizeSection = () => {
    if (!currentSection) return;
    sections.push({
      index: sections.length,
      title: currentSection.title,
      titleKey: currentSection.titleKey,
      leadHtml: serializeClonedNodes(currentSection.leadNodes),
      subsections: currentSection.subsections.map((subsection, subsectionIndex) => ({
        index: subsectionIndex,
        title: subsection.title,
        titleKey: subsection.titleKey,
        contentHtml: serializeClonedNodes(subsection.nodes),
      })),
    });
    currentSection = null;
    currentSubsection = null;
  };

  childNodes.forEach((node) => {
    if (node.nodeType === 1) {
      const tagName = String(node.tagName || '').toUpperCase();
      const headingMatch = tagName.match(/^H([2-6])$/);
      if (headingMatch) {
        const level = parseInt(headingMatch[1], 10);
        const title = coerceString(node.textContent).trim();
        if (level === 2 || !currentSection) {
          finalizeSection();
          currentSection = {
            title,
            titleKey: normalizeTitleKey(title),
            leadNodes: [],
            subsections: [],
          };
          currentSubsection = null;
          return;
        }
        if (level >= 3 && currentSection) {
          currentSubsection = {
            title,
            titleKey: normalizeTitleKey(title),
            nodes: [],
          };
          currentSection.subsections.push(currentSubsection);
          return;
        }
      }
    }

    if (!currentSection) return;
    if (currentSubsection) {
      currentSubsection.nodes.push(node);
    } else {
      currentSection.leadNodes.push(node);
    }
  });

  finalizeSection();
  return { sections };
}

function extractMarkdownSections(markdown = '') {
  const lines = stripFrontmatterBlock(markdown).split(/\r?\n/);
  /** @type {MarkdownSection[]} */
  const sections = [];
  /** @type {string[]} */
  const introParagraphs = [];
  /** @type {string[][]} */
  const introBulletGroups = [];
  /** @type {MarkdownCallout[]} */
  const introCallouts = [];
  /** @type {MarkdownHeading[]} */
  const headings = [];
  /** @type {MarkdownSection | null} */
  let currentSection = null;
  /** @type {MarkdownSubsection | null} */
  let currentSubsection = null;
  /** @type {string[]} */
  let currentParagraph = [];
  /** @type {string[]} */
  let currentBullets = [];
  /** @type {{ type: string, title: string, lines: string[] } | null} */
  let currentCallout = null;

  const getCurrentTarget = () => currentSubsection || currentSection || null;

  const getCurrentCalloutTarget = () => {
    const target = getCurrentTarget();
    if (target) {
      return target.callouts;
    }
    return introCallouts;
  };

  const pushParagraphToTarget = () => {
    const text = stripMarkdown(currentParagraph.join(' ').trim());
    if (text) {
      const target = getCurrentTarget();
      if (target) {
        target.paragraphs.push(text);
      } else {
        introParagraphs.push(text);
      }
    }
    currentParagraph = [];
  };

  const pushBulletsToTarget = () => {
    if (currentBullets.length) {
      const target = getCurrentTarget();
      if (target) {
        target.bulletGroups.push(currentBullets);
      } else {
        introBulletGroups.push(currentBullets);
      }
    }
    currentBullets = [];
  };

  const pushCalloutToTarget = () => {
    if (!currentCallout) return;
    const body = stripMarkdown(currentCallout.lines.join(' ').trim());
    if (body || currentCallout.title || currentCallout.type) {
      getCurrentCalloutTarget().push({
        type: currentCallout.type,
        title: currentCallout.title,
        body,
      });
    }
    currentCallout = null;
  };

  const finalizeSection = () => {
    pushCalloutToTarget();
    if (currentSection && (currentSection.title || currentSection.paragraphs.length || currentSection.bulletGroups.length || currentSection.callouts?.length)) {
      currentSection.index = sections.length;
      sections.push(currentSection);
    }
    currentSection = null;
    currentSubsection = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      pushParagraphToTarget();
      pushBulletsToTarget();
      pushCalloutToTarget();
      continue;
    }

    const calloutStart = parseMarkdownCalloutStart(rawLine);
    if (calloutStart) {
      pushParagraphToTarget();
      pushBulletsToTarget();
      pushCalloutToTarget();
      currentCallout = {
        type: calloutStart.type,
        title: calloutStart.title,
        lines: [],
      };
      continue;
    }

    if (currentCallout) {
      const calloutLineMatch = rawLine.match(/^\s*>\s?(.*)$/);
      if (calloutLineMatch) {
        const calloutText = stripMarkdown(calloutLineMatch[1] || '');
        if (calloutText) currentCallout.lines.push(calloutText);
        continue;
      }
      pushCalloutToTarget();
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      pushParagraphToTarget();
      pushBulletsToTarget();
      const level = headingMatch[1].length;
      const title = stripMarkdown(headingMatch[2]);
      headings.push({ level, text: title });
      if (level === 1) {
        currentSubsection = null;
        continue;
      }
      if (level === 2 || !currentSection) {
        finalizeSection();
        currentSection = {
          index: sections.length,
          level: 2,
          title,
          paragraphs: [],
          bulletGroups: [],
          callouts: [],
          subsections: [],
        };
        currentSubsection = null;
        continue;
      }
      currentSubsection = {
        level,
        title,
        paragraphs: [],
        bulletGroups: [],
        callouts: [],
      };
      currentSection.subsections.push(currentSubsection);
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch) {
      pushParagraphToTarget();
      currentBullets.push(stripMarkdown(bulletMatch[1]));
      continue;
    }

    currentParagraph.push(line);
  }

  pushParagraphToTarget();
  pushBulletsToTarget();
  pushCalloutToTarget();
  finalizeSection();

  if (!sections.length && (introParagraphs.length || introBulletGroups.length || introCallouts.length)) {
    sections.push({
      index: 0,
      level: 2,
      title: '核心内容',
      paragraphs: introParagraphs.slice(),
      bulletGroups: introBulletGroups.slice(),
      callouts: introCallouts.slice(),
      subsections: [],
    });
  }

  return {
    introParagraphs,
    introBulletGroups,
    introCallouts,
    headings,
    sections,
  };
}

function extractMarkdownSignals(markdown = '') {
  const structure = extractMarkdownSections(markdown);
  const headings = Array.isArray(structure.headings)
    ? structure.headings.map((heading) => ({
      level: heading.level || 2,
      text: coerceString(heading.text),
    })).filter((heading) => heading.text)
    : [];
  const bulletGroups = [
    ...structure.introBulletGroups,
    ...structure.sections.flatMap((section) => [
      ...(section.bulletGroups || []),
      ...((section.subsections || []).flatMap((subsection) => subsection.bulletGroups || [])),
    ]),
  ];
  const paragraphs = [
    ...structure.introParagraphs,
    ...structure.sections.flatMap((section) => [
      ...(section.paragraphs || []),
      ...((section.subsections || []).flatMap((subsection) => subsection.paragraphs || [])),
    ]),
  ];
  const leadParagraphs = paragraphs.slice(0, 3);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const sectionTitles = structure.sections.map((section) => coerceString(section.title)).filter(Boolean).slice(0, 12);
  return {
    headings,
    sectionTitles,
    paragraphs,
    leadParagraphs,
    bulletGroups,
    lastParagraph,
  };
}

function recommendLayoutFamily({ rawLayout = {}, signals = null, imageRefs = [] } = {}) {
  const rawLayoutRecord = toRecord(rawLayout);
  const resolvedRecord = toRecord(rawLayoutRecord.resolved);
  const rawRecommended = coerceString(
    rawLayoutRecord.recommendedLayoutFamily || resolvedRecord.layoutFamily || rawLayoutRecord.layoutFamily
  );
  if (rawRecommended && AI_LAYOUT_FAMILY_DEFS[rawRecommended]) return normalizeResolvedLayoutFamily(rawRecommended);
  const safeSignals = signals || extractMarkdownSignals('');
  const headingCount = safeSignals.headings?.length || 0;
  const sectionCount = safeSignals.sectionTitles?.length || 0;
  const bulletGroupCount = safeSignals.bulletGroups?.length || 0;
  const imageCount = Array.isArray(imageRefs) ? imageRefs.length : 0;
  const hintText = `${coerceString(rawLayoutRecord.title)} ${Array.isArray(safeSignals.sectionTitles) ? safeSignals.sectionTitles.join(' ') : ''}`.toLowerCase();
  if (/(观点|经验|复盘|写作|表达|品牌|故事|思考|方法论|内容创作|心得|感受|editorial|essay|brand)/i.test(hintText)) {
    return 'editorial-lite';
  }
  if (sectionCount >= 2 || headingCount >= 4 || bulletGroupCount >= 2 || imageCount >= 2) {
    return 'tutorial-cards';
  }
  return 'source-first';
}

function recommendColorPalette({ rawLayout = {}, signals = null } = {}) {
  const rawLayoutRecord = toRecord(rawLayout);
  const resolvedRecord = toRecord(rawLayoutRecord.resolved);
  const rawRecommended = coerceString(
    rawLayoutRecord.recommendedColorPalette || resolvedRecord.colorPalette || rawLayoutRecord.stylePack
  );
  if (rawRecommended && rawRecommended !== 'custom' && AI_COLOR_PALETTES[rawRecommended]) {
    return normalizeResolvedColorPalette(rawRecommended);
  }
  const safeSignals = signals || extractMarkdownSignals('');
  const headingTitles = Array.isArray(safeSignals.sectionTitles)
    ? safeSignals.sectionTitles.join(' ')
    : '';
  const titleHints = `${coerceString(rawLayoutRecord.title)} ${headingTitles}`.toLowerCase();
  if (/(教程|指南|入门|步骤|实践|实操|配置|接入|使用|标签|双链|知识库|workflow|guide|tutorial|how to)/i.test(titleHints)) {
    return 'ocean-blue';
  }
  if (/(观点|品牌|复盘|内容|经验|编辑|写作|表达)/i.test(titleHints)) {
    return 'graphite-rose';
  }
  if (/(清单|合集|推荐|总结|收藏)/i.test(titleHints)) {
    return 'sunset-amber';
  }
  return 'tech-green';
}

export {
  truncateMarkdownForPrompt,
  normalizeTitleKey,
  toSectionIndex,
  toTextArray,
  toImageIdArray,
  buildSectionBlockFromSource,
  mergeSectionBlocksByBudget,
  findSourceSectionByTitle,
  normalizeLayoutBlock,
  summarizeText,
  looksLikeScreenshotRef,
  stripFrontmatterBlock,
  stripMarkdown,
  parseMarkdownCalloutStart,
  formatCalloutLabel,
  serializeClonedNodes,
  hasMeaningfulNodeContent,
  isTrailingDecorativeNode,
  trimTrailingDecorativeNodes,
  remapPreservedFragmentColors,
  extractRenderedSectionFragments,
  extractMarkdownSections,
  extractMarkdownSignals,
  recommendLayoutFamily,
  recommendColorPalette,
};
