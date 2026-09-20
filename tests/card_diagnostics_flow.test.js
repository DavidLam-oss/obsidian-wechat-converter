// @vitest-environment node
import { describe, it, expect } from "vitest";

/* 排版设置与会话设置联动测试（B03）：
   排版设置变化 → bumpConfig → layoutKey 变化 → 页选择自动失效；
   设置归一化经会话透传（白名单主题不提前放行）。
   「恢复默认」= 切主题回默认排版（会话无 resetLayoutSettings，2026-09-20）。
   省略确认闭环已随「确认闸门退役」移除（2026-09-20 David：省略不阻断导出）。
   纯会话层，无 UI、无 DOM。 */

import { createCardSessionRegistry } from "../services/card-session.js";
import {
  DEFAULT_CARD_LAYOUT_SETTINGS,
  VERIFIED_CARD_THEME_IDS,
  getCardThemeDefaultTypography,
} from "../services/card-settings-model.js";

/** 建一个带基础状态的新会话 */
function newSession() {
  const registry = createCardSessionRegistry();
  return registry.getSession("notes/b03.md");
}

describe("排版设置 ↔ 版本联动", () => {
  it("applyLayoutSettings 变化 → bumpConfig：layoutKey 变化且返回新键", () => {
    const session = newSession();
    const before = session.currentLayoutKey();
    const result = session.applyLayoutSettings({ fontSize: 16 });
    expect(result.changed).toBe(true);
    expect(typeof result.layoutKey).toBe("string");
    expect(result.layoutKey).toBe(session.currentLayoutKey());
    expect(session.currentLayoutKey()).not.toBe(before);
  });

  it("同值重放不 bump：layoutKey 稳定", () => {
    const session = newSession();
    session.applyLayoutSettings({ fontSize: 16 });
    const stable = session.currentLayoutKey();
    const again = session.applyLayoutSettings({ fontSize: 16 });
    expect(again.changed).toBe(false);
    expect(again.layoutKey).toBeUndefined();
    expect(session.currentLayoutKey()).toBe(stable);
  });

  it("归一化经会话透传：白名单外主题不放行、数值钳制", () => {
    const session = newSession();
    const rejected = session.applyLayoutSettings({ themeId: "not-a-theme" });
    expect(rejected.changed).toBe(false);
    expect(session.getLayoutSettings().themeId).toBe(DEFAULT_CARD_LAYOUT_SETTINGS.themeId);

    const clamped = session.applyLayoutSettings({ fontSize: 999, lineHeight: 0.1 });
    expect(clamped.changed).toBe(true);
    expect(session.getLayoutSettings().fontSize).toBe(18);
    expect(session.getLayoutSettings().lineHeight).toBe(1.4);
  });

  it("换主题即取默认：A 改乱 → 去 B → 回 A，回到 A 的默认排版（无独立重置按钮）", () => {
    const session = newSession();
    const themeA = DEFAULT_CARD_LAYOUT_SETTINGS.themeId;
    const themeB = VERIFIED_CARD_THEME_IDS.find((id) => id !== themeA);
    expect(typeof themeB).toBe("string");

    // 在 A 主题下把三个排版值改乱
    session.applyLayoutSettings({ fontSize: 17, lineHeight: 2.1, pagePadding: 46 });
    expect(session.getLayoutSettings().fontSize).toBe(17);

    // 去 B：随主题默认排版一起写入
    session.applyLayoutSettings({ themeId: themeB, ...getCardThemeDefaultTypography(themeB) });
    expect(session.getLayoutSettings().themeId).toBe(themeB);

    // 回 A：取回 A 的默认值，而不是刚才改乱的 17 / 2.1 / 46
    const themeDefaults = getCardThemeDefaultTypography(themeA);
    const back = session.applyLayoutSettings({ themeId: themeA, ...themeDefaults });
    expect(back.changed).toBe(true);
    expect(session.getLayoutSettings().themeId).toBe(themeA);
    expect(session.getLayoutSettings().fontSize).toBe(themeDefaults.fontSize);
    expect(session.getLayoutSettings().lineHeight).toBe(themeDefaults.lineHeight);
    expect(session.getLayoutSettings().pagePadding).toBe(themeDefaults.pagePadding);
  });

  it("设置变化不影响 content 版本段（仍走 config 段）", () => {
    const session = newSession();
    session.bumpContent();
    const afterContent = session.currentLayoutKey();
    session.applyLayoutSettings({ fontSize: 15 });
    const afterSettings = session.currentLayoutKey();
    // 仅 config 段变化：content/theme/resource 段保持
    const cSeg = (key) => key.split(".")[0];
    const tSeg = (key) => key.split(".")[2];
    expect(cSeg(afterSettings)).toBe(cSeg(afterContent));
    expect(tSeg(afterSettings)).toBe(tSeg(afterContent));
    expect(afterSettings).not.toBe(afterContent);
  });
});

describe("页选择的版本绑定", () => {
  it("页选择随设置变化失效（§B03：调整排版 → 重新选择）", () => {
    const session = newSession();
    session.setSelection(["page-1", "page-2"]);
    expect(session.getValidSelection()?.pageIds).toEqual(["page-1", "page-2"]);

    session.applyLayoutSettings({ pagePadding: 20 });
    expect(session.getValidSelection()).toBeNull();

    // 新版本重新选择有效
    session.setSelection(["page-3"]);
    expect(session.getValidSelection()?.layoutKey).toBe(session.currentLayoutKey());
  });
});
