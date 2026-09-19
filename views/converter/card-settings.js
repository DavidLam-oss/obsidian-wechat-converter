/*
## 核心功能

图片卡片排版与封面设置视图（B03 / C02 重构）：卡片模式设置面板（sliders 图标呼出的侧边栏面板）。
采用所见即所得（WYSIWYG）架构（2026-09-13 David 定调）：
- 设置全量收敛至侧边栏面板，彻底废除全局偏好设置中的冗余页签；
- 面板头部划分为两种形式的双子 Tab：
  1. 「排版 Token」：主题六选、比例三选、正文页码、水印文案、字号/行高/边距滑块、恢复默认排版；
  2. 「封面设置」：封面启用开关、标题/作者/日期/摘要编辑、按当前笔记重新填入（后续 C06 配图在此扩展）。
- 预览区「封面」芯片按钮直通本面板并自动切到封面子 Tab，废弃独立的居中 Modal。
所有调整均走当前笔记会话隔离，不串篇、不污染其他模式。

## 输入

this.cardSettingsWrapper（settings-panel.js 创建的面板容器）、
当前笔记卡片会话（getCardSessions + cardPreviewPendingInput.sourcePathKey）。

## 输出

输出 `cardSettingsMethods`，由 AppleStyleView 统一组装：
- `buildCardSettingsPanel()`：一次性构建面板 DOM（含双子 Tab 与两组表单）；
- `renderCardSettingsValues()`：打开面板或会话设置变化后同步当前值；
- `switchCardSettingsSubTab(subTab)`：在「排版 Token」和「封面设置」之间切换；
- `openCardSettingsTab(tabName)`：直通打开面板并聚焦到指定子 Tab；
- `applyCardLayoutSetting(key, value)`：应用排版设置，触发重排版；
- `resetCardLayoutSettings()`：恢复当前会话默认排版；
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
- 所有卡片设置统一收敛在侧边栏面板，不在全局插件设置重复添加排版表单。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- reason: AppleStyleView 方法组跨模块动态组合，会话等合同字段以 unknown 持有 */

import {
  CARD_LAYOUT_LIMITS,
  CARD_RATIO_LABELS,
  CARD_WATERMARK_SOFT_LIMIT,
  DEFAULT_CARD_LAYOUT_SETTINGS,
  VERIFIED_CARD_RATIOS,
  VERIFIED_CARD_THEME_IDS,
} from '../../services/card-settings-model.js';
import { getCardTheme } from '../../services/card-themes.js';

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
 *   } | null,
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

  // 恢复默认
  this.createSection(tokenSection, '其他', (section) => {
    const resetBtn = section.createEl('button', {
      cls: 'apple-btn-size',
      text: '恢复默认排版',
      attr: { 'title': '恢复为内置默认排版（仅影响本篇）' },
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
 * 应用单项设置：归一化 + 变化检测在会话内完成；值实际变化才 bumpConfig 并重排版。
 * @param {string} key
 * @param {unknown} value
 */
applyCardLayoutSetting(key, value) {
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

/** 恢复当前默认（值已是默认时不产生版本变化） */
resetCardLayoutSettings() {
  const session = /** @type {any} */ (this.getCardSettingsSession());
  if (!session || typeof session.resetLayoutSettings !== 'function') {
    this.renderCardSettingsValues();
    return;
  }
  const result = session.resetLayoutSettings();
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
    }
  }
}
,

};
