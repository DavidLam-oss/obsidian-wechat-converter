/*
## 核心功能

把用户提供的原始 CSS 安全地内联到文章 HTML 中，用于微信公众号发布。

## 输入

- 已按主题渲染好的文章 HTML（元素级内联 style）。
- 用户自定义 CSS 文本（来自设置页 textarea 或 vault 笔记）。

## 输出

- 内联后的 HTML：用户 CSS 选择器对应的样式已合并到各元素的 `style` 属性中。
- 如果未启用或 CSS 为空，原样返回输入 HTML。

## 定位

位于 services/，属于渲染后处理服务；不直接操作设置页 DOM。

## 依赖

关键依赖：`juice`（用于把选择器 CSS 内联成元素 inline style）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰：sanitize → scope → inline，步骤独立可单测。
- 用户 CSS 只做样式覆盖，不引入新的 HTML 结构或脚本。
*/

import juice from 'juice';
import {
    prerenderPseudoElementsIntoHtml,
    removePseudoRulesFromCSS,
} from './pseudo-element-renderer.js';

const ROOT_SELECTOR = '.owc-article-root';

/**
 * 危险 CSS 特征 denylist。
 * 这些特征在微信环境下本身也会被清洗，但提前拦截可以避免本地执行风险。
 * @type {Array<{name: string, pattern: RegExp}>}
 */
const FORBIDDEN_CSS_PATTERNS = [
    { name: 'expression()', pattern: /expression\s*\(/i },
    { name: 'javascript: url', pattern: /url\s*\(\s*["']?\s*javascript:/i },
    { name: '@import', pattern: /@import\b/i },
    { name: 'behavior/-ms-behavior', pattern: /behavior\s*:/i },
    { name: 'binding', pattern: /binding\s*:/i },
];

/**
 * @typedef {Object} InlineOptions
 * @property {boolean} [preserveImportant=true] 是否保留 !important
 * @property {boolean} [removeStyleTags=true] 内联后是否移除 style 标签
 * @property {string} [rootSelector='.owc-article-root'] 作用域根选择器
 */

/**
 * 检查用户 CSS 是否包含明显危险或不应支持的语法。
 * 失败时抛出错误，错误信息包含命中的规则名。
 * @param {string} cssText
 * @throws {Error}
 */
export function sanitizeCustomCss(cssText) {
    if (typeof cssText !== 'string') return;

    for (const rule of FORBIDDEN_CSS_PATTERNS) {
        if (rule.pattern.test(cssText)) {
            throw new Error(`自定义 CSS 包含被禁止的语法：${rule.name}`);
        }
    }
}

/**
 * 把用户写的普通选择器 CSS 限定在文章根容器作用域内。
 * 例如 `p { color: red; }` -> `.owc-article-root p { color: red; }`
 *
 * 实现说明：
 * - 按逗号拆分选择器组，每个简单选择器前加 root 前缀。
 * - 保留 @media、@font-face 等 at-rule 原样（内部选择器同样加前缀）。
 * - 保留注释不处理（交给 juice 或后续步骤）。
 *
 * @param {string} cssText
 * @param {string} [rootSelector='.owc-article-root']
 * @returns {string}
 */
export function scopeCustomCss(cssText, rootSelector = ROOT_SELECTOR) {
    if (!cssText || !rootSelector) return cssText;

    const rootPrefix = rootSelector.trim();
    const scopedBlocks = [];

    let i = 0;
    while (i < cssText.length) {
        // 跳过空白和注释
        if (cssText[i].trim() === '') {
            i += 1;
            continue;
        }
        if (cssText.slice(i, i + 2) === '/*') {
            const end = cssText.indexOf('*/', i + 2);
            if (end === -1) break;
            i = end + 2;
            continue;
        }

        // 读取选择器/前缀直到 '{'
        let selectorEnd = cssText.indexOf('{', i);
        if (selectorEnd === -1) break;

        const selectors = cssText.slice(i, selectorEnd).trim();
        // 找到匹配的一对 { }
        let braceDepth = 0;
        let bodyEnd = selectorEnd;
        for (let j = selectorEnd; j < cssText.length; j += 1) {
            if (cssText[j] === '{') braceDepth += 1;
            else if (cssText[j] === '}') {
                braceDepth -= 1;
                if (braceDepth === 0) {
                    bodyEnd = j + 1;
                    break;
                }
            }
        }
        const body = cssText.slice(selectorEnd, bodyEnd);

        if (selectors.startsWith('@')) {
            const atRuleName = selectors.toLowerCase();
            if (atRuleName.startsWith('@media') || atRuleName.startsWith('@supports')) {
                const inner = body.slice(1, -1); // remove outer { }
                const innerScoped = scopeCustomCss(inner, rootPrefix);
                scopedBlocks.push(`${selectors}{${innerScoped}}`);
            } else {
                // @font-face, @keyframes 等直接保留
                scopedBlocks.push(`${selectors}${body}`);
            }
        } else {
            const scopedSelectors = selectors
                .split(',')
                .map((s) => `${rootPrefix} ${s.trim()}`)
                .join(', ');
            scopedBlocks.push(`${scopedSelectors}${body}`);
        }

        i = bodyEnd;
    }

    return scopedBlocks.join('\n');
}

/**
 * 把用户 CSS 内联到 HTML 中。
 *
 * 流程：
 * 1. sanitize 检查危险语法。
 * 2. 把 HTML 包进根容器 `<div class="owc-article-root">`。
 * 3. 给用户 CSS 加作用域前缀。
 * 4. 伪元素预处理：若用户 CSS 含 `::before`/`::after`，在 juice 之前把它们
 *    转成真实 `<span>`（含 CSS 计数器计算），并从作用域 CSS 中剥离伪元素规则块。
 * 5. 用 juice.inlineContent 做内联。
 * 6. 去掉根容器 wrapper，返回原结构。
 *
 * @param {string} html
 * @param {string} cssText
 * @param {InlineOptions} [options]
 * @returns {string}
 */
export function inlineCustomCss(html, cssText, options = {}) {
    if (!cssText || !cssText.trim()) return html;

    const rootSelector = options.rootSelector || ROOT_SELECTOR;
    const rootClass = rootSelector.replace(/^\./, '');

    sanitizeCustomCss(cssText);

    const scopedCss = scopeCustomCss(cssText, rootSelector);
    const wrappedHtml = `<div class="${rootClass}">${html}</div>`;

    // 伪元素预处理（juice 之前）：CSS 用未作用域的原始文本匹配，作用域后的 CSS 去掉伪元素块再给 juice。
    const htmlWithPseudo = prerenderPseudoElementsIntoHtml(wrappedHtml, cssText);
    const cssForJuice = removePseudoRulesFromCSS(scopedCss);

    const inlined = juice.inlineContent(htmlWithPseudo, cssForJuice, {
        preserveImportant: options.preserveImportant !== false,
        removeStyleTags: options.removeStyleTags !== false,
        webResources: { images: false, svgs: false },
    });

    // 去掉外层 wrapper，只保留内部内容
    return unwrapRootContainer(inlined, rootClass);
}

/**
 * 去掉 juice 内联后外层包裹的根容器 div。
 * @param {string} html
 * @param {string} rootClass
 * @returns {string}
 */
function unwrapRootContainer(html, rootClass) {
    const openRe = new RegExp(`^\\s*<div\\s+class=["']${rootClass}["'][^>]*>`, 'i');
    const closeRe = /<\/div>\s*$/i;

    if (!openRe.test(html) || !closeRe.test(html)) {
        return html;
    }

    return html.replace(openRe, '').replace(closeRe, '');
}

/**
 * 从插件设置中读取自定义 CSS 文本。
 * 优先级：customCssNote（vault 笔记）> customCss（textarea）。
 *
 * @param {{ settings?: { enableCustomCss?: boolean, customCssNote?: string, customCss?: string }, app?: { vault?: VaultLike } }} plugin
 * @returns {Promise<string>}
 */
export async function resolveCustomCssFromSettings(plugin) {
    if (!plugin || !plugin.settings || !plugin.settings.enableCustomCss) {
        return '';
    }

    const notePath = plugin.settings.customCssNote?.trim();
    if (notePath && plugin.app && plugin.app.vault) {
        const file = /** @type {(TFileLike & { extension?: string }) | null} */ (plugin.app.vault.getAbstractFileByPath(notePath));
        if (file && file.extension === 'md') {
            try {
                return await plugin.app.vault.read(file);
            } catch (err) {
                console.warn('读取自定义 CSS 笔记失败，回退到 textarea:', err);
            }
        }
    }

    return plugin.settings.customCss || '';
}
