/**
 * ## 核心功能

小红书卡片选图工作台之「AI 灵感生图」Tab 内容构建与交互。
提供多风格可视化画廊卡片、自适应 Prompt 解析生成与异步大图预览采纳。

## 设计原则

- 严格遵守无 emoji 规范；
- 遵守单文件软线 800 行约束；
- 使用 Obsidian DOM 操作 API（无 innerHTML）。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: view and plugin settings untyped in pure JS */

import { Notice } from '../apple-style-view-shared.js';
import {
  AI_CARD_COVER_STYLES,
  resolveCardCoverPrompt,
  generateCardCoverImage,
} from '../../services/card-ai-image.js';
import {
  resolveImageAiProvider,
  isAiProviderRunnable,
} from '../../services/ai-layout/providers.js';

/**
 * 构建 AI 灵感生图 Tab
 * @param {object} options
 * @param {HTMLElement} options.container 宿主内容容器
 * @param {any} options.view AppleStyleView 实例
 * @param {string} options.ratioId 当前卡片比例 ID
 * @param {(result: { dataUrl: string, source: string }) => void} options.onSelect 选中图片回调
 * @param {() => void} options.onOpenSettings 打开设置回调
 */
export function renderAiMediaPickerTab({ container, view, ratioId, onSelect, onOpenSettings }) {
  container.empty();

  const aiSettings = view.plugin?.settings?.ai;
  const imageProvider = resolveImageAiProvider(aiSettings);
  const isRunnable = isAiProviderRunnable(imageProvider, 'image');

  if (!isRunnable) {
    const emptyBox = container.createDiv({ cls: 'card-media-picker-empty' });
    emptyBox.createDiv({ cls: 'card-media-picker-empty-title', text: '尚未配置可用的 AI 生图服务商' });
    emptyBox.createDiv({
      cls: 'card-media-picker-empty-desc',
      text: '请前往插件设置「AI 服务」，在 AI Provider 中勾选开启「生图模型」能力并配置对应的 API Key。',
    });
    const setBtn = emptyBox.createEl('button', {
      cls: 'mod-cta',
      text: '前往设置配置生图模型',
    });
    setBtn.addEventListener('click', () => {
      if (typeof onOpenSettings === 'function') {
        onOpenSettings();
      }
    });
    return;
  }

  // 1. 风格预设画廊
  container.createDiv({ cls: 'card-media-picker-section-title', text: '预设画面风格' });
  const stylesGrid = container.createDiv({ cls: 'card-media-picker-ai-styles' });

  const session = typeof view.getCardSettingsSession === 'function' ? view.getCardSettingsSession() : null;
  const currentCoverFields = session?.getCoverFields?.() || {};
  let selectedStyleId = currentCoverFields.aiCoverStyleId || AI_CARD_COVER_STYLES[0].id;

  const styleCards = [];
  AI_CARD_COVER_STYLES.forEach((style) => {
    const card = stylesGrid.createDiv({
      cls: `card-media-picker-ai-card ${style.id === selectedStyleId ? 'is-selected' : ''}`,
    });
    card.createDiv({ cls: 'card-media-picker-ai-card-name', text: style.name });
    card.createDiv({ cls: 'card-media-picker-ai-card-desc', text: style.description });

    card.addEventListener('click', () => {
      selectedStyleId = style.id;
      styleCards.forEach((c) => {
        c.removeClass('is-selected');
      });
      card.addClass('is-selected');
      updatePrompt();
    });
    styleCards.push(card);
  });

  // 2. 画面描述词 Prompt
  container.createDiv({ cls: 'card-media-picker-section-title', text: '画面描述词 (Prompt)' });
  const promptTextarea = /** @type {HTMLTextAreaElement} */ (
    /** @type {unknown} */ (container.createEl('textarea', {
      cls: 'card-media-picker-prompt-textarea',
      attr: { rows: '3', placeholder: '输入或微调画面描述词...' },
    }))
  );

  const updatePrompt = () => {
    const docTitle = typeof view.getActiveFileTitle === 'function' ? view.getActiveFileTitle() : '';
    const docExcerpt = typeof view.getActiveDocExcerpt === 'function' ? view.getActiveDocExcerpt(100) : '';
    promptTextarea.value = resolveCardCoverPrompt({
      styleId: selectedStyleId,
      docTitle,
      docExcerpt,
    });
  };

  promptTextarea.value = currentCoverFields.aiCoverPrompt || '';
  if (!promptTextarea.value) {
    updatePrompt();
  }

  // 3. 生成操作栏与预览区
  const actionRow = container.createDiv({ cls: 'card-media-picker-ai-actions' });
  actionRow.createSpan({
    cls: 'card-media-picker-dropzone-sub',
    text: `使用模型: ${imageProvider?.name || ''} (${imageProvider?.imageModel || '默认'})`,
  });

  const generateBtn = actionRow.createEl('button', {
    cls: 'mod-cta',
    text: '开始生成封面',
  });

  const previewBox = container.createDiv({ cls: 'card-media-picker-preview-box hidden' });
  const previewImg = previewBox.createEl('img', { cls: 'card-media-picker-preview-img' });

  const confirmRow = container.createDiv({ cls: 'card-media-picker-ai-actions hidden' });
  const adoptBtn = confirmRow.createEl('button', {
    cls: 'mod-cta',
    text: '采纳此图设为封面',
  });

  let generatedDataUrl = '';

  generateBtn.addEventListener('click', async () => {
    const prompt = promptTextarea.value.trim();
    if (!prompt) {
      new Notice('请输入画面描述词');
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = 'AI 正在绘制封面...';
    previewBox.addClass('hidden');
    confirmRow.addClass('hidden');
    new Notice('正在请求 AI 生成封面图片，耗时通常为 5-15 秒...');

    try {
      const dataUrl = await generateCardCoverImage({
        styleId: selectedStyleId,
        customPrompt: prompt,
        ratioId: ratioId || '3:4',
        provider: imageProvider,
      });

      generatedDataUrl = dataUrl;
      previewImg.src = dataUrl;
      previewBox.removeClass('hidden');
      confirmRow.removeClass('hidden');
      new Notice('AI 封面生成完毕！');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`AI 封面生成失败: ${msg}`);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '重新生成封面';
    }
  });

  adoptBtn.addEventListener('click', () => {
    if (generatedDataUrl) {
      onSelect({ dataUrl: generatedDataUrl, source: 'ai' });
    }
  });
}
