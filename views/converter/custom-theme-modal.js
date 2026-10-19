/*
## 核心功能

自定义主题管理器 Modal 弹窗：支持查看已保存主题、应用主题、复制 Token JSON、
删除自定义主题、一键复制 AI 生成提示词，以及粘贴 JSON 校验并保存。

## 输入

接收 Obsidian App 实例、插件实例以及主题应用回调函数 `onThemeApplied`。

## 输出

输出 `showCustomThemeModal({ app, plugin, onThemeApplied })` 函数。

## 定位

位于 views/converter/，属于视图交互层。
底层校验依托 services/theme-token-validator.js，适配依托 services/custom-theme-adapter.js。

## 维护规则

- 禁止使用 innerHTML，所有 DOM 节点使用 Obsidian 原生 createEl / createDiv 构建。
- 禁止使用 element.style.xxx 直接赋值，动态属性统一通过 setCssStyles 设置。
- 禁止调用 clipboard.read / clipboard.readText，只写不读。
- 文件行数控制在 800 行以内。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: Obsidian Modal and plugin contracts are dynamically typed in view layer */

import {
  createObsidianModal,
  Notice,
} from '../apple-style-view-shared.js';
import { writeClipboardText } from '../shared/clipboard.js';
import {
  AI_THEME_PROMPT_TEMPLATE,
  validateCustomThemeToken,
  normalizeCustomThemeToken,
} from '../../services/theme-token-validator.js';

/**
 * 打开自定义主题管理弹窗
 *
 * @param {{
 *   app: any,
 *   plugin: any,
 *   onThemeApplied?: (themeId: string) => void,
 * }} options
 */
export function showCustomThemeModal({ app, plugin, onThemeApplied }) {
  const modal = createObsidianModal(app);
  modal.modalEl.addClass('custom-theme-modal');

  /** @type {string} */
  let editingInitialJson = '';

  const header = modal.contentEl.createDiv({ cls: 'custom-theme-header' });
  header.createDiv({ cls: 'custom-theme-title', text: '自定义排版主题' });

  const tabsContainer = header.createDiv({ cls: 'custom-theme-tabs' });
  const listTabBtn = tabsContainer.createEl('button', {
    cls: 'custom-theme-tab-btn is-active',
    text: '已保存主题',
  });
  const importTabBtn = tabsContainer.createEl('button', {
    cls: 'custom-theme-tab-btn',
    text: 'AI 生成 / 导入',
  });

  const bodyEl = modal.contentEl.createDiv({ cls: 'custom-theme-body' });

  /**
   * 切换 Tab
   * @param {'list' | 'import'} tab
   */
  const switchTab = (tab) => {
    if (tab === 'list') {
      listTabBtn.addClass('is-active');
      importTabBtn.removeClass('is-active');
      renderListView();
    } else {
      importTabBtn.addClass('is-active');
      listTabBtn.removeClass('is-active');
      renderImportView();
    }
  };

  listTabBtn.onclick = () => switchTab('list');
  importTabBtn.onclick = () => switchTab('import');

  /**
   * 渲染已保存主题列表
   */
  function renderListView() {
    bodyEl.empty();
    const customThemes = Array.isArray(plugin.settings?.customThemes)
      ? plugin.settings.customThemes
      : [];

    if (customThemes.length === 0) {
      const emptyBox = bodyEl.createDiv({ cls: 'custom-theme-empty' });
      emptyBox.createEl('div', {
        text: '暂无自定义主题',
        cls: 'custom-theme-empty-title',
      });
      const promptBtn = emptyBox.createEl('button', {
        cls: 'mod-cta',
        text: '从 AI 生成或导入一个主题',
      });
      promptBtn.onclick = () => switchTab('import');
      return;
    }

    const listEl = bodyEl.createDiv({ cls: 'custom-theme-list' });

    customThemes.forEach((theme) => {
      const card = listEl.createDiv({ cls: 'custom-theme-card' });
      const topRow = card.createDiv({ cls: 'custom-theme-card-top' });

      const titleRow = topRow.createDiv({ cls: 'custom-theme-card-title-row' });
      titleRow.createEl('span', { cls: 'custom-theme-card-name', text: theme.name || theme.id });

      const isActive = plugin.settings?.theme === theme.id;
      if (isActive) {
        titleRow.createEl('span', { cls: 'custom-theme-card-active-tag', text: '当前使用中' });
      }

      const actions = topRow.createDiv({ cls: 'custom-theme-card-actions' });

      // 应用按钮
      if (!isActive) {
        const applyBtn = actions.createEl('button', { cls: 'mod-cta', text: '应用' });
        applyBtn.onclick = async () => {
          plugin.settings.theme = theme.id;
          await plugin.saveSettings();
          if (typeof onThemeApplied === 'function') {
            onThemeApplied(theme.id);
          }
          new Notice(`已应用自定义主题：${theme.name || theme.id}`);
          renderListView();
        };
      }

      // 复制 Token JSON
      const copyBtn = actions.createEl('button', { text: '复制 Token' });
      copyBtn.onclick = async () => {
        const success = await writeClipboardText(JSON.stringify(theme, null, 2));
        if (success) {
          new Notice('主题 Token 已复制到剪贴板');
        } else {
          new Notice('复制失败，请检查剪贴板权限');
        }
      };

      // 编辑
      const editBtn = actions.createEl('button', { text: '编辑' });
      editBtn.onclick = () => {
        editingInitialJson = JSON.stringify(theme, null, 2);
        switchTab('import');
      };

      // 删除
      const deleteBtn = actions.createEl('button', { cls: 'mod-warning', text: '删除' });
      deleteBtn.onclick = async () => {
        const nextThemes = customThemes.filter((t) => t.id !== theme.id);
        plugin.settings.customThemes = nextThemes;
        if (plugin.settings.theme === theme.id) {
          plugin.settings.theme = 'github';
          if (typeof onThemeApplied === 'function') {
            onThemeApplied('github');
          }
          new Notice('已删除当前使用的主题，已重置为默认「简约」主题');
        } else {
          new Notice(`已删除主题：${theme.name || theme.id}`);
        }
        await plugin.saveSettings();
        renderListView();
      };

      // 描述
      if (theme.description) {
        card.createDiv({ cls: 'custom-theme-card-desc', text: theme.description });
      }

      // 色彩预览条
      const paletteStrip = card.createDiv({ cls: 'custom-theme-palette-strip' });
      const colors = [
        { label: '主色', value: theme.colors?.accent },
        { label: '浅色底', value: theme.colors?.light },
        { label: '标题', value: theme.colors?.title },
        { label: '边框', value: theme.colors?.border },
      ];

      colors.forEach((c) => {
        if (!c.value) return;
        const swatch = paletteStrip.createDiv({ cls: 'custom-theme-color-swatch' });
        swatch.setCssStyles({ backgroundColor: c.value });
        swatch.setAttribute('title', `${c.label}: ${c.value}`);
      });

      const meta = paletteStrip.createDiv({ cls: 'custom-theme-palette-meta' });
      if (theme.typography?.headingStyle) {
        meta.createEl('span', { text: `标题: ${theme.typography.headingStyle}` });
      }
      if (theme.id) {
        meta.createEl('span', { text: `ID: ${theme.id}` });
      }
    });
  }

  /**
   * 渲染 AI 生成 / 导入视图
   */
  function renderImportView() {
    bodyEl.empty();

    // 步骤 1：复制 AI 提示词
    const step1 = bodyEl.createDiv({ cls: 'custom-theme-ai-step' });
    const step1Header = step1.createDiv({ cls: 'custom-theme-step-title' });
    step1Header.createEl('span', { text: '步骤 1：复制 AI 提示词并发送给 AI' });

    const copyPromptBtn = step1Header.createEl('button', {
      cls: 'custom-theme-copy-prompt-btn',
      text: '一键复制 AI 提示词',
    });
    copyPromptBtn.onclick = async () => {
      const ok = await writeClipboardText(AI_THEME_PROMPT_TEMPLATE);
      if (ok) {
        new Notice('AI 提示词已复制！请在发送给 AI 时补充您的个性化要求（如主色调、文风）');
      } else {
        new Notice('复制失败，请检查剪贴板权限');
      }
    };

    step1.createDiv({
      cls: 'custom-theme-card-desc',
      text: '点击上方复制标准提示词并发送给 AI（如 DeepSeek、ChatGPT、Claude、Kimi 等）。建议在提示词末尾写上您的个性化风格要求（例如：“偏暖的秋日森林系”、“沉稳极简黑白灰”），AI 生成后将纯 JSON 代码粘贴在下方即可。',
    });

    // 步骤 2：粘贴 JSON
    const step2 = bodyEl.createDiv({ cls: 'custom-theme-ai-step' });
    const step2Header = step2.createDiv({ cls: 'custom-theme-step-title' });
    step2Header.createEl('span', { text: '步骤 2：粘贴主题 JSON 配置' });

    const textarea = step2.createEl('textarea', {
      cls: 'custom-theme-json-textarea',
      placeholder: '{\n  "id": "my-brand",\n  "name": "品牌专属风",\n  "colors": {\n    "accent": "#007AFF",\n    "light": "#F2F5FB",\n    "title": "#1D1D1F"\n  }\n}',
    });

    if (editingInitialJson) {
      textarea.value = editingInitialJson;
      editingInitialJson = '';
    }

    // 错误信息显示区（默认隐藏）
    const errorBox = step2.createDiv({ cls: 'custom-theme-error-box is-hidden' });

    // 底部操作按钮
    const actions = step2.createDiv({ cls: 'custom-theme-ai-actions' });

    const cancelBtn = actions.createEl('button', { text: '返回列表' });
    cancelBtn.onclick = () => switchTab('list');

    const saveBtn = actions.createEl('button', {
      cls: 'mod-cta',
      text: '校验并保存主题',
    });

    saveBtn.onclick = async () => {
      errorBox.empty();
      errorBox.addClass('is-hidden');

      const validation = validateCustomThemeToken(textarea.value);
      if (!validation.valid || !validation.token) {
        errorBox.removeClass('is-hidden');
        errorBox.createEl('strong', { text: '配置校验未通过：' });
        const list = errorBox.createEl('ul');
        validation.errors.forEach((err) => {
          list.createEl('li', { text: err });
        });
        return;
      }

      const normalized = normalizeCustomThemeToken(validation.token);
      const existingThemes = Array.isArray(plugin.settings?.customThemes)
        ? [...plugin.settings.customThemes]
        : [];

      const matchIdx = existingThemes.findIndex((t) => t.id === normalized.id);
      if (matchIdx >= 0) {
        existingThemes[matchIdx] = normalized;
      } else {
        existingThemes.push(normalized);
      }

      plugin.settings.customThemes = existingThemes;
      plugin.settings.theme = normalized.id;
      await plugin.saveSettings();

      if (typeof onThemeApplied === 'function') {
        onThemeApplied(normalized.id);
      }

      new Notice(`自定义主题「${normalized.name}」已成功保存并应用！`);
      switchTab('list');
    };
  }

  // 初始渲染
  renderListView();
  modal.open();
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: close the scoped disable block above */
