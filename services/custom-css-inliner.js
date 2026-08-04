/*
## 核心功能

把已编译的微信公众号自定义 CSS 安全地应用到文章 HTML，并提供兼容的 raw CSS
入口。生产路径由 source → compiler → inliner 三层组成。

## 输入

- 干净文章 HTML。
- compiler 生成的 scopedCss、pseudoRules、counterConfig 与 matchSelectors。

## 输出

- `{ html, applied, diagnostics, sourceHash, matchedRuleCount, matchedElementCount }`。
- raw CSS 兼容入口 `inlineCustomCss(html, cssText)`。

## 定位

位于 services/，属于渲染后处理服务；不读取 Vault，不判断 AI 或目标平台。

## 依赖

关键依赖：`juice`、`./custom-css-compiler.js`、`./pseudo-element-renderer.js`。

## 维护规则

- inliner 必须 fail-open：CSS 失败时返回输入 HTML，不得中断预览、复制或同步。
- 调用方必须传入干净 HTML；伪元素转换不承诺幂等。
- 修改后同步更新 custom CSS 单元与端到端测试。
*/

import juice from 'juice';
import { compileCustomCss } from './custom-css-compiler.js';
import {
  prerenderCompiledPseudoElementsIntoHtml,
} from './pseudo-element-renderer.js';
export {
  extractCustomCssFromMarkdown,
  normalizeCustomCssNotePath,
  resolveCustomCssFromSettings,
  resolveCustomCssSource,
} from './custom-css-source.js';

const ROOT_SELECTOR = '.owc-article-root';

/**
 * @typedef {{ severity: 'fatal'|'blocked'|'warning'|'info', code: string, message: string, line?: number, column?: number }} CustomCssDiagnostic
 * @typedef {{
 *   sourceIdentity: string,
 *   sourceHash: string,
 *   scopedCss: string,
 *   pseudoRules: Array<{ baseSelector: string, pseudoType: 'before'|'after', properties: Record<string, string> }>,
 *   fallbackRules?: Array<{ selector: string, properties: Record<string, string> }>,
 *   counterConfig: {
 *     resets: Array<{selector:string,name:string,value:number}>,
 *     increments: Array<{selector:string,name:string,value:number}>
 *   },
 *   matchSelectors: string[],
 *   diagnostics: CustomCssDiagnostic[],
 *   usable: boolean
 * }} CompiledCustomCssLike
 * @typedef {Object} InlineOptions
 * @property {boolean} [preserveImportant=true]
 * @property {boolean} [removeStyleTags=true]
 * @property {string} [rootSelector='.owc-article-root']
 */

/**
 * 兼容校验入口。blocked 规则会被移除并作为 diagnostics 返回；
 * 只有 fatal 结果不可用。
 *
 * @param {string} cssText
 * @returns {{ usable: boolean, diagnostics: CustomCssDiagnostic[] }}
 */
export function sanitizeCustomCss(cssText) {
  const compiled = compileCustomCss(cssText);
  return {
    usable: compiled.usable,
    diagnostics: compiled.diagnostics,
  };
}

/**
 * 兼容作用域入口，内部已改用 AST。
 *
 * @param {string} cssText
 * @param {string} [rootSelector]
 * @returns {string}
 */
export function scopeCustomCss(cssText, rootSelector = ROOT_SELECTOR) {
  return compileCustomCss(cssText, { rootSelector }).scopedCss;
}

/**
 * @param {string} html
 * @param {string} rootClass
 * @returns {string}
 */
function unwrapRootContainer(html, rootClass) {
  const openRe = new RegExp(`^\\s*<div\\s+class=["']${rootClass}["'][^>]*>`, 'i');
  const closeRe = /<\/div>\s*$/i;
  if (!openRe.test(html) || !closeRe.test(html)) return html;
  return html.replace(openRe, '').replace(closeRe, '');
}

/**
 * @param {string} wrappedHtml
 * @param {string[]} selectors
 * @returns {{ matchedRuleCount: number, matchedElementCount: number }}
 */
function countSelectorMatches(wrappedHtml, selectors) {
  if (typeof DOMParser === 'undefined' || !Array.isArray(selectors) || selectors.length === 0) {
    return { matchedRuleCount: 0, matchedElementCount: 0 };
  }
  const doc = new DOMParser().parseFromString(wrappedHtml, 'text/html');
  const container = doc.body.firstElementChild;
  if (!container) return { matchedRuleCount: 0, matchedElementCount: 0 };

  let matchedRuleCount = 0;
  const matchedElements = new Set();
  selectors.forEach((selector) => {
    try {
      const elements = Array.from(container.querySelectorAll(selector));
      if (elements.length > 0) matchedRuleCount += 1;
      elements.forEach((element) => matchedElements.add(element));
    } catch {
      // compiler 已负责 selector 诊断；运行环境不支持时只视为未匹配。
    }
  });
  return { matchedRuleCount, matchedElementCount: matchedElements.size };
}

/**
 * Juice 的选择器切分器无法匹配属性字符串中含逗号的合法选择器。
 * 对 compiler 明确标记的这类规则使用 DOM fallback，并保持“普通声明不覆盖既有 inline，
 * !important 可以覆盖”的既有优先级合同。
 *
 * @param {string} wrappedHtml
 * @param {Array<{ selector: string, properties: Record<string, string> }>} rules
 * @returns {string}
 */
function applyFallbackRules(wrappedHtml, rules) {
  if (typeof DOMParser === 'undefined' || !rules.length) return wrappedHtml;
  const doc = new DOMParser().parseFromString(wrappedHtml, 'text/html');
  const container = doc.body.firstElementChild;
  if (!container) return wrappedHtml;

  rules.forEach((rule) => {
    const elements = Array.from(container.querySelectorAll(rule.selector));
    elements.forEach((element) => {
      const htmlElement = /** @type {HTMLElement} */ (element);
      Object.entries(rule.properties).forEach(([property, rawValue]) => {
        const important = /\s*!important\s*$/i.test(rawValue);
        const value = rawValue.replace(/\s*!important\s*$/i, '').trim();
        if (htmlElement.style.getPropertyValue(property) && !important) return;
        htmlElement.style.setProperty(property, value, important ? 'important' : '');
      });
    });
  });
  return container.outerHTML;
}

/**
 * @param {string} html
 * @param {CompiledCustomCssLike} compiled
 * @param {InlineOptions} [options]
 * @returns {{
 *   html: string,
 *   applied: boolean,
 *   diagnostics: CustomCssDiagnostic[],
 *   sourceHash: string,
 *   matchedRuleCount: number,
 *   matchedElementCount: number
 * }}
 */
export function applyCompiledCustomCss(html, compiled, options = {}) {
  const inputHtml = String(html || '');
  const diagnostics = Array.isArray(compiled?.diagnostics) ? [...compiled.diagnostics] : [];
  const sourceHash = String(compiled?.sourceHash || '');
  if (!inputHtml || !compiled?.usable) {
    return {
      html: inputHtml,
      applied: false,
      diagnostics,
      sourceHash,
      matchedRuleCount: 0,
      matchedElementCount: 0,
    };
  }
  if (!compiled.scopedCss && (!compiled.pseudoRules || compiled.pseudoRules.length === 0)) {
    return {
      html: inputHtml,
      applied: false,
      diagnostics,
      sourceHash,
      matchedRuleCount: 0,
      matchedElementCount: 0,
    };
  }

  const rootSelector = options.rootSelector || ROOT_SELECTOR;
  const rootClass = rootSelector.replace(/^\./, '');
  const wrappedHtml = `<div class="${rootClass}">${inputHtml}</div>`;

  try {
    const matchSummary = countSelectorMatches(wrappedHtml, compiled.matchSelectors || []);
    const fallbackHtml = applyFallbackRules(wrappedHtml, compiled.fallbackRules || []);
    const pseudoResult = prerenderCompiledPseudoElementsIntoHtml(
      fallbackHtml,
      compiled.pseudoRules || [],
      compiled.counterConfig || { resets: [], increments: [] }
    );
    const inlined = juice.inlineContent(pseudoResult.html, compiled.scopedCss, {
      preserveImportant: options.preserveImportant !== false,
      removeStyleTags: options.removeStyleTags !== false,
      webResources: { images: false, svgs: false },
    });
    return {
      html: unwrapRootContainer(inlined, rootClass),
      applied: matchSummary.matchedRuleCount > 0 || pseudoResult.insertedCount > 0,
      diagnostics,
      sourceHash,
      matchedRuleCount: matchSummary.matchedRuleCount + (
        pseudoResult.insertedCount > 0 ? 1 : 0
      ),
      matchedElementCount: matchSummary.matchedElementCount + pseudoResult.insertedCount,
    };
  } catch (error) {
    const errorMessage = String(error || '').replace(/^Error:\s*/i, '');
    diagnostics.push({
      severity: 'fatal',
      code: 'custom-css-inline-failed',
      message: `自定义 CSS 应用失败，已继续使用基础主题：${errorMessage || '未知错误'}`,
    });
    return {
      html: inputHtml,
      applied: false,
      diagnostics,
      sourceHash,
      matchedRuleCount: 0,
      matchedElementCount: 0,
    };
  }
}

/**
 * raw CSS 兼容入口。新代码优先显式 compile 后调用 applyCompiledCustomCss。
 *
 * @param {string} html
 * @param {string} cssText
 * @param {InlineOptions} [options]
 * @returns {string}
 */
export function inlineCustomCss(html, cssText, options = {}) {
  if (!cssText || !String(cssText).trim()) return html;
  const compiled = compileCustomCss(cssText, {
    sourceIdentity: 'direct',
    rootSelector: options.rootSelector || ROOT_SELECTOR,
  });
  return applyCompiledCustomCss(html, compiled, options).html;
}
