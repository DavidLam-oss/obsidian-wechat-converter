/*
## 核心功能

作为数学公式独立 bundle 的源码入口，包装专为微信排版优化的轻量 MathJax 运行时。

## 输入

接收 markdown-it 实例、公式配置和 MathJax 核心依赖。

## 输出

在全局对象上导出可被 scripts/generate-embedded-deps.mjs 打包的 _global.ObsidianWechatMath 插件入口。

## 定位

位于 lib/，是生成 mathjax-plugin.js 的源文件；不要在生成物里直接改逻辑。

## 依赖

关键依赖：`mathjax-full`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 lib 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
- 遵循全局导出契约与重入防护规范（AGENTS.md §3）。
*/

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';

// 仅引入经过充分验证的高频核心宏包集合，剔除无用偏门包
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noerrors/NoErrorsConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js';
import 'mathjax-full/js/input/tex/cases/CasesConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/upgreek/UpgreekConfiguration.js';
import 'mathjax-full/js/input/tex/unicode/UnicodeConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/extpfeil/ExtpfeilConfiguration.js';

const CORE_PACKAGES = [
  'base',
  'ams',
  'newcommand',
  'noerrors',
  'noundefined',
  'boldsymbol',
  'mathtools',
  'cases',
  'color',
  'upgreek',
  'unicode',
  'cancel',
  'extpfeil',
];

// 模块级单例 DOM 适配器与全局 Handler 注册（避免原库每渲染公式全局 append Handler 的内存泄漏）
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

// 完整的 Markdown-it 定界符词法解析状态机（支持 \$ 转义保护与行内/块级区分）
function isValidDelim(state, pos) {
  let max = state.posMax;
  let can_open = true;
  let can_close = true;
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
  const nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;

  if (prevChar === 0x20 || prevChar === 0x09 || (nextChar >= 0x30 && nextChar <= 0x39)) {
    can_close = false;
  }
  if (nextChar === 0x20 || nextChar === 0x09) {
    can_open = false;
  }
  return {
    can_open,
    can_close,
  };
}

function math_inline(state, silent) {
  if (state.src[state.pos] !== '$') {
    return false;
  }
  const res = isValidDelim(state, state.pos);
  if (!res.can_open) {
    if (!silent) {
      state.pending += '$';
    }
    state.pos += 1;
    return true;
  }

  const start = state.pos + 1;
  let match = start;
  while ((match = state.src.indexOf('$', match)) !== -1) {
    let pos = match - 1;
    while (state.src[pos] === '\\') {
      pos -= 1;
    }
    if ((match - pos) % 2 === 1) {
      break;
    }
    match += 1;
  }

  if (match === -1) {
    if (!silent) {
      state.pending += '$';
    }
    state.pos = start;
    return true;
  }

  if (match - start === 0) {
    if (!silent) {
      state.pending += '$$';
    }
    state.pos = start + 1;
    return true;
  }

  const closeRes = isValidDelim(state, match);
  if (!closeRes.can_close) {
    if (!silent) {
      state.pending += '$';
    }
    state.pos = start;
    return true;
  }

  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

function math_block(state, start, end, silent) {
  let next;
  let lastPos;
  let found = false;
  let pos = state.bMarks[start] + state.tShift[start];
  const max = state.eMarks[start];
  let lastLine = '';

  if (pos + 2 > max) {
    return false;
  }
  if (state.src.slice(pos, pos + 2) !== '$$') {
    return false;
  }
  pos += 2;
  let firstLine = state.src.slice(pos, max);
  if (silent) {
    return true;
  }
  if (firstLine.trim().slice(-2) === '$$') {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }
  for (next = start; !found;) {
    next++;
    if (next >= end) {
      break;
    }
    pos = state.bMarks[next] + state.tShift[next];
    const lineMax = state.eMarks[next];
    if (pos < lineMax && state.tShift[next] < state.blkIndent) {
      break;
    }
    if (state.src.slice(pos, lineMax).trim().slice(-2) === '$$') {
      lastPos = state.src.slice(0, lineMax).lastIndexOf('$$');
      lastLine = state.src.slice(pos, lastPos);
      found = true;
    }
  }
  state.line = next + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content =
    (firstLine && firstLine.trim() ? firstLine + '\n' : '') +
    state.getLines(start + 1, next, state.tShift[start], true) +
    (lastLine && lastLine.trim() ? lastLine : '');
  token.map = [start, state.line];
  token.markup = '$$';
  return true;
}

function createRenderMath(documentOptions) {
  return function renderMath(content, isDisplay) {
    const mathDoc = mathjax.document(content, documentOptions);
    const node = mathDoc.convert(content, { display: isDisplay });

    // 1. 容器与 SVG 基础定位/对齐样式
    adaptor.setStyle(node, 'direction', 'ltr');
    adaptor.setStyle(node, 'position', 'relative');
    if (isDisplay) {
      adaptor.setStyle(node, 'display', 'block');
      adaptor.setStyle(node, 'text-align', 'center');
      adaptor.setStyle(node, 'margin', '1em 0');
    }

    const svgNode = adaptor.firstChild(node);
    if (svgNode) {
      adaptor.setAttribute(svgNode, 'aria-hidden', 'true');
      const existingStyle = adaptor.getAttribute(svgNode, 'style') || '';
      adaptor.setAttribute(
        svgNode,
        'style',
        'overflow: visible; min-height: 1px; min-width: 1px; ' + existingStyle
      );
    }

    // 2. 微信排版保真关键内联（弥补微信剥离 <style> 标签导致的矩阵线/边框隐形）
    for (const line of adaptor.tags(node, 'line')) {
      if (adaptor.hasAttribute(line, 'data-line')) {
        adaptor.setStyle(line, 'stroke-width', '70px');
        adaptor.setStyle(line, 'fill', 'none');
      }
    }
    for (const rect of adaptor.tags(node, 'rect')) {
      if (adaptor.hasAttribute(rect, 'data-frame')) {
        adaptor.setStyle(rect, 'stroke-width', '70px');
        adaptor.setStyle(rect, 'fill', 'none');
      }
    }
    for (const p of adaptor.tags(node, 'path')) {
      if (adaptor.hasAttribute(p, 'data-c')) {
        adaptor.setStyle(p, 'stroke-width', '3');
      }
    }
    for (const u of adaptor.tags(node, 'use')) {
      if (adaptor.hasAttribute(u, 'data-c')) {
        adaptor.setStyle(u, 'stroke-width', '3');
      }
    }

    return adaptor.outerHTML(node);
  };
}

// Safely get global object
const _global =
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
      ? global
      : typeof self !== 'undefined'
        ? self
        : {};

// Expose the plugin to the window object (with re-entrancy protection)
_global.ObsidianWechatMath = (md, options) => {
  try {
    const texConfig = Object.assign(
      {
        packages: CORE_PACKAGES,
        inlineMath: [
          ['$', '$'],
          ['\\(', '\\)'],
        ],
        displayMath: [
          ['$$', '$$'],
          ['\\[', '\\]'],
        ],
      },
      options?.tex
    );

    const svgConfig = Object.assign(
      {
        fontCache: 'none', // Crucial for WeChat compatibility
        scale: 1,
        displayAlign: 'center',
        displayIndent: '0',
      },
      options?.svg
    );

    const documentOptions = {
      InputJax: new TeX(texConfig),
      OutputJax: new SVG(svgConfig),
    };

    const render = createRenderMath(documentOptions);

    md.inline.ruler.after('escape', 'math_inline', math_inline);
    md.block.ruler.after('blockquote', 'math_block', math_block, {
      alt: ['paragraph', 'reference', 'blockquote', 'list'],
    });

    md.renderer.rules.math_inline = (tokens, idx) => render(tokens[idx].content, false);
    md.renderer.rules.math_block = (tokens, idx) => render(tokens[idx].content, true);
  } catch (e) {
    console.error('MathJax3 Plugin: Registration failed', e);
  }
};
