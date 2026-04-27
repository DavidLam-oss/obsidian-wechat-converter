function appendInlineStyle(el, styleText) {
  if (!el || !styleText) return;
  const existing = el.getAttribute('style') || '';
  if (!existing) {
    el.setAttribute('style', styleText);
    return;
  }
  const normalized = existing.trim().endsWith(';') ? existing.trim() : `${existing.trim()};`;
  el.setAttribute('style', `${normalized} ${styleText}`);
}

function setInlineStyleIfMissing(el, styleText) {
  if (!el || !styleText) return;
  const existing = el.getAttribute('style');
  if (existing && existing.trim()) return;
  el.setAttribute('style', styleText);
}

const LEGACY_CALLOUT_ICON_BY_TYPE = {
  note: 'ℹ️',
  info: 'ℹ️',
  todo: '☑️',
  abstract: '📄',
  summary: '📄',
  tldr: '📄',
  tip: '💡',
  hint: '💡',
  important: '💡',
  success: '✅',
  check: '✅',
  done: '✅',
  question: '❓',
  help: '❓',
  faq: '❓',
  warning: '⚠️',
  caution: '⚠️',
  attention: '⚠️',
  failure: '❌',
  fail: '❌',
  missing: '❌',
  danger: '🚨',
  error: '❌',
  bug: '🐛',
  quote: '💬',
  cite: '📝',
  example: '📋',
};

function toTitleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function resolveLegacyCalloutIcon(type) {
  const key = String(type || '').trim().toLowerCase();
  if (!key) return 'ℹ️';
  return LEGACY_CALLOUT_ICON_BY_TYPE[key] || 'ℹ️';
}

function convertObsidianCalloutsToLegacy(container, converter) {
  if (!container || !converter) return;
  if (typeof converter.renderCalloutOpen !== 'function') return;

  const callouts = Array.from(
    container.querySelectorAll('div.callout,aside.callout,blockquote.callout,section.callout')
  );
  if (callouts.length === 0) return;

  // Convert deepest nodes first so nested callouts stay stable.
  const getCalloutDepth = (node) => {
    let depth = 0;
    let cursor = node?.parentElement || null;
    while (cursor) {
      if (
        cursor.matches &&
        cursor.matches('div.callout,aside.callout,blockquote.callout,section.callout')
      ) {
        depth += 1;
      }
      cursor = cursor.parentElement;
    }
    return depth;
  };
  callouts.sort((a, b) => {
    const da = getCalloutDepth(a);
    const db = getCalloutDepth(b);
    return db - da;
  });

  for (const callout of callouts) {
    if (!callout || !callout.parentNode) continue;

    const typeRaw =
      callout.getAttribute('data-callout') ||
      callout.getAttribute('data-callout-type') ||
      '';
    const type = String(typeRaw || '').trim().toLowerCase();

    const titleEl =
      callout.querySelector(':scope > .callout-title .callout-title-inner') ||
      callout.querySelector(':scope > .callout-title-inner') ||
      callout.querySelector(':scope > .callout-title');
    const titleText = String(titleEl?.textContent || '').trim();
    const title = titleText || toTitleCase(type) || 'Callout';

    const contentEl =
      callout.querySelector(':scope > .callout-content') ||
      callout.querySelector(':scope > .callout-body');
    const contentHtml = contentEl ? contentEl.innerHTML : callout.innerHTML;

    const calloutInfo = {
      type: type || title.toLowerCase(),
      title,
      icon: resolveLegacyCalloutIcon(type || title),
      label: type || title,
    };

    let openHtml = '';
    try {
      openHtml = converter.renderCalloutOpen(calloutInfo);
    } catch (error) {
      continue;
    }
    if (!openHtml) continue;

    const host = document.createElement('div');
    host.innerHTML = `${openHtml}${contentHtml}</section></section>`;

    const replacementNodes = Array.from(host.childNodes);
    if (replacementNodes.length === 0) continue;
    callout.replaceWith(...replacementNodes);
  }
}

function sanitizeClassList(el, tagName, finalStage = false) {
  const className = el.getAttribute('class');
  if (!className) return;
  const classes = className.split(/\s+/).filter(Boolean);
  let keep = [];

  if (tagName === 'section') {
    keep = classes.filter((cls) => cls === 'code-snippet__fix');
  } else if (tagName === 'img') {
    keep = classes.filter((cls) => cls === 'math-formula-image' || cls === 'mermaid-diagram-image');
  } else if (tagName === 'svg') {
    keep = classes.filter((cls) => cls === 'owc-mermaid-diagram');
  } else if (!finalStage && (tagName === 'pre' || tagName === 'code')) {
    keep = classes.filter((cls) => cls.startsWith('language-'));
  }

  if (keep.length > 0) {
    el.setAttribute('class', keep.join(' '));
  } else {
    el.removeAttribute('class');
  }
}

function pruneObsidianOnlyAttributes(container, { finalStage = false } = {}) {
  if (!container) return;

  const SVG_ALLOWED_ATTRS = new Set([
    'style', 'class', 'xmlns', 'viewbox', 'width', 'height', 'x', 'y',
    'cx', 'cy', 'rx', 'ry', 'r', 'x1', 'y1', 'x2', 'y2', 'd', 'points',
    'transform', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity',
    'fill-opacity', 'stroke-opacity', 'font-size', 'font-family',
    'font-weight', 'text-anchor', 'dominant-baseline', 'preserveaspectratio',
    'marker-start', 'marker-mid', 'marker-end', 'markerwidth', 'markerheight',
    'refx', 'refy', 'orient', 'pathlength', 'role', 'focusable', 'aria-hidden',
    'xmlns:xlink', 'xlink:href',
  ]);
  const SVG_TAGS = new Set([
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'text', 'tspan', 'defs', 'marker', 'foreignobject', 'clippath',
    'pattern', 'mask', 'symbol', 'use',
  ]);

  const getAllowedAttrs = (tagName) => {
    if (tagName === 'a') return new Set(['href', 'style']);
    if (tagName === 'img') return new Set(['src', 'alt', 'style', 'width', 'height', 'class']);
    if (tagName === 'section' && !finalStage) return new Set(['style', 'class', 'data-owc-sensitive-image', 'data-owc-sensitive-warning']);
    if (tagName === 'section') return new Set(['style', 'class']);
    if (!finalStage && (tagName === 'pre' || tagName === 'code')) return new Set(['style', 'class']);
    if (SVG_TAGS.has(tagName)) return SVG_ALLOWED_ATTRS;
    return new Set(['style']);
  };

  Array.from(container.querySelectorAll('*')).forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const allowed = getAllowedAttrs(tagName);
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('data-') || name === 'id' || name === 'dir') {
        if (allowed.has(name)) continue;
        el.removeAttribute(attr.name);
        continue;
      }
      if (!allowed.has(name)) {
        el.removeAttribute(attr.name);
      }
    }

    sanitizeClassList(el, tagName, finalStage);

    const style = el.getAttribute('style');
    if (style !== null && style.trim() === '') {
      el.removeAttribute('style');
    }
  });
}

function normalizeLegacyTagAliases(container) {
  if (!container) return;
  const strikeTags = Array.from(container.querySelectorAll('s'));
  for (const sEl of strikeTags) {
    const del = document.createElement('del');
    if (sEl.hasAttributes()) {
      Array.from(sEl.attributes).forEach((attr) => {
        del.setAttribute(attr.name, attr.value);
      });
    }
    del.innerHTML = sEl.innerHTML;
    sEl.replaceWith(del);
  }
}

function normalizeLegacyDeleteNesting(container) {
  if (!container) return;

  const dels = Array.from(container.querySelectorAll('del'));
  for (const first of dels) {
    if (!first || !first.parentElement) continue;
    if (first.parentElement.tagName.toLowerCase() === 'del') continue;
    if (first.querySelector('del')) continue;

    let spacer = first.nextSibling;
    let second = null;

    if (spacer && spacer.nodeType === Node.TEXT_NODE && /^\s*$/.test(spacer.textContent || '')) {
      second = spacer.nextSibling;
    } else if (spacer && spacer.nodeType === Node.ELEMENT_NODE && spacer.tagName.toLowerCase() === 'del') {
      second = spacer;
      spacer = null;
    } else {
      continue;
    }

    if (!second || second.nodeType !== Node.ELEMENT_NODE || second.tagName.toLowerCase() !== 'del') continue;

    const label = (first.textContent || '').trim();
    if (!/[：:]$/.test(label)) continue;
    if (!/\S/.test(second.textContent || '')) continue;

    if (!/\s$/.test(first.textContent || '')) {
      first.appendChild(document.createTextNode(' '));
    }
    first.appendChild(second);
    if (spacer && spacer.parentNode) spacer.remove();
  }
}

function normalizeLegacyDeleteNestingInHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return html;
  return html.replace(
    /<del([^>]*)>([^<]*[：:])<\/del>(?:\s|&nbsp;|<br\s*\/?>)*<del([^>]*)>/g,
    (_match, attrs1, label, attrs2) => `<del${attrs1}>${label} <del${attrs2}>`
  );
}

function getTagStyle(converter, tagName) {
  if (!converter || typeof converter.getInlineStyle !== 'function') return '';
  try {
    return converter.getInlineStyle(tagName) || '';
  } catch (error) {
    return '';
  }
}

function safeDecodeCaption(text) {
  if (!text || typeof text !== 'string') return text || '';
  if (!text.includes('%')) return text;
  try {
    return decodeURIComponent(text);
  } catch (error) {
    // Keep original caption when percent-encoding is malformed (e.g. "100%")
    return text;
  }
}

function deriveImageCaption(converter, src = '', alt = '') {
  let caption = alt || '';
  if (!caption) {
    if (converter && typeof converter.extractFileName === 'function') {
      caption = converter.extractFileName(src);
    } else {
      caption = src.split('/').pop() || '图片';
    }
  }
  caption = safeDecodeCaption(caption);
  // Keep parity with legacy converter image caption extraction:
  // remove cache/query fragments before stripping extension.
  caption = caption.replace(/[?#].*$/, '');
  caption = caption.replace(/\|\s*\d+(x\d+)?\s*$/, '');
  caption = caption.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');
  return caption || '图片';
}

function extractWidthHintFromText(text) {
  const value = String(text || '');
  if (!value) return '';

  const wikiMatch = value.match(/\|(\d{2,4})(?:x\d+)?(?:\]\]|$)/i);
  if (wikiMatch && wikiMatch[1]) return wikiMatch[1];

  const styleMatch = value.match(/\b(?:max-)?width\s*[:=]\s*(\d{2,4})\s*px\b/i);
  if (styleMatch && styleMatch[1]) return styleMatch[1];

  const bareMatch = value.match(/^\s*(\d{2,4})\s*$/);
  if (bareMatch && bareMatch[1]) return bareMatch[1];

  return '';
}

function findImageWidthHintFromAncestors(el) {
  let cursor = el;
  let depth = 0;
  while (cursor && depth < 6) {
    if (cursor.nodeType === Node.ELEMENT_NODE) {
      const attrs = ['width', 'data-width', 'data-size', 'data-image-width', 'style', 'src', 'data-src', 'data-href', 'title', 'aria-label', 'alt'];
      for (const key of attrs) {
        const value = cursor.getAttribute(key);
        const width = extractWidthHintFromText(value);
        if (width) return width;
      }
      const textWidth = extractWidthHintFromText(cursor.textContent || '');
      if (textWidth) return textWidth;
    }
    cursor = cursor.parentElement;
    depth += 1;
  }
  return '';
}

function findLegacyAltHintFromAncestors(el, rawAlt = '') {
  const baseAlt = String(rawAlt || '').trim();
  if (!baseAlt) return '';

  let cursor = el;
  let depth = 0;
  while (cursor && depth < 6) {
    if (cursor.nodeType === Node.ELEMENT_NODE) {
      const attrs = ['alt', 'title', 'aria-label', 'data-alt', 'data-caption'];
      for (const key of attrs) {
        const value = String(cursor.getAttribute(key) || '').trim();
        if (!value) continue;
        if (value === baseAlt) continue;
        if (value.startsWith(`${baseAlt}|`) && /\|\d{2,4}(x\d+)?\s*$/i.test(value)) {
          return value;
        }
      }
    }
    cursor = cursor.parentElement;
    depth += 1;
  }
  return '';
}

function buildLegacyParityImageAlt(imgEl, rawAlt = '') {
  const alt = String(rawAlt || '');
  if (!alt) return alt;
  if (/\|\s*\d+(x\d+)?\s*$/.test(alt)) return alt;

  const ancestorAltHint = findLegacyAltHintFromAncestors(imgEl, alt);
  if (ancestorAltHint) {
    return ancestorAltHint;
  }

  const widthAttr = String(imgEl?.getAttribute?.('width') || '').trim();
  if (/^\d+$/.test(widthAttr)) {
    return `${alt}|${widthAttr}`;
  }

  const style = String(imgEl?.getAttribute?.('style') || '');
  const styleMatch = style.match(/(?:^|;)\s*width\s*:\s*(\d+)px\b/i);
  if (styleMatch && styleMatch[1]) {
    return `${alt}|${styleMatch[1]}`;
  }

  const ancestorWidth = findImageWidthHintFromAncestors(imgEl);
  if (ancestorWidth) {
    return `${alt}|${ancestorWidth}`;
  }

  return alt;
}

function sanitizeAnchorAndImageLinks(container, converter) {
  if (!container) return;

  const hasExplicitProtocol = (value) => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(String(value || ''));
  const hasNonAscii = (value) => /[^\x00-\x7F]/.test(String(value || ''));

  const canonicalizeRelativeHrefForLegacyParity = (href) => {
    const value = String(href || '').trim();
    if (!value) return value;
    if (value.startsWith('#') || value.startsWith('//')) return value;
    if (hasExplicitProtocol(value)) {
      // Keep most absolute links unchanged; only normalize non-ASCII http(s) URLs
      // for parity with legacy punycode output.
      if (/^https?:/i.test(value) && hasNonAscii(value)) {
        try {
          const parsed = new URL(value);
          const isBareHost = /^https?:\/\/[^/?#]+$/i.test(value);
          if (isBareHost && parsed.pathname === '/' && !parsed.search && !parsed.hash) {
            return `${parsed.protocol}//${parsed.host}`;
          }
          return parsed.href;
        } catch (error) {
          return value;
        }
      }
      return value;
    }

    let decoded = value;
    try {
      decoded = decodeURI(value);
    } catch (error) {
      // keep original value if decode fails (e.g. malformed percent encoding)
    }
    return encodeURI(decoded);
  };

  container.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const safeHref =
      converter && typeof converter.validateLink === 'function'
        ? converter.validateLink(href, false)
        : href;
    a.setAttribute('href', canonicalizeRelativeHrefForLegacyParity(safeHref));
  });
}

function extractImageEmbedSrc(embedEl) {
  if (!embedEl) return '';
  const attrKeys = ['src', 'data-src', 'data-href', 'href'];
  for (const key of attrKeys) {
    const val = embedEl.getAttribute(key);
    if (val && String(val).trim()) return String(val).trim();
  }

  const text = String(embedEl.textContent || '').trim();
  const wikiMatch = text.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
  if (wikiMatch && wikiMatch[1]) return String(wikiMatch[1]).trim();
  return '';
}

function looksLikeImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return false;
  if (/^(data:image\/|app:\/\/|capacitor:\/\/|https?:\/\/)/i.test(value)) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i.test(value);
}

function materializeImageEmbedPlaceholders(container, converter) {
  if (!container) return;
  const embeds = Array.from(container.querySelectorAll('span.internal-embed,span.image-embed,div.internal-embed,div.image-embed'));
  for (const embed of embeds) {
    const hasImg = !!embed.querySelector('img');
    if (hasImg) continue;

    const src = extractImageEmbedSrc(embed);
    const forceAsImage = embed.classList.contains('image-embed');
    if (!src || (!forceAsImage && !looksLikeImageSrc(src))) continue;

    let resolvedSrc = normalizeObsidianImageSrcForLegacyParity(src);
    if (converter && typeof converter.resolveImagePath === 'function') {
      resolvedSrc = converter.resolveImagePath(resolvedSrc);
    }

    const img = document.createElement('img');
    img.setAttribute('src', resolvedSrc);
    const alt = embed.getAttribute('alt') || '';
    if (alt) img.setAttribute('alt', alt);
    const widthHint = findImageWidthHintFromAncestors(embed);
    if (widthHint) {
      img.setAttribute('width', widthHint);
    }
    embed.replaceWith(img);
  }
}

function promoteImageEmbedAltHints(container) {
  if (!container) return;
  const embeds = Array.from(container.querySelectorAll('span.image-embed,div.image-embed,span.internal-embed,div.internal-embed'));
  for (const embed of embeds) {
    const img = embed.querySelector('img');
    if (!img) continue;

    const embedAlt = String(embed.getAttribute('alt') || '').trim();
    const imgAlt = String(img.getAttribute('alt') || '').trim();
    const hasSizedAlt = /\|\s*\d+(x\d+)?\s*$/i.test(embedAlt);
    if (hasSizedAlt) {
      if (!imgAlt || embedAlt.startsWith(`${imgAlt}|`)) {
        img.setAttribute('alt', embedAlt);
      }
    }

    const widthHint = findImageWidthHintFromAncestors(embed);
    if (widthHint && !img.getAttribute('width')) {
      img.setAttribute('width', widthHint);
    }
  }
}

function normalizeObsidianImageSrcForLegacyParity(src) {
  const value = String(src || '').trim();
  if (!value) return value;

  // MarkdownRenderer can emit unresolved images like app://obsidian.md/x.
  // Legacy markdown-it path receives plain link path ("x"), so normalize first.
  if (/^app:\/\/obsidian\.md\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const pathname = decodeURIComponent((parsed.pathname || '').replace(/^\/+/, ''));
      return pathname || value;
    } catch (error) {
      return value.replace(/^app:\/\/obsidian\.md\/+/i, '');
    }
  }

  return value;
}

function convertPreBlocks(container, converter) {
  if (!container || !converter || typeof converter.createCodeBlock !== 'function') return;

  const preBlocks = Array.from(container.querySelectorAll('pre'));
  for (const pre of preBlocks) {
    if (pre.closest('.code-snippet__fix')) continue;
    const codeEl = pre.querySelector('code');
    const className = `${pre.className || ''} ${codeEl?.className || ''}`;
    const langMatch = className.match(/language-([\w-]+)/);
    const lang = langMatch ? langMatch[1] : 'text';
    const content = codeEl ? codeEl.textContent || '' : pre.textContent || '';

    const wrapper = document.createElement('div');
    wrapper.innerHTML = converter.createCodeBlock(content, lang);
    const replacement = wrapper.firstElementChild;
    if (replacement) {
      pre.replaceWith(replacement);
    }
  }
}


const SENSITIVE_IMAGE_DEFAULT_WARNING = '此类图片可能引发不适，向左滑动查看';
const SENSITIVE_IMAGE_TITLE_PREFIX = 'OWC_SENSITIVE_IMAGE:';

function decodeSensitiveImageMarkerValue(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch (error) {
    return String(value || '');
  }
}

function setSensitiveImageSectionStyle(el, styleText) {
  if (!el || !styleText) return;
  el.setAttribute('style', styleText);
}

function getSensitiveImageEmbeddedWarning(img) {
  if (!img) return '';
  const title = String(img.getAttribute('title') || '');
  const titleIndex = title.indexOf(SENSITIVE_IMAGE_TITLE_PREFIX);
  if (titleIndex >= 0) {
    return decodeSensitiveImageMarkerValue(title.slice(titleIndex + SENSITIVE_IMAGE_TITLE_PREFIX.length));
  }

  const alt = String(img.getAttribute('alt') || '');
  const altIndex = alt.indexOf(SENSITIVE_IMAGE_TITLE_PREFIX);
  if (altIndex < 0) return '';
  img.setAttribute('alt', alt.slice(0, altIndex).trim());
  return decodeSensitiveImageMarkerValue(alt.slice(altIndex + SENSITIVE_IMAGE_TITLE_PREFIX.length).trim());
}

function buildSensitiveImageReveal({ img, caption, warning, converter }) {
  const wrapper = document.createElement('section');
  setSensitiveImageSectionStyle(wrapper, 'display:block;margin:16px 0;text-align:left;');

  if (caption) {
    const captionEl = document.createElement('section');
    setSensitiveImageSectionStyle(captionEl, getTagStyle(converter, 'figcaption') || 'display:block;margin:8px 0;color:#888;font-size:14px;line-height:1.6;text-align:center;');
    captionEl.textContent = caption;
    wrapper.appendChild(captionEl);
  }

  const scroll = document.createElement('section');
  setSensitiveImageSectionStyle(scroll, 'display:block;width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;box-sizing:border-box;margin:8px 0 0;padding:0;white-space:nowrap;');
  const row = document.createElement('section');
  setSensitiveImageSectionStyle(row, 'display:table;table-layout:fixed;width:200%;min-width:200%;border-spacing:0;font-size:0;line-height:0;');
  const warningPanel = document.createElement('section');
  setSensitiveImageSectionStyle(warningPanel, 'display:table-cell;vertical-align:middle;width:50%;box-sizing:border-box;white-space:normal;font-size:15px;line-height:1.7;padding:0 20px;margin:0;border:1px solid #e6e8ef;border-radius:16px;background:linear-gradient(135deg,#f8f9fc 0%,#eef1f6 100%);color:#4a4f5a;text-align:center;');
  const warningContent = document.createElement('section');
  setSensitiveImageSectionStyle(warningContent, 'display:block;max-width:420px;margin:0 auto;padding:32px 24px;box-sizing:border-box;');
  const warningLabel = document.createElement('section');
  setSensitiveImageSectionStyle(warningLabel, 'display:inline-block;margin:0 auto 14px;padding:4px 12px;border-radius:999px;background:#fff;color:#8a6d3b;border:1px solid #efe2c7;font-size:13px;line-height:1.5;');
  warningLabel.textContent = '敏感图片';
  const warningText = document.createElement('section');
  setSensitiveImageSectionStyle(warningText, 'display:block;margin:0;color:#4a4f5a;font-size:16px;line-height:1.8;font-weight:500;');
  warningText.textContent = warning || SENSITIVE_IMAGE_DEFAULT_WARNING;
  const warningArrow = document.createElement('section');
  setSensitiveImageSectionStyle(warningArrow, 'display:inline-block;margin-top:18px;padding:8px 18px;border-radius:999px;background:#ffffff;color:#5d6472;border:1px solid #dde1ea;font-size:14px;line-height:1.4;letter-spacing:0.04em;box-shadow:0 4px 14px rgba(37,45,60,0.08);');
  warningArrow.textContent = '← 向左滑动查看';
  warningContent.appendChild(warningLabel);
  warningContent.appendChild(warningText);
  warningContent.appendChild(warningArrow);
  warningPanel.appendChild(warningContent);

  const imagePanel = document.createElement('section');
  setSensitiveImageSectionStyle(imagePanel, 'display:table-cell;vertical-align:middle;width:50%;box-sizing:border-box;white-space:normal;font-size:0;line-height:0;padding:0;margin:0;text-align:center;');
  img.setAttribute('data-owc-skip-sensitive-figure', '1');
  appendInlineStyle(img, getTagStyle(converter, 'img'));
  imagePanel.appendChild(img);

  row.appendChild(warningPanel);
  row.appendChild(imagePanel);
  scroll.appendChild(row);
  wrapper.appendChild(scroll);
  return wrapper;
}

function convertSensitiveImageMarkedSections(container, converter) {
  const blocks = Array.from(container.querySelectorAll('section[data-owc-sensitive-image="1"]'));
  for (const block of blocks) {
    const img = block.querySelector('img');
    if (!img) {
      block.removeAttribute('data-owc-sensitive-image');
      block.removeAttribute('data-owc-sensitive-warning');
      continue;
    }

    let src = img.getAttribute('src') || '';
    src = normalizeObsidianImageSrcForLegacyParity(src);
    const safeSrc = converter && typeof converter.validateLink === 'function'
      ? converter.validateLink(src, true)
      : src;
    src = safeSrc;
    if (looksLikeImageSrc(src) && converter && typeof converter.resolveImagePath === 'function') {
      src = converter.resolveImagePath(src);
    }
    img.setAttribute('src', src);
    img.removeAttribute('title');

    const embeddedWarning = getSensitiveImageEmbeddedWarning(img);
    const rawAlt = img.getAttribute('alt') || '';
    const alt = buildLegacyParityImageAlt(img, rawAlt);
    img.setAttribute('alt', alt);
    const caption = alt;
    const rawWarning = block.getAttribute('data-owc-sensitive-warning') || '';
    const warning = String(embeddedWarning || decodeSensitiveImageMarkerValue(rawWarning) || '').trim() || SENSITIVE_IMAGE_DEFAULT_WARNING;
    const reveal = buildSensitiveImageReveal({ img, caption, warning, converter });
    block.replaceWith(reveal);
  }
}

function convertSensitiveImageBlocks(container, converter) {
  if (!container) return;
  convertSensitiveImageMarkedSections(container, converter);
}

function convertStandaloneImages(container, converter) {
  if (!container) return;

  const imgs = Array.from(container.querySelectorAll('img'));
  for (const img of imgs) {
    if (img.closest('figure')) continue;
    if (img.getAttribute('data-owc-skip-sensitive-figure') === '1') continue;
    if (img.getAttribute('alt') === 'logo') continue;
    if (img.classList.contains('math-formula-image')) continue;
    if (img.classList.contains('mermaid-diagram-image')) {
      const src = img.getAttribute('src') || '';
      const safeSrc =
        converter && typeof converter.validateLink === 'function'
          ? converter.validateLink(src, true)
          : src;
      img.setAttribute('src', safeSrc);
      if (!img.getAttribute('style')) {
        img.setAttribute('style', 'display:block;max-width:100%;height:auto;margin:16px auto;');
      }
      continue;
    }

    let src = img.getAttribute('src') || '';
    src = normalizeObsidianImageSrcForLegacyParity(src);
    const safeSrc =
      converter && typeof converter.validateLink === 'function'
        ? converter.validateLink(src, true)
        : src;
    src = safeSrc;

    if (!looksLikeImageSrc(src)) {
      img.setAttribute('src', safeSrc);
      // Preserve raw-html image shape for strict parity; skip theme image styling.
      img.setAttribute('data-owc-skip-style', '1');
      continue;
    }

    if (converter && typeof converter.resolveImagePath === 'function') {
      src = converter.resolveImagePath(src);
    }

    const rawAlt = img.getAttribute('alt') || '';
    const alt = buildLegacyParityImageAlt(img, rawAlt);
    const caption = deriveImageCaption(converter, src, alt);
    const figure = document.createElement('figure');

    if (converter && converter.avatarUrl) {
      let figureStyle = getTagStyle(converter, 'figure');
      figureStyle = figureStyle.replace('text-align: center;', 'text-align: left;');
      appendInlineStyle(figure, figureStyle);

      const header = document.createElement('div');
      appendInlineStyle(header, getTagStyle(converter, 'avatar-header'));

      const avatar = document.createElement('img');
      avatar.setAttribute('src', converter.avatarUrl);
      avatar.setAttribute('alt', 'logo');
      appendInlineStyle(avatar, getTagStyle(converter, 'avatar'));

      const captionEl = document.createElement('span');
      appendInlineStyle(captionEl, getTagStyle(converter, 'avatar-caption'));
      captionEl.textContent = caption;

      header.appendChild(avatar);
      header.appendChild(captionEl);

      const spacer = document.createElement('section');
      spacer.setAttribute('style', 'display:block;height:8px;line-height:8px;font-size:0;');
      spacer.innerHTML = '&nbsp;';

      const bodyImg = document.createElement('img');
      bodyImg.setAttribute('src', src);
      bodyImg.setAttribute('alt', alt);
      appendInlineStyle(bodyImg, getTagStyle(converter, 'img'));

      figure.appendChild(header);
      figure.appendChild(spacer);
      figure.appendChild(bodyImg);
      img.replaceWith(figure);
      continue;
    }

    figure.setAttribute('style', 'display:block;margin:16px 0;text-align:center;');
    const bodyImg = document.createElement('img');
    bodyImg.setAttribute('src', src);
    bodyImg.setAttribute('alt', alt);
    appendInlineStyle(bodyImg, getTagStyle(converter, 'img'));
    figure.appendChild(bodyImg);

    const showCaption = !converter || converter.showImageCaption !== false;
    if (showCaption) {
      const figcaption = document.createElement('figcaption');
      appendInlineStyle(figcaption, getTagStyle(converter, 'figcaption'));
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }

    img.replaceWith(figure);
  }
}

function trimTrailingWhitespaceInBlockText(container) {
  if (!container) return;
  const selector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,figcaption,td,th';
  const blocks = Array.from(container.querySelectorAll(selector));

  for (const block of blocks) {
    let node = block.lastChild;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = String(node.textContent || '');
        const trimmed = original.replace(/[ \t\u00a0]+$/g, '');
        if (trimmed !== original) {
          if (trimmed) {
            node.textContent = trimmed;
            break;
          }
          const prev = node.previousSibling;
          node.remove();
          node = prev;
          continue;
        }
      }
      break;
    }
  }
}

function trimLeadingWhitespaceInBlockText(container) {
  if (!container) return;
  const selector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,figcaption,td,th';
  const blocks = Array.from(container.querySelectorAll(selector));

  for (const block of blocks) {
    let node = block.firstChild;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = String(node.textContent || '');
        const trimmed = original.replace(/^[ \t\u00a0]+/g, '');
        if (trimmed !== original) {
          if (trimmed) {
            node.textContent = trimmed;
            break;
          }
          const next = node.nextSibling;
          node.remove();
          node = next;
          continue;
        }
      }
      break;
    }
  }
}

function pruneEmptyHeadings(container) {
  if (!container) return;
  const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));

  for (const heading of headings) {
    const text = String(heading.textContent || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (text) continue;

    const html = String(heading.innerHTML || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (!html) {
      heading.remove();
      continue;
    }

    const normalized = html
      .replace(/<br\s*\/?>/gi, '')
      .replace(/&nbsp;/gi, '')
      .replace(/\s+/g, '');
    if (!normalized) {
      heading.remove();
    }
  }
}

function applyThemeInlineStyles(container, converter) {
  if (!container || !converter) return;

  const styledTags = [
    'p', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'figure', 'figcaption',
    'img', 'a', 'table', 'thead', 'th', 'td', 'hr', 'strong', 'em', 'del',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  ];

  for (const tag of styledTags) {
    const styleText = getTagStyle(converter, tag);
    if (!styleText) continue;
    container.querySelectorAll(tag).forEach((el) => {
      if (tag === 'img' && el.getAttribute('data-owc-skip-style') === '1') {
        return;
      }
      setInlineStyleIfMissing(el, styleText);
    });
  }

  const liPStyle = getTagStyle(converter, 'li p');
  if (liPStyle) {
    container.querySelectorAll('li > p').forEach((p) => setInlineStyleIfMissing(p, liPStyle));
  }
}

function stripDangerousTags(container, { preserveSvgStyleTags = false } = {}) {
  if (!container) return;
  container.querySelectorAll('script,iframe,object,embed,form,input,button,style').forEach((el) => {
    if (
      preserveSvgStyleTags
      && el.tagName?.toLowerCase?.() === 'style'
      && el.closest?.('svg')
    ) {
      return;
    }
    el.remove();
  });
}

function protectSvgStyleTags(html) {
  if (typeof html !== 'string' || !html.includes('<style')) {
    return { html, placeholders: [] };
  }

  const placeholders = [];
  let index = 0;
  const protectedHtml = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svgMarkup) => {
    return svgMarkup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (styleMarkup) => {
      const token = `__OWC_SVG_STYLE_${index}__`;
      placeholders.push({ token, styleMarkup });
      index += 1;
      return token;
    });
  });

  return { html: protectedHtml, placeholders };
}

function restoreSvgStyleTags(html, placeholders = []) {
  let result = String(html || '');
  placeholders.forEach(({ token, styleMarkup }) => {
    result = result.split(token).join(styleMarkup);
  });
  return result;
}

function looksLikeMathSvg(svg) {
  if (!svg || svg.tagName?.toLowerCase?.() !== 'svg') return false;
  if (svg.getAttribute('role') === 'img') return true;
  if (svg.getAttribute('focusable') === 'false') return true;
  if (svg.classList?.contains('MathJax')) return true;
  return !!svg.closest?.('mjx-container,mjx-math,.MathJax');
}

function normalizeMathPresentation(container) {
  if (!container || typeof document === 'undefined') return;

  const blockStyle = 'display:block; width:100%; margin:1em auto; text-align:center; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;';
  const inlineStyle = 'display:inline-block; vertical-align:middle; transform:translateY(-0.12em); margin:0 1px; line-height:1;';

  const normalizeTopOffsets = (el) => {
    if (!el || typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return;
    const style = String(el.getAttribute('style') || '');
    if (!/\btop\s*:/i.test(style)) return;
    let topValue = null;
    let nextStyle = style.replace(/(^|;)\s*top\s*:\s*([^;]+)\s*;?/i, (_m, prefix, value) => {
      topValue = String(value || '').trim();
      return prefix || '';
    });
    if (!topValue) return;
    if (/transform\s*:/i.test(nextStyle)) {
      nextStyle = nextStyle.replace(
        /transform\s*:\s*([^;]+)/i,
        (_m, value) => `transform:${String(value || '').trim()} translateY(${topValue})`
      );
    } else {
      nextStyle = `${nextStyle}${nextStyle.trim().endsWith(';') || !nextStyle.trim() ? '' : ';'}transform: translateY(${topValue});`;
    }
    el.setAttribute('style', nextStyle);
  };

  container.querySelectorAll('mjx-container').forEach((mjx) => {
    const attrs = `${mjx.getAttribute('display') || ''} ${mjx.getAttribute('style') || ''}`.toLowerCase();
    const isBlock = attrs.includes('true') || attrs.includes('display: block') || attrs.includes('display:block');
    const existing = String(mjx.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    mjx.setAttribute('style', `${normalized}${isBlock ? blockStyle : inlineStyle}`);
  });

  container.querySelectorAll('svg').forEach((svg) => {
    if (!looksLikeMathSvg(svg)) return;
    const svgStyle = String(svg.getAttribute('style') || '');
    let normalizedSvgStyle = svgStyle ? `${svgStyle}${svgStyle.trim().endsWith(';') ? '' : ';'}` : '';
    normalizedSvgStyle = normalizedSvgStyle.replace(/vertical-align\s*:\s*[^;]+;?/gi, '');
    if (!/max-width\s*:/i.test(normalizedSvgStyle)) {
      normalizedSvgStyle = `${normalizedSvgStyle}max-width: 100%; height: auto;`;
    }
    svg.setAttribute('style', `${normalizedSvgStyle}display:inline-block;vertical-align:middle;`);

    const parent = svg.parentElement;
    if (!parent) return;

    const parentTag = parent.tagName.toLowerCase();
    const mathParent = parentTag === 'mjx-container' ? parent : null;
    const blockHint = String(mathParent?.getAttribute('display') || mathParent?.getAttribute('style') || '').toLowerCase();
    const wrapperMathMode = parent.getAttribute('data-owc-math');
    const hostMathMode = parentTag !== 'mjx-container' ? parent.closest?.('[data-owc-math]')?.getAttribute('data-owc-math') : null;
    const isBlockMath = wrapperMathMode === 'block'
      || hostMathMode === 'block'
      || blockHint.includes('true')
      || blockHint.includes('display: block')
      || blockHint.includes('display:block');

    if (isBlockMath) {
      const host = parentTag === 'section'
        ? parent
        : (parentTag === 'p' && parent.childNodes.length === 1 ? parent : null);
      if (host) {
        host.setAttribute('style', blockStyle);
      }
      svg.setAttribute(
        'style',
        `${svg.getAttribute('style') || ''}${String(svg.getAttribute('style') || '').trim().endsWith(';') || !svg.getAttribute('style') ? '' : ';'}display:block;margin:0 auto;`
      );
    } else if (parentTag === 'span' || parentTag === 'mjx-container') {
      const existing = String(parent.getAttribute('style') || '');
      const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
      parent.setAttribute('style', `${normalized}${inlineStyle}`);
    }

    normalizeTopOffsets(svg);
    Array.from(svg.querySelectorAll('[style*="top:"], [style*="top: "]')).forEach(normalizeTopOffsets);
  });

  container.querySelectorAll('[data-owc-math="block"]').forEach((el) => {
    const existing = String(el.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    el.setAttribute('style', `${normalized}${blockStyle}`);
  });

  container.querySelectorAll('[data-owc-math="inline"]').forEach((el) => {
    const existing = String(el.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    el.setAttribute('style', `${normalized}${inlineStyle}`);
  });
}

function applyLegacyTypographerParity(container, converter) {
  if (!container || !converter || !converter.md) return;
  if (typeof converter.md.renderInline !== 'function') return;
  if (converter.md.options && converter.md.options.typographer !== true) return;
  if (typeof document === 'undefined') return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const decodeHost = document.createElement('div');
  const interestingPattern = /["']|\.{3}|---?|\+-|\((?:c|r|tm)\)/i;

  let node = walker.nextNode();
  while (node) {
    const current = node;
    node = walker.nextNode();

    const parent = current.parentElement;
    if (!parent) continue;
    if (parent.closest('pre,code,kbd,samp,script,style,textarea,svg,mjx-container,mjx-math,math')) continue;

    const original = String(current.textContent || '');
    if (!original || !interestingPattern.test(original)) continue;

    let rendered = '';
    try {
      rendered = converter.md.renderInline(original);
    } catch (error) {
      continue;
    }
    if (!rendered || rendered === original) continue;

    decodeHost.innerHTML = rendered;
    const normalized = String(decodeHost.textContent || '');
    if (normalized && normalized !== original) {
      current.textContent = normalized;
    }
  }
}

function renderUnresolvedMathFormulas(container, converter) {
  // Obsidian's MarkdownRenderer.renderMarkdown does not render LaTeX math formulas.
  // This function detects unresolved $...$ and $$...$$ patterns in text nodes
  // and renders them using the converter's markdown-it + MathJax pipeline.
  if (!container || !converter) return;
  if (!converter.md || typeof converter.md.renderInline !== 'function') return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    const text = String(node.textContent || '');
    // Check for math patterns: $...$ (inline) or $$...$$ (block)
    if (text.includes('$')) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (!parent) continue;
    // Skip if inside code, pre, or already rendered math
    if (parent.closest('pre,code,kbd,samp,script,style,textarea,mjx-container,mjx-math,math')) continue;

    const text = String(textNode.textContent || '');
    if (!text.includes('$')) continue;

    // Check if there are actual math patterns (not just escaped dollar signs)
    // Pattern: $$...$$ for block, $...$ for inline (not preceded/followed by $)
    const hasBlockMath = /\$\$[\s\S]+?\$\$/.test(text);
    const hasInlineMath = /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/.test(text);
    if (!hasBlockMath && !hasInlineMath) continue;

    // Use markdown-it to render the text with math
    let rendered;
    try {
      // For block math, we need to handle it differently
      if (hasBlockMath) {
        // Create a temporary container and use full render for block math
        const tempDiv = document.createElement('div');
        // Wrap block math in paragraph-like structure for rendering
        const wrappedText = text.replace(/\$\$([\s\S]+?)\$\$/g, '\n$$\n$1\n$$\n');
        const fullRendered = converter.md.render(wrappedText);
        tempDiv.innerHTML = fullRendered;

        // Extract the rendered content
        const fragment = document.createDocumentFragment();
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }
        textNode.replaceWith(fragment);
      } else {
        // Inline math only - use renderInline
        rendered = converter.md.renderInline(text);
        if (rendered && rendered !== text) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = rendered;
          const fragment = document.createDocumentFragment();
          while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
          }
          textNode.replaceWith(fragment);
        }
      }
    } catch (error) {
      // Keep original text if rendering fails
      continue;
    }
  }
}

function applyLegacyLinkifyParity(container, converter) {
  if (!container || !converter || !converter.md || !converter.md.linkify) return;
  if (typeof converter.md.linkify.match !== 'function') return;
  if (typeof document === 'undefined') return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const current = node;
    node = walker.nextNode();

    const parent = current.parentElement;
    if (!parent) continue;
    if (parent.closest('a,pre,code,kbd,samp,script,style,textarea,svg,mjx-container,mjx-math,math')) continue;

    const original = String(current.textContent || '');
    if (!original || !original.includes('.')) continue;

    let matches = null;
    try {
      matches = converter.md.linkify.match(original);
    } catch (error) {
      matches = null;
    }
    if (!Array.isArray(matches) || matches.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const item of matches) {
      const start = Number.isFinite(item?.index) ? item.index : -1;
      const end = Number.isFinite(item?.lastIndex) ? item.lastIndex : -1;
      if (start < 0 || end <= start || start < cursor || end > original.length) continue;

      if (start > cursor) {
        fragment.appendChild(document.createTextNode(original.slice(cursor, start)));
      }

      const displayText = original.slice(start, end);
      const hrefCandidate = String(item?.url || item?.text || displayText || '').trim();
      const href =
        converter && typeof converter.validateLink === 'function'
          ? converter.validateLink(hrefCandidate, false)
          : hrefCandidate;

      const a = document.createElement('a');
      a.setAttribute('href', href);
      a.textContent = displayText;
      fragment.appendChild(a);
      cursor = end;
    }

    if (cursor === 0) continue;
    if (cursor < original.length) {
      fragment.appendChild(document.createTextNode(original.slice(cursor)));
    }

    current.replaceWith(fragment);
  }
}

function injectPreRenderedMathFormulas(html, formulas) {
  if (!html || !Array.isArray(formulas) || formulas.length === 0) return html;

  let result = html;
  for (const { placeholder, rendered } of formulas) {
    if (placeholder && rendered) {
      // Replace placeholder with pre-rendered math HTML
      result = result.split(placeholder).join(rendered);
    }
  }
  return result;
}

function serializeObsidianRenderedHtml({
  root,
  converter,
  preRenderedMath = [],
  preserveSvgStyleTags = false,
}) {
  if (typeof document === 'undefined') {
    throw new Error('Triplet serializer requires DOM environment');
  }

  const container = document.createElement('div');
  container.innerHTML = root ? root.innerHTML : '';

  materializeImageEmbedPlaceholders(container, converter);
  promoteImageEmbedAltHints(container);
  convertObsidianCalloutsToLegacy(container, converter);
  pruneObsidianOnlyAttributes(container, { finalStage: false });
  normalizeLegacyTagAliases(container);
  normalizeLegacyDeleteNesting(container);
  stripDangerousTags(container, { preserveSvgStyleTags });
  // Render math formulas that Obsidian's MarkdownRenderer didn't process
  renderUnresolvedMathFormulas(container, converter);
  applyLegacyLinkifyParity(container, converter);
  applyLegacyTypographerParity(container, converter);
  sanitizeAnchorAndImageLinks(container, converter);
  normalizeMathPresentation(container);
  convertPreBlocks(container, converter);
  convertSensitiveImageBlocks(container, converter);
  convertStandaloneImages(container, converter);
  applyThemeInlineStyles(container, converter);
  pruneObsidianOnlyAttributes(container, { finalStage: true });
  trimLeadingWhitespaceInBlockText(container);
  trimTrailingWhitespaceInBlockText(container);
  pruneEmptyHeadings(container);

  let html = container.innerHTML;

  // Inject pre-rendered math formulas (placeholders were created during preprocessing)
  html = injectPreRenderedMathFormulas(html, preRenderedMath);

  if (converter && typeof converter.fixListParagraphs === 'function') {
    html = converter.fixListParagraphs(html);
  }
  if (converter && typeof converter.unwrapFigures === 'function') {
    html = converter.unwrapFigures(html);
  }
  if (converter && typeof converter.removeBlockquoteParagraphMargins === 'function') {
    html = converter.removeBlockquoteParagraphMargins(html);
  }
  if (converter && typeof converter.fixMathJaxTags === 'function') {
    html = converter.fixMathJaxTags(html);
  }
  let svgStyleProtection = { html, placeholders: [] };
  if (preserveSvgStyleTags) {
    svgStyleProtection = protectSvgStyleTags(html);
    html = svgStyleProtection.html;
  }

  if (converter && typeof converter.sanitizeHtml === 'function') {
    html = converter.sanitizeHtml(html);
  }

  if (preserveSvgStyleTags) {
    html = restoreSvgStyleTags(html, svgStyleProtection.placeholders);
  }
  html = normalizeLegacyDeleteNestingInHtml(html);

  const sectionStyle = getTagStyle(converter, 'section');
  return `<section style="${sectionStyle}">${html}</section>`;
}

module.exports = {
  serializeObsidianRenderedHtml,
  deriveImageCaption,
  safeDecodeCaption,
};
