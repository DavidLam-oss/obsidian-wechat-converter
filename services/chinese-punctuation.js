/*
## 核心功能

提供服务层通用能力：chinese punctuation。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `normalizeTextForChinesePunctuation`、`normalizeRenderedDomPunctuation`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

const CJK_CONTEXT_PATTERN = /[\p{sc=Han}“”‘’（）《》「」『』【】]/u;

/**
 * @typedef {{
 *   protect: (value: string) => string,
 *   restore: (text: string) => string,
 * }} ProtectedSegmentStore
 */

/** @type {Record<string, string>} */
const INLINE_PUNCTUATION_MAP = {
  ',': '，',
  ':': '：',
  ';': '；',
  '!': '！',
  '?': '？',
};

const SKIP_TAGS = new Set([
  'CODE',
  'PRE',
  'SCRIPT',
  'STYLE',
  'TEXTAREA',
  'SVG',
]);

function createProtectedSegmentStore() {
  /** @type {string[]} */
  const values = [];

  return {
    protect(value) {
      const token = `\uE000OWC_PUNC_${values.length}\uE001`;
      values.push(String(value || ''));
      return token;
    },
    restore(text) {
      let output = String(text || '');
      let previous = null;

      while (output !== previous) {
        previous = output;
        output = output.replace(/\uE000OWC_PUNC_(\d+)\uE001/gu, (match, index) => {
          const resolved = values[Number(index)];
          return resolved === undefined ? match : resolved;
        });
      }

      return output;
    },
  };
}

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @param {((match: string, ...args: unknown[]) => boolean) | null | undefined} shouldProtect
 * @param {ProtectedSegmentStore} store
 * @returns {string}
 */
function protectByPattern(text, pattern, shouldProtect, store) {
  return String(text || '').replace(pattern, (match, ...args) => {
    const shouldKeepUnprotected = typeof shouldProtect === 'function'
      && !shouldProtect(String(match || ''), args);
    if (shouldKeepUnprotected) {
      return match;
    }
    return store.protect(match);
  });
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 * @returns {string}
 */
function protectUrlSegments(text, store) {
  return String(text || '').replace(/\b(?:https?:\/\/|mailto:|www\.)[^\s<>"'）】」』]+/giu, (match) => {
    const trimmed = match.match(/^(.*?)([,:;!?]+)?$/u);
    const core = trimmed?.[1] || match;
    const trailing = trimmed?.[2] || '';
    return `${store.protect(core)}${trailing}`;
  });
}

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @param {ProtectedSegmentStore} store
 * @returns {string}
 */
function protectTokenWithTrailingPunctuation(text, pattern, store) {
  return String(text || '').replace(pattern, (match) => {
    const trimmed = match.match(/^(.*?)([,:;!?]+)?$/u);
    const core = trimmed?.[1] || match;
    const trailing = trimmed?.[2] || '';
    return `${store.protect(core)}${trailing}`;
  });
}

/** @param {string} segment */
function looksLikeFunctionSyntax(segment) {
  const value = String(segment || '').trim();
  if (!value) return false;
  if (/[\p{sc=Han}]/u.test(value)) return false;
  if (!/[$A-Za-z_][\w$.]*\s*\(/u.test(value)) return false;
  return true;
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectFunctionSegments(text, store) {
  return protectByPattern(
    text,
    /\b[$A-Za-z_][\w$.]*\s*\((?:[^()\n]|\([^()\n]*\))*\)/gu,
    (match) => looksLikeFunctionSyntax(match),
    store,
  );
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectEmailSegments(text, store) {
  return protectTokenWithTrailingPunctuation(
    text,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?:\b|$)[,:;!?]?/giu,
    store,
  );
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectVersionSegments(text, store) {
  return protectTokenWithTrailingPunctuation(
    text,
    /\b(?:v)?\d+\.\d+(?:\.\d+){0,3}(?:-[A-Za-z0-9.-]+)?\b[,:;!?]?/gu,
    store,
  );
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectPathSegments(text, store) {
  let output = protectTokenWithTrailingPunctuation(
    text,
    /(?:^|[\s(（[【])((?:\.{0,2}\/|\/|~\/)[^\s"'<>|，。！？；：)）\]】]+)[,:;!?]?/gu,
    store,
  );

  output = output.replace(/(^|[\s(（[【])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_-]+)?)([,:;!?]?)/gu, (match, prefix, token, trailing) => {
    return `${String(prefix || '')}${store.protect(String(token || ''))}${String(trailing || '')}`;
  });

  output = output.replace(/(^|[\s(（[【])([A-Za-z0-9_.-]+\.(?:md|txt|pdf|docx?|xlsx?|pptx?|csv|json|ya?ml|xml|html?|css|scss|js|jsx|ts|tsx|py|sh|bash|zsh|java|c|cc|cpp|go|rs|swift|kt|sql))(?:[,:;!?]?)/giu, (match, prefix, token) => {
    const rawMatch = String(match || '');
    const rawPrefix = String(prefix || '');
    const rawToken = String(token || '');
    const trailing = rawMatch.slice(rawPrefix.length + rawToken.length);
    return `${rawPrefix}${store.protect(rawToken)}${trailing}`;
  });

  return output;
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectWindowsPathSegments(text, store) {
  return protectTokenWithTrailingPunctuation(
    text,
    /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n\s]+\\)*[^\\/:*?"<>|\r\n\s]+[,:;!?]?/gu,
    store,
  );
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectDateTimeSegments(text, store) {
  let output = protectTokenWithTrailingPunctuation(
    text,
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?[,:;!?]?/gu,
    store,
  );

  output = protectTokenWithTrailingPunctuation(
    output,
    /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM|am|pm))?[,:;!?]?/gu,
    store,
  );

  return output;
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectCliSegments(text, store) {
  let output = text.replace(/(^|[\s(（[【])(-{1,2}[A-Za-z0-9][\w-]*)(?=$|[\s,.:;!?，。！？；：)）\]】])/gu, (match, prefix, token) => {
    return `${String(prefix || '')}${store.protect(String(token || ''))}`;
  });

  output = output.replace(/(^|[\s(（[【])([A-Za-z][\w-]*:[A-Za-z0-9][\w:.-]*)(?=$|[\s,.;!?，。！？；：)）\]】])/gu, (match, prefix, token) => {
    return `${String(prefix || '')}${store.protect(String(token || ''))}`;
  });

  return output;
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectEnvAssignmentSegments(text, store) {
  return protectTokenWithTrailingPunctuation(
    text,
    /\b[A-Z_][A-Z0-9_]*=(?:"[^"\n]*"|'[^'\n]*'|[^\s,;!?，。！？；：]+)[,:;!?]?/gu,
    store,
  );
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectEllipsisSegments(text, store) {
  return String(text || '').replace(/\.{3,}/gu, (match) => store.protect(match));
}

/** @param {string} content */
function isTechnicalParentheticalContent(content) {
  const value = String(content || '').trim();
  if (!value) return false;
  if (/[\p{sc=Han}]/u.test(value)) return false;

  if (/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(value)) return true;
  if (/^[A-Za-z]\d*$/u.test(value)) return true;
  if (/[+\-*/=<>^%&|~]/u.test(value)) return true;
  if (/^[A-Za-z0-9_.]+\s*,\s*[A-Za-z0-9_.]+(?:\s*,\s*[A-Za-z0-9_.]+)*$/u.test(value)) return true;
  if (/^[A-Za-z_][\w.]*\s*(?:,\s*[A-Za-z_][\w.]*)+$/u.test(value)) return true;
  if (/^[A-Za-z_][\w.]*\s*(?:=\s*[^,\s()]+)(?:\s*,\s*[A-Za-z_][\w.]*\s*=\s*[^,\s()]+)+$/u.test(value)) return true;

  return false;
}

/**
 * @param {string} text
 * @param {ProtectedSegmentStore} store
 */
function protectTechnicalParentheticalSegments(text, store) {
  return String(text || '').replace(/\(([^()\n]+)\)/gu, (match, content) => {
    const rawMatch = String(match || '');
    return isTechnicalParentheticalContent(String(content || '')) ? store.protect(rawMatch) : rawMatch;
  });
}

/** @param {string} char */
function isCjkContextChar(char) {
  return !!char && CJK_CONTEXT_PATTERN.test(char);
}

/**
 * @param {string} text
 * @param {number} index
 */
function findPrevNonSpace(text, index) {
  for (let i = index; i >= 0; i -= 1) {
    if (text.charAt(i) === '\uE001') {
      const startIndex = text.lastIndexOf('\uE000', i);
      if (startIndex !== -1) {
        i = startIndex;
        continue;
      }
    }
    const char = text.charAt(i);
    if (!/\s/u.test(char)) return char;
  }
  return '';
}

/**
 * @param {string} text
 * @param {number} index
 */
function findNextNonSpace(text, index) {
  for (let i = index; i < text.length; i += 1) {
    if (text.charAt(i) === '\uE000') {
      const endIndex = text.indexOf('\uE001', i);
      if (endIndex !== -1) {
        i = endIndex;
        continue;
      }
    }
    const char = text.charAt(i);
    if (!/\s/u.test(char)) return char;
  }
  return '';
}

/**
 * @param {string} text
 * @param {number} index
 */
function hasCjkContext(text, index) {
  const prev = findPrevNonSpace(text, index - 1);
  const next = findNextNonSpace(text, index + 1);
  return isCjkContextChar(prev) || isCjkContextChar(next);
}

/**
 * @param {string} text
 * @param {string} quoteChar
 * @param {string} openQuote
 * @param {string} closeQuote
 */
function normalizeQuotedText(text, quoteChar, openQuote, closeQuote) {
  const pattern = quoteChar === '"'
    ? /"([^"\n]*?)"/gu
    : /'([^'\n]*?)'/gu;

  return text.replace(pattern, (match, inner, offset, fullText) => {
    const rawMatch = String(match || '');
    const rawInner = String(inner || '');
    const source = String(fullText || '');
    const safeOffset = Number(offset) || 0;
    const prev = findPrevNonSpace(source, safeOffset - 1);
    const next = findNextNonSpace(source, safeOffset + rawMatch.length);
    if (!(isCjkContextChar(prev) || isCjkContextChar(next) || /[\p{sc=Han}]/u.test(rawInner))) {
      return rawMatch;
    }
    return `${openQuote}${rawInner}${closeQuote}`;
  });
}

/** @param {string} text */
function normalizePeriods(text) {
  return text.replace(/\./gu, (match, offset, fullText) => {
    const source = String(fullText || '');
    const safeOffset = Number(offset) || 0;
    const prev = findPrevNonSpace(source, safeOffset - 1);
    const next = findNextNonSpace(source, safeOffset + 1);
    if (/\d/u.test(prev) && /\d/u.test(next)) return match;
    return isCjkContextChar(prev) ? '。' : match;
  });
}

/** @param {string} text */
function normalizeParentheses(text) {
  let output = text.replace(/([\p{sc=Han}])\(([^()\n]+?)\)/gu, '$1（$2）');
  output = output.replace(/([\p{sc=Han}“”‘’])\(([^()\n]+?)\)/gu, '$1（$2）');
  output = output.replace(/\(([^()\n]+?)\)(?=[\p{sc=Han}])/gu, '（$1）');
  return output;
}

/** @param {string} text */
function normalizeTextForChinesePunctuation(text) {
  let output = String(text || '');
  if (!output || !/[\p{sc=Han}]/u.test(output)) return output;

  const protectedSegments = createProtectedSegmentStore();
  output = protectEllipsisSegments(output, protectedSegments);
  output = protectUrlSegments(output, protectedSegments);
  output = protectEmailSegments(output, protectedSegments);
  output = protectVersionSegments(output, protectedSegments);
  output = protectPathSegments(output, protectedSegments);
  output = protectWindowsPathSegments(output, protectedSegments);
  output = protectDateTimeSegments(output, protectedSegments);
  output = protectCliSegments(output, protectedSegments);
  output = protectEnvAssignmentSegments(output, protectedSegments);
  output = protectTechnicalParentheticalSegments(output, protectedSegments);
  output = protectFunctionSegments(output, protectedSegments);

  output = normalizeQuotedText(output, '"', '“', '”');
  output = normalizeQuotedText(output, '\'', '‘', '’');
  output = normalizeParentheses(output);
  output = normalizePeriods(output);

  output = output.replace(/[,:;!?]/gu, (match, offset, fullText) => {
    const rawMatch = String(match || '');
    if (!hasCjkContext(String(fullText || ''), Number(offset) || 0)) return rawMatch;
    return INLINE_PUNCTUATION_MAP[rawMatch] || rawMatch;
  });

  return protectedSegments.restore(output);
}

/** @param {Text | null | undefined} node */
function shouldSkipTextNode(node) {
  if (!node || !node.parentElement) return true;
  let current = node.parentElement;
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * @param {Node | null | undefined} root
 * @param {{ enabled?: boolean }} [options]
 */
function normalizeRenderedDomPunctuation(root, options = {}) {
  if (!root || options.enabled !== true) return;
  const documentRef = root.ownerDocument;
  const nodeFilter = documentRef?.defaultView?.NodeFilter;
  if (!documentRef || !nodeFilter) return;

  const walker = documentRef.createTreeWalker(
    root,
    nodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) {
          return nodeFilter.FILTER_REJECT;
        }
        return shouldSkipTextNode(node)
          ? nodeFilter.FILTER_REJECT
          : nodeFilter.FILTER_ACCEPT;
      },
    },
  );

  /** @type {Text[]} */
  const textNodes = [];
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      textNodes.push(/** @type {Text} */ (current));
    }
    current = walker.nextNode();
  }

  for (const node of textNodes) {
    node.nodeValue = normalizeTextForChinesePunctuation(node.nodeValue);
  }
}

export {
  normalizeTextForChinesePunctuation,
  normalizeRenderedDomPunctuation,
};
