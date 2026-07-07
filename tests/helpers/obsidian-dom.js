/*
## 核心功能

提供测试辅助能力：obsidian dom。

## 输入

接收 Vitest/jsdom 测试上下文、mock 模块、插件源码路径或渲染 fixture。

## 输出

输出 `applyExtensions`、`createObsidianLikeElement`、`resetSettingNamesRegistry`、`getSettingNamesRegistry`，供 tests/ 下的测试用例复用。

## 定位

位于 tests/helpers/，只服务自动化测试，不参与生产插件运行时。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests/helpers 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// tests/helpers/obsidian-dom.js
//
// Helper for tests that need to render real Obsidian-style DOM trees and
// inspect them. The Obsidian runtime extends every element it owns with
// `empty`, `addClass`, `removeClass`, `setText`, `createEl`, `createDiv`,
// etc. JSDOM elements don't have these by default, so we install the same
// extensions before handing the element to plugin code.

function applyExtensions(el) {
  if (!el || el.__obsidianExtensionsApplied) return el;
  el.__obsidianExtensionsApplied = true;
  el.empty = function empty() {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
  el.addClass = function addClass(cls) {
    if (cls) this.classList.add(cls);
    return this;
  };
  el.removeClass = function removeClass(cls) {
    if (cls) this.classList.remove(cls);
    return this;
  };
  el.toggleClass = function toggleClass(cls, force) {
    if (cls) this.classList.toggle(cls, force);
    return this;
  };
  el.setText = function setText(text) {
    this.textContent = text == null ? '' : String(text);
  };
  el.appendText = function appendText(text) {
    this.appendChild(document.createTextNode(text == null ? '' : String(text)));
  };
  el.setCssStyles = function setCssStyles(styles = {}) {
    Object.entries(styles || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      this.style[key] = String(value);
    });
    return this;
  };
  el.createEl = function createEl(tag, opts = {}, callback) {
    const child = applyExtensions(document.createElement(tag));
    if (opts && typeof opts === 'object') {
      if (opts.cls) child.className = opts.cls;
      if (opts.text !== undefined) child.textContent = opts.text;
      if (opts.value !== undefined && 'value' in child) child.value = opts.value;
      if (opts.type !== undefined) child.setAttribute('type', String(opts.type));
      if (opts.placeholder !== undefined) child.setAttribute('placeholder', String(opts.placeholder));
      if (opts.title !== undefined) child.setAttribute('title', String(opts.title));
      if (opts.href && 'href' in child) child.href = opts.href;
      if (opts.attr && typeof opts.attr === 'object') {
        Object.entries(opts.attr).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          child.setAttribute(key, String(value));
        });
      }
    }
    this.appendChild(child);
    if (typeof callback === 'function') callback(child);
    return child;
  };
  el.createDiv = function createDiv(opts = {}, callback) {
    return this.createEl('div', opts, callback);
  };
  el.createSpan = function createSpan(opts = {}, callback) {
    return this.createEl('span', opts, callback);
  };
  el.createSvg = function createSvg(tag, opts = {}, callback) {
    const child = applyExtensions(
      document.createElementNS('http://www.w3.org/2000/svg', tag)
    );
    if (opts && typeof opts === 'object') {
      if (opts.cls) child.setAttribute('class', opts.cls);
      if (opts.attr && typeof opts.attr === 'object') {
        Object.entries(opts.attr).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          child.setAttribute(key, String(value));
        });
      }
    }
    this.appendChild(child);
    if (typeof callback === 'function') callback(child);
    return child;
  };
  return el;
}

function createObsidianLikeElement(tag = 'div') {
  return applyExtensions(document.createElement(tag));
}

function resetSettingNamesRegistry() {
  globalThis.__obsidianSettingNamesRegistry = [];
  return globalThis.__obsidianSettingNamesRegistry;
}

function getSettingNamesRegistry() {
  return globalThis.__obsidianSettingNamesRegistry || [];
}

module.exports = {
  applyExtensions,
  createObsidianLikeElement,
  resetSettingNamesRegistry,
  getSettingNamesRegistry,
};
