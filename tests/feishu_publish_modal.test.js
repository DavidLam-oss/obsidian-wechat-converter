/*
## 核心功能

覆盖 feishu publish modal 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 feishu publish modal 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/feishu-sync.js', () => ({
  syncNoteToFeishu: vi.fn(),
}));

const obsidian = require('obsidian');
const { __applyExtensions: applyExtensions } = obsidian;
const { syncNoteToFeishu } = await import('../services/feishu-sync.js');
const { renderFeishuPublishTab } = await import('../views/publish-modal/feishu.js');

class TestSetting {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.settingEl = applyExtensions(document.createElement('div'));
    this.settingEl.addClass('setting-item');
    containerEl.appendChild(this.settingEl);
  }

  setName(name) {
    this.settingEl.createEl('div', { text: name, cls: 'setting-item-name' });
    return this;
  }

  setDesc(desc) {
    this.settingEl.createEl('div', { text: desc, cls: 'setting-item-description' });
    return this;
  }

  addText(callback) {
    const input = applyExtensions(document.createElement('input'));
    this.settingEl.appendChild(input);
    const control = {
      setPlaceholder(value) {
        input.setAttribute('placeholder', String(value || ''));
        return control;
      },
      setValue(value) {
        input.value = String(value || '');
        return control;
      },
      onChange(handler) {
        input.oninput = () => handler(input.value);
        return control;
      },
    };
    callback(control);
    return this;
  }
}

class TestNotice {
  constructor(message = '', duration = 0) {
    this.message = message;
    this.duration = duration;
    this.hidden = false;
    globalThis.__feishuPublishNotices.push(this);
  }

  setMessage(message) {
    this.message = message;
  }

  hide() {
    this.hidden = true;
  }
}

function makeView() {
  const plugin = {
    settings: {
      feishuSync: {
        enabled: true,
        appId: 'app-id',
        appSecret: 'app-secret',
        folderToken: 'folder-token',
        userId: 'ou-user',
        uploadHistory: [],
        mermaidPreferences: {},
      },
    },
    saveSettings: vi.fn(),
    openExternalUrl: vi.fn(),
  };

  return {
    plugin,
    app: {
      vault: {
        read: vi.fn(async () => '# Feishu Test'),
      },
    },
    getPublishContextFile: vi.fn(() => ({
      path: 'notes/feishu-test.md',
      basename: '飞书测试',
    })),
    showSyncModal: vi.fn(),
    showMultiPlatformSyncModal: vi.fn(),
    openPluginSettings: vi.fn(),
  };
}

describe('Feishu publish modal UX', () => {
  beforeEach(() => {
    globalThis.__feishuPublishNotices = [];
    syncNoteToFeishu.mockReset();
    navigator.clipboard = {
      writeText: vi.fn(async () => undefined),
    };
  });

  it('uses Notice for in-progress updates and renders one clean result action area', async () => {
    syncNoteToFeishu.mockImplementation(async ({ onProgress }) => {
      onProgress('importing', '正在导入为飞书云文档...');
      return {
        title: '飞书测试',
        url: 'https://feishu.cn/docx/doc-token',
        docToken: 'doc-token',
        transferOwnerWarning: 'field_validation failed: very long raw api message',
        imageSummary: {
          uploaded: 1,
          skipped: 2,
          failed: 0,
          details: [],
        },
      };
    });

    const view = makeView();
    const modal = { close: vi.fn() };
    const containerEl = applyExtensions(document.createElement('div'));

    renderFeishuPublishTab(view, modal, containerEl, {
      obsidianApi: {
        Setting: TestSetting,
        Notice: TestNotice,
        requestUrl: vi.fn(),
      },
    });

    const syncBtn = Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '同步至飞书');
    await syncBtn.onclick();

    expect(globalThis.__feishuPublishNotices[0].message).toBe('正在导入为飞书云文档...');
    expect(globalThis.__feishuPublishNotices[0].hidden).toBe(true);
    expect(containerEl.querySelector('.wechat-feishu-progress')).toBeNull();

    const resultCard = containerEl.querySelector('.wechat-feishu-result-card');
    expect(resultCard.classList.contains('is-hidden')).toBe(false);
    expect(resultCard.textContent).toContain('同步完成');
    expect(resultCard.textContent).toContain('所有权转移未完成');
    expect(resultCard.textContent).toContain('有 2 张图片未完成同步处理');
    expect(resultCard.textContent).not.toContain('field_validation failed');
    expect(resultCard.textContent).not.toContain('飞书链接:');
    expect(resultCard.querySelector('a')).toBeNull();

    const actionButtons = Array.from(resultCard.querySelectorAll('button')).map((button) => button.textContent);
    expect(actionButtons).toEqual(['在浏览器中打开', '复制链接']);

    const shell = containerEl.querySelector('.wechat-feishu-publish-shell');
    const content = containerEl.querySelector('.wechat-feishu-publish-content');
    const buttonRow = containerEl.querySelector('.wechat-modal-buttons');
    expect(shell).not.toBeNull();
    expect(content).not.toBeNull();
    expect(buttonRow).not.toBeNull();
    expect(containerEl.classList.contains('wechat-feishu-modal-content')).toBe(true);
    expect(buttonRow.parentElement).toBe(shell);
    expect(content.contains(buttonRow)).toBe(false);
    content.dispatchEvent(new Event('scroll'));
    expect(content.classList.contains('is-scrolling')).toBe(true);
    expect(containerEl.textContent).not.toContain('发布设置');
    expect(containerEl.textContent).not.toContain('同步目标文件夹');
    expect(containerEl.textContent).not.toContain('Token: folder-token');
  });

  it('rebinds the current note to a pasted Feishu docx URL', async () => {
    const view = makeView();
    const modal = { close: vi.fn() };
    const containerEl = applyExtensions(document.createElement('div'));

    renderFeishuPublishTab(view, modal, containerEl, {
      obsidianApi: {
        Setting: TestSetting,
        Notice: TestNotice,
        requestUrl: vi.fn(),
      },
    });

    const rebindInput = containerEl.querySelector('.wechat-feishu-rebind-input');
    rebindInput.value = 'https://o7y2a6yi3x.feishu.cn/docx/FZJjdrUPIoMPUpxpOTVcOpdInIa?from=copy';
    const rebindBtn = Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '绑定已有文档');

    await rebindBtn.onclick();

    expect(view.plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(view.plugin.settings.feishuSync.uploadHistory[0]).toMatchObject({
      title: '飞书测试',
      url: 'https://o7y2a6yi3x.feishu.cn/docx/FZJjdrUPIoMPUpxpOTVcOpdInIa',
      docToken: 'FZJjdrUPIoMPUpxpOTVcOpdInIa',
      sourcePath: 'notes/feishu-test.md',
    });
    expect(globalThis.__feishuPublishNotices.at(-1).message).toBe('✅ 已重新绑定当前笔记的飞书文档');
    expect(containerEl.textContent).toContain('覆盖更新模式');
    expect(Array.from(containerEl.querySelectorAll('button')).some((button) => button.textContent === '更新至飞书')).toBe(true);
  });

  it('does not show Mermaid options or enable remote rendering when the note has no Mermaid fences', async () => {
    syncNoteToFeishu.mockResolvedValue({
      title: '飞书测试',
      url: 'https://feishu.cn/docx/doc-token',
      docToken: 'doc-token',
      imageSummary: { uploaded: 0, skipped: 0, failed: 0, details: [] },
    });

    const view = makeView();
    view.app.vault.read.mockResolvedValue('# No Mermaid\n正文');
    const modal = { close: vi.fn() };
    const containerEl = applyExtensions(document.createElement('div'));

    renderFeishuPublishTab(view, modal, containerEl, {
      obsidianApi: {
        Setting: TestSetting,
        Notice: TestNotice,
        requestUrl: vi.fn(),
      },
    });
    await Promise.resolve();

    expect(containerEl.querySelector('.wechat-feishu-mermaid-section').classList.contains('is-hidden')).toBe(true);

    const syncBtn = Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '同步至飞书');
    await syncBtn.onclick();

    expect(syncNoteToFeishu).toHaveBeenCalledWith(expect.objectContaining({
      mermaidRenderMode: 'source',
      mermaidRenderProvider: 'kroki',
    }));
    expect(view.plugin.settings.feishuSync.mermaidPreferences).toEqual({});
  });

  it('shows Mermaid options only for Mermaid notes and defaults to source mode', async () => {
    syncNoteToFeishu.mockResolvedValue({
      title: '飞书测试',
      url: 'https://feishu.cn/docx/doc-token',
      docToken: 'doc-token',
      imageSummary: { uploaded: 0, skipped: 0, failed: 0, details: [] },
    });

    const view = makeView();
    view.app.vault.read.mockResolvedValue('# Diagram\n```mermaid\ngraph TD\nA-->B\n```');
    const modal = { close: vi.fn() };
    const containerEl = applyExtensions(document.createElement('div'));

    renderFeishuPublishTab(view, modal, containerEl, {
      obsidianApi: {
        Setting: TestSetting,
        Notice: TestNotice,
        requestUrl: vi.fn(),
      },
    });
    await Promise.resolve();

    const mermaidSection = containerEl.querySelector('.wechat-feishu-mermaid-section');
    expect(mermaidSection.classList.contains('is-hidden')).toBe(false);
    expect(mermaidSection.textContent).toContain('检测到 1 个 Mermaid 图表');
    expect(mermaidSection.textContent).toContain('保留源码');
    expect(mermaidSection.textContent).toContain('Kroki');
    expect(mermaidSection.querySelector('input[value="source"]').checked).toBe(true);
    expect(mermaidSection.querySelector('.wechat-feishu-mermaid-privacy').classList.contains('is-hidden')).toBe(true);

    const syncBtn = Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '同步至飞书');
    await syncBtn.onclick();

    expect(syncNoteToFeishu).toHaveBeenCalledWith(expect.objectContaining({
      mermaidRenderMode: 'source',
      mermaidRenderProvider: 'kroki',
    }));
  });

  it('persists per-note Mermaid remote rendering preference only when requested', async () => {
    syncNoteToFeishu.mockResolvedValue({
      title: '飞书测试',
      url: 'https://feishu.cn/docx/doc-token',
      docToken: 'doc-token',
      imageSummary: { uploaded: 0, skipped: 0, failed: 0, details: [] },
    });

    const view = makeView();
    view.app.vault.read.mockResolvedValue('# Diagram\n```mermaid\ngraph TD\nA-->B\n```');
    const modal = { close: vi.fn() };
    const containerEl = applyExtensions(document.createElement('div'));

    renderFeishuPublishTab(view, modal, containerEl, {
      obsidianApi: {
        Setting: TestSetting,
        Notice: TestNotice,
        requestUrl: vi.fn(),
      },
    });
    await Promise.resolve();

    const remoteRadio = containerEl.querySelector('input[value="remote-image"]');
    remoteRadio.checked = true;
    remoteRadio.dispatchEvent(new Event('change'));
    const rememberInput = containerEl.querySelector('.wechat-feishu-mermaid-remember input');
    rememberInput.checked = true;
    rememberInput.dispatchEvent(new Event('change'));

    expect(containerEl.querySelector('.wechat-feishu-mermaid-privacy').classList.contains('is-hidden')).toBe(false);

    const syncBtn = Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '同步至飞书');
    await syncBtn.onclick();

    expect(syncNoteToFeishu).toHaveBeenCalledWith(expect.objectContaining({
      mermaidRenderMode: 'remote-image',
      mermaidRenderProvider: 'kroki',
    }));
    expect(view.plugin.settings.feishuSync.mermaidPreferences['notes/feishu-test.md']).toMatchObject({
      mode: 'remote-image',
      provider: 'kroki',
    });
    expect(view.plugin.saveSettings).toHaveBeenCalled();
  });

  it('clears an existing per-note Mermaid preference when remember is unchecked', async () => {
    syncNoteToFeishu.mockResolvedValue({
      title: '飞书测试',
      url: 'https://feishu.cn/docx/doc-token',
      docToken: 'doc-token',
      imageSummary: { uploaded: 0, skipped: 0, failed: 0, details: [] },
    });

    const view = makeView();
    view.plugin.settings.feishuSync.mermaidPreferences['notes/feishu-test.md'] = {
      mode: 'remote-image',
      provider: 'kroki',
      updatedAt: 123,
    };
    view.app.vault.read.mockResolvedValue('# Diagram\n```mermaid\ngraph TD\nA-->B\n```');
    const modal = { close: vi.fn() };
    const containerEl = applyExtensions(document.createElement('div'));

    renderFeishuPublishTab(view, modal, containerEl, {
      obsidianApi: {
        Setting: TestSetting,
        Notice: TestNotice,
        requestUrl: vi.fn(),
      },
    });
    await Promise.resolve();

    const remoteRadio = containerEl.querySelector('input[value="remote-image"]');
    const rememberInput = containerEl.querySelector('.wechat-feishu-mermaid-remember input');
    expect(remoteRadio.checked).toBe(true);
    expect(rememberInput.checked).toBe(true);

    rememberInput.checked = false;
    rememberInput.dispatchEvent(new Event('change'));

    const syncBtn = Array.from(containerEl.querySelectorAll('button'))
      .find((button) => button.textContent === '同步至飞书');
    await syncBtn.onclick();

    expect(syncNoteToFeishu).toHaveBeenCalledWith(expect.objectContaining({
      mermaidRenderMode: 'remote-image',
      mermaidRenderProvider: 'kroki',
    }));
    expect(view.plugin.settings.feishuSync.mermaidPreferences['notes/feishu-test.md']).toBeUndefined();
    expect(view.plugin.saveSettings).toHaveBeenCalled();
  });
});
