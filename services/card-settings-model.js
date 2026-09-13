/*
## 核心功能

图片卡片排版设置模型（B03）：设置归一化、按笔记会话持有的设置状态机、
统一输出资格检查。归一化只接受一期已验证的选项（主题/比例白名单），
数值项钳制到安全范围；设置变化由会话映射为 bumpConfig（选择与省略确认自动失效）。

## 输入

- `normalizeCardLayoutSettings(partial, base)`：用户输入（可含非法值）+ 现值。
- `createCardLayoutSettingsState({ onChanged, defaults })`：onChanged 返回新 layoutKey（会话里即 bumpConfig）。
- `checkCardOutputEligibility(session, input)`：会话 + 最近一次排版结果摘要。

## 输出

- `DEFAULT_CARD_LAYOUT_SETTINGS` / `CARD_LAYOUT_LIMITS` / `VERIFIED_CARD_THEME_IDS` / `VERIFIED_CARD_RATIOS` / `CARD_RATIO_LABELS`。
- `normalizeCardLayoutSettings(partial?, base?)` → 全量归一化设置（不含未知 key）。
- `createCardLayoutSettingsState(...)` → `{ get, apply, reset }`；apply/reset 返回
  `{ changed, settings, layoutKey? }`，值未变化不触发 onChanged（不空转 bump）。
- `checkCardOutputEligibility(...)` → `{ eligible, blockers }`；blocker 互斥归主因：
  no-result / layout-failed / empty-content / omissions-unconfirmed / empty-selection / resource-failure。

## 定位

位于 services/，卡片设置的纯状态/规则层；不导入 DOM/Obsidian，node 下可独立测试。
B04 导出服务必须调用本模块的资格检查，而不是依赖弹窗按钮是否灰掉防错。

## 依赖

无运行时依赖；`hasCardTheme` 来自 card-themes.js（主题白名单校验）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 主题/比例白名单：C01① 已接入三主题、C01② 已接入三比例；后续新增值须先过实机验证再扩白名单。
- blocker 代码是跨模块契约：变更须同步 B04 导出服务与 card_diagnostics_flow.test.js。
*/

import { hasCardTheme } from './card-themes.js';

/** 一期已验证主题（C01①：三套齐备，视觉验收随 David 迭代式评审进行） */
export const VERIFIED_CARD_THEME_IDS = /** @type {const} */ (["clear-notes", "paper-notes", "dark-take"]);

/** 一期已验证比例（C01②：3:4 / 3:5 / 9:16 三档齐备；渲染尺寸见 RATIO_PRESETS） */
export const VERIFIED_CARD_RATIOS = /** @type {const} */ (["3:4", "3:5", "9:16"]);

/** 比例 → UI 展示名（设置浮层与设置页签共用，避免两处各写一份文案） */
export const CARD_RATIO_LABELS = /** @type {const} */ ({
  "3:4": "3:4 竖版",
  "3:5": "3:5 长竖版",
  "9:16": "9:16 全屏竖版",
});

/** 数值项边界（含默认值与步进；步进供 UI stepper 使用） */
export const CARD_LAYOUT_LIMITS = {
  fontSize: { min: 12, max: 18, step: 1, default: 14 },
  lineHeight: { min: 1.4, max: 2.2, step: 0.1, default: 1.7 },
  pagePadding: { min: 16, max: 48, step: 2, default: 28 },
};

/** @typedef {{ themeId: string, ratioId: string, fontSize: number, lineHeight: number, pagePadding: number }} CardLayoutSettings */

/** B03 默认排版设置（与阶段 A 实测值一致；C02 全局默认接入后由其覆盖初始值） */
export const DEFAULT_CARD_LAYOUT_SETTINGS = /** @type {CardLayoutSettings} */ ({
  themeId: "clear-notes",
  ratioId: "3:4",
  fontSize: CARD_LAYOUT_LIMITS.fontSize.default,
  lineHeight: CARD_LAYOUT_LIMITS.lineHeight.default,
  pagePadding: CARD_LAYOUT_LIMITS.pagePadding.default,
});

/**
 * 数值项归一化：非法回落 base，合法值钳制到边界；lineHeight 保留 1 位小数。
 * @param {unknown} value
 * @param {{ min: number, max: number, default: number }} limit
 * @param {number} baseValue
 * @param {boolean} [oneDecimal]
 * @returns {number}
 */
function clampNumber(value, limit, baseValue, oneDecimal = false) {
  // null/undefined/空串等非数值输入回落 base；Number(null)=0、Number("")=0 会伪装成合法值
  if (value === null || value === undefined || value === "") return baseValue;
  let num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return baseValue;
  if (oneDecimal) num = Math.round(num * 10) / 10;
  return Math.min(limit.max, Math.max(limit.min, num));
}

/**
 * 全量归一化排版设置：未知 key 不进入结果；非法/越界值回落或钳制。
 * @param {Partial<CardLayoutSettings> | Record<string, unknown>} [partial]
 * @param {CardLayoutSettings} [base] 归一化失败的回落基准
 * @returns {CardLayoutSettings}
 */
export function normalizeCardLayoutSettings(partial = {}, base = DEFAULT_CARD_LAYOUT_SETTINGS) {
  const src = partial && typeof partial === "object" ? partial : {};
  const themeId = typeof src.themeId === "string" &&
    VERIFIED_CARD_THEME_IDS.includes(src.themeId) && hasCardTheme(src.themeId)
    ? src.themeId
    : base.themeId;
  const ratioId = typeof src.ratioId === "string" && VERIFIED_CARD_RATIOS.includes(src.ratioId)
    ? src.ratioId
    : base.ratioId;
  return {
    themeId,
    ratioId,
    fontSize: clampNumber(src.fontSize, CARD_LAYOUT_LIMITS.fontSize, base.fontSize),
    lineHeight: clampNumber(src.lineHeight, CARD_LAYOUT_LIMITS.lineHeight, base.lineHeight, true),
    pagePadding: clampNumber(src.pagePadding, CARD_LAYOUT_LIMITS.pagePadding, base.pagePadding),
  };
}

/**
 * 逐项比较两份归一化设置。
 * @param {CardLayoutSettings} a
 * @param {CardLayoutSettings} b
 * @returns {boolean}
 */
function settingsDiffer(a, b) {
  return a.themeId !== b.themeId ||
    a.ratioId !== b.ratioId ||
    a.fontSize !== b.fontSize ||
    a.lineHeight !== b.lineHeight ||
    a.pagePadding !== b.pagePadding;
}

/**
 * 创建按会话持有的设置状态机（card-session 内嵌使用）。
 * apply/reset 只在值实际变化时触发 onChanged（返回值透传为 layoutKey），不空转 bump。
 * @param {{ onChanged?: () => string | void, defaults?: CardLayoutSettings }} [options]
 * @returns {{
 *   get(): CardLayoutSettings,
 *   apply(partial: Partial<CardLayoutSettings> | Record<string, unknown>): { changed: boolean, settings: CardLayoutSettings, layoutKey?: string },
 *   reset(): { changed: boolean, settings: CardLayoutSettings, layoutKey?: string },
 * }}
 */
export function createCardLayoutSettingsState(options = {}) {
  let current = normalizeCardLayoutSettings(
    options.defaults || DEFAULT_CARD_LAYOUT_SETTINGS,
    DEFAULT_CARD_LAYOUT_SETTINGS,
  );

  /**
   * @param {Partial<CardLayoutSettings> | Record<string, unknown>} partial
   * @returns {{ changed: boolean, settings: CardLayoutSettings, layoutKey?: string }}
   */
  function apply(partial) {
    const next = normalizeCardLayoutSettings(partial, current);
    if (!settingsDiffer(current, next)) {
      return { changed: false, settings: { ...current } };
    }
    current = next;
    const layoutKey = typeof options.onChanged === "function" ? options.onChanged() : undefined;
    /** @type {{ changed: boolean, settings: CardLayoutSettings, layoutKey?: string }} */
    const result = { changed: true, settings: { ...current } };
    if (typeof layoutKey === "string") result.layoutKey = layoutKey;
    return result;
  }

  return {
    get: () => ({ ...current }),
    apply,
    reset: () => apply({ ...DEFAULT_CARD_LAYOUT_SETTINGS, ...(options.defaults || {}) }),
  };
}

/**
 * 输出资格 blocker 代码（跨模块契约，见文件头维护规则）。
 * @typedef {"no-result"|"layout-failed"|"empty-content"|"omissions-unconfirmed"|"empty-selection"|"resource-failure"} CardOutputBlockerCode
 */

/**
 * 统一输出资格检查（§B03 完成标准）：导出服务/复制入口在输出前必须调用；
 * 布局失败与空内容不可被「接受省略」绕过（blocker 与确认状态独立判定）。
 * @param {import('./card-session.js').CardNoteSessionLike} session
 * @param {{
 *   hasResult: boolean,
 *   planOk: boolean,
 *   pageCount: number,
 *   diagnosticVersion: string,
 *   omissionTotal: number,
 *   resourceBlockingFailures: boolean,
 * }} input
 * @returns {{ eligible: boolean, blockers: Array<{ code: CardOutputBlockerCode, message: string }> }}
 */
export function checkCardOutputEligibility(session, input) {
  /** @type {Array<{ code: CardOutputBlockerCode, message: string }>} */
  const blockers = [];
  if (!input || input.hasResult !== true) {
    blockers.push({ code: "no-result", message: "还没有可用的排版结果" });
    return { eligible: false, blockers };
  }
  if (input.planOk !== true) {
    // 布局失败是硬阻断：不接受确认绕过
    blockers.push({ code: "layout-failed", message: "卡片排版失败，无法输出" });
    return { eligible: false, blockers };
  }
  if (!(input.pageCount > 0)) {
    blockers.push({ code: "empty-content", message: "没有可输出的正文页" });
    return { eligible: false, blockers };
  }
  if (input.omissionTotal > 0 && !session.isOmissionConfirmed(String(input.diagnosticVersion || ""))) {
    blockers.push({ code: "omissions-unconfirmed", message: "存在未进入卡片的内容，需先确认接受本次省略" });
  }
  const selection = typeof session.getValidSelection === "function" ? session.getValidSelection() : null;
  if (selection && selection.pageIds.length === 0) {
    blockers.push({ code: "empty-selection", message: "未选择任何页面" });
  }
  if (input.resourceBlockingFailures === true) {
    blockers.push({ code: "resource-failure", message: "部分图片未能加载，导出前需处理" });
  }
  return { eligible: blockers.length === 0, blockers };
}
