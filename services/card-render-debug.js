/*
## 核心功能

卡片布局调试日志（自 card-render-engine.js 拆出）：`window.ICARD_DEBUG_LAYOUT = true` 开关控制的
逐轮装箱明细 / 溢出核验 / 布局失败诊断 / 资源快照状态输出。默认关闭、零开销。

## 输入

- `debugLayoutLog(round, {contentHeight, itemGap, measured, items, pages})`：每轮装箱明细。
- `debugLayoutLogOverflow(round, worst, contentHeight, slack)`：溢出核验结果。
- `debugLayoutLogFail(round, diagnostics, contentHeight)`：布局失败诊断。
- `debugLayoutLogResources(resources?)`：资源快照状态（排查「图片没出来」）。

## 输出

宿主控制台 `[icard-layout]` 前缀日志。

## 定位

位于 services/，纯诊断输出层；只读 window 开关，不参与布局逻辑。
用途：诊断「页底空白 / 提前断页 / 图片缺失」（B02 实机验证期间引入）。

## 依赖

无运行时依赖；window 可不存在（node 测试环境静默跳过）。

## 维护规则

- B 阶段实机验证完毕后可整体移除本模块与引擎内调用点。
- console 输出必须保持带理由注释的 lint 例外（no-console）。
*/

/* 诊断日志消费无类型的测量/装箱中间产物（measured/items/pages 为 any 形状）与 window 开关，
   仅读取不写入、受 ICARD_DEBUG_LAYOUT 开关控制，此处关闭 unsafe-* 检查 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- 调试日志消费 any 形状的布局中间产物 + window 开关 */

/**
 * @param {number} round
 * @param {{ contentHeight: number, itemGap: number, measured: any, items: any[], pages: any[] }} data
 */
export function debugLayoutLog(round, data) {
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.ICARD_DEBUG_LAYOUT) return;
  const lines = [];
  lines.push(`[icard-layout] round=${round} contentHeight=${Math.round(data.contentHeight)} itemGap=${data.itemGap} pages=${data.pages.length}`);
  const itemById = new Map(data.items.map((it) => [it.blockId, it]));
  data.pages.forEach((page) => {
    const parts = page.entries.map((/** @type {any} */ e) => {
      const it = itemById.get(e.blockId);
      let h = 0;
      if (it) {
        h = e.scaled ? data.contentHeight
          : it.units.slice(e.unitStart, e.unitEnd).reduce((/** @type {number} */ a, /** @type {{height: number}} */ u, /** @type {number} */ i) =>
            a + u.height + (i > 0 ? it.unitGap : 0), 0);
      }
      const src = it && it.meta ? `${it.meta.sourceStart}-${it.meta.sourceEnd}` : "?";
      return `${e.blockId}@${src}[${e.unitStart},${e.unitEnd})${e.continuedFrom ? "^" : ""}${e.continues ? "…" : ""}${e.scaled ? "scaled" : ""}≈${Math.round(h)}`;
    });
    const used = page.entries.reduce((/** @type {number} */ acc, /** @type {any} */ e, /** @type {number} */ i) => {
      const it = itemById.get(e.blockId);
      let h = 0;
      if (it) {
        h = e.scaled ? data.contentHeight
          : it.units.slice(e.unitStart, e.unitEnd).reduce((/** @type {number} */ a, /** @type {{height: number}} */ u, /** @type {number} */ i) =>
            a + u.height + (i > 0 ? it.unitGap : 0), 0);
      }
      return acc + h + (i > 0 ? data.itemGap : 0);
    }, 0);
    lines.push(`[icard-layout]   p${page.index} used≈${Math.round(used)} | ${parts.join("  ")}`);
  });
  const paraInfo = Object.entries(data.measured.paragraphUnits || {})
    .map(([id, units]) => `${id}:${/** @type {any[]} */ (units).length}行/${Math.round(/** @type {any[]} */ (units).reduce((a, u) => a + u.height, 0))}px`)
    .join(" ");
  lines.push(`[icard-layout] 段落行单元 ${paraInfo || "无"}`);
  const heights = Object.entries(data.measured.heights || {})
    .map(([id, h]) => `${id}:${Math.round(/** @type {number} */ (h))}`)
    .join(" ");
  lines.push(`[icard-layout] 块高 ${heights}`);
  // eslint-disable-next-line no-console -- 受 ICARD_DEBUG_LAYOUT 开关控制的诊断输出
  console.log(lines.join("\n"));
}

/**
 * @param {number} round
 * @param {number} worst
 * @param {number} contentHeight
 * @param {number} slack 溢出收缩安全余量（LAYOUT_OVERFLOW_SLACK，由调用方传入）
 */
export function debugLayoutLogOverflow(round, worst, contentHeight, slack) {
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.ICARD_DEBUG_LAYOUT) return;
  // eslint-disable-next-line no-console -- 受 ICARD_DEBUG_LAYOUT 开关控制的诊断输出
  console.log(`[icard-layout] round=${round} 溢出核验 worst=${worst}px → contentHeight ${Math.round(contentHeight)}${worst > 0 ? ` → 收缩至 ${Math.round(contentHeight - worst - slack)}` : "（通过）"}`);
}

/**
 * @param {number} round
 * @param {Array<{ blockId: string, message: string }>} diagnostics
 * @param {number} contentHeight
 */
export function debugLayoutLogFail(round, diagnostics, contentHeight) {
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.ICARD_DEBUG_LAYOUT) return;
  const lines = [`[icard-layout] round=${round} 布局失败（contentHeight=${Math.round(contentHeight)}）诊断 ${diagnostics.length} 条：`];
  for (const d of diagnostics) lines.push(`[icard-layout]   ✗ ${d.blockId || "-"}: ${d.message}`);
  // eslint-disable-next-line no-console -- 受 ICARD_DEBUG_LAYOUT 开关控制的诊断输出
  console.log(lines.join("\n"));
}

/**
 * 资源快照状态诊断：排查「图片没出来」（ref 缺失 / resolve-failed / error / timeout / budget 等）。
 * @param {import('./card-resources.js').CardResourceSnapshot} [resources]
 */
export function debugLayoutLogResources(resources) {
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.ICARD_DEBUG_LAYOUT) return;
  const images = (resources && resources.images) || {};
  const refs = Object.keys(images);
  const lines = [`[icard-layout] 资源快照 ${refs.length} 张图片：`];
  for (const ref of refs) {
    const e = /** @type {any} */ (images[ref]);
    lines.push(`[icard-layout]   ${e.status === "ok" ? "✓" : "✗"} [${e.status}] ${ref.slice(0, 80)}${e.width ? ` ${e.width}x${e.height}` : ""}${e.bytes ? ` ${(e.bytes / 1024).toFixed(0)}KB` : ""}`);
  }
  // eslint-disable-next-line no-console -- 受 ICARD_DEBUG_LAYOUT 开关控制的诊断输出
  console.log(lines.join("\n"));
}
