/*
## 核心功能

实现微信公众号同步链路的 wechat html cleaner 服务能力。

## 输入

接收插件设置、账号凭证、文章 HTML、图片资源、frontmatter 元数据和微信 API 响应。

## 输出

输出 `cleanHtmlForDraft`，用于草稿创建/更新、素材上传、清洗、缓存或错误呈现。

## 定位

位于 services/，属于微信发布服务层；不直接操作设置页 DOM。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { createHtmlContainer, getActiveDocument } from './dom-utils.js';
import { resolveDraftListIndent } from './wechat-list-indent.js';

/**
 * @typedef {{ firstElementIdx: number, prefixEndIdx: number }} InlineLabelPrefixInfo
 */

const LIST_DISMANTLE_BLOCK_TAGS = new Set([
  'PRE', 'TABLE', 'BLOCKQUOTE', 'FIGURE', 'DIV', 'HR', 'P', 'SECTION', 'DETAILS', 'ASIDE', 'OL', 'UL',
]);

/**
 * @param {string} html
 * @returns {string}
 */
export function cleanHtmlForDraft(html) {

    const activeDocument = getActiveDocument();
    if (!activeDocument) return html;
    const div = createHtmlContainer('div', html);
    if (!div) return html;

    // 从渲染产物里的 font-family 探测列表缩进，与 themes/apple-theme.js 共用同一份数据
    const listIndent = resolveDraftListIndent(div);

    /**
     * @param {string} value
     * @returns {string}
     */
    const decodeFragment = (value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };

    /**
     * @param {Element | null | undefined} anchor
     * @returns {boolean}
     */
    const isTagLikeFragmentLink = (anchor) => {
      if (!anchor) return false;
      const href = (anchor.getAttribute('href') || '').trim();
      if (!href.startsWith('#')) return false;

      const text = (anchor.textContent || '').trim();
      if (!text.startsWith('#')) return false;

      const fragment = href.slice(1).trim();
      if (!fragment) return false;

      const normalizedText = text.slice(1).trim();
      if (!normalizedText) return false;

      return normalizedText === fragment || normalizedText === decodeFragment(fragment);
    };

    /**
     * @param {Element | null | undefined} root
     */
    const unwrapTagLikeFragmentLinks = (root) => {
      if (!root) return;

      root.querySelectorAll('a[href]').forEach((anchor) => {
        if (!isTagLikeFragmentLink(anchor)) return;

        const fragment = activeDocument.createDocumentFragment();
        while (anchor.firstChild) {
          fragment.appendChild(anchor.firstChild);
        }
        anchor.replaceWith(fragment);
      });
    };

    /**
     * @param {Element | null | undefined} container
     * @returns {InlineLabelPrefixInfo | null}
     */
    const getInlineLabelPrefixInfo = (container) => {
      if (!container) return null;
      const nodes = Array.from(container.childNodes);
      const firstElementIdx = nodes.findIndex(node => node.nodeType === Node.ELEMENT_NODE);
      if (firstElementIdx === -1) return null;
      const hasOnlyWhitespaceBefore = nodes
        .slice(0, firstElementIdx)
        .every(node => node.nodeType === Node.TEXT_NODE && !node.textContent.trim());
      if (!hasOnlyWhitespaceBefore) return null;

      const firstElement = nodes[firstElementIdx];
      if (!(firstElement instanceof Element)) return null;
      if (!['STRONG', 'CODE'].includes(firstElement.tagName)) return null;

      const elementText = (firstElement.textContent || '').trim();
      if (/[：:]$/.test(elementText)) {
        return { firstElementIdx, prefixEndIdx: firstElementIdx };
      }

      const nextNode = nodes[firstElementIdx + 1];
      if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
        const nextText = nextNode.textContent || '';
        if (/^\s*[：:]/.test(nextText)) {
          return { firstElementIdx, prefixEndIdx: firstElementIdx + 1 };
        }
      }

      return null;
    };

    // Narrow the cleanup to Obsidian tag-like fragment links (e.g. href="#标签"
    // with visible text "#标签"). Preserve ordinary in-document anchors such as
    // user-authored TOCs and footnote backlinks to keep copy/sync aligned with
    // preview behavior.
    unwrapTagLikeFragmentLinks(div);

    /** @param {Element | null | undefined} container */
    const hasInlineLabelPrefix = (container) => !!getInlineLabelPrefixInfo(container);

    /** @param {Element} paragraph */
    const collapseLabelBreakInParagraph = (paragraph) => {
      const prefixInfo = getInlineLabelPrefixInfo(paragraph);
      if (!prefixInfo) return;

      const nodes = Array.from(paragraph.childNodes);
      const startIdx = prefixInfo.prefixEndIdx + 1;

      if (prefixInfo.prefixEndIdx > prefixInfo.firstElementIdx) {
        const colonNode = nodes[prefixInfo.prefixEndIdx];
        if (colonNode && colonNode.nodeType === Node.TEXT_NODE) {
          colonNode.textContent = (colonNode.textContent || '').replace(/^\s*([：:])\s*/, '$1 ');
        }
      }

      let sawBreak = false;
      for (let i = startIdx; i < nodes.length; i += 1) {
        const node = nodes[i];

        if (node instanceof Element && node.tagName === 'BR') {
          node.remove();
          sawBreak = true;
          continue;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.textContent.trim()) continue;
          const hasLeadingWhitespace = /^\s+/.test(node.textContent);
          if (sawBreak || hasLeadingWhitespace) {
            node.textContent = node.textContent.replace(/^\s+/, ' ');
          }
          return;
        }

        if (node instanceof Element) {
          if (sawBreak) paragraph.insertBefore(activeDocument.createTextNode(' '), node);
          return;
        }
      }
    };

    /**
     * @param {Element | null | undefined} paragraph
     * @returns {boolean}
     */
    const isInlineOnlyParagraph = (paragraph) => {
      if (!paragraph) return false;
      const blockLikeTags = new Set(['UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE', 'SECTION', 'FIGURE', 'DIV', 'P']);
      return !Array.from(paragraph.querySelectorAll('*')).some(el => blockLikeTags.has(el.tagName));
    };

    /** @param {Element} li */
    const unwrapSimpleListParagraphs = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const meaningfulChildren = Array.from(li.childNodes).filter(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (meaningfulChildren.length === 0) return;

      const allInlineParagraphs = meaningfulChildren.every(node =>
        node instanceof Element &&
        node.tagName === 'P' &&
        isInlineOnlyParagraph(node)
      );
      if (!allInlineParagraphs) return;

      const fragment = activeDocument.createDocumentFragment();
      meaningfulChildren.forEach((paragraph, index) => {
        while (paragraph.firstChild) {
          fragment.appendChild(paragraph.firstChild);
        }
        if (index < meaningfulChildren.length - 1) {
          fragment.appendChild(activeDocument.createTextNode(' '));
        }
      });

      while (li.firstChild) {
        li.removeChild(li.firstChild);
      }
      li.appendChild(fragment);
    };

    /** @param {Element} li */
    const collapseLabelBreakInListItem = (li) => {
      const prefixInfo = getInlineLabelPrefixInfo(li);
      if (!prefixInfo) return;

      const nodes = Array.from(li.childNodes);
      const startIdx = prefixInfo.prefixEndIdx + 1;

      if (prefixInfo.prefixEndIdx > prefixInfo.firstElementIdx) {
        const colonNode = nodes[prefixInfo.prefixEndIdx];
        if (colonNode && colonNode.nodeType === Node.TEXT_NODE) {
          colonNode.textContent = (colonNode.textContent || '').replace(/^\s*([：:])\s*/, '$1 ');
        }
      }

      let sawBreak = false;
      for (let i = startIdx; i < nodes.length; i += 1) {
        const node = nodes[i];

        if (node instanceof Element && node.tagName === 'BR') {
          node.remove();
          sawBreak = true;
          continue;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.textContent.trim()) continue;
          const hasLeadingWhitespace = /^\s+/.test(node.textContent);
          if (sawBreak || hasLeadingWhitespace) {
            node.textContent = node.textContent.replace(/^\s+/, ' ');
          }
          return;
        }

        if (node instanceof Element) {
          if (sawBreak) li.insertBefore(activeDocument.createTextNode(' '), node);
          return;
        }
      }
    };

    /** @param {Element} li */
    const convertLeadingStrongOrCodeToSpan = (li) => {
      /**
       * @param {Element | null | undefined} container
       * @returns {ChildNode | null}
       */
      const getFirstMeaningfulNode = (container) => {
        if (!container) return null;
        return Array.from(container.childNodes).find(node =>
          !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
        ) || null;
      };

      let firstNode = getFirstMeaningfulNode(li);
      if (!firstNode) return;

      if (firstNode instanceof Element && firstNode.tagName === 'P') {
        firstNode = getFirstMeaningfulNode(firstNode);
      }

      if (!(firstNode instanceof Element)) return;
      if (!['STRONG', 'CODE'].includes(firstNode.tagName)) return;

      const span = activeDocument.createElement('span');
      const currentStyle = firstNode.getAttribute('style') || '';
      const cleanedStyle = currentStyle
        .replace(/display\s*:\s*[^;]+;?/gi, '')
        .replace(/width\s*:\s*[^;]+;?/gi, '')
        .replace(/float\s*:\s*[^;]+;?/gi, '')
        .trim();
      const normalizedStyle = cleanedStyle
        ? `${cleanedStyle}${cleanedStyle.trim().endsWith(';') ? '' : ';'}`
        : '';
      const extraStyle = firstNode.tagName === 'CODE'
        ? ' margin:0 2px !important; vertical-align:baseline;'
        : '';
      span.setAttribute('style', `${normalizedStyle}display:inline !important; width:auto !important; float:none !important;${extraStyle}`);
      while (firstNode.firstChild) {
        span.appendChild(firstNode.firstChild);
      }
      firstNode.replaceWith(span);
    };

    /** @param {Element} li */
    const collapseLeadingBreakAfterInlinePrefixInListItem = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const nodes = Array.from(li.childNodes);
      const firstMeaningfulIdx = nodes.findIndex(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (firstMeaningfulIdx === -1) return;

      const firstMeaningfulNode = nodes[firstMeaningfulIdx];
      if (!(firstMeaningfulNode instanceof Element)) return;
      if (!['SPAN', 'STRONG', 'CODE'].includes(firstMeaningfulNode.tagName)) return;
      const prefixText = (firstMeaningfulNode.textContent || '').trim();
      const prefixEndsAscii = /[A-Za-z0-9]$/.test(prefixText);

      let sawBreak = false;
      for (let i = firstMeaningfulIdx + 1; i < nodes.length; i += 1) {
        const node = nodes[i];

        if (node instanceof Element && node.tagName === 'BR') {
          sawBreak = true;
          node.remove();
          continue;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          const original = node.textContent || '';
          if (!original.trim()) {
            if (/\n/.test(original)) {
              sawBreak = true;
              node.remove();
              continue;
            }
            continue;
          }

          if (!(sawBreak || /\n/.test(original))) return;

          const trimmed = original
            .replace(/^\s*\n+\s*/, '')
            .replace(/^\s+/, '');
          const needsAsciiGap = prefixEndsAscii || /^[A-Za-z0-9]/.test(trimmed);
          node.textContent = `${needsAsciiGap ? ' ' : ''}${trimmed}`;
          return;
        }

        if (node instanceof Element) {
          const text = (node.textContent || '').trim();
          if (!text) continue;
          if (!sawBreak) return;
          if (prefixEndsAscii || /^[A-Za-z0-9]/.test(text)) {
            li.insertBefore(activeDocument.createTextNode(' '), node);
          }
          return;
        }
      }
    };

    /** @param {Element} li */
    const wrapTextContinuationAfterLeadingPrefix = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const nodes = Array.from(li.childNodes);
      const firstMeaningfulIdx = nodes.findIndex(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (firstMeaningfulIdx === -1) return;

      const firstMeaningfulNode = nodes[firstMeaningfulIdx];
      if (!(firstMeaningfulNode instanceof Element)) return;
      if (!['SPAN', 'STRONG', 'CODE'].includes(firstMeaningfulNode.tagName)) return;
      const firstText = (firstMeaningfulNode.textContent || '').trim();

      let nextMeaningfulNode = null;
      for (let i = firstMeaningfulIdx + 1; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
        nextMeaningfulNode = node;
        break;
      }
      if (!nextMeaningfulNode || nextMeaningfulNode.nodeType !== Node.TEXT_NODE) return;

      const text = nextMeaningfulNode.textContent || '';
      if (!text.trim()) return;
      if (/[：:]$/.test(firstText) || /^\s*[：:]/.test(text)) return;

      const span = activeDocument.createElement('span');
      const inlineContinuationStyle = 'display:inline !important;';
      span.setAttribute('style', inlineContinuationStyle);
      span.textContent = text;
      nextMeaningfulNode.replaceWith(span);
    };

    /** @param {Element} li */
    const bundleLeadingPrefixForWechatLineBreak = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const nodes = Array.from(li.childNodes).filter(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (nodes.length < 2) return;

      const first = nodes[0];
      const second = nodes[1];
      if (!(first instanceof Element) || !(second instanceof Element)) return;
      if (first.tagName !== 'SPAN' || second.tagName !== 'SPAN') return;

      const firstText = (first.textContent || '').trim();
      const secondText = (second.textContent || '').trim();
      if (!firstText || !secondText) return;

      // Keep colon-label flows on the original path.
      if (/[：:]$/.test(firstText) || /^[：:]/.test(secondText)) return;

      // Only keep bundled no-wrap for known WeChat break-prone continuations.
      if (!/^(?:[（(]|的)/.test(secondText)) return;

      // Only bundle short leading chunks (e.g. "登录用"+"的用户名", "SSH 端口"+"（通常是 22）").
      if (secondText.length > 16) return;

      const bundle = activeDocument.createElement('span');
      const noWrapBundleStyle = 'display:inline-block; white-space:nowrap;';
      bundle.setAttribute('style', noWrapBundleStyle);

      li.insertBefore(bundle, first);
      bundle.appendChild(first);
      bundle.appendChild(second);
    };

    /** @param {Element} li */
    const wrapLeadingLabelInBlockSpan = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const nodes = Array.from(li.childNodes).filter(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (nodes.length < 2) return;

      const firstNode = nodes[0];
      if (!(firstNode instanceof Element)) return;
      if (firstNode.tagName !== 'SPAN') return;

      const firstText = (firstNode.textContent || '').trim();
      const secondNode = nodes[1];
      const secondText = secondNode.nodeType === Node.TEXT_NODE
        ? (secondNode.textContent || '')
        : (secondNode instanceof Element ? (secondNode.textContent || '') : '');
      const hasColon = /[：:]$/.test(firstText) || /^\s*[：:]/.test(secondText);
      if (!hasColon) return;

      const wrapper = activeDocument.createElement('span');
      const liStyle = li.getAttribute('style') || '';
      const lineHeightMatch = liStyle.match(/line-height:\s*[^;]+/i);
      const lineHeight = lineHeightMatch ? `${lineHeightMatch[0]};` : '';
      wrapper.setAttribute('style', `display:block;margin:0;padding:0;${lineHeight}`);

      while (li.firstChild) {
        wrapper.appendChild(li.firstChild);
      }
      li.appendChild(wrapper);
    };

    /** @param {Element} li */
    const mergeLabelParagraphs = (li) => {
      const directParagraphs = Array.from(li.children).filter(child => child.tagName === 'P');
      if (directParagraphs.length < 2) return;
      if (!hasInlineLabelPrefix(directParagraphs[0])) return;
      if (!isInlineOnlyParagraph(directParagraphs[0]) || !isInlineOnlyParagraph(directParagraphs[1])) return;

      const first = directParagraphs[0];
      const second = directParagraphs[1];
      if (!second.textContent || !second.textContent.trim()) return;

      while (
        second.firstChild &&
        second.firstChild.nodeType === Node.TEXT_NODE &&
        !second.firstChild.textContent.trim()
      ) {
        second.removeChild(second.firstChild);
      }

      if (first.lastChild && first.lastChild.nodeType === Node.TEXT_NODE) {
        first.lastChild.textContent = first.lastChild.textContent.replace(/\s*$/, ' ');
      } else {
        first.appendChild(activeDocument.createTextNode(' '));
      }

      while (second.firstChild) {
        first.appendChild(second.firstChild);
      }
      second.remove();
    };

    // 1. 处理包含嵌套列表的 li：移除直接子 p，并把前置行内内容包成块级 span
    div.querySelectorAll('li').forEach(li => {
      const directParagraphs = Array.from(li.children).filter(child => child.tagName === 'P');
      directParagraphs.forEach(paragraph => collapseLabelBreakInParagraph(paragraph));
      mergeLabelParagraphs(li);
      unwrapSimpleListParagraphs(li);
      collapseLabelBreakInListItem(li);
      convertLeadingStrongOrCodeToSpan(li);
      collapseLeadingBreakAfterInlinePrefixInListItem(li);
      wrapTextContinuationAfterLeadingPrefix(li);
      bundleLeadingPrefixForWechatLineBreak(li);
      wrapLeadingLabelInBlockSpan(li);

      const hasNestedList = li.querySelector('ul, ol');
      if (!hasNestedList) return;

      // 1.1 解包直接子 p（避免微信将 p 与嵌套列表当成同级）
      Array.from(li.children).forEach(child => {
        if (child.tagName === 'P') {
          while (child.firstChild) {
            li.insertBefore(child.firstChild, child);
          }
          child.remove();
        }
      });

      // 1.2 将嵌套列表前的行内节点包裹为块级 span，稳定层级结构
      const firstList = Array.from(li.children).find(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (!firstList) return;

      /** @type {ChildNode[]} */
      const nodesBeforeList = [];
      for (let node = li.firstChild; node && node !== firstList; node = node.nextSibling) {
        nodesBeforeList.push(node);
      }

      const meaningfulNodes = nodesBeforeList.filter(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );

      if (meaningfulNodes.length === 0) return;

      const blockTags = new Set(['UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE', 'SECTION', 'FIGURE', 'DIV']);
      const hasBlock = meaningfulNodes.some(node =>
        node instanceof Element && blockTags.has(node.tagName)
      );

      if (hasBlock) return;

      const wrapper = activeDocument.createElement('span');
      const liStyle = li.getAttribute('style') || '';
      const lineHeightMatch = liStyle.match(/line-height:\s*[^;]+/i);
      const lineHeight = lineHeightMatch ? `${lineHeightMatch[0]};` : '';
      wrapper.setAttribute('style', `display:block;margin:0;padding:0;${lineHeight}`);

      meaningfulNodes.forEach(node => wrapper.appendChild(node));
      li.insertBefore(wrapper, firstList);
    });

    // 1.5 微信兼容修复：强制列表项内 strong/code 保持行内，避免“标题词”和冒号/正文断行
    /**
     * @param {Element} el
     * @param {string} [extraStyle]
     */
    const forceInlineStyle = (el, extraStyle = '') => {
      const currentStyle = el.getAttribute('style') || '';
      const cleanedStyle = currentStyle
        .replace(/display\s*:\s*[^;]+;?/gi, '')
        .replace(/width\s*:\s*[^;]+;?/gi, '')
        .replace(/float\s*:\s*[^;]+;?/gi, '')
        .trim();
      const normalizedStyle = cleanedStyle
        ? `${cleanedStyle}${cleanedStyle.endsWith(';') ? '' : ';'}`
        : '';
      const finalStyle = `${normalizedStyle}display:inline !important; width:auto !important; float:none !important;${extraStyle}`;
      el.setAttribute('style', finalStyle);
    };

    div.querySelectorAll('li strong').forEach(strong => {
      forceInlineStyle(strong);
    });

    div.querySelectorAll('li code').forEach(code => {
      // 仅修复行内 code，避免误伤列表里的代码块（pre > code）
      if (code.closest('pre, .code-block, .code-block-code')) return;
      forceInlineStyle(code, ' margin:0 2px !important; vertical-align:baseline;');
    });

    // 2. 将列表转为抗微信改写的悬挂缩进伪段落
    /**
     * @param {Element} list
     * @returns {number}
     */
    const getListDepth = list => {
      let depth = 0;
      let current = list.parentElement;
      while (current) {
        if (current.tagName === 'UL' || current.tagName === 'OL') depth += 1;
        current = current.parentElement;
      }
      return depth;
    };

    /**
     * @param {Element} list
     * @param {number} depth
     * @returns {DocumentFragment}
     */
    const buildPseudoItems = (list, depth) => {
      const fragment = activeDocument.createDocumentFragment();
      const isOrdered = list.tagName === 'OL';
      let index = 1;

      Array.from(list.children).forEach(li => {
        if (li.tagName !== 'LI') return;

        const nestedLists = Array.from(li.children).filter(
          child => child.tagName === 'UL' || child.tagName === 'OL'
        );

        const liStyle = li.getAttribute('style') || '';
        const isTask = (() => {
          if (/list-style-type\s*:\s*none/i.test(liStyle) && /margin-left\s*:\s*-\d+px/i.test(liStyle)) return true;
          const text = li.textContent || '';
          return /^[☑☐□]/.test(text.trim());
        })();

        let cleanStyle = liStyle
          .replace(/margin(-[a-z]+)?\s*:\s*[^;]+;?/gi, '')
          .replace(/padding(-[a-z]+)?\s*:\s*[^;]+;?/gi, '')
          .replace(/text-indent\s*:\s*[^;]+;?/gi, '')
          .replace(/list-style(-type)?\s*:\s*[^;]+;?/gi, '')
          .trim();
        if (cleanStyle && !cleanStyle.endsWith(';')) cleanStyle += ';';

        // 列表缩进取自共享的 resolveListIndent（与 themes/apple-theme.js 同源），
        // 保证预览与公众号发布后缩进一致；等宽字体自动获得更大的左内边距。
        const hangingIndent = isTask ? -20 : (isOrdered ? -18 : -14);
        const paddingLeft = Math.max(1, depth) * listIndent;

        /** @type {ChildNode[]} */
        const contentNodes = [];
        /** @param {NodeList | ChildNode[] | unknown[]} nodes */
        const extractNodes = (nodes) => {
          Array.from(nodes).forEach(rawNode => {
            const node = /** @type {ChildNode} */ (rawNode);
            if (node instanceof Element && (node.tagName === 'UL' || node.tagName === 'OL')) return;
            // 将列表项内部包装的 p 或 display:block span 解包为行内流，避免段落内换行脱节
            if (node instanceof Element && (node.tagName === 'P' || (node.tagName === 'SPAN' && /display\s*:\s*block/i.test(node.getAttribute('style') || '')))) {
              const children = Array.from(node.childNodes);
              if (children.length && contentNodes.length) {
                contentNodes.push(activeDocument.createTextNode(' '));
              }
              extractNodes(children);
              return;
            }
            contentNodes.push(node);
          });
        };
        extractNodes(li.childNodes);

        // Trim leading whitespace-only text nodes
        while (contentNodes.length > 0 && contentNodes[0].nodeType === Node.TEXT_NODE && !contentNodes[0].textContent.trim()) {
          contentNodes.shift();
        }
        if (contentNodes.length > 0 && contentNodes[0].nodeType === Node.TEXT_NODE) {
          contentNodes[0].textContent = contentNodes[0].textContent.replace(/^\s+/, '');
          if (!contentNodes[0].textContent) contentNodes.shift();
        }

        const hasContent = contentNodes.some(node => node.nodeType === Node.TEXT_NODE ? Boolean(node.textContent.trim()) : true);

        if (hasContent) {
          contentNodes.forEach(node => {
            if (node.nodeType !== Node.TEXT_NODE) return;
            node.textContent = node.textContent.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ');
            if (!node.textContent.trim()) node.remove();
          });

          while (contentNodes.length > 0 && contentNodes[contentNodes.length - 1].nodeType === Node.TEXT_NODE && !contentNodes[contentNodes.length - 1].textContent.trim()) {
            contentNodes.pop();
          }
          if (contentNodes.length > 0 && contentNodes[contentNodes.length - 1].nodeType === Node.TEXT_NODE) {
            contentNodes[contentNodes.length - 1].textContent = contentNodes[contentNodes.length - 1].textContent.replace(/\s+$/, '');
          }

          // 分段挂载：遇块级元素（PRE/TABLE/BLOCKQUOTE等）解构为同级兄弟，防止微信/浏览器在 p 内遇块级时提前闭合
          /** @type {HTMLElement | null} */
          let currentP = null;
          let isFirstP = true;

          const appendToParagraph = (node) => {
            if (!currentP) {
              currentP = activeDocument.createElement('p');
              const indent = isFirstP
                ? `margin: 4px 0; padding-left: ${paddingLeft}px; text-indent: ${hangingIndent}px;`
                : `margin: 4px 0; padding-left: ${paddingLeft}px;`;
              currentP.setAttribute('style', `${cleanStyle} ${indent}`);
              if (isFirstP && !isTask) {
                const markerSpan = activeDocument.createElement('span');
                markerSpan.textContent = isOrdered ? `${index}. ` : '• ';
                currentP.appendChild(markerSpan);
              }
              isFirstP = false;
              fragment.appendChild(currentP);
            }
            if (currentP) {
              (/** @type {HTMLElement} */ (currentP)).appendChild(node);
            }
          };

          contentNodes.forEach(node => {
            const isBlock = node instanceof Element && (
              LIST_DISMANTLE_BLOCK_TAGS.has(node.tagName) || node.classList.contains('code-block')
            );
            if (isBlock) {
              currentP = null;
              if (isFirstP && !isTask) {
                const markerP = activeDocument.createElement('p');
                markerP.setAttribute('style', `${cleanStyle} margin: 4px 0; padding-left: ${paddingLeft}px; text-indent: ${hangingIndent}px;`);
                const markerSpan = activeDocument.createElement('span');
                markerSpan.textContent = isOrdered ? `${index}. ` : '• ';
                markerP.appendChild(markerSpan);
                fragment.appendChild(markerP);
              }
              isFirstP = false;
              const blockEl = /** @type {Element} */ (node);
              const bStyle = blockEl.getAttribute('style') || '';
              if (!/margin-left/i.test(bStyle)) {
                blockEl.setAttribute('style', `${bStyle ? bStyle + ';' : ''} margin-left: ${paddingLeft}px;`);
              }
              fragment.appendChild(blockEl);
            } else {
              appendToParagraph(node);
            }
          });
        }

        nestedLists.forEach(nested => {
          fragment.appendChild(buildPseudoItems(nested, depth + 1));
        });

        index += 1;
      });

      return fragment;
    };

    Array.from(div.querySelectorAll('ul, ol')).forEach(list => {
      if (!div.contains(list)) return;
      const isUl = list.tagName === 'UL';
      const depth = getListDepth(list) + 1;
      // 1. 无序列表（UL）在微信草稿箱中必然被重写（丢弃样式、强制转 class、子项包 p 导致圆点文字脱节或居中错位，见 #78）
      //    因此无序列表自第 1 层起全部转换为悬挂缩进的抗改写段落；
      // 2. 有序列表（OL）保持现有策略：深层嵌套（depth >= 2）转为伪段落，第 1 层保留以保持原生数字编号及标签行内化。
      if (!isUl && depth < 2) return;
      const fragment = buildPseudoItems(list, depth);
      if (list.parentNode) {
        list.parentNode.insertBefore(fragment, list);
      }
      list.remove();
    });

    // 3. 处理嵌套的 ul/ol（在 li 内的列表）：移除 margin，调整缩进
    div.querySelectorAll('li > ul, li > ol').forEach(nestedList => {
      let style = (nestedList.getAttribute('style') || '').replace(/margin(-[a-z]+)?:\s*[^;]+;?/gi, '');
      nestedList.setAttribute('style', `margin: 0; ${style}`);
    });

    // 4. 移除空的 li 元素与纯空白文本节点
    div.querySelectorAll('li').forEach(li => {
      if (!li.textContent.trim() && li.querySelectorAll('img, ul, ol').length === 0) li.remove();
    });
    div.querySelectorAll('ul, ol, li').forEach(el => {
      Array.from(el.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) node.remove();
      });
    });

    // 8. 微信公众号兼容：将 blockquote 转换为带有完全相同样式的 section 标签
    div.querySelectorAll('blockquote').forEach(bq => {
      const section = activeDocument.createElement('section');
      Array.from(bq.attributes).forEach(attr => section.setAttribute(attr.name, attr.value));
      while (bq.firstChild) section.appendChild(bq.firstChild);
      bq.replaceWith(section);
    });

    return div.innerHTML;
  }
