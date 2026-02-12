const { MarkdownRenderer } = require('obsidian');
const { serializeObsidianRenderedHtml } = require('./obsidian-triplet-serializer');

function isFencedBlockDelimiter(line) {
  return /^\s{0,3}(?:`{3,}|~{3,})/.test(String(line || ''));
}

function parseFencedBlockDelimiter(line) {
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

function isMathFenceDelimiter(line) {
  return /^\s*\$\$\s*$/.test(String(line || ''));
}

function isQuoteLine(line) {
  return /^\s{0,3}(?:>\s?)+/.test(String(line || ''));
}

function stripQuotePrefix(line) {
  return String(line || '').replace(/^\s{0,3}(?:>\s?)+/, '');
}

function startsNewBlock(trimmedLine) {
  if (!trimmedLine) return true;
  if (/^#{1,6}\s/.test(trimmedLine)) return true;
  if (/^>/.test(trimmedLine)) return true;
  if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmedLine)) return true;
  if (/^(?:[*+-]|\d+[.)])\s+/.test(trimmedLine)) return true;
  if (/^\|/.test(trimmedLine)) return true;
  if (/^<[^>]+>/.test(trimmedLine)) return true;
  if (isFencedBlockDelimiter(trimmedLine)) return true;
  return false;
}

function isListItemLine(trimmedLine) {
  return /^(?:[*+-]|\d+[.)])\s+/.test(String(trimmedLine || ''));
}

function appendLegacyHardBreak(line) {
  const value = String(line || '');
  if (!value) return value;
  if (/<br\s*\/?>\s*$/i.test(value)) return value;
  return `${value.replace(/[ \t]+$/, '')}<br>`;
}

function appendQuoteHardBreak(line) {
  const value = String(line || '');
  if (!value) return value;
  if (/\\\s*$/.test(value)) return value;
  return `${value.replace(/[ \t]+$/, '')}\\`;
}

function injectHardBreaksForLegacyParity(markdown) {
  const lines = String(markdown || '').split('\n');
  let fenceState = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    const fenceDelimiter = parseFencedBlockDelimiter(line);
    if (fenceDelimiter) {
      if (!fenceState) {
        fenceState = fenceDelimiter;
      } else if (
        fenceDelimiter.marker === fenceState.marker &&
        fenceDelimiter.length >= fenceState.length
      ) {
        fenceState = null;
      }
      continue;
    }

    if (!fenceState && isMathFenceDelimiter(line)) {
      inMathFence = !inMathFence;
      continue;
    }

    if (fenceState || inMathFence) continue;
    if (!line || !nextLine) continue;
    if (/[ \t]{2,}$/.test(line) || /\\$/.test(line)) continue;

    if (isQuoteLine(line) && isQuoteLine(nextLine)) {
      const currentQuoteContent = stripQuotePrefix(line).trim();
      const nextQuoteContent = stripQuotePrefix(nextLine).trim();
      if (!currentQuoteContent || !nextQuoteContent) continue;
      if (/^\[!/.test(currentQuoteContent) || /^\[!/.test(nextQuoteContent)) continue;
      lines[i] = appendQuoteHardBreak(line);
      continue;
    }

    const currentTrimmed = line.trim();
    if (startsNewBlock(currentTrimmed) && !isListItemLine(currentTrimmed)) continue;
    if (startsNewBlock(nextLine.trim())) continue;

    lines[i] = appendLegacyHardBreak(line);
  }

  return lines.join('\n');
}

function neutralizeUnsafeMarkdownLinks(markdown) {
  const source = String(markdown || '');
  if (!source) return source;

  // markdown-it rejects javascript:/vbscript:/data: links in markdown syntax and
  // keeps them as literal text. Escape leading "[" to mimic that behavior in triplet.
  const unsafeLinkPattern = /\[[^\]]+\]\(((?:javascript|vbscript|data):[^)\r\n]*)\)/gi;
  return source.replace(unsafeLinkPattern, (match, _href, offset, fullText) => {
    const prevChar = offset > 0 ? fullText[offset - 1] : '';
    if (prevChar === '!' || prevChar === '\\') {
      return match;
    }
    return `\\${match}`;
  });
}

function neutralizePlainWikilinks(markdown) {
  const source = String(markdown || '');
  if (!source) return source;

  const escapePlainWikilinks = (value) =>
    String(value || '').replace(/(^|[^!\\])(\[\[[^[\]\r\n]+?\]\])/g, (_match, prefix, wikilink) => {
      return `${prefix}\\${wikilink}`;
    });

  const neutralizeLineOutsideInlineCode = (line) => {
    const value = String(line || '');
    if (!value || !value.includes('[[')) return value;

    let result = '';
    let cursor = 0;
    const codeSpanPattern = /(`+)([\s\S]*?)(\1)/g;
    let match = codeSpanPattern.exec(value);

    while (match) {
      const [segment] = match;
      const start = match.index;
      const end = start + segment.length;
      result += escapePlainWikilinks(value.slice(cursor, start));
      result += segment;
      cursor = end;
      match = codeSpanPattern.exec(value);
    }

    result += escapePlainWikilinks(value.slice(cursor));
    return result;
  };

  const lines = source.split('\n');
  let fenceState = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const fenceDelimiter = parseFencedBlockDelimiter(line);
    if (fenceDelimiter) {
      if (!fenceState) {
        fenceState = fenceDelimiter;
      } else if (
        fenceDelimiter.marker === fenceState.marker &&
        fenceDelimiter.length >= fenceState.length
      ) {
        fenceState = null;
      }
      continue;
    }

    if (!fenceState && isMathFenceDelimiter(line)) {
      inMathFence = !inMathFence;
      continue;
    }

    if (fenceState || inMathFence) continue;

    lines[i] = neutralizeLineOutsideInlineCode(line);
  }

  return lines.join('\n');
}

// Known safe HTML tags that should NOT be escaped
// This list includes common HTML5 tags that users might intentionally use
const KNOWN_HTML_TAGS = new Set([
  // Block elements
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr', 'br',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'main', 'section',
  'article', 'aside', 'header', 'footer', 'nav', 'address',
  // Inline elements
  'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'code', 'kbd',
  'samp', 'var', 'mark', 'small', 'sub', 'sup', 'span', 'abbr', 'cite', 'q',
  'time', 'ruby', 'rt', 'rp', 'bdi', 'bdo', 'dfn', 'wbr',
  // Media elements
  'img', 'picture', 'source', 'video', 'audio', 'track', 'canvas', 'svg', 'math',
  // Table elements
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // Form elements (though these are stripped by sanitizer)
  'form', 'input', 'button', 'select', 'option', 'optgroup', 'textarea', 'label',
  'fieldset', 'legend', 'datalist', 'output', 'progress', 'meter',
  // Other common elements
  'details', 'summary', 'dialog', 'menu', 'menuitem', 'noscript', 'template',
  // MathJax specific
  'mjx-container', 'mjx-math',
]);

/**
 * Escape pseudo-HTML tags that look like HTML but are actually text.
 * For example: <Title>_xxx_MS.pdf should be rendered as text, not as an HTML tag.
 */
function escapePseudoHtmlTags(markdown) {
  const lines = markdown.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeBlockFenceLen = 0; // Track full fence length for proper nesting

  for (const line of lines) {
    // Track code block boundaries using proper fence length matching
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const currentFenceLen = fenceMatch[1].length;
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockFenceLen = currentFenceLen;
      } else if (currentFenceLen >= codeBlockFenceLen) {
        // Closing fence must be at least as long as opening fence
        inCodeBlock = false;
        codeBlockFenceLen = 0;
      }
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Escape pseudo-HTML tags outside code blocks, but preserve inline code
    const processed = escapeLinePreservingInlineCode(line);
    result.push(processed);
  }

  return result.join('\n');
}

/**
 * Escape pseudo-HTML tags in a line while preserving inline code content.
 */
function escapeLinePreservingInlineCode(line) {
  // Split by inline code segments (single backticks, not triple for fenced blocks)
  // We need to handle both single `code` and escaped backticks
  const segments = [];
  let lastIndex = 0;
  let inInlineCode = false;
  let i = 0;

  while (i < line.length) {
    // Check for backtick (inline code boundary)
    // Skip if it's part of a fenced block marker at line start (already handled above)
    if (line[i] === '`' && !(i < 3 && line.slice(0, 3).match(/^`{3}/))) {
      // Find the end of this inline code segment
      const startIndex = i;
      i++; // Skip opening backtick

      // Find closing backtick (not double backtick which escapes)
      while (i < line.length) {
        if (line[i] === '`') {
          // Check if this is a closing backtick
          // It's closing if it's a single backtick or if it's followed by non-backtick
          if (i + 1 >= line.length || line[i + 1] !== '`') {
            i++; // Include closing backtick
            break;
          }
        }
        i++;
      }

      // Add the inline code segment as-is (no escaping)
      segments.push(line.slice(lastIndex, startIndex));
      segments.push(line.slice(startIndex, i));
      lastIndex = i;
    } else {
      i++;
    }
  }

  // Add remaining text
  if (lastIndex < line.length) {
    segments.push(line.slice(lastIndex));
  }

  // If no inline code found, process the whole line
  if (segments.length === 0) {
    return escapePseudoHtmlInText(line);
  }

  // Process non-code segments
  return segments.map((seg, idx) => {
    // Even indices are non-code, odd indices are inline code (preserved as-is)
    if (idx % 2 === 1) return seg;
    return escapePseudoHtmlInText(seg);
  }).join('');
}

/**
 * Escape pseudo-HTML tags in plain text (not inside code).
 * Matches full tag patterns including attributes and closing bracket.
 */
function escapePseudoHtmlInText(text) {
  // Match opening tags: <tag> or <tag attr="value">
  // Match closing tags: </tag>
  return text.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g, (match, tagName, attrs) => {
    const lowerTag = tagName.toLowerCase();
    // If it's a known HTML tag, keep it as-is
    if (KNOWN_HTML_TAGS.has(lowerTag)) {
      return match;
    }
    // Otherwise escape the angle brackets
    if (match.startsWith('</')) {
      return `&lt;/${tagName}&gt;`;
    }
    return `&lt;${tagName}${attrs}&gt;`;
  });
}

// Generate a unique placeholder that won't conflict with user content
// Uses a random session ID + counter to prevent collision
const MATH_PLACEHOLDER_SESSION = `M${Date.now().toString(36)}X`;
let mathPlaceholderCounter = 0;

function generateMathPlaceholder(type) {
  const id = `${MATH_PLACEHOLDER_SESSION}_${mathPlaceholderCounter}_${Math.random().toString(36).slice(2, 6)}`;
  mathPlaceholderCounter += 1;
  // Zero-width spaces protect from Markdown, unique ID prevents collision
  return `\u200B${id}_${type}\u200B`;
}

/**
 * Pre-render math formulas and return both the processed markdown and formulas array.
 * This function is pure - it doesn't use or modify any global state.
 * @returns {{ markdown: string, formulas: Array<{placeholder: string, rendered: string, isBlock: boolean}> }}
 */
function preRenderMathFormulas(markdown, converter) {
  const formulas = [];

  if (!converter || !converter.md) return { markdown, formulas };
  if (typeof converter.md.render !== 'function') return { markdown, formulas };

  let output = markdown;

  // First, handle block math ($$...$$) - must be processed before inline
  // Match $$...$$ where content can span multiple lines
  const blockMathPattern = /\$\$([\s\S]+?)\$\$/g;
  output = output.replace(blockMathPattern, (match, formula) => {
    const placeholder = generateMathPlaceholder('BLOCK');
    try {
      // Render using full markdown-it (handles block math)
      const rendered = converter.md.render(`$$${formula}$$`);
      // Extract just the rendered math (strip wrapper <p> if any)
      const cleaned = rendered.replace(/^<p>|<\/p>$/g, '').trim();
      formulas.push({ placeholder, rendered: cleaned, isBlock: true });
      return placeholder;
    } catch (error) {
      return match;
    }
  });

  // Then, handle inline math ($...$) - single $ not $$
  // Use negative lookbehind/lookahead to avoid matching $$
  const inlineMathPattern = /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g;
  output = output.replace(inlineMathPattern, (match, formula) => {
    const placeholder = generateMathPlaceholder('INLINE');
    try {
      // Render using renderInline for inline math
      const rendered = converter.md.renderInline(`$${formula}$`);
      formulas.push({ placeholder, rendered, isBlock: false });
      return placeholder;
    } catch (error) {
      return match;
    }
  });

  return { markdown: output, formulas };
}

/**
 * Preprocess markdown for triplet rendering.
 * Returns an object with processed markdown and pre-rendered math formulas.
 * This function is pure - no global state is used.
 * @returns {{ markdown: string, mathFormulas: Array }}
 */
function preprocessMarkdownForTriplet(markdown, converter) {
  let output = String(markdown || '');

  // Align with converter.convert preprocessing to reduce non-semantic parity noise.
  output = output.replace(/^[\t ]+(\$\$)/gm, '$1');
  output = output.replace(/!\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g, (match, imagePath, alt) => {
    return `![${alt || ''}](${encodeURI(String(imagePath || '').trim())})`;
  });

  if (converter && typeof converter.stripFrontmatter === 'function') {
    output = converter.stripFrontmatter(output);
  }

  // Pre-render math formulas using markdown-it + MathJax before Obsidian renders
  // This is needed because Obsidian's MarkdownRenderer.renderMarkdown doesn't render LaTeX
  const { markdown: mathProcessed, formulas: mathFormulas } = preRenderMathFormulas(output, converter);
  output = mathProcessed;

  // Escape pseudo-HTML tags that look like HTML but are actually text
  // For example: <Title>_xxx_MS.pdf should render as text, not as an HTML tag
  output = escapePseudoHtmlTags(output);

  output = neutralizeUnsafeMarkdownLinks(output);
  output = neutralizePlainWikilinks(output);

  // Legacy converter runs markdown-it with breaks=true. Normalize soft line breaks
  // so Obsidian renderer emits equivalent <br> in common paragraph text.
  output = injectHardBreaksForLegacyParity(output);

  return { markdown: output, mathFormulas };
}

function countUnresolvedImageEmbeds(root) {
  if (!root) return 0;
  const embeds = Array.from(root.querySelectorAll('span.internal-embed,span.image-embed,div.internal-embed,div.image-embed'));
  let unresolved = 0;
  for (const embed of embeds) {
    const isImageEmbed = embed.classList.contains('image-embed');
    const hasImgChild = !!embed.querySelector('img');
    if (isImageEmbed && !hasImgChild) {
      unresolved += 1;
    }
  }
  return unresolved;
}

function normalizeReferenceLabel(label) {
  return String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function extractInlineImageTarget(rawTarget) {
  const value = String(rawTarget || '').trim();
  if (!value) return '';
  if (value.startsWith('<')) {
    const endIndex = value.indexOf('>');
    if (endIndex > 1) {
      return value.slice(1, endIndex).trim();
    }
  }
  return value.split(/\s+/)[0] || '';
}

function collectImageTargets(markdown) {
  const source = String(markdown || '');
  const targets = [];
  if (!source || !source.includes('![')) return targets;

  const referenceTargets = new Map();
  const referenceDefinitionPattern = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>\r\n]+)>|(\S+))/gm;
  let definitionMatch = referenceDefinitionPattern.exec(source);
  while (definitionMatch) {
    const label = normalizeReferenceLabel(definitionMatch[1]);
    const target = String(definitionMatch[2] || definitionMatch[3] || '').trim();
    if (label && target && !referenceTargets.has(label)) {
      referenceTargets.set(label, target);
    }
    definitionMatch = referenceDefinitionPattern.exec(source);
  }

  const inlineImagePattern = /!\[[^\]]*]\(([^)\r\n]+)\)/g;
  let inlineMatch = inlineImagePattern.exec(source);
  while (inlineMatch) {
    targets.push(extractInlineImageTarget(inlineMatch[1]));
    inlineMatch = inlineImagePattern.exec(source);
  }

  const fullReferenceImagePattern = /!\[([^\]]*)]\[([^\]]*)]/g;
  let fullReferenceMatch = fullReferenceImagePattern.exec(source);
  while (fullReferenceMatch) {
    const fallbackLabel = String(fullReferenceMatch[1] || '');
    const refLabel = String(fullReferenceMatch[2] || '');
    const normalizedLabel = normalizeReferenceLabel(refLabel || fallbackLabel);
    targets.push(referenceTargets.get(normalizedLabel) || '');
    fullReferenceMatch = fullReferenceImagePattern.exec(source);
  }

  const shortcutReferenceImagePattern = /!\[([^\]]+)](?![\[(])/g;
  let shortcutReferenceMatch = shortcutReferenceImagePattern.exec(source);
  while (shortcutReferenceMatch) {
    const label = normalizeReferenceLabel(shortcutReferenceMatch[1]);
    targets.push(referenceTargets.get(label) || '');
    shortcutReferenceMatch = shortcutReferenceImagePattern.exec(source);
  }

  return targets;
}

function shouldObserveAsyncEmbedWindow(markdown) {
  const source = String(markdown || '');
  if (!source || !source.includes('![')) return false;

  const targets = collectImageTargets(source);
  if (targets.length === 0) {
    // Unknown image syntax: keep conservative short observe window.
    return true;
  }

  for (const item of targets) {
    // collectImageTargets already strips angle brackets via extractInlineImageTarget
    // and referenceDefinitionPattern's capturing groups.
    const target = String(item || '').trim().toLowerCase();
    if (!target) return true;

    // Remote/data images are rendered directly; local-like paths may resolve
    // asynchronously via Obsidian embed pipeline.
    const isRemoteLike = (
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('data:')
    );
    if (!isRemoteLike) return true;
  }

  return false;
}

async function waitForTripletDomToSettle(root, options = {}) {
  if (!root) return;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 500;
  const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 16;
  const minObserveMs = Number.isFinite(options.minObserveMs)
    ? Math.max(0, Math.floor(options.minObserveMs))
    : Math.min(48, timeoutMs);

  const start = Date.now();
  let unresolved = countUnresolvedImageEmbeds(root);
  if (unresolved === 0 && minObserveMs <= 0) {
    return;
  }

  // Fast path with a short observation window: avoid waiting full settle time
  // while still catching delayed async embed insertion after render.
  if (unresolved === 0 && minObserveMs > 0) {
    while (Date.now() - start < minObserveMs) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      unresolved = countUnresolvedImageEmbeds(root);
      if (unresolved > 0) break;
    }
    if (unresolved === 0) return;
  }

  let stableCount = 0;

  while (Date.now() - start < timeoutMs) {
    unresolved = countUnresolvedImageEmbeds(root);
    if (unresolved === 0) {
      stableCount += 1;
      if (stableCount >= 2) return;
    } else {
      stableCount = 0;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function renderByObsidianMarkdownRenderer({
  app,
  markdown,
  sourcePath,
  targetEl,
  component = null,
  markdownRenderer = MarkdownRenderer,
}) {
  if (!markdownRenderer) {
    throw new Error('Obsidian MarkdownRenderer is not available');
  }

  if (typeof markdownRenderer.renderMarkdown === 'function') {
    await markdownRenderer.renderMarkdown(markdown, targetEl, sourcePath || '', component);
    return;
  }

  if (typeof markdownRenderer.render === 'function') {
    if (!app) throw new Error('Obsidian app instance is required for MarkdownRenderer.render');
    await markdownRenderer.render(app, markdown, targetEl, sourcePath || '', component);
    return;
  }

  throw new Error('Obsidian MarkdownRenderer does not expose renderMarkdown/render');
}

async function renderObsidianTripletMarkdown({
  app,
  converter,
  markdown,
  sourcePath = '',
  component = null,
  markdownRenderer = MarkdownRenderer,
  serializer = serializeObsidianRenderedHtml,
}) {
  if (typeof document === 'undefined') {
    throw new Error('Triplet renderer requires DOM environment');
  }
  if (!converter) {
    throw new Error('Triplet renderer requires converter runtime');
  }

  const container = document.createElement('div');
  const { markdown: preparedMarkdown, mathFormulas } = preprocessMarkdownForTriplet(markdown, converter);

  const shouldObserveWindow = shouldObserveAsyncEmbedWindow(preparedMarkdown);
  await renderByObsidianMarkdownRenderer({
    app,
    markdown: preparedMarkdown,
    sourcePath,
    targetEl: container,
    component,
    markdownRenderer,
  });

  // Wait for image embeds to settle; MarkdownRenderer may resolve embeds asynchronously.
  await waitForTripletDomToSettle(container, shouldObserveWindow ? {} : { minObserveMs: 0 });

  const serializedHtml = serializer({
    root: container,
    converter,
    sourcePath,
    app,
    preRenderedMath: mathFormulas,
  });

  return serializedHtml;
}

module.exports = {
  neutralizeUnsafeMarkdownLinks,
  neutralizePlainWikilinks,
  preprocessMarkdownForTriplet,
  injectHardBreaksForLegacyParity,
  shouldObserveAsyncEmbedWindow,
  waitForTripletDomToSettle,
  renderByObsidianMarkdownRenderer,
  renderObsidianTripletMarkdown,
};
