const { MarkdownRenderer } = require('obsidian');
const { serializeObsidianRenderedHtml } = require('./obsidian-triplet-serializer');

function containsLegacyIncompatibleMathMarkup(html) {
  const value = String(html || '');
  return /<mjx-(?:math|container)\b/i.test(value);
}

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

  output = neutralizeUnsafeMarkdownLinks(output);
  output = neutralizePlainWikilinks(output);

  // Legacy converter runs markdown-it with breaks=true. Normalize soft line breaks
  // so Obsidian renderer emits equivalent <br> in common paragraph text.
  output = injectHardBreaksForLegacyParity(output);

  return output;
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

async function waitForTripletDomToSettle(root, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 500;
  const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 16;
  const start = Date.now();
  let previousSnapshot = '';
  let stableCount = 0;

  while (Date.now() - start < timeoutMs) {
    const unresolved = countUnresolvedImageEmbeds(root);
    const snapshot = `${unresolved}:${root ? root.innerHTML : ''}`;
    if (unresolved === 0 && snapshot === previousSnapshot) {
      stableCount += 1;
      if (stableCount >= 2) return;
    } else {
      stableCount = 0;
    }
    previousSnapshot = snapshot;
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
  const preparedMarkdown = preprocessMarkdownForTriplet(markdown, converter);
  await renderByObsidianMarkdownRenderer({
    app,
    markdown: preparedMarkdown,
    sourcePath,
    targetEl: container,
    component,
    markdownRenderer,
  });
  // Wait for image embeds to settle; MarkdownRenderer may resolve embeds asynchronously.
  await waitForTripletDomToSettle(container);

  const serializedHtml = serializer({
    root: container,
    converter,
    sourcePath,
    app,
  });

  // MathJax markup generated by MarkdownRenderer may remain as mjx-* tags,
  // while legacy phase2 emits SVG-wrapped output. Fall back to legacy converter
  // for math-containing documents to keep strict parity.
  if (containsLegacyIncompatibleMathMarkup(serializedHtml) && typeof converter.convert === 'function') {
    if (typeof converter.updateSourcePath === 'function') {
      converter.updateSourcePath(sourcePath);
    }
    return converter.convert(markdown);
  }

  return serializedHtml;
}

module.exports = {
  containsLegacyIncompatibleMathMarkup,
  neutralizeUnsafeMarkdownLinks,
  neutralizePlainWikilinks,
  preprocessMarkdownForTriplet,
  injectHardBreaksForLegacyParity,
  waitForTripletDomToSettle,
  renderByObsidianMarkdownRenderer,
  renderObsidianTripletMarkdown,
};
