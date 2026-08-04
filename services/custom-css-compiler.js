/*
## 核心功能

使用 CSS AST 编译微信公众号自定义 CSS：安全清理、选择器展开与作用域改写、
伪元素/计数器规则提取、结构化诊断和内容 hash 缓存。

## 输入

- 用户 CSS 文本。
- 来源 identity 与根作用域选择器。

## 输出

- scopedCss、pseudoRules、counterConfig、matchSelectors、diagnostics 与 usable。

## 定位

位于 services/，负责 CSS 语义编译，不读取 Vault、不操作文章 DOM。

## 依赖

`postcss`、`postcss-selector-parser`、`postcss-value-parser`。

## 维护规则

- AST 可解析不等于 Juice 可匹配；现代 selector 必须由最终 inliner 测试保护。
- 危险 declaration/rule 使用 blocked 诊断并移除，其余安全规则可继续使用。
- fatal 结果不得进入 inliner 或更新 last-valid snapshot。
*/

import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';

const DEFAULT_ROOT_SELECTOR = '.owc-article-root';
const DEFAULT_MAX_DATA_IMAGE_BYTES = 256 * 1024;
const DEFAULT_MAX_TOTAL_DATA_IMAGE_BYTES = 512 * 1024;
const SAFE_DATA_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const COMPILE_CACHE_LIMIT = 32;
/** @type {Map<string, CustomCssCompileResult>} */
const compileCache = new Map();

/**
 * @typedef {{ severity: 'fatal'|'blocked'|'warning'|'info', code: string, message: string, line?: number, column?: number }} CustomCssDiagnostic
 * @typedef {{ baseSelector: string, pseudoType: 'before'|'after', properties: Record<string, string> }} CompiledPseudoRule
 * @typedef {{
 *   resets: Array<{selector:string,name:string,value:number}>,
 *   increments: Array<{selector:string,name:string,value:number}>
 * }} CompiledCounterConfig
 * @typedef {{
 *   sourceIdentity: string,
 *   sourceHash: string,
 *   scopedCss: string,
 *   pseudoRules: CompiledPseudoRule[],
 *   fallbackRules: Array<{ selector: string, properties: Record<string, string> }>,
 *   counterConfig: CompiledCounterConfig,
 *   matchSelectors: string[],
 *   diagnostics: CustomCssDiagnostic[],
 *   usable: boolean,
 *   capability: { parseable: boolean, scopeable: boolean }
 * }} CustomCssCompileResult
 */

/**
 * @param {string} value
 * @returns {string}
 */
export function hashCustomCss(value) {
  let hash = 2166136261;
  const source = String(value || '');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {unknown} node
 * @param {CustomCssDiagnostic['severity']} severity
 * @param {string} code
 * @param {string} message
 * @returns {CustomCssDiagnostic}
 */
function createDiagnostic(node, severity, code, message) {
  const source = /** @type {{ source?: { start?: { line?: number, column?: number } } }} */ (node || {});
  return {
    severity,
    code,
    message,
    ...(source.source?.start?.line ? { line: source.source.start.line } : {}),
    ...(source.source?.start?.column ? { column: source.source.start.column } : {}),
  };
}

/**
 * Remove ASCII control characters without a control-character regular expression,
 * which is flagged by the Obsidian community plugin scanner.
 * @param {string} value
 * @returns {string}
 */
function stripAsciiControlCharacters(value) {
  return Array.from(String(value || ''))
    .filter((character) => {
      const codePoint = character.codePointAt(0) || 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('');
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeCssEscapes(value) {
  const decoded = String(value || '')
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, hex) => {
      const codePoint = Number.parseInt(String(hex), 16);
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return '';
      }
    })
    .replace(/\\(.)/g, '$1')
    .trim();
  return stripAsciiControlCharacters(decoded).trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeUrlValue(value) {
  let normalized = decodeCssEscapes(value).replace(/^['"]|['"]$/g, '').trim();
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  return stripAsciiControlCharacters(normalized).trim();
}

/**
 * @param {string} dataUrl
 * @returns {{ ok: boolean, bytes: number, reason?: string }}
 */
function inspectDataImage(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return { ok: false, bytes: 0, reason: '只允许 base64 编码的图片 data URL。' };
  const mime = match[1].toLowerCase();
  if (!SAFE_DATA_IMAGE_MIMES.has(mime)) {
    return { ok: false, bytes: 0, reason: `不支持 ${mime} 类型的 data URL。` };
  }
  const payload = match[2].replace(/\s+/g, '');
  const padding = (payload.match(/=*$/)?.[0].length || 0);
  return {
    ok: true,
    bytes: Math.max(0, Math.floor((payload.length * 3) / 4) - padding),
  };
}

/**
 * @param {import('postcss').Declaration} declaration
 * @param {CustomCssDiagnostic[]} diagnostics
 * @param {{ dataImageBytes: number, maxDataImageBytes: number, maxTotalDataImageBytes: number }} resourceState
 * @returns {boolean}
 */
function sanitizeDeclaration(declaration, diagnostics, resourceState) {
  const property = declaration.prop.trim().toLowerCase();
  if (['behavior', '-ms-behavior', 'binding'].includes(property)) {
    diagnostics.push(createDiagnostic(
      declaration,
      'blocked',
      'custom-css-dangerous-property',
      `已移除不安全属性 ${declaration.prop}。`
    ));
    declaration.remove();
    return false;
  }

  if (/expression\s*\(/i.test(declaration.value)) {
    diagnostics.push(createDiagnostic(
      declaration,
      'blocked',
      'custom-css-expression-blocked',
      `已移除包含 expression() 的 ${declaration.prop}。`
    ));
    declaration.remove();
    return false;
  }

  let blockedReason = '';
  const parsedValue = valueParser(declaration.value);
  parsedValue.walk((node) => {
    if (blockedReason || node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
    const normalized = normalizeUrlValue(valueParser.stringify(node.nodes));
    const lower = normalized.toLowerCase();
    if (lower.startsWith('data:')) {
      const inspection = inspectDataImage(normalized);
      if (!inspection.ok) {
        blockedReason = inspection.reason || '不支持该 data URL。';
        return;
      }
      if (inspection.bytes > resourceState.maxDataImageBytes) {
        blockedReason = '单个 data image 超出大小限制。';
        return;
      }
      if (resourceState.dataImageBytes + inspection.bytes > resourceState.maxTotalDataImageBytes) {
        blockedReason = 'CSS 中的 data image 总量超出大小限制。';
        return;
      }
      resourceState.dataImageBytes += inspection.bytes;
      return;
    }
    if (lower.startsWith('#')) return;
    blockedReason = '外部或相对 URL 可能触发网络请求。';
  });

  if (blockedReason) {
    diagnostics.push(createDiagnostic(
      declaration,
      'blocked',
      'custom-css-resource-url-blocked',
      `已移除 ${declaration.prop}：${blockedReason}`
    ));
    declaration.remove();
    return false;
  }

  return true;
}

/**
 * @param {import('postcss-selector-parser').Selector} selector
 * @returns {import('postcss-selector-parser').Selector[]}
 */
function expandSelectorNode(selector) {
  let pseudoIndex = -1;
  let optionSelectors = null;
  let seen = 0;
  selector.walkPseudos((pseudo) => {
    if (optionSelectors || ![':is', ':where'].includes(pseudo.value.toLowerCase())) {
      seen += 1;
      return;
    }
    pseudoIndex = seen;
    optionSelectors = pseudo.nodes;
    seen += 1;
  });

  if (!optionSelectors || pseudoIndex < 0) return [selector];
  /** @type {import('postcss-selector-parser').Selector[]} */
  const expanded = [];
  for (const option of optionSelectors) {
    const clone = selector.clone();
    let cloneIndex = 0;
    let targetPseudo = null;
    clone.walkPseudos((pseudo) => {
      if (cloneIndex === pseudoIndex) targetPseudo = pseudo;
      cloneIndex += 1;
    });
    if (!targetPseudo) continue;
    // selector-parser 的节点泛型未完整暴露给当前 JS 类型检查器；运行时结构由 parser 保证。
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- selector-parser 在 JS 类型检查下未暴露节点泛型，运行时节点来自已成功解析的 AST。
    targetPseudo.replaceWith(...option.nodes.map((node) => node.clone()));
    expanded.push(...expandSelectorNode(clone));
  }
  return expanded;
}

/**
 * @param {string} selectorText
 * @returns {{ selectors: string[], diagnostics: CustomCssDiagnostic[] }}
 */
function expandSelectors(selectorText) {
  /** @type {CustomCssDiagnostic[]} */
  const diagnostics = [];
  const processor = selectorParser();
  const root = processor.astSync(selectorText);
  /** @type {string[]} */
  const selectors = [];
  root.each((selector) => {
    const expanded = expandSelectorNode(selector);
    expanded.forEach((item) => {
      let unsupported = false;
      item.walkPseudos((pseudo) => {
        if (pseudo.value.toLowerCase() === ':has') unsupported = true;
      });
      if (unsupported) {
        diagnostics.push({
          severity: 'warning',
          code: 'custom-css-selector-not-inlineable',
          message: `选择器“${item.toString()}”包含暂不支持的 :has()，已跳过。`,
        });
        return;
      }
      selectors.push(item.toString().trim());
    });
  });
  return { selectors, diagnostics };
}

/**
 * @param {string} selector
 * @returns {{ baseSelector: string, pseudoType: 'before'|'after' } | null}
 */
function parsePseudoSelector(selector) {
  const match = selector.match(/::(before|after)\s*$/i);
  if (!match) return null;
  return {
    baseSelector: selector.slice(0, match.index).trim(),
    pseudoType: /** @type {'before'|'after'} */ (match[1].toLowerCase()),
  };
}

/**
 * @param {import('postcss').Rule} rule
 * @returns {Record<string, string>}
 */
function declarationsToRecord(rule) {
  /** @type {Record<string, string>} */
  const properties = {};
  rule.nodes?.forEach((node) => {
    if (node.type !== 'decl') return;
    properties[node.prop] = `${node.value}${node.important ? ' !important' : ''}`;
  });
  return properties;
}

/**
 * @param {string} value
 * @param {number} fallback
 * @returns {{ name: string, value: number } | null}
 */
function parseCounterValue(value, fallback) {
  const parts = String(value || '').trim().split(/\s+/);
  const name = parts[0] || '';
  if (!name || ['none', 'inherit', 'initial', 'unset'].includes(name.toLowerCase())) return null;
  const parsed = parts.length > 1 ? Number.parseInt(parts[1], 10) : fallback;
  if (!Number.isFinite(parsed)) return null;
  return { name, value: parsed };
}

/**
 * @param {string} cssText
 * @param {{ sourceIdentity?: string, rootSelector?: string, maxDataImageBytes?: number, maxTotalDataImageBytes?: number }} [options]
 * @returns {CustomCssCompileResult}
 */
export function compileCustomCss(cssText, options = {}) {
  const css = String(cssText || '');
  const sourceIdentity = String(options.sourceIdentity || 'textarea');
  const rootSelector = String(options.rootSelector || DEFAULT_ROOT_SELECTOR).trim();
  const sourceHash = hashCustomCss(`${sourceIdentity}\0${rootSelector}\0${css}`);
  const maxDataImageBytes = options.maxDataImageBytes || DEFAULT_MAX_DATA_IMAGE_BYTES;
  const maxTotalDataImageBytes = options.maxTotalDataImageBytes || DEFAULT_MAX_TOTAL_DATA_IMAGE_BYTES;
  const cacheKey = `${sourceHash}:${maxDataImageBytes}:${maxTotalDataImageBytes}`;
  const cached = compileCache.get(cacheKey);
  if (cached) return cached;

  /** @type {CustomCssDiagnostic[]} */
  const diagnostics = [];
  if (!css.trim()) {
    return {
      sourceIdentity,
      sourceHash,
      scopedCss: '',
      pseudoRules: [],
      fallbackRules: [],
      counterConfig: { resets: [], increments: [] },
      matchSelectors: [],
      diagnostics,
      usable: true,
      capability: { parseable: true, scopeable: true },
    };
  }

  /** @type {import('postcss').Root} */
  let root;
  try {
    root = /** @type {import('postcss').Root} */ (postcss.parse(css, { from: undefined }));
  } catch (error) {
    const parseError = (error && typeof error === 'object')
      ? /** @type {{ reason?: string, line?: number, column?: number }} */ (error)
      : {};
    return {
      sourceIdentity,
      sourceHash,
      scopedCss: '',
      pseudoRules: [],
      fallbackRules: [],
      counterConfig: { resets: [], increments: [] },
      matchSelectors: [],
      diagnostics: [{
        severity: 'fatal',
        code: 'custom-css-parse-failed',
        message: parseError.reason || 'CSS 语法无法解析。',
        ...(parseError.line ? { line: parseError.line } : {}),
        ...(parseError.column ? { column: parseError.column } : {}),
      }],
      usable: false,
      capability: { parseable: false, scopeable: false },
    };
  }

  root.walkAtRules((atRule) => {
    const name = atRule.name.toLowerCase();
    if (name === 'import' || name === 'font-face') {
      diagnostics.push(createDiagnostic(
        atRule,
        'blocked',
        `custom-css-${name}-blocked`,
        `已移除不支持的 @${name} 规则。`
      ));
      atRule.remove();
      return;
    }
    if (name.includes('keyframes')) {
      diagnostics.push(createDiagnostic(
        atRule,
        'warning',
        'custom-css-animation-unsupported',
        '微信文章不支持关键帧动画，该规则已移除。'
      ));
      atRule.remove();
    }
  });

  const resourceState = {
    dataImageBytes: 0,
    maxDataImageBytes,
    maxTotalDataImageBytes,
  };
  root.walkDecls((declaration) => {
    sanitizeDeclaration(declaration, diagnostics, resourceState);
  });

  /** @type {CompiledPseudoRule[]} */
  const pseudoRules = [];
  /** @type {Array<{ selector: string, properties: Record<string, string> }>} */
  const fallbackRules = [];
  /** @type {CompiledCounterConfig} */
  const counterConfig = { resets: [], increments: [] };
  /** @type {string[]} */
  const matchSelectors = [];
  let scopeable = true;

  root.walkRules((rule) => {
    if (!rule.parent) return;
    let expanded;
    try {
      expanded = expandSelectors(rule.selector);
      diagnostics.push(...expanded.diagnostics.map((item) => ({
        ...item,
        ...(rule.source?.start?.line ? { line: rule.source.start.line } : {}),
        ...(rule.source?.start?.column ? { column: rule.source.start.column } : {}),
      })));
    } catch (error) {
      scopeable = false;
      const selectorError = String(error || '').replace(/^Error:\s*/i, '');
      diagnostics.push(createDiagnostic(
        rule,
        'fatal',
        'custom-css-selector-parse-failed',
        `选择器无法解析：${selectorError || rule.selector}`
      ));
      return;
    }

    const properties = declarationsToRecord(rule);
    /** @type {string[]} */
    const regularSelectors = [];
    expanded.selectors.forEach((selector) => {
      const pseudo = parsePseudoSelector(selector);
      if (pseudo) {
        if (pseudo.baseSelector) {
          pseudoRules.push({
            baseSelector: pseudo.baseSelector,
            pseudoType: pseudo.pseudoType,
            properties: { ...properties },
          });
        }
        return;
      }

      regularSelectors.push(selector);
      matchSelectors.push(selector);
      if (/\[[^\]]*["'][^"']*,[^"']*["'][^\]]*\]/.test(selector)) {
        fallbackRules.push({ selector, properties: { ...properties } });
        regularSelectors.pop();
      }
      const reset = parseCounterValue(properties['counter-reset'], 0);
      const increment = parseCounterValue(properties['counter-increment'], 1);
      if (reset) counterConfig.resets.push({ selector, name: reset.name, value: reset.value });
      if (increment) counterConfig.increments.push({ selector, name: increment.name, value: increment.value });
    });

    if (regularSelectors.length === 0 || !rule.nodes?.some((node) => node.type === 'decl')) {
      rule.remove();
      return;
    }

    rule.selector = regularSelectors
      .map((selector) => `${rootSelector} ${selector}`)
      .join(', ');
  });

  root.walkRules((rule) => {
    if (!rule.nodes?.some((node) => node.type === 'decl')) rule.remove();
  });

  const usable = scopeable && !diagnostics.some((item) => item.severity === 'fatal');
  const result = {
    sourceIdentity,
    sourceHash,
    scopedCss: usable ? root.toString() : '',
    pseudoRules: usable ? pseudoRules : [],
    fallbackRules: usable ? fallbackRules : [],
    counterConfig: usable ? counterConfig : { resets: [], increments: [] },
    matchSelectors: usable ? Array.from(new Set(matchSelectors)) : [],
    diagnostics,
    usable,
    capability: { parseable: true, scopeable },
  };

  compileCache.set(cacheKey, result);
  if (compileCache.size > COMPILE_CACHE_LIMIT) {
    const firstKey = String(compileCache.keys().next().value || '');
    if (firstKey) compileCache.delete(firstKey);
  }
  return result;
}

export function clearCustomCssCompileCache() {
  compileCache.clear();
}
