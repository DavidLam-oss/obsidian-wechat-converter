/*
## 核心功能

图片卡片一期（A02）：把 Markdown 解析为「内容账本」——块序列、源位置、手动分页指令与省略诊断。纯解析层，不依赖 DOM/浏览器，产出供分页器（A05）与导出服务消费。

## 输入

Markdown 源字符串；options：`markdownIt`（可选注入实例）。

## 输出

`createCardDocument()` → CardDocument：
- `blocks[]`：每个块含 id/parentId/type/level/ordered/taskList/calloutType/sourceStart/sourceEnd（1-based，含 frontmatter 行号）/disposition（render|omit|marker）/omitReason/highRisk/images/items 等；
- `frontmatter`：范围 + 简单字段抽取（title/author/date/description）；
- `paginationMarkers`：手动分页指令（独立成行的 `===` 或块级 `<!-- card:break -->`）的 1-based 行位置（连写按出现次数展开）；
- `diagnostics[]` / `omissionSummary`：互斥主要原因计数（codeBlock/mermaid/gif/blockFormula/inlineFormula/unsupportedEmbed）；
- `meta`：hasRenderableContent / onlyCoverCandidate。

## 边界（一期规则，源自规划 §4.1/§4.2）

- 代码块、Mermaid、GIF、块级公式默认省略并计数；行内公式所在段/列表项整块省略并标记高风险。
- 分页指令只在「独立块级」位置生效：独立成行的 `===`（小白友好简写）或独立块级 HTML 注释 `<!-- card:break -->`；frontmatter、围栏代码、行内代码中的同串不触发；不做全局正则替换。
- `---` 保持分割线语义；`===` 一律作分页符（Setext 两行标题在卡片模式不支持，一级标题请用 `#`）。
- 不修改源 Markdown；所有解析基于副本。
- 未支持的自定义 HTML / 非 图片类 wiki 嵌入 → unsupportedEmbed 诊断，不静默丢弃。

## 定位

位于 services/，卡片功能的数据基础层；不导入 Obsidian 运行时，可在 Vitest/node 下独立测试。

## 依赖

`markdown-it`（仅 md.parse 的 token 流与 map 源定位；不使用其渲染结果）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 样本预期账本 `tests/fixtures/image-card/expected.json` 是本模块单测的断言输入，改样本必须同步改账本。
*/

import MarkdownIt from "markdown-it";

/* markdown-it 为无类型 JS 包（token/map 结构按运行时形态处理）， TS 服务器推断为 any；
   输出结构已由本文件头部 JSDoc 契约与 card_document.test.js 断言约束，此处关闭 unsafe-* 检查 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- markdown-it 无类型定义 */

export const CARD_BREAK_TAG = "card:break";

/** 匹配单个 card:break 注释（用于独立注释块内的计数） */
const CARD_BREAK_REGEX = /<!--\s*card:break\s*-->/g;
/** Obsidian wiki 图片/文件嵌入 */
const WIKI_EMBED_REGEX = /!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
/** 行内公式 $...$（不含 $$、不跨行、忽略 \$ 转义的简单近似） */
const INLINE_FORMULA_REGEX = /(?:^|[^\\$])\$(?!\$)([^$\n]+?)\$(?!\$)/;
/** 任务列表标记 */
const TASK_MARKER_REGEX = /^\[([ xX])\]\s+/;
/** GIF 扩展名 */
const GIF_EXT_REGEX = /\.gif(?:$|[?#])/i;
/** 视为图片的扩展名（wiki 嵌入判定用） */
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(?:$|[?#])/i;
/** 常规 Markdown 图片 */
const MD_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export const OmitReason = {
  CODE_BLOCK: "codeBlock",
  MERMAID: "mermaid",
  GIF: "gif",
  BLOCK_FORMULA: "blockFormula",
  INLINE_FORMULA: "inlineFormula",
  UNSUPPORTED_EMBED: "unsupportedEmbed",
};

export const BlockDisposition = {
  RENDER: "render",
  OMIT: "omit",
  MARKER: "marker",
};

const OMIT_REASON_KEYS = [
  OmitReason.CODE_BLOCK,
  OmitReason.MERMAID,
  OmitReason.GIF,
  OmitReason.BLOCK_FORMULA,
  OmitReason.INLINE_FORMULA,
  OmitReason.UNSUPPORTED_EMBED,
];

/**
 * @typedef {"render"|"omit"|"marker"} BlockDispositionValue
 * @typedef {{
 *   id: string,
 *   parentId?: string,
 *   depth: number,
 *   type: string,
 *   level?: number,
 *   ordered?: boolean,
 *   listStart?: number,
 *   taskList?: boolean,
 *   calloutType?: string,
 *   sourceStart: number,
 *   sourceEnd: number,
 *   disposition: BlockDispositionValue,
 *   omitReason?: string,
 *   omitDetail?: string,
 *   highRisk?: boolean,
 *   markerCount?: number,
 *   images?: Array<{ref: string, kind: "local"|"wiki"|"remote", gif: boolean, excluded?: boolean}>,
 *   items?: Array<object>,
 *   itemCount?: number,
 *   text?: string,
 * }} CardBlock
 * @typedef {{
 *   blockId: string,
 *   reason: string,
 *   highRisk: boolean,
 *   sourceStart: number,
 *   sourceEnd: number,
 *   detail: string,
 *   primary: boolean,
 * }} CardDiagnostic
 * @typedef {{
 *   source: string,
 *   frontmatter: null | {startLine: number, endLine: number, raw: string, fields: Record<string, string>},
 *   blocks: CardBlock[],
 *   paginationMarkers: Array<{line: number, index: number}>,
 *   diagnostics: CardDiagnostic[],
 *   omissionSummary: Record<string, number> & {total: number},
 *   meta: {hasRenderableContent: boolean, onlyCoverCandidate: boolean, blockCount: number},
 * }} CardDocument
 */

/**
 * 检测 Obsidian frontmatter（首行 `---` 且存在闭合行）。
 * @param {string[]} lines
 * @returns {{startLine: number, endLine: number} | null} 0-based 行号
 */
export function detectFrontmatterRange(lines) {
  if (!lines.length || lines[0].trim() !== "---") return null;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "---" || t === "...") {
      return { startLine: 0, endLine: i };
    }
  }
  return null;
}

/**
 * 从 frontmatter 原文中做宽松 key: value 抽取（不引入 YAML 解析器；嵌套列表忽略）。
 * @param {string} raw
 * @returns {Record<string, string>}
 */
export function parseFrontmatterFields(raw) {
  const fields = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    if (value !== "") fields[key] = value;
  }
  return fields;
}

/**
 * 行扫描围栏状态机：返回每行是否处于围栏代码内（0-based 行号集合）。
 * @param {string[]} lines
 * @returns {{inFence: Set<number>, fenceLines: Set<number>}}
 */
function scanFenceLines(lines) {
  const inFence = new Set();
  const fenceLines = new Set();
  let fenceMarker = "";
  let inside = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const isFenceOpener = /^(```|~~~)/.test(trimmed);
    if (!inside && isFenceOpener) {
      inside = true;
      fenceMarker = trimmed.slice(0, 3);
      fenceLines.add(i);
      continue;
    }
    if (inside) {
      inFence.add(i);
      if (isFenceOpener && trimmed.startsWith(fenceMarker)) {
        inside = false;
        fenceLines.add(i);
      }
    }
  }
  return { inFence, fenceLines };
}

/**
 * `===` 分页符：正文里「独立成行的 `===`」一律替换为分页注释（仅解析副本，1:1 行替换，行号不变）。
 * 规则对小白最简单：写 `===` 那一行就是分页；代价是 Setext 两行标题（`文字\n===`）在卡片模式
 * 不再可用（用 `#` 一级标题代替）。frontmatter 与围栏代码内不触发。
 * @param {string[]} lines 全文行
 * @param {number} bodyStart 正文起始 0-based 行号
 * @returns {{parseLines: string[], replacedLines: Set<number>}}
 */
function applyEqualsBreaks(lines, bodyStart) {
  const parseLines = lines.slice();
  const replacedLines = new Set();
  const { inFence } = scanFenceLines(lines);
  for (let i = Math.max(bodyStart, 0); i < lines.length; i++) {
    if (inFence.has(i)) continue;
    if (lines[i].trim() !== "===") continue;
    parseLines[i] = "<!-- card:break -->";
    replacedLines.add(i);
  }
  return { parseLines, replacedLines };
}

/**
 * 从表格原始行提取单元格文本（跳过分隔行；不解析对齐语法）。
 * @param {string[]} allLines 全文行
 * @param {number} lineStart 0-based 全文行（含）
 * @param {number} lineEnd 0-based 全文行（不含）
 * @returns {string[][]}
 */
function extractTableRows(allLines, lineStart, lineEnd) {
  const rows = [];
  for (let i = lineStart; i < lineEnd && i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (!line.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|?$/.test(line)) continue; // 分隔行
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    rows.push(cells);
  }
  return rows;
}

function classifyImageRef(ref) {
  const kind = /^https?:\/\//i.test(ref) ? "remote" : "local";
  return { ref, kind, gif: GIF_EXT_REGEX.test(ref) };
}

/**
 * 从块的原始源行中收集图片引用（markdown 形式 + wiki 嵌入）。
 * @param {string[]} parseLines 含 frontmatter 的全文行数组
 * @param {number} relStart 0-based body 相对行（含）
 * @param {number} relEnd 不含
 * @param {number} bodyOffset body 起始的全文行偏移（frontmatter 行数）；relStart/relEnd 是
 *   body 相对行号，而 parseLines 是全文数组——不加偏移会把图片错位挂到 bodyStart 行之后的块上
 *   （B02 实机回归：入门4/文章自动归位 两篇带 frontmatter 笔记的图片全部错位/丢失）。
 */
function collectImages(parseLines, relStart, relEnd, bodyOffset = 0) {
  const raw = parseLines.slice(relStart + bodyOffset, relEnd + bodyOffset).join("\n");
  const images = [];
  let match;
  MD_IMAGE_REGEX.lastIndex = 0;
  while ((match = MD_IMAGE_REGEX.exec(raw)) !== null) {
    images.push(classifyImageRef(match[2]));
  }
  WIKI_EMBED_REGEX.lastIndex = 0;
  while ((match = WIKI_EMBED_REGEX.exec(raw)) !== null) {
    const ref = match[1].trim();
    const isImage = IMAGE_EXT_REGEX.test(ref);
    images.push({
      ref,
      kind: "wiki",
      gif: GIF_EXT_REGEX.test(ref),
      transclusion: isImage ? undefined : true,
    });
  }
  return images;
}

/**
 * 创建卡片内容账本。
 * @param {string} markdown
 * @param {{markdownIt?: unknown}} [options]
 * @returns {CardDocument}
 */
export function createCardDocument(markdown, options = {}) {
  const source = String(markdown ?? "");
  const lines = source.split(/\r?\n/);

  const fmRange = detectFrontmatterRange(lines);
  const frontmatter = fmRange
    ? {
        startLine: fmRange.startLine + 1,
        endLine: fmRange.endLine + 1,
        raw: lines.slice(fmRange.startLine, fmRange.endLine + 1).join("\n"),
        fields: parseFrontmatterFields(lines.slice(fmRange.startLine + 1, fmRange.endLine).join("\n")),
      }
    : null;
  const bodyStart = fmRange ? fmRange.endLine + 1 : 0;

  const { parseLines } = applyEqualsBreaks(lines, bodyStart);

  const md = /** @type {any} */ (
    options.markdownIt || new MarkdownIt({ html: true, breaks: true, linkify: false })
  );
  const bodyText = parseLines.slice(bodyStart).join("\n");
  const tokens = md.parse(bodyText, {});

  /** @type {CardBlock[]} */
  const blocks = [];
  /** @type {CardDiagnostic[]} */
  const diagnostics = [];
  const paginationMarkers = [];
  let idCounter = 0;

  const absLine = (relLine) => bodyStart + relLine + 1; // → 1-based 全文行号
  const relOf = (line0) => line0 - bodyStart; // 1-based 全文行号 → body 相对 0-based

  /**
   * 登记一个块及其省略诊断。
   */
  function addBlock(block) {
    block.id = `b${++idCounter}`;
    if (block.disposition === BlockDisposition.OMIT) {
      diagnostics.push({
        blockId: block.id,
        reason: block.omitReason || "unknown",
        highRisk: block.highRisk === true,
        sourceStart: block.sourceStart,
        sourceEnd: block.sourceEnd,
        detail: block.omitDetail || "",
        primary: !block.parentId,
      });
    }
    blocks.push(block);
    return block;
  }

  /** 在 token 数组 [from, to) 中找与 from 配对的闭合 token 下标；找不到返回 to */
  function findMatchingClose(tokens, from, to, openType, closeType) {
    let depth = 0;
    for (let i = from; i < to; i++) {
      const t = tokens[i];
      if (t.type === openType && t.nesting === 1) depth++;
      else if (t.type === closeType && t.nesting === -1) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return to;
  }

  function makeBaseBlock(type, token, depth, parentId) {
    const map = token.map || [relOf(1), relOf(1) + 1];
    return {
      parentId,
      depth,
      type,
      sourceStart: absLine(map[0]),
      sourceEnd: absLine(Math.max(map[1] - 1, map[0])),
      disposition: BlockDisposition.RENDER,
    };
  }

  /** 分析 inline token 文本，返回段落级处理决定 */
  function analyzeParagraph(inlineToken, parseLineStart, parseLineEnd) {
    const text = String(inlineToken.content || "");
    const trimmed = text.trim();
    // 块级公式：段落以 $$ 开头（成对 $$ 的段落）
    if (trimmed.startsWith("$$")) {
      return { disposition: BlockDisposition.OMIT, omitReason: OmitReason.BLOCK_FORMULA, highRisk: false };
    }
    // 行内公式：整段省略 + 高风险
    if (INLINE_FORMULA_REGEX.test(text)) {
      return { disposition: BlockDisposition.OMIT, omitReason: OmitReason.INLINE_FORMULA, highRisk: true };
    }
    const images = collectImages(parseLines, parseLineStart, parseLineEnd, bodyStart);
    const visibleText = trimmed
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/!\[\[[^\]]*\]\]/g, "")
      .trim();
    const imageOnly = visibleText === "" && images.length > 0;
    if (imageOnly && images.length > 0 && images.every((img) => img.gif)) {
      return { disposition: BlockDisposition.OMIT, omitReason: OmitReason.GIF, highRisk: false, images };
    }
    // 混排 GIF：段落保留，但 GIF 资源标记排除并记附属诊断
    let extraDiagnostic = null;
    if (images.some((img) => img.gif)) {
      for (const img of images) {
        if (img.gif) img.excluded = true;
      }
      extraDiagnostic = OmitReason.GIF;
    }
    return { disposition: BlockDisposition.RENDER, images, extraDiagnostic };
  }

  /**
   * 递归处理 token 区间。
   * @param {any[]} tk token 数组
   * @param {number} from 起始下标（含）
   * @param {number} to 结束下标（不含）
   * @param {string|undefined} parentId
   * @param {number} depth
   */
  function walk(tk, from, to, parentId, depth) {
    let i = from;
    while (i < to) {
      const token = tk[i];
      switch (token.type) {
        case "heading_open": {
          const block = addBlock({
            ...makeBaseBlock("heading", token, depth, parentId),
            level: Number(String(token.tag || "h1").slice(1)) || 1,
            text: tk[i + 1] ? String(tk[i + 1].content || "") : "",
          });
          i += 3; // heading_open, inline, heading_close
          void block;
          break;
        }
        case "paragraph_open": {
          const closeIdx = findMatchingClose(tk, i, to, "paragraph_open", "paragraph_close");
          const inlineToken = tk[i + 1];
          const map = token.map || [0, 1];
          const analysis = analyzeParagraph(inlineToken, map[0], map[1]);
          const block = addBlock({
            ...makeBaseBlock("paragraph", token, depth, parentId),
            disposition: analysis.disposition,
            omitReason: analysis.omitReason,
            highRisk: analysis.highRisk === true,
            images: analysis.images,
            text: String(inlineToken.content || ""),
          });
          if (analysis.extraDiagnostic) {
            diagnostics.push({
              blockId: block.id,
              reason: analysis.extraDiagnostic,
              highRisk: false,
              sourceStart: block.sourceStart,
              sourceEnd: block.sourceEnd,
              detail: "段落内的 GIF 资源被排除",
              primary: false,
            });
          }
          i = closeIdx + 1;
          break;
        }
        case "fence": {
          const info = String(token.info || "").trim().split(/\s+/)[0].toLowerCase();
          const isMermaid = info === "mermaid";
          addBlock({
            ...makeBaseBlock(isMermaid ? "mermaid" : "codeBlock", token, depth, parentId),
            disposition: BlockDisposition.OMIT,
            omitReason: isMermaid ? OmitReason.MERMAID : OmitReason.CODE_BLOCK,
            omitDetail: info ? `lang: ${info}` : "",
          });
          i += 1;
          break;
        }
        case "html_block": {
          const content = String(token.content || "");
          CARD_BREAK_REGEX.lastIndex = 0;
          const matches = content.match(CARD_BREAK_REGEX) || [];
          const stripped = content.replace(/<!--[\s\S]*?-->/g, "").trim();
          if (matches.length > 0 && stripped === "") {
            const block = addBlock({
              ...makeBaseBlock("paginationMarker", token, depth, parentId),
              disposition: BlockDisposition.MARKER,
              markerCount: matches.length,
            });
            const baseLine = block.sourceStart;
            for (let m = 0; m < matches.length; m++) {
              paginationMarkers.push({ line: baseLine, index: m });
            }
          } else {
            addBlock({
              ...makeBaseBlock("html", token, depth, parentId),
              disposition: BlockDisposition.OMIT,
              omitReason: OmitReason.UNSUPPORTED_EMBED,
              omitDetail: "一期不支持自定义 HTML 块",
            });
          }
          i += 1;
          break;
        }
        case "hr": {
          addBlock({ ...makeBaseBlock("hr", token, depth, parentId) });
          i += 1;
          break;
        }
        case "bullet_list_open":
        case "ordered_list_open": {
          const closeType = token.type.replace("_open", "_close");
          const closeIdx = findMatchingClose(tk, i, to, token.type, closeType);
          const ordered = token.type === "ordered_list_open";
          const listBlock = addBlock({
            ...makeBaseBlock("list", token, depth, parentId),
            ordered,
            listStart: ordered ? Number(token.attrGet("start") ?? 1) || 1 : undefined,
            items: [],
          });
          walkListItems(tk, i + 1, closeIdx, listBlock, depth + 1);
          listBlock.itemCount = listBlock.items ? listBlock.items.length : undefined;
          i = closeIdx + 1;
          break;
        }
        case "blockquote_open": {
          const closeIdx = findMatchingClose(tk, i, to, "blockquote_open", "blockquote_close");
          const quoteBlock = addBlock({ ...makeBaseBlock("blockquote", token, depth, parentId) });
          // callout 检测：第一个内层段落以 [!type] 开头（blockquote_open 后紧跟 paragraph_open+inline）
          const innerInline = tk[i + 1] && tk[i + 1].type === "paragraph_open" ? tk[i + 2] : null;
          const calloutMatch = innerInline ? /^\[!([A-Za-z-]+)\]/.exec(String(innerInline.content || "")) : null;
          if (calloutMatch) {
            quoteBlock.type = "callout";
            quoteBlock.calloutType = calloutMatch[1].toLowerCase();
          }
          walk(tk, i + 1, closeIdx, quoteBlock.id, depth + 1);
          i = closeIdx + 1;
          break;
        }
        case "table_open": {
          const closeIdx = findMatchingClose(tk, i, to, "table_open", "table_close");
          const map = token.map || [0, 1];
          addBlock({
            ...makeBaseBlock("table", token, depth, parentId),
            rows: extractTableRows(parseLines, bodyStart + map[0], bodyStart + map[1]),
          });
          i = closeIdx + 1;
          break;
        }
        default:
          i += 1;
          break;
      }
    }
  }

  /**
   * 提取嵌套列表的子项（text/task/再嵌套 childList），不处理省略诊断（嵌套层保持纯文本）。
   * @returns {Array<{text: string, task?: boolean, images?: any[], childList?: {ordered: boolean, items: Array<object>}}>}
   */
  function extractChildListItems(tk, from, to) {
    const items = [];
    let i = from;
    while (i < to) {
      if (tk[i].type !== "list_item_open") {
        i += 1;
        continue;
      }
      const closeIdx = findMatchingClose(tk, i, to, "list_item_open", "list_item_close");
      const textParts = [];
      let task;
      /** @type {{ordered: boolean, items: Array<object>}|null} */
      let childList = null;
      let j = i + 1;
      while (j < closeIdx) {
        const t = tk[j];
        if ((t.type === "bullet_list_open" || t.type === "ordered_list_open") && t.nesting === 1) {
          const nestedClose = findMatchingClose(tk, j, closeIdx, t.type, t.type.replace("_open", "_close"));
          childList = { ordered: t.type === "ordered_list_open", items: extractChildListItems(tk, j + 1, nestedClose) };
          j = nestedClose + 1;
          continue;
        }
        if (t.type === "inline" && t.content) {
          const inlineText = String(t.content);
          textParts.push(inlineText);
          if (task === undefined) {
            const m = TASK_MARKER_REGEX.exec(inlineText.trim());
            if (m) task = m[1] !== " ";
          }
        }
        j += 1;
      }
      const child = { text: textParts.join("\n"), index: items.length };
      if (task !== undefined) child.task = task;
      if (childList) child.childList = childList;
      items.push(child);
      i = closeIdx + 1;
    }
    return items;
  }

  /**
   * 解析列表项：每项的省略（围栏/行内公式/GIF）与任务标记。
   */
  function walkListItems(tk, from, to, listBlock, _depth) {    let i = from;
    while (i < to) {
      if (tk[i].type !== "list_item_open") {
        i += 1;
        continue;
      }
      const closeIdx = findMatchingClose(tk, i, to, "list_item_open", "list_item_close");
      const map = tk[i].map || [0, 1];
      const item = {
        id: `${listBlock.id}-item-${listBlock.items.length + 1}`,
        index: listBlock.items.length,
        sourceStart: absLine(map[0]),
        sourceEnd: absLine(Math.max(map[1] - 1, map[0])),
        disposition: BlockDisposition.RENDER,
      };
      // 项内扫描：围栏 / 行内公式 / 嵌套列表 / 图片 / 项文本
      const textParts = [];
      let taskDetected;
      /** @type {{ordered: boolean, items: Array<{text: string, task?: boolean, images?: any[]}>}|null} */
      let childList = null;
      let j = i + 1;
      while (j < closeIdx) {
        const t = tk[j];
        if (t.type === "fence") {
          const info = String(t.info || "").trim().split(/\s+/)[0].toLowerCase();
          item.disposition = BlockDisposition.OMIT;
          item.omitReason = info === "mermaid" ? OmitReason.MERMAID : OmitReason.CODE_BLOCK;
          item.highRisk = false;
          j += 1;
          continue;
        }
        if ((t.type === "bullet_list_open" || t.type === "ordered_list_open") && t.nesting === 1) {
          // 嵌套列表：解析为 childList 结构，不混入父项 text
          const nestedClose = findMatchingClose(tk, j, closeIdx, t.type, t.type.replace("_open", "_close"));
          childList = {
            ordered: t.type === "ordered_list_open",
            items: extractChildListItems(tk, j + 1, nestedClose),
          };
          j = nestedClose + 1;
          continue;
        }
        if (t.type === "inline") {
          if (!item.omitReason) {
            const text = String(t.content || "");
            if (/^\s*\$\$/.test(text.trim()) || INLINE_FORMULA_REGEX.test(text)) {
              item.disposition = BlockDisposition.OMIT;
              item.omitReason = /^\s*\$\$/.test(text.trim()) ? OmitReason.BLOCK_FORMULA : OmitReason.INLINE_FORMULA;
              item.highRisk = item.omitReason === OmitReason.INLINE_FORMULA;
            }
          }
          if (t.content) {
            const inlineText = String(t.content);
            textParts.push(inlineText);
            if (taskDetected === undefined) {
              const m2 = TASK_MARKER_REGEX.exec(inlineText.trim());
              if (m2) taskDetected = m2[1] !== " ";
            }
          }
        }
        j += 1;
      }
      item.text = textParts.join("\n");
      if (taskDetected !== undefined) {
        item.task = taskDetected;
        if (!listBlock.taskList) listBlock.taskList = true;
      }
      if (childList) {
        item.hasNestedList = true;
        item.childList = childList;
      }
      if (!item.omitReason) {
        // relOf(abs) = abs - bodyStart 比 0-based body 行号大 1，故起止各收 1 行对齐 item 实际行区间
        item.images = collectImages(parseLines, relOf(item.sourceStart) - 1, relOf(item.sourceEnd), bodyStart);
        if (item.images && item.images.length > 0 && item.images.every((img) => img.gif)) {
          const textProbe = parseLines.slice(relOf(item.sourceStart) - 1 + bodyStart, relOf(item.sourceEnd) + bodyStart).join("\n");
          const stripped = textProbe.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/!\[\[[^\]]*\]\]/g, "").trim();
          if (stripped) {
            item.disposition = BlockDisposition.RENDER;
          } else {
            item.disposition = BlockDisposition.OMIT;
            item.omitReason = OmitReason.GIF;
          }
        }
      }
      listBlock.items.push(item);
      if (item.disposition === BlockDisposition.OMIT) {
        diagnostics.push({
          blockId: item.id,
          reason: item.omitReason,
          highRisk: item.highRisk === true,
          sourceStart: item.sourceStart,
          sourceEnd: item.sourceEnd,
          detail: "列表项级省略",
          primary: false,
        });
      }
      i = closeIdx + 1;
    }
  }

  walk(tokens, 0, tokens.length, undefined, 0);

  // 互斥主要原因计数
  /** @type {Record<string, number> & {total: number}} */
  const omissionSummary = { total: 0 };
  for (const key of OMIT_REASON_KEYS) omissionSummary[key] = 0;
  for (const diag of diagnostics) {
    if (Object.prototype.hasOwnProperty.call(omissionSummary, diag.reason)) {
      omissionSummary[diag.reason] += 1;
      omissionSummary.total += 1;
    }
  }

  const hasRenderableContent = blocks.some(
    (b) => b.disposition === BlockDisposition.RENDER && b.type !== "paginationMarker"
  );
  const onlyCoverCandidate = Boolean(frontmatter) && !hasRenderableContent;

  return {
    source,
    frontmatter,
    blocks,
    paginationMarkers,
    diagnostics,
    omissionSummary,
    meta: { hasRenderableContent, onlyCoverCandidate, blockCount: blocks.length },
  };
}
