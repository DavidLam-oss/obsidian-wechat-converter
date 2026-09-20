// @vitest-environment node
import { describe, it, expect } from "vitest";

/* 卡片排版设置模型测试（B03）：
   归一化（白名单主题/比例、数值钳制、未知 key 剔除、非法值回落）、
   设置状态机（变化才触发 onChanged，不空转 bump）、
   统一输出资格检查（blocker 互斥归主因，布局失败不可被确认绕过）。
   纯状态层，无 UI、无 DOM。 */

import {
  DEFAULT_CARD_LAYOUT_SETTINGS,
  CARD_LAYOUT_LIMITS,
  normalizeCardLayoutSettings,
  createCardLayoutSettingsState,
  checkCardOutputEligibility,
  getCardThemeDefaultTypography,
} from "../services/card-settings-model.js";

describe("normalizeCardLayoutSettings：归一化", () => {
  it("默认输入返回默认设置", () => {
    expect(normalizeCardLayoutSettings()).toEqual(DEFAULT_CARD_LAYOUT_SETTINGS);
  });

  it("未知 key 不进入结果，保留的 key 齐全", () => {
    const next = normalizeCardLayoutSettings({
      themeId: "simple-white",
      ratioId: "3:4",
      fontSize: 15,
      hacked: "x",
      another: 42,
    });
    expect(Object.keys(next).sort()).toEqual(
      [
        "coverEnabled", "fontSize", "lineHeight", "pageNumberEnabled",
        "pagePadding", "ratioId", "themeId", "watermarkText",
      ].sort(),
    );
  });

  it("主题白名单：未验证主题回落 base；比例同理（C01② 后白名单为 3:4/3:5/9:16）", () => {
    const next = normalizeCardLayoutSettings({
      themeId: "not-a-theme",
      ratioId: "16:9",
    });
    expect(next.themeId).toBe(DEFAULT_CARD_LAYOUT_SETTINGS.themeId);
    expect(next.ratioId).toBe(DEFAULT_CARD_LAYOUT_SETTINGS.ratioId);
  });

  it("比例白名单：三档已验证比例均被接受", () => {
    for (const ratioId of ["3:4", "3:5", "9:16"]) {
      const next = normalizeCardLayoutSettings({ ratioId });
      expect(next.ratioId).toBe(ratioId);
    }
  });

  it("数值越界钳制到边界", () => {
    const next = normalizeCardLayoutSettings({
      fontSize: 1,
      lineHeight: 9,
      pagePadding: 500,
    });
    expect(next.fontSize).toBe(CARD_LAYOUT_LIMITS.fontSize.min);
    expect(next.lineHeight).toBe(CARD_LAYOUT_LIMITS.lineHeight.max);
    expect(next.pagePadding).toBe(CARD_LAYOUT_LIMITS.pagePadding.max);
  });

  it("非法数值回落 base；lineHeight 保留 1 位小数", () => {
    const base = { ...DEFAULT_CARD_LAYOUT_SETTINGS, fontSize: 16, lineHeight: 1.8, pagePadding: 30 };
    const next = normalizeCardLayoutSettings({
      fontSize: "abc",
      lineHeight: 1.77777,
      pagePadding: null,
    }, base);
    expect(next.fontSize).toBe(16);
    expect(next.lineHeight).toBe(1.8);
    expect(next.pagePadding).toBe(30);
  });
});

describe("createCardLayoutSettingsState：状态机", () => {
  it("值未变化不触发 onChanged（不空转 bump）", () => {
    let bumps = 0;
    const state = createCardLayoutSettingsState({ onChanged: () => { bumps += 1; } });
    const result = state.apply({ fontSize: 14 });
    expect(result.changed).toBe(false);
    expect(bumps).toBe(0);
    expect(result.layoutKey).toBeUndefined();
  });

  it("值变化触发 onChanged 且透传其返回值为 layoutKey", () => {
    let bumps = 0;
    const state = createCardLayoutSettingsState({
      onChanged: () => { bumps += 1; return `k${bumps}`; },
    });
    const result = state.apply({ fontSize: 16 });
    expect(result.changed).toBe(true);
    expect(result.settings.fontSize).toBe(16);
    expect(result.layoutKey).toBe("k1");
    expect(state.get().fontSize).toBe(16);
    // 归一化后与现值相同（如 16.4 钳不进来但 16.0 等价）也不 bump
    const same = state.apply({ fontSize: 16, lineHeight: 1.7 });
    expect(same.changed).toBe(false);
    expect(bumps).toBe(1);
  });

  it("非法值回落现值不触发变化", () => {
    let bumps = 0;
    const state = createCardLayoutSettingsState({ onChanged: () => { bumps += 1; return "k"; } });
    const result = state.apply({ themeId: "nope", fontSize: "bad" });
    expect(result.changed).toBe(false);
    expect(bumps).toBe(0);
  });

  it("换主题即取默认：显式写入主题默认排版回到默认值（状态机不提供 reset）", () => {
    let bumps = 0;
    const state = createCardLayoutSettingsState({ onChanged: () => { bumps += 1; return "k"; } });
    state.apply({ fontSize: 18, pagePadding: 40 });
    expect(bumps).toBe(1);

    // 无独立 reset：默认值来自主题，由调用方（card-settings 的 applyCardTheme）显式写入
    const themeDefaults = getCardThemeDefaultTypography(DEFAULT_CARD_LAYOUT_SETTINGS.themeId);
    const back = state.apply(themeDefaults);
    expect(back.changed).toBe(true);
    expect(back.settings.fontSize).toBe(DEFAULT_CARD_LAYOUT_SETTINGS.fontSize);
    expect(back.settings.lineHeight).toBe(DEFAULT_CARD_LAYOUT_SETTINGS.lineHeight);
    expect(back.settings.pagePadding).toBe(DEFAULT_CARD_LAYOUT_SETTINGS.pagePadding);
    expect(bumps).toBe(2);

    // 同值重放不 bump
    const again = state.apply(themeDefaults);
    expect(again.changed).toBe(false);
    expect(bumps).toBe(2);
  });

  it("自定义 defaults 作为初始值", () => {
    const state = createCardLayoutSettingsState({
      defaults: { ...DEFAULT_CARD_LAYOUT_SETTINGS, fontSize: 15 },
    });
    expect(state.get().fontSize).toBe(15);
  });
});

describe("checkCardOutputEligibility：统一输出资格", () => {
  /** @returns {any} */
  function fakeSession({ selectionPageIds = null } = {}) {
    return {
      getValidSelection: () =>
        selectionPageIds === null ? null : { pageIds: [...selectionPageIds], layoutKey: "k" },
    };
  }

  const okInput = {
    hasResult: true,
    planOk: true,
    pageCount: 3,
    resourceBlockingFailures: false,
  };

  it("全部通过时 eligible", () => {
    const r = checkCardOutputEligibility(fakeSession(), okInput);
    expect(r.eligible).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("无排版结果 → no-result 且不再叠加其他 blocker", () => {
    const r = checkCardOutputEligibility(fakeSession(), { ...okInput, hasResult: false });
    expect(r.eligible).toBe(false);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0].code).toBe("no-result");
  });

  it("布局失败 → layout-failed 硬阻断", () => {
    const r = checkCardOutputEligibility(fakeSession(), {
      ...okInput,
      planOk: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.blockers.map((b) => b.code)).toEqual(["layout-failed"]);
  });

  it("零页 → empty-content", () => {
    const r = checkCardOutputEligibility(fakeSession(), { ...okInput, pageCount: 0 });
    expect(r.blockers.map((b) => b.code)).toEqual(["empty-content"]);
  });

  it("有省略不阻断导出（确认闸门已退役，2026-09-20 David）", () => {
    const r = checkCardOutputEligibility(fakeSession(), { ...okInput, omissionTotal: 2 });
    expect(r.eligible).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("有选择但为空 → empty-selection；无选择（全部页）不阻断", () => {
    const emptySel = checkCardOutputEligibility(fakeSession({ selectionPageIds: [] }), okInput);
    expect(emptySel.blockers.map((b) => b.code)).toEqual(["empty-selection"]);
    const noSel = checkCardOutputEligibility(fakeSession({ selectionPageIds: ["page-1"] }), okInput);
    expect(noSel.eligible).toBe(true);
  });

  it("资源阻断 → resource-failure", () => {
    const r = checkCardOutputEligibility(fakeSession(), { ...okInput, resourceBlockingFailures: true });
    expect(r.blockers.map((b) => b.code)).toEqual(["resource-failure"]);
  });
});
