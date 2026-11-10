/*
## 核心功能

覆盖 AI Provider 添加/编辑弹窗（ai-provider-modal）与下拉框样式的 Vitest 测试用例。

## 输入

接收 mock 的 SettingTab 环境、DOM 事件与样式表内容。

## 输出

输出自动化断言结果，保证下拉列表高度不被 Obsidian 截断、添加模型时不预填旧 sample 模型 ID。

## 定位

位于 tests/，是针对 AI Provider 设置弹窗界面的回归测试。

## 依赖

关键依赖：Vitest、`views/settings/ai-provider-modal.js`、`styles.css`。
*/

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import obsidian from 'obsidian';
import { obsidianApi } from '../services/obsidian-compat.js';
import { showEditAiProviderModal } from '../views/settings/ai-provider-modal.js';
import { wechatAccountModalMethods } from '../views/settings/wechat-account-modal.js';

const { __applyExtensions: applyExtensions } = obsidian;

describe('AI Provider Modal & Dropdown Styles', () => {
  let openedModals;

  beforeEach(() => {
    openedModals = [];
    class CapturingModal {
      constructor(app) {
        this.app = app;
        this.titleEl = applyExtensions(document.createElement('h2'));
        this.contentEl = applyExtensions(document.createElement('div'));
        this.modalEl = applyExtensions(document.createElement('div'));
        openedModals.push(this);
      }
      open() { this.isOpen = true; }
      close() { this.isOpen = false; }
    }
    obsidian.Modal = CapturingModal;
    obsidianApi.Modal = CapturingModal;
  });

  it('ensures styles.css has explicit height and min-height for wechat-form-select to prevent truncation', () => {
    const cssPath = path.resolve(__dirname, '../styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.wechat-form-select\s*\{[^}]*height:\s*38px;/);
    expect(css).toMatch(/\.wechat-form-select\s*\{[^}]*min-height:\s*38px;/);
    expect(css).toMatch(/select\.wechat-form-select[^}]*height:\s*38px;/);
  });

  it('initializes text and image model inputs with empty values and clear placeholders instead of sample model IDs', () => {
    const mockTab = {
      app: {},
      plugin: {
        settings: {
          ai: {
            providers: [],
          },
        },
        saveSettings: async () => ({ success: true }),
      },
    };

    showEditAiProviderModal(mockTab, null);
    const modal = openedModals[0];
    expect(modal).toBeDefined();

    const inputList = Array.from(modal.contentEl.querySelectorAll('input'));

    // 找到文本模型输入框和生图模型输入框
    const textModelInput = inputList.find((input) =>
      (input.getAttribute('placeholder') || '').includes('文本模型 ID')
    );
    const imgModelInput = inputList.find((input) =>
      (input.getAttribute('placeholder') || '').includes('生图模型 ID')
    );

    expect(textModelInput).toBeDefined();
    expect(imgModelInput).toBeDefined();

    // API Key 输入框应为单纯的 password 输入框，且不存在「显示/隐藏」切换按钮
    const apiKeyInput = inputList.find((input) => input.getAttribute('placeholder') === 'sk-...');
    expect(apiKeyInput).toBeDefined();
    expect(apiKeyInput.getAttribute('type')).toBe('password');
    const buttons = Array.from(modal.contentEl.querySelectorAll('button'));
    expect(buttons.some((btn) => btn.textContent === '显示' || btn.textContent === '隐藏')).toBe(false);

    // placeholder 不应该包含具体已过时的模型名（如 gpt-4.1-mini 或 FLUX）
    const textPlaceholder = textModelInput.getAttribute('placeholder') || '';
    const imgPlaceholder = imgModelInput.getAttribute('placeholder') || '';
    expect(textPlaceholder).not.toContain('gpt-4.1-mini');
    expect(textPlaceholder).not.toContain('deepseek-ai');
    expect(imgPlaceholder).not.toContain('dall-e-3');
    expect(imgPlaceholder).not.toContain('FLUX');
  });

  it('keeps model IDs empty when switching presets so users can provide their current models', () => {
    const mockTab = {
      app: {},
      plugin: {
        settings: {
          ai: {
            providers: [],
          },
        },
        saveSettings: async () => ({ success: true }),
      },
    };

    showEditAiProviderModal(mockTab, null);
    const modal = openedModals[0];

    const presetSelect = modal.contentEl.querySelector('select.wechat-form-select');
    expect(presetSelect).toBeDefined();

    const inputs = Array.from(modal.contentEl.querySelectorAll('input'));
    const textModelInput = inputs.find((input) => (input.getAttribute('placeholder') || '').includes('文本模型 ID'));
    const imgModelInput = inputs.find((input) => (input.getAttribute('placeholder') || '').includes('生图模型 ID'));

    expect(textModelInput).toBeDefined();
    expect(imgModelInput).toBeDefined();

    // 模拟选择 SiliconFlow 预设
    presetSelect.value = 'siliconflow';
    presetSelect.dispatchEvent(new Event('change'));

    // 预设应当保留模型 ID 为空，不强塞旧版本 sample 模型
    expect(textModelInput.value).toBe('');
    expect(imgModelInput.value).toBe('');
  });

  it('notifies user to fill in model ID when saving without one', async () => {
    globalThis.__obsidianNoticeRegistry = [];

    const mockTab = {
      app: {},
      plugin: {
        settings: {
          ai: {
            providers: [],
          },
        },
        saveSettings: async () => ({ success: true }),
      },
    };

    showEditAiProviderModal(mockTab, null);
    const modal = openedModals[0];

    const buttons = Array.from(modal.contentEl.querySelectorAll('button'));
    const saveBtn = buttons.find((btn) => btn.textContent === '保存');
    expect(saveBtn).toBeDefined();

    await saveBtn.onclick();

    const notices = globalThis.__obsidianNoticeRegistry;
    expect(notices.some((n) => n.message.includes('请填写文本模型 ID'))).toBe(true);
  });

  it('attaches wechat-form-modal class to modal element and ensures fixed-header/scrolling styles in styles.css', () => {
    const mockTab = {
      app: {},
      plugin: {
        settings: {
          ai: {
            providers: [],
          },
        },
        saveSettings: async () => ({ success: true }),
      },
    };

    showEditAiProviderModal(mockTab, null);
    const aiModal = openedModals[0];
    expect(aiModal.modalEl.classList.contains('wechat-form-modal')).toBe(true);
    expect(aiModal.contentEl.classList.contains('wechat-form-modal-content')).toBe(true);

    const mockAccountTab = {
      app: {},
      plugin: {
        settings: {
          wechatAccounts: [],
          defaultAccountId: '',
        },
        saveSettings: async () => ({ success: true }),
      },
    };
    wechatAccountModalMethods.showEditAccountModal.call(mockAccountTab, null);
    const accountModal = openedModals[1];
    expect(accountModal.modalEl.classList.contains('wechat-form-modal')).toBe(true);
    expect(accountModal.contentEl.classList.contains('wechat-form-modal-content')).toBe(true);

    const cssPath = path.resolve(__dirname, '../styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/div\.modal\.wechat-form-modal\s*\{[^}]*overflow:\s*hidden;/);
    expect(css).toMatch(/div\.modal\.wechat-form-modal\s*\{[^}]*display:\s*flex;/);
    expect(css).toMatch(/div\.modal\.wechat-form-modal\s*\{[^}]*flex-direction:\s*column;/);
    expect(css).toMatch(/div\.modal\.wechat-form-modal\s+\.modal-close-button\s*\{[^}]*position:\s*absolute;/);
    expect(css).toMatch(/div\.modal\.wechat-form-modal\s+\.modal-content[^{]*\{[^}]*overflow-y:\s*auto;/);
  });
});
