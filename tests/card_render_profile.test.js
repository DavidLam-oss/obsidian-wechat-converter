/*
## 核心功能

A03 单测：验证 services/card-render-profile.js 与 card-themes.js / card-render-engine.js 的页面装配与安全边界（jsdom，不涉及真实截图捕获——捕获验证归实机检查点 A03 ④ / A06）。

## 维护规则

- 修改 card-render-profile.js / card-themes.js / card-render-engine.js 的装配行为时同步本文件。
*/

import { describe, it, expect } from "vitest";
import { createCardDocument } from "../services/card-document.js";
import { getCardTheme, hasCardTheme, buildCardPageCss, DEFAULT_CARD_THEME_ID, CARD_THEME_IDS } from "../services/card-themes.js";
import { renderInlineMarkdown, renderBlockElement } from "../services/card-render-profile.js";
import { assembleCardPage, ensurePageStyle, attachOffscreenContainer, capturePage, RATIO_PRESETS, CAPTURE_LIBRARY_IDS } from "../services/card-render-engine.js";

const SAMPLE = [
  "# 标题一",
  "",
  "正文段落：**加粗**、*斜体*、[链接](https://example.com)、`code`。",
  "",
  "![本地图片](./assets/sample.png)",
  "",
  "- [x] 已完成",
  "- [ ] 未完成",
  "",
  "> [!note] 提示标题",
  "> callout 内容第一行。",
  "",
  "| 列A | 列B |",
  "| --- | --- |",
  "| a1 | b1 |",
  "",
  "<script>alert(1)</script>",
].join("\n");

const theme = getCardTheme(DEFAULT_CARD_THEME_ID);

describe("card-themes", () => {
  it("三主题 id 已声明；一期仅清晰笔记可用，未知 id 回落默认", () => {
    expect(CARD_THEME_IDS).toEqual(["clear-notes", "paper-notes", "dark-take"]);
    expect(hasCardTheme("clear-notes")).toBe(true);
    expect(hasCardTheme("paper-notes")).toBe(false);
    expect(getCardTheme("paper-notes").id).toBe(DEFAULT_CARD_THEME_ID);
    expect(getCardTheme("clear-notes").name).toBe("清晰笔记");
  });

  it("页面 CSS 全部显式颜色且以 .icard 作用域开头，无宿主主题变量", () => {
    const css = buildCardPageCss(theme);
    expect(css.trim().startsWith(".icard")).toBe(true);
    expect(css).not.toContain("var(--background");
    expect(css).not.toContain("var(--text-");
    expect(css).toContain("#ffffff");
  });
});

describe("card-render-profile 安全边界", () => {
  it("行内语义：加粗/斜体/链接/行内代码构建为对应元素", () => {
    const frag = renderInlineMarkdown("**b** *i* [l](https://example.com) `c`");
    const strong = frag.querySelector("strong");
    const em = frag.querySelector("em");
    const a = frag.querySelector("a");
    const code = frag.querySelector("code");
    expect(strong && strong.textContent).toBe("b");
    expect(em && em.textContent).toBe("i");
    expect(a && a.getAttribute("href")).toBe("https://example.com");
    expect(code && code.textContent).toBe("c");
  });

  it("原始 HTML 被转义为文本，不产生元素注入", () => {
    const frag = renderInlineMarkdown("前 <img src=x onerror=alert(1)> 后");
    expect(frag.querySelector("img")).toBeNull();
    expect(frag.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("javascript: 链接降级为纯文本", () => {
    const frag = renderInlineMarkdown("[点我](javascript:alert(1))");
    expect(frag.querySelector("a")).toBeNull();
    expect(frag.textContent).toContain("点我");
  });
});

describe("card-render-engine 页面装配", () => {
  it("装配 .icard-page：内容/页脚齐备，省略块不出现，脚本块被诊断为省略", () => {
    const doc = createCardDocument(SAMPLE);
    const page = assembleCardPage({ theme, doc, pageNumber: 1, pageCount: 1 });
    expect(page.className).toContain("icard-page");
    expect(page.querySelector(".icard-footer .icard-page-num").textContent).toBe("1 / 1");
    expect(page.querySelector("h1").textContent).toBe("标题一");
    expect(page.querySelector("blockquote .icard-callout-title").textContent).toBe("提示标题");
    // callout 标题不残留正文：标题文字只出现在 .icard-callout-title
    const calloutQuote = page.querySelector("blockquote");
    const bodyText = Array.from(calloutQuote.children)
      .filter((el) => !el.classList.contains("icard-callout-title"))
      .map((el) => el.textContent)
      .join("\n");
    expect(bodyText).not.toContain("提示标题");
    expect(calloutQuote.querySelectorAll("p").length).toBe(
      Array.from(calloutQuote.querySelectorAll("p")).filter((p) => p.textContent.trim()).length
    );
    expect(page.querySelectorAll("table tr")).toHaveLength(2);
    // script 块是省略诊断（unsupportedEmbed），不出现在成品 DOM
    expect(page.querySelector("script")).toBeNull();
    // 图片：无 resolver 时跳过，不产生未校验 src
    expect(page.querySelector("img")).toBeNull();
    // 省略诊断存在
    expect(doc.omissionSummary.unsupportedEmbed).toBe(1);
  });

  it("resolveImageSrc 提供合法 src 时图片渲染", () => {
    const doc = createCardDocument(SAMPLE);
    const page = assembleCardPage({
      theme,
      doc,
      resolveImageSrc: (ref) => (ref.endsWith("sample.png") ? "data:image/png;base64,AAA" : null),
    });
    const img = page.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("data:image/png;base64,AAA");
  });

  it("比例预设：3:4 / 3:5 / 9:16 逻辑尺寸", () => {
    expect(RATIO_PRESETS["3:4"]).toEqual({ width: 375, height: 500 });
    expect(RATIO_PRESETS["3:5"]).toEqual({ width: 375, height: 625 });
    expect(RATIO_PRESETS["9:16"]).toEqual({ width: 375, height: 667 });
  });

  it("任务项：勾选框渲染且 [x]/[ ] 文本前缀被剥离", () => {
    const doc = createCardDocument("- [x] 已完成任务\n- [ ] 未完成任务");
    const listBlock = doc.blocks.find((b) => b.type === "list");
    const list = /** @type {HTMLUListElement} */ (
      renderBlockElement(listBlock, { doc: document })
    );
    const items = list.querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0].classList.contains("icard-task-done")).toBe(true);
    expect(items[0].querySelector(".icard-task-box").textContent).toBe("✓");
    expect(items[0].textContent).not.toContain("[x]");
    expect(items[0].textContent).toContain("已完成任务");
    expect(items[1].textContent).not.toContain("[ ]");
    expect(items[1].textContent).toContain("未完成任务");
  });

  it("嵌套列表：子列表渲染为嵌套 ul，父项文本不混入子项内容", () => {
    const md = [
      "- 列表项一",
      "- 列表项二",
      "  - 嵌套项 2.1",
      "  - 嵌套项 2.2",
      "- 列表项三",
    ].join("\n");
    const doc = createCardDocument(md);
    const listBlock = doc.blocks.find((b) => b.type === "list");
    const nestedItem = listBlock.items.find((item) => item.hasNestedList);
    expect(nestedItem.childList.items.map((c) => c.text)).toEqual(["嵌套项 2.1", "嵌套项 2.2"]);
    expect(listBlock.items.find((i) => i.text === "列表项三")).toBeTruthy();

    const list = /** @type {HTMLUListElement} */ (renderBlockElement(listBlock, { doc: document }));
    // 显式 marker（不依赖 ::marker，规避捕获引擎/宿主环境差异）
    const markers = list.querySelectorAll("li > .icard-marker");
    expect(markers.length).toBe(5);
    expect([...markers].every((m) => m.textContent === "•")).toBe(true);
    const nestedUl = list.querySelector("li ul");
    expect(nestedUl).not.toBeNull();
    expect(nestedUl.querySelectorAll("li").length).toBe(2);
    expect(nestedUl.textContent).toContain("嵌套项 2.1");
    // 父项 li 的直接文本不包含子项内容
    const parentLi = nestedUl.parentElement;
    const directText = Array.from(parentLi.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join("");
    expect(directText).not.toContain("嵌套项");
  });

  it("有序列表 marker 用显式编号且尊重 listStart", () => {
    const doc = createCardDocument("5. 第五项\n6. 第六项");
    const listBlock = doc.blocks.find((b) => b.type === "list" && b.ordered);
    expect(listBlock.listStart).toBe(5);
    const list = /** @type {HTMLOListElement} */ (renderBlockElement(listBlock, { doc: document }));
    const markers = [...list.querySelectorAll("li > .icard-marker")];
    expect(markers.map((m) => m.textContent)).toEqual(["5.", "6."]);
  });

  it("未知捕获库直接拒绝", async () => {
    await expect(capturePage(document.createElement("div"), { library: "unknown" })).rejects.toThrow(
      /unknown capture library/
    );
    expect(CAPTURE_LIBRARY_IDS).toEqual(["modern-screenshot"]);
  });

  it("离屏容器参与布局（非 display:none）且可干净移除", () => {
    const { container, detach } = attachOffscreenContainer(document);
    expect(document.body.contains(container)).toBe(true);
    expect(container.style.display).not.toBe("none");
    expect(container.classList.contains("icard-offscreen")).toBe(true);
    detach();
    expect(document.body.contains(container)).toBe(false);
  });

  it("ensurePageStyle 幂等注入且内容随主题更新", () => {
    const existing = document.getElementById("icard-theme-style");
    if (existing) existing.remove();
    const style1 = ensurePageStyle(theme);
    const style2 = ensurePageStyle(theme);
    expect(style1).toBe(style2);
    expect(style1.textContent).toContain("#ffffff");
    style1.remove();
  });
});
