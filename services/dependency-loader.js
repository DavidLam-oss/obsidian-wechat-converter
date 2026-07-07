/*
## 核心功能

提供服务层通用能力：dependency loader。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `getAvatarSrc`、`toThemeOptions`、`buildRenderRuntime`、`loadRuntimeDependencies`、`readEmbeddedOrFile`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：`../lib/markdown-it.min.js`、`../lib/highlight.min.js`、`../lib/mathjax-plugin.js`、`../themes/apple-theme.js`、`../converter.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import markdownit from '../lib/markdown-it.min.js';
import hljs from '../lib/highlight.min.js';
import '../lib/mathjax-plugin.js';

/**
 * @typedef {Record<string, unknown> & { window?: RuntimeGlobal }} RuntimeGlobal
 * @typedef {{ read?: (path: string) => Promise<string> | string, exists?: (path: string) => Promise<boolean> | boolean }} FileAdapterLike
 * @typedef {{ error?: (...args: unknown[]) => void }} LoggerLike
 * @typedef {new (...args: unknown[]) => {}} ConstructorLike
 * @typedef {{ initMarkdownIt?: () => Promise<void> | void }} ConverterLike
 */

function getRuntimeGlobal() {
  if (typeof window !== 'undefined' && window) return /** @type {RuntimeGlobal} */ (window);
  return null;
}

/**
 * @param {string} name
 * @param {unknown} value
 */
function assignRuntimeGlobal(name, value) {
  const runtimeGlobal = getRuntimeGlobal();
  if (runtimeGlobal) {
    runtimeGlobal[name] = value;
    if (runtimeGlobal.window && runtimeGlobal.window !== runtimeGlobal) {
      runtimeGlobal.window[name] = value;
    }
  }
}

/**
 * @param {RuntimeGlobal | null} runtimeGlobal
 * @param {string} name
 * @returns {unknown}
 */
function getRuntimeValue(runtimeGlobal, name) {
  return runtimeGlobal ? runtimeGlobal[name] : undefined;
}

/**
 * @param {unknown} value
 * @returns {ConstructorLike | null}
 */
function asConstructor(value) {
  return typeof value === 'function' ? /** @type {ConstructorLike} */ (value) : null;
}

async function loadRuntimeDependencies() {
  const runtimeGlobal = getRuntimeGlobal();
  if (!runtimeGlobal) {
    throw new Error('Runtime global object is required to load converter dependencies');
  }

  if (typeof getRuntimeValue(runtimeGlobal, 'markdownit') === 'undefined') {
    assignRuntimeGlobal('markdownit', markdownit);
  }

  if (typeof getRuntimeValue(runtimeGlobal, 'hljs') === 'undefined') {
    assignRuntimeGlobal('hljs', hljs);
  }

  if (typeof getRuntimeValue(runtimeGlobal, 'ObsidianWechatMath') === 'undefined') {
    const mathPlugin = getRuntimeValue(runtimeGlobal, 'ObsidianWechatMath')
      || getRuntimeValue(runtimeGlobal.window || null, 'ObsidianWechatMath');
    if (typeof mathPlugin !== 'undefined') {
      assignRuntimeGlobal('ObsidianWechatMath', mathPlugin);
    }
  }

  if (typeof getRuntimeValue(runtimeGlobal, 'AppleTheme') === 'undefined') {
    const themeModule = await import('../themes/apple-theme.js');
    const themeCtor = getRuntimeValue(runtimeGlobal, 'AppleTheme')
      || getRuntimeValue(runtimeGlobal.window || null, 'AppleTheme')
      || themeModule.default;
    if (typeof themeCtor !== 'undefined') {
      assignRuntimeGlobal('AppleTheme', themeCtor);
    }
  }

  if (typeof getRuntimeValue(runtimeGlobal, 'AppleStyleConverter') === 'undefined') {
    const converterModule = await import('../converter.js');
    const converterCtor = getRuntimeValue(runtimeGlobal, 'AppleStyleConverter')
      || getRuntimeValue(runtimeGlobal.window || null, 'AppleStyleConverter')
      || converterModule.default;
    if (typeof converterCtor !== 'undefined') {
      assignRuntimeGlobal('AppleStyleConverter', converterCtor);
    }
  }

  if (typeof getRuntimeValue(runtimeGlobal, 'AppleTheme') === 'undefined') throw new Error('AppleTheme failed to load');
  if (typeof getRuntimeValue(runtimeGlobal, 'AppleStyleConverter') === 'undefined') throw new Error('AppleStyleConverter failed to load');
}

/**
 * @param {Record<string, unknown>} settings
 * @returns {string}
 */
function getAvatarSrc(settings = {}) {
  if (!settings.enableWatermark) return '';
  return String(settings.avatarBase64 || settings.avatarUrl || '');
}

/**
 * @param {Record<string, unknown>} settings
 * @returns {Record<string, unknown>}
 */
function toThemeOptions(settings = {}) {
  return {
    theme: settings.theme,
    themeColor: settings.themeColor,
    customColor: settings.customColor,
    quoteCalloutStyleMode: settings.quoteCalloutStyleMode,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    macCodeBlock: settings.macCodeBlock,
    codeLineNumber: settings.codeLineNumber,
    sidePadding: settings.sidePadding,
    coloredHeader: settings.coloredHeader,
  };
}

/**
 * @param {object} params
 * @param {string} params.key
 * @param {FileAdapterLike=} params.adapter
 * @param {string} params.path
 * @param {boolean=} params.required
 * @param {LoggerLike=} params.logger
 * @param {Record<string, string>=} params.embeddedScripts
 * @returns {Promise<string>}
 */
async function readEmbeddedOrFile({
  key,
  adapter,
  path,
  required = true,
  logger = console,
  embeddedScripts = {},
}) {
  const embedded = embeddedScripts && typeof embeddedScripts[key] === 'string'
    ? embeddedScripts[key]
    : '';
  if (embedded) return embedded;

  if (!adapter || typeof adapter.read !== 'function') {
    if (required) {
      throw new Error(`Missing embedded script and file adapter for dependency: ${key}`);
    }
    return '';
  }

  if (!required && adapter.exists && typeof adapter.exists === 'function') {
    try {
      if (!(await adapter.exists(path))) return '';
    } catch (error) {
      logger.error(`Dependency exists() check failed for ${path}:`, error);
      return '';
    }
  }

  return String(await adapter.read(path));
}

/**
 * @param {object} params
 * @param {Record<string, unknown>} params.settings
 * @param {unknown=} params.app
 * @param {FileAdapterLike=} params.adapter
 * @param {string=} params.basePath
 * @returns {Promise<{ theme: unknown, converter: ConverterLike }>}
 */
async function buildRenderRuntime({
  settings,
  app,
  adapter,
  basePath,
}) {
  if (adapter || basePath) {
    // Keep the signature stable for existing callers, but runtime loading is now static.
  }
  await loadRuntimeDependencies();

  const runtimeGlobal = getRuntimeGlobal();
  const ThemeCtor = asConstructor(getRuntimeValue(runtimeGlobal, 'AppleTheme'));
  const ConverterCtor = asConstructor(getRuntimeValue(runtimeGlobal, 'AppleStyleConverter'));

  if (!ThemeCtor) throw new Error('AppleTheme failed to load');
  if (!ConverterCtor) throw new Error('AppleStyleConverter failed to load');

  const theme = new ThemeCtor(toThemeOptions(settings));
  const converter = /** @type {ConverterLike} */ (new ConverterCtor(
    theme,
    getAvatarSrc(settings),
    settings.showImageCaption,
    app
  ));
  await converter.initMarkdownIt?.();

  return { theme, converter };
}

export {
  getAvatarSrc,
  toThemeOptions,
  buildRenderRuntime,
  loadRuntimeDependencies,
  readEmbeddedOrFile,
};
