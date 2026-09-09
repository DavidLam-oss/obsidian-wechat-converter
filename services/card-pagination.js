/*
## 核心功能

卡片语义分页的**纯逻辑装箱层**：把 CardDocument 的块（含 callout 子块、列表项、段落行单元）装箱进固定高度页面。策略：贪心填充 + 标题联排（keep-with-next）+ 手动分页标记（card:break）+ 孤行回退（拆分边界至少 N 个单元）+ 超大原子块的显式诊断（图片等比缩入除外）。

## 输入

- `createLayoutItems(doc, measured)`：CardDocument + 测量结果（每块的高度与可拆分单元高度数组）。
- `createCardPagePlan(items, options)`：内容区高度、单元间距、孤行阈值、手动分页项集合。
- `mapManualBreaks(doc, items)`：paginationMarkers 源行 → 分页项映射。

## 输出

- `createCardPagePlan(...)` → `{ ok, pages, diagnostics }`：每页 entry 含 blockId/unitStart/unitEnd/continuedFrom/continues/scaled。
- `verifyPagePlan(items, plan)`：覆盖性校验——非省略块恰好覆盖一次、顺序一致、单元区间无重叠无遗漏。
- `LAYOUT_ROUND_BUDGET`：每内容版本最多 3 轮布局（§5.6）。

## 定位

位于 services/，纯函数无 DOM 依赖（jsdom 可测）；测量（行范围/真实高度）与片段 DOM 重建在 card-render-engine.js。

## 依赖

无模块导入（消费 card-document.js 的 CardDocument 形状与引擎的测量结果）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 覆盖性校验（verifyPagePlan）是完成标准（§A05）的机器化表达，不得绕过或放宽。
*/

/** 每内容/设置/资源版本最多 3 轮完整布局（§5.6：首次排版后最多再修正 2 次） */
export const LAYOUT_ROUND_BUDGET = 3;

/** 拆分边界孤行回退：页首/页尾至少保留的单元数 */
export const ORPHAN_UNITS = 2;

/** 行内图片收缩下限：每张图缩到低于此高宁可显式诊断（避免缩成不可辨识的细条） */
export const MIN_SHRUNK_IMAGE_HEIGHT = 60;

/**
 * @typedef {object} LayoutItem
 * @property {string} blockId
 * @property {"heading"|"paragraph"|"list"|"callout"|"table"|"image"|"hr"|"other"} type
 * @property {boolean} keepWithNext 标题联排：至少与下一项首单元同页
 * @property {boolean} atomic 不可拆分（整体换页）
 * @property {boolean} scaleToFit 图片：超高时等比缩入（CSS 限制最大尺寸），不诊断
 * @property {{ textHeight: number, imageCount: number }} [shrinkToFit] 行内图片段落：整段超高时收缩段内图片使整段入页
 *   （textHeight = 去图纯文本实测高度；收缩后仍放不下才诊断）
 * @property {Array<{ height: number }>} units 可拆分单元（atomic 时为整块 1 个）
 * @property {number} unitGap 单元间距（px）
 * @property {{ ordered?: boolean, listStart?: number, calloutType?: string, sourceStart: number, sourceEnd: number, spanRanges?: Array<[number, number]> }} meta
 *   spanRanges：段落各「行单元」对应的 data-icard-span 区间 [start, end)（与 units 一一对应，装配片段过滤用）
 */

/**
 * @typedef {object} PlanEntry
 * @property {string} blockId
 * @property {number} unitStart 起始单元（含）
 * @property {number} unitEnd 结束单元（不含）
 * @property {boolean} continuedFrom 承接上页（渲染续行样式）
 * @property {boolean} continues 延续到下页
 * @property {boolean} [scaled] 图片等比缩入
 * @property {boolean} [scaled] 图片等比缩入
 */

/**
 * @typedef {object} PlanPage
 * @property {number} index 1-based
 * @property {PlanEntry[]} entries
 * @property {boolean} [endsByManualBreak] 手动分页结束
 */

/**
 * @typedef {object} PlanDiagnostic
 * @property {string} blockId
 * @property {"oversized-atomic"} reason
 * @property {string} message
 */

/**
 * @typedef {object} CardPagePlan
 * @property {boolean} ok false = 存在无法布局的内容（超大原子块），调用方阻断输出
 * @property {PlanPage[]} pages
 * @property {PlanDiagnostic[]} diagnostics
 */

/**
 * @param {unknown} block
 * @returns {boolean}
 */
function isRenderableBlock(block) {
  return !!block && typeof block === "object" &&
    /** @type {{disposition?: string}} */ (block).disposition === "render" &&
    !/** @type {{parentId?: string}} */ (block).parentId;
}

/**
 * @param {unknown} block
 * @returns {string}
 */
function classifyType(block) {
  const b = /** @type {{type?: string, images?: Array<object>, text?: string}} */ (block);
  const imageOnly = b.type === "paragraph" && (b.text || "").trim() === "" && (b.images || []).length > 0;
  if (imageOnly) return "image";
  switch (b.type) {
    case "heading":
      return "heading";
    case "paragraph":
      return "paragraph";
    case "list":
      return "list";
    case "callout":
    case "blockquote":
      return "callout";
    case "table":
      return "table";
    case "paginationMarker":
    case "hr":
      return "hr";
    default:
      return "other";
  }
}

/**
 * CardDocument + 测量结果 → 有序 LayoutItem 列表。
 * callout 的子块高度并入 callout 项（units = 子块高度序列）。
 * @param {import('./card-document.js').CardDocument} doc
 * @param {{ heights: { [blockId: string]: number }, childHeights?: { [blockId: string]: number[] }, paragraphUnits?: { [blockId: string]: Array<{ height: number }> }, paragraphSpans?: { [blockId: string]: Array<[number, number]> }, imageParagraphs?: { [blockId: string]: { textHeight: number, imageCount: number } } }} measured
 *   imageParagraphs：含行内图片的段落的「去图纯文本高度 + 图片数」（供超高时收缩图片计算）
 * @returns {LayoutItem[]}
 */
export function createLayoutItems(doc, measured) {
  /** @type {LayoutItem[]} */
  const items = [];
  const blocks = doc.blocks || [];
  for (const block of blocks) {
    if (block.type === "paginationMarker") continue; // 标记单独映射，不作为布局项
    if (!isRenderableBlock(block)) continue;
    const type = classifyType(block);
    const height = measured.heights[block.id];
    if (typeof height !== "number" || !(height >= 0)) {
      throw new Error(`缺少块测量高度：${block.id}（${block.type}）`);
    }
    /** @type {Array<{ height: number }>} */
    let units = [{ height }];
    /** @type {Array<[number, number]> | undefined} */
    let spanRanges;
    if (type === "paragraph") {
      const paraUnits = (measured.paragraphUnits || {})[block.id];
      const spans = (measured.paragraphSpans || {})[block.id];
      // 行拆分必须同时具备行高与 span 区间（无区间则无法做片段装配，保持原子）
      if (paraUnits && paraUnits.length > 1 && spans && spans.length === paraUnits.length) {
        units = paraUnits;
        spanRanges = spans;
      }
    } else if (type === "list") {
      // 列表项单元：优先用逐项测量；否则整体一个单元（不可拆）
      const childUnits = (measured.childHeights || {})[block.id];
      if (childUnits && childUnits.length > 1) units = childUnits.map((h) => ({ height: h }));
    } else if (type === "callout") {
      const children = blocks.filter((b) => b.parentId === block.id && b.disposition === "render");
      const childHeights = (measured.childHeights || {})[block.id];
      if (children.length > 1 && childHeights && childHeights.length === children.length) {
        units = childHeights.map((h) => ({ height: h }));
      }
    }
    const atomic = units.length === 1;
    const imgInfo = (measured.imageParagraphs || {})[block.id];
    items.push({
      blockId: block.id,
      type: /** @type {LayoutItem["type"]} */ (type),
      keepWithNext: type === "heading",
      atomic,
      scaleToFit: type === "image",
      shrinkToFit: type === "paragraph" && atomic && imgInfo ? imgInfo : undefined,
      units,
      unitGap: 6,
      meta: {
        ordered: block.ordered,
        listStart: block.listStart,
        calloutType: block.calloutType,
        sourceStart: block.sourceStart,
        sourceEnd: block.sourceEnd,
        spanRanges,
      },
    });
  }
  return items;
}

/**
 * 手动分页标记映射：返回「在该项之前强制分页」的 blockId 集合。
 * 标记位于某块源行区间之前（marker.line ≤ block.sourceStart 的第一块）。
 * @param {import('./card-document.js').CardDocument} doc
 * @param {LayoutItem[]} items
 * @returns {Set<string>} breakBefore blockIds
 */
export function mapManualBreaks(doc, items) {
  const markers = (doc.paginationMarkers || []).map((m) => /** @type {{line: number}} */ (/** @type {unknown} */ (m)).line);
  if (markers.length === 0) return new Set();
  /** @type {Set<string>} */
  const breakBefore = new Set();
  const byId = new Map(items.map((it) => [it.blockId, it]));
  for (const line of markers) {
    const target = items.find((it) => it.meta.sourceStart >= line);
    if (target && !breakBefore.has(target.blockId)) {
      breakBefore.add(target.blockId);
      void byId;
    }
  }
  return breakBefore;
}

/**
 * @param {LayoutItem} item
 * @param {number} from
 * @param {number} to
 * @param {number} unitGap
 * @returns {number}
 */
function unitsHeight(item, from, to, unitGap) {
  let total = 0;
  for (let i = from; i < to; i += 1) total += item.units[i].height;
  return total + (to - from - 1) * unitGap;
}

/**
 * 纯逻辑装箱。返回 ok=false 时 diagnostics 说明无法布局的内容，调用方必须阻断输出（不裁剪）。
 * @param {LayoutItem[]} items
 * @param {{ contentHeight: number, keepWithNext?: boolean, orphanUnits?: number, itemGap?: number, breakBeforeItemIds?: Set<string> }} options
 *   itemGap：同页相邻块之间的间距（对应主题 .icard-content 的 gap）；0 = 不计（默认，兼容既有测试）
 * @returns {CardPagePlan}
 */
export function createCardPagePlan(items, options) {
  const contentHeight = options.contentHeight;
  if (!(contentHeight > 0)) throw new Error("contentHeight 必须为正数");
  const keepWithNext = options.keepWithNext !== false;
  const orphanUnits = Math.max(1, options.orphanUnits ?? ORPHAN_UNITS);
  const itemGap = Math.max(0, options.itemGap ?? 0);
  const breakBefore = options.breakBeforeItemIds || new Set();

  /** @type {PlanPage[]} */
  const pages = [];
  /** @type {PlanDiagnostic[]} */
  const diagnostics = [];
  let ok = true;

  /** @type {PlanEntry[]} */
  let currentPage = [];
  let used = 0;

  const flush = (manual = false) => {
    if (currentPage.length === 0) return;
    pages.push({ index: pages.length + 1, entries: currentPage, endsByManualBreak: manual || undefined });
    currentPage = [];
    used = 0;
  };

  /**
   * 原子项安置：能放就放；放不下则换页；超高图片等比缩入；超高其他原子块 → 显式诊断。
   * @param {LayoutItem} item
   * @param {number} itemIndex
   */
  const placeAtomic = (item, itemIndex) => {
    const h = item.units[0].height;
    const gapBefore = currentPage.length > 0 ? itemGap : 0;
    if (h > contentHeight) {
      if (item.scaleToFit) {
        flush();
        currentPage.push({ blockId: item.blockId, unitStart: 0, unitEnd: 1, continuedFrom: false, continues: false, scaled: true });
        used = contentHeight; // 缩入后占满（CSS max-height 实际渲染）
        return;
      }
      // 行内图片段落：收缩段内图片高度使整段入页（与独立图片等比缩入同语义，内容不裁剪）
      if (item.shrinkToFit) {
        const budgetPerImage = (contentHeight - item.shrinkToFit.textHeight) / Math.max(1, item.shrinkToFit.imageCount);
        if (budgetPerImage >= MIN_SHRUNK_IMAGE_HEIGHT) {
          flush();
          currentPage.push({ blockId: item.blockId, unitStart: 0, unitEnd: 1, continuedFrom: false, continues: false, scaled: true });
          used = contentHeight; // 收缩后整段贴齐页高（装配端按预算钳制 img max-height）
          return;
        }
        diagnostics.push({
          blockId: item.blockId,
          reason: "oversized-atomic",
          message: `段落含 ${item.shrinkToFit.imageCount} 张行内图片，整段高度 ${Math.round(h)}px 超过单页可用高度 ${Math.round(contentHeight)}px；即使把图片缩到下限 ${MIN_SHRUNK_IMAGE_HEIGHT}px 仍放不下（文字部分 ${Math.round(item.shrinkToFit.textHeight)}px）。请把图片移到独立一行或拆短该段。`,
        });
        ok = false;
        return;
      }
      diagnostics.push({
        blockId: item.blockId,
        reason: "oversized-atomic",
        message: `内容高度 ${Math.round(h)}px 超过单页可用高度 ${Math.round(contentHeight)}px，无法布局（类型：${item.type}）。请拆小表格或缩短该块。`,
      });
      ok = false;
      return;
    }
    if (used + gapBefore + h > contentHeight || breakBefore.has(item.blockId)) {
      flush(breakBefore.has(item.blockId));
    }
    currentPage.push({ blockId: item.blockId, unitStart: 0, unitEnd: 1, continuedFrom: false, continues: false });
    used += (currentPage.length > 1 ? itemGap : 0) + h;
    void itemIndex;
  };

  /**
   * 可拆项跨页拆分：贪心取单元 + 孤行回退（头部/尾部至少 orphanUnits 个单元，能整放时优先整放）。
   * @param {LayoutItem} item
   */
  const placeSplittable = (item) => {
    const gap = item.unitGap;
    const total = unitsHeight(item, 0, item.units.length, gap);
    const gapBefore = currentPage.length > 0 ? itemGap : 0;
    // 剩余空间够整块 → 直接放（含换页后整放）
    if (used + gapBefore + total <= contentHeight && !breakBefore.has(item.blockId)) {
      currentPage.push({ blockId: item.blockId, unitStart: 0, unitEnd: item.units.length, continuedFrom: false, continues: false });
      used += gapBefore + total;
      return;
    }
    // 整块放不下：先用当前页剩余空间装前几个单元（≥ orphanUnits 才装，避免头部碎片段），装不下再整项换页
    let from = 0;
    let firstOnPage = true;
    if (currentPage.length > 0) {
      if (breakBefore.has(item.blockId)) {
        flush();
      } else {
        const room = contentHeight - used - itemGap;
        let take = 0;
        let acc = 0;
        while (from + take < item.units.length) {
          const unitH = item.units[from + take].height + (take > 0 ? gap : 0);
          if (acc + unitH > room) break;
          acc += unitH;
          take += 1;
        }
        if (take > 0 && take >= Math.min(orphanUnits, item.units.length)) {
          const continues = from + take < item.units.length;
          currentPage.push({ blockId: item.blockId, unitStart: from, unitEnd: from + take, continuedFrom: false, continues });
          used += itemGap + acc;
          from += take;
          firstOnPage = false; // 后续片段在新页上应标记 continuedFrom
          if (continues) flush();
        } else {
          flush();
        }
      }
    }
    while (from < item.units.length) {
      // 当前空页上可容纳的单元数
      let take = 0;
      let acc = 0;
      while (from + take < item.units.length) {
        const unitH = item.units[from + take].height + (take > 0 ? gap : 0);
        if (acc + unitH > contentHeight) break;
        acc += unitH;
        take += 1;
      }
      const remaining = item.units.length - from;
      // 孤行回退：若剩余会落在阈值之下，少拿一些让尾部至少 orphanUnits；头部也至少 orphanUnits。
      // 仅在「本页装不下全部、确有跨页」时适用（from + take < 总数）：整项能完整放入本页时
      // 不存在尾段，裁剪反而会凭空制造一个几乎空白的续页（B02 实机回归：b7 段 5 行被砍成 3+2）。
      if (from + take < item.units.length && remaining - take < orphanUnits && remaining >= orphanUnits * 2) {
        take = remaining - orphanUnits;
      }
      if (take < Math.min(orphanUnits, remaining)) {
        // 当前页连孤行阈值都放不下（异常小页）：整项挪到下页
        if (firstOnPage && take === 0 && remaining <= item.units.length) {
          // 无法在单页内满足 → 显式失败，避免死循环
          diagnostics.push({
            blockId: item.blockId,
            reason: "oversized-atomic",
            message: `单元过大无法在单页内布局（首单元 ${Math.round(item.units[from].height)}px > 页高 ${Math.round(contentHeight)}px）。`,
          });
          ok = false;
          return;
        }
        flush();
        firstOnPage = true;
        continue;
      }
      const continues = from + take < item.units.length;
      currentPage.push({
        blockId: item.blockId,
        unitStart: from,
        unitEnd: from + take,
        continuedFrom: !firstOnPage,
        continues,
      });
      used = acc;
      from += take;
      firstOnPage = false;
      if (continues) flush();
    }
  };

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (breakBefore.has(item.blockId) && currentPage.length > 0) {
      flush(true);
    }
    // 标题联排：标题至少要与下一项首单元同页；放不下则标题先换页
    if (keepWithNext && item.keepWithNext && currentPage.length > 0) {
      const next = items[i + 1];
      const nextFirstH = next && !next.atomic ? next.units[0].height : next ? next.units[0].height : 0;
      const headingH = unitsHeight(item, 0, item.units.length, item.unitGap);
      const gapBefore = currentPage.length > 0 ? itemGap : 0;
      if (used + gapBefore + headingH + nextFirstH > contentHeight) {
        flush();
      }
    }
    if (item.atomic) {
      placeAtomic(item, i);
    } else {
      placeSplittable(item);
    }
  }
  flush();

  // keepWithNext 后置校正：标题完整落在页尾且下一项已换页 → 标题随迁到下一页（消灭孤行标题）。
  // 手动分页收尾的页不随迁（用户显式断页语义优先）；随迁前校验下一页装得下。
  const itemById = new Map(items.map((it) => [it.blockId, it]));
  /** @param {PlanEntry} entry */
  const entryHeight = (entry) => {
    const it = itemById.get(entry.blockId);
    if (!it) return 0;
    if (entry.scaled) return contentHeight;
    if (it.atomic) return it.units[0].height;
    return unitsHeight(it, entry.unitStart, entry.unitEnd, it.unitGap);
  };
  for (let pIdx = pages.length - 2; pIdx >= 0; pIdx -= 1) {
    const page = pages[pIdx];
    if (page.entries.length === 0 || page.endsByManualBreak) continue;
    const last = page.entries[page.entries.length - 1];
    const item = itemById.get(last.blockId);
    if (!item || !item.keepWithNext) continue;
    if (last.unitStart !== 0 || last.unitEnd !== item.units.length) continue; // 只随迁完整放置的标题
    const nextPage = pages[pIdx + 1];
    const nextEntry = nextPage.entries[0];
    if (!nextEntry || nextEntry.blockId === last.blockId) continue;
    const nextUsed = nextPage.entries.reduce((acc, e, i) => acc + entryHeight(e) + (i > 0 ? itemGap : 0), 0);
    const headingH = unitsHeight(item, 0, item.units.length, item.unitGap);
    if (nextUsed + itemGap + headingH > contentHeight) continue;
    page.entries.pop();
    nextPage.entries.unshift({ blockId: last.blockId, unitStart: last.unitStart, unitEnd: last.unitEnd, continuedFrom: false, continues: false });
    if (page.entries.length === 0) {
      pages.splice(pIdx, 1);
      for (let k = 0; k < pages.length; k += 1) pages[k].index = k + 1;
    }
  }

  return { ok, pages, diagnostics };
}

/**
 * 覆盖性校验（A05 完成标准的机器化表达）：
 * - 每个非省略布局项的单元区间 [0, units.length) 恰好被覆盖一次（无重叠、无遗漏）
 * - 页顺序与项顺序一致（entry 出现顺序 == items 顺序，同一 item 的片段单调递增）
 * @param {LayoutItem[]} items
 * @param {CardPagePlan} plan
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function verifyPagePlan(items, plan) {
  /** @type {string[]} */
  const problems = [];
  const byId = new Map(items.map((it) => [it.blockId, it]));
  /** @type {Map<string, number>} */
  const coveredTo = new Map();
  let lastItemIdx = -1;
  items.forEach((it) => byId.set(it.blockId, it));

  for (const page of plan.pages) {
    for (const entry of page.entries) {
      const item = byId.get(entry.blockId);
      if (!item) {
        problems.push(`plan 引用了未知块：${entry.blockId}`);
        continue;
      }
      const itemIdx = items.indexOf(item);
      if (itemIdx < lastItemIdx) {
        problems.push(`顺序错乱：${entry.blockId} 出现在更早块之后`);
      }
      lastItemIdx = Math.max(lastItemIdx, itemIdx);
      const prev = coveredTo.get(entry.blockId);
      if (prev === undefined) {
        if (entry.unitStart !== 0) problems.push(`${entry.blockId} 首片段不从 0 开始（unitStart=${entry.unitStart}）`);
        if (entry.continuedFrom) problems.push(`${entry.blockId} 首片段标记了 continuedFrom`);
      } else if (entry.unitStart !== prev) {
        problems.push(`${entry.blockId} 单元区间重叠或遗漏：期望起点 ${prev}，实际 ${entry.unitStart}`);
      }
      coveredTo.set(entry.blockId, entry.unitEnd);
      if (entry.unitEnd > item.units.length) {
        problems.push(`${entry.blockId} unitEnd ${entry.unitEnd} 超出单元数 ${item.units.length}`);
      }
    }
  }
  for (const it of items) {
    const covered = coveredTo.get(it.blockId);
    if (covered !== it.units.length) {
      problems.push(`${it.blockId} 未被完整覆盖：覆盖到 ${covered ?? "无"}，应为 ${it.units.length}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
