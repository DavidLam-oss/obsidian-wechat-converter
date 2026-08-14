/*
## 核心功能

提供 check scan risk patterns 开发脚本，服务构建、校验、生成或发布前检查。

## 输入

接收命令行参数、package scripts、仓库源码文件和生成物状态。

## 输出

输出终端校验结果、生成文件、失败退出码或发布前诊断信息。

## 定位

位于 scripts/，只处理仓库工程化任务，不被 Obsidian 插件运行时直接加载。

## 依赖

关键依赖：`node:fs/promises`、`node:path`、`node:module`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 scripts 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';

const ROOT = process.cwd();
const SCANNED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css']);
const IGNORED_DIRS = new Set([
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
  },
  {
    id: 'no-css-important',
    message: 'Avoid stylesheet !important. Increase selector specificity, use CSS variables, or keep compatibility-critical inline styles narrowly scoped.',
    pattern: /!important\b/,
    extensions: new Set(['.css']),
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
 * @param {{ extensions?: Set<string> }} rule
 * @param {string} relativePath
 * @returns {boolean}
 */
function ruleAppliesToFile(rule, relativePath) {
  if (rule.extensions && !rule.extensions.has(path.extname(relativePath))) return false;
  const normalizedPath = relativePath.split(path.sep).join('/');
  return !(rule.ignoredPathPrefixes || []).some((prefix) => normalizedPath.startsWith(prefix));
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT, absolutePath);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      files.push(...await collectFiles(absolutePath));
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
}

const findings = [];
runRuleSelfTests();
const files = await collectFiles(ROOT);

for (const relativePath of files) {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  const lines = source.split('\n');

  for (const rule of RULES) {
    if (!ruleAppliesToFile(rule, relativePath)) continue;
    for (const match of findMatches(source, rule.pattern)) {
      const lineNumber = getLineNumber(source, match.index);
      const line = lines[lineNumber - 1] || '';
      if (rule.id !== 'require-eslint-disable-reason' && isCommentOnlyLine(line)) continue;
      findings.push({
        ...rule,
        file: relativePath,
        line: lineNumber,
        code: line.trim(),
      });
    }
  }
}

// Validate manifest.json description rules
try {
  const manifestPath = path.join(ROOT, 'manifest.json');
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const desc = manifest.description || '';
  const manifestLines = manifestRaw.split('\n');
  const descLineNum = manifestLines.findIndex(l => l.includes('"description"')) + 1 || 1;
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
  findings.push({
    id: 'manifest-read-error',
    message: `Failed to read or parse manifest.json: ${e.message}`,
    file: 'manifest.json',
    line: 1,
    code: '',
  });
}

if (findings.length > 0) {
  console.error('Obsidian scan risk guard found risky patterns:\n');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.id}`);
    console.error(`  ${finding.message}`);
    console.error(`  ${finding.code}\n`);
  }
  process.exit(1);
}

console.log(`Obsidian scan risk guard passed (${files.length} files checked).`);
