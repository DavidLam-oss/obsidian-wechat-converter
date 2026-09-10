// @vitest-environment node
import { describe, it, expect } from "vitest";

/* 省略确认闭环与会话设置联动测试（B03）：
   排版设置变化 → bumpConfig → layoutKey 变化 → 页选择与省略确认自动失效；
   确认绑定渲染版本（diagnosticVersion = layoutKey），跨版本不复用；
   设置归一化经会话透传（白名单主题不提前放行）。
   纯会话层，无 UI、无 DOM。 */

import { createCardSessionRegistry } from "../services/card-session.js";
import { DEFAULT_CARD_LAYOUT_SETTINGS } from "../services/card-settings-model.js";

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

  it("resetLayoutSettings 恢复默认并 bump", () => {
    const session = newSession();
    session.applyLayoutSettings({ pagePadding: 44 });
    const before = session.currentLayoutKey();
    const reset = session.resetLayoutSettings();
    expect(reset.changed).toBe(true);
    expect(session.getLayoutSettings()).toEqual(DEFAULT_CARD_LAYOUT_SETTINGS);
    expect(session.currentLayoutKey()).not.toBe(before);
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

describe("省略确认闭环", () => {
  it("确认绑定当前版本：同版本可查，bump 后失效", () => {
    const session = newSession();
    const key1 = session.currentLayoutKey();
    session.confirmOmissions(key1);
    expect(session.isOmissionConfirmed(key1)).toBe(true);

    session.applyLayoutSettings({ fontSize: 17 });
    expect(session.isOmissionConfirmed(key1)).toBe(false);
  });

  it("diagnosticVersion 与 layoutKey 双重校验：版本一致但诊断串不同 → 不算已确认", () => {
    const session = newSession();
    session.confirmOmissions("wrong-version");
    expect(session.isOmissionConfirmed("wrong-version")).toBe(true);
    expect(session.isOmissionConfirmed(session.currentLayoutKey())).toBe(false);
    expect(session.isOmissionConfirmed("another")).toBe(false);
  });

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

  it("正文 bump 同样使确认失效（双通道互不覆盖）", () => {
    const session = newSession();
    const key1 = session.currentLayoutKey();
    session.confirmOmissions(key1);
    session.bumpContent();
    expect(session.isOmissionConfirmed(key1)).toBe(false);
  });

  it("确认 → 再确认（新版本）→ 再失效 的完整闭环", () => {
    const session = newSession();
    // v1：有省略，确认
    const v1 = session.currentLayoutKey();
    session.confirmOmissions(v1);
    expect(session.isOmissionConfirmed(v1)).toBe(true);
    // v2：调设置后需重新确认
    session.applyLayoutSettings({ lineHeight: 2.0 });
    const v2 = session.currentLayoutKey();
    expect(session.isOmissionConfirmed(v1)).toBe(false);
    session.confirmOmissions(v2);
    expect(session.isOmissionConfirmed(v2)).toBe(true);
    expect(session.isOmissionConfirmed(v1)).toBe(false);
    // v3：再改正文，又失效
    session.bumpContent();
    expect(session.isOmissionConfirmed(v2)).toBe(false);
  });

  it("dispose 后确认查询安全返回 false", () => {
    const registry = createCardSessionRegistry();
    const session = registry.getSession("notes/tmp.md");
    const key = session.currentLayoutKey();
    session.confirmOmissions(key);
    registry.disposeAll();
    expect(session.isOmissionConfirmed(key)).toBe(false);
  });
});
