/* Regression coverage for the bundled renderer in Obsidian's MathJax 3/4 hosts.
 * Run the actual generated bundles in fresh browser/Electron-like VM contexts
 * so module caching cannot hide an import-time failure.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MarkdownIt = require('markdown-it');
const root = path.resolve(import.meta.dirname, '..');

function createHost(version) {
  if (!version) return undefined;
  const loader = Object.freeze(version.startsWith('3')
    ? { preLoad: vi.fn() }
    : { preLoaded: vi.fn() });
  return Object.freeze({
    version,
    loader,
    config: Object.freeze({ tex: Object.freeze({ macros: Object.freeze({ hostOnly: 'H' }) }) }),
    // Host font loading/typesetting may still be pending. Export must not wait
    // for, invoke or replace the host's promise-based renderer.
    startup: Object.freeze({ promise: new Promise(() => {}) }),
    tex2svgPromise: vi.fn(() => new Promise(() => {})),
    typesetPromise: vi.fn(() => new Promise(() => {})),
  });
}

function createContext(host, nodeHost = host) {
  const sandbox = { console, setTimeout, clearTimeout, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  sandbox.require = (name) => name === 'obsidian'
    ? require('../__mocks__/obsidian.js')
    : require(name);
  if (host !== undefined) sandbox.MathJax = host;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = { MathJax: nodeHost };
  return vm.createContext(sandbox);
}

function evaluate(context, file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

function assertHostUntouched(context, host) {
  expect(context.MathJax).toBe(host);
  if (!host) {
    expect(Object.hasOwn(context, 'MathJax')).toBe(false);
    return;
  }
  expect(host.loader.preLoad || host.loader.preLoaded).not.toHaveBeenCalled();
  expect(host.tex2svgPromise).not.toHaveBeenCalled();
  expect(host.typesetPromise).not.toHaveBeenCalled();
}

describe.each([undefined, '3.2.2', '4.1.3'])('isolated math bundle with host %s', (version) => {
  it('loads and exports inline/block SVG without touching the host or network', () => {
    const host = createHost(version);
    const context = createContext(host);
    context.fetch = vi.fn(() => { throw new Error('Unexpected network request'); });
    evaluate(context, 'lib/mathjax-plugin.js');
    const md = new MarkdownIt();
    context.ObsidianWechatMath(md);
    const html = md.render('Inline $E=mc^2$.\n\n$$\n\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}+\\int_0^1 x^2 dx\n$$');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const containers = doc.querySelectorAll('mjx-container');
    expect(containers).toHaveLength(2);
    expect(containers[0].getAttribute('display')).not.toBe('true');
    expect(containers[1].getAttribute('display')).toBe('true');
    expect(doc.querySelectorAll('svg')).toHaveLength(2);
    expect(doc.querySelectorAll('svg path').length).toBeGreaterThan(5);
    expect(doc.querySelector('svg use, svg image, mjx-merror')).toBeNull();
    expect(context.fetch).not.toHaveBeenCalled();
    assertHostUntouched(context, host);
    expect(context.global.MathJax).toBe(host);
  });

  it('evaluates the production plugin and exports its lifecycle', () => {
    const host = createHost(version);
    const context = createContext(host);
    evaluate(context, 'main.js');
    const Plugin = context.module.exports.default || context.module.exports;
    expect(typeof Plugin).toBe('function');
    expect(typeof Plugin.prototype.onload).toBe('function');
    expect(typeof context.ObsidianWechatMath).toBe('function');
    assertHostUntouched(context, host);
  });
});

it('isolates a separate Electron global.MathJax and supports repeated bundle loads', () => {
  const host = createHost('4.1.3');
  const nodeHost = createHost('3.2.2');
  const context = createContext(host, nodeHost);
  evaluate(context, 'lib/mathjax-plugin.js');
  evaluate(context, 'lib/mathjax-plugin.js');
  const md = new MarkdownIt();
  context.ObsidianWechatMath(md);
  expect(md.render('$\\frac{1}{2}$')).toContain('<svg');
  assertHostUntouched(context, host);
  expect(context.global.MathJax).toBe(nodeHost);
  expect(nodeHost.loader.preLoad).not.toHaveBeenCalled();
});
