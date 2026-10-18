/*
## 核心功能

验证 scripts/check-scan-risk-patterns.mjs 中的扫描规则、模式匹配与文件过滤逻辑，确保本地 guard 与上游审核标准一致。

## 输入

模拟的代码片段（合法、违规、边界用例）、虚拟文件路径与规则配置。

## 输出

对每条规则（特别是新增的 no-css-has 以及关键高危规则）的拦截、放行及适用性断言。

## 定位

位于 tests/，是工程质量防护与审查门禁的单元测试。
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  RULES,
  findMatches,
  ruleAppliesToFile,
  shouldScanFile,
  runRuleSelfTests,
  checkUnbalancedEslintDisable,
  checkVersionConsistency,
  runScan,
} from '../scripts/check-scan-risk-patterns.mjs';

describe('Scan Risk Patterns Guard', () => {
  describe('Rule self-test verification', () => {
    it('passes built-in self-tests without throwing', () => {
      expect(() => runRuleSelfTests()).not.toThrow();
    });
  });

  describe('no-css-has rule', () => {
    const rule = RULES.find((r) => r.id === 'no-css-has');

    it('exists in RULES configuration', () => {
      expect(rule).toBeDefined();
      expect(rule?.extensions).toEqual(new Set(['.css']));
    });

    it('blocks CSS selectors containing :has()', () => {
      const invalidSnippets = [
        '.container:has(.child) { display: flex; }',
        'article:has(> h2) { margin-top: 1rem; }',
        'div:has(   span.active ) { background: #fff; }',
      ];
      for (const snippet of invalidSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBeGreaterThan(0);
      }
    });

    it('allows CSS without :has() pseudo-class', () => {
      const validSnippets = [
        '.container.has-child { display: flex; }',
        'article > h2 { margin-top: 1rem; }',
        ':hover, :focus, :not(.disabled) { color: #333; }',
      ];
      for (const snippet of validSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBe(0);
      }
    });

    it('only targets .css files via ruleAppliesToFile', () => {
      expect(ruleAppliesToFile(rule, 'styles/card.css')).toBe(true);
      expect(ruleAppliesToFile(rule, 'services/card-render.js')).toBe(false);
      expect(ruleAppliesToFile(rule, 'scripts/build.mjs')).toBe(false);
    });
  });

  describe('no-static-node-builtin-import rule', () => {
    const rule = RULES.find((r) => r.id === 'no-static-node-builtin-import');

    it('blocks static imports of Node builtins in runtime code', () => {
      const invalidSnippets = [
        "import fs from 'node:fs';",
        "import { readFile } from 'fs';",
        "import path from 'node:path';",
        "export { Buffer } from 'node:buffer';",
      ];
      for (const snippet of invalidSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBeGreaterThan(0);
      }
    });

    it('allows guarded dynamic require or non-builtin imports', () => {
      const validSnippets = [
        "const fs = Platform.isDesktop ? require('fs') : null;",
        "const { sha256 } = await import('@noble/hashes/sha256');",
        "import { Notice } from 'obsidian';",
      ];
      for (const snippet of validSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBe(0);
      }
    });

    it('ignores server/ directory via ignoredPathPrefixes', () => {
      expect(ruleAppliesToFile(rule, 'services/wechat.js')).toBe(true);
      expect(ruleAppliesToFile(rule, 'server/app.js')).toBe(false);
    });
  });

  describe('require-eslint-disable-reason rule', () => {
    const rule = RULES.find((r) => r.id === 'require-eslint-disable-reason');

    it('blocks eslint-disable comments missing -- reason explanation', () => {
      const invalidSnippets = [
        '/* eslint-disable no-console */',
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
        '/* eslint-disable-line no-inner-html */',
      ];
      for (const snippet of invalidSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBeGreaterThan(0);
      }
    });

    it('allows eslint-disable comments with proper -- reason explanation', () => {
      const validSnippets = [
        '/* eslint-disable no-console -- reason: CLI output requires stdout logging */',
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: dynamic upstream structure',
        '/* eslint-disable-line no-inner-html -- reason: verified sanitized html string */',
      ];
      for (const snippet of validSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBe(0);
      }
    });
  });

  describe('no-css-important rule', () => {
    const rule = RULES.find((r) => r.id === 'no-css-important');

    it('blocks !important in CSS', () => {
      const matches = findMatches('.title { font-size: 16px !important; }', rule.pattern);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('allows clean CSS declarations', () => {
      const matches = findMatches('.title { font-size: 16px; font-weight: bold; }', rule.pattern);
      expect(matches.length).toBe(0);
    });

    it('only targets .css files', () => {
      expect(ruleAppliesToFile(rule, 'styles/main.css')).toBe(true);
      expect(ruleAppliesToFile(rule, 'views/editor.js')).toBe(false);
    });
  });

  describe('no-global-this-production rule', () => {
    const rule = RULES.find((r) => r.id === 'no-global-this-production');

    it('blocks globalThis usage in production code', () => {
      const matches = findMatches('const target = globalThis.customElement;', rule.pattern);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('allows window or activeWindow usage', () => {
      const matches = findMatches('const target = window.customElement;', rule.pattern);
      expect(matches.length).toBe(0);
    });

    it('ignores eslint.config.mjs via ignoredPathPrefixes', () => {
      expect(ruleAppliesToFile(rule, 'eslint.config.mjs')).toBe(false);
      expect(ruleAppliesToFile(rule, 'services/native-renderer.js')).toBe(true);
    });
  });

  describe('no-console-disable rule', () => {
    const rule = RULES.find((r) => r.id === 'no-console-disable');

    it('exists in RULES configuration', () => {
      expect(rule).toBeDefined();
      expect(rule?.extensions).toEqual(new Set(['.js', '.mjs', '.cjs']));
    });

    it('blocks eslint-disable that targets no-console', () => {
      const invalidSnippets = [
        '/* eslint-disable no-console */',
        '/* eslint-disable no-console, no-debugger -- reason: cli output */',
        '/* eslint-disable no-unused-vars, no-console -- reason: note */',
        '// eslint-disable-next-line no-console -- reason: temporary log',
        '// eslint-disable-line no-console',
      ];
      for (const snippet of invalidSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBeGreaterThan(0);
      }
    });

    it('allows disabling other rules and allows normal console usage', () => {
      const validSnippets = [
        '/* eslint-disable no-debugger -- reason: cli debugging */',
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: dynamic object',
        '// eslint-disable-next-line no-unused-vars -- reason: test no-console mention in explanation',
        'console.warn("warning is allowed");',
        'console.error("error is allowed");',
      ];
      for (const snippet of validSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBe(0);
      }
    });
  });

  describe('no-this-alias rule', () => {
    const rule = RULES.find((r) => r.id === 'no-this-alias');

    it('exists in RULES configuration', () => {
      expect(rule).toBeDefined();
      expect(rule?.extensions).toEqual(new Set(['.js', '.mjs', '.cjs']));
    });

    it('blocks aliasing this to self, that, or _this', () => {
      const invalidSnippets = [
        'const self = this;',
        'const that = this.prop;',
        'const _this = this  ;',
        'let self = this;',
        'var that = this;',
      ];
      for (const snippet of invalidSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBeGreaterThan(0);
      }
    });

    it('allows object literals with this key, other variable names, or arrow functions', () => {
      const validSnippets = [
        'const self = { this: "not-alias" };',
        'const selfie = this;',
        'const foo = this;',
        'const that = { value: 42 };',
        'const callback = () => this.doSomething();',
      ];
      for (const snippet of validSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBe(0);
      }
    });
  });

  describe('no-unbalanced-eslint-disable rule', () => {
    const rule = RULES.find((r) => r.id === 'no-unbalanced-eslint-disable');

    it('exists in RULES configuration', () => {
      expect(rule).toBeDefined();
      expect(rule?.extensions).toEqual(new Set(['.js', '.mjs', '.cjs']));
    });

    it('detects unclosed block-level eslint-disable comments', () => {
      const unclosedSource = [
        '/* eslint-disable no-unused-vars -- reason: fixture */',
        'const a = 1;',
        'console.log(a);',
      ].join('\n');

      const issues = checkUnbalancedEslintDisable(unclosedSource, 'sample.js');
      expect(issues.length).toBe(1);
      expect(issues[0].id).toBe('no-unbalanced-eslint-disable');
      expect(issues[0].line).toBe(1);
      expect(issues[0].message).toContain('no-unused-vars');
    });

    it('detects mismatched eslint-enable comments', () => {
      const mismatchedSource = [
        '/* eslint-disable no-console -- reason: test */',
        'console.log("hi");',
        '/* eslint-enable no-debugger -- reason: wrong rule */',
      ].join('\n');

      const issues = checkUnbalancedEslintDisable(mismatchedSource, 'sample.js');
      expect(issues.length).toBe(2);
      expect(issues.some((i) => i.message.includes("eslint-enable for 'no-debugger' has no matching"))).toBe(true);
      expect(issues.some((i) => i.message.includes("missing matching eslint-enable for 'no-console'"))).toBe(true);
    });

    it('allows properly paired eslint-disable and eslint-enable blocks', () => {
      const balancedSource = [
        '/* eslint-disable no-console -- reason: debug */',
        'console.log("hello");',
        '/* eslint-enable no-console -- reason: resume */',
      ].join('\n');

      const issues = checkUnbalancedEslintDisable(balancedSource, 'sample.js');
      expect(issues.length).toBe(0);
    });

    it('ignores single-line eslint-disable-next-line and eslint-disable-line', () => {
      const inlineSource = [
        '// eslint-disable-next-line no-console -- reason: inline line',
        'console.log("line");',
        '/* eslint-disable-line no-unused-vars -- reason: inline */',
      ].join('\n');

      const issues = checkUnbalancedEslintDisable(inlineSource, 'sample.js');
      expect(issues.length).toBe(0);
    });

    it('handles multiple rules in a single disable/enable comment', () => {
      const multiRuleSource = [
        '/* eslint-disable ruleA, ruleB -- reason: multi */',
        'doSomething();',
        '/* eslint-enable ruleA, ruleB -- reason: resume */',
      ].join('\n');

      const issues = checkUnbalancedEslintDisable(multiRuleSource, 'sample.js');
      expect(issues.length).toBe(0);
    });
  });

  describe('shouldScanFile filter', () => {
    it('ignores designated directories', () => {
      expect(shouldScanFile('node_modules/foo/index.js')).toBe(false);
      expect(shouldScanFile('tests/some.test.js')).toBe(false);
      expect(shouldScanFile('scripts/build.mjs')).toBe(false);
      expect(shouldScanFile('.git/config')).toBe(false);
    });

    it('scans tracked source extensions in regular directories', () => {
      expect(shouldScanFile('services/render.js')).toBe(true);
      expect(shouldScanFile('styles/theme.css')).toBe(true);
      expect(shouldScanFile('styles/theme.png')).toBe(false);
    });
  });

  describe('runScan integration tests (isolated fixture directory)', () => {
    let tempDir;

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'scan-guard-fixture-'));
    });

    afterEach(async () => {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('detects block-level /* eslint-disable no-console */ on comment-only line via runScan', async () => {
      const filePath = path.join(tempDir, 'sample.js');
      await writeFile(
        filePath,
        '/* eslint-disable no-console -- reason: test */\nconsole.log(1);\n/* eslint-enable no-console -- reason: resume */\n'
      );

      const result = await runScan(tempDir);
      expect(result.fileCount).toBe(1);
      const finding = result.findings.find((f) => f.id === 'no-console-disable');
      expect(finding).toBeDefined();
      expect(finding?.line).toBe(1);
    });

    it('detects line-level // eslint-disable-next-line no-console on comment-only line via runScan', async () => {
      const filePath = path.join(tempDir, 'sample.js');
      await writeFile(
        filePath,
        '// eslint-disable-next-line no-console -- reason: test\nconsole.log(1);\n'
      );

      const result = await runScan(tempDir);
      expect(result.fileCount).toBe(1);
      const finding = result.findings.find((f) => f.id === 'no-console-disable');
      expect(finding).toBeDefined();
      expect(finding?.line).toBe(1);
    });

    it('detects unclosed block-level disable via runScan', async () => {
      const filePath = path.join(tempDir, 'unclosed.js');
      await writeFile(
        filePath,
        '/* eslint-disable no-unused-vars -- reason: test */\nconst x = 1;\n'
      );

      const result = await runScan(tempDir);
      const finding = result.findings.find((f) => f.id === 'no-unbalanced-eslint-disable');
      expect(finding).toBeDefined();
      expect(finding?.line).toBe(1);
    });

    it('detects no-this-alias via runScan', async () => {
      const filePath = path.join(tempDir, 'alias.js');
      await writeFile(
        filePath,
        'function run() {\n  const self = this;\n  return self;\n}\n'
      );

      const result = await runScan(tempDir);
      const finding = result.findings.find((f) => f.id === 'no-this-alias');
      expect(finding).toBeDefined();
      expect(finding?.line).toBe(2);
    });

    it('detects CSS :has() via runScan', async () => {
      const filePath = path.join(tempDir, 'theme.css');
      await writeFile(filePath, '.card:has(.badge) { color: red; }\n');

      const result = await runScan(tempDir);
      const finding = result.findings.find((f) => f.id === 'no-css-has');
      expect(finding).toBeDefined();
      expect(finding?.line).toBe(1);
    });

    it('passes clean code without findings via runScan', async () => {
      const filePath = path.join(tempDir, 'clean.js');
      await writeFile(
        filePath,
        '/* eslint-disable no-unused-vars -- reason: test */\nconst x = 1;\n/* eslint-enable no-unused-vars -- reason: resume */\nconsole.warn("clean");\n'
      );

      const result = await runScan(tempDir);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('no-vault-getfiles-find rule', () => {
    const rule = RULES.find((r) => r.id === 'no-vault-getfiles-find');

    it('blocks app.vault.getFiles().find', () => {
      const invalidSnippets = [
        'const target = app.vault.getFiles().find((f) => f.path === targetPath);',
        'const file = vault.getFiles().find(fn);',
      ];
      for (const snippet of invalidSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBeGreaterThan(0);
      }
    });

    it('allows app.vault.getAbstractFileByPath', () => {
      const validSnippets = [
        'const target = app.vault.getAbstractFileByPath(targetPath);',
        'const files = app.vault.getFiles();',
      ];
      for (const snippet of validSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBe(0);
      }
    });
  });

  describe('no-view-lifecycle-collision rule', () => {
    const rule = RULES.find((r) => r.id === 'no-view-lifecycle-collision');

    it('blocks forbidden lifecycle method declarations', () => {
      const invalidSnippets = [
        'open() {\n  return;\n}',
        'async close() {\n  await something();\n}',
        'load() {\n}',
        'unload() {\n}',
        'onload() {\n}',
        'onunload() {\n}',
        'async setState(state) {\n}',
        'getState() {\n  return {};\n}',
      ];
      for (const snippet of invalidSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBeGreaterThan(0);
      }
    });

    it('allows valid Obsidian view callbacks and calls', () => {
      const validSnippets = [
        'async onOpen() {\n}',
        'async onClose() {\n}',
        'openModal() {\n}',
        'this.close();',
        'const open = true;',
      ];
      for (const snippet of validSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBe(0);
      }
    });

    it('only targets views/ directory via includedPathPrefixes', () => {
      expect(ruleAppliesToFile(rule, 'views/converter/core.js')).toBe(true);
      expect(ruleAppliesToFile(rule, 'services/wechat-video.js')).toBe(false);
    });
  });

  describe('no-setting-implicit-return rule', () => {
    const rule = RULES.find((r) => r.id === 'no-setting-implicit-return');

    it('blocks implicit or explicit return of Setting instances', () => {
      const invalidSnippets = [
        'const fn = (el) => new Setting(el);',
        'function build(el) {\n  return new Setting(el);\n}',
        'const add = (card, item) => card.addSetting(item);',
        'function add(card) {\n  return this.addSetting(card);\n}',
      ];
      for (const snippet of invalidSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBeGreaterThan(0);
      }
    });

    it('allows standard Setting configuration and non-Setting returns', () => {
      const validSnippets = [
        'new Setting(containerEl).setName("Title");',
        'const setting = new Setting(containerEl);',
        'return this;',
        'return settingValue;',
      ];
      for (const snippet of validSnippets) {
        const matches = findMatches(snippet, rule.pattern);
        expect(matches.length).toBe(0);
      }
    });
  });

  describe('checkVersionConsistency', () => {
    it('detects mismatched package.json version', async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'vc-test-'));
      try {
        await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: '2.11.2', minAppVersion: '1.4.0' }));
        await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '2.11.1' }));
        await writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ version: '2.11.2', packages: { '': { version: '2.11.2' } } }));
        await writeFile(path.join(dir, 'versions.json'), JSON.stringify({ '2.11.2': '1.4.0' }));

        const findings = await checkVersionConsistency(dir);
        expect(findings.some((f) => f.id === 'version-mismatch-package')).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('detects mismatched package-lock.json root or packages version', async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'vc-test-'));
      try {
        await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: '2.11.2', minAppVersion: '1.4.0' }));
        await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '2.11.2' }));
        await writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ version: '2.11.0', packages: { '': { version: '2.11.2' } } }));
        await writeFile(path.join(dir, 'versions.json'), JSON.stringify({ '2.11.2': '1.4.0' }));

        const findings = await checkVersionConsistency(dir);
        expect(findings.some((f) => f.id === 'version-mismatch-package-lock-root')).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('detects missing versions.json entry', async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'vc-test-'));
      try {
        await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: '2.11.2', minAppVersion: '1.4.0' }));
        await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '2.11.2' }));
        await writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ version: '2.11.2', packages: { '': { version: '2.11.2' } } }));
        await writeFile(path.join(dir, 'versions.json'), JSON.stringify({ '2.11.1': '1.4.0' }));

        const findings = await checkVersionConsistency(dir);
        expect(findings.some((f) => f.id === 'version-missing-versions-json')).toBe(true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('passes when all versions are aligned', async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'vc-test-'));
      try {
        await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: '2.11.2', minAppVersion: '1.4.0' }));
        await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '2.11.2' }));
        await writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ version: '2.11.2', packages: { '': { version: '2.11.2' } } }));
        await writeFile(path.join(dir, 'versions.json'), JSON.stringify({ '2.11.2': '1.4.0' }));

        const findings = await checkVersionConsistency(dir);
        expect(findings).toHaveLength(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
