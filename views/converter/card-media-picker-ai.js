/**
 * ## 核心功能
 *
 * 小红书卡片选图工作台之「AI 灵感生图」Tab 内容构建与交互。
 * 提供多风格可视化画廊卡片、文章核心观点提炼与双向 Prompt 联动、
 * 异步生图 Stage 阶段进度反馈动效、历史灵感多图缩略图画廊持久化与点击即选封面。
 *
 * ## 设计原则
 *
 * - 严格遵守无 emoji 规范；
 * - 遵守单文件软线 800 行约束；
 * - 使用 Obsidian DOM 操作 API（无 innerHTML）；
 * - 定时器安全释放，无悬挂后台任务。
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: view and plugin settings untyped in pure JS */

import { Notice, getObsidianSetIcon } from '../apple-style-view-shared.js';
import {
  AI_CARD_COVER_STYLES,
  resolveCardCoverPrompt,
  generateCardCoverImage,
  extractVisualTopicWithAi,
} from '../../services/card-ai-image.js';
import {
  resolveImageAiProvider,
  resolveAiProvider,
  isAiProviderRunnable,
} from '../../services/ai-layout/providers.js';
import { resolveNoteMarkdownAndPathSync } from './card-media-picker-note.js';

/**
 * 提取文章摘要作为核心内容初值
 * @param {any} view
 * @param {Record<string, any>} currentFields
 * @returns {string}
 */
function extractArticleSummary(view, currentFields) {
  if (currentFields?.excerpt && typeof currentFields.excerpt === 'string' && currentFields.excerpt.trim()) {
    return currentFields.excerpt.trim();
  }
  const { markdown } = resolveNoteMarkdownAndPathSync(view);
  if (!markdown) return '';

  let text = String(markdown || '');
  // 剥离 frontmatter
  text = text.replace(/^---[\s\S]*?---\s*/, '');
  // 剥离围栏代码块
  text = text.replace(/```[\s\S]*?```/g, '');
  // 剥离行内代码
  text = text.replace(/`[^`]+`/g, '');
  // 剥离 HTML 标签
  text = text.replace(/<[^>]+>/g, '');
  // 剥离图片
  text = text.replace(/!\[.*?\]\(.*?\)/g, '').replace(/!\[\[.*?\]\]/g, '');
  // 剥离链接
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // 剥离标题 #
  text = text.replace(/^#+\s+/gm, '');
  // 剥离引用与列表符
  text = text.replace(/^[>\-*+]\s+/gm, '');
  // 压缩多余空白
  text = text.replace(/\s+/g, ' ').trim();
  return text.slice(0, 80).trim();
}

/**
 * 构建 AI 灵感生图 Tab
 * @param {object} options
 * @param {HTMLElement} options.container 宿主内容容器
 * @param {any} options.view AppleStyleView 实例
 * @param {string} options.ratioId 当前卡片比例 ID
 * @param {(result: { dataUrl: string, source: string }) => void} options.onSelect 选中图片回调
 * @param {() => void} [options.onClose] 关闭弹窗回调
 * @param {() => void} [options.onOpenSettings] 打开设置回调
 */
export function renderAiMediaPickerTab({ container, view, ratioId, onSelect, _onClose, onOpenSettings }) {
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

  const session = typeof view.getCardSettingsSession === 'function' ? view.getCardSettingsSession() : null;
  const currentCoverFields = session?.getCoverFields?.() || {};
  const docTitle = String(currentCoverFields.title || (typeof view.getActiveFileTitle === 'function' ? view.getActiveFileTitle() : '') || '精选笔记').trim();
  const docExcerpt = extractArticleSummary(view, currentCoverFields);

  // 1. 风格预设画廊
  container.createDiv({ cls: 'card-media-picker-section-title', text: '预设画面风格' });
  const stylesGrid = container.createDiv({ cls: 'card-media-picker-ai-styles' });

  let selectedStyleId = currentCoverFields.aiCoverStyleId || AI_CARD_COVER_STYLES[0].id;

  const styleCards = [];
  AI_CARD_COVER_STYLES.forEach((style) => {
    const card = stylesGrid.createDiv({
      cls: `card-media-picker-ai-card ${style.id === selectedStyleId ? 'is-selected' : ''}`,
    });
    card.createDiv({ cls: 'card-media-picker-ai-card-name', text: style.name });

    card.addEventListener('click', () => {
      selectedStyleId = style.id;
      styleCards.forEach((c) => {
        c.removeClass('is-selected');
      });
      card.addClass('is-selected');
      if (selectedStyleId === 'custom') {
        hintBox.removeClass('is-hidden');
      } else {
        hintBox.addClass('is-hidden');
      }
      syncPrompt();
    });
    styleCards.push(card);
  });

  // 2. 画面核心观点与主题输入
  const topicHeader = container.createDiv({ cls: 'card-media-picker-topic-header' });
  topicHeader.createDiv({ cls: 'card-media-picker-section-title', text: '画面核心观点与主题' });

  const textProvider = resolveAiProvider(aiSettings);
  const isTextRunnable = isAiProviderRunnable(textProvider, 'text');
  const setIcon = getObsidianSetIcon();

  const extractBtn = topicHeader.createEl('button', {
    cls: `card-media-picker-ai-extract-btn ${isTextRunnable ? '' : 'is-unconfigured'}`,
    attr: {
      type: 'button',
      title: isTextRunnable
        ? '使用已配置的文本模型自动提炼文章核心观点'
        : '未配置可用文本模型（点击查看指引）',
    },
  });

  const iconSpan = extractBtn.createSpan({ cls: 'card-media-picker-ai-extract-icon' });
  if (typeof setIcon === 'function') {
    setIcon(iconSpan, 'sparkles');
  }

  const textSpan = extractBtn.createSpan({
    cls: 'card-media-picker-ai-extract-text',
    text: 'AI 提炼观点',
  });

  extractBtn.addEventListener('click', async () => {
    if (!isTextRunnable) {
      new Notice('请先在「插件设置 - AI 服务商」中配置并启用文本模型，即可使用 AI 智能提炼观点');
      return;
    }

    extractBtn.disabled = true;
    textSpan.textContent = '提炼中...';
    try {
      const { markdown } = resolveNoteMarkdownAndPathSync(view);
      const aiTopic = await extractVisualTopicWithAi({
        provider: textProvider,
        title: docTitle,
        content: markdown || docExcerpt,
      });
      topicInput.value = aiTopic;
      syncPrompt();
      new Notice('AI 已提炼视觉核心观点并同步提示词');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`AI 提炼失败: ${msg}`);
    } finally {
      extractBtn.disabled = false;
      textSpan.textContent = 'AI 提炼观点';
    }
  });

  const topicInput = /** @type {HTMLInputElement} */ (
    /** @type {unknown} */ (container.createEl('input', {
      type: 'text',
      cls: 'card-media-picker-topic-input',
      attr: { placeholder: '提炼文章核心观点或关键词，将融入所选画面风格...' },
      value: docExcerpt || docTitle,
    }))
  );

  // 3. 画面描述词 Prompt
  container.createDiv({ cls: 'card-media-picker-section-title', text: '画面描述词 (Prompt)' });

  const hintBox = container.createDiv({
    cls: `card-media-picker-hint ${selectedStyleId === 'custom' ? '' : 'is-hidden'}`,
  });
  hintBox.createSpan({ text: '支持变量：' });

  const varTopic = hintBox.createEl('code', { cls: 'card-media-picker-hint-var', text: '{topic}' });
  varTopic.title = '点击插入 {topic}（核心主题）';
  hintBox.createSpan({ text: ' 主题 · ' });

  const varTitle = hintBox.createEl('code', { cls: 'card-media-picker-hint-var', text: '{title}' });
  varTitle.title = '点击插入 {title}（文章标题）';
  hintBox.createSpan({ text: ' 标题 · ' });

  const varExcerpt = hintBox.createEl('code', { cls: 'card-media-picker-hint-var', text: '{excerpt}' });
  varExcerpt.title = '点击插入 {excerpt}（文章摘要）';
  hintBox.createSpan({ text: ' 摘要（生图时自动替换对应内容）' });

  const promptTextarea = /** @type {HTMLTextAreaElement} */ (
    /** @type {unknown} */ (container.createEl('textarea', {
      cls: 'card-media-picker-prompt-textarea',
      attr: { rows: '2', placeholder: '输入或微调画面描述词...' },
    }))
  );

  const insertVar = (varName) => {
    const start = promptTextarea.selectionStart || promptTextarea.value.length;
    const end = promptTextarea.selectionEnd || promptTextarea.value.length;
    const val = promptTextarea.value;
    promptTextarea.value = val.slice(0, start) + varName + val.slice(end);
    promptTextarea.focus();
    promptTextarea.setSelectionRange(start + varName.length, start + varName.length);
  };
  varTopic.addEventListener('click', () => insertVar('{topic}'));
  varTitle.addEventListener('click', () => insertVar('{title}'));
  varExcerpt.addEventListener('click', () => insertVar('{excerpt}'));

  const syncPrompt = () => {
    const topic = topicInput.value.trim();
    promptTextarea.value = resolveCardCoverPrompt({
      styleId: selectedStyleId,
      title: docTitle,
      topic: topic || docTitle,
      excerpt: docExcerpt,
    });
  };

  topicInput.addEventListener('input', syncPrompt);

  promptTextarea.value = currentCoverFields.aiCoverPrompt || '';
  if (!promptTextarea.value) {
    syncPrompt();
  }

  // 4. 操作按钮栏
  const actionRow = container.createDiv({ cls: 'card-media-picker-ai-actions' });
  actionRow.createSpan({
    cls: 'card-media-picker-dropzone-sub',
    text: `使用模型: ${imageProvider?.name || ''} (${imageProvider?.imageModel || '默认'})`,
  });

  const generateBtn = actionRow.createEl('button', {
    cls: 'mod-cta',
    text: '开始生成封面',
  });

  // 5. 动态进度条面板（Stage 阶段状态机）
  const progressWrap = container.createDiv({ cls: 'card-media-picker-progress-wrap is-hidden' });
  const progressHeader = progressWrap.createDiv({ cls: 'card-media-picker-progress-header' });
  const stageLabel = progressHeader.createSpan({
    cls: 'card-media-picker-progress-stage',
    text: '阶段 1/4: 构建画面构图与提示词语义...',
  });
  const timeLabel = progressHeader.createSpan({
    cls: 'card-media-picker-progress-time',
    text: '已耗时: 0s',
  });
  const barBg = progressWrap.createDiv({ cls: 'card-media-picker-progress-bar-bg' });
  const barFill = barBg.createDiv({ cls: 'card-media-picker-progress-bar-fill' });
  barFill.setCssStyles({ width: '8%' });

  // 6. 历史记录缓存管理（按当前笔记持久化在 view 实例中）
  const noteKey = session?.noteId || view?.lastResolvedSourcePath || 'default_note';
  view._cardAiImageHistory = view._cardAiImageHistory || {};
  if (!Array.isArray(view._cardAiImageHistory[noteKey])) {
    view._cardAiImageHistory[noteKey] = [];
    if (currentCoverFields.coverImage && currentCoverFields.coverImageSource === 'ai') {
      view._cardAiImageHistory[noteKey].push({
        id: 'initial_cover',
        dataUrl: currentCoverFields.coverImage,
        prompt: currentCoverFields.coverPrompt || '',
        styleId: currentCoverFields.coverImageStyle || selectedStyleId,
        timestamp: Date.now(),
      });
    }
  }
  const historyList = view._cardAiImageHistory[noteKey];

  let currentSelectedDataUrl = (currentCoverFields.coverImage && currentCoverFields.coverImageSource === 'ai')
    ? currentCoverFields.coverImage
    : (historyList[0]?.dataUrl || '');

  // 7. 历史灵感画廊区域（统一作为封面预览与多图选择工作台）
  const historySection = container.createDiv({
    cls: `card-media-picker-history-section ${historyList.length > 0 ? '' : 'is-hidden'}`,
  });
  historySection.createDiv({
    cls: 'card-media-picker-history-title',
    text: '已生成的封面灵感（点击直接选用）',
  });
  const historyGrid = historySection.createDiv({ cls: 'card-media-picker-history-grid' });

  const renderHistoryThumbnails = () => {
    historyGrid.empty();
    if (historyList.length === 0) {
      historySection.addClass('is-hidden');
      return;
    }

    historySection.removeClass('is-hidden');

    historyList.forEach((item) => {
      const isSelected = item.dataUrl === currentSelectedDataUrl;
      const card = historyGrid.createDiv({
        cls: `card-media-picker-history-item ${isSelected ? 'is-selected' : ''}`,
      });
      const thumb = card.createEl('img', {
        cls: 'card-media-picker-history-thumb',
        attr: { alt: 'AI 封面灵感' },
      });
      thumb.src = item.dataUrl;

      if (isSelected) {
        card.createDiv({
          cls: 'card-media-picker-history-badge',
          text: '当前封面',
        });
      }

      card.addEventListener('click', () => {
        if (currentSelectedDataUrl === item.dataUrl) return;
        currentSelectedDataUrl = item.dataUrl;
        renderHistoryThumbnails();
        if (typeof onSelect === 'function') {
          onSelect({ dataUrl: item.dataUrl, source: 'ai' });
        }
        new Notice('已切换为封面图片');
      });
    });
  };

  renderHistoryThumbnails();

  // 定时器工具函数（符合 Obsidian 审核规范）
  const win = typeof window !== 'undefined' ? window : null;
  const setIntervalFn = win && typeof win.setInterval === 'function' ? win.setInterval.bind(win) : setInterval;
  const clearIntervalFn = win && typeof win.clearInterval === 'function' ? win.clearInterval.bind(win) : clearInterval;
  const setTimeoutFn = win && typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : setTimeout;

  // 9. 生图点击响应
  generateBtn.addEventListener('click', async () => {
    const prompt = promptTextarea.value.trim();
    if (!prompt) {
      new Notice('请输入画面描述词');
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = 'AI 正在绘制封面...';

    // 展示 Stage 进度面板与计时器
    progressWrap.removeClass('is-hidden');
    stageLabel.textContent = '阶段 1/4: 构建画面构图与提示词语义...';
    timeLabel.textContent = '已耗时: 0s';
    barFill.setCssStyles({ width: '10%' });

    const startTime = Date.now();
    let timerId = null;

    timerId = setIntervalFn(() => {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      timeLabel.textContent = `已耗时: ${elapsedSec}s`;

      if (elapsedSec < 6) {
        stageLabel.textContent = '阶段 1/4: 构建画面构图与提示词语义...';
        const pct = Math.min(25, 10 + elapsedSec * 2.5);
        barFill.setCssStyles({ width: `${pct}%` });
      } else if (elapsedSec < 18) {
        stageLabel.textContent = '阶段 2/4: AI 神经网络正在构思画面与色彩布局...';
        const pct = Math.min(55, 25 + (elapsedSec - 6) * 2.5);
        barFill.setCssStyles({ width: `${pct}%` });
      } else if (elapsedSec < 35) {
        stageLabel.textContent = '阶段 3/4: 深度渲染光影细节与高分辨率画质...';
        const pct = Math.min(82, 55 + (elapsedSec - 18) * 1.6);
        barFill.setCssStyles({ width: `${pct}%` });
      } else {
        stageLabel.textContent = '阶段 4/4: 画面渲染完毕，正在获取并同步图片数据...';
        const pct = Math.min(94, 82 + (elapsedSec - 35) * 0.4);
        barFill.setCssStyles({ width: `${pct}%` });
      }
    }, 500);

    new Notice('AI 正在绘制封面图片，通常需要 20-40 秒（复杂模型约需 1 分钟），请稍候...');

    try {
      const dataUrl = await generateCardCoverImage({
        provider: imageProvider,
        prompt,
        aspectRatio: ratioId || '3:4',
      });

      if (timerId !== null) {
        clearIntervalFn(timerId);
        timerId = null;
      }

      stageLabel.textContent = '阶段 4/4: 封面绘制完成！';
      barFill.setCssStyles({ width: '100%' });

      setTimeoutFn(() => {
        progressWrap.addClass('is-hidden');
      }, 400);

      currentSelectedDataUrl = dataUrl;

      // 压入历史列表首位（避免重复）
      const existingIdx = historyList.findIndex((h) => h.dataUrl === dataUrl);
      if (existingIdx >= 0) {
        historyList.splice(existingIdx, 1);
      }
      historyList.unshift({
        id: `ai_${Date.now()}`,
        dataUrl,
        prompt,
        styleId: selectedStyleId,
        timestamp: Date.now(),
      });

      // 实时生效并回传封面
      if (typeof onSelect === 'function') {
        onSelect({ dataUrl, source: 'ai' });
      }

      renderHistoryThumbnails();
      new Notice('AI 封面生成完毕并已设为封面！');
    } catch (err) {
      if (timerId !== null) {
        clearIntervalFn(timerId);
        timerId = null;
      }
      progressWrap.addClass('is-hidden');
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`AI 封面生成失败: ${msg}`);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '再次生成灵感封面';
    }
  });
}
