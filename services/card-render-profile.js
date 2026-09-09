/*
## 核心功能

图片卡片渲染配置（A03）：把 CardDocument 的块账本渲染为**语义化卡片 DOM**——不经过公众号内联样式管线，所有节点用安全 DOM API 构建（不使用 innerHTML）。

## 输入

CardDocument（services/card-document.js）；可选 `resolveImageSrc(ref)`（A04 接管资源解析，A03 实验用 dataURL 注入）。

## 输出

`renderBlockContent(doc, options)` → { fragment, skipped }：块的 DOM 片段；`renderInlineMarkdown(text)` → DocumentFragment（行内语义：加粗/斜体/删除线/行内代码/链接/图片）。

## 安全边界

- 行内内容用独立 MarkdownIt 实例（`html: false`）解析：原始 HTML 一律转义为文本，不执行、不注入。
- 链接仅放行 http(s)/mailto/相对路径；其他 scheme 降级为纯文本。
- 图片 ref 由调用方 resolver 决定 src；返回 null 则跳过该图（不做未经校验的远程加载）。
- GIF/被排除图片不渲染（与账本 disposition/excluded 一致）。

## 定位

位于 services/，卡片 DOM 语义层；工具壳/预览容器样式不得混入卡片成品（截图节点与工具壳分离）。

## 依赖

`markdown-it`（parseInline token 流）；浏览器 DOM API。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
*/

import MarkdownIt from "markdown-it";

/* markdown-it 为无类型 JS 包（inline token children 按运行时形态处理），TS 服务器推断为 any；
   所有节点均通过安全 DOM API 构建并经 card_render_profile.test.js 断言，此处关闭 unsafe-* 检查 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- markdown-it 无类型定义 */

/** 行内解析实例：html:false 保证原始 HTML 被转义；breaks:false 保持行内语义 */
const inlineMd = new MarkdownIt({ html: false, breaks: false, linkify: false });

const SAFE_HREF_REGEX = /^(https?:\/\/|mailto:|#|\.\/|\/)/i;

/**
 * 行内 markdown → DocumentFragment（安全 DOM 构建）。
 * @param {string} text
 * @param {{resolveImageSrc?: (ref: string) => string | null, skipImages?: boolean, doc?: Document}} [options]
 * @returns {DocumentFragment}
 */
export function renderInlineMarkdown(text, options = {}) {
  const ownerDoc = options.doc || window.document;
  const fragment = ownerDoc.createDocumentFragment();
  if (!text) return fragment;

  const tokens = inlineMd.parseInline(text, {});
  const inline = tokens.find((t) => t.type === "inline");
  const children = (inline && inline.children) || [];

  /** @type {Element[]} */
  const stack = [fragment];

  const append = (node) => {
    const parent = stack[stack.length - 1];
    if ("append" in parent) parent.append(node);
  };

  for (const token of children) {
    switch (token.type) {
      case "text":
        append(ownerDoc.createTextNode(token.content));
        break;
      case "softbreak":
        append(ownerDoc.createTextNode(" "));
        break;
      case "hardbreak":
        append(ownerDoc.createElement("br"));
        break;
      case "code_inline": {
        const code = ownerDoc.createElement("code");
        code.textContent = token.content;
        append(code);
        break;
      }
      case "strong_open":
        stack.push(ownerDoc.createElement("strong"));
        break;
      case "em_open":
        stack.push(ownerDoc.createElement("em"));
        break;
      case "s_open":
        stack.push(ownerDoc.createElement("del"));
        break;
      case "strong_close":
      case "em_close":
      case "s_close":
        if (stack.length > 1) {
          const node = stack.pop();
          append(node);
        }
        break;
      case "link_open": {
        const href = token.attrGet("href") || "";
        const anchor = ownerDoc.createElement("a");
        if (SAFE_HREF_REGEX.test(href)) {
          anchor.setAttribute("href", href);
          anchor.textContent = "";
          stack.push(anchor);
        } else {
          // 不安全 scheme：不创建链接，后续文本直接落入父节点
          stack.push(stack[stack.length - 1]);
        }
        break;
      }
      case "link_close":
        if (stack.length > 1) {
          const node = stack.pop();
          if (node !== stack[stack.length - 1]) append(node);
        }
        break;
      case "image": {
        if (options.skipImages) break;
        const src = token.attrGet("src") || "";
        // 无 resolver 一律跳过：不产生未经校验的图片 src
        const resolved = options.resolveImageSrc ? options.resolveImageSrc(src) : null;
        if (!resolved) break;
        const img = ownerDoc.createElement("img");
        img.setAttribute("src", resolved);
        const alt = token.content || "";
        if (alt) img.setAttribute("alt", alt);
        append(img);
        break;
      }
      default:
        // html_inline 等：html:false 下已被转义为文本 token；其他类型忽略
        if (token.type === "html_inline") {
          append(ownerDoc.createTextNode(token.content || ""));
        }
        break;
    }
  }
  // 未闭合容器的兜底：把残留节点挂回 fragment
  while (stack.length > 1) {
    const node = stack.pop();
    if (node !== fragment) append(node);
  }
  return fragment;
}

/**
 * 创建列表 marker（显式 DOM 元素，不依赖 ::marker——捕获引擎/宿主环境对 ::marker 的支持不一致）。
 * @param {Document} ownerDoc
 * @param {string} text
 * @returns {HTMLElement}
 */
function createListMarker(ownerDoc, text) {
  const marker = ownerDoc.createElement("span");
  marker.className = "icard-marker";
  marker.textContent = text;
  return marker;
}

/**
 * 渲染列表项集合（含 marker/任务框/嵌套子列表），供顶层与嵌套列表共用。
 * @param {Document} ownerDoc
 * @param {Array<object>} items
 * @param {{resolveImageSrc?: (ref: string) => string | null, doc?: Document}} options
 * @param {{ordered: boolean, startNum: number, nestedDepth: number}} meta
 * @returns {Array<HTMLElement>}
 */
function renderListItems(ownerDoc, items, options, meta) {
  return items
    .filter((item) => item.disposition !== "omit")
    .map((item, order) => {
      const li = ownerDoc.createElement("li");
      if (meta.nestedDepth >= 1 && meta.nestedDepth <= 2) {
        li.classList.add(`icard-nested-${meta.nestedDepth}`);
      }
      if (item.task !== undefined) {
        li.classList.add("icard-task");
        if (item.task) li.classList.add("icard-task-done");
      } else {
        const markerText = meta.ordered ? `${meta.startNum + (item.index ?? order)}.` : "•";
        li.append(createListMarker(ownerDoc, markerText));
      }
      // 任务标记已用勾选框表达，从文本中剥离 [x]/[ ] 前缀
      let text = item.text || "";
      if (item.task !== undefined) text = text.replace(/^\s*\[[xX ]\][ \t]*/, "");
      if (text) li.append(renderInlineMarkdown(text, options));
      if (item.task !== undefined) {
        const box = ownerDoc.createElement("span");
        box.className = "icard-task-box";
        box.textContent = item.task ? "✓" : "";
        li.prepend(box);
      }
      const images = (item.images || []).filter((img) => !img.gif && !img.excluded);
      for (const image of images) {
        const resolved = options.resolveImageSrc ? options.resolveImageSrc(image.ref) : null;
        if (!resolved) continue;
        const img = ownerDoc.createElement("img");
        img.setAttribute("src", resolved);
        li.append(ownerDoc.createTextNode(" "));
        li.append(img);
      }
      if (item.childList && Array.isArray(item.childList.items) && item.childList.items.length > 0) {
        li.append(renderNestedList(item.childList, options, meta.nestedDepth + 1));
      }
      return li;
    });
}

/**
 * 渲染嵌套子列表（递归，最多 3 层防失控）。
 * @param {{ordered: boolean, items: Array<object>}} childList
 * @param {{resolveImageSrc?: (ref: string) => string | null, doc?: Document}} options
 * @param {number} depth
 * @returns {Element}
 */
function renderNestedList(childList, options, depth) {
  const ownerDoc = options.doc || window.document;
  const list = ownerDoc.createElement(childList.ordered ? "ol" : "ul");
  for (const li of renderListItems(ownerDoc, childList.items, options, {
    ordered: childList.ordered,
    startNum: 1,
    nestedDepth: depth,
  })) {
    list.append(li);
  }
  return list;
}

/**
 * 段落字符包裹（测量/拆分基建）：把段落内每个 CJK 字符 / 拉丁词包进带
 * data-icard-span 序号的 span，返回 span 总数。包裹确定性可重放（测量与装配两次渲染结果一致）。
 * @param {HTMLElement} paragraphEl
 * @param {Document} ownerDoc
 * @returns {number}
 */
export function wrapParagraphSpans(paragraphEl, ownerDoc) {
  const walker = ownerDoc.createTreeWalker(paragraphEl, /** @type {any} */ (window.NodeFilter ?? 1).SHOW_TEXT);
  /** @type {Text[]} */
  const textNodes = [];
  let node = /** @type {Text | null} */ (walker.nextNode());
  while (node) {
    textNodes.push(node);
    node = /** @type {Text | null} */ (walker.nextNode());
  }
  let spanIndex = 0;
  for (const textNode of textNodes) {
    const raw = textNode.textContent || "";
    if (!raw) continue;
    const fragment = ownerDoc.createDocumentFragment();
    // 切分单元：连续拉丁词/数字一个 span，CJK/其他逐字一个 span
    const parts = raw.match(/[A-Za-z0-9@#$%^&*()_+=\-[{\]}:;"'<>,.?/\\|`~!]+|./gs) || [];
    for (const part of parts) {
      const span = ownerDoc.createElement("span");
      span.setAttribute("data-icard-span", String(spanIndex));
      span.textContent = part;
      fragment.append(span);
      spanIndex += 1;
    }
    textNode.replaceWith(fragment);
  }
  return spanIndex;
}

/**
 * 段落 span 区间过滤（拆分装配用）：保留 [start, end) 的 span，剪掉变空的行内包装元素。
 * @param {HTMLElement} paragraphEl
 * @param {number} start
 * @param {number} end
 */
export function filterParagraphSpans(paragraphEl, start, end) {
  const spans = Array.from(paragraphEl.querySelectorAll("span[data-icard-span]"));
  for (const span of spans) {
    const index = Number(span.getAttribute("data-icard-span"));
    if (!(index >= start && index < end)) {
      span.remove();
    }
  }
  // 剪掉没有孩子的行内包装（strong/em/del/code/a/span 等），避免空标签影响行高
  /** @type {Element[]} */
  const inlineTags = ["strong", "em", "del", "code", "a", "b", "i", "s", "span"];
  let changed = true;
  while (changed) {
    changed = false;
    for (const tag of inlineTags) {
      for (const el of Array.from(paragraphEl.querySelectorAll(tag))) {
        if (el.childNodes.length === 0) {
          el.remove();
          changed = true;
        }
      }
    }
  }
}

/**
 * 渲染单个块（不含子块），返回根元素或 null（跳过）。
 * @param {any} block CardBlock
 * @param {{resolveImageSrc?: (ref: string) => string | null, doc?: Document, listItemRange?: [number, number], paragraphSpanRange?: [number, number]}} options
 * @returns {Element | null}
 */
export function renderBlockElement(block, options = {}) {
  const ownerDoc = options.doc || window.document;
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level || 1, 1), 6);
      const el = ownerDoc.createElement(`h${level}`);
      el.append(renderInlineMarkdown(block.text || "", options));
      return el;
    }
    case "paragraph": {
      const p = ownerDoc.createElement("p");
      p.append(renderInlineMarkdown(block.text || "", options));
      const images = (block.images || []).filter((img) => !img.gif && !img.excluded);
      // 去重：block.text 通常保留图片 markdown，行内渲染已产出 <img>；此处仅补充
      // 文本流里没有的图（如 wiki 嵌入提取出的 ref），避免同一张图渲染两次（B02 实机回归）。
      const renderedSrcs = new Set(Array.from(p.querySelectorAll("img")).map((im) => im.getAttribute("src")));
      for (const image of images) {
        const resolved = options.resolveImageSrc ? options.resolveImageSrc(image.ref) : null;
        if (!resolved || renderedSrcs.has(resolved)) continue;
        const img = ownerDoc.createElement("img");
        img.setAttribute("src", resolved);
        img.setAttribute("alt", "");
        p.append(ownerDoc.createTextNode(" "));
        p.append(img);
      }
      if (options.paragraphSpanRange) {
        const [s, e] = options.paragraphSpanRange;
        wrapParagraphSpans(p, ownerDoc);
        filterParagraphSpans(p, s, e);
        p.classList.add("icard-continued");
      }
      return p;
    }
    case "list": {
      const list = ownerDoc.createElement(block.ordered ? "ol" : "ul");
      const range = options.listItemRange;
      if (block.ordered) {
        const startNum = (block.listStart || 1) + (range ? range[0] : 0);
        if (startNum !== 1 || range) {
          list.setAttribute("start", String(startNum));
        }
      }
      const lis = renderListItems(ownerDoc, block.items || [], options, {
        ordered: Boolean(block.ordered),
        startNum: block.listStart || 1,
        nestedDepth: 0,
      });
      for (const li of range ? lis.slice(range[0], range[1]) : lis) {
        list.append(li);
      }
      return list;
    }
    case "table": {
      const table = ownerDoc.createElement("table");
      const rows = block.rows || [];
      rows.forEach((row, index) => {
        const tr = ownerDoc.createElement("tr");
        const isHead = index === 0;
        for (const cell of row) {
          const cellEl = ownerDoc.createElement(isHead ? "th" : "td");
          cellEl.append(renderInlineMarkdown(cell, options));
          tr.append(cellEl);
        }
        table.append(tr);
      });
      return table;
    }
    case "hr":
      return ownerDoc.createElement("hr");
    default:
      // callout/blockquote 由 renderBlocksWithChildren 处理；其余类型跳过
      return null;
  }
}

/**
 * 渲染块序列（处理 callout/blockquote 的子块归属）。
 * @param {any} doc CardDocument
 * @param {{resolveImageSrc?: (ref: string) => string | null, doc?: Document, skipImages?: boolean}} [options]
 * @returns {{fragment: DocumentFragment, skipped: number}}
 */
export function renderBlockContent(doc, options = {}) {
  const ownerDoc = options.doc || window.document;
  const fragment = ownerDoc.createDocumentFragment();
  let skipped = 0;

  const childrenOf = (parentId) => doc.blocks.filter((b) => b.parentId === parentId);
  let quoteCount = 0;

  for (const block of doc.blocks) {
    if (block.parentId) continue; // 子块由容器处理
    if (block.disposition === "omit" || block.disposition === "marker") {
      skipped += 1;
      continue;
    }
    if (block.type === "callout" || block.type === "blockquote") {
      quoteCount += 1;
      const quote = renderCalloutBlock(block, childrenOf(block.id), options);
      fragment.append(quote);
      continue;
    }
    const el = renderBlockElement(block, options);
    if (el) fragment.append(el);
    else skipped += 1;
  }
  void quoteCount;
  return { fragment, skipped };
}

/**
 * 渲染 callout/blockquote 容器（完整或子块区间片段，分页续页用）。
 * - 标题只从首子块的 [!type] 标记提取；continued 时标题追加「（续）」。
 * - childRange 省略时渲染全部 render 子块；区间只作用于子块序列（标题恒显示）。
 * - 剥离标题后变空的段落跳过（避免空 <p>）。
 * @param {any} block callout/blockquote 块
 * @param {any[]} children 子块数组（renderBlockContent.childrenOf 产出）
 * @param {{resolveImageSrc?: (ref: string) => string | null, doc?: Document, childRange?: [number, number], continued?: boolean}} options
 * @returns {HTMLElement}
 */
export function renderCalloutBlock(block, children, options = {}) {
  const ownerDoc = options.doc || window.document;
  const quote = ownerDoc.createElement("blockquote");
  const first = children[0];
  const isCallout = block.type === "callout";
  if (isCallout) {
    const calloutMatch = first ? /^\[!([A-Za-z-]+)\][ \t]*(.*)/.exec(String(first.text || "").trim()) : null;
    const titleText = calloutMatch ? calloutMatch[2] || calloutMatch[1] : block.calloutType || "";
    const title = ownerDoc.createElement("div");
    title.className = "icard-callout-title";
    title.textContent = options.continued && titleText ? `${titleText}（续）` : titleText;
    quote.append(title);
  }
  const range = options.childRange;
  const renderChildren = children.filter((c) => c.disposition === "render");
  const selected = range ? renderChildren.slice(range[0], range[1]) : renderChildren;
  for (const child of selected) {
    const isTitleBearing = isCallout && child === first;
    let renderBlock = child;
    if (isTitleBearing) {
      // 标记与标题同处首段：整段匹配（如 "[!note] 捕获提示"）从首段剥离，标题只留在 title
      const calloutMatch = /^\[!([A-Za-z-]+)\][ \t]*(.*)/.exec(String(child.text || "").trim());
      const stripped = calloutMatch
        ? String(child.text || "").replace(calloutMatch[0], "").trim()
        : String(child.text || "");
      renderBlock = { ...child, text: stripped };
    }
    const el = renderBlockElement(renderBlock, options);
    if (!el) continue;
    // 剥离标题后变空的段落不渲染（避免空 <p>）
    if (isTitleBearing && el.tagName === "P" && !(el.textContent || "").trim() && !el.querySelector("img")) continue;
    quote.append(el);
  }
  return quote;
}
