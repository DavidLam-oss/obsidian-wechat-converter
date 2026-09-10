/*
## 核心功能

图片卡片渲染引擎（布局主循环 + 门面）：分页布局循环（measure → plan → assemble → 溢出核验收缩重排，
最多 LAYOUT_ROUND_BUDGET 轮），并 re-export 装配/测量/捕获子模块的全部公开符号（消费方统一从本模块导入）。

## 输入

`renderCardPages(doc, options)` → 分页布局循环；其余 API 见子模块：
`card-render-assembly.js`（页面装配/样式注入/离屏容器/RATIO_PRESETS）、
`card-render-measure.js`（真实 DOM 测量/内容高度/图片就绪等待）、
`card-render-capture.js`（捕获槽/capturePage/PNG 尺寸解析）、
`card-render-debug.js`（ICARD_DEBUG_LAYOUT 诊断日志，内部使用不 re-export）。

## 输出

分页页面集合（含 detach，调用方捕获完后必须调用）；re-export 的装配/测量/捕获符号。

## 关键约束（规划 §5.1 / §5.6）

- 测量/捕获容器必须附着在真实文档并参与布局：position:fixed + visibility:hidden，禁止 display:none。
- 预览与导出同一页面模板；仅输出倍率不同。
- 测量与装配必须用同一渲染路径（renderBlockElement/renderCalloutBlock + wrapParagraphSpans 确定性包裹），
  保证 span 序号两次渲染一致（行区间可重放）。
- 溢出核验：装配后逐页 scrollHeight − clientHeight，超限则收缩可用高度重排；轮次上限固定（不允许绕过 §5.6）。

## 定位

位于 services/，卡片布局循环与统一导出门面；2026-09 拆分自原 848 行单文件
（装配 → card-render-assembly、测量 → card-render-measure、捕获 → card-render-capture、诊断 → card-render-debug）。

## 依赖

`card-themes.js`、`card-pagination.js`、`card-resources.js`、`card-render-assembly.js`、
`card-render-measure.js`、`card-render-debug.js`；捕获依赖在 card-render-capture.js（modern-screenshot）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 本模块只承载布局主循环：新增装配/测量/捕获能力分别放入对应子模块，勿回流膨胀。
- 溢出收缩安全余量（LAYOUT_OVERFLOW_SLACK）在循环与 debugLayoutLogOverflow 间共享，调整时同步。
*/

import { CARD_PAGE_WIDTH, CARD_PAGE_HEIGHT_3_4, getCardTheme } from "./card-themes.js";
import { createSnapshotResolver } from "./card-resources.js";
import {
  LAYOUT_ROUND_BUDGET,
  createCardPagePlan,
  createLayoutItems,
  mapManualBreaks,
  verifyPagePlan,
} from "./card-pagination.js";
import { assembleCardPageFromPlan, attachOffscreenContainer, ensurePageStyle, withCardTypography } from "./card-render-assembly.js";
import { measureCardDocument, measureContentHeight } from "./card-render-measure.js";
import { debugLayoutLog, debugLayoutLogFail, debugLayoutLogOverflow, debugLayoutLogResources } from "./card-render-debug.js";

// —— 门面 re-export：消费方统一从 card-render-engine.js 导入 ——

export { RATIO_PRESETS, assembleCardPage, assembleCardPageFromPlan, ensurePageStyle, attachOffscreenContainer, withCardTypography } from "./card-render-assembly.js";
export { CALLOUT_PAD_VERTICAL, measureContentHeight, measureCardDocument } from "./card-render-measure.js";
export {
  CAPTURE_LIBRARY_IDS,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  capturePage,
  getCaptureSlotState,
  resetCaptureSlotForTests,
  readPngSize,
} from "./card-render-capture.js";

/** 布局循环溢出重排的安全余量（px） */
export const LAYOUT_OVERFLOW_SLACK = 4;

/* 布局循环消费无类型 CardDocument（CardBlock 为 JSDoc 形状）与装箱/测量中间产物（推断 any），
   全部经 card_layout_integration.test.js / card_pagination.test.js 断言，此处关闭 unsafe-* 检查 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- 布局循环消费 any 形状的文档块与测量/装箱产物 */

/**
 * 分页布局主循环（A05）：测量 → 装箱 → 片段重建 → 溢出核验（超限收缩可用高度重排）。
 * 轮次上限固定为 LAYOUT_ROUND_BUDGET（传入更大值会被钳制，不允许绕过 §5.6 上限）。
 * 返回的页面已附着在离屏容器（可直接 capturePage）；调用方捕获完成后必须调用 detach()。
 * @param {import('./card-document.js').CardDocument} cardDoc
 * @param {object} [options]
 * @param {import('./card-themes.js').CardTheme} [options.theme]
 * @param {string} [options.themeId]
 * @param {{width?: number, height?: number}} [options.size]
 * @param {(ref: string) => string | null} [options.resolveImageSrc]
 * @param {import('./card-resources.js').CardResourceSnapshot} [options.resources]
 * @param {Document} [options.document]
 * @param {import('./card-themes.js').CardTypography} [options.typography] B03 排版覆盖（字号/行高/边距）
 * @param {number} [options.contentHeight] 覆盖自动测算的可用内容高度（测试/覆盖入口）
 * @param {(cardDoc: any, options: any) => any} [options.measureFn] 测量注入（测试用；默认真实 DOM 测量）
 * @param {number} [options.maxRounds] 布局轮次上限（默认且至多 LAYOUT_ROUND_BUDGET）
 * @returns {Promise<{ok: boolean, pages: HTMLElement[], plan: import('./card-pagination.js').CardPagePlan, diagnostics: Array<import('./card-pagination.js').PlanDiagnostic>, rounds: number, detach: () => void}>}
 */
export async function renderCardPages(cardDoc, options = {}) {
  const ownerDoc = options.document || window.document;
  const typography = options.typography;
  const theme = withCardTypography(
    options.theme || getCardTheme(options.themeId),
    typography,
  );
  const size = /** @type {{width: number, height: number}} */ (
    options.size || { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 }
  );
  const resolveImageSrc = options.resolveImageSrc ||
    (options.resources ? createSnapshotResolver(options.resources) : undefined);
  const measureFn = options.measureFn || measureCardDocument;
  const maxRounds = Math.max(1, Math.min(options.maxRounds ?? LAYOUT_ROUND_BUDGET, LAYOUT_ROUND_BUDGET));

  const offscreen = attachOffscreenContainer(ownerDoc);
  const fail = (diagnostics, rounds) => {
    offscreen.detach();
    return {
      ok: false,
      pages: [],
      plan: /** @type {import('./card-pagination.js').CardPagePlan} */ ({ ok: false, pages: [], diagnostics }),
      diagnostics,
      rounds,
      detach: () => {},
    };
  };

  try {
    ensurePageStyle(theme, ownerDoc, typography);
    let contentHeight = typeof options.contentHeight === "number"
      ? options.contentHeight
      : measureContentHeight({ theme, size, document: ownerDoc });
    debugLayoutLogResources(options.resources);

    for (let round = 1; round <= maxRounds; round += 1) {
      const measured = await measureFn(cardDoc, { theme, size, resolveImageSrc, document: ownerDoc, typography });
      const items = createLayoutItems(cardDoc, measured);
      const breakBefore = mapManualBreaks(cardDoc, items);
      const plan = createCardPagePlan(items, {
        contentHeight,
        breakBeforeItemIds: breakBefore,
        itemGap: theme.tokens.contentGap,
      });
      if (!plan.ok) {
        debugLayoutLogFail(round, plan.diagnostics, contentHeight);
        return fail(plan.diagnostics, round);
      }
      const verification = verifyPagePlan(items, plan);
      if (!verification.ok) {
        return fail(verification.problems.map((message) =>
          /** @type {import('./card-pagination.js').PlanDiagnostic} */ ({ blockId: "", reason: "oversized-atomic", message })
        ), round);
      }
      debugLayoutLog(round, {
        contentHeight,
        itemGap: theme.tokens.contentGap,
        measured,
        items,
        pages: plan.pages,
      });

      // 装配 + 附着 + 溢出核验（§A05 ⑥）；失败页移除后收缩高度重排
      const pages = plan.pages.map((p) => assembleCardPageFromPlan(cardDoc, p, items, {
        theme,
        size,
        resolveImageSrc,
        document: ownerDoc,
        pageCount: plan.pages.length,
        contentHeight,
      }));
      for (const p of pages) offscreen.container.append(p);

      let worst = 0;
      for (const p of pages) {
        const contentEl = p.querySelector(".icard-content");
        if (!contentEl) continue;
        const overflow = contentEl.scrollHeight - contentEl.clientHeight;
        if (overflow > worst) worst = overflow;
      }
      debugLayoutLogOverflow(round, worst, contentHeight, LAYOUT_OVERFLOW_SLACK);
      if (worst <= 0) {
        return { ok: true, pages, plan, diagnostics: [], rounds: round, detach: offscreen.detach };
      }
      for (const p of pages) p.remove();
      contentHeight = Math.max(1, contentHeight - worst - LAYOUT_OVERFLOW_SLACK);
    }
    return fail([{
      blockId: "",
      reason: "oversized-atomic",
      message: `布局在 ${maxRounds} 轮内未能消除溢出，已阻断输出（不裁剪、不静默降级）。`,
    }], maxRounds);
  } catch (error) {
    offscreen.detach();
    throw error;
  }
}
