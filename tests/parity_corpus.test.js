/*
## 核心功能

覆盖 parity corpus 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 parity corpus 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const { createRenderPipelines } = require('../services/render-pipeline');
const { renderNativeMarkdown } = require('../services/native-renderer');
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');
const { createLegacyConverter } = require('./helpers/render-runtime');

const fixtureRoot = path.resolve(__dirname, 'fixtures');
const corpusPath = path.resolve(__dirname, 'fixtures/parity/corpus.json');
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

function readFixture(name) {
  return fs.readFileSync(path.resolve(fixtureRoot, name), 'utf8');
}

describe('Native Corpus Regression Gate', () => {
  let converter;
  let nativePipeline;

  beforeAll(async () => {
    converter = await createLegacyConverter();
    nativePipeline = createRenderPipelines({
      nativeRenderer: (markdown, context = {}) =>
        renderNativeMarkdown({
          converter,
          markdown,
          sourcePath: context.sourcePath || '',
        }),
    }).nativePipeline;
  });

  it('corpus samples should explicitly declare expectedCleanHtml', () => {
    for (const sample of corpus) {
      expect(typeof sample.expectedCleanHtml).toBe('string');
      expect(sample.expectedCleanHtml.length).toBeGreaterThan(0);
    }
  });

  for (const sample of corpus) {
    it(`should keep cleaned html stable for ${sample.id}`, async () => {
      const markdown = readFixture(sample.fixture);
      const context = { sourcePath: sample.sourcePath || '' };

      const rawHtml = await nativePipeline.renderForPreview(markdown, context);
      const cleaned = cleanHtmlForDraft(rawHtml);
      const expected = readFixture(sample.expectedCleanHtml);

      expect(cleaned).toBe(expected);
      expect(cleaned).not.toContain('<script');

      const container = document.createElement('div');
      container.innerHTML = cleaned;
      const unsafeLinks = Array.from(container.querySelectorAll('a[href]')).filter(
        (a) => /^javascript:/i.test(a.getAttribute('href') || '')
      );
      expect(unsafeLinks).toHaveLength(0);
    });
  }
});
