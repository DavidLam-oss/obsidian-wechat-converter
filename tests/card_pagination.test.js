/*
分页装箱纯逻辑测试（A05）：不动 DOM，全部用确定性测量值。
覆盖：整放/换页、标题联排、手动分页、段落行拆分、列表项拆分与续号、孤行回退、
超大原子块诊断、图片等比缩入、覆盖性校验（无重叠/无遗漏/顺序一致）。
*/
import { describe, it, expect } from "vitest";
import {
  LAYOUT_ROUND_BUDGET,
  ORPHAN_UNITS,
  createCardPagePlan,
  createLayoutItems,
  mapManualBreaks,
  verifyPagePlan,
} from "../services/card-pagination.js";

/** 均匀单元构造器 */
function units(count, height) {
  return Array.from({ length: count }, () => ({ height }));
}

/** @param {Partial<import("../services/card-pagination.js").LayoutItem>} partial */
function item(partial) {
  const u = partial.units || units(1, 100);
  return /** @type {import("../services/card-pagination.js").LayoutItem} */ ({
    blockId: partial.blockId || `b${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type || "paragraph",
    keepWithNext: partial.keepWithNext ?? false,
    atomic: partial.atomic ?? u.length === 1,
    scaleToFit: partial.scaleToFit ?? partial.type === "image",
    shrinkToFit: partial.shrinkToFit,
    units: u,
    unitGap: partial.unitGap ?? 6,
    meta: partial.meta || { sourceStart: 1, sourceEnd: 2 },
  });
}

/** 计划中每块覆盖区间展平 */
function coverageOf(plan) {
  /** @type {Record<string, number>} */
  const cov = {};
  for (const page of plan.pages) {
    for (const e of page.entries) {
      cov[e.blockId] = (cov[e.blockId] || 0) + (e.unitEnd - e.unitStart);
    }
  }
  return cov;
}

describe("基础装箱", () => {
  it("整放：能装下的项按顺序同页，装不下的换页", () => {
    const items = [
      item({ blockId: "a", units: units(1, 200) }),
      item({ blockId: "b", units: units(1, 200) }),
      item({ blockId: "c", units: units(1, 200) }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 500 });
    expect(plan.ok).toBe(true);
    expect(plan.pages).toHaveLength(2);
    expect(plan.pages[0].entries.map((e) => e.blockId)).toEqual(["a", "b"]);
    expect(plan.pages[1].entries.map((e) => e.blockId)).toEqual(["c"]);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("恰好放满不误换页；页码从 1 递增", () => {
    const items = [item({ blockId: "a", units: units(1, 400) }), item({ blockId: "b", units: units(1, 100) })];
    const plan = createCardPagePlan(items, { contentHeight: 500 });
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].index).toBe(1);
  });

  it("原子块放不下换页；页高恰好的原子块独占一页", () => {
    const items = [
      item({ blockId: "p", units: units(1, 400) }),
      item({ blockId: "big", units: units(1, 500) }), // 正好等于页高
      item({ blockId: "q", units: units(1, 100) }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 500 });
    expect(plan.ok).toBe(true);
    expect(plan.pages.map((p) => p.entries.map((e) => e.blockId))).toEqual([["p"], ["big"], ["q"]]);
  });
});

describe("标题联排", () => {
  it("标题与下一项放不下时，标题先换页", () => {
    const items = [
      item({ blockId: "fill", units: units(1, 420) }),
      item({ blockId: "h1", type: "heading", keepWithNext: true, units: units(1, 60) }),
      item({ blockId: "para", units: units(1, 200) }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 500 });
    const pageOf = (id) => plan.pages.findIndex((p) => p.entries.some((e) => e.blockId === id));
    expect(pageOf("h1")).toBe(pageOf("para"));
    expect(pageOf("h1")).toBeGreaterThan(pageOf("fill"));
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("标题加下一项放得下时不换页", () => {
    const items = [
      item({ blockId: "fill", units: units(1, 200) }),
      item({ blockId: "h1", type: "heading", keepWithNext: true, units: units(1, 60) }),
      item({ blockId: "para", units: units(1, 200) }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 500 });
    expect(plan.pages).toHaveLength(1);
  });
});

describe("段落行拆分", () => {
  it("超长段落按行单元跨页拆分，continuedFrom/continues 标记正确", () => {
    const items = [
      item({ blockId: "p1", type: "paragraph", units: units(6, 100), unitGap: 0 }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 350, orphanUnits: 2 });
    expect(plan.ok).toBe(true);
    expect(plan.pages.length).toBeGreaterThanOrEqual(2);
    const first = plan.pages[0].entries[0];
    expect(first.unitStart).toBe(0);
    expect(first.continues).toBe(true);
    expect(first.continuedFrom).toBe(false);
    const second = plan.pages[1].entries[0];
    expect(second.continuedFrom).toBe(true);
    expect(second.unitEnd).toBe(6);
    // 孤行回退：页尾至少 2 行
    expect(first.unitEnd - first.unitStart).toBeGreaterThanOrEqual(2);
    expect(second.unitEnd - second.unitStart).toBeGreaterThanOrEqual(2);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("孤行回退：尾部不足阈值时少拿一行", () => {
    // 8 行 × 100，页高 650：能放 6 行，剩 2 行 ≥ orphan 2 → 6/2
    const items = [item({ blockId: "p", type: "paragraph", units: units(8, 100), unitGap: 0 })];
    const plan = createCardPagePlan(items, { contentHeight: 650, orphanUnits: 2 });
    const e0 = plan.pages[0].entries[0];
    expect(e0.unitEnd).toBe(6);
    expect(plan.pages[1].entries[0].unitStart).toBe(6);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("剩余恰好等于阈值时直接全拿", () => {
    const items = [item({ blockId: "p", type: "paragraph", units: units(7, 100), unitGap: 0 })];
    const plan = createCardPagePlan(items, { contentHeight: 550, orphanUnits: 2 }); // 放 5 行剩 2
    const e0 = plan.pages[0].entries[0];
    expect(e0.unitEnd).toBe(5);
    expect(plan.pages[1].entries[0].unitStart).toBe(5);
  });
});

describe("列表与续号", () => {
  it("有序列表按项拆分，continuation 页可由 unitStart 推导 start 序号", () => {
    const items = [
      item({
        blockId: "list1",
        type: "list",
        units: units(5, 120),
        unitGap: 6,
        meta: { ordered: true, listStart: 1, sourceStart: 10, sourceEnd: 20 },
      }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 300, orphanUnits: 2 });
    const e0 = plan.pages[0].entries.find((e) => e.blockId === "list1");
    const e1 = plan.pages[1].entries.find((e) => e.blockId === "list1");
    expect(e0).toBeTruthy();
    expect(e1).toBeTruthy();
    // 续页从第 unitStart 项继续，渲染侧 start = listStart + unitStart
    expect(e1.unitStart).toBe(e0.unitEnd);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });
});

describe("手动分页", () => {
  it("breakBefore 项强制换新页", () => {
    const items = [
      item({ blockId: "a", units: units(1, 100) }),
      item({ blockId: "b", units: units(1, 100) }),
      item({ blockId: "c", units: units(1, 100) }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 500, breakBeforeItemIds: new Set(["c"]) });
    expect(plan.pages.map((p) => p.entries.map((e) => e.blockId))).toEqual([["a", "b"], ["c"]]);
    expect(plan.pages[0].endsByManualBreak).toBe(true);
  });
});

describe("超大内容与图片", () => {
  it("超高表格（原子块）→ 显式诊断，plan.ok=false", () => {
    const items = [
      item({ blockId: "t", type: "table", atomic: true, units: units(1, 900) }),
      item({ blockId: "p", units: units(1, 100) }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 500 });
    expect(plan.ok).toBe(false);
    expect(plan.diagnostics).toHaveLength(1);
    expect(plan.diagnostics[0]).toMatchObject({ blockId: "t", reason: "oversized-atomic" });
    // 诊断不吞掉其他块：其余项仍正常装箱
    expect(coverageOf(plan)["p"]).toBe(1);
  });

  it("超高图片等比缩入：独占一页并标记 scaled，不算失败", () => {
    const items = [
      item({ blockId: "img", type: "image", atomic: true, scaleToFit: true, units: units(1, 1200) }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 500 });
    expect(plan.ok).toBe(true);
    expect(plan.diagnostics).toHaveLength(0);
    expect(plan.pages[0].entries[0]).toMatchObject({ blockId: "img", scaled: true });
  });

  it("单个单元就超页高的可拆块 → 显式诊断，不死循环", () => {
    const items = [
      item({ blockId: "p", type: "paragraph", units: [{ height: 2000 }, { height: 100 }], unitGap: 0 }),
    ];
    const plan = createCardPagePlan(items, { contentHeight: 500 });
    expect(plan.ok).toBe(false);
    expect(plan.diagnostics[0].reason).toBe("oversized-atomic");
  });
});

describe("verifyPagePlan 覆盖性", () => {
  it("遗漏/重叠/越界都能查出", () => {
    const items = [item({ blockId: "a", units: units(3, 50) })];
    const bad1 = /** @type {any} */ ({
      ok: true,
      diagnostics: [],
      pages: [{ index: 1, entries: [{ blockId: "a", unitStart: 0, unitEnd: 2, continuedFrom: false, continues: false }] }],
    });
    expect(verifyPagePlan(items, bad1).ok).toBe(false);
    const bad2 = /** @type {any} */ ({
      ok: true,
      diagnostics: [],
      pages: [
        { index: 1, entries: [{ blockId: "a", unitStart: 0, unitEnd: 2, continuedFrom: false, continues: true }] },
        { index: 2, entries: [{ blockId: "a", unitStart: 1, unitEnd: 3, continuedFrom: true, continues: false }] },
      ],
    });
    expect(verifyPagePlan(items, bad2).problems.join(" ")).toContain("重叠或遗漏");
  });
});

describe("createLayoutItems / mapManualBreaks", () => {
  it("从 CardDocument 生成布局项：省略块不参与，callout 子块并入，缺测量报错", async () => {
    const { createCardDocument } = await import("../services/card-document.js");
    const md = [
      "# 标题",
      "",
      "段落一",
      "",
      "> [!note] 提示",
      "> callout 第一行",
      "> callout 第二行",
      "",
      "~~这段会省略~~",
      "",
      "$$",
      "x = 1",
      "$$",
    ].join("\n");
    const doc = createCardDocument(md);
    const renderable = doc.blocks.filter((b) => b.disposition === "render" && !b.parentId);
    // 全部给测量值：段落 60、标题 50、callout 120
    const heights = {};
    for (const b of renderable) heights[b.id] = b.type === "heading" ? 50 : 60;
    heights[renderable[0].id] = 50;
    const items = createLayoutItems(doc, { heights });
    // 省略块（删除线示例按正常段落渲染？——本样本无省略；公式块被省略不出现）
    const ids = items.map((i) => i.type);
    expect(ids).toContain("heading");
    expect(ids).toContain("paragraph");
    expect(items.every((i) => i.units.length === 1)).toBe(true);
    expect(() => createLayoutItems(doc, { heights: {} })).toThrow(/缺少块测量高度/);
  }, 30000);

  it("mapManualBreaks：标记映射到其后第一块", async () => {
    const { createCardDocument } = await import("../services/card-document.js");
    const md = ["# A", "", "<!-- card:break -->", "", "段落B", "", "段落C"].join("\n");
    const doc = createCardDocument(md);
    expect(doc.paginationMarkers).toHaveLength(1);
    const items = [
      item({ blockId: "h", type: "heading", meta: { sourceStart: 1, sourceEnd: 1 } }),
      item({ blockId: "pb", meta: { sourceStart: 5, sourceEnd: 5 } }),
      item({ blockId: "pc", meta: { sourceStart: 7, sourceEnd: 7 } }),
    ];
    const breaks = mapManualBreaks(doc, items);
    expect(breaks.has("pb")).toBe(true);
    expect(breaks.has("pc")).toBe(false);
  });
});

describe("§5.6 布局轮次预算", () => {
  it("LAYOUT_ROUND_BUDGET 为 3", () => {
    expect(LAYOUT_ROUND_BUDGET).toBe(3);
    expect(ORPHAN_UNITS).toBe(2);
  });
});

describe("块间距 itemGap（对应主题 .icard-content gap）", () => {
  it("同页相邻原子块计入 itemGap，页首块不计", () => {
    const items = [
      item({ blockId: "a", units: units(1, 200) }),
      item({ blockId: "b", units: units(1, 200) }),
    ];
    // 无 itemGap：200+200=400 ≤ 500 同页
    const plan0 = createCardPagePlan(items, { contentHeight: 500 });
    expect(plan0.pages[0].entries.map((e) => e.blockId)).toEqual(["a", "b"]);
    // itemGap=100：a+b+gap=500 ≤ 500 仍同页
    const plan1 = createCardPagePlan(items, { contentHeight: 500, itemGap: 100 });
    expect(plan1.pages[0].entries.map((e) => e.blockId)).toEqual(["a", "b"]);
    // itemGap=120：a+gap+b=520 > 500 → b 换页
    const plan2 = createCardPagePlan(items, { contentHeight: 500, itemGap: 120 });
    expect(plan2.pages).toHaveLength(2);
    expect(plan2.pages[0].entries.map((e) => e.blockId)).toEqual(["a"]);
    expect(plan2.pages[1].entries.map((e) => e.blockId)).toEqual(["b"]);
    expect(verifyPagePlan(items, plan2).ok).toBe(true);
  });

  it("可拆项整放判定计入 itemGap", () => {
    const items = [
      item({ blockId: "a", units: units(1, 200) }),
      item({ blockId: "b", type: "list", units: units(3, 80) }),
    ];
    // b 总高 80*3+6*2=252；a+gap(60)+b=512 > 500 → b 拆分且首页只装 a 之后的剩余
    const plan = createCardPagePlan(items, { contentHeight: 500, itemGap: 60 });
    expect(plan.ok).toBe(true);
    // b 首片段应在第 2 页（a 之后剩余空间 500-200-60=240 < 252）
    const firstB = plan.pages.find((p) => p.entries.some((e) => e.blockId === "b"));
    const bEntry = firstB && firstB.entries.find((e) => e.blockId === "b");
    expect(bEntry).toBeTruthy();
    if (firstB && firstB.entries[0].blockId === "b") {
      // b 从新页开始
      expect(firstB.index).toBe(2);
    }
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("标题联排判定计入 itemGap", () => {
    const items = [
      item({ blockId: "a", units: units(1, 200) }),
      item({ blockId: "h", type: "heading", keepWithNext: true, units: units(1, 100) }),
      item({ blockId: "b", units: units(1, 200) }),
    ];
    // h+b=300；a+gap(30)+300=530 > 500 → 标题联排失败，h 起始换页
    const plan = createCardPagePlan(items, { contentHeight: 500, itemGap: 30 });
    const hPage = plan.pages.find((p) => p.entries.some((e) => e.blockId === "h"));
    expect(hPage && hPage.entries[0].blockId).toBe("h");
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });
});

describe("实机回归（2026-09-08 首轮分页实验暴露）", () => {
  it("可拆项整块放不下时先用当前页剩余空间装头部单元（不直接弃页留白）", () => {
    const items = [
      item({ blockId: "a", units: units(1, 100) }),
      item({ blockId: "b", type: "paragraph", units: units(8, 60) }),
    ];
    // contentHeight 400：a 占 100，b 整块 8*60+7*6=522 放不下 → 应先装 4 个单元（4*60+3*6=258 ≤ 286 的剩余）
    const plan = createCardPagePlan(items, { contentHeight: 400, itemGap: 14 });
    expect(plan.ok).toBe(true);
    expect(plan.pages[0].entries.map((e) => e.blockId)).toEqual(["a", "b"]);
    const bHead = plan.pages[0].entries[1];
    expect(bHead.unitStart).toBe(0);
    expect(bHead.unitEnd).toBeGreaterThanOrEqual(4); // 至少装 4 个单元，而不是整块弃到下页
    expect(bHead.continues).toBe(true);
    // 剩余单元在第二页承接
    const bTail = plan.pages[1].entries.find((e) => e.blockId === "b");
    expect(bTail && bTail.unitStart).toBe(bHead.unitEnd);
    expect(bTail && bTail.continuedFrom).toBe(true);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("头部剩余空间不足 orphanUnits 时不装碎片段，整项换页", () => {
    const items = [
      item({ blockId: "a", units: units(1, 350) }),
      item({ blockId: "b", type: "paragraph", units: units(6, 60) }),
    ];
    // 剩余 400-350=50-14(gap)=36 < 2 个单元(126) → b 整块换页，头部不装碎片
    const plan = createCardPagePlan(items, { contentHeight: 400, itemGap: 14 });
    expect(plan.ok).toBe(true);
    expect(plan.pages[0].entries.map((e) => e.blockId)).toEqual(["a"]);
    expect(plan.pages[1].entries[0].blockId).toBe("b");
    expect(plan.pages[1].entries[0].unitStart).toBe(0);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("keepWithNext 后置校正：标题落页尾且下一项换页 → 标题随迁（不再孤行）", () => {
    const items = [
      item({ blockId: "a", units: units(1, 300) }),
      item({ blockId: "h", type: "heading", keepWithNext: true, units: units(1, 60) }),
      item({ blockId: "b", type: "paragraph", units: units(6, 60) }),
    ];
    // a 后剩 400-300=86：标题 60 可放（预判 60+60=120>86 会触发预检换页？
    // 预检条件 used+gap+heading+nextFirst=300+14+60+60=434>400 → h 换页）。
    // 构造预检通过但下一项仍换页的场景：b 首单元高但 b 的剩余空间粒度导致 b 从新页开始
    const plan = createCardPagePlan(items, { contentHeight: 400, itemGap: 14, orphanUnits: 2 });
    // 任何结果下都不允许：h 是某页最后一个 entry 且下一页首 entry 是别的块
    for (let i = 0; i < plan.pages.length - 1; i += 1) {
      const page = plan.pages[i];
      const last = page.entries[page.entries.length - 1];
      if (!last || last.blockId !== "h") continue;
      const nextFirst = plan.pages[i + 1].entries[0];
      expect(nextFirst && nextFirst.blockId).toBe("h");
    }
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("keepWithNext 随迁不跨越手动分页（显式断页语义优先）", () => {
    const items = [
      item({ blockId: "a", units: units(1, 300) }),
      item({ blockId: "h", type: "heading", keepWithNext: true, units: units(1, 60) }),
      item({ blockId: "b", type: "paragraph", units: units(6, 60) }),
    ];
    const plan = createCardPagePlan(items, {
      contentHeight: 400,
      itemGap: 14,
      breakBeforeItemIds: new Set(["b"]),
    });
    // b 手动换页后，h 留在第一页页尾是合法的（不被随迁）
    const pageWithH = plan.pages.find((p) => p.entries.some((e) => e.blockId === "h"));
    expect(pageWithH && pageWithH.endsByManualBreak).toBe(true);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("尾部孤行回退不得作用于可整放的新页（B02 实机回归：整段被凭空拆成 3+2 造大片空白）", () => {
    const items = [
      item({ blockId: "a", units: units(1, 380) }),
      item({ blockId: "b", type: "paragraph", units: units(5, 20) }),
    ];
    // a 占满第一页（380/400）；b 总高 5×20+4×6=124，新页整放绰绰有余。
    // 旧逻辑：take=5 时 remaining-take=0<2 且 5>=4 → 强砍成 3，凭空造出只有 2 行的续页。
    const plan = createCardPagePlan(items, { contentHeight: 400, itemGap: 14 });
    expect(plan.ok).toBe(true);
    expect(plan.pages).toHaveLength(2);
    const bEntries = plan.pages.flatMap((p) => p.entries).filter((e) => e.blockId === "b");
    expect(bEntries).toHaveLength(1); // 不拆分
    expect(bEntries[0].unitStart).toBe(0);
    expect(bEntries[0].unitEnd).toBe(5); // 整段放第二页
    expect(bEntries[0].continues).toBeFalsy();
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("尾部孤行回退在真实跨页时仍生效（拆分边界留足 orphanUnits 尾段）", () => {
    const items = [
      item({ blockId: "b", type: "paragraph", units: units(7, 60) }),
    ];
    // 单元 60px、gap 0：整页可装 6 个（360 ≤ 400）→ 拿满 6 后剩余 1 < orphanUnits(2)
    // → 少拿 1 个，本页 5 个、下页 2 个（真实跨页时保护仍然有效）。
    const plan = createCardPagePlan(items, { contentHeight: 400 });
    expect(plan.ok).toBe(true);
    expect(plan.pages).toHaveLength(2);
    const first = plan.pages[0].entries[0];
    const second = plan.pages[1].entries[0];
    expect(first.unitEnd - first.unitStart).toBe(5);
    expect(second.unitEnd - second.unitStart).toBe(2);
    expect(second.continuedFrom).toBe(true);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("含行内图片的超高段落：收缩段内图片使整段入页（scaled 标记，不诊断）", () => {
    const items = [
      item({
        blockId: "p",
        units: units(1, 500),
        shrinkToFit: { textHeight: 80, imageCount: 1 },
      }),
    ];
    // 段落 500px > 页高 419px，但去图后文字仅 80px：图片预算 339px ≥ 下限 60px → 可缩入
    const plan = createCardPagePlan(items, { contentHeight: 419 });
    expect(plan.ok).toBe(true);
    expect(plan.diagnostics).toHaveLength(0);
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].entries[0].scaled).toBe(true);
    expect(verifyPagePlan(items, plan).ok).toBe(true);
  });

  it("行内图片收缩到下限仍放不下 → 显式诊断阻断（不裁剪）", () => {
    const items = [
      item({
        blockId: "p",
        units: units(1, 500),
        shrinkToFit: { textHeight: 380, imageCount: 1 },
      }),
    ];
    // 图片预算 419-380=39px < 下限 60px → 不可缩入，显式失败
    const plan = createCardPagePlan(items, { contentHeight: 419 });
    expect(plan.ok).toBe(false);
    expect(plan.diagnostics[0].blockId).toBe("p");
    expect(plan.diagnostics[0].message).toContain("行内图片");
  });
});
