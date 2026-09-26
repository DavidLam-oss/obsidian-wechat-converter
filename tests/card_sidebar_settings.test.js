/*
## 核心功能

小红书卡片侧边栏设置面板（C02 重构）测试：
验证卡片设置全量收敛至侧边栏面板（sliders 图标呼出），并具备清晰的双子 Tab（排版 Token 与 封面设置）：
1. 面板结构完整性（顶部双子 Tab、排版 Token 节、封面设置节）；
2. 子 Tab 切换（switchCardSettingsSubTab）与直通打开（openCardSettingsTab）；
   面板打开时的视图状态复位（resetCardSettingsPanelViewState，与文章模式同口径）；
3. 排版 Token 设置绑定（主题六选、比例三选、页码开关、水印、字号/行高/边距滑块；
   「恢复默认」= 切主题回该主题默认排版，面板不设独立重置按钮）；
4. 封面设置绑定（封面启用开关、字段编辑 title/author/date/excerpt、按当前笔记重新填入）；
5. 会话级隔离与响应式重排版（renderCardPreview 触发）。

## 维护规则

- 严格遵守单文件 800 行软线规范。
- 与 views/converter/card-settings.js 方法合同严格对齐。
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCardThemeDefaultTypography } from "../services/card-settings-model.js";

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
      expect(tokenTabBtn.textContent).toBe("排版样式");
      expect(coverTabBtn.textContent).toBe("封面设置");
      // 分段控件用 is-active + aria-pressed 表达位置；不再复用 apple-btn-size 的 active，
      // 避免与下方主题/比例/页码的「值被选中」在视觉上撞车。
      expect(tokenTabBtn.classList.contains("is-active")).toBe(true);
      expect(coverTabBtn.classList.contains("is-active")).toBe(false);
      expect(tokenTabBtn.getAttribute("aria-pressed")).toBe("true");
      expect(coverTabBtn.getAttribute("aria-pressed")).toBe("false");

      const tokenSection = cardWrapper.querySelector(".icard-settings-subpanel-token");
      const coverSection = cardWrapper.querySelector(".icard-settings-subpanel-cover");
      expect(tokenSection).toBeTruthy();
      expect(coverSection).toBeTruthy();
      expect(tokenSection.classList.contains("hidden")).toBe(false);
      expect(coverSection.classList.contains("hidden")).toBe(true);
    });

    it("排版样式面板包含主题六选、比例三选、页码、水印与滑块", () => {
      const cardWrapper = view.cardSettingsWrapper;
      const tokenSection = cardWrapper.querySelector(".icard-settings-subpanel-token");

      // 主题按钮（6 种，2026-09-20 起排成 2 行 × 3 列网格）
      const themeBtns = tokenSection.querySelectorAll(".icard-grid-3 button[data-value]");
      const themeValues = Array.from(themeBtns)
        .map((b) => b.getAttribute("data-value"))
        .filter((v) => ["simple-white", "gradient-blue", "dark-gold", "neon-purple", "forest-green", "rose-gold"].includes(v));
      expect(themeValues).toHaveLength(6);

      // 比例按钮（3 种，2026-09-20 起为「形状示意 + 数值」卡片，文字描述降级为 title）
      const ratioBtns = tokenSection.querySelectorAll(".icard-settings-ratios button[data-value]");
      const ratioValues = Array.from(ratioBtns)
        .map((b) => b.getAttribute("data-value"))
        .filter((v) => ["3:4", "3:5", "9:16"].includes(v));
      expect(ratioValues).toHaveLength(3);
      // 按钮面只写数值，形状示意由 data-ratio 驱动；「竖版/长竖版」不再上按钮
      for (const btn of ratioBtns) {
        expect(btn.querySelector(".icard-ratio-shape")?.getAttribute("data-ratio")).toBe(btn.getAttribute("data-value"));
        expect(btn.querySelector(".icard-ratio-text")?.textContent).toBe(btn.getAttribute("data-value"));
        expect(btn.textContent).not.toContain("竖版");
      }

      // 正文页码：开关（说明在左、开关在右），不再是「页码 · 已开启」按钮
      const pageRow = tokenSection.querySelector(".icard-settings-toggle-row");
      expect(pageRow).toBeTruthy();
      expect(pageRow.querySelector(".icard-settings-toggle-label").textContent).toBe("显示页脚页码");
      // 冗余小字已移除，保持清爽
      expect(pageRow.querySelector(".icard-settings-toggle-desc")).toBeNull();
      const pageToggle = pageRow.querySelector("input.apple-toggle-input");
      expect(pageToggle).toBeTruthy();
      expect(pageToggle.checked).toBe(true);
      // 开关自带状态表达 → 不再回显「已开启 / 已关闭」文案
      expect(pageRow.textContent).not.toContain("已开启");

      // 水印输入框
      const watermarkInput = tokenSection.querySelector("input.icard-settings-text");
      expect(watermarkInput).toBeTruthy();

      // 滑块（字号、行高、边距）——折叠在「字号与间距」里，默认收起
      const tuneGroup = tokenSection.querySelector("details.icard-settings-tune");
      expect(tuneGroup).toBeTruthy();
      expect(tuneGroup.open).toBe(false);
      expect(tuneGroup.querySelector(".apple-settings-summary").textContent).toContain("字号与间距");

      const sliders = tuneGroup.querySelectorAll("input.apple-slider");
      expect(sliders.length).toBe(3);

      // 摘要回显当前值：不展开也知道现状
      expect(tuneGroup.querySelector(".icard-settings-tune-values").textContent).toMatch(
        /^字号 \d+px · 行高 [\d.]+ · 边距 \d+px$/
      );

      // 不设「恢复默认排版」按钮：换主题即取默认（2026-09-20 与文章模式对齐）
      const resetBtn = Array.from(tokenSection.querySelectorAll("button")).find(
        (b) => b.textContent === "恢复默认排版"
      );
      expect(resetBtn).toBeUndefined();
    });

    it("封面设置面板包含封面开关、四字段输入与按当前笔记重新填入", () => {
      const cardWrapper = view.cardSettingsWrapper;
      const coverSection = cardWrapper.querySelector(".icard-settings-subpanel-cover");

      // 封面开关：.apple-toggle 里的 checkbox（状态由开关本体表达，不是一枚写着
      // 「封面 · 已开启」的按钮 —— 原来那条按钮断言靠「AI 生成封面图」文案含「封面」
      // 侥幸通过，2026-09-21 改版后主操作文案不再含「封面」，改为直接断言开关本体）
      const toggleInput = coverSection.querySelector(".icard-settings-toggle-row .apple-toggle-input");
      expect(toggleInput).toBeTruthy();

      // 字段输入框：四字段（标题 / 作者 / 日期 / 摘要，均为上下单列）
      const inputs = coverSection.querySelectorAll("input[data-cover-key]");
      const keys = Array.from(inputs).map((i) => i.getAttribute("data-cover-key"));
      expect(keys.sort()).toEqual(["author", "date", "excerpt", "title"].sort());

      // 重新填入：低权重文字按钮（不再与主操作同款）
      const refillBtn = coverSection.querySelector(".icard-settings-cover-link");
      expect(refillBtn?.textContent).toBe("按当前笔记重新填入");
    });

    it("封面下拉自带箭头：background-image 不被 background 简写清空（2026-09-21 真机回归）", () => {
      // 真机反馈「不知道这几个下拉能展开」：原生 select 外观被清掉，箭头图又被
      // `background` 简写一并重置 → 只剩一个方框。这条守卫盯住「自绘箭头三件套」。
      const { readFileSync } = require("node:fs");
      const css = readFileSync("styles/card-settings.css", "utf8");
      const block = css.match(/\.icard-settings-select\s*\{[^}]*\}/);
      expect(block).toBeTruthy();
      const rule = block[0];

      expect(rule).toMatch(/appearance:\s*none/);
      expect(rule).toMatch(/background-image:\s*url\(/);
      expect(rule).toMatch(/background-position:\s*right/);
      expect(rule).toMatch(/padding:\s*[^;]*26px/);
      // ⚠️ 回归点：`background` 简写会把 background-image 一起重置（下拉变没箭头）
      expect(rule).not.toMatch(/(?:^|[;\s])background\s*:/);
      // 暗色主题要换浅色箭头，否则深底上看不见
      expect(css).toMatch(/\.theme-dark\s+\.icard-settings-select\s*\{[^}]*background-image:\s*url\(/);
    });
  });

  describe("子 Tab 切换（switchCardSettingsSubTab）与直通打开（openCardSettingsTab）", () => {
    it("switchCardSettingsSubTab 能够在 token 与 cover 之间互相切换并更新 is-active / hidden 类", () => {
      const cardWrapper = view.cardSettingsWrapper;
      const tokenTabBtn = cardWrapper.querySelector('button[data-tab="token"]');
      const coverTabBtn = cardWrapper.querySelector('button[data-tab="cover"]');
      const tokenSection = cardWrapper.querySelector(".icard-settings-subpanel-token");
      const coverSection = cardWrapper.querySelector(".icard-settings-subpanel-cover");

      // 切换到 cover
      view.switchCardSettingsSubTab("cover");
      expect(view.activeCardSubTab).toBe("cover");
      expect(tokenTabBtn.classList.contains("is-active")).toBe(false);
      expect(coverTabBtn.classList.contains("is-active")).toBe(true);
      expect(tokenTabBtn.getAttribute("aria-pressed")).toBe("false");
      expect(coverTabBtn.getAttribute("aria-pressed")).toBe("true");
      expect(tokenSection.classList.contains("hidden")).toBe(true);
      expect(coverSection.classList.contains("hidden")).toBe(false);

      // 切换回 token
      view.switchCardSettingsSubTab("token");
      expect(view.activeCardSubTab).toBe("token");
      expect(tokenTabBtn.classList.contains("is-active")).toBe(true);
      expect(coverTabBtn.classList.contains("is-active")).toBe(false);
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

  // 2026-09-21 David：面板「打开即回默认视图」，与文章模式同一套 handling——
  // 上次停在哪一页、开合过哪个折叠组都不跨次残留。⚠️ 复位只针对**视图状态**，
  // 主题/开关/滑块/封面字段等取值必须原样保留。
  describe("面板视图状态复位（resetCardSettingsPanelViewState）", () => {
    it("子 Tab 记忆保留上次位置（如留在封面设置）、两个折叠组回默认开合，取值一律不动", () => {
      const refs = view.cardSettingsRefs;
      const wrapper = view.cardSettingsWrapper;

      // 制造「上次的残留」：切到封面设置 + 展开字号与间距 + 手动收起过封面画面
      view.switchCardSettingsSubTab("cover");
      refs.tuneGroup.open = true;
      refs.coverAiDetails.open = false;
      refs.coverAiDetails.dispatchEvent(new Event("toggle"));
      expect(refs.coverAiUserToggled).toBe(true);

      const settingsBefore = view.getCurrentCardLayoutSettings();

      view.resetCardSettingsPanelViewState();

      // ① 子 Tab 记忆保留上次用户所处的页签（即保持在 cover，方便用户继续调整）
      expect(view.activeCardSubTab).toBe("cover");
      expect(wrapper.querySelector('button[data-tab="token"]').classList.contains("is-active")).toBe(false);
      expect(wrapper.querySelector('button[data-tab="cover"]').classList.contains("is-active")).toBe(true);
      expect(wrapper.querySelector(".icard-settings-subpanel-token").classList.contains("hidden")).toBe(true);
      expect(wrapper.querySelector(".icard-settings-subpanel-cover").classList.contains("hidden")).toBe(false);

      // ② 「字号与间距」固定收起（对应文章模式的高级选项）
      expect(refs.tuneGroup.open).toBe(false);

      // ③ 「封面画面」进阶 AI 生图默认保持收起（平铺摄影/本地为主力），手动开合标记被清掉
      expect(refs.coverAiUserToggled).toBe(false);
      expect(refs.coverAiDetails.open).toBe(false);

      // ④ 取值不受影响（复位不等于悄悄改用户设置）
      expect(view.getCurrentCardLayoutSettings()).toEqual(settingsBefore);
    });

    it("resetSettingsPanelViewState：卡片模式下面板打开时同口径复位（含滚动归零）；文章模式不触碰卡片面板", () => {
      view.settingsArea.scrollTop = 120;

      view.switchCardSettingsSubTab("cover");
      view.cardSettingsRefs.tuneGroup.open = true;
      view.previewMode = "card";
      view.resetSettingsPanelViewState();

      // 保留当前子 Tab（保持在 cover），折叠组和滚动位置正常复位
      expect(view.activeCardSubTab).toBe("cover");
      expect(view.cardSettingsRefs.tuneGroup.open).toBe(false);
      expect(view.settingsArea.scrollTop).toBe(0);

      // 文章模式：卡片面板不可见，复位动作不该落到卡片视图上
      view.switchCardSettingsSubTab("cover");
      view.previewMode = "article";
      view.resetSettingsPanelViewState();
      expect(view.activeCardSubTab).toBe("cover");
    });

    it("关闭后再打开（真机路径 toggleSettingsPanel）记忆保留上次停留的子 Tab（如留在封面设置）", () => {
      // ⚠️ 走真方法：beforeEach 把这个方法替身成了 mock，用它断言等于自证
      view.toggleSettingsPanel = AppleStyleView.prototype.toggleSettingsPanel.bind(view);
      view.previewMode = "card";

      // 第一次打开 → 留下残留（切封面设置 + 展开字号与间距）
      view.toggleSettingsPanel();
      expect(view.settingsOverlay.classList.contains("visible")).toBe(true);
      view.switchCardSettingsSubTab("cover");
      view.cardSettingsRefs.tuneGroup.open = true;

      // 关闭
      view.toggleSettingsPanel();
      expect(view.settingsOverlay.classList.contains("visible")).toBe(false);

      // 再次打开 → 记忆保留留在封面设置页，折叠组正常复位收起
      view.toggleSettingsPanel();
      expect(view.activeCardSubTab).toBe("cover");
      expect(view.cardSettingsRefs.tuneGroup.open).toBe(false);
    });

    // 顺序守卫：复位发生在「打开」这一刻，而预览区封面芯片是**显式意图**，
    // 必须在复位之后应用——否则点芯片会被复位拽回「排版 Token」页。
    it("封面芯片直通打开（openCardSettingsTab）仍然停在「封面设置」页", () => {
      view.toggleSettingsPanel = AppleStyleView.prototype.toggleSettingsPanel.bind(view);
      view.previewMode = "card";
      view.settingsOverlay.classList.remove("visible");

      view.openCardSettingsTab("cover");

      expect(view.settingsOverlay.classList.contains("visible")).toBe(true);
      expect(view.activeCardSubTab).toBe("cover");
      expect(
        view.cardSettingsWrapper.querySelector(".icard-settings-subpanel-cover").classList.contains("hidden"),
      ).toBe(false);
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

    it("切换页码开关更新 pageNumberEnabled 并重排版", () => {
      const checkbox = view.cardSettingsRefs.pageToggleInput;
      expect(checkbox.checked).toBe(true);

      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change"));
      expect(session.getLayoutSettings().pageNumberEnabled).toBe(false);
      expect(view.renderCardPreview).toHaveBeenCalled();

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));
      expect(session.getLayoutSettings().pageNumberEnabled).toBe(true);
    });

    it("点击开关行（非开关本体）同样能切换页码", () => {
      const label = view.cardSettingsWrapper.querySelector(
        ".icard-settings-toggle-row .icard-settings-toggle-label"
      );
      label.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(session.getLayoutSettings().pageNumberEnabled).toBe(false);
      expect(view.cardSettingsRefs.pageToggleInput.checked).toBe(false);
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

    it("选主题连同该主题的默认排版一起应用并重排版", () => {
      session.applyLayoutSettings({ fontSize: 18, lineHeight: 2.1, pagePadding: 46 });
      expect(session.getLayoutSettings().fontSize).toBe(18);

      const themeId = "dark-gold";
      const defaults = getCardThemeDefaultTypography(themeId);
      view.applyCardTheme(themeId);

      expect(session.getLayoutSettings().themeId).toBe(themeId);
      expect(session.getLayoutSettings().fontSize).toBe(defaults.fontSize);
      expect(session.getLayoutSettings().lineHeight).toBe(defaults.lineHeight);
      expect(session.getLayoutSettings().pagePadding).toBe(defaults.pagePadding);
      expect(view.renderCardPreview).toHaveBeenCalled();
    });

    it("A 改乱 → 去 B → 回 A 即回到 A 的默认排版（取代「恢复默认」按钮）", () => {
      const themeId = "dark-gold";
      const defaults = getCardThemeDefaultTypography(themeId);

      view.applyCardTheme(themeId);
      session.applyLayoutSettings({ fontSize: 18, pagePadding: 46 });
      expect(session.getLayoutSettings().fontSize).toBe(18);

      view.applyCardTheme("neon-purple");
      view.applyCardTheme(themeId);

      expect(session.getLayoutSettings().themeId).toBe(themeId);
      expect(session.getLayoutSettings().fontSize).toBe(defaults.fontSize);
      expect(session.getLayoutSettings().pagePadding).toBe(defaults.pagePadding);
    });

    it("切换封面开关更新 coverEnabled 并显隐封面字段表单", () => {
      const coverToggle = view.cardSettingsRefs.coverToggleInput;
      // 2026-09-21 改版：字段区不再是一个裸容器，而是「封面文案」分节 +「封面画面」折叠组
      const fieldsHidden = view.cardSettingsRefs.coverFieldsHidden;
      expect(fieldsHidden.length).toBe(2);

      expect(session.getLayoutSettings().coverEnabled).toBe(false);
      expect(coverToggle.checked).toBe(false);
      for (const el of fieldsHidden) expect(el.classList.contains("hidden")).toBe(true);

      // 开启封面
      coverToggle.checked = true;
      coverToggle.dispatchEvent(new Event("change"));
      expect(session.getLayoutSettings().coverEnabled).toBe(true);
      for (const el of fieldsHidden) expect(el.classList.contains("hidden")).toBe(false);
      expect(view.renderCardPreview).toHaveBeenCalled();

      // 表单字段回显笔记初值
      expect(view.cardSettingsRefs.coverInputs.title.value).toBe("测试标题");
      expect(view.cardSettingsRefs.coverInputs.author.value).toBe("测试作者");
    });

    it("封面设置分区：分节结构 + 主操作唯一 + 作者日期上下两行（2026-09-21 改版）", () => {
      session.applyLayoutSettings({ coverEnabled: true });
      view.renderCardSettingsValues();
      const coverPanel = view.cardSettingsWrapper.querySelector(".icard-settings-subpanel-cover");

      // 三节：封面页（开关）+ 封面画面 + 封面文案
      const labels = Array.from(coverPanel.querySelectorAll(".apple-setting-section"))
        .map((s) => s.querySelector(".apple-setting-label")?.textContent);
      expect(labels).toEqual(["封面页", "封面画面", "封面文案"]);

      const aiDetails = coverPanel.querySelector("details.icard-settings-cover-ai");
      expect(aiDetails).toBeTruthy();
      expect(aiDetails.querySelector("summary")?.textContent).toContain("AI 生图进阶设置");

      // 作者 + 日期 上下两行（2026-09-21 真机回归：320px 下并排两列摆不下，已撤回）
      const copySection = Array.from(coverPanel.querySelectorAll(".apple-setting-section"))
        .find((s) => s.querySelector(".apple-setting-label")?.textContent === "封面文案");
      expect(Array.from(copySection.querySelectorAll("input[data-cover-key]"))
        .map((i) => i.getAttribute("data-cover-key")))
        .toEqual(["title", "author", "date", "excerpt"]);
      expect(coverPanel.querySelector(".icard-settings-cover-duo")).toBeNull();

      // 主操作唯一：全场只有一枚蓝色实底按钮；三连同款的 .apple-btn-size 不再出现
      expect(coverPanel.querySelectorAll(".icard-settings-cover-primary").length).toBe(1);
      expect(coverPanel.querySelectorAll(".apple-btn-size").length).toBe(0);
      // 「重新填入」降级为文字按钮，「移除配图」降级为小号幽灵按钮
      expect(coverPanel.querySelector(".icard-settings-cover-link")).toBeTruthy();
      expect(coverPanel.querySelector(".icard-settings-cover-remove")).toBeTruthy();
    });

    it("封面画面折叠组：摘要回显风格·呈现·配图状态，折叠默认态跟随有无配图", () => {
      session.applyLayoutSettings({ coverEnabled: true });
      view.renderCardSettingsValues();
      const echo = view.cardSettingsRefs.coverGroupEcho;
      const details = view.cardSettingsRefs.coverAiDetails;

      // AI 折叠组仅回显自身预设风格（与实际配图解绑，避免误导），且默认收起
      expect(echo.textContent).toContain("3D 粘土质感");
      expect(echo.textContent).toContain("预设风格");
      expect(details.open).toBe(false);

      // 版式选项包含纯文字排版、自适应、底图和海报
      const modeSelect = view.cardSettingsRefs.coverModeSelect;
      const modeValues = Array.from(modeSelect.options).map((o) => o.value);
      expect(modeValues).toContain("none");
      expect(modeValues).toContain("adaptive");

      // 换风格 → 摘要即时跟着变
      view.cardSettingsRefs.coverStyleSelect.value = "minimal-vector";
      view.cardSettingsRefs.coverStyleSelect.dispatchEvent(new Event("change"));
      expect(view.cardSettingsRefs.coverGroupEcho.textContent).toContain("扁平矢量插画");

      // 用户手动展开后，后续同步不再擅自收起（避免「刚展开又被代码收起来」）
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
      view.renderCardSettingsValues();
      expect(details.open).toBe(true);
    });

    it("渐进披露：纯文字模式折叠图源工具并隐藏配图卡，点击添加配图或移除配图自适应联动", () => {
      session.applyLayoutSettings({ coverEnabled: true });
      session.applyCoverFields({ coverMode: "none", coverImage: "data:image/png;base64,abc" });
      view.renderCardSettingsValues();

      const refs = view.cardSettingsRefs;
      // ① 纯文字模式下：唤起按钮可见，工具组折叠隐藏，配图预览卡隐藏（即使有 coverImage 也不展示）
      expect(refs.coverAddImageBtn.classList.contains("hidden")).toBe(false);
      expect(refs.coverImageToolsWrap.classList.contains("hidden")).toBe(true);
      expect(refs.coverImagePreviewWrap.classList.contains("hidden")).toBe(true);

      // ② 点击「添加封面配图」快速唤起入口：切换为 adaptive 版式并展开工具组
      refs.coverAddImageBtn.click();
      expect(session.getCoverFields().coverMode).toBe("adaptive");
      view.renderCardSettingsValues();

      expect(refs.coverAddImageBtn.classList.contains("hidden")).toBe(true);
      expect(refs.coverImageToolsWrap.classList.contains("hidden")).toBe(false);
      // 有 coverImage 且处于 adaptive 时，配图卡正常展示
      expect(refs.coverImagePreviewWrap.classList.contains("hidden")).toBe(false);

      // ③ 点击配图卡「移除」按钮：清除图片并自动切回纯文字模式
      refs.coverImageRemoveBtn.click();
      expect(session.getCoverFields().coverMode).toBe("none");
      expect(session.getCoverFields().coverImage).toBe("");
      view.renderCardSettingsValues();

      expect(refs.coverAddImageBtn.classList.contains("hidden")).toBe(false);
      expect(refs.coverImageToolsWrap.classList.contains("hidden")).toBe(true);
      expect(refs.coverImagePreviewWrap.classList.contains("hidden")).toBe(true);
    });

    it("点击封面开关行（非开关本体）同样能切换封面", () => {
      const row = view.cardSettingsWrapper.querySelector(".icard-settings-subpanel-cover .icard-settings-toggle-row");
      expect(row).toBeTruthy();

      row.click();
      expect(session.getLayoutSettings().coverEnabled).toBe(true);

      row.click();
      expect(session.getLayoutSettings().coverEnabled).toBe(false);
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

    it("选主题时连同默认排版一起写回全局默认", () => {
      view.applyCardLayoutSetting("fontSize", 18);
      view.applyCardLayoutSetting("themeId", "neon-purple");
      expect(view.plugin.settings.cardDefaults.fontSize).toBe(18);

      const themeId = "dark-gold";
      const defaults = getCardThemeDefaultTypography(themeId);
      view.applyCardTheme(themeId);

      expect(session.getLayoutSettings().themeId).toBe(themeId);
      expect(session.getLayoutSettings().fontSize).toBe(defaults.fontSize);
      expect(view.plugin.settings.cardDefaults.themeId).toBe(themeId);
      expect(view.plugin.settings.cardDefaults.fontSize).toBe(defaults.fontSize);
      expect(view.plugin.settings.cardDefaults.pagePadding).toBe(defaults.pagePadding);
    });
  });
});
