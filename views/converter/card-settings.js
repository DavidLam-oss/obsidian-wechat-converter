/*
## 核心功能

图片卡片排版设置视图（B03）：卡片模式设置浮层（sliders 图标打开的第三 wrapper）。
暴露一期已生效的排版项：正文字号、行高、页面边距、旧版 `===` 分页兼容；
主题/比例仅展示阶段 A 已验证值（C01 扩展）。所有调整走会话归一化
（card-settings-model.js），值实际变化 → bumpConfig → 新版本排版；
不直接修改完成快照、不修改源 Markdown、不影响其他笔记会话。

## 输入

this.cardSettingsWrapper（settings-panel.js 创建的浮层容器）、
当前笔记卡片会话（getCardSessions + cardPreviewPendingInput.sourcePathKey）。

## 输出

输出 `cardSettingsMethods`，由 AppleStyleView 统一组装：
- `buildCardSettingsPanel()`：一次性构建浮层 DOM（createSettingsPanel 时调用）；
- `renderCardSettingsValues()`：打开浮层/设置变化后同步当前值（active 态、数值文本）；
- `applyCardLayoutSetting(key, value)`：归一化应用单项设置，变化后触发重排版；
- `resetCardLayoutSettings()`：恢复当前默认（B03 为内置默认，C02 接全局默认）；
- `getCardSettingsSession()`：当前笔记会话（无会话返回 null，UI 显示默认值）。

## 定位

位于 views/converter/，卡片设置浮层；状态与规则在 services/card-settings-model.js。

## 依赖

`services/card-settings-model.js`（限额/默认值）；`services/card-themes.js`（主题元信息）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查所属目录 README 是否仍准确。
- DOM 选择器以 icard-settings- 前缀作用域（styles/card-settings.css 分片）。
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
 *     steppers?: Record<string, { valueEl: ObsidianElementLike, minusBtn: HTMLButtonElement, plusBtn: HTMLButtonElement }>,
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

/** stepper 数值显示格式 */
const STEPPER_FORMAT = {
  fontSize: (v) => `${v} px`,
  lineHeight: (v) => `${v}`,
  pagePadding: (v) => `${v} px`,
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
    steppers: {},
  });
  cardSettingsStateOf(this).cardSettingsRefs = refs;

  // —— 主题（一期仅已验证值；C01 扩展三主题）——
  this.createSection(wrapper, '主题', (section) => {
    const grid = section.createEl('div', { cls: 'icard-settings-option-grid' });
    refs.themeGrid = grid;
    for (const themeId of VERIFIED_CARD_THEME_IDS) {
      const theme = getCardTheme(themeId);
      const btn = grid.createEl('button', {
        cls: 'icard-settings-option',
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
    const grid = section.createEl('div', { cls: 'icard-settings-option-grid' });
    refs.ratioGrid = grid;
    const btn = grid.createEl('button', {
      cls: 'icard-settings-option',
      text: '3:4 竖版',
      attr: { 'data-value': '3:4', 'title': '3:4 竖版' },
    });
    btn.addEventListener('click', () => { this.applyCardLayoutSetting('ratioId', '3:4'); });
    section.createEl('div', {
      cls: 'icard-settings-note',
      text: '更多比例（3:5、9:16）将在后续版本开放。',
    });
  });

  // —— 排版数值项（字号 / 行高 / 边距 stepper）——
  this.createSection(wrapper, '排版', (section) => {
    const stepperRows = [
      { key: 'fontSize', label: '正文字号' },
      { key: 'lineHeight', label: '行高' },
      { key: 'pagePadding', label: '页面边距' },
    ];
    for (const row of stepperRows) {
      const line = section.createEl('div', { cls: 'icard-settings-stepper' });
      line.createEl('span', { cls: 'icard-settings-stepper-label', text: row.label });
      const minusBtn = /** @type {HTMLButtonElement} */ (
        /** @type {unknown} */ (line.createEl('button', {
          cls: 'icard-settings-stepper-btn',
          text: '−',
          attr: { 'aria-label': `减小${row.label}`, 'title': `减小${row.label}` },
        }))
      );
      const valueEl = line.createEl('span', { cls: 'icard-settings-stepper-value' });
      const plusBtn = /** @type {HTMLButtonElement} */ (
        /** @type {unknown} */ (line.createEl('button', {
          cls: 'icard-settings-stepper-btn',
          text: '+',
          attr: { 'aria-label': `增大${row.label}`, 'title': `增大${row.label}` },
        }))
      );
      minusBtn.addEventListener('click', () => { this.stepCardLayoutSetting(row.key, -1); });
      plusBtn.addEventListener('click', () => { this.stepCardLayoutSetting(row.key, 1); });
      refs.steppers[row.key] = { valueEl, minusBtn, plusBtn };
    }
  });

  // —— 恢复默认 ——
  this.createSection(wrapper, '其他', (section) => {
    const resetBtn = section.createEl('button', {
      cls: 'icard-settings-reset',
      text: '恢复默认排版',
      attr: { 'title': '恢复当前默认排版设置（仅影响本篇）' },
    });
    resetBtn.addEventListener('click', () => { this.resetCardLayoutSettings(); });
  });

  this.renderCardSettingsValues();
}
,

/**
 * 单项步进（stepper − / +）；到边界后归一化结果不变，不触发重排版。
 * @param {string} key fontSize | lineHeight | pagePadding
 * @param {number} direction +1 / -1
 */
stepCardLayoutSetting(key, direction) {
  const limit = /** @type {Record<string, {step: number} | undefined>} */ (CARD_LAYOUT_LIMITS)[key];
  if (!limit) return;
  const current = this.getCurrentCardLayoutSettings();
  const value = Number(current[key]);
  const next = Math.round((value + direction * limit.step) * 10) / 10;
  this.applyCardLayoutSetting(key, next);
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

/** 打开浮层/设置变化后同步显示值（active 态、stepper 数值、checkbox） */
renderCardSettingsValues() {
  const refs = cardSettingsStateOf(this).cardSettingsRefs;
  if (!refs) return;
  const settings = this.getCurrentCardLayoutSettings();

  if (refs.themeGrid) {
    refs.themeGrid.querySelectorAll('.icard-settings-option').forEach((el) => {
      (/** @type {HTMLElement} */ (el)).classList.toggle(
        'active',
        (/** @type {HTMLElement} */ (el)).dataset.value === settings.themeId,
      );
    });
  }
  if (refs.ratioGrid) {
    refs.ratioGrid.querySelectorAll('.icard-settings-option').forEach((el) => {
      (/** @type {HTMLElement} */ (el)).classList.toggle(
        'active',
        (/** @type {HTMLElement} */ (el)).dataset.value === settings.ratioId,
      );
    });
  }
  for (const [key, ui] of Object.entries(refs.steppers)) {
    const value = Number(settings[/** @type {'fontSize'|'lineHeight'|'pagePadding'} */ (key)]);
    const formatter = /** @type {Record<string, (v: number) => string>} */ (STEPPER_FORMAT)[key];
    ui.valueEl.textContent = formatter ? formatter(value) : String(value);
    const limit = /** @type {Record<string, {min: number, max: number} | undefined>} */ (CARD_LAYOUT_LIMITS)[key];
    if (limit) {
      ui.minusBtn.disabled = value <= limit.min;
      ui.plusBtn.disabled = value >= limit.max;
    }
  }
}
,
};
