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
  if (!key) return '📌';
  return LEGACY_CALLOUT_ICON_BY_TYPE[key] || '📌';
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
    keep = classes.filter((cls) => cls === 'math-formula-image');
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

  const getAllowedAttrs = (tagName) => {
    if (tagName === 'a') return new Set(['href', 'style']);
    if (tagName === 'img') return new Set(['src', 'alt', 'style', 'width', 'height', 'class']);
    if (tagName === 'section') return new Set(['style', 'class']);
    if (!finalStage && (tagName === 'pre' || tagName === 'code')) return new Set(['style', 'class']);
    return new Set(['style']);
  };

  Array.from(container.querySelectorAll('*')).forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const allowed = getAllowedAttrs(tagName);
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('data-') || name === 'id' || name === 'dir') {
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

function convertStandaloneImages(container, converter) {
  if (!container) return;

  const imgs = Array.from(container.querySelectorAll('img'));
  for (const img of imgs) {
    if (img.closest('figure')) continue;
    if (img.getAttribute('alt') === 'logo') continue;
    if (img.classList.contains('math-formula-image')) continue;

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

function stripDangerousTags(container) {
  if (!container) return;
  container.querySelectorAll('script,iframe,object,embed,form,input,button,style').forEach((el) => el.remove());
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

function serializeObsidianRenderedHtml({ root, converter, preRenderedMath = [] }) {
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
  stripDangerousTags(container);
  // Render math formulas that Obsidian's MarkdownRenderer didn't process
  renderUnresolvedMathFormulas(container, converter);
  applyLegacyLinkifyParity(container, converter);
  applyLegacyTypographerParity(container, converter);
  sanitizeAnchorAndImageLinks(container, converter);
  convertPreBlocks(container, converter);
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
  if (converter && typeof converter.sanitizeHtml === 'function') {
    html = converter.sanitizeHtml(html);
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
