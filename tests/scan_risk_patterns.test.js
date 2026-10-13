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

import { describe, it, expect } from 'vitest';
import {
  RULES,
  findMatches,
  ruleAppliesToFile,
  shouldScanFile,
  runRuleSelfTests,
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
});
