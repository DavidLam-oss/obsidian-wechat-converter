/*
## 核心功能

覆盖 rendered mermaid 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 rendered mermaid 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  hasMermaidMarker,
  looksLikeMermaidSvg,
  isMermaidCodeBlock,
  buildMermaidCompatSource,
  normalizeRenderedMermaidDiagrams,
  prepareRenderedMermaidDiagramsForWechat,
  convertRenderedMermaidDiagramsToImages,
  renderMermaidCodeBlocks,
  rasterizeRenderedMermaidDiagrams,
} = require('../services/rendered-mermaid');

describe('Rendered Mermaid Service', () => {
  beforeEach(() => {
    global.Node = global.Node || window.Node;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect Mermaid markers from class metadata', () => {
    const el = document.createElement('div');
    el.setAttribute('class', 'mermaid block-language-mermaid');
    expect(hasMermaidMarker(el)).toBe(true);
  });

  it('should identify Mermaid svg while ignoring MathJax svg', () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<div class="mermaid"><svg id="mermaid-1"></svg></div>',
      '<mjx-container><svg role="img" focusable="false"></svg></mjx-container>',
    ].join('');

    const svgs = Array.from(host.querySelectorAll('svg'));
    expect(looksLikeMermaidSvg(svgs[0])).toBe(true);
    expect(looksLikeMermaidSvg(svgs[1])).toBe(false);
  });

  it('should detect Mermaid fenced code blocks before explicit rendering', () => {
    const host = document.createElement('div');
    host.innerHTML = '<pre><code class="language-mermaid">graph TD\\nA-->B</code></pre>';
    expect(isMermaidCodeBlock(host.querySelector('code'))).toBe(true);
  });

  it('should inject compatible Mermaid init config when source lacks one', () => {
    const source = buildMermaidCompatSource('graph TD\nA-->B');
    expect(source).toContain('%%{init:');
    expect(source).toContain('"htmlLabels":false');
    expect(source).toContain('graph TD');
  });

  it('should render Mermaid code blocks into Mermaid svg hosts', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<pre><code class="language-mermaid">graph TD\\nA-->B</code></pre>';
    const mermaidApi = {
      render: vi.fn(async () => ({
        svg: '<svg id="mermaid-rendered"></svg>',
      })),
    };

    const renderedCount = await renderMermaidCodeBlocks(host, { mermaidApi });

    expect(renderedCount).toBe(1);
    expect(mermaidApi.render).toHaveBeenCalledTimes(1);
    expect(mermaidApi.render.mock.calls[0][1]).toContain('"htmlLabels":false');
    expect(host.querySelector('svg#mermaid-rendered')).not.toBeNull();
    expect(host.querySelector('pre')).toBeNull();
  });

  it('should replace Mermaid svg nodes with PNG images', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="mermaid"><svg id="mermaid-1" width="120" height="80"></svg></div>';
    const rasterizeSvg = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,mermaid',
      width: 120,
      height: 80,
      style: '',
    }));

    await rasterizeRenderedMermaidDiagrams(host, { rasterizeSvg });

    const img = host.querySelector('img.mermaid-diagram-image');
    expect(rasterizeSvg).toHaveBeenCalledTimes(1);
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,mermaid');
    expect(img.getAttribute('style')).toContain('width:100%');
    expect(host.querySelector('.mermaid')?.getAttribute('style') || '').toContain('max-width: 100%');
    expect(host.querySelector('svg')).toBeNull();
  });

  it('should inline Mermaid svg style rules before rasterizing detached export dom', async () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<div class="mermaid">',
      '  <svg id="mermaid-export" viewBox="0 0 100 60">',
      '    <style>#mermaid-export .node rect { fill:#efeaff; stroke:#b197fc; } #mermaid-export .nodeLabel p { color:#2f2f2f; }</style>',
      '    <g class="node"><rect width="40" height="20"></rect></g>',
      '    <foreignObject class="nodeLabel"><div><p>Label</p></div></foreignObject>',
      '  </svg>',
      '</div>',
    ].join('');

    const rasterizeSvg = vi.fn(async (svg) => {
      const rect = svg.querySelector('rect');
      const label = svg.querySelector('text');
      expect(svg.querySelector('style')).toBeNull();
      expect(rect?.getAttribute('style') || '').toContain('fill:#efeaff');
      expect(rect?.getAttribute('style') || '').toContain('stroke:#b197fc');
      expect(label?.getAttribute('fill') || '').toBe('#333333');
      return {
        dataUrl: 'data:image/png;base64,mermaid',
        width: 100,
        height: 60,
        style: '',
      };
    });

    await rasterizeRenderedMermaidDiagrams(host, { rasterizeSvg });

    expect(rasterizeSvg.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(host.querySelector('img.mermaid-diagram-image')).not.toBeNull();
  });

  it('should flatten Mermaid foreignObject labels before rasterization for WeChat compatibility', async () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<div class="mermaid">',
      '  <svg id="mermaid-foreign" viewBox="0 0 100 60">',
      '    <style>#mermaid-foreign .nodeLabel p { color:#2f2f2f; font-size:14px; }</style>',
      '    <foreignObject x="10" y="10" width="40" height="20"><div><p style="color:#2f2f2f;font-size:14px;">Label</p></div></foreignObject>',
      '  </svg>',
      '</div>',
    ].join('');

    const rasterizeSvg = vi.fn(async (svg) => {
      expect(svg.querySelector('foreignObject')).toBeNull();
      const text = svg.querySelector('text');
      expect(text?.textContent).toBe('Label');
      expect(text?.getAttribute('text-anchor')).toBe('middle');
      return {
        dataUrl: 'data:image/png;base64,mermaid',
        width: 100,
        height: 60,
        style: '',
      };
    });

    await rasterizeRenderedMermaidDiagrams(host, { rasterizeSvg });

    expect(rasterizeSvg.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(host.querySelector('img.mermaid-diagram-image')).not.toBeNull();
  });

  it('should normalize rendered Mermaid svg hosts for responsive preview', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="mermaid"><svg id="mermaid-preview" viewBox="0 0 400 120"></svg></div>';

    const normalized = normalizeRenderedMermaidDiagrams(host);

    expect(normalized).toBe(1);
    expect(host.querySelector('.mermaid')?.getAttribute('style') || '').toContain('width: 100%');
    expect(host.querySelector('svg#mermaid-preview')?.getAttribute('class') || '').toContain('owc-mermaid-diagram');
    expect(host.querySelector('svg#mermaid-preview')?.getAttribute('style') || '').toContain('max-width: 100%');
  });

  it('should inline Mermaid svg style rules before preview serialization strips style tags', () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<div class="mermaid">',
      '  <svg id="mermaid-style-test" viewBox="0 0 100 60">',
      '    <style>#mermaid-style-test .node rect { fill:#efeaff; stroke:#b197fc; } #mermaid-style-test .label { color:#2f2f2f; }</style>',
      '    <g class="node"><rect width="40" height="20"></rect></g>',
      '    <text class="label">Hello</text>',
      '  </svg>',
      '</div>',
    ].join('');

    normalizeRenderedMermaidDiagrams(host);

    const svg = host.querySelector('svg#mermaid-style-test');
    const rect = host.querySelector('rect');
    const text = host.querySelector('text.label');
    expect(svg?.querySelector('style')).toBeNull();
    expect(rect?.getAttribute('style') || '').toContain('fill:#efeaff');
    expect(rect?.getAttribute('style') || '').toContain('stroke:#b197fc');
    expect(text?.getAttribute('style') || '').toContain('color:#2f2f2f');
  });

  it('should rewrite Mermaid svg labels for WeChat-friendly export', () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<div class="mermaid">',
      '  <svg id="mermaid-wechat" viewBox="0 0 100 60">',
      '    <foreignObject x="10" y="10" width="40" height="20">',
      '      <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;">',
      '        <span class="nodeLabel"><p>Label</p></span>',
      '      </div>',
      '    </foreignObject>',
      '    <text><tspan>Edge</tspan></text>',
      '  </svg>',
      '</div>',
    ].join('');

    const processed = prepareRenderedMermaidDiagramsForWechat(host);

    expect(processed).toBe(1);
    expect(host.querySelector('.nodeLabel p')).toBeNull();
    expect(host.querySelector('foreignObject')).toBeNull();
    expect(host.querySelector('text tspan')).not.toBeNull();
    expect(host.querySelector('tspan')?.getAttribute('style') || '').toContain('fill:#333333');
    expect(host.querySelector('svg#mermaid-wechat')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('should convert Mermaid svg into cached export images', async () => {
    const cache = new Map();
    const createHost = () => {
      const host = document.createElement('div');
      host.innerHTML = '<div class="mermaid"><svg id="cached-mermaid" viewBox="0 0 120 80"><rect width="120" height="80"></rect></svg></div>';
      return host;
    };
    const rasterizeSvg = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,cached-mermaid',
      width: 120,
      height: 80,
      style: '',
    }));

    await convertRenderedMermaidDiagramsToImages(createHost(), {
      rasterizeSvg,
      simpleHash: (value) => value,
      mermaidImageCache: cache,
    });
    const secondHost = createHost();
    await convertRenderedMermaidDiagramsToImages(secondHost, {
      rasterizeSvg,
      simpleHash: (value) => value,
      mermaidImageCache: cache,
    });

    expect(rasterizeSvg).toHaveBeenCalledTimes(1);
    expect(secondHost.querySelector('img.mermaid-diagram-image')?.getAttribute('src')).toBe('data:image/png;base64,cached-mermaid');
  });

  it('should shrink portrait Mermaid export images to preserve article width', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="mermaid"><svg id="portrait-mermaid" viewBox="0 0 100 220"><rect width="100" height="220"></rect></svg></div>';
    const rasterizeSvg = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,portrait',
      width: 100,
      height: 220,
      style: '',
    }));

    await convertRenderedMermaidDiagramsToImages(host, { rasterizeSvg });

    const img = host.querySelector('img.mermaid-diagram-image');
    expect(img).not.toBeNull();
    expect(img.getAttribute('style') || '').toContain('width:78%');
  });
});
