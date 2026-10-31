/*
## 核心功能

实现微信公众号排版与草稿发布场景下的空白与软换行清洗（wechat whitespace cleaner）。

## 输入

接收 HTML 容器 DOM 元素或 HTML 字符串。

## 输出

输出 `collapseWhitespaceAroundBreak`、`trimBlockEdgeWhitespace` 与 `cleanHtmlWhitespaceForWechat`，
消除非代码块中 `<br>` 紧邻换行符 `\n` 在微信富文本编辑器中被误解析为行首空格的问题，同时保护代码块与中文全角缩进。

## 定位

位于 services/，属于微信排版与富文本清理服务层。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 绝不能修改 `<pre>`/`<code>` 等代码块内部的任何换行与空格。
- 绝不能将中文全角空格 `\u3000` 或 `&emsp;` 作为普通空白误删。
*/

import { createHtmlContainer, getActiveDocument } from './dom-utils.js';

const PROTECTED_SELECTOR = 'pre, code, .code-block, .code-scroll, .code-lines, mjx-container, svg, math';
const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, figcaption, td, th';

/**
 * 检查节点是否位于受保护容器（如代码块、公式、SVG）内
 * @param {Node | null | undefined} node
 * @returns {boolean}
 */
export function isProtectedElement(node) {
  if (!node) return false;
  /** @type {Element | null} */
  const el = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest(PROTECTED_SELECTOR));
}

/**
 * 递归获取元素内部第一个文本节点（跳过受保护元素）
 * @param {Node | null | undefined} node
 * @returns {Text | null}
 */
function getFirstDescendantTextNode(node) {
  if (!node) return null;
  if (node.nodeType === 3) return /** @type {Text} */ (node);
  if (node.nodeType === 1 && !isProtectedElement(node)) {
    let child = node.firstChild;
    while (child) {
      const found = getFirstDescendantTextNode(child);
      if (found) return found;
      child = child.nextSibling;
    }
  }
  return null;
}

/**
 * 清理非代码块中 `<br>` 周围的换行符与多余空白
 * 消除 Markdown 紧贴换行（softbreak）渲染出 `<br>\n` 导致微信编辑器行首产生空格的问题
 * @param {Element | null | undefined} container
 */
export function collapseWhitespaceAroundBreak(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return;

  const breaks = Array.from(container.querySelectorAll('br'));
  for (const br of breaks) {
    if (isProtectedElement(br)) continue;

    // 1. 清理 br 之前文本节点的尾随 ASCII 空白（不碰全角空格）
    const prev = br.previousSibling;
    if (prev && prev.nodeType === 3) {
      prev.textContent = String(prev.textContent || '').replace(/[ \t]+$/, '');
    }

    // 2. 清理 br 之后紧邻的换行符及伴随的普通 ASCII 空白/制表符
    let next = br.nextSibling;
    while (next) {
      if (next.nodeType === 3) {
        const text = String(next.textContent || '');
        if (/^[\r\n]/.test(text)) {
          next.textContent = text.replace(/^[\r\n]+[ \t]*/, '');
          if (!next.textContent) {
            const nextNode = next.nextSibling;
            next.remove();
            next = nextNode;
            continue;
          }
        }
        break;
      }

      // 如果紧随其后的是普通内联元素（如 strong, em, span 等），检查其内部起始文本节点
      if (next.nodeType === 1 && !isProtectedElement(next)) {
        const firstText = getFirstDescendantTextNode(next);
        if (firstText) {
          const text = String(firstText.textContent || '');
          if (/^[\r\n]/.test(text)) {
            firstText.textContent = text.replace(/^[\r\n]+[ \t]*/, '');
          }
        }
      }
      break;
    }
  }
}

/**
 * 修剪常见文本块级元素首尾的 ASCII 空白与换行
 * @param {Element | null | undefined} container
 */
export function trimBlockEdgeWhitespace(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return;

  const blocks = Array.from(container.querySelectorAll(BLOCK_SELECTOR));
  for (const block of blocks) {
    if (isProtectedElement(block)) continue;

    // 首部清理：仅匹配 ASCII 空格、制表符、NBSP 及换行，完整保留全角空格 \u3000
    let first = block.firstChild;
    while (first) {
      if (first.nodeType === 3) {
        const text = String(first.textContent || '');
        const trimmed = text.replace(/^[ \t\r\n\u00a0]+/, '');
        if (trimmed !== text) {
          first.textContent = trimmed;
        }
        if (!first.textContent) {
          const next = first.nextSibling;
          first.remove();
          first = next;
          continue;
        }
      }
      break;
    }

    // 尾部清理
    let last = block.lastChild;
    while (last) {
      if (last.nodeType === 3) {
        const text = String(last.textContent || '');
        const trimmed = text.replace(/[ \t\r\n\u00a0]+$/, '');
        if (trimmed !== text) {
          last.textContent = trimmed;
        }
        if (!last.textContent) {
          const prev = last.previousSibling;
          last.remove();
          last = prev;
          continue;
        }
      }
      break;
    }
  }
}

/**
 * 综合清洗 HTML 中的空白与 `<br>` 软换行符
 * @param {Element | string} containerOrHtml
 * @returns {Element | string}
 */
export function cleanHtmlWhitespaceForWechat(containerOrHtml) {
  if (!containerOrHtml) return containerOrHtml;

  if (typeof containerOrHtml === 'string') {
    const activeDocument = getActiveDocument();
    if (!activeDocument) return containerOrHtml;
    const div = createHtmlContainer('div', containerOrHtml);
    if (!div) return containerOrHtml;
    collapseWhitespaceAroundBreak(div);
    trimBlockEdgeWhitespace(div);
    return div.innerHTML;
  }

  collapseWhitespaceAroundBreak(containerOrHtml);
  trimBlockEdgeWhitespace(containerOrHtml);
  return containerOrHtml;
}
