/*
## 核心功能

图片卡片排版与封面设置视图（B03 / C02 重构）：卡片模式设置面板（sliders 图标呼出的侧边栏面板）。
采用所见即所得（WYSIWYG）架构（2026-09-13 David 定调）：
- 设置全量收敛至侧边栏面板，全局偏好设置中不设卡片页签（2026-09-19 David 再次确认）；
- 面板头部划分为两种形式的双子 Tab：
  1. 「排版 Token」：主题六选、比例三选、正文页码、水印文案、字号/行高/边距滑块、恢复默认排版；
  2. 「封面设置」：封面启用开关、标题/作者/日期/摘要编辑、按当前笔记重新填入（C06 配图在此扩展）。
- 预览区「封面」芯片按钮直通本面板并自动切到封面子 Tab，废弃独立的居中 Modal。

设置的作用域（2026-09-19 定稿）：
- 排版/输出元素（主题、比例、字号、行高、边距、封面开关、正文页码、水印）**调完即存为默认**——
  既作用于当前笔记会话，也写回 `plugin.settings.cardDefaults`，新建会话继承；
- 封面字段（标题/作者/日期/摘要/配图）随笔记内容走，属会话级，**不写回全局默认**；
- 导出目录不在此面板配置：内置默认「卡片导出」，用户在导出弹窗内的改动被记住为下次默认
  （见 card-export-modal-view.js 的 rememberCardExportRoot）。

## 输入

this.cardSettingsWrapper（settings-panel.js 创建的面板容器）、
当前笔记卡片会话（getCardSessions + cardPreviewPendingInput.sourcePathKey）。

## 输出

输出 `cardSettingsMethods`，由 AppleStyleView 统一组装：
- `buildCardSettingsPanel()`：一次性构建面板 DOM（含双子 Tab 与两组表单）；
- `renderCardSettingsValues()`：打开面板或会话设置变化后同步当前值；
- `switchCardSettingsSubTab(subTab)`：在「排版 Token」和「封面设置」之间切换；
- `openCardSettingsTab(tabName)`：直通打开面板并聚焦到指定子 Tab；
- `applyCardLayoutSetting(key, value)`：应用排版设置（写会话 + 写回全局默认），触发重排版；
- `persistCardLayoutDefaults(partial)`：把归一化后的排版值写回 `plugin.settings.cardDefaults`（落盘节流）；
- `resetCardLayoutSettings()`：恢复内置出厂排版（写会话 + 写回全局默认）；
- `applyCardCoverField(key, value)`：应用封面字段编辑；
- `resetCardCoverFields()`：按当前笔记重新填入封面字段；
- `getCardSettingsSession()`：获取当前笔记会话。

## 定位

位于 views/converter/，卡片侧边栏设置面板；规则委托 services/card-settings-model.js 与 services/card-cover-model.js。

## 依赖

`services/card-settings-model.js`（限额/默认值）；`services/card-themes.js`（主题元信息）；
样式复用 styles/style-panel.css 与 styles/style-controls.css，卡片特有样式在 styles/card-settings.css。

## 维护规则

- 严格遵守单文件 800 行软线规范。
- 所有卡片设置统一收敛在侧边栏面板，不在全局插件设置重复添加排版表单
  （设置页只保留「微信 / 多平台 / 飞书 / AI 服务 / 关于」，卡片页签已摘除）。
- 新增排版项时：先在 card-settings-model.js 扩展模型与限额，再在 buildCardSettingsPanel 加控件。
  持久化的键集合由 `normalizeCardLayoutSettings` 决定——只有它输出的字段会写回 cardDefaults；
  封面字段（标题/作者/日期/摘要/配图）按设计不进该函数，因而只停留在会话级。
- 「恢复默认排版」的语义是**内置出厂值**（DEFAULT_CARD_LAYOUT_SETTINGS），不是「当前全局默认」；
  否则侧栏本身即默认面板，重置会成为空操作。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: AppleStyleView 方法组跨模块动态组合，会话等合同字段以 unknown 持有 */

import {
  CARD_LAYOUT_LIMITS,
  CARD_RATIO_LABELS,
  CARD_WATERMARK_SOFT_LIMIT,
  DEFAULT_CARD_LAYOUT_SETTINGS,
  VERIFIED_CARD_RATIOS,
  VERIFIED_CARD_THEME_IDS,
  normalizeCardLayoutSettings,
} from '../../services/card-settings-model.js';
import { getCardTheme } from '../../services/card-themes.js';
import {
  AI_CARD_COVER_STYLES,
  resolveCardCoverPrompt,
  generateCardCoverImage,
} from '../../services/card-ai-image.js';
import {
  resolveImageAiProvider,
  isAiProviderRunnable,
} from '../../services/ai-layout/providers.js';
import { Notice } from '../apple-style-view-shared.js';
import { getObsidianRequestUrl } from '../../services/obsidian-compat.js';

/**
 * 卡片设置视图状态（d.ts 合同以 unknown 持有，这里给运行时访问形状）。
 * @typedef {{
 *   cardSettingsWrapper?: ObsidianElementLike | null,
 *   activeCardSubTab?: 'token' | 'cover',
 *   cardSettingsRefs?: {
 *     tokenTabBtn?: ObsidianElementLike | null,
 *     coverTabBtn?: ObsidianElementLike | null,
 *     tokenSection?: ObsidianElementLike | null,
 *     coverSection?: ObsidianElementLike | null,
 *     themeGrid?: ObsidianElementLike | null,
 *     ratioGrid?: ObsidianElementLike | null,
 *     pageToggleBtn?: ObsidianElementLike | null,
 *     watermarkInput?: HTMLInputElement | null,
 *     sliders?: Record<string, { input: HTMLInputElement, valueEl: ObsidianElementLike }>,
 *     coverToggleBtn?: ObsidianElementLike | null,
 *     coverFieldsWrap?: ObsidianElementLike | null,
 *     coverInputs?: Record<string, HTMLInputElement>,
 *     coverModeSelect?: HTMLSelectElement | null,
 *     coverStyleSelect?: HTMLSelectElement | null,
 *     coverPromptInput?: HTMLTextAreaElement | null,
 *     coverGenerateBtn?: HTMLButtonElement | null,
 *     coverImagePreviewWrap?: ObsidianElementLike | null,
 *     coverImageThumb?: HTMLImageElement | null,
 *     coverImageRemoveBtn?: HTMLButtonElement | null,
 *   } | null,
 *   cardDefaultsSaveTimer?: ReturnType<typeof setTimeout> | null,
 * }} CardSettingsViewStateLike
 */

/**
 * @param {unknown} view
 * @returns {CardSettingsViewStateLike}
 */
function cardSettingsStateOf(view) {
  return /** @type {CardSettingsViewStateLike} */ (view);
}

/** 滑块数值显示格式（与文章模式 `${val}px` 口径一致） */
const SLIDER_FORMAT = {
  fontSize: (v) => `${v}px`,
  lineHeight: (v) => `${v}`,
  pagePadding: (v) => `${v}px`,
};

/** 全局默认落盘节流（ms）：滑块 input 会连续触发，合并成一次 saveSettings */
const CARD_DEFAULTS_SAVE_DELAY = 400;

/** @type {CardSettingsMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardSettingsMethods = {
/** @returns {unknown} 当前笔记的卡片会话；尚未排版过时返回 null */
getCardSettingsSession() {
  const sourcePathKey = String(
    (/** @type {any} */ (this)).cardPreviewPendingInput?.sourcePathKey || '',
  );
  if (!sourcePathKey) return null;
  return /** @type {any} */ (this).getCardSessions()?.getSession(sourcePathKey) || null;
}
,

/** 一次性构建卡片设置面板 DOM（含顶部双子 Tab、排版 Token 节与封面设置节）。 */
buildCardSettingsPanel() {
  const wrapper = cardSettingsStateOf(this).cardSettingsWrapper;
  if (!wrapper) return;
  wrapper.empty();

  // —— 1. 顶部双 Tab 导航（分段胶囊：排版 Token vs 封面设置）——
  const navWrap = wrapper.createEl('div', { cls: 'icard-settings-nav' });
  const navRow = navWrap.createEl('div', { cls: 'apple-btn-row icard-settings-subtabs' });
  const tokenTabBtn = navRow.createEl('button', {
    cls: 'apple-btn-size active',
    text: '排版 Token',
    attr: { type: 'button', 'data-tab': 'token', 'title': '主题、比例、字号、边距、页脚排版参数' },
  });
  const coverTabBtn = navRow.createEl('button', {
    cls: 'apple-btn-size',
    text: '封面设置',
    attr: { type: 'button', 'data-tab': 'cover', 'title': '封面开关、主标题、作者、日期与摘要' },
  });

  tokenTabBtn.addEventListener('click', () => { this.switchCardSettingsSubTab('token'); });
  coverTabBtn.addEventListener('click', () => { this.switchCardSettingsSubTab('cover'); });

  // —— 2. 两个子面板容器 ——
  const tokenSection = wrapper.createEl('div', { cls: 'icard-settings-subpanel-token' });
  const coverSection = wrapper.createEl('div', { cls: 'icard-settings-subpanel-cover hidden' });

  const refs = /** @type {NonNullable<CardSettingsViewStateLike['cardSettingsRefs']>} */ ({
    tokenTabBtn,
    coverTabBtn,
    tokenSection,
    coverSection,
    themeGrid: null,
    ratioGrid: null,
    pageToggleBtn: null,
    watermarkInput: null,
    sliders: {},
    coverToggleBtn: null,
    coverFieldsWrap: null,
    coverInputs: {},
  });
  cardSettingsStateOf(this).cardSettingsRefs = refs;
  cardSettingsStateOf(this).activeCardSubTab = 'token';

  // ========== 子 Tab 1：排版 Token 设置 ==========
  // 主题
  this.createSection(tokenSection, '主题', (section) => {
    const grid = section.createEl('div', { cls: 'apple-btn-row' });
    refs.themeGrid = grid;
    for (const themeId of VERIFIED_CARD_THEME_IDS) {
      const theme = getCardTheme(themeId);
      const btn = grid.createEl('button', {
        cls: 'apple-btn-size',
        text: theme.name,
        attr: { 'data-value': themeId, 'title': theme.name },
      });
      btn.addEventListener('click', () => { this.applyCardLayoutSetting('themeId', themeId); });
    }
  });

  // 比例
  this.createSection(tokenSection, '比例', (section) => {
    const grid = section.createEl('div', { cls: 'apple-btn-row' });
    refs.ratioGrid = grid;
    for (const ratioId of VERIFIED_CARD_RATIOS) {
      const label = CARD_RATIO_LABELS[ratioId] || ratioId;
      const btn = grid.createEl('button', {
        cls: 'apple-btn-size',
        text: label,
        attr: { 'data-value': ratioId, 'title': label },
      });
      btn.addEventListener('click', () => { this.applyCardLayoutSetting('ratioId', ratioId); });
    }
  });

  // 正文页码
  this.createSection(tokenSection, '正文页码', (section) => {
    const pageBtn = section.createEl('button', {
      cls: 'apple-btn-size',
      text: '页码',
      attr: { 'data-value': 'pageNumberEnabled', 'title': '正文页脚左侧显示「第 N 页 / 共 M 页」；封面不编号' },
    });
    refs.pageToggleBtn = pageBtn;
    pageBtn.addEventListener('click', () => {
      const current = this.getCurrentCardLayoutSettings();
      this.applyCardLayoutSetting('pageNumberEnabled', !(current.pageNumberEnabled !== false));
    });
  });

  // 水印
  this.createSection(tokenSection, '水印', (section) => {
    const watermarkInput = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (section.createEl('input', {
        type: 'text',
        cls: 'icard-settings-text',
        attr: { placeholder: '水印文案，留空则不显示' },
      }))
    );
    refs.watermarkInput = watermarkInput;
    watermarkInput.addEventListener('change', () => {
      this.applyCardLayoutSetting('watermarkText', watermarkInput.value);
    });
    section.createEl('div', {
      cls: 'icard-settings-note',
      text: `文案显示在每页底部页脚右侧；建议不超过 ${CARD_WATERMARK_SOFT_LIMIT} 字，过长会提示而非裁切。`,
    });
  });

  // 滑块
  const sliderRows = [
    { key: 'fontSize', label: '正文字号' },
    { key: 'lineHeight', label: '行高' },
    { key: 'pagePadding', label: '页面边距' },
  ];
  for (const row of sliderRows) {
    this.createSection(tokenSection, row.label, (section) => {
      const limit = /** @type {Record<string, {min: number, max: number, step: number} | undefined>} */ (CARD_LAYOUT_LIMITS)[row.key];
      if (!limit) return;
      const container = section.createEl('div', { cls: 'apple-slider-container' });
      const slider = /** @type {HTMLInputElement} */ (
        /** @type {unknown} */ (container.createEl('input', {
          type: 'range',
          cls: 'apple-slider',
          attr: { min: String(limit.min), max: String(limit.max), step: String(limit.step) },
        }))
      );
      const valueEl = container.createEl('span', { cls: 'icard-settings-slider-value' });
      slider.addEventListener('input', () => {
        const value = Number(slider.value);
        const formatter = /** @type {Record<string, (v: number) => string>} */ (SLIDER_FORMAT)[row.key];
        valueEl.textContent = formatter ? formatter(value) : String(value);
        this.applyCardLayoutSetting(row.key, value);
      });
      refs.sliders[row.key] = { input: slider, valueEl };
    });
  }

  // 恢复默认（内置出厂值；同时保存为全局默认）
  this.createSection(tokenSection, '其他', (section) => {
    const resetBtn = section.createEl('button', {
      cls: 'apple-btn-size',
      text: '恢复默认排版',
      attr: { 'title': '恢复为内置出厂排版，并保存为全局默认；其他笔记已生成的卡片不受影响' },
    });
    resetBtn.addEventListener('click', () => { this.resetCardLayoutSettings(); });
  });

  // ========== 子 Tab 2：封面设置 ==========
  this.createSection(coverSection, '封面启用', (section) => {
    const toggleBtn = section.createEl('button', {
      cls: 'apple-btn-size',
      text: '封面',
      attr: { type: 'button', 'title': '开启后卡片以一张主题配套的文字封面开头（不编号）' },
    });
    refs.coverToggleBtn = toggleBtn;
    toggleBtn.addEventListener('click', () => {
      const current = this.getCurrentCardLayoutSettings();
      this.applyCardLayoutSetting('coverEnabled', !(current.coverEnabled === true));
    });
  });

  const fieldsWrap = coverSection.createDiv({ cls: 'icard-settings-cover-fields' });
  refs.coverFieldsWrap = fieldsWrap;

  /** @param {string} key @param {string} label @param {string} placeholder */
  const addCoverInput = (key, label, placeholder) => {
    const row = fieldsWrap.createEl('label', { cls: 'icard-settings-cover-row' });
    row.createEl('span', { cls: 'icard-settings-cover-label', text: label });
    const input = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (row.createEl('input', {
        type: 'text',
        cls: 'icard-settings-text',
        attr: { placeholder, 'data-cover-key': key },
      }))
    );
    input.addEventListener('change', () => {
      this.applyCardCoverField(key, input.value);
    });
    refs.coverInputs[key] = input;
  };
  addCoverInput('title', '标题', '默认取 frontmatter title 或文件名');
  addCoverInput('author', '作者', '取 frontmatter author，可改');
  addCoverInput('date', '日期', 'YYYY-MM-DD（无法解析则不显示）');
  addCoverInput('excerpt', '摘要', '取 frontmatter description，可改');

  // 封面配图 / AI 生图
  const aiCoverGroup = fieldsWrap.createDiv({ cls: 'icard-settings-cover-ai-group' });

  // 1. 呈现形态选择
  const modeRow = aiCoverGroup.createEl('label', { cls: 'icard-settings-cover-row' });
  modeRow.createEl('span', { cls: 'icard-settings-cover-label', text: '呈现' });
  const modeSelect = /** @type {HTMLSelectElement} */ (
    /** @type {unknown} */ (modeRow.createEl('select', { cls: 'icard-settings-select' }))
  );
  modeSelect.createEl('option', { value: 'mixed', text: '图文混排（背景配图 + 文字排版）' });
  modeSelect.createEl('option', { value: 'full-bleed', text: '纯全图海报（纯 AI 画面，整页铺满）' });
  modeSelect.addEventListener('change', () => {
    this.applyCardCoverField('coverMode', modeSelect.value);
  });
  refs.coverModeSelect = modeSelect;

  // 2. 风格选择
  const styleRow = aiCoverGroup.createEl('label', { cls: 'icard-settings-cover-row' });
  styleRow.createEl('span', { cls: 'icard-settings-cover-label', text: '风格' });
  const styleSelect = /** @type {HTMLSelectElement} */ (
    /** @type {unknown} */ (styleRow.createEl('select', { cls: 'icard-settings-select' }))
  );
  for (const style of AI_CARD_COVER_STYLES) {
    styleSelect.createEl('option', { value: style.id, text: `${style.name} · ${style.description}` });
  }
  styleSelect.addEventListener('change', () => {
    this.applyCardCoverField('coverImageStyle', styleSelect.value);
    const session = /** @type {any} */ (this.getCardSettingsSession());
    const fields = session && typeof session.getCoverFields === 'function'
      ? session.getCoverFields()
      : { title: '', excerpt: '' };
    const autoPrompt = resolveCardCoverPrompt({
      styleId: styleSelect.value,
      title: fields.title,
      excerpt: fields.excerpt,
    });
    this.applyCardCoverField('coverPrompt', autoPrompt);
    if (refs.coverPromptInput) {
      refs.coverPromptInput.value = autoPrompt;
    }
  });
  refs.coverStyleSelect = styleSelect;

  // 3. 提示词多行文本域
  const promptRow = aiCoverGroup.createDiv({ cls: 'icard-settings-cover-prompt-row' });
  promptRow.createEl('span', { cls: 'icard-settings-cover-label', text: '生图 Prompt' });
  const promptInput = /** @type {HTMLTextAreaElement} */ (
    /** @type {unknown} */ (promptRow.createEl('textarea', {
      cls: 'icard-settings-prompt-area',
      attr: { placeholder: '生图提示词，支持根据标题/摘要自动填充或手动微调' },
    }))
  );
  promptInput.addEventListener('change', () => {
    this.applyCardCoverField('coverPrompt', promptInput.value);
  });
  refs.coverPromptInput = promptInput;

  // 4. 生图按钮
  const genActionRow = aiCoverGroup.createDiv({ cls: 'icard-settings-cover-actions' });
  const genBtn = genActionRow.createEl('button', {
    cls: 'apple-btn-size',
    text: '🎨 AI 生成封面图',
    attr: { type: 'button', title: '使用配置的生图模型根据 Prompt 生成封面图片' },
  });
  refs.coverGenerateBtn = genBtn;

  genBtn.addEventListener('click', async () => {
    const aiSettings = (/** @type {any} */ (this.plugin))?.settings?.ai;
    const provider = resolveImageAiProvider(aiSettings, aiSettings?.defaultImageProviderId);
    if (!provider || !isAiProviderRunnable(provider, 'image')) {
      new Notice('未配置可用的生图 AI Provider，请前往插件设置【AI 服务】进行配置');
      return;
    }

    const session = /** @type {any} */ (this.getCardSettingsSession());
    const fields = session && typeof session.getCoverFields === 'function'
      ? session.getCoverFields()
      : { title: '', excerpt: '', coverPrompt: '', coverImageStyle: '3d-clay' };

    const promptText = (fields.coverPrompt || promptInput.value || '').trim() || resolveCardCoverPrompt({
      styleId: fields.coverImageStyle || '3d-clay',
      title: fields.title,
      excerpt: fields.excerpt,
    });

    const currentLayout = this.getCurrentCardLayoutSettings();
    const ratio = currentLayout.ratioId || '3:4';

    genBtn.disabled = true;
    const originalText = genBtn.textContent || '🎨 AI 生成封面图';
    genBtn.textContent = '🎨 正在生图中...';

    try {
      const dataUrl = await generateCardCoverImage({
        provider,
        prompt: promptText,
        aspectRatio: ratio,
        requestUrl: getObsidianRequestUrl(),
      });
      this.applyCardCoverField('coverImage', dataUrl);
      new Notice('封面图生成成功！已应用到卡片封面');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`生图失败: ${msg}`);
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = originalText;
    }
  });

  // 5. 封面图片缩略图预览与移除
  const previewBox = aiCoverGroup.createDiv({ cls: 'icard-settings-cover-preview-box hidden' });
  refs.coverImagePreviewWrap = previewBox;

  const thumbImg = /** @type {HTMLImageElement} */ (
    /** @type {unknown} */ (previewBox.createEl('img', { cls: 'icard-settings-cover-thumb' }))
  );
  refs.coverImageThumb = thumbImg;

  const infoCol = previewBox.createDiv({ cls: 'icard-settings-cover-info' });
  infoCol.createEl('span', { text: '已启用封面配图', cls: 'icard-settings-note' });
  const removeImgBtn = infoCol.createEl('button', {
    cls: 'apple-btn-size',
    text: '移除配图',
    attr: { type: 'button', title: '移除已生成的配图，恢复主题默认纯色/渐变封面' },
  });
  refs.coverImageRemoveBtn = removeImgBtn;
  removeImgBtn.addEventListener('click', () => {
    this.applyCardCoverField('coverImage', '');
  });

  const refillSection = fieldsWrap.createDiv({ cls: 'icard-settings-cover-actions' });
  const refillBtn = refillSection.createEl('button', {
    cls: 'apple-btn-size',
    text: '按当前笔记重新填入',
    attr: { type: 'button', 'title': '丢弃手工修改，恢复为当前笔记 frontmatter / 文件名派生的初值' },
  });
  refillBtn.addEventListener('click', () => {
    this.resetCardCoverFields();
  });

  fieldsWrap.createEl('div', {
    cls: 'icard-settings-note',
    text: '手工修改后不会被正文刷新覆盖；标题/摘要过长会提示缩短，不会默默裁掉。',
  });

  this.renderCardSettingsValues();
}
,

/**
 * 切换侧边栏卡片设置面板子 Tab（'token' | 'cover'）。
 * @param {'token' | 'cover'} subTab
 */
switchCardSettingsSubTab(subTab) {
  const state = cardSettingsStateOf(this);
  state.activeCardSubTab = subTab;
  const refs = state.cardSettingsRefs;
  if (!refs) return;
  if (refs.tokenTabBtn) refs.tokenTabBtn.classList.toggle('active', subTab === 'token');
  if (refs.coverTabBtn) refs.coverTabBtn.classList.toggle('active', subTab === 'cover');
  if (refs.tokenSection) refs.tokenSection.classList.toggle('hidden', subTab !== 'token');
  if (refs.coverSection) refs.coverSection.classList.toggle('hidden', subTab !== 'cover');
  this.renderCardSettingsValues();
}
,

/**
 * 打开设置面板并切换到指定子 Tab（供预览区「封面」芯片按钮等入口直通）。
 * @param {'token' | 'cover'} [tabName='cover']
 */
openCardSettingsTab(tabName = 'cover') {
  const overlay = /** @type {HTMLElement | null} */ (this.settingsOverlay);
  const isVisible = Boolean(overlay && overlay.classList.contains('visible'));
  if (!isVisible) {
    this.toggleSettingsPanel();
  }
  this.switchCardSettingsSubTab(tabName);
}
,

/** @returns {import('../../services/card-settings-model.js').CardLayoutSettings} 当前生效设置（无会话时为默认值） */
getCurrentCardLayoutSettings() {
  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (session && typeof session.getLayoutSettings === 'function') {
    return /** @type {import('../../services/card-settings-model.js').CardLayoutSettings} */ (session.getLayoutSettings());
  }
  return { ...DEFAULT_CARD_LAYOUT_SETTINGS };
}
,

/**
 * 把排版设置写回全局默认（2026-09-19：侧栏是唯一配置入口，「调完即存」）。
 * 值经 `normalizeCardLayoutSettings` 归一化——该函数的输出即持久化白名单；
 * 封面字段不在其中（属笔记级），因此只停留在会话。
 * 展开 current 以保留 exportRoot 等非排版键（导出目录由导出弹窗记忆）。
 * @param {Record<string, unknown>} partial
 */
persistCardLayoutDefaults(partial) {
  const plugin = /** @type {any} */ (this).plugin;
  if (!plugin || !plugin.settings) return;
  const current = plugin.settings.cardDefaults && typeof plugin.settings.cardDefaults === 'object'
    ? plugin.settings.cardDefaults
    : {};
  plugin.settings.cardDefaults = {
    ...current,
    ...normalizeCardLayoutSettings({ ...current, ...partial }),
  };
  this.scheduleCardDefaultsSave();
}
,

/** 合并短时间内的多次默认变更，只落盘一次（滑块拖动不会每次都写盘） */
scheduleCardDefaultsSave() {
  const plugin = /** @type {any} */ (this).plugin;
  // 无持久化能力（测试替身 / 极简宿主）时不排定时器，避免留下悬挂回调
  if (!plugin || typeof plugin.saveSettings !== 'function') return;
  const selfRecord = cardSettingsStateOf(this);
  if (selfRecord.cardDefaultsSaveTimer) clearTimeout(selfRecord.cardDefaultsSaveTimer);
  selfRecord.cardDefaultsSaveTimer = setTimeout(() => {
    selfRecord.cardDefaultsSaveTimer = null;
    const host = /** @type {any} */ (this).plugin;
    if (host && typeof host.saveSettings === 'function') void host.saveSettings();
  }, CARD_DEFAULTS_SAVE_DELAY);
}
,

/**
 * 应用单项设置：归一化 + 变化检测在会话内完成；值实际变化才 bumpConfig 并重排版。
 * 2026-09-19：同时写回全局默认——即使尚无会话（未排版过），这次选择也应当被记住。
 * @param {string} key
 * @param {unknown} value
 */
applyCardLayoutSetting(key, value) {
  this.persistCardLayoutDefaults({ [key]: value });

  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (!session || typeof session.applyLayoutSettings !== 'function') {
    // 尚无会话（未排版过）：仅刷新显示，不产生版本变化
    this.renderCardSettingsValues();
    return;
  }
  const result = session.applyLayoutSettings({ [key]: value });
  this.renderCardSettingsValues();
  if (result.changed) {
    // bumpConfig 已使页选择与省略确认失效；用新版本重新排版
    void this.renderCardPreview();
  }
}
,

/**
 * 恢复内置出厂排版（2026-09-19 语义调整）。
 * 侧栏本身即默认配置面板，若沿用会话的 resetLayoutSettings（基准＝当前全局默认），
 * 重置会成为空操作；因此显式传出厂值，并同样写回全局默认。
 */
resetCardLayoutSettings() {
  const builtin = { ...DEFAULT_CARD_LAYOUT_SETTINGS };
  this.persistCardLayoutDefaults(builtin);

  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (!session || typeof session.applyLayoutSettings !== 'function') {
    this.renderCardSettingsValues();
    return;
  }
  const result = session.applyLayoutSettings(builtin);
  this.renderCardSettingsValues();
  if (result.changed) void this.renderCardPreview();
}
,

/**
 * 封面字段（C01③）：应用单项用户编辑（会话 applyCoverFields；实际变化 → bumpConfig → 重排版）。
 * @param {string} key
 * @param {unknown} value
 */
applyCardCoverField(key, value) {
  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (!session || typeof session.applyCoverFields !== 'function') {
    this.renderCardSettingsValues();
    return;
  }
  const result = session.applyCoverFields({ [key]: value });
  this.renderCardSettingsValues();
  if (result.changed) void this.renderCardPreview();
}
,

/** 封面字段（C01③）：按当前笔记重新填入（丢弃手工修改，回 seed 跟随） */
resetCardCoverFields() {
  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (!session || typeof session.resetCoverFields !== 'function') {
    this.renderCardSettingsValues();
    return;
  }
  const result = session.resetCoverFields();
  this.renderCardSettingsValues();
  if (result.changed) void this.renderCardPreview();
}
,

/** 打开浮层/设置变化后同步显示值（active 态、滑块位置与数值、封面字段与开关） */
renderCardSettingsValues() {
  const refs = cardSettingsStateOf(this).cardSettingsRefs;
  if (!refs) return;
  const settings = this.getCurrentCardLayoutSettings();

  // —— 1. 排版 Token 同步 ——
  if (refs.themeGrid) {
    refs.themeGrid.querySelectorAll('.apple-btn-size').forEach((el) => {
      (/** @type {HTMLElement} */ (el)).classList.toggle(
        'active',
        (/** @type {HTMLElement} */ (el)).dataset.value === settings.themeId,
      );
    });
  }
  if (refs.ratioGrid) {
    refs.ratioGrid.querySelectorAll('.apple-btn-size').forEach((el) => {
      (/** @type {HTMLElement} */ (el)).classList.toggle(
        'active',
        (/** @type {HTMLElement} */ (el)).dataset.value === settings.ratioId,
      );
    });
  }
  if (refs.pageToggleBtn) {
    const pageOn = settings.pageNumberEnabled !== false;
    const btn = /** @type {HTMLElement} */ (refs.pageToggleBtn);
    btn.classList.toggle('active', pageOn);
    btn.textContent = pageOn ? '页码 · 已开启' : '页码 · 已关闭';
  }
  if (refs.watermarkInput && document.activeElement !== refs.watermarkInput) {
    refs.watermarkInput.value = String(settings.watermarkText || '');
  }
  for (const [key, ui] of Object.entries(refs.sliders || {})) {
    const value = Number(settings[/** @type {'fontSize'|'lineHeight'|'pagePadding'} */ (key)]);
    ui.input.value = String(value);
    const formatter = /** @type {Record<string, (v: number) => string>} */ (SLIDER_FORMAT)[key];
    ui.valueEl.textContent = formatter ? formatter(value) : String(value);
  }

  // —— 2. 封面设置同步 ——
  if (refs.coverToggleBtn) {
    const coverOn = settings.coverEnabled === true;
    const btn = /** @type {HTMLElement} */ (refs.coverToggleBtn);
    btn.classList.toggle('active', coverOn);
    btn.textContent = coverOn ? '封面 · 已开启' : '封面 · 已关闭';
    if (refs.coverFieldsWrap) {
      refs.coverFieldsWrap.classList.toggle('hidden', !coverOn);
    }
    if (coverOn) {
      const session = /** @type {any} */ (this.getCardSettingsSession());
      const fields = session && typeof session.getCoverFields === 'function'
        ? session.getCoverFields()
        : { title: '', author: '', date: '', excerpt: '' };
      for (const [key, input] of Object.entries(refs.coverInputs || {})) {
        if (document.activeElement === input) continue;
        input.value = String(/** @type {Record<string, string>} */ (fields)[key] || '');
      }
      if (refs.coverModeSelect) {
        refs.coverModeSelect.value = fields.coverMode || 'mixed';
      }
      if (refs.coverStyleSelect) {
        refs.coverStyleSelect.value = fields.coverImageStyle || '3d-clay';
      }
      if (refs.coverPromptInput && document.activeElement !== refs.coverPromptInput) {
        refs.coverPromptInput.value = fields.coverPrompt || resolveCardCoverPrompt({
          styleId: fields.coverImageStyle || '3d-clay',
          title: fields.title,
          excerpt: fields.excerpt,
        });
      }
      if (refs.coverImagePreviewWrap) {
        const hasImage = Boolean(fields.coverImage);
        refs.coverImagePreviewWrap.classList.toggle('hidden', !hasImage);
        if (hasImage && refs.coverImageThumb) {
          refs.coverImageThumb.src = fields.coverImage;
        }
      }
    }
  }
}
,

};
