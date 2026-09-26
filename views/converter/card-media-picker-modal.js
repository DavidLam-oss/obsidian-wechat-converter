/**
 * ## 核心功能

小红书卡片封面独立选图工作台（Media Picker Modal）宿主弹窗。
承载 Tab 状态机调度（Unsplash 摄影 / 笔记与本地 / AI 生图）、尺寸自适应与图片选定落地回调。

## 设计原则

- 严格遵守无 emoji 规范；
- 遵守单文件软线 800 行约束；
- 使用 Obsidian 原生 Modal 与 DOM 操作 API（无 innerHTML）。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: Modal and view instances untyped in pure JS */

import { createObsidianModal } from '../apple-style-view-shared.js';
import { renderUnsplashMediaPickerTab } from './card-media-picker-unsplash.js';
import { renderNoteMediaPickerTab } from './card-media-picker-note.js';
import { renderAiMediaPickerTab } from './card-media-picker-ai.js';

let lastActiveTabId = 'unsplash';

/**
 * 弹出封面独立选图工作台
 * @param {object} options
 * @param {any} options.view AppleStyleView 实例
 * @param {string} [options.initialTab] 初始 Tab ID ('unsplash' | 'note' | 'ai')
 * @param {(result: { dataUrl: string, source: string }) => void} options.onSelect 选定图片后的回调
 */
export function showCardMediaPickerModal({ view, initialTab, onSelect }) {
  const modal = createObsidianModal(view.app);
  modal.modalEl.addClass('card-media-picker-modal');

  // 清空默认内边距
  modal.contentEl.empty();

  // 1. 顶部 Header 与 Tab 切换器
  const header = modal.contentEl.createDiv({ cls: 'card-media-picker-header' });
  header.createDiv({ cls: 'card-media-picker-title', text: '选择封面配图' });

  const tabsWrap = header.createDiv({ cls: 'card-media-picker-tabs' });
  const tabs = [
    { id: 'unsplash', label: 'Unsplash 摄影' },
    { id: 'note', label: '笔记与本地' },
    { id: 'ai', label: 'AI 生图' },
  ];

  let currentTab = initialTab || lastActiveTabId || 'unsplash';

  // 2. 主体内容容器
  const contentContainer = modal.contentEl.createDiv({ cls: 'card-media-picker-content' });

  const openPluginSettings = () => {
    modal.close();
    const settingApi = view.app?.setting;
    if (settingApi && typeof settingApi.open === 'function') {
      settingApi.open();
      const tabId = view.plugin?.manifest?.id || 'obsidian-wechat-converter';
      if (typeof settingApi.openTabById === 'function') {
        settingApi.openTabById(tabId);
      }
    }
  };

  const handleSelect = (result) => {
    if (typeof onSelect === 'function') {
      onSelect(result);
    }
    modal.close();
  };

  const tabButtons = [];

  const switchTab = (tabId) => {
    currentTab = tabId;
    lastActiveTabId = tabId;

    tabButtons.forEach(({ id, btn }) => {
      if (id === tabId) {
        btn.addClass('is-active');
      } else {
        btn.removeClass('is-active');
      }
    });

    const currentLayout = view.getCurrentCardLayoutSettings?.() || {};
    const ratioId = currentLayout.ratioId || '3:4';

    if (tabId === 'unsplash') {
      renderUnsplashMediaPickerTab({
        container: contentContainer,
        view,
        ratioId,
        onSelect: handleSelect,
        onOpenSettings: openPluginSettings,
      });
    } else if (tabId === 'note') {
      renderNoteMediaPickerTab({
        container: contentContainer,
        view,
        onSelect: handleSelect,
      });
    } else if (tabId === 'ai') {
      renderAiMediaPickerTab({
        container: contentContainer,
        view,
        ratioId,
        onSelect: handleSelect,
        onOpenSettings: openPluginSettings,
      });
    }
  };

  tabs.forEach((item) => {
    const btn = tabsWrap.createEl('button', {
      cls: `card-media-picker-tab-btn ${item.id === currentTab ? 'is-active' : ''}`,
      text: item.label,
      attr: { type: 'button' },
    });
    btn.addEventListener('click', () => switchTab(item.id));
    tabButtons.push({ id: item.id, btn });
  });

  // 初始渲染当前 Tab
  switchTab(currentTab);

  modal.open();
}
