/*
## 核心功能

小红书卡片侧边栏设置面板（C02 重构）测试：
验证卡片设置全量收敛至侧边栏面板（sliders 图标呼出），并具备清晰的双子 Tab（排版 Token 与 封面设置）：
1. 面板结构完整性（顶部双子 Tab、排版 Token 节、封面设置节）；
2. 子 Tab 切换（switchCardSettingsSubTab）与直通打开（openCardSettingsTab）；
3. 排版 Token 设置绑定（主题六选、比例三选、页码开关、水印、字号/行高/边距滑块、恢复默认）；
4. 封面设置绑定（封面启用开关、字段编辑 title/author/date/excerpt、按当前笔记重新填入）；
5. 会话级隔离与响应式重排版（renderCardPreview 触发）。

## 维护规则

- 严格遵守单文件 800 行软线规范。
- 与 views/converter/card-settings.js 方法合同严格对齐。
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { loadInputModule } = require("./helpers/input-module.cjs");
const { createObsidianLikeElement } = require("./helpers/obsidian-dom.js");
const { resetViewTestGlobals } = require("./helpers/view-test-helpers.js");

describe("卡片侧边栏设置面板（card-settings.js）", () => {
  let AppleStyleView;
  let view;
  let container;

  beforeEach(() => {
    resetViewTestGlobals(vi);
    const inputModule = loadInputModule();
    AppleStyleView = inputModule.AppleStyleView;

    view = new AppleStyleView(null, {
      settings: {
        cardDefaults: {
          themeId: "simple-white",
          ratioId: "3:4",
          fontSize: 14,
          lineHeight: 1.7,
          pagePadding: 28,
          coverEnabled: false,
          pageNumberEnabled: true,
          watermarkText: "",
        },
      },
    });

    view.renderCardPreview = vi.fn();
    view.toggleSettingsPanel = vi.fn(() => {
      if (view.settingsOverlay) {
        view.settingsOverlay.classList.toggle("hidden");
      }
    });

    container = createObsidianLikeElement();
    // 构造设置面板（settings-panel.js 会调用 buildCardSettingsPanel）
    view.createSettingsPanel(container);
  });

  afterEach(() => {
    resetViewTestGlobals(vi);
  });

  describe("面板 DOM 结构构建（buildCardSettingsPanel）", () => {
    it("生成双子 Tab 导航与两组子面板容器", () => {
      const cardWrapper = view.cardSettingsWrapper;
      expect(cardWrapper).toBeTruthy();

      const nav = cardWrapper.querySelector(".icard-settings-nav");
      expect(nav).toBeTruthy();

      const tokenTabBtn = nav.querySelector('button[data-tab="token"]');
      const coverTabBtn = nav.querySelector('button[data-tab="cover"]');
      expect(tokenTabBtn).toBeTruthy();
      expect(coverTabBtn).toBeTruthy();
      expect(tokenTabBtn.textContent).toBe("排版 Token");
      expect(coverTabBtn.textContent).toBe("封面设置");
      expect(tokenTabBtn.classList.contains("active")).toBe(true);
      expect(coverTabBtn.classList.contains("active")).toBe(false);

      const tokenSection = cardWrapper.querySelector(".icard-settings-subpanel-token");
      const coverSection = cardWrapper.querySelector(".icard-settings-subpanel-cover");
      expect(tokenSection).toBeTruthy();
      expect(coverSection).toBeTruthy();
      expect(tokenSection.classList.contains("hidden")).toBe(false);
      expect(coverSection.classList.contains("hidden")).toBe(true);
    });

    it("排版 Token 面板包含主题六选、比例三选、页码、水印与滑块", () => {
      const cardWrapper = view.cardSettingsWrapper;
      const tokenSection = cardWrapper.querySelector(".icard-settings-subpanel-token");

      // 主题按钮（6 种）
      const themeBtns = tokenSection.querySelectorAll(".apple-btn-row button[data-value]");
      const themeValues = Array.from(themeBtns)
        .map((b) => b.getAttribute("data-value"))
        .filter((v) => ["simple-white", "gradient-blue", "dark-gold", "neon-purple", "forest-green", "rose-gold"].includes(v));
      expect(themeValues).toHaveLength(6);

      // 比例按钮（3 种）
      const ratioBtns = tokenSection.querySelectorAll(".apple-btn-row button[data-value]");
      const ratioValues = Array.from(ratioBtns)
        .map((b) => b.getAttribute("data-value"))
        .filter((v) => ["3:4", "3:5", "9:16"].includes(v));
      expect(ratioValues).toHaveLength(3);

      // 页码按钮
      const pageBtn = tokenSection.querySelector('button[data-value="pageNumberEnabled"]');
      expect(pageBtn).toBeTruthy();

      // 水印输入框
      const watermarkInput = tokenSection.querySelector("input.icard-settings-text");
      expect(watermarkInput).toBeTruthy();

      // 滑块（字号、行高、边距）
      const sliders = tokenSection.querySelectorAll("input.apple-slider");
      expect(sliders.length).toBe(3);

      // 恢复默认排版按钮
      const resetBtn = Array.from(tokenSection.querySelectorAll("button")).find(
        (b) => b.textContent === "恢复默认排版"
      );
      expect(resetBtn).toBeTruthy();
    });

    it("封面设置面板包含封面开关、四字段输入与按当前笔记重新填入", () => {
      const cardWrapper = view.cardSettingsWrapper;
      const coverSection = cardWrapper.querySelector(".icard-settings-subpanel-cover");

      // 封面开关按钮
      const toggleBtn = coverSection.querySelector("button");
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.textContent).toContain("封面");

      // 字段输入框
      const inputs = coverSection.querySelectorAll("input[data-cover-key]");
      const keys = Array.from(inputs).map((i) => i.getAttribute("data-cover-key"));
      expect(keys.sort()).toEqual(["author", "date", "excerpt", "title"].sort());

      // 重新填入按钮
      const refillBtn = Array.from(coverSection.querySelectorAll("button")).find(
        (b) => b.textContent === "按当前笔记重新填入"
      );
      expect(refillBtn).toBeTruthy();
    });
  });

  describe("子 Tab 切换（switchCardSettingsSubTab）与直通打开（openCardSettingsTab）", () => {
    it("switchCardSettingsSubTab 能够在 token 与 cover 之间互相切换并更新 active / hidden 类", () => {
      const cardWrapper = view.cardSettingsWrapper;
      const tokenTabBtn = cardWrapper.querySelector('button[data-tab="token"]');
      const coverTabBtn = cardWrapper.querySelector('button[data-tab="cover"]');
      const tokenSection = cardWrapper.querySelector(".icard-settings-subpanel-token");
      const coverSection = cardWrapper.querySelector(".icard-settings-subpanel-cover");

      // 切换到 cover
      view.switchCardSettingsSubTab("cover");
      expect(view.activeCardSubTab).toBe("cover");
      expect(tokenTabBtn.classList.contains("active")).toBe(false);
      expect(coverTabBtn.classList.contains("active")).toBe(true);
      expect(tokenSection.classList.contains("hidden")).toBe(true);
      expect(coverSection.classList.contains("hidden")).toBe(false);

      // 切换回 token
      view.switchCardSettingsSubTab("token");
      expect(view.activeCardSubTab).toBe("token");
      expect(tokenTabBtn.classList.contains("active")).toBe(true);
      expect(coverTabBtn.classList.contains("active")).toBe(false);
      expect(tokenSection.classList.contains("hidden")).toBe(false);
      expect(coverSection.classList.contains("hidden")).toBe(true);
    });

    it("openCardSettingsTab: 面板隐藏时自动呼出面板并切到目标子 Tab", () => {
      view.settingsOverlay.classList.remove("visible");

      view.openCardSettingsTab("cover");
      expect(view.toggleSettingsPanel).toHaveBeenCalled();
      expect(view.activeCardSubTab).toBe("cover");
    });

    it("openCardSettingsTab: 面板已可见时不重复呼出 toggleSettingsPanel", () => {
      view.settingsOverlay.classList.add("visible");

      view.openCardSettingsTab("token");
      expect(view.toggleSettingsPanel).not.toHaveBeenCalled();
      expect(view.activeCardSubTab).toBe("token");
    });
  });

  describe("会话绑定与设置交互（有会话时）", () => {
    let session;

    beforeEach(() => {
      const testPath = "test-note.md";
      view.cardPreviewPendingInput = { sourcePathKey: testPath };
      session = view.getCardSessions().getSession(testPath);
      session.setCoverSeed({
        title: "测试标题",
        author: "测试作者",
        date: "2026-09-13",
        excerpt: "测试摘要",
      });
      view.renderCardSettingsValues();
    });

    it("点击主题按钮触发 session.applyLayoutSettings 并重排版", () => {
      const cardWrapper = view.cardSettingsWrapper;
      const themeBtn = cardWrapper.querySelector('button[data-value="neon-purple"]');
      expect(themeBtn).toBeTruthy();

      themeBtn.click();
      expect(session.getLayoutSettings().themeId).toBe("neon-purple");
      expect(view.renderCardPreview).toHaveBeenCalled();
      expect(themeBtn.classList.contains("active")).toBe(true);
    });

    it("点击比例按钮触发 session.applyLayoutSettings 并重排版", () => {
      const cardWrapper = view.cardSettingsWrapper;
      const ratioBtn = cardWrapper.querySelector('button[data-value="9:16"]');
      expect(ratioBtn).toBeTruthy();

      ratioBtn.click();
      expect(session.getLayoutSettings().ratioId).toBe("9:16");
      expect(view.renderCardPreview).toHaveBeenCalled();
      expect(ratioBtn.classList.contains("active")).toBe(true);
    });

    it("点击页码按钮切换开关状态并更新文案与状态", () => {
      const pageBtn = view.cardSettingsRefs.pageToggleBtn;
      expect(pageBtn.textContent).toContain("已开启");

      pageBtn.click();
      expect(session.getLayoutSettings().pageNumberEnabled).toBe(false);
      expect(pageBtn.textContent).toContain("已关闭");
      expect(view.renderCardPreview).toHaveBeenCalled();

      pageBtn.click();
      expect(session.getLayoutSettings().pageNumberEnabled).toBe(true);
      expect(pageBtn.textContent).toContain("已开启");
    });

    it("修改水印输入框更新 watermarkText 并重排版", () => {
      const watermarkInput = view.cardSettingsRefs.watermarkInput;
      watermarkInput.value = "我的水印";
      watermarkInput.dispatchEvent(new Event("change"));

      expect(session.getLayoutSettings().watermarkText).toBe("我的水印");
      expect(view.renderCardPreview).toHaveBeenCalled();
    });

    it("拖动字号滑块更新 fontSize 与标签文案并重排版", () => {
      const sliderRef = view.cardSettingsRefs.sliders.fontSize;
      sliderRef.input.value = "18";
      sliderRef.input.dispatchEvent(new Event("input"));

      expect(session.getLayoutSettings().fontSize).toBe(18);
      expect(sliderRef.valueEl.textContent).toBe("18px");
      expect(view.renderCardPreview).toHaveBeenCalled();
    });

    it("点击恢复默认排版回到内置出厂值并重排版", () => {
      session.applyLayoutSettings({ fontSize: 18, themeId: "dark-gold" });
      expect(session.getLayoutSettings().fontSize).toBe(18);

      view.resetCardLayoutSettings();
      expect(session.getLayoutSettings().fontSize).toBe(14);
      expect(session.getLayoutSettings().themeId).toBe("simple-white");
      expect(view.renderCardPreview).toHaveBeenCalled();
    });

    it("点击封面开关更新 coverEnabled 并显隐封面字段表单", () => {
      const coverBtn = view.cardSettingsRefs.coverToggleBtn;
      const fieldsWrap = view.cardSettingsRefs.coverFieldsWrap;

      expect(session.getLayoutSettings().coverEnabled).toBe(false);
      expect(coverBtn.textContent).toContain("已关闭");
      expect(fieldsWrap.classList.contains("hidden")).toBe(true);

      // 开启封面
      coverBtn.click();
      expect(session.getLayoutSettings().coverEnabled).toBe(true);
      expect(coverBtn.textContent).toContain("已开启");
      expect(fieldsWrap.classList.contains("hidden")).toBe(false);
      expect(view.renderCardPreview).toHaveBeenCalled();

      // 表单字段回显笔记初值
      expect(view.cardSettingsRefs.coverInputs.title.value).toBe("测试标题");
      expect(view.cardSettingsRefs.coverInputs.author.value).toBe("测试作者");
    });

    it("修改封面字段（标题/摘要）调用 applyCoverFields 并触发重排版", () => {
      session.applyLayoutSettings({ coverEnabled: true });
      view.renderCardSettingsValues();

      const titleInput = view.cardSettingsRefs.coverInputs.title;
      titleInput.value = "新自定义标题";
      titleInput.dispatchEvent(new Event("change"));

      expect(session.getCoverFields().title).toBe("新自定义标题");
      expect(view.renderCardPreview).toHaveBeenCalled();
    });

    it("点击按当前笔记重新填入调用 resetCoverFields 并恢复初值", () => {
      session.applyLayoutSettings({ coverEnabled: true });
      session.applyCoverFields({ title: "临时修改" });
      view.renderCardSettingsValues();
      expect(session.getCoverFields().title).toBe("临时修改");

      view.resetCardCoverFields();
      expect(session.getCoverFields().title).toBe("测试标题");
      expect(view.cardSettingsRefs.coverInputs.title.value).toBe("测试标题");
      expect(view.renderCardPreview).toHaveBeenCalled();
    });
  });

  // 2026-09-19：设置页的「卡片」页签被摘除，侧栏成为全局默认的唯一配置入口。
  // 排版项「调完即存」；封面字段属笔记级不落默认；导出目录不在此面板（走导出弹窗记忆）。
  describe("侧栏即全局默认（设置页卡片页签已摘除）", () => {
    let session;

    beforeEach(() => {
      const testPath = "test-note.md";
      view.cardPreviewPendingInput = { sourcePathKey: testPath };
      session = view.getCardSessions().getSession(testPath);
      view.renderCardSettingsValues();
    });

    it("调整排版同时写回全局默认，并经节流只落盘一次", () => {
      vi.useFakeTimers();
      try {
        view.plugin.saveSettings = vi.fn().mockResolvedValue(undefined);
        const themeBtn = view.cardSettingsWrapper.querySelector('button[data-value="neon-purple"]');
        themeBtn.click();

        expect(session.getLayoutSettings().themeId).toBe("neon-purple");
        expect(view.plugin.settings.cardDefaults.themeId).toBe("neon-purple");
        // 节流窗口内不写盘：滑块连续拖动（多次 input）只落一次
        expect(view.plugin.saveSettings).not.toHaveBeenCalled();

        vi.advanceTimersByTime(400);
        expect(view.plugin.saveSettings).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("尚无会话（未排版过）时调整项也记入全局默认", () => {
      view.cardPreviewPendingInput = null;
      expect(view.getCardSettingsSession()).toBeNull();

      view.applyCardLayoutSetting("fontSize", 18);
      expect(view.plugin.settings.cardDefaults.fontSize).toBe(18);
    });

    it("封面字段属笔记级，不写回全局默认", () => {
      view.applyCardCoverField("title", "改过的标题");

      expect(session.getCoverFields().title).toBe("改过的标题");
      expect(view.plugin.settings.cardDefaults.title).toBeUndefined();
      expect(view.plugin.settings.cardDefaults.coverImage).toBeUndefined();
      expect(view.plugin.settings.cardDefaults.coverPrompt).toBeUndefined();
    });

    it("恢复默认排版回到内置出厂值，并同步写回全局默认", () => {
      view.applyCardLayoutSetting("fontSize", 18);
      view.applyCardLayoutSetting("themeId", "neon-purple");
      expect(view.plugin.settings.cardDefaults.fontSize).toBe(18);

      view.resetCardLayoutSettings();

      expect(session.getLayoutSettings().fontSize).toBe(14);
      expect(session.getLayoutSettings().themeId).toBe("simple-white");
      expect(view.plugin.settings.cardDefaults.fontSize).toBe(14);
      expect(view.plugin.settings.cardDefaults.themeId).toBe("simple-white");
    });
  });
});
