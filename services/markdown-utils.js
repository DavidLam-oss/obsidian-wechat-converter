/*
## 核心功能

实现渲染管线相关的 markdown utils 能力，服务预览、复制和发布一致性。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 `stripMarkdownFrontmatter`、`parseFencedBlockDelimiter`、`splitMarkdownCodeSegments`，供视图层生成预览或发布 HTML。

## 定位

位于 services/，属于渲染服务层；避免把渲染细节堆回 input.js。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

export function stripMarkdownFrontmatter(markdown = '') {
  return String(markdown || '').replace(
    /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/,
    ''
  );
}

/**
 * @param {string} line
 * @returns {{ marker: '`' | '~', length: number } | null}
 */
export function parseFencedBlockDelimiter(line) {
  const value = String(line || '');
  const match = value.match(/^\s{0,3}((`{3,})|(~{3,}))(.*)$/);
  if (!match) return null;
  const markerRun = match[1] || '';
  const markerChar = markerRun.charAt(0);
  if (markerChar !== '`' && markerChar !== '~') return null;
  return {
    marker: markerChar,
    length: markerRun.length,
  };
}

/**
 * Split Markdown into code and non-code segments before syntax-specific
 * preprocessing. Markdown-it supplies exact fenced and indented code-block
 * line ranges; the local scanner covers inline code spans and remains the
 * fallback for lightweight converter contracts.
 * @param {string} markdown
 * @param {{ md?: { parse?: (markdown: string, env?: Record<string, unknown>) => Array<{ type?: string, map?: [number, number] | null }> } } | null | undefined} converter
 * @returns {Array<{ text: string, isCode: boolean }>}
 */
export function splitMarkdownCodeSegments(markdown, converter) {
  const source = String(markdown || '');
  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }

  /** @type {Array<{ start: number, end: number }>} */
  let blockRanges = [];
  const markdownIt = converter?.md;
  const parse = markdownIt?.parse;
  if (typeof parse === 'function') {
    try {
      const tokens = markdownIt.parse(source, {});
      blockRanges = (Array.isArray(tokens) ? tokens : [])
        .filter((token) => token?.type === 'fence' || token?.type === 'code_block')
        .map((token) => {
          const map = Array.isArray(token.map) ? token.map : null;
          const startLine = Number(map?.[0]);
          const endLine = Number(map?.[1]);
          if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || endLine <= startLine) return null;
          return {
            start: lineStarts[startLine] ?? source.length,
            end: lineStarts[endLine] ?? source.length,
          };
        })
        .filter((range) => range && range.end > range.start);
    } catch {
      blockRanges = [];
    }
  }

  if (blockRanges.length === 0) {
    const lines = source.split('\n');
    let fenceState = null;
    let fenceStartLine = -1;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const delimiter = parseFencedBlockDelimiter(lines[lineIndex]);
      if (!delimiter) continue;
      if (!fenceState) {
        fenceState = delimiter;
        fenceStartLine = lineIndex;
        continue;
      }
      if (delimiter.marker === fenceState.marker && delimiter.length >= fenceState.length) {
        blockRanges.push({
          start: lineStarts[fenceStartLine] ?? source.length,
          end: lineStarts[lineIndex + 1] ?? source.length,
        });
        fenceState = null;
        fenceStartLine = -1;
      }
    }
    if (fenceState && fenceStartLine >= 0) {
      blockRanges.push({ start: lineStarts[fenceStartLine] ?? source.length, end: source.length });
    }
  }

  blockRanges.sort((a, b) => a.start - b.start);

  /** @param {string} text */
  const splitInlineCode = (text) => {
    /** @type {Array<{ text: string, isCode: boolean }>} */
    const segments = [];
    let cursor = 0;
    let searchIndex = 0;
    while (searchIndex < text.length) {
      const openingIndex = text.indexOf('`', searchIndex);
      if (openingIndex < 0) break;
      let backslashCount = 0;
      for (let i = openingIndex - 1; i >= 0 && text[i] === '\\'; i -= 1) backslashCount += 1;
      if (backslashCount % 2 === 1) {
        searchIndex = openingIndex + 1;
        continue;
      }

      let openingEnd = openingIndex;
      while (openingEnd < text.length && text[openingEnd] === '`') openingEnd += 1;
      const delimiterLength = openingEnd - openingIndex;
      let closingStart = openingEnd;
      let closingEnd = -1;
      while (closingStart < text.length) {
        closingStart = text.indexOf('`', closingStart);
        if (closingStart < 0) break;
        let candidateEnd = closingStart;
        while (candidateEnd < text.length && text[candidateEnd] === '`') candidateEnd += 1;
        if (candidateEnd - closingStart === delimiterLength) {
          closingEnd = candidateEnd;
          break;
        }
        closingStart = candidateEnd;
      }

      if (closingEnd < 0) {
        searchIndex = openingEnd;
        continue;
      }
      if (openingIndex > cursor) segments.push({ text: text.slice(cursor, openingIndex), isCode: false });
      segments.push({ text: text.slice(openingIndex, closingEnd), isCode: true });
      cursor = closingEnd;
      searchIndex = closingEnd;
    }
    if (cursor < text.length) segments.push({ text: text.slice(cursor), isCode: false });
    return segments.length ? segments : [{ text, isCode: false }];
  };

  /** @type {Array<{ text: string, isCode: boolean }>} */
  const segments = [];
  let cursor = 0;
  for (const range of blockRanges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) segments.push(...splitInlineCode(source.slice(cursor, range.start)));
    segments.push({ text: source.slice(range.start, range.end), isCode: true });
    cursor = range.end;
  }
  if (cursor < source.length) segments.push(...splitInlineCode(source.slice(cursor)));
  return segments.length ? segments : [{ text: source, isCode: false }];
}
