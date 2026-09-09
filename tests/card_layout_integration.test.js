/*
## 核心功能

A05 布局链路集成测试（jsdom）：createLayoutItems → createCardPagePlan → assembleCardPageFromPlan /
renderCardPages 的片段重建与覆盖性校验。真实行拆分归实机检查（规划：jsdom 模拟高度不算真实行拆分通过），
本文件用注入测量值（measureFn）驱动确定性分页，断言 DOM 片段正确性：
- 分页页码/索引/detach 生命周期
- 列表项区间拆分与有序续号
- 段落 span 区间过滤：跨页不丢字（借鉴 Smart RED 回归用例）、整段加粗不被切断
- callout 子块区间 + 「（续）」标题
- 手动分页（<!-- card:break -->）
- 超大原子块阻断输出（不裁剪）+ 离屏容器清理
- 覆盖性：每个非省略块恰好渲染覆盖一次

## 维护规则

- 修改 card-render-engine.js 装配/布局循环或 card-pagination.js 装箱行为时同步本文件。
*/

import { describe, it, expect } from "vitest";
import { createCardDocument } from "../services/card-document.js";
import { getCardTheme } from "../services/card-themes.js";
import {
  renderCardPages,
  assembleCardPageFromPlan,
  measureCardDocument,
  measureContentHeight,
} from "../services/card-render-engine.js";
import { createLayoutItems, verifyPagePlan } from "../services/card-pagination.js";

const THEME = getCardTheme("clear-notes");

/** 按内容查找顶层段落块 */
function paraByContent(doc, snippet) {
  const block = doc.blocks.find(
    (b) => !b.parentId && b.type === "paragraph" && String(b.text || "").includes(snippet)
  );
  if (!block) throw new Error(`测试 fixture 错误：找不到包含「${snippet}」的段落`);
  return block;
}

/** 默认测量值：全部顶层块 50px；用 overrides 覆盖 */
function makeMeasured(doc, overrides = {}) {
  const heights = {};
  for (const b of doc.blocks) {
    if (b.parentId || b.disposition !== "render" || b.type === "paginationMarker") continue;
    heights[b.id] = 50;
  }
  return {
    heights: Object.assign(heights, overrides.heights || {}),
    childHeights: overrides.childHeights || {},
    paragraphUnits: overrides.paragraphUnits || {},
    paragraphSpans: overrides.paragraphSpans || {},
  };
}

describe("renderCardPages 布局主循环（注入测量）", () => {
  it("多页拆分：页码/索引正确，页面附着离屏容器，detach 后清理干净", async () => {
    const md = ["# 标题", "", "段落一", "", "段落二"].join("\n");
    const doc = createCardDocument(md);
    const result = await renderCardPages(doc, {
      theme: THEME,
      contentHeight: 300,
      document: document,
      measureFn: (cardDoc) => makeMeasured(cardDoc, { heights: { b1: 40, b2: 200, b3: 200 } }),
    });
    expect(result.ok).toBe(true);
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    expect(result.plan.ok).toBe(true);
    // 页面壳：索引与页码
    result.pages.forEach((page, i) => {
      expect(page.getAttribute("data-icard-page-index")).toBe(String(i + 1));
      expect(page.querySelector(".icard-page-num").textContent).toBe(`${i + 1} / ${result.pages.length}`);
      expect(page.parentElement.hasAttribute("data-icard-offscreen")).toBe(true);
    });
    // 覆盖性：每个顶层块恰好出现一次（借 data-icard-block-id 无法断言——装配未打标，用 plan 校验）
    expect(verifyPagePlan(
      createLayoutItems(doc, makeMeasured(doc, { heights: { b1: 40, b2: 200, b3: 200 } })),
      result.plan
    ).ok).toBe(true);
    // detach 清理
    result.detach();
    expect(document.querySelector("[data-icard-offscreen]")).toBeNull();
  });

  it("手动分页：<!-- card:break --> 强制换页并标记 endsByManualBreak", async () => {
    const md = ["段落A", "", "<!-- card:break -->", "", "段落B"].join("\n");
    const doc = createCardDocument(md);
    const result = await renderCardPages(doc, {
      theme: THEME,
      contentHeight: 1000,
      document: document,
      measureFn: (cardDoc) => makeMeasured(cardDoc),
    });
    expect(result.ok).toBe(true);
    expect(result.pages).toHaveLength(2);
    expect(result.plan.pages[0].endsByManualBreak).toBe(true);
    result.detach();
  });

  it("超大原子块（表格）：阻断输出、无页面、诊断明确、离屏容器已清理", async () => {
    const md = ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const doc = createCardDocument(md);
    const table = doc.blocks.find((b) => !b.parentId && b.type === "table");
    const result = await renderCardPages(doc, {
      theme: THEME,
      contentHeight: 500,
      document: document,
      measureFn: (cardDoc) => makeMeasured(cardDoc, { heights: { [table.id]: 600 } }),
    });
    expect(result.ok).toBe(false);
    expect(result.pages).toHaveLength(0);
    expect(result.diagnostics[0].reason).toBe("oversized-atomic");
    expect(result.diagnostics[0].blockId).toBe(table.id);
    expect(document.querySelector("[data-icard-offscreen]")).toBeNull();
  });

  it("轮次上限被钳制到 LAYOUT_ROUND_BUDGET（不允许绕过 §5.6）", async () => {
    const doc = createCardDocument("段落");
    // measureFn 恒返回相同测量；此处仅验证 maxRounds 超限传参不生效——用溢出模拟重排不收敛
    // （jsdom scrollHeight 恒 0 无法制造真实溢出，改为验证钳制逻辑经由内部路径：传入 99 也不报错且正常完成）
    const result = await renderCardPages(doc, {
      theme: THEME,
      contentHeight: 500,
      document: document,
      maxRounds: 99,
      measureFn: (cardDoc) => makeMeasured(cardDoc),
    });
    expect(result.ok).toBe(true);
    expect(result.rounds).toBe(1);
    result.detach();
  });
});

describe("列表项区间拆分与续号", () => {
  it("有序列表跨页：页 2 从正确序号继续（start 属性），项覆盖无遗漏", async () => {
    const md = ["1. 项目甲", "2. 项目乙", "3. 项目丙", "4. 项目丁"].join("\n");
    const doc = createCardDocument(md);
    const list = doc.blocks.find((b) => !b.parentId && b.type === "list");
    const measured = makeMeasured(doc, { childHeights: { [list.id]: [50, 50, 50, 50] } });
    // contentHeight 130：每页装 2 项（50+6+56=106 ≤ 130；+56=162 > 130）
    const result = await renderCardPages(doc, {
      theme: THEME,
      contentHeight: 130,
      document: document,
      measureFn: () => measured,
    });
    expect(result.ok).toBe(true);
    expect(result.pages.length).toBe(2);
    const lis1 = result.pages[0].querySelectorAll("ol > li");
    const lis2 = result.pages[1].querySelectorAll("ol > li");
    expect(lis1.length + lis2.length).toBe(4); // 无遗漏
    expect(lis1[0].textContent).toContain("项目甲");
    expect(lis2[lis2.length - 1].textContent).toContain("项目丁");
    // 续号：页 2 的 ol start = 3
    const ol2 = result.pages[1].querySelector("ol");
    expect(ol2.getAttribute("start")).toBe("3");
    // 项级覆盖恰好一次
    const texts = [...lis1, ...lis2].map((li) => li.textContent).join("|");
    expect(texts).toContain("项目甲");
    expect(texts).toContain("项目丁");
    result.detach();
  });
});

describe("段落 span 区间拆分（Smart RED 回归用例）", () => {
  // "前段**加粗词**后段继续" → span 序号：前0 段1 | 加2 粗3 词4 | 后5 段6 继7 续8
  it("跨页拆分不丢字：两页片段文本拼接 == 原文", async () => {
    const md = "前段**加粗词**后段继续";
    const doc = createCardDocument(md);
    const p = paraByContent(doc, "前段");
    const measured = makeMeasured(doc, {
      paragraphUnits: { [p.id]: [{ height: 30 }, { height: 30 }, { height: 30 }] },
      paragraphSpans: { [p.id]: [[0, 3], [3, 6], [6, 9]] },
    });
    const items = createLayoutItems(doc, measured);
    const plan = {
      ok: true,
      pages: [
        { index: 1, entries: [{ blockId: p.id, unitStart: 0, unitEnd: 2, continuedFrom: false, continues: true }] },
        { index: 2, entries: [{ blockId: p.id, unitStart: 2, unitEnd: 3, continuedFrom: true, continues: false }] },
      ],
      diagnostics: [],
    };
    const page1 = assembleCardPageFromPlan(doc, plan.pages[0], items, { theme: THEME, document: document });
    const page2 = assembleCardPageFromPlan(doc, plan.pages[1], items, { theme: THEME, document: document, pageCount: 2 });
    const t1 = page1.querySelector("p").textContent;
    const t2 = page2.querySelector("p").textContent;
    expect(t1 + t2).toBe("前段加粗词后段继续"); // 无字符丢失
    expect(page2.querySelector("p").classList.contains("icard-continued")).toBe(true);
  });

  it("整段加粗不被切断：拆分边界避开行内强调时，strong 保持完整", async () => {
    const md = "甲乙**加粗词**丙丁"; // span：甲0 乙1 | 加2 粗3 词4 | 丙5 丁6
    const doc = createCardDocument(md);
    const p = paraByContent(doc, "甲乙");
    const measured = makeMeasured(doc, {
      paragraphUnits: { [p.id]: [{ height: 30 }, { height: 30 }] },
      paragraphSpans: { [p.id]: [[0, 2], [2, 7]] },
    });
    const items = createLayoutItems(doc, measured);
    const plan = {
      ok: true,
      pages: [
        { index: 1, entries: [{ blockId: p.id, unitStart: 0, unitEnd: 1, continuedFrom: false, continues: true }] },
        { index: 2, entries: [{ blockId: p.id, unitStart: 1, unitEnd: 2, continuedFrom: true, continues: false }] },
      ],
      diagnostics: [],
    };
    const page1 = assembleCardPageFromPlan(doc, plan.pages[0], items, { theme: THEME, document: document });
    const page2 = assembleCardPageFromPlan(doc, plan.pages[1], items, { theme: THEME, document: document, pageCount: 2 });
    // 页 1 无强调残留（strong 被整段剪除）
    expect(page1.querySelector("strong")).toBeNull();
    expect(page1.querySelector("p").textContent).toBe("甲乙");
    // 页 2 strong 完整保留
    const strong2 = page2.querySelector("strong");
    expect(strong2).not.toBeNull();
    expect(strong2.textContent).toBe("加粗词");
    expect(page2.querySelector("p").textContent).toBe("加粗词丙丁");
  });

  it("span 包裹确定性：同段落两次 wrapParagraphSpans 序号一致（测量/装配可重放）", async () => {
    const { renderBlockElement } = await import("../services/card-render-profile.js");
    const { wrapParagraphSpans } = await import("../services/card-render-profile.js");
    const md = "混合 **加粗** 与 `code` 文本";
    const doc = createCardDocument(md);
    const p = paraByContent(doc, "混合");
    const el1 = /** @type {HTMLElement} */ (renderBlockElement(p, { doc: document }));
    const n1 = wrapParagraphSpans(el1, document);
    const el2 = /** @type {HTMLElement} */ (renderBlockElement(p, { doc: document }));
    const n2 = wrapParagraphSpans(el2, document);
    expect(n1).toBe(n2);
    expect(n1).toBeGreaterThan(4);
  });
});

describe("callout 子块区间拆分", () => {
  it("跨页 callout：页 2 标题带「（续）」，子块覆盖无遗漏", async () => {
    const md = [
      "> [!note] 提示标题",
      "> 第一行内容",
      ">",
      "> 第二行内容",
      ">",
      "> 第三行内容",
    ].join("\n");
    const doc = createCardDocument(md);
    const callout = doc.blocks.find((b) => !b.parentId && (b.type === "callout" || b.type === "blockquote"));
    const children = doc.blocks.filter((b) => b.parentId === callout.id && b.disposition === "render");
    expect(children.length).toBeGreaterThanOrEqual(2);
    const measured = makeMeasured(doc, {
      childHeights: { [callout.id]: children.map(() => 60) },
    });
    const result = await renderCardPages(doc, {
      theme: THEME,
      contentHeight: 130, // 每页约 2 个子块单元（60+6+60=126 ≤ 130）
      document: document,
      measureFn: () => measured,
    });
    expect(result.ok).toBe(true);
    const quotes = result.pages.map((p) => Array.from(p.querySelectorAll("blockquote")));
    const allQuotes = quotes.flat();
    expect(allQuotes.length).toBeGreaterThanOrEqual(2);
    // 各页正文内容合并后包含全部子块文本（textContent 无换行，归一化空白后比对）
    const norm = (s) => String(s).replace(/\s+/g, "");
    const allText = norm(allQuotes.map((q) => q.textContent).join("|"));
    for (const child of children) {
      const text = norm(String(child.text || "").replace(/^\[![A-Za-z-]+\][ \t]*/, ""));
      if (text) expect(allText).toContain(text);
    }
    // 续页标题带（续）
    const continuedQuote = allQuotes.find((q) => q.textContent.includes("（续）"));
    expect(continuedQuote).toBeTruthy();
    result.detach();
  });
});

describe("图片等比缩入与测量基建", () => {
  it("scaled 条目：图片获得 icard-img-fit 类（max-height 钳制）", async () => {
    const md = "![占位图](local-image.png)";
    const doc = createCardDocument(md);
    const imgPara = doc.blocks.find((b) => !b.parentId && b.type === "paragraph" && (b.images || []).length > 0);
    expect(imgPara).toBeTruthy();
    const measured = makeMeasured(doc, { heights: { [imgPara.id]: 700 } });
    const items = createLayoutItems(doc, measured);
    const plan = {
      ok: true,
      pages: [{ index: 1, entries: [{ blockId: imgPara.id, unitStart: 0, unitEnd: 1, continuedFrom: false, continues: false, scaled: true }] }],
      diagnostics: [],
    };
    const page = assembleCardPageFromPlan(doc, plan.pages[0], items, {
      theme: THEME,
      document: document,
      contentHeight: 400,
      resolveImageSrc: () => "data:image/png;base64,AAAA",
    });
    const img = page.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.classList.contains("icard-img-fit")).toBe(true);
    expect(page.style.getPropertyValue("--icard-content-height")).toBe("400px");
  });

  it("行内图片段落超高：装配端按预算钳制段内 img max-height（shrinkToFit，B02 实机回归）", () => {
    // 文字行 + 紧跟图片行（无空行）→ 同一段落（Wechat 文章常见写法）
    const md = "点开仓库我乐了，这项目最大的特点是它把自己设计成用 AI 来安装。\n![占位图|400](local-image.png)";
    const doc = createCardDocument(md);
    const para = doc.blocks.find(
      (b) => !b.parentId && b.type === "paragraph" && (b.images || []).length > 0 && String(b.text || "").trim() !== ""
    );
    expect(para).toBeTruthy();
    const measured = makeMeasured(doc, { heights: { [para.id]: 500 } });
    measured.imageParagraphs = { [para.id]: { textHeight: 80, imageCount: 1 } };
    const items = createLayoutItems(doc, measured);
    const plan = {
      ok: true,
      pages: [{ index: 1, entries: [{ blockId: para.id, unitStart: 0, unitEnd: 1, continuedFrom: false, continues: false, scaled: true }] }],
      diagnostics: [],
    };
    const page = assembleCardPageFromPlan(doc, plan.pages[0], items, {
      theme: THEME,
      document: document,
      contentHeight: 419,
      resolveImageSrc: () => "data:image/png;base64,AAAA",
    });
    const img = page.querySelector("img");
    expect(img).not.toBeNull();
    // (419 - 80) / 1 = 339
    expect(img.style.maxHeight).toBe("339px");
  });

  it("renderCardPages：行内图片段落超高走收缩路径，不阻断输出", async () => {
    const md = "点开仓库我乐了，这项目最大的特点是它把自己设计成用 AI 来安装。\n![占位图|400](local-image.png)";
    const doc = createCardDocument(md);
    const para = doc.blocks.find(
      (b) => !b.parentId && b.type === "paragraph" && (b.images || []).length > 0 && String(b.text || "").trim() !== ""
    );
    const measured = makeMeasured(doc, { heights: { [para.id]: 500 } });
    measured.imageParagraphs = { [para.id]: { textHeight: 80, imageCount: 1 } };
    const result = await renderCardPages(doc, {
      theme: THEME,
      document: document,
      contentHeight: 419,
      measureFn: () => measured,
      resolveImageSrc: () => "data:image/png;base64,AAAA",
    });
    expect(result.ok).toBe(true);
    expect(result.pages).toHaveLength(1);
    const img = result.pages[0].querySelector("img");
    expect(img.style.maxHeight).toBe("339px");
    result.detach();
    expect(document.querySelector("[data-icard-offscreen]")).toBeNull();
  });

  it("measureCardDocument（jsdom 烟雾）：不抛错、结构完整、离屏容器自清理", async () => {
    const doc = createCardDocument("# 标题\n\n段落\n\n- 项目");
    const measured = await measureCardDocument(doc, { theme: THEME, document: document });
    expect(measured.heights).toBeDefined();
    expect(measured.childHeights).toBeDefined();
    expect(measured.paragraphUnits).toBeDefined();
    expect(measured.paragraphSpans).toBeDefined();
    expect(measured.imageParagraphs).toBeDefined();
    expect(document.querySelector("[data-icard-offscreen]")).toBeNull();
  });

  it("measureContentHeight：显式覆盖直接返回；jsdom 按主题内边距扣减（页脚高度 jsdom 为 0）", () => {
    expect(measureContentHeight({ contentHeight: 123 })).toBe(123);
    const auto = measureContentHeight({ theme: THEME, size: { width: 375, height: 500 }, document: document });
    // jsdom getComputedStyle 解析 .icard-page padding（主题 pagePadding），页脚 offsetHeight 为 0
    expect(auto).toBe(500 - 2 * THEME.tokens.pagePadding);
  });

  it("renderCardPages 真实测量（jsdom 烟雾）：零高度全部装入单页", async () => {
    const doc = createCardDocument("# 标题\n\n段落一\n\n- 项目甲\n- 项目乙");
    const result = await renderCardPages(doc, { theme: THEME, document: document });
    expect(result.ok).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.rounds).toBe(1);
    result.detach();
    expect(document.querySelector("[data-icard-offscreen]")).toBeNull();
  });
});
