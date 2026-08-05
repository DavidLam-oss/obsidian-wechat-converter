/*
## 核心功能

为 Vitest 和 Node 测试环境提供 Obsidian API mock，隔离真实 Obsidian 客户端依赖。

## 输入

接收测试用例对 Obsidian 类、Notice、requestUrl、DOM helper 和插件基类的调用。

## 输出

对外暴露可被测试导入的 Obsidian 兼容 mock、调用记录和重置工具。

## 定位

位于 __mocks__，只服务测试运行时，不承载生产插件逻辑。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 __mocks__ 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// __mocks__/obsidian.js
//
// Extra over the bare-minimum stub:
// - Setting: fully chainable, records every setName(...) into a per-process
//   registry that tests can reset. addToggle/addText/addButton/addDropdown
//   receive a Proxy that swallows any chain call so onChange callbacks etc.
//   can be wired without throwing.
// - Modal: provides an obsidian-like contentEl/titleEl/modalEl that already
//   has the Obsidian DOM extension methods, matching sync_modal_ui.test.js
//   pattern.
// - createFragment: installed as a globalThis fallback because input.js
//   references it as a bare global (Obsidian runtime injects it).

if (!globalThis.__obsidianSettingNamesRegistry) {
  globalThis.__obsidianSettingNamesRegistry = [];
}
if (!globalThis.__obsidianButtonRegistry) {
  globalThis.__obsidianButtonRegistry = [];
}
if (!globalThis.__obsidianModalRegistry) {
  globalThis.__obsidianModalRegistry = [];
}
if (!globalThis.__obsidianNoticeRegistry) {
  globalThis.__obsidianNoticeRegistry = [];
}
if (!globalThis.__obsidianSettingInstancesRegistry) {
  globalThis.__obsidianSettingInstancesRegistry = [];
}

// Sentinel exposed on globalThis so tests can assert that the resolver patch
// is wired up correctly: `expect(globalThis.__obsidianMockLoaded).toBe(true)`.
globalThis.__obsidianMockLoaded = true;

function makeChainProxy() {
  const target = function () { return makeChainProxy(); };
  target.then = undefined; // avoid being treated as a thenable
  return new Proxy(target, {
    get(_, prop) {
      if (prop === 'then') return undefined;
      return () => makeChainProxy();
    },
    apply() { return makeChainProxy(); },
  });
}

function makeButtonMock() {
  const button = {
    text: '',
    disabled: false,
    clickHandler: null,
    setButtonText(value) {
      this.text = String(value || '');
      return this;
    },
    setDisabled(value) {
      this.disabled = value === true;
      return this;
    },
    onClick(handler) {
      this.clickHandler = handler;
      return this;
    },
    setWarning() {
      this.warning = true;
      return this;
    },
    setCta() {
      this.cta = true;
      return this;
    },
    setTooltip() { return this; },
    then: undefined,
  };
  if (!globalThis.__obsidianDisableSetDestructiveForButtons) {
    button.setDestructive = function setDestructive() {
      this.destructive = true;
      return this;
    };
  }
  globalThis.__obsidianButtonRegistry.push(button);
  return button;
}

function applyExtensions(el) {
  if (el.__obsidianExtensionsApplied) return el;
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
  return el;
}

class SettingMock {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.name = '';
    this.nameEl = null;
    this.descEl = applyExtensions(document.createElement('div'));
    this.controlEl = applyExtensions(document.createElement('div'));
    globalThis.__obsidianSettingInstancesRegistry.push(this);
  }
  setName(name) {
    if (typeof name === 'string') {
      this.name = name;
      globalThis.__obsidianSettingNamesRegistry.push(name);
    }
    return this;
  }
  setDesc(description) {
    this.description = description;
    // Obsidian 1.13.4 stringifies DocumentFragment descriptions instead of
    // inserting their child nodes. Keep that behavior in the mock so settings
    // UI tests catch accidental regressions back to setDesc(fragment).
    this.descEl.setText(description);
    globalThis.__obsidianSettingDescriptionsRegistry?.push(this.descEl);
    return this;
  }
  setHeading() { return this; }
  setClass() { return this; }
  setTooltip() { return this; }
  addToggle(cb) { if (cb) cb(makeChainProxy()); return this; }
  addText(cb) { if (cb) cb(makeChainProxy()); return this; }
  addTextArea(cb) { if (cb) cb(makeChainProxy()); return this; }
  addButton(cb) { if (cb) cb(makeButtonMock()); return this; }
  addDropdown(cb) { if (cb) cb(makeChainProxy()); return this; }
  addSlider(cb) { if (cb) cb(makeChainProxy()); return this; }
  addColorPicker(cb) { if (cb) cb(makeChainProxy()); return this; }
  addExtraButton(cb) { if (cb) cb(makeChainProxy()); return this; }
  addSearch(cb) { if (cb) cb(makeChainProxy()); return this; }
  then() { return this; }
}

class ModalMock {
  constructor(app) {
    this.app = app;
    this.titleEl = applyExtensions(document.createElement('h2'));
    this.contentEl = applyExtensions(document.createElement('div'));
    this.modalEl = applyExtensions(document.createElement('div'));
    globalThis.__obsidianModalRegistry.push(this);
  }
  open() { this.isOpen = true; }
  close() {
    const wasOpen = this.isOpen;
    this.isOpen = false;
    if (wasOpen && typeof this.onClose === 'function') {
      this.onClose();
    }
  }
  onOpen() {}
  onClose() {}
}

// createFragment is referenced as a runtime global in input.js (Obsidian
// injects it). Polyfill once when the mock is required.
if (typeof globalThis.createFragment !== 'function') {
  globalThis.createFragment = (cb) => {
    const frag = applyExtensions(document.createElement('div'));
    if (typeof cb === 'function') cb(frag);
    return frag;
  };
}

module.exports = {
  Plugin: class {},
  // NOTE: Intentionally NOT exporting Platform. input.js's isMobileClient()
  // checks `Platform?.isMobile` first and only falls back to `app.isMobile`
  // if Platform is undefined. Tests like sync_modal_ui / view_parity rely
  // on the fallback to drive mobile-mode behavior via the fake `view.app`.
  ItemView: class {
    constructor() {
      this.containerEl = applyExtensions(document.createElement('div'));
    }
  },
  Notice: class {
    constructor(message = '', duration = 0) {
      this.message = message;
      this.duration = duration;
      globalThis.__obsidianNoticeRegistry.push({ message, duration, instance: this });
    }
    setMessage(message) { this.message = message; }
    hide() { this.hidden = true; }
  },
  MarkdownView: class {},
  MarkdownRenderer: {
    async renderMarkdown(markdown, el) {
      const safe = String(markdown || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      el.innerHTML = `<p>${safe}</p>`;
    },
  },
  PluginSettingTab: class {
    constructor(app, plugin) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = applyExtensions(document.createElement('div'));
    }
  },
  Setting: SettingMock,
  Modal: ModalMock,
  requestUrl: async () => ({ json: {}, status: 200, headers: {} }),
  request: async () => '',
  setIcon: () => {},
  __applyExtensions: applyExtensions,
};
