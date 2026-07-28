/*
## 核心功能

解析自定义 CSS 的设置来源，支持 textarea、Vault Markdown 笔记、YAML frontmatter
以及一个或多个 fenced `css` 代码块。

## 输入

- 插件 settings（enableCustomCss / customCss / customCssNote）。
- 可选 Vault 读取接口。

## 输出

- 结构化 CSS 来源：kind、identity、path、cssText 与 diagnostics。
- 兼容 helper：只返回最终 CSS 文本。

## 定位

位于 services/，只负责来源和 Markdown 提取，不负责 CSS 编译或 HTML 修改。

## 依赖

无第三方依赖。

## 维护规则

- 来源读取失败与 CSS 语法失败必须区分。
- note 读取失败可回退 textarea；note 读取成功后的 CSS 错误由 compiler 处理。
- 修改后同步更新 tests/custom_css_source.test.js。
*/

/**
 * @typedef {'disabled'|'empty'|'textarea'|'note'} CustomCssSourceKind
 * @typedef {{ severity: 'fatal'|'blocked'|'warning'|'info', code: string, message: string, line?: number, column?: number }} CustomCssDiagnostic
 * @typedef {{
 *   kind: CustomCssSourceKind,
 *   identity: string,
 *   path: string,
 *   cssText: string,
 *   diagnostics: CustomCssDiagnostic[]
 * }} CustomCssSourceResult
 */

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeCustomCssNotePath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

/**
 * @param {string} markdown
 * @returns {{ body: string, diagnostics: CustomCssDiagnostic[] }}
 */
function stripFrontmatter(markdown) {
  const source = String(markdown || '').replace(/^\uFEFF/, '');
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { body: source, diagnostics: [] };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closingIndex === -1) {
    return {
      body: '',
      diagnostics: [{
        severity: 'fatal',
        code: 'custom-css-frontmatter-unclosed',
        message: 'CSS 笔记的 YAML frontmatter 没有结束标记。',
        line: 1,
        column: 1,
      }],
    };
  }

  return {
    body: lines.slice(closingIndex + 1).join('\n'),
    diagnostics: [],
  };
}

/**
 * @param {string} markdown
 * @returns {{ cssText: string, diagnostics: CustomCssDiagnostic[] }}
 */
export function extractCustomCssFromMarkdown(markdown) {
  const frontmatterResult = stripFrontmatter(markdown);
  if (frontmatterResult.diagnostics.some((item) => item.severity === 'fatal')) {
    return { cssText: '', diagnostics: frontmatterResult.diagnostics };
  }

  const lines = frontmatterResult.body.split(/\r?\n/);
  /** @type {string[][]} */
  const cssBlocks = [];
  /** @type {string[] | null} */
  let currentBlock = null;
  let fenceChar = '';
  let fenceLength = 0;
  let fenceStartLine = 0;

  lines.forEach((line, index) => {
    if (!currentBlock) {
      const opening = line.match(/^\s*(`{3,}|~{3,})\s*css(?:\s+.*)?\s*$/i);
      if (!opening) return;
      currentBlock = [];
      fenceChar = opening[1][0];
      fenceLength = opening[1].length;
      fenceStartLine = index + 1;
      return;
    }

    const closingPattern = new RegExp(`^\\s*${fenceChar}{${fenceLength},}\\s*$`);
    if (closingPattern.test(line)) {
      cssBlocks.push(currentBlock);
      currentBlock = null;
      fenceChar = '';
      fenceLength = 0;
      fenceStartLine = 0;
      return;
    }

    currentBlock.push(line);
  });

  if (currentBlock) {
    return {
      cssText: '',
      diagnostics: [{
        severity: 'fatal',
        code: 'custom-css-fence-unclosed',
        message: 'CSS 代码块没有结束标记。',
        line: fenceStartLine,
        column: 1,
      }],
    };
  }

  if (cssBlocks.length > 0) {
    return {
      cssText: cssBlocks.map((block) => block.join('\n').trim()).filter(Boolean).join('\n\n'),
      diagnostics: frontmatterResult.diagnostics,
    };
  }

  return {
    cssText: frontmatterResult.body.trim(),
    diagnostics: frontmatterResult.diagnostics,
  };
}

/**
 * @param {unknown} file
 * @returns {file is TFileLike & { extension?: string, path?: string }}
 */
function isMarkdownFile(file) {
  if (!file || typeof file !== 'object') return false;
  const record = /** @type {{ extension?: unknown }} */ (file);
  return String(record.extension || '').toLowerCase() === 'md';
}

/**
 * @param {unknown} vault
 * @param {string} configuredPath
 * @returns {{ file: (TFileLike & { extension?: string, path?: string }) | null, resolvedPath: string }}
 */
function resolveNoteFile(vault, configuredPath) {
  if (!vault || typeof vault !== 'object') return { file: null, resolvedPath: configuredPath };
  const getFile = /** @type {{ getAbstractFileByPath?: unknown }} */ (vault).getAbstractFileByPath;
  if (typeof getFile !== 'function') return { file: null, resolvedPath: configuredPath };

  const candidates = configuredPath.toLowerCase().endsWith('.md')
    ? [configuredPath]
    : [configuredPath, `${configuredPath}.md`];

  for (const candidate of candidates) {
    const file = /** @type {unknown} */ (getFile.call(vault, candidate));
    if (isMarkdownFile(file)) {
      return {
        file,
        resolvedPath: normalizeCustomCssNotePath(
          /** @type {{ path?: unknown }} */ (file).path || candidate
        ),
      };
    }
  }

  return { file: null, resolvedPath: configuredPath };
}

/**
 * @param {{ settings?: { enableCustomCss?: boolean, customCssNote?: string, customCss?: string }, app?: { vault?: VaultLike } }} plugin
 * @returns {Promise<CustomCssSourceResult>}
 */
export async function resolveCustomCssSource(plugin) {
  if (!plugin?.settings?.enableCustomCss) {
    return {
      kind: 'disabled',
      identity: 'disabled',
      path: '',
      cssText: '',
      diagnostics: [],
    };
  }

  const textareaCss = String(plugin.settings.customCss || '');
  const configuredPath = normalizeCustomCssNotePath(plugin.settings.customCssNote || '');
  const vault = plugin.app?.vault;

  if (configuredPath && vault) {
    const { file, resolvedPath } = resolveNoteFile(vault, configuredPath);
    if (file) {
      try {
        const markdown = await vault.read(file);
        const extracted = extractCustomCssFromMarkdown(markdown);
        return {
          kind: 'note',
          identity: `note:${resolvedPath}`,
          path: resolvedPath,
          cssText: extracted.cssText,
          diagnostics: extracted.diagnostics,
        };
      } catch {
        return {
          kind: textareaCss.trim() ? 'textarea' : 'empty',
          identity: textareaCss.trim() ? 'textarea' : 'empty',
          path: '',
          cssText: textareaCss,
          diagnostics: [{
            severity: 'warning',
            code: 'custom-css-note-read-failed',
            message: `未能读取 CSS 笔记“${configuredPath}”，当前使用设置中的 CSS。`,
          }],
        };
      }
    }

    return {
      kind: textareaCss.trim() ? 'textarea' : 'empty',
      identity: textareaCss.trim() ? 'textarea' : 'empty',
      path: '',
      cssText: textareaCss,
      diagnostics: [{
        severity: 'warning',
        code: 'custom-css-note-not-found',
        message: `未找到 CSS 笔记“${configuredPath}”，当前使用设置中的 CSS。`,
      }],
    };
  }

  if (configuredPath && !vault) {
    return {
      kind: textareaCss.trim() ? 'textarea' : 'empty',
      identity: textareaCss.trim() ? 'textarea' : 'empty',
      path: '',
      cssText: textareaCss,
      diagnostics: [{
        severity: 'warning',
        code: 'custom-css-vault-unavailable',
        message: `暂时无法读取 CSS 笔记“${configuredPath}”，当前使用设置中的 CSS。`,
      }],
    };
  }

  if (!textareaCss.trim()) {
    return {
      kind: 'empty',
      identity: 'empty',
      path: '',
      cssText: '',
      diagnostics: [],
    };
  }

  return {
    kind: 'textarea',
    identity: 'textarea',
    path: '',
    cssText: textareaCss,
    diagnostics: [],
  };
}

/**
 * @param {{ settings?: { enableCustomCss?: boolean, customCssNote?: string, customCss?: string }, app?: { vault?: VaultLike } }} plugin
 * @returns {Promise<string>}
 */
export async function resolveCustomCssFromSettings(plugin) {
  const result = await resolveCustomCssSource(plugin);
  return result.cssText;
}
