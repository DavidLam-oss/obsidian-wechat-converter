/*
## 核心功能

图片卡片排版设置视图（B03）：卡片模式设置浮层（sliders 图标打开的第三 wrapper）。
控件风格与文章模式对齐：数值项用 apple-slider 滑块、选项用 apple-btn 胶囊按钮、
共用同一 createSection 分节结构（间距/留白由 style-panel.css 的 apple-setting-section 统一）。
暴露一期已生效的排版项：正文字号、行高、页面边距；主题/比例仅展示阶段 A
已验证值（C01 扩展）。所有调整走会话归一化（card-settings-model.js），
值实际变化 → bumpConfig → 新版本排版；不直接修改完成快照、不修改源
Markdown、不影响其他笔记会话。

## 输入

this.cardSettingsWrapper（settings-panel.js 创建的浮层容器）、
当前笔记卡片会话（getCardSessions + cardPreviewPendingInput.sourcePathKey）。

## 输出

输出 `cardSettingsMethods`，由 AppleStyleView 统一组装：
- `buildCardSettingsPanel()`：一次性构建浮层 DOM（createSettingsPanel 时调用）；
- `renderCardSettingsValues()`：打开浮层/设置变化后同步当前值（active 态、滑块位置与数值）；
- `applyCardLayoutSetting(key, value)`：归一化应用单项设置，变化后触发重排版；
- `resetCardLayoutSettings()`：恢复默认（C02：即本会话创建时注入的全局默认；仅影响本篇，
  全局默认本身在设置页「卡片」页签维护）；
- `getCardSettingsSession()`：当前笔记会话（无会话返回 null，UI 显示默认值）。

## 定位

位于 views/converter/，卡片设置浮层；状态与规则在 services/card-settings-model.js。

## 依赖

`services/card-settings-model.js`（限额/默认值）；`services/card-themes.js`（主题元信息）；
样式复用 styles/style-panel.css（apple-setting-section / apple-btn-size）与
styles/style-controls.css（apple-slider）分片，自有样式仅剩 styles/card-settings.css 的说明文案。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查所属目录 README 是否仍准确。
- 自有 DOM 选择器以 icard-settings- 前缀作用域（styles/card-settings.css 分片）；
  通用控件直接复用 apple- 类，不再另起一套。
- 不在此放未生效的死控件（如代码字号/公式缩放/封面字段，分别属后续任务范围）。
- 设置持久化（全局默认页签）归 C02，本文件不读写 plugin.settings。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- reason: AppleStyleView 方法组跨模块动态组合（同 card-preview），会话等合同字段以 unknown 持有，运行时语义由 B01 契约测试约束 */

import {
  CARD_LAYOUT_LIMITS,
  DEFAULT_CARD_LAYOUT_SETTINGS,
  VERIFIED_CARD_THEME_IDS,
} from '../../services/card-settings-model.js';
import { getCardTheme } from '../../services/card-themes.js';

/**
 * 卡片设置视图状态（d.ts 合同以 unknown 持有，这里给运行时访问形状）。
 * @typedef {{
 *   cardSettingsWrapper?: ObsidianElementLike | null,
 *   cardSettingsRefs?: {
 *     themeGrid?: ObsidianElementLike | null,
 *     ratioGrid?: ObsidianElementLike | null,
 *     sliders?: Record<string, { input: HTMLInputElement, valueEl: ObsidianElementLike }>,
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

/** 一次性构建卡片设置浮层 DOM（settings-panel.js 创建 wrapper 后调用） */
buildCardSettingsPanel() {
  const wrapper = cardSettingsStateOf(this).cardSettingsWrapper;
  if (!wrapper) return;
  wrapper.empty();
  const refs = /** @type {NonNullable<CardSettingsViewStateLike['cardSettingsRefs']>} */ ({
    themeGrid: null,
    ratioGrid: null,
    sliders: {},
  });
  cardSettingsStateOf(this).cardSettingsRefs = refs;

  // —— 主题（一期仅已验证值；C01 扩展三主题）——
  this.createSection(wrapper, '主题', (section) => {
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
    section.createEl('div', {
      cls: 'icard-settings-note',
      text: '更多主题将在后续版本开放。',
    });
  });

  // —— 比例（一期仅 3:4；C01 扩展 3:5 / 9:16）——
  this.createSection(wrapper, '比例', (section) => {
    const grid = section.createEl('div', { cls: 'apple-btn-row' });
    refs.ratioGrid = grid;
    const btn = grid.createEl('button', {
      cls: 'apple-btn-size',
      text: '3:4 竖版',
      attr: { 'data-value': '3:4', 'title': '3:4 竖版' },
    });
    btn.addEventListener('click', () => { this.applyCardLayoutSetting('ratioId', '3:4'); });
    section.createEl('div', {
      cls: 'icard-settings-note',
      text: '更多比例（3:5、9:16）将在后续版本开放。',
    });
  });

  // —— 排版数值项（与文章模式同款滑块；分节结构与 apple-setting-section 一致）——
  const sliderRows = [
    { key: 'fontSize', label: '正文字号' },
    { key: 'lineHeight', label: '行高' },
    { key: 'pagePadding', label: '页面边距' },
  ];
  for (const row of sliderRows) {
    this.createSection(wrapper, row.label, (section) => {
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

  // —— 恢复默认 ——
  this.createSection(wrapper, '其他', (section) => {
    const resetBtn = section.createEl('button', {
      cls: 'apple-btn-size',
      text: '恢复默认排版',
      attr: { 'title': '恢复为本会话创建时的全局默认排版（仅影响本篇；全局默认在设置页「卡片」页签修改）' },
    });
    resetBtn.addEventListener('click', () => { this.resetCardLayoutSettings(); });
  });

  this.renderCardSettingsValues();
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

/** 打开浮层/设置变化后同步显示值（active 态、滑块位置与数值） */
renderCardSettingsValues() {
  const refs = cardSettingsStateOf(this).cardSettingsRefs;
  if (!refs) return;
  const settings = this.getCurrentCardLayoutSettings();

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
  for (const [key, ui] of Object.entries(refs.sliders)) {
    const value = Number(settings[/** @type {'fontSize'|'lineHeight'|'pagePadding'} */ (key)]);
    ui.input.value = String(value);
    const formatter = /** @type {Record<string, (v: number) => string>} */ (SLIDER_FORMAT)[key];
    ui.valueEl.textContent = formatter ? formatter(value) : String(value);
  }
}
,
};
