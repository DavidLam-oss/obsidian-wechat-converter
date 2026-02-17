function cleanHtmlForDraft(html) {

    const div = document.createElement('div');
    div.innerHTML = html;

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

    const hasInlineLabelPrefix = (container) => !!getInlineLabelPrefixInfo(container);

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

        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
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

        if (node.nodeType === Node.ELEMENT_NODE) {
          if (sawBreak) paragraph.insertBefore(document.createTextNode(' '), node);
          return;
        }
      }
    };

    const isInlineOnlyParagraph = (paragraph) => {
      if (!paragraph) return false;
      const blockLikeTags = new Set(['UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE', 'SECTION', 'FIGURE', 'DIV', 'P']);
      return !Array.from(paragraph.querySelectorAll('*')).some(el => blockLikeTags.has(el.tagName));
    };

    const unwrapSimpleListParagraphs = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const meaningfulChildren = Array.from(li.childNodes).filter(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (meaningfulChildren.length === 0) return;

      const allInlineParagraphs = meaningfulChildren.every(node =>
        node.nodeType === Node.ELEMENT_NODE &&
        node.tagName === 'P' &&
        isInlineOnlyParagraph(node)
      );
      if (!allInlineParagraphs) return;

      const fragment = document.createDocumentFragment();
      meaningfulChildren.forEach((paragraph, index) => {
        while (paragraph.firstChild) {
          fragment.appendChild(paragraph.firstChild);
        }
        if (index < meaningfulChildren.length - 1) {
          fragment.appendChild(document.createTextNode(' '));
        }
      });

      while (li.firstChild) {
        li.removeChild(li.firstChild);
      }
      li.appendChild(fragment);
    };

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

        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
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

        if (node.nodeType === Node.ELEMENT_NODE) {
          if (sawBreak) li.insertBefore(document.createTextNode(' '), node);
          return;
        }
      }
    };

    const convertLeadingStrongOrCodeToSpan = (li) => {
      const getFirstMeaningfulNode = (container) => {
        if (!container) return null;
        return Array.from(container.childNodes).find(node =>
          !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
        ) || null;
      };

      let firstNode = getFirstMeaningfulNode(li);
      if (!firstNode) return;

      if (firstNode.nodeType === Node.ELEMENT_NODE && firstNode.tagName === 'P') {
        firstNode = getFirstMeaningfulNode(firstNode);
      }

      if (!firstNode || firstNode.nodeType !== Node.ELEMENT_NODE) return;
      if (!['STRONG', 'CODE'].includes(firstNode.tagName)) return;

      const span = document.createElement('span');
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
      span.innerHTML = firstNode.innerHTML;
      firstNode.replaceWith(span);
    };

    const collapseLeadingBreakAfterInlinePrefixInListItem = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const nodes = Array.from(li.childNodes);
      const firstMeaningfulIdx = nodes.findIndex(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (firstMeaningfulIdx === -1) return;

      const firstMeaningfulNode = nodes[firstMeaningfulIdx];
      if (firstMeaningfulNode.nodeType !== Node.ELEMENT_NODE) return;
      if (!['SPAN', 'STRONG', 'CODE'].includes(firstMeaningfulNode.tagName)) return;
      const prefixText = (firstMeaningfulNode.textContent || '').trim();
      const prefixEndsAscii = /[A-Za-z0-9]$/.test(prefixText);

      let sawBreak = false;
      for (let i = firstMeaningfulIdx + 1; i < nodes.length; i += 1) {
        const node = nodes[i];

        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
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

        if (node.nodeType === Node.ELEMENT_NODE) {
          const text = (node.textContent || '').trim();
          if (!text) continue;
          if (!sawBreak) return;
          if (prefixEndsAscii || /^[A-Za-z0-9]/.test(text)) {
            li.insertBefore(document.createTextNode(' '), node);
          }
          return;
        }
      }
    };

    const wrapTextContinuationAfterLeadingPrefix = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const nodes = Array.from(li.childNodes);
      const firstMeaningfulIdx = nodes.findIndex(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (firstMeaningfulIdx === -1) return;

      const firstMeaningfulNode = nodes[firstMeaningfulIdx];
      if (firstMeaningfulNode.nodeType !== Node.ELEMENT_NODE) return;
      if (!['SPAN', 'STRONG', 'CODE'].includes(firstMeaningfulNode.tagName)) return;

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

      const span = document.createElement('span');
      span.setAttribute('style', 'display:inline !important;');
      span.textContent = text;
      nextMeaningfulNode.replaceWith(span);
    };

    const bundleLeadingPrefixForWechatLineBreak = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const nodes = Array.from(li.childNodes).filter(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (nodes.length < 2) return;

      const first = nodes[0];
      const second = nodes[1];
      if (first.nodeType !== Node.ELEMENT_NODE || second.nodeType !== Node.ELEMENT_NODE) return;
      if (first.tagName !== 'SPAN' || second.tagName !== 'SPAN') return;

      const firstText = (first.textContent || '').trim();
      const secondText = (second.textContent || '').trim();
      if (!firstText || !secondText) return;

      // Keep colon-label flows on the original path.
      if (/[：:]$/.test(firstText) || /^[：:]/.test(secondText)) return;

      // Only bundle short leading chunks (e.g. "登录用"+"的用户名", "SSH 端口"+"（通常是 22）").
      if (secondText.length > 16) return;

      const bundle = document.createElement('span');
      bundle.setAttribute('style', 'display:inline-block; white-space:nowrap;');

      li.insertBefore(bundle, first);
      bundle.appendChild(first);
      bundle.appendChild(second);
    };

    const wrapLeadingLabelInBlockSpan = (li) => {
      const hasDirectNestedList = Array.from(li.children).some(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (hasDirectNestedList) return;

      const nodes = Array.from(li.childNodes).filter(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );
      if (nodes.length < 2) return;

      const firstNode = nodes[0];
      if (firstNode.nodeType !== Node.ELEMENT_NODE) return;
      if (firstNode.tagName !== 'SPAN') return;

      const firstText = (firstNode.textContent || '').trim();
      const secondNode = nodes[1];
      const secondText = secondNode.nodeType === Node.TEXT_NODE
        ? (secondNode.textContent || '')
        : (secondNode.nodeType === Node.ELEMENT_NODE ? (secondNode.textContent || '') : '');
      const hasColon = /[：:]$/.test(firstText) || /^\s*[：:]/.test(secondText);
      if (!hasColon) return;

      const wrapper = document.createElement('span');
      const liStyle = li.getAttribute('style') || '';
      const lineHeightMatch = liStyle.match(/line-height:\s*[^;]+/i);
      const lineHeight = lineHeightMatch ? `${lineHeightMatch[0]};` : '';
      wrapper.setAttribute('style', `display:block;margin:0;padding:0;${lineHeight}`);

      while (li.firstChild) {
        wrapper.appendChild(li.firstChild);
      }
      li.appendChild(wrapper);
    };

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
        first.appendChild(document.createTextNode(' '));
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
        node.nodeType === Node.ELEMENT_NODE && blockTags.has(node.tagName)
      );

      if (hasBlock) return;

      const wrapper = document.createElement('span');
      const liStyle = li.getAttribute('style') || '';
      const lineHeightMatch = liStyle.match(/line-height:\s*[^;]+/i);
      const lineHeight = lineHeightMatch ? `${lineHeightMatch[0]};` : '';
      wrapper.setAttribute('style', `display:block;margin:0;padding:0;${lineHeight}`);

      meaningfulNodes.forEach(node => wrapper.appendChild(node));
      li.insertBefore(wrapper, firstList);
    });

    // 2. 将深层嵌套列表转为伪列表（仅处理 depth >= 2）
    const getListDepth = list => {
      let depth = 0;
      let current = list.parentElement;
      while (current) {
        if (current.tagName === 'UL' || current.tagName === 'OL') depth += 1;
        current = current.parentElement;
      }
      return depth;
    };

    const buildPseudoItems = (list, depth) => {
      const fragment = document.createDocumentFragment();
      const isOrdered = list.tagName === 'OL';
      let index = 1;

      Array.from(list.children).forEach(li => {
        if (li.tagName !== 'LI') return;

        const nestedLists = Array.from(li.children).filter(
          child => child.tagName === 'UL' || child.tagName === 'OL'
        );

        const liStyle = li.getAttribute('style') || '';
        const indent = Math.max(0, depth - 1) * 20;
        const wrapper = document.createElement('p');
        wrapper.setAttribute(
          'style',
          `${liStyle} margin:0 0 4px ${indent}px; padding:0;`
        );

        const contentNodes = [];
        Array.from(li.childNodes).forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'UL' || node.tagName === 'OL')) return;
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'P') {
            const children = Array.from(node.childNodes);
            if (children.length && contentNodes.length) {
              contentNodes.push(document.createTextNode(' '));
            }
            children.forEach(child => contentNodes.push(child));
            return;
          }
          contentNodes.push(node);
        });

        // Trim leading whitespace-only text nodes to avoid bullets on separate lines.
        while (
          contentNodes.length > 0 &&
          contentNodes[0].nodeType === Node.TEXT_NODE &&
          !contentNodes[0].textContent.trim()
        ) {
          contentNodes.shift();
        }
        // If the first text node starts with a newline/indent, trim it to keep marker + text on one line.
        if (contentNodes.length > 0 && contentNodes[0].nodeType === Node.TEXT_NODE) {
          contentNodes[0].textContent = contentNodes[0].textContent.replace(/^\s+/, '');
          if (!contentNodes[0].textContent) {
            contentNodes.shift();
          }
        }

        const hasContent = contentNodes.some(node => {
          if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
          return true;
        });

        if (hasContent) {
          contentNodes.forEach(node => {
            if (node.nodeType !== Node.TEXT_NODE) return;
            node.textContent = node.textContent.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ');
            if (!node.textContent.trim()) {
              node.remove();
            }
          });

          const markerText = isOrdered ? `${index}. ` : '• ';
          const firstText = contentNodes.find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
          if (firstText) {
            firstText.textContent = markerText + firstText.textContent;
          } else {
            contentNodes.unshift(document.createTextNode(markerText));
          }

          contentNodes.forEach(node => wrapper.appendChild(node));
          fragment.appendChild(wrapper);
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
      const depth = getListDepth(list);
      if (depth < 2) return;
      const fragment = buildPseudoItems(list, depth);
      list.parentNode.insertBefore(fragment, list);
      list.remove();
    });

    // 3. 处理嵌套的 ul/ol（在 li 内的列表）：移除 margin，调整缩进
    div.querySelectorAll('li > ul, li > ol').forEach(nestedList => {
      // 获取原有样式
      let style = nestedList.getAttribute('style') || '';
      // 移除 margin，保留其他样式 (Fix: use regex that catches margin-left/top etc)
      style = style.replace(/margin(-[a-z]+)?:\s*[^;]+;?/gi, '');
      // 添加 margin: 0 确保紧贴父元素
      style = 'margin: 0; ' + style;
      nestedList.setAttribute('style', style);
    });

    // 4. 移除空的 li 元素
    div.querySelectorAll('li').forEach(li => {
      if (!li.textContent.trim() && li.querySelectorAll('img, ul, ol').length === 0) {
        li.remove();
      }
    });

    // 5. 移除 ul/ol 内的纯空白文本节点
    div.querySelectorAll('ul, ol').forEach(list => {
      Array.from(list.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
          node.remove();
        }
      });
    });

    // 6. 移除 li 内的多余换行/空白文本节点
    div.querySelectorAll('li').forEach(li => {
      Array.from(li.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
          node.remove();
        }
      });
    });

    // 7. 微信兼容修复：强制列表项内 strong/code 保持行内，避免“标题词”和冒号/正文断行
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

    return div.innerHTML;
  }

module.exports = {
  cleanHtmlForDraft,
};
