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
  validateCustomThemeToken,
  normalizeCustomThemeToken,
} from '../../services/theme-token-validator.js';
import {
  generateCustomThemeWithAi,
  hasRunnableTextProvider,
  buildThemePromptWithRequirement,
} from '../../services/ai-theme-generator.js';

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

    // 步骤 1：排版风格诉求与 AI 智能设计
    const step1 = bodyEl.createDiv({ cls: 'custom-theme-ai-step' });
    const step1Header = step1.createDiv({ cls: 'custom-theme-step-title' });
    step1Header.createEl('span', { text: '步骤 1：描述排版风格诉求并生成' });

    const reqTextarea = step1.createEl('textarea', {
      cls: 'custom-theme-req-textarea',
      placeholder: '输入您的主题风格诉求（如：“偏暖的秋日森林系，主色用琥珀黄或松针绿，整体温润克制，适合读书手记与深度长文”）...',
    });

    // 快捷灵感药丸标签
    const pillsRow = step1.createDiv({ cls: 'custom-theme-pills-row' });
    pillsRow.createEl('span', { cls: 'custom-theme-pills-label', text: '💡 灵感预设：' });

    const inspirationPills = [
      { label: '🍂 秋日森系', desc: '偏暖色调的秋日森林系，主色琥珀黄与松针绿，温润克制，适合户外与手记' },
      { label: '☕ 暖咖文艺', desc: '焦糖暖咖色调，主色复古咖啡棕与燕麦米白，适合文艺随笔与读书笔记' },
      { label: '💻 极客科技', desc: '现代深邃科技感，主色赛博深蓝与霓虹青，适合技术文档、代码与前沿观察' },
      { label: '🌿 极简雅致', desc: '极简素雅白灰黑，主色冷灰与黛青，禅意留白大标题，适合深度思考与散文' },
      { label: '🧧 喜庆节日', desc: '东方传统喜庆中国红与暖金配比，端庄典雅，适合节日献礼与大事件发布' },
    ];

    inspirationPills.forEach((pill) => {
      const btn = pillsRow.createEl('button', {
        cls: 'custom-theme-pill-btn',
        text: pill.label,
      });
      btn.onclick = () => {
        reqTextarea.value = pill.desc;
        reqTextarea.focus();
      };
    });

    // 双通道按钮栏
    const btnRow = step1.createDiv({ cls: 'custom-theme-btn-row' });

    const hasAiModel = hasRunnableTextProvider(plugin.settings?.ai);
    const aiGenBtn = btnRow.createEl('button', {
      cls: 'custom-theme-ai-gen-btn',
      text: '✨ 调用 AI 智能生成',
    });
    if (!hasAiModel) {
      aiGenBtn.title = '未检测到已配置的文本模型 API，点击可查看指引';
    }

    const copyPromptBtn = btnRow.createEl('button', {
      cls: 'custom-theme-copy-prompt-btn-secondary',
      text: '📋 复制提示词 (发给外部 AI)',
    });

    copyPromptBtn.onclick = async () => {
      const promptToCopy = buildThemePromptWithRequirement(reqTextarea.value);
      const ok = await writeClipboardText(promptToCopy);
      if (ok) {
        new Notice('AI 提示词已复制！已附带您的个性化诉求，可直接粘贴给 ChatGPT、DeepSeek、Claude 或 Kimi');
      } else {
        new Notice('复制失败，请检查剪贴板权限');
      }
    };

    // 步骤 2：主题 JSON 配置与校验
    const step2 = bodyEl.createDiv({ cls: 'custom-theme-ai-step' });
    const step2Header = step2.createDiv({ cls: 'custom-theme-step-title' });
    step2Header.createEl('span', { text: '步骤 2：检查/微调主题 JSON 配置' });

    // 实时主题轻量预览卡片
    const previewCard = step2.createDiv({ cls: 'custom-theme-preview-card is-hidden' });
    const previewInfo = previewCard.createDiv({ cls: 'custom-theme-preview-info' });
    const previewSwatch = previewInfo.createDiv({ cls: 'custom-theme-color-swatch' });
    const previewName = previewInfo.createEl('span', { cls: 'custom-theme-preview-name' });
    const previewHeadingTag = previewInfo.createEl('span', { cls: 'custom-theme-preview-tag' });
    const previewIdTag = previewInfo.createEl('span', { cls: 'custom-theme-preview-tag' });

    /** @param {any} token */
    const updatePreviewCard = (token) => {
      if (token && token.colors?.accent) {
        previewCard.removeClass('is-hidden');
        previewSwatch.setCssStyles({
          backgroundColor: token.colors.accent,
        });
        previewName.setText(token.name || '未命名主题');
        previewHeadingTag.setText(`标题: ${token.headingStyle || 'default'}`);
        previewIdTag.setText(`ID: ${token.id}`);
      } else {
        previewCard.addClass('is-hidden');
      }
    };

    const textarea = step2.createEl('textarea', {
      cls: 'custom-theme-json-textarea',
      placeholder: '{\n  "id": "my-brand",\n  "name": "品牌专属风",\n  "colors": {\n    "accent": "#007AFF",\n    "light": "#F2F5FB",\n    "title": "#1D1D1F"\n  }\n}',
    });

    textarea.addEventListener('input', () => {
      const val = validateCustomThemeToken(textarea.value);
      if (val.valid && val.token) {
        updatePreviewCard(val.token);
      } else {
        previewCard.addClass('is-hidden');
      }
    });

    if (editingInitialJson) {
      textarea.value = editingInitialJson;
      editingInitialJson = '';
      const initialVal = validateCustomThemeToken(textarea.value);
      if (initialVal.valid && initialVal.token) {
        updatePreviewCard(initialVal.token);
      }
    }

    // 错误信息显示区（默认隐藏）
    const errorBox = step2.createDiv({ cls: 'custom-theme-error-box is-hidden' });

    // 点击 AI 智能生成
    aiGenBtn.onclick = async () => {
      if (!hasRunnableTextProvider(plugin.settings?.ai)) {
        new Notice('请先在插件设置的「AI 自动排版」中配置可用的文本模型（如 DeepSeek、OpenAI、SiliconFlow 等）');
        return;
      }

      errorBox.empty();
      errorBox.addClass('is-hidden');
      aiGenBtn.disabled = true;
      aiGenBtn.setText('AI 正在构思与设计中...');

      try {
        const result = await generateCustomThemeWithAi({
          aiSettings: plugin.settings?.ai,
          userRequirement: reqTextarea.value,
        });

        if (result.success && result.token && result.json) {
          textarea.value = result.json;
          updatePreviewCard(result.token);
          new Notice(`🎉 AI 已成功为您设计主题「${result.token.name}」！请检查下方配置`);
        } else {
          errorBox.removeClass('is-hidden');
          errorBox.createEl('strong', { text: 'AI 生成未成功：' });
          const ul = errorBox.createEl('ul');
          ul.createEl('li', { text: result.error || '未知错误' });
          new Notice(`AI 生成失败: ${result.error || '请重试'}`);
        }
      } catch (err) {
        errorBox.removeClass('is-hidden');
        const msg = err instanceof Error ? err.message : String(err);
        errorBox.createEl('strong', { text: '调用异常：' + msg });
      } finally {
        aiGenBtn.disabled = false;
        aiGenBtn.setText('✨ 调用 AI 智能生成');
      }
    };

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
