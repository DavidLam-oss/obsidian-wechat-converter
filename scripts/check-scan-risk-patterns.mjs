/*
## 核心功能

提供 check scan risk patterns 检查脚本，阻断高危 API、Node 内置静态导入、样式兼容风险、非法与未闭合 eslint-disable 及 this 别名。
包含规则清单：
- `no-static-node-builtin-import`: 禁止运行时源码静态 import/export Node.js 内置模块
- `no-clipboard-read`: 禁止读取系统剪贴板
- `no-direct-html-write`: 禁止直接写入 innerHTML/outerHTML/insertAdjacentHTML
- `no-static-style-property-write`: 禁止对 element.style.foo 进行静态赋值，推荐 setCssStyles
- `no-inline-style-attr`: 禁止 `attr: { style }` 内联样式
- `no-native-blocking-dialog`: 禁止 confirm/alert/prompt 原生阻塞弹窗，推荐 Obsidian Modal/Notice
- `no-fetch-data-url`: 禁止 fetch(data:)，须本地解析 data URL
- `no-global-this-production`: 禁止在生产插件代码中使用 globalThis
- `no-document-create-element`: 禁止直接 document.createElement，推荐 getActiveDocumentCompat()
- `no-active-window-timers`: 禁止 activeWindow.setTimeout/clearTimeout
- `no-return-dynamic-bound-function`: 禁止动态 .call/.bind 生成的函数
- `require-eslint-disable-reason`: eslint-disable 注释必须带有 `-- reason`
- `no-console-disable`: 禁止任何形式的 eslint-disable 禁用 no-console
- `no-this-alias`: 禁止使用 self/that/_this 别名 this（推荐箭头函数或显式 .bind）
- `no-unbalanced-eslint-disable`: 块级 eslint-disable 必须有成对匹配相同规则的 eslint-enable
- `no-css-important`: 禁止样式表出现 !important
- `no-css-has`: 禁止 CSS 出现 :has() 选择器（移动端 webview 兼容限制）
- `no-vault-getfiles-find`: 禁止使用 app.vault.getFiles().find(...) 进行路径查找（强制推荐 getAbstractFileByPath）
- `no-view-lifecycle-collision`: 禁止在 View/ItemView 类或视图方法上定义保留生命周期名（open, close, load, unload, onload, onunload, setState, getState）
- `no-setting-implicit-return`: 禁止在 Promise 或箭头函数中隐式返回 Setting 实例（防止 .then 属性引发死锁）
- `manifest-desc-no-obsidian`: manifest.json 描述不得包含冗余词汇 "Obsidian"
- `manifest-desc-punctuation`: manifest.json 描述必须以标点结尾
- `version-consistency`: 确保 manifest.json、package.json、package-lock.json、versions.json 版本号四位一体一致且格式严格为 x.y.z

## 输入

接收命令行参数、package scripts、仓库源码文件和生成物状态。

## 输出

输出终端校验结果、生成文件、失败退出码或发布前诊断信息。

## 定位

位于 scripts/，只处理仓库工程化任务，不被 Obsidian 插件运行时直接加载。

## 依赖

关键依赖：`node:fs/promises`、`node:path`、`node:module`、`node:url`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 scripts 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const SCANNED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css']);
const IGNORED_DIRS = new Set([
  '.alma-snapshots',
  '.git',
  '.github',
  '__mocks__',
  'coverage',
  'dist',
  'lib',
  'node_modules',
  'RELEASE_NOTES',
  'samples',
  'scripts',
  'tests',
]);
const IGNORED_FILES = new Set([
  'main.js',
  'services/generated-embedded-deps.js',
  'services/ai-layout-runtime/generated-skills.js',
]);

const NODE_BUILTIN_NAMES = [...new Set(builtinModules
  .map((name) => name.replace(/^node:/, '').split('/')[0])
  .filter((name) => name && !name.startsWith('_')))]
  .sort((left, right) => right.length - left.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const STATIC_NODE_BUILTIN_IMPORT_PATTERN = new RegExp(
  String.raw`(?:^|\n)\s*(?:import|export)\s+(?:(?:type\s+)?[\w*$,\s{}]+?\s+from\s+)?['"](?:node:)?(?:${NODE_BUILTIN_NAMES})(?:\/[^'"]*)?['"]`,
  'm',
);

const RULES = [
  {
    id: 'no-static-node-builtin-import',
    message: 'Do not statically import Node.js built-in modules in plugin runtime code. Use a guarded dynamic import/require for desktop-only APIs, or a mobile-compatible implementation.',
    pattern: STATIC_NODE_BUILTIN_IMPORT_PATTERN,
    extensions: new Set(['.js']),
    ignoredPathPrefixes: ['server/'],
  },
  {
    id: 'no-clipboard-read',
    message: 'Do not read the system clipboard. Clipboard access must be limited to user-initiated writes.',
    pattern: /\b(?:window\.)?navigator\.clipboard\.(?:read|readText)\s*\(/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
  {
    id: 'no-direct-html-write',
    message: 'Avoid direct rendered HTML writes. Use DOM helpers or add a narrow eslint-disable-next-line reason for intentional sanitized rendering.',
    pattern: /\b(?:innerHTML|outerHTML)\s=|\.insertAdjacentHTML\s*\(/,
  },
  {
    id: 'no-static-style-property-write',
    message: 'Avoid static element.style.foo assignment. Use setCssStyles(...) or style.setProperty("--css-var", value) for CSS variables.',
    pattern: /\.style\.(?!setProperty\b|removeProperty\b|getPropertyValue\b|cssText\b)[A-Za-z_$][\w$]*\s=/,
  },
  {
    id: 'no-inline-style-attr',
    message: 'Avoid `attr: { style }` inline styles; extract to a styles/ fragment with semantic class names. (obsidianmd/no-static-styles-assignment only catches `.style.x =` assignments.)',
    pattern: /attr:\s*\{\s*style\s*:/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
  {
    id: 'no-native-blocking-dialog',
    message: 'Use Obsidian Modal or Notice instead of confirm(), alert(), or prompt().',
    pattern: /\b(?:confirm|alert|prompt)\s*\(/,
  },
  {
    id: 'no-fetch-data-url',
    message: 'Parse data: URLs locally instead of fetch(data:).',
    pattern: /\bfetch\s*\(\s*(['"`])data:/,
  },
  {
    id: 'no-global-this-production',
    message: 'Avoid globalThis in production plugin code. Prefer window or active-window helpers for Obsidian popout compatibility.',
    pattern: /\bglobalThis\b/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
    ignoredPathPrefixes: ['eslint.config.mjs'],
  },
  {
    id: 'no-document-create-element',
    message: 'Avoid calling document.createElement directly. Use getActiveDocumentCompat().createElement to support Obsidian popout windows.',
    pattern: /\bdocument\.createElement\s*\(/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
  {
    id: 'no-active-window-timers',
    message: 'Use window.setTimeout()/window.clearTimeout() for timers. Reserve active-window helpers for DOM/window-bound APIs.',
    pattern: /\bactiveWindow\.(?:setTimeout|clearTimeout)\s*\(/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
  {
    id: 'no-return-dynamic-bound-function',
    message: 'Avoid returning functions built from dynamic .call/.bind access; wrap the call in a named helper or call the safe API directly.',
    pattern: /return\s*\([^)]*\)\s*=>[^\n]*(?:\.call|\.bind)\s*\(/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
  {
    id: 'require-eslint-disable-reason',
    message: 'eslint-disable comments must include a "-- reason" explanation for Obsidian scan exceptions.',
    pattern: /eslint-disable(?:-next-line|-line)?(?![^\n]*--)/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
    scanComments: true,
  },
  {
    id: 'no-css-important',
    message: 'Avoid stylesheet !important. Increase selector specificity, use CSS variables, or keep compatibility-critical inline styles narrowly scoped.',
    pattern: /!important\b/,
    extensions: new Set(['.css']),
  },
  {
    id: 'no-css-has',
    message: 'CSS :has() has limited mobile webview support; gate behind a fallback or use a simpler selector.',
    pattern: /:has\s*\(/,
    extensions: new Set(['.css']),
  },
  {
    id: 'no-console-disable',
    message: 'Disabling no-console is forbidden. Use console.warn/error/debug (allowed by repo config) or remove the console statement.',
    pattern: /eslint-disable(?:-next-line|-line)?\s+(?:(?!--|\*\/)[^\n])*\bno-console\b/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
    scanComments: true,
  },
  {
    id: 'no-this-alias',
    message: 'Avoid aliasing "this" as self/that/_this. Use arrow functions or explicit .bind() instead.',
    pattern: /\b(?:const|let|var)\s+(?:self|that|_this)\s*=\s*this(?:\.\w+|\s|;|$)/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
  {
    id: 'no-unbalanced-eslint-disable',
    message: 'Block-level eslint-disable must have a matching eslint-enable with the same rule(s).',
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
  {
    id: 'no-vault-getfiles-find',
    message: 'Do not use app.vault.getFiles().find(...) for path lookups; this is an O(N) linear scan over all vault files. Use app.vault.getAbstractFileByPath(...) instead.',
    pattern: /\b(?:app\.)?vault\.getFiles\s*\(\s*\)\.find\b/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
  {
    id: 'no-view-lifecycle-collision',
    message: 'Do not define lifecycle methods (open, close, load, unload, onload, onunload, setState, getState) on View/ItemView classes or view method objects; this silently overrides Obsidian component/view lifecycle and breaks rendering. Use onOpen/onClose.',
    pattern: /(?:^|\n)\s*(?:async\s+)?(?:open|close|load|unload|onload|onunload|setState|getState)\s*\([^)]*\)\s*\{/,
    extensions: new Set(['.js']),
    includedPathPrefixes: ['views/'],
  },
  {
    id: 'no-setting-implicit-return',
    message: 'Do not return Setting instances from callbacks or arrow functions; Setting defines a .then method in Obsidian and returning it causes an unexpected promise resolution deadlock.',
    pattern: /(?:=>|\breturn)\s+(?:new\s+Setting\b|[A-Za-z_$][\w$]*\.addSetting\b)/,
    extensions: new Set(['.js', '.mjs', '.cjs']),
  },
];

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
function shouldScanFile(relativePath) {
  if (IGNORED_FILES.has(relativePath)) return false;
  const parts = relativePath.split(path.sep);
  if (parts.some((part) => IGNORED_DIRS.has(part))) return false;
  return SCANNED_EXTENSIONS.has(path.extname(relativePath));
}

/**
 * @param {{ extensions?: Set<string>, includedPathPrefixes?: string[], ignoredPathPrefixes?: string[] }} rule
 * @param {string} relativePath
 * @returns {boolean}
 */
function ruleAppliesToFile(rule, relativePath) {
  if (rule.extensions && !rule.extensions.has(path.extname(relativePath))) return false;
  const normalizedPath = relativePath.split(path.sep).join('/');
  if (rule.includedPathPrefixes && !rule.includedPathPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    return false;
  }
  return !(rule.ignoredPathPrefixes || []).some((prefix) => normalizedPath.startsWith(prefix));
}

/**
 * @param {string} dir
 * @param {string} [baseDir]
 * @returns {Promise<string[]>}
 */
async function collectFiles(dir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, absolutePath);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      files.push(...await collectFiles(absolutePath, baseDir));
      continue;
    }
    if (entry.isFile() && shouldScanFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * @param {string} source
 * @param {number} index
 * @returns {number}
 */
function getLineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isCommentOnlyLine(line) {
  return /^\s*(?:\/\/|\/\*|\*|\*)/.test(line);
}

/**
 * @param {string} source
 * @param {RegExp} pattern
 * @returns {{ index: number, match: string }[]}
 */
function findMatches(source, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const matches = [];
  let match;
  while ((match = regex.exec(source))) {
    matches.push({ index: match.index, match: match[0] });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return matches;
}

function runRuleSelfTests() {
  const blocked = [
    "import { createHash } from 'crypto';",
    "import fs from 'node:fs';",
    "export { Buffer } from 'node:buffer';",
  ];
  const allowed = [
    "const cryptoModule = await import('node:crypto');",
    "const cryptoModule = Platform.isDesktop ? require('crypto') : null;",
    "import { sha256 } from '@noble/hashes/sha256';",
  ];
  for (const source of blocked) {
    if (findMatches(source, STATIC_NODE_BUILTIN_IMPORT_PATTERN).length === 0) {
      throw new Error(`Scan guard self-test failed to block: ${source}`);
    }
  }
  for (const source of allowed) {
    if (findMatches(source, STATIC_NODE_BUILTIN_IMPORT_PATTERN).length > 0) {
      throw new Error(`Scan guard self-test rejected an allowed pattern: ${source}`);
    }
  }

  const noCssHasRule = RULES.find((r) => r.id === 'no-css-has');
  if (noCssHasRule) {
    const blockedCss = [
      '.card:has(.badge) { color: red; }',
      'div:has( > span) { margin: 0; }',
    ];
    const allowedCss = [
      '.card.has-badge { color: red; }',
      ':hover { color: blue; }',
    ];
    for (const source of blockedCss) {
      if (findMatches(source, noCssHasRule.pattern).length === 0) {
        throw new Error(`Scan guard self-test failed to block: ${source}`);
      }
    }
    for (const source of allowedCss) {
      if (findMatches(source, noCssHasRule.pattern).length > 0) {
        throw new Error(`Scan guard self-test rejected an allowed pattern: ${source}`);
      }
    }
  }

  const noConsoleDisableRule = RULES.find((r) => r.id === 'no-console-disable');
  if (noConsoleDisableRule) {
    const blocked = [
      '/* eslint-disable no-console */',
      '/* eslint-disable no-console, no-debugger -- reason: cli */',
      '// eslint-disable-next-line no-console -- reason: test',
      '// eslint-disable-line no-console',
    ];
    const allowed = [
      '/* eslint-disable no-debugger -- reason: test */',
      '// eslint-disable-next-line no-unused-vars -- reason: test no-console note',
      'console.log("no-console is allowed in tests");',
    ];
    for (const source of blocked) {
      if (findMatches(source, noConsoleDisableRule.pattern).length === 0) {
        throw new Error(`Scan guard self-test failed to block: ${source}`);
      }
    }
    for (const source of allowed) {
      if (findMatches(source, noConsoleDisableRule.pattern).length > 0) {
        throw new Error(`Scan guard self-test rejected an allowed pattern: ${source}`);
      }
    }
  }

  const noThisAliasRule = RULES.find((r) => r.id === 'no-this-alias');
  if (noThisAliasRule) {
    const blocked = [
      'const self = this;',
      'const that = this.prop;',
      'const _this = this  ;',
      'let self = this;',
      'var that = this;',
    ];
    const allowed = [
      'const self = { this: "not-alias" };',
      'const selfie = this;',
      'const foo = this;',
    ];
    for (const source of blocked) {
      if (findMatches(source, noThisAliasRule.pattern).length === 0) {
        throw new Error(`Scan guard self-test failed to block: ${source}`);
      }
    }
    for (const source of allowed) {
      if (findMatches(source, noThisAliasRule.pattern).length > 0) {
        throw new Error(`Scan guard self-test rejected an allowed pattern: ${source}`);
      }
    }
  }

  const noVaultGetFilesRule = RULES.find((r) => r.id === 'no-vault-getfiles-find');
  if (noVaultGetFilesRule) {
    const blocked = [
      'const f = app.vault.getFiles().find(f => f.path === p);',
      'vault.getFiles().find(fn);',
    ];
    const allowed = [
      'const f = app.vault.getAbstractFileByPath(p);',
      'const all = app.vault.getFiles();',
    ];
    for (const source of blocked) {
      if (findMatches(source, noVaultGetFilesRule.pattern).length === 0) {
        throw new Error(`Scan guard self-test failed to block: ${source}`);
      }
    }
    for (const source of allowed) {
      if (findMatches(source, noVaultGetFilesRule.pattern).length > 0) {
        throw new Error(`Scan guard self-test rejected an allowed pattern: ${source}`);
      }
    }
  }

  const noLifecycleCollisionRule = RULES.find((r) => r.id === 'no-view-lifecycle-collision');
  if (noLifecycleCollisionRule) {
    const blocked = [
      'open() {',
      'async close() {',
      'load() {',
      'unload() {',
      'onload() {',
      'onunload() {',
      'async setState(state) {',
      'getState() {',
    ];
    const allowed = [
      'async onOpen() {',
      'async onClose() {',
      'openModal() {',
      'this.close();',
      'const open = true;',
    ];
    for (const source of blocked) {
      if (findMatches(source, noLifecycleCollisionRule.pattern).length === 0) {
        throw new Error(`Scan guard self-test failed to block: ${source}`);
      }
    }
    for (const source of allowed) {
      if (findMatches(source, noLifecycleCollisionRule.pattern).length > 0) {
        throw new Error(`Scan guard self-test rejected an allowed pattern: ${source}`);
      }
    }
  }

  const noSettingReturnRule = RULES.find((r) => r.id === 'no-setting-implicit-return');
  if (noSettingReturnRule) {
    const blocked = [
      '() => new Setting(containerEl)',
      'return new Setting(container);',
      'return this.addSetting(s);',
      '() => card.addSetting(item)',
    ];
    const allowed = [
      'new Setting(containerEl).setName("title");',
      'const s = new Setting(container);',
      'return setting;',
      'return this;',
    ];
    for (const source of blocked) {
      if (findMatches(source, noSettingReturnRule.pattern).length === 0) {
        throw new Error(`Scan guard self-test failed to block: ${source}`);
      }
    }
    for (const source of allowed) {
      if (findMatches(source, noSettingReturnRule.pattern).length > 0) {
        throw new Error(`Scan guard self-test rejected an allowed pattern: ${source}`);
      }
    }
  }

  const unbalancedIssues = checkUnbalancedEslintDisable(
    '/* eslint-disable no-unused-vars */\nconst x = 1;',
    'test.js'
  );
  if (unbalancedIssues.length === 0) {
    throw new Error('Scan guard self-test failed to detect unbalanced eslint-disable');
  }

  const balancedSample = '/* eslint-disable no-unused-vars */\nconst x = 1;\n/* eslint-enable no-unused-vars */';
  if (checkUnbalancedEslintDisable(balancedSample, 'test.js').length > 0) {
    throw new Error('Scan guard self-test false-positive on balanced eslint-disable');
  }
}

/**
 * @param {string} source
 * @param {string} relativePath
 * @returns {Array<{ id: string, message: string, file: string, line: number, code: string }>}
 */
function checkUnbalancedEslintDisable(source, relativePath) {
  const lines = source.split('\n');
  const regex = /\/\*\s*eslint-(disable|enable)(?!-(?:next-)?line)\b\s*([^*]*?)\*\//g;
  const stack = [];
  const findings = [];
  let match;

  while ((match = regex.exec(source)) !== null) {
    const type = match[1];
    const rest = match[2];
    const lineNumber = getLineNumber(source, match.index);
    const lineText = lines[lineNumber - 1] || '';
    const rulePart = rest.split('--')[0].trim();
    const rules = rulePart.length > 0
      ? rulePart.split(',').map((r) => r.trim()).filter(Boolean)
      : ['*'];

    if (type === 'disable') {
      for (const r of rules) {
        stack.push({ rule: r, line: lineNumber, code: lineText.trim() });
      }
    } else {
      for (const r of rules) {
        let foundIdx = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].rule === r || stack[i].rule === '*' || r === '*') {
            foundIdx = i;
            break;
          }
        }
        if (foundIdx !== -1) {
          stack.splice(foundIdx, 1);
        } else {
          findings.push({
            id: 'no-unbalanced-eslint-disable',
            message: `eslint-enable for '${r}' has no matching eslint-disable.`,
            file: relativePath,
            line: lineNumber,
            code: lineText.trim(),
          });
        }
      }
    }
  }

  for (const item of stack) {
    findings.push({
      id: 'no-unbalanced-eslint-disable',
      message: `Unbalanced eslint-disable: missing matching eslint-enable for '${item.rule}'.`,
      file: relativePath,
      line: item.line,
      code: item.code,
    });
  }

  return findings;
}

/**
 * @param {string} [rootDir]
 * @returns {Promise<{ findings: Array<Record<string, unknown>>, fileCount: number }>}
 */
async function runScan(rootDir = ROOT) {
  const findings = [];
  const files = await collectFiles(rootDir, rootDir);

  for (const relativePath of files) {
    const source = await readFile(path.join(rootDir, relativePath), 'utf8');
    const lines = source.split('\n');

    for (const rule of RULES) {
      if (!rule.pattern || !ruleAppliesToFile(rule, relativePath)) continue;
      for (const match of findMatches(source, rule.pattern)) {
        const lineNumber = getLineNumber(source, match.index);
        const line = lines[lineNumber - 1] || '';
        if (!rule.scanComments && isCommentOnlyLine(line)) continue;
        findings.push({
          ...rule,
          file: relativePath,
          line: lineNumber,
          code: line.trim(),
        });
      }
    }

    if (['.js', '.mjs', '.cjs'].includes(path.extname(relativePath))) {
      findings.push(...checkUnbalancedEslintDisable(source, relativePath));
    }
  }

  // Validate manifest.json description rules
  try {
    const manifestPath = path.join(rootDir, 'manifest.json');
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    const desc = manifest.description || '';
    const manifestLines = manifestRaw.split('\n');
    const descLineNum = manifestLines.findIndex((l) => l.includes('"description"')) + 1 || 1;
    const descLineContent = manifestLines[descLineNum - 1] || '';

    if (/\bobsidian\b/i.test(desc)) {
      findings.push({
        id: 'manifest-desc-no-obsidian',
        message: 'Plugin description must not include the word "Obsidian" (redundant).',
        file: 'manifest.json',
        line: descLineNum,
        code: descLineContent.trim(),
      });
    }
    if (!/[.!?]$/.test(desc)) {
      findings.push({
        id: 'manifest-desc-punctuation',
        message: 'Plugin description should end with punctuation (., !, or ?).',
        file: 'manifest.json',
        line: descLineNum,
        code: descLineContent.trim(),
      });
    }
  } catch (e) {
    if (rootDir === ROOT || e.code !== 'ENOENT') {
      findings.push({
        id: 'manifest-read-error',
        message: `Failed to read or parse manifest.json: ${e.message}`,
        file: 'manifest.json',
        line: 1,
        code: '',
      });
    }
  }

  // Validate version consistency across manifest, package, package-lock, versions.json
  findings.push(...await checkVersionConsistency(rootDir));

  return { findings, fileCount: files.length };
}

/**
 * 校验 manifest.json、package.json、package-lock.json、versions.json 版本号四位一体一致性
 * @param {string} rootDir
 * @returns {Promise<Array<{ id: string, message: string, file: string, line: number, code: string }>>}
 */
async function checkVersionConsistency(rootDir = ROOT) {
  const findings = [];
  const safeReadJson = async (file) => {
    try {
      return JSON.parse(await readFile(path.join(rootDir, file), 'utf8'));
    } catch {
      return null;
    }
  };

  const manifest = await safeReadJson('manifest.json');
  if (!manifest) return findings;

  const version = manifest.version;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    findings.push({
      id: 'manifest-version-invalid',
      message: `manifest.json version must be strictly semantic (x.y.z, no prefix): found "${version}"`,
      file: 'manifest.json',
      line: 1,
      code: `"version": "${version}"`,
    });
    return findings;
  }

  if (typeof manifest.minAppVersion !== 'string' || !manifest.minAppVersion.trim()) {
    findings.push({
      id: 'manifest-min-app-version-missing',
      message: 'manifest.json missing required minAppVersion field.',
      file: 'manifest.json',
      line: 1,
      code: '',
    });
  }

  const pkg = await safeReadJson('package.json');
  if (pkg && pkg.version !== version) {
    findings.push({
      id: 'version-mismatch-package',
      message: `package.json version (${pkg.version}) does not match manifest.json (${version})`,
      file: 'package.json',
      line: 1,
      code: `"version": "${pkg.version}"`,
    });
  }

  const lock = await safeReadJson('package-lock.json');
  if (lock) {
    if (lock.version !== version) {
      findings.push({
        id: 'version-mismatch-package-lock-root',
        message: `package-lock.json root version (${lock.version}) does not match manifest.json (${version})`,
        file: 'package-lock.json',
        line: 1,
        code: `"version": "${lock.version}"`,
      });
    }
    if (lock.packages?.['']?.version && lock.packages[''].version !== version) {
      findings.push({
        id: 'version-mismatch-package-lock-packages',
        message: `package-lock.json packages[""].version (${lock.packages[''].version}) does not match manifest.json (${version})`,
        file: 'package-lock.json',
        line: 1,
        code: `"version": "${lock.packages[''].version}"`,
      });
    }
  }

  const versions = await safeReadJson('versions.json');
  if (versions) {
    if (!versions[version]) {
      findings.push({
        id: 'version-missing-versions-json',
        message: `versions.json missing mapping for current version ${version}`,
        file: 'versions.json',
        line: 1,
        code: `"${version}": "${manifest.minAppVersion || ''}"`,
      });
    } else if (manifest.minAppVersion && versions[version] !== manifest.minAppVersion) {
      findings.push({
        id: 'version-mismatch-versions-json',
        message: `versions.json maps ${version} to ${versions[version]}, but manifest minAppVersion is ${manifest.minAppVersion}`,
        file: 'versions.json',
        line: 1,
        code: `"${version}": "${versions[version]}"`,
      });
    }
  }

  return findings;
}

const isDirectExecution = Boolean(
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
);

if (isDirectExecution) {
  runRuleSelfTests();
  const { findings, fileCount } = await runScan(ROOT);

  if (findings.length > 0) {
    console.error('Obsidian scan risk guard found risky patterns:\n');
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line} ${finding.id}`);
      console.error(`  ${finding.message}`);
      console.error(`  ${finding.code}\n`);
    }
    process.exit(1);
  }

  console.log(`Obsidian scan risk guard passed (${fileCount} files checked).`);
}

export {
  RULES,
  ROOT,
  SCANNED_EXTENSIONS,
  IGNORED_DIRS,
  IGNORED_FILES,
  STATIC_NODE_BUILTIN_IMPORT_PATTERN,
  shouldScanFile,
  ruleAppliesToFile,
  collectFiles,
  getLineNumber,
  isCommentOnlyLine,
  findMatches,
  runRuleSelfTests,
  checkUnbalancedEslintDisable,
  checkVersionConsistency,
  runScan,
};
