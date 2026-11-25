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
  setElementHtml,
} from '../apple-style-view-shared.js';
import { writeClipboardText } from '../shared/clipboard.js';
import {
  validateCustomThemeToken,
  normalizeCustomThemeToken,
  escapeHtml,
} from '../../services/theme-token-validator.js';
import {
  compileCustomThemeToAppleOptions,
  getCustomThemeCss,
  applyCustomThemeCssToHtml,
} from '../../services/custom-theme-adapter.js';
import { decorateArticleHeadings } from '../../services/heading-style-renderer.js';
import AppleTheme from '../../themes/apple-theme.js';
import {
  generateCustomThemeWithAi,
  hasRunnableTextProvider,
  buildThemePromptWithRequirement,
} from '../../services/ai-theme-generator.js';

const HEADING_STYLE_LABELS = {
  'default': '经典条',
  'serial-number': '现代序号',
  'badge': '胶囊徽标',
  'zen': '留白禅意',
  'left-border': '左侧色块',
  'bottom-line': '底边线',
  'bubble': '浅底卡片',
  'card': '卡片背景',
  'double-line': '双细线',
};

/**
 * 基于当前 Token 生成一段微型真实文章样张 HTML，供弹窗内即时预览排版质感
 * @param {any} token
 * @returns {string}
 */
export function buildCustomThemeSampleHtml(token) {
  const normalized = normalizeCustomThemeToken(token || { name: '预览', colors: { accent: '#2563EB' } });
  const options = compileCustomThemeToAppleOptions(normalized);
  const theme = new AppleTheme(options);
  const hasThemeCss = Boolean(getCustomThemeCss(normalized));

  const sampleRawHtml = [
    `<section style="${theme.getStyle('section')}">`,
    `  <h1 style="${theme.getStyle('h1')}">${escapeHtml(normalized.name || '主题样张预览')}</h1>`,
    `  <h2 style="${theme.getStyle('h2')}">章节排版与视觉层次</h2>`,
    `  <p style="${theme.getStyle('p')}">这是一段正文排版样张，用于观察字距、行高与<strong style="${theme.getStyle('strong')}">重点强调文字</strong>在阅读时的呼吸感与色彩对比度。</p>`,
    `  <h3 style="${theme.getStyle('h3')}">子节标题风格展示</h3>`,
    `  <blockquote style="${theme.getStyle('blockquote')}"><p style="margin:0;">好的排版应当克制、清晰，让读者专注于文字本身的节奏。</p></blockquote>`,
    `  <ul style="${theme.getStyle('ul')}"><li style="${theme.getStyle('li')}">列表项目一：保持视觉留白与对齐</li><li style="${theme.getStyle('li')}">列表项目二：兼顾手机端阅读体验</li></ul>`,
    `  <hr style="${theme.getStyle('hr')}"/>`,
    `</section>`,
  ].join('\n');

  const themeHeadingStyle = normalized.headingStyle || normalized.heading?.style || 'default';
  let decorated = sampleRawHtml;
  if ((themeHeadingStyle && themeHeadingStyle !== 'default') || normalized.heading) {
    decorated = decorateArticleHeadings(decorated, {
      headingStyle: themeHeadingStyle,
      customHeading: normalized.heading,
      hasThemeCss,
      primaryColor: normalized.colors?.accent,
      titleColor: normalized.colors?.title,
    });
  }

  return hasThemeCss ? applyCustomThemeCssToHtml(decorated, normalized) : decorated;
}

/**
 * 打开自定义主题管理弹窗
 *
 * @param {{
 *   app: any,
 *   plugin: any,
 *   onThemeApplied?: (themeId: string) => void,
 *   onThemesChanged?: () => void,
 * }} options
 */
export function showCustomThemeModal({ app, plugin, onThemeApplied, onThemesChanged }) {
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
          plugin.settings.headingStyle = 'default';
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
        const wasActive = plugin.settings.theme === theme.id;
        if (wasActive) {
          plugin.settings.theme = 'github';
        }
        await plugin.saveSettings();
        if (wasActive) {
          if (typeof onThemeApplied === 'function') {
            onThemeApplied('github');
          }
          new Notice('已删除当前使用的主题，已重置为默认「简约」主题');
        } else {
          if (typeof onThemesChanged === 'function') {
            onThemesChanged();
          }
          new Notice(`已删除主题：${theme.name || theme.id}`);
        }
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
        if (typeof swatch.setAttribute === 'function') {
          swatch.setAttribute('title', `${c.label}: ${c.value}`);
        } else {
          swatch.title = `${c.label}: ${c.value}`;
        }
      });

      const hasThemeCss = Boolean(getCustomThemeCss(theme));
      if (hasThemeCss || (theme.headingStyle && theme.headingStyle !== 'default')) {
        const meta = paletteStrip.createDiv({ cls: 'custom-theme-palette-meta' });
        if (hasThemeCss) {
          meta.createEl('span', { text: 'CSS 定制' });
        }
        if (theme.headingStyle && theme.headingStyle !== 'default') {
          const friendlyHeading = HEADING_STYLE_LABELS[theme.headingStyle] || theme.headingStyle;
          meta.createEl('span', { text: `标题风格: ${friendlyHeading}` });
        }
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
      placeholder: '输入您的主题风格诉求（如：“偏暖的秋日森林系，主色焦糖琥珀与松针绿，阅读轻松通透”）或微调指令（如：“二级标题去掉底色，改用细下划线”）...',
    });

    // 快捷灵感药丸标签
    const pillsRow = step1.createDiv({ cls: 'custom-theme-pills-row' });
    pillsRow.createEl('span', { cls: 'custom-theme-pills-label', text: '风格预设：' });

    const inspirationPills = [
      { label: '秋日森系', desc: '偏暖色调的秋日森林系，主色琥珀棕与松针绿，米白温和底色，标题克制留白、行高舒展，适合户外手记与生活随笔' },
      { label: '刊物人文', desc: '杂志编辑部衬线风，米白纸感背景配合黛青与古铜金，二级标题居中搭配优雅章节序号与细线，适合深度长文与书评' },
      { label: '现代简报', desc: '清爽现代商业资讯风，纯白底色与克制深海蓝，左对齐标题配微渐变底衬与干净引用卡片，适合行业观察与产品拆解' },
      { label: '极客手账', desc: '冷静理性技术笔记风，冷灰与青色点缀，章节采用双斜杠 // 编号前缀，重点词配柔和底衬，适合教程与工程复盘' },
      { label: '节日特刊', desc: '东方典雅中国红与暖金配比，庄重而不艳俗，居中对称题头与细线分隔，适合年度盘点、专题特刊与重要发布' },
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

    // 双通道按钮栏 + 增量微调按钮
    const btnRow = step1.createDiv({ cls: 'custom-theme-btn-row' });

    const hasAiModel = hasRunnableTextProvider(plugin.settings?.ai);
    const aiGenBtn = btnRow.createEl('button', {
      cls: 'mod-cta custom-theme-ai-gen-btn',
      text: '调用 AI 智能生成',
    });
    if (!hasAiModel) {
      aiGenBtn.title = '未检测到已配置的文本模型 API，点击可查看指引';
    }

    const copyPromptBtn = btnRow.createEl('button', {
      cls: 'custom-theme-copy-prompt-btn-secondary',
      text: '复制提示词 (发给外部 AI)',
    });

    const aiRefineBtn = btnRow.createEl('button', {
      cls: 'custom-theme-copy-prompt-btn-secondary is-hidden',
      text: '基于当前样式微调',
    });
    aiRefineBtn.title = '保留当前主题基础，按上方输入的修改意见让 AI 局部调整';

    copyPromptBtn.onclick = async () => {
      const promptToCopy = buildThemePromptWithRequirement(reqTextarea.value);
      const ok = await writeClipboardText(promptToCopy);
      if (ok) {
        new Notice('AI 提示词已复制！已附带您的个性化诉求，可直接粘贴给 ChatGPT、DeepSeek、Claude 或 Kimi');
      } else {
        new Notice('复制失败，请检查剪贴板权限');
      }
    };

    // 调试与微调提示信息
    const tipEl = step1.createDiv({ cls: 'custom-theme-debug-tip' });
    tipEl.setText('提示：AI 会生成基于微信安全 CSS 的主题配置并在下方实时渲染样张；不满意可直接在上方输入修改意见点击「基于当前样式微调」，或在下方直接修改 CSS。');

    // 步骤 2：主题样张预览与配置微调
    const step2 = bodyEl.createDiv({ cls: 'custom-theme-ai-step' });
    const step2Header = step2.createDiv({ cls: 'custom-theme-step-title' });
    step2Header.createEl('span', { text: '步骤 2：实时样张预览与微调' });

    // 实时主题预览卡片（含头部摘要 + 真实文章样张预览）
    const previewCard = step2.createDiv({ cls: 'custom-theme-preview-card is-hidden' });
    const previewInfo = previewCard.createDiv({ cls: 'custom-theme-preview-info' });
    const previewSwatch = previewInfo.createDiv({ cls: 'custom-theme-color-swatch' });
    const previewName = previewInfo.createEl('span', { cls: 'custom-theme-preview-name' });
    const previewHeadingTag = previewInfo.createEl('span', { cls: 'custom-theme-preview-tag is-hidden' });
    const samplePreviewEl = previewCard.createDiv({ cls: 'custom-theme-sample-preview' });

    const textarea = step2.createEl('textarea', {
      cls: 'custom-theme-json-textarea',
      placeholder: '{\n  "id": "my-brand",\n  "name": "品牌专属风",\n  "colors": {\n    "accent": "#007AFF"\n  },\n  "css": "h2 { border-left: 4px solid #007AFF; padding-left: 10px; }"\n}',
    });

    // CSS 快捷微调区（与 JSON 中的 css / rawCssOverrides 双向同步）
    const cssPanel = step2.createDiv({ cls: 'custom-theme-css-panel is-hidden' });
    cssPanel.createDiv({ cls: 'custom-theme-css-label', text: '样式 CSS 快捷编辑（修改后上方样张实时更新）' });
    const cssTextarea = cssPanel.createEl('textarea', {
      cls: 'custom-theme-css-textarea',
      placeholder: '在此直接微调主题 CSS（例如 h2、blockquote、p 的字号、颜色与间距）...',
    });

    /** @type {any} */
    let currentValidToken = null;
    let syncingFromCss = false;

    /** @param {any} token @param {{ syncCssEditor?: boolean }} [opts] */
    const updatePreviewCard = (token, opts = {}) => {
      const syncCssEditor = opts.syncCssEditor !== false;
      if (token && token.colors?.accent) {
        currentValidToken = token;
        previewCard.removeClass('is-hidden');
        aiRefineBtn.removeClass('is-hidden');
        previewSwatch.setCssStyles({
          backgroundColor: token.colors.accent,
        });
        previewName.setText(token.name || '未命名主题');
        const themeCss = getCustomThemeCss(token);
        const headingLabel = token.heading?.style || token.headingStyle || 'default';
        if (themeCss) {
          previewHeadingTag.removeClass('is-hidden');
          previewHeadingTag.setText('CSS 定制主题');
        } else if (headingLabel && headingLabel !== 'default') {
          previewHeadingTag.removeClass('is-hidden');
          const friendly = HEADING_STYLE_LABELS[headingLabel] || headingLabel;
          previewHeadingTag.setText(`标题风格: ${friendly}`);
        } else {
          previewHeadingTag.addClass('is-hidden');
        }

        if (syncCssEditor) {
          cssPanel.removeClass('is-hidden');
          cssTextarea.value = themeCss;
        }

        if (typeof samplePreviewEl.appendChild === 'function' && typeof document !== 'undefined') {
          try {
            const sampleHtml = buildCustomThemeSampleHtml(token);
            setElementHtml(samplePreviewEl, sampleHtml);
          } catch {
            // 预览渲染失败时不中断编辑
          }
        }
      } else {
        currentValidToken = null;
        previewCard.addClass('is-hidden');
        aiRefineBtn.addClass('is-hidden');
        cssPanel.addClass('is-hidden');
      }
    };

    textarea.addEventListener('input', () => {
      if (syncingFromCss) return;
      const val = validateCustomThemeToken(textarea.value);
      if (val.valid && val.token) {
        updatePreviewCard(val.token, { syncCssEditor: true });
      } else {
        updatePreviewCard(null);
      }
    });

    cssTextarea.addEventListener('input', () => {
      const nextCss = cssTextarea.value;
      let parsedObj;
      try {
        let cleaned = textarea.value.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }
        parsedObj = JSON.parse(cleaned);
      } catch {
        return;
      }
      if (!parsedObj || typeof parsedObj !== 'object' || Array.isArray(parsedObj)) return;
      parsedObj.css = nextCss;
      parsedObj.rawCssOverrides = nextCss;
      syncingFromCss = true;
      textarea.value = JSON.stringify(parsedObj, null, 2);
      syncingFromCss = false;

      const updatedVal = validateCustomThemeToken(parsedObj);
      if (updatedVal.valid && updatedVal.token) {
        updatePreviewCard(updatedVal.token, { syncCssEditor: false });
      }
    });

    if (editingInitialJson) {
      textarea.value = editingInitialJson;
      editingInitialJson = '';
      const initialVal = validateCustomThemeToken(textarea.value);
      if (initialVal.valid && initialVal.token) {
        updatePreviewCard(initialVal.token, { syncCssEditor: true });
      }
    }

    // 错误信息显示区（默认隐藏）
    const errorBox = step2.createDiv({ cls: 'custom-theme-error-box is-hidden' });

    /** @param {{ refine?: boolean }} [mode] */
    const runAiThemeGeneration = async ({ refine = false } = {}) => {
      if (!hasRunnableTextProvider(plugin.settings?.ai)) {
        new Notice('请先在插件设置的「AI 自动排版」中配置可用的文本模型（如 DeepSeek、OpenAI、SiliconFlow 等）');
        return;
      }

      if (refine && !reqTextarea.value.trim()) {
        new Notice('请先在上方输入框填写需要微调的要求（例如：“标题去掉背景框”、“主色再暖一点”）');
        reqTextarea.focus();
        return;
      }

      errorBox.empty();
      errorBox.addClass('is-hidden');
      aiGenBtn.disabled = true;
      aiRefineBtn.disabled = true;
      const activeBtn = refine ? aiRefineBtn : aiGenBtn;
      const originalLabel = activeBtn.textContent || '';
      activeBtn.setText(refine ? 'AI 正在微调中...' : 'AI 正在构思与设计中...');

      try {
        const result = await generateCustomThemeWithAi({
          aiSettings: plugin.settings?.ai,
          userRequirement: refine ? '' : reqTextarea.value,
          currentTheme: refine ? currentValidToken : null,
          refineInstruction: refine ? reqTextarea.value : '',
        });

        if (result.success && result.token && result.json) {
          textarea.value = result.json;
          updatePreviewCard(result.token, { syncCssEditor: true });
          new Notice(
            refine
              ? `已按你的要求微调主题「${result.token.name}」！`
              : `AI 已成功设计主题「${result.token.name}」！可在下方实时样张查看效果`
          );
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
        aiRefineBtn.disabled = false;
        activeBtn.setText(originalLabel);
      }
    };

    aiGenBtn.onclick = () => runAiThemeGeneration({ refine: false });
    aiRefineBtn.onclick = () => runAiThemeGeneration({ refine: true });

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
      plugin.settings.headingStyle = 'default';
      await plugin.saveSettings();

      if (typeof onThemesChanged === 'function') {
        onThemesChanged();
      }
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
