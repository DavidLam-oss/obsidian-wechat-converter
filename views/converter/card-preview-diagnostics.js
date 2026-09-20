/*
## 核心功能

卡片预览的「省略/资源明细区」方法组（原 B03 ③④诊断区；2026-09-20 David 简化：
就绪态顶部 chips 已说明省略概况，底部明细 + 「已知悉」确认属重复信息且确认
本不改变排版结果，整块移除并连带去掉导出前的省略确认闸门）。
本模块现在只服务「正文全部未进入卡片」的空态：那里明细是唯一的信息来源。
可展开明细（类型 + 摘录 + 定位原文）。

## 输入

AppleStyleView 实例（预览 shell、源定位方法）与最近一次排版 outcome
（omissionSummary / cardDoc.blocks / diagnostics / resources.failures）。

## 输出

导出 `cardPreviewDiagnosticsMethods`（由 AppleStyleView 统一组装）：
- `renderCardDiagnosticArea(shell, outcome)`：渲染可展开明细（无省略且无资源失败时不渲染）；
- `appendCardDiagnosticRow(area, list, item)`：单条明细行（类型 + 摘录 + 可定位按钮）。
另导出 `OMISSION_LABELS`（省略原因 → 用户可读标签，预览摘要 chip 复用）。

## 定位

位于 views/converter/，卡片预览的诊断子域；渲染与编排在 card-preview.js。

## 依赖

`../apple-style-view-shared.js` 无直接依赖；`locateCardSourceLine` 由 card-preview.js
方法组提供（经 this 调用）。样式在 styles/card-preview.css（icard-preview-diagnostics-*）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的 README 是否仍准确。
- 省略不阻断导出（2026-09-20 David 定）：预览 chips + 导出弹窗提示各说一次即止，
  不得再加「确认后才能导出」类闸门。
- 自动展开明细不记为用户意图（§5.5 弹窗与视觉规则），折叠是默认态。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- reason: AppleStyleView 方法组跨模块动态组合（同 card-preview），outcome 形状以 any 持有，运行时语义由 B03 契约测试约束 */

/** 省略原因 → 用户可读标签（§4.1 一期口径） */
export const OMISSION_LABELS = {
  codeBlock: '代码块',
  mermaid: 'Mermaid 图',
  gif: 'GIF 动图',
  blockFormula: '块级公式',
  inlineFormula: '行内公式',
  unsupportedEmbed: '未支持嵌入',
};

/** @type {CardPreviewDiagnosticsMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardPreviewDiagnosticsMethods = {
/**
 * 省略/资源明细区（仅「正文全部未进入卡片」空态使用）：可展开明细（类型 + 摘录 + 定位原文）。
 * @param {ObsidianElementLike} shell
 * @param {Record<string, any>} outcome
 */
renderCardDiagnosticArea(shell, outcome) {
  const omissionTotal = Number(outcome?.omissionSummary?.total || 0);
  const resourceBlocking = outcome?.resources?.hasBlockingFailures === true;
  if (!omissionTotal && !resourceBlocking) return;

  const area = shell.createEl('div', { cls: 'icard-preview-diagnostics' });
  const toggle = area.createEl('button', {
    cls: 'icard-preview-diagnostics-toggle',
    text: '查看未进入卡片的内容',
    attr: { 'aria-expanded': 'false', 'title': '展开省略明细' },
  });
  const list = area.createEl('div', { cls: 'icard-preview-diagnostics-list hidden' });
  toggle.addEventListener('click', () => {
    const hidden = list.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    toggle.textContent = hidden ? '查看未进入卡片的内容' : '收起明细';
  });

  const blocks = Array.isArray(outcome?.cardDoc?.blocks) ? outcome.cardDoc.blocks : [];
  const diagnostics = Array.isArray(outcome?.diagnostics) ? outcome.diagnostics : [];
  for (const diag of diagnostics) {
    const block = blocks.find((b) => b && b.id === diag?.blockId);
    const excerpt = String(block?.text || diag?.detail || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    this.appendCardDiagnosticRow(area, list, {
      kind: OMISSION_LABELS[String(diag?.reason || '')] || String(diag?.reason || '未进入卡片'),
      excerpt,
      sourceStart: Number(diag?.sourceStart || 0),
      highRisk: diag?.highRisk === true,
    });
  }
  if (resourceBlocking) {
    const failed = Array.isArray(outcome?.resources?.failures) ? outcome.resources.failures : [];
    for (const failure of failed.slice(0, 20)) {
      this.appendCardDiagnosticRow(area, list, {
        kind: '图片加载失败',
        excerpt: String(failure?.ref || failure?.message || ''),
        sourceStart: Number(failure?.sourceStart || 0),
        highRisk: false,
      });
    }
  }
}
,

/**
 * 诊断明细行：类型 + 摘录 +（可定位时）定位按钮。
 * @param {ObsidianElementLike} area
 * @param {ObsidianElementLike} list
 * @param {{ kind: string, excerpt: string, sourceStart: number, highRisk: boolean }} item
 */
appendCardDiagnosticRow(area, list, item) {
  const row = list.createEl('div', { cls: 'icard-preview-diagnostic-row' });
  row.createEl('span', {
    cls: `icard-preview-diagnostic-type${item.highRisk ? ' is-high-risk' : ''}`,
    text: item.kind,
  });
  row.createEl('span', {
    cls: 'icard-preview-diagnostic-excerpt',
    text: item.excerpt || '（无文本摘录）',
  });
  if (item.sourceStart >= 1) {
    const locateBtn = row.createEl('button', {
      cls: 'icard-preview-diagnostic-locate',
      text: '定位',
      attr: { 'aria-label': `定位到原文第 ${item.sourceStart} 行`, 'title': '在编辑器中定位原文' },
    });
    locateBtn.addEventListener('click', () => this.locateCardSourceLine(item.sourceStart));
  }
}
,
};
