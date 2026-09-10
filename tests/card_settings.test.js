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
} from "../services/card-settings-model.js";

describe("normalizeCardLayoutSettings：归一化", () => {
  it("默认输入返回默认设置", () => {
    expect(normalizeCardLayoutSettings()).toEqual(DEFAULT_CARD_LAYOUT_SETTINGS);
  });

  it("未知 key 不进入结果，保留的 key 齐全", () => {
    const next = normalizeCardLayoutSettings({
      themeId: "clear-notes",
      ratioId: "3:4",
      fontSize: 15,
      hacked: "x",
      another: 42,
    });
    expect(Object.keys(next).sort()).toEqual(
      ["fontSize", "lineHeight", "pagePadding", "ratioId", "themeId"].sort(),
    );
  });

  it("主题白名单：未验证主题回落 base；比例同理", () => {
    const next = normalizeCardLayoutSettings({
      themeId: "not-a-theme",
      ratioId: "9:16",
    });
    expect(next.themeId).toBe(DEFAULT_CARD_LAYOUT_SETTINGS.themeId);
    expect(next.ratioId).toBe(DEFAULT_CARD_LAYOUT_SETTINGS.ratioId);
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

  it("reset 恢复默认：有变化时触发 onChanged，无变化时不触发", () => {
    let bumps = 0;
    const state = createCardLayoutSettingsState({ onChanged: () => { bumps += 1; return "k"; } });
    state.apply({ fontSize: 18, pagePadding: 40 });
    const reset = state.reset();
    expect(reset.changed).toBe(true);
    expect(reset.settings).toEqual(DEFAULT_CARD_LAYOUT_SETTINGS);
    expect(bumps).toBe(2);
    const resetAgain = state.reset();
    expect(resetAgain.changed).toBe(false);
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
  function fakeSession({ omissionConfirmed = false, selectionPageIds = null } = {}) {
    return {
      isOmissionConfirmed: (version) => omissionConfirmed && version === "v-ok",
      getValidSelection: () =>
        selectionPageIds === null ? null : { pageIds: [...selectionPageIds], layoutKey: "k" },
    };
  }

  const okInput = {
    hasResult: true,
    planOk: true,
    pageCount: 3,
    diagnosticVersion: "v-ok",
    omissionTotal: 0,
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

  it("布局失败 → layout-failed 硬阻断（不受省略确认影响）", () => {
    const r = checkCardOutputEligibility(fakeSession({ omissionConfirmed: true }), {
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

  it("有省略未确认 → omissions-unconfirmed；确认后消除", () => {
    const unconfirmed = checkCardOutputEligibility(fakeSession(), { ...okInput, omissionTotal: 2 });
    expect(unconfirmed.blockers.map((b) => b.code)).toEqual(["omissions-unconfirmed"]);
    const confirmed = checkCardOutputEligibility(fakeSession({ omissionConfirmed: true }), {
      ...okInput,
      omissionTotal: 2,
    });
    expect(confirmed.eligible).toBe(true);
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

  it("省略未确认 + 资源失败可叠加", () => {
    const r = checkCardOutputEligibility(fakeSession(), {
      ...okInput,
      omissionTotal: 1,
      resourceBlockingFailures: true,
    });
    expect(r.blockers.map((b) => b.code).sort()).toEqual(["omissions-unconfirmed", "resource-failure"]);
  });
});
