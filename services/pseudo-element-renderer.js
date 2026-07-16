/*
## 核心功能

把用户自定义 CSS 里的 `::before` / `::after` 伪元素，以及 CSS 计数器
（counter-reset / counter-increment + counter()），在 juice 内联之前
转换成真实 `<span>` 元素，解决微信公众号与 juice 无法处理伪元素的问题。

## 输入

- 已包进 `.owc-article-root` 的文章 HTML 字符串（wrappedHtml）。
- 用户原始（未作用域）自定义 CSS 文本。

## 输出

- 注入真实 `<span>`（带 inline style + textContent，含计数器值）后的 HTML 字符串。
- `removePseudoRulesFromCSS(css)`：从 CSS 中剥离 `::before`/`::after` 规则块。

## 定位

位于 services/，属于渲染后处理服务；供 custom-css-inliner.js 在 juice 之前调用。

## 依赖

- 全局 `document` / `DOMParser`（Obsidian/Electron 原生、jsdom 测试环境均可用）。不引入新依赖。
- 算法移植自 joeytoday/obsidian-mp-publisher 的 `src/utils/pseudo-element-renderer.ts`。

## 维护规则

- 与 custom-css-inliner.js 保持「sanitize → scope → [pseudo 预处理] → inline」职责边界。
- 修改后同步更新文件顶部说明书，并补充 / 更新 tests/pseudo-element-renderer.test.js。
- 注入的 `<span>` 必须带 inline style（微信剥 class / `<style>`），不依赖 class 生效。
*/

/**
 * 把 CSS 按顶层 `{ }` 分块（正确处理字符串内的括号与引号）。
 * @param {string} css
 * @returns {string[]}
 */
function splitCSSBlocks(css) {
    const blocks = [];
    let depth = 0;
    let current = '';
    let inString = false;
    let stringChar = '';

    for (const ch of css) {
        if (inString) {
            current += ch;
            if (ch === stringChar) inString = false;
        } else if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
            current += ch;
        } else if (ch === '{') {
            depth++;
            current += ch;
        } else if (ch === '}') {
            depth--;
            current += ch;
            if (depth === 0) {
                blocks.push(current);
                current = '';
            }
        } else {
            current += ch;
        }
    }
    if (current.trim()) blocks.push(current);
    return blocks;
}

/**
 * 按顶层逗号拆分选择器组（正确处理 `:not(...)` 等括号内的逗号）。
 * @param {string} selectorStr
 * @returns {string[]}
 */
function splitSelectors(selectorStr) {
    const result = [];
    let depth = 0;
    let current = '';

    for (const ch of selectorStr) {
        if (ch === '(') {
            depth++;
            current += ch;
        } else if (ch === ')') {
            depth--;
            current += ch;
        } else if (ch === ',' && depth === 0) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) result.push(current);
    return result;
}

/**
 * 把声明块 body 解析成属性名 → 值 的字典。
 * @param {string} body
 * @returns {Record<string, string>}
 */
function parseProperties(body) {
    const props = {};
    for (const decl of body.split(';')) {
        const colonIndex = decl.indexOf(':');
        if (colonIndex === -1) continue;
        const prop = decl.substring(0, colonIndex).trim();
        const value = decl.substring(colonIndex + 1).trim();
        if (prop && value) props[prop] = value;
    }
    return props;
}

/**
 * 去掉 CSS 块体末尾多余的 `}`（splitCSSBlocks 会把收尾花括号留在块里）。
 * @param {string} bodyPart
 * @returns {string}
 */
function stripTrailingBrace(bodyPart) {
    const t = bodyPart.trim();
    return t.endsWith('}') ? t.slice(0, -1).trim() : t;
}

/**
 * @typedef {Object} PseudoRule
 * @property {string} baseSelector 去掉 ::before/::after 后的基础选择器
 * @property {'before'|'after'} pseudoType
 * @property {Record<string, string>} properties 该伪元素的声明
 */

/**
 * 解析所有 `::before` / `::after` 规则。
 * @param {string} css
 * @returns {PseudoRule[]}
 */
export function parsePseudoRules(css) {
    const rules = [];
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = splitCSSBlocks(cssWithoutComments);

    for (const block of blocks) {
        const braceIndex = block.indexOf('{');
        if (braceIndex === -1) continue;

        const selectorPart = block.substring(0, braceIndex).trim();
        const bodyPart = block.substring(braceIndex + 1).trim();
        if (!selectorPart || !bodyPart) continue;

        const selectors = splitSelectors(selectorPart);

        for (const sel of selectors) {
            const trimmed = sel.trim();
            if (!trimmed) continue;

            const pseudoMatch = trimmed.match(/::(before|after)\s*$/);
            if (!pseudoMatch) continue;
            const pseudoType = pseudoMatch[1];

            const baseSelector = trimmed
                .replace(/::before/g, '')
                .replace(/::after/g, '')
                .trim();
            if (!baseSelector) continue;

            rules.push({
                baseSelector,
                pseudoType,
                properties: parseProperties(stripTrailingBrace(bodyPart)),
            });
        }
    }

    return rules;
}

/**
 * @typedef {Object} CounterConfig
 * @property {Array<{selector:string,name:string,value:number}>} resets
 * @property {Array<{selector:string,name:string,value:number}>} increments
 */

const CSS_WIDE_KEYWORDS = new Set(['none', 'inherit', 'initial', 'unset']);

/**
 * 解析计数器配置（counter-reset / counter-increment），跳过伪元素块与 CSS-wide 关键字。
 * @param {string} css
 * @returns {CounterConfig}
 */
export function parseCounterConfig(css) {
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = splitCSSBlocks(cssWithoutComments);
    const resets = [];
    const increments = [];

    for (const block of blocks) {
        const braceIndex = block.indexOf('{');
        if (braceIndex === -1) continue;

        const selectorPart = block.substring(0, braceIndex).trim();
        const bodyPart = block.substring(braceIndex + 1).trim();
        if (!selectorPart || !bodyPart) continue;

        // 跳过伪元素块
        if (selectorPart.includes('::before') || selectorPart.includes('::after')) continue;

        const properties = parseProperties(stripTrailingBrace(bodyPart));

        if (properties['counter-reset']) {
            const parts = properties['counter-reset'].trim().split(/\s+/);
            if (!CSS_WIDE_KEYWORDS.has(parts[0].toLowerCase())) {
                const name = parts[0];
                const value = parts.length > 1 ? parseInt(parts[1], 10) : 0;
                if (name && !isNaN(value)) {
                    for (const sel of splitSelectors(selectorPart)) {
                        if (!sel.includes('::before') && !sel.includes('::after')) {
                            resets.push({ selector: sel.trim(), name, value });
                        }
                    }
                }
            }
        }

        if (properties['counter-increment']) {
            const parts = properties['counter-increment'].trim().split(/\s+/);
            if (!CSS_WIDE_KEYWORDS.has(parts[0].toLowerCase())) {
                const name = parts[0];
                const value = parts.length > 1 ? parseInt(parts[1], 10) : 1;
                if (name && !isNaN(value)) {
                    for (const sel of splitSelectors(selectorPart)) {
                        if (!sel.includes('::before') && !sel.includes('::after')) {
                            increments.push({ selector: sel.trim(), name, value });
                        }
                    }
                }
            }
        }
    }

    return { resets, increments };
}

/**
 * 计数器值格式化（支持 decimal-leading-zero / roman / alpha）。
 * @param {number} value
 * @param {string} style
 * @returns {string}
 */
export function formatCounterValue(value, style) {
    switch (style) {
        case 'decimal-leading-zero':
            return String(value).padStart(2, '0');
        case 'upper-roman':
            return toRoman(value).toUpperCase();
        case 'lower-roman':
            return toRoman(value).toLowerCase();
        case 'upper-alpha':
        case 'upper-latin':
            return numToAlpha(value).toUpperCase();
        case 'lower-alpha':
        case 'lower-latin':
            return numToAlpha(value).toLowerCase();
        default:
            return String(value);
    }
}

function toRoman(num) {
    const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
        while (num >= vals[i]) {
            result += syms[i];
            num -= vals[i];
        }
    }
    return result;
}

/** @param {number} num @returns {string} */
function numToAlpha(num) {
    if (num <= 0) return '';
    let result = '';
    let n = num;
    while (n > 0) {
        n--;
        result = String.fromCharCode(97 + (n % 26)) + result;
        n = Math.floor(n / 26);
    }
    return result;
}

/**
 * 判断元素是否匹配某选择器（限定在容器内）。
 * @param {Element} el
 * @param {string} selector
 * @param {Element} container
 * @returns {boolean}
 */
function matchesSelectorInContainer(el, selector, container) {
    try {
        return container.contains(el) && el.matches(selector);
    } catch {
        return false;
    }
}

/**
 * 解析 content 值：支持纯字符串、纯 counter(name, style)、混合 `"第" counter(h2) "章"`。
 * 同时处理 Unicode 转义（如 `\201C`）。
 * @param {string} value
 * @param {Map<string, number>|undefined} counterMap
 * @returns {string|null}
 */
function tokenizeContent(value, counterMap) {
    let result = '';
    let i = 0;
    let matchedAny = false;

    while (i < value.length) {
        while (i < value.length && /\s/.test(value[i])) i++;
        if (i >= value.length) break;

        if (value[i] === '"' || value[i] === "'") {
            const quote = value[i];
            i++;
            let seg = '';
            while (i < value.length && value[i] !== quote) {
                if (value[i] === '\\' && i + 1 < value.length) {
                    i++;
                    const hexMatch = value.substring(i).match(/^([0-9A-Fa-f]{1,6})\s?/);
                    if (hexMatch) {
                        seg += String.fromCodePoint(parseInt(hexMatch[1], 16));
                        i += hexMatch[0].length;
                    } else if (value[i] === '\\' || value[i] === quote) {
                        seg += value[i];
                        i++;
                    } else {
                        seg += '\\' + value[i];
                        i++;
                    }
                } else {
                    seg += value[i];
                    i++;
                }
            }
            if (i < value.length) i++;
            result += seg;
            matchedAny = true;
            continue;
        }

        if (value.substring(i).startsWith('counter(')) {
            i += 8;
            let depth = 0;
            let argsStr = '';
            while (i < value.length) {
                const ch = value[i];
                if (ch === '(') {
                    depth++;
                    argsStr += ch;
                } else if (ch === ')') {
                    if (depth === 0) break;
                    depth--;
                    argsStr += ch;
                } else {
                    argsStr += ch;
                }
                i++;
            }
            if (i < value.length) i++;

            const commaIdx = argsStr.indexOf(',');
            const cName = (commaIdx >= 0 ? argsStr.substring(0, commaIdx) : argsStr).trim();
            const cStyle = commaIdx >= 0 ? argsStr.substring(commaIdx + 1).trim() : 'decimal';

            if (counterMap && cName) {
                const val = counterMap.get(cName);
                if (val !== undefined) {
                    result += formatCounterValue(val, cStyle);
                }
            }
            matchedAny = true;
            continue;
        }

        i++;
    }

    return matchedAny ? result : null;
}

/**
 * 统一解析 content 值（纯字符串 / 纯计数器 / 混合）。
 * @param {string} cssContentValue
 * @param {Map<string, number>|undefined} counterMap
 * @returns {string|null}
 */
export function resolveContent(cssContentValue, counterMap) {
    if (!cssContentValue || cssContentValue === 'none' || cssContentValue === 'normal') {
        return null;
    }
    const tokenized = tokenizeContent(cssContentValue, counterMap);
    return tokenized !== null ? tokenized : null;
}

/**
 * 生成 span 的 class（仅作参考 / 调试，微信会剥 class，真正生效靠 inline style）。
 * @param {string} tagName
 * @param {'before'|'after'} pseudoType
 * @param {Element} element
 * @returns {string}
 */
function generateSpanClass(tagName, pseudoType, element) {
    const tag = tagName.toLowerCase();

    if (element.classList.contains('callout') || (element.className && String(element.className).includes('callout'))) {
        return 'pseudo-callout-mark';
    }
    if (tag === 'blockquote') return 'pseudo-bq-mark';
    if (pseudoType === 'before' && tag === 'h2') return 'pseudo-h2-num';
    if (pseudoType === 'after' && tag === 'h1') return 'pseudo-h1-dot';
    if (pseudoType === 'after' && tag === 'h3') return 'pseudo-h3-dot';

    return `pseudo-${tag}-${pseudoType}`;
}

/**
 * 是否纯装饰性伪元素（无文本，仅背景 / 边框等视觉）。
 * @param {Record<string, string>} properties
 * @returns {boolean}
 */
function isVisualOnly(properties) {
    const content = properties['content'];
    if (!content || content === '""' || content === "''" || content === 'none') {
        const visualProps = [
            'background',
            'background-color',
            'border',
            'border-radius',
            'width',
            'height',
            'min-width',
            'min-height',
        ];
        return visualProps.some((p) => p in properties);
    }
    return false;
}

/**
 * 安全 querySelectorAll（选择器非法时返回空数组）。
 * @param {Element} container
 * @param {string} selector
 * @returns {Element[]}
 */
function safeQuerySelectorAll(container, selector) {
    try {
        return Array.from(container.querySelectorAll(selector));
    } catch {
        return [];
    }
}

/**
 * 按 DOM 顺序遍历，计算每个元素上各计数器的当前值。
 * @param {Element} container
 * @param {CounterConfig} config
 * @returns {Map<Element, Map<string, number>>}
 */
function computeCounters(container, config) {
    /** @type {Map<Element, Map<string, number>>} */
    const result = new Map();
    const doc = container.ownerDocument;
    const walker = doc.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    /** @type {Map<string, number>} */
    const counters = new Map();

    let node = walker.nextNode();
    while (node) {
        const el = node;

        for (const reset of config.resets) {
            if (!matchesSelectorInContainer(el, reset.selector, container)) continue;
            counters.set(reset.name, reset.value);
        }

        for (const inc of config.increments) {
            if (!matchesSelectorInContainer(el, inc.selector, container)) continue;
            const newVal = (counters.get(inc.name) ?? 0) + inc.value;
            counters.set(inc.name, newVal);
            if (!result.has(el)) result.set(el, new Map());
            /** @type {Map<string, number>} */ (result.get(el)).set(inc.name, newVal);
        }

        node = walker.nextNode();
    }

    return result;
}

/**
 * 把一条伪元素规则渲染成真实 `<span>` 并插入 DOM。
 * @param {Element} el
 * @param {PseudoRule} rule
 * @param {Map<string, number>|undefined} counterMap
 */
function renderPseudoForElement(el, rule, counterMap) {
    const cssContent = rule.properties['content'] || '';
    let textContent = null;
    let isEmptyVisual = false;

    if (isVisualOnly(rule.properties)) {
        isEmptyVisual = true;
        textContent = ' ';
    } else {
        textContent = resolveContent(cssContent, counterMap);
        if (!textContent && textContent !== '') return;
    }

    const doc = el.ownerDocument;
    const span = doc.createElement('span');
    span.className = generateSpanClass(el.tagName, rule.pseudoType, el);

    // 把伪元素自身的视觉属性写成 inline style（跳过 content 与 counter-* 前缀属性）
    const styleParts = [];
    for (const [prop, value] of Object.entries(rule.properties)) {
        if (prop === 'content' || prop.startsWith('counter-')) continue;
        styleParts.push(`${prop}: ${String(value)}`);
    }
    if (styleParts.length > 0) {
        span.setAttribute('style', styleParts.join('; '));
    }

    if (textContent) {
        span.textContent = isEmptyVisual ? ' ' : textContent;
    }

    try {
        if (rule.pseudoType === 'before') {
            el.insertBefore(span, el.firstChild);
        } else {
            el.appendChild(span);
        }
    } catch {
        /* 单个元素插入失败不中断整篇 */
    }
}

/**
 * 从 CSS 中移除所有 `::before` / `::after` 规则块（保留注释与其他内容）。
 * @param {string} css
 * @returns {string}
 */
export function removePseudoRulesFromCSS(css) {
    const blocks = splitCSSBlocks(css);
    const filtered = blocks.filter((block) => {
        const braceIndex = block.indexOf('{');
        const selectorPart = braceIndex >= 0 ? block.substring(0, braceIndex) : block;
        return !selectorPart.includes('::before') && !selectorPart.includes('::after');
    });
    return filtered.join('');
}

/**
 * 主入口：把伪元素 / 计数器在 juice 之前转成真实 `<span>`。
 *
 * 约定：传入的 `wrappedHtml` 已是带 `.owc-article-root` 包裹的 HTML 字符串
 * （这样 `container` 即该根 div，用户选择器在容器内匹配其后代）。
 * `cssText` 为**未作用域**的用户原始 CSS（用于匹配，选择器不含 `.owc-article-root` 前缀）。
 *
 * @param {string} wrappedHtml 形如 `<div class="owc-article-root">...</div>`
 * @param {string} cssText 用户原始 CSS（未作用域）
 * @returns {string} 注入 span 后的 HTML（结构同 wrappedHtml）
 */
export function prerenderPseudoElementsIntoHtml(wrappedHtml, cssText) {
    if (typeof DOMParser === 'undefined') return wrappedHtml; // 纯 node 环境优雅跳过
    if (!cssText || !cssText.includes('::')) return wrappedHtml; // 快速路径：无伪元素

    const pseudoRules = parsePseudoRules(cssText);
    if (pseudoRules.length === 0) return wrappedHtml;

    // 用 DOMParser 把受信文章 HTML 解析成 DOM（与 services/dom-utils.js 同款写法，
    // 避开 document.createElement / innerHTML= 这类上架扫描器会标记的写法）。
    const doc = new DOMParser().parseFromString(wrappedHtml, 'text/html');
    const container = doc.body.firstElementChild;
    if (!container) return wrappedHtml;

    const counterConfig = parseCounterConfig(cssText);
    const counterMap = computeCounters(container, counterConfig);

    for (const rule of pseudoRules) {
        const elements = safeQuerySelectorAll(container, rule.baseSelector);
        for (const el of elements) {
            const elCounters = counterMap.get(el);
            renderPseudoForElement(el, rule, elCounters);
        }
    }

    return container.outerHTML;
}
