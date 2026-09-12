/*
## 核心功能

卡片预览的「页勾选」方法组（B05）：把「导出哪些页」这件事的选择状态单独收口。
选择本身存在 B01 会话里（`setSelection` / `clearSelection` / `getValidSelection`），
本模块只负责三件事——读写入口、DOM 勾选态刷新、空集与失效的回落语义。

勾选与源定位是两个独立操作（规划 §3.1）：本模块**不**碰编辑器，源定位仍在
card-preview.js 的 `locateCardPageSource`。

## 输入

AppleStyleView 实例（会话注册表、`cardPreviewPendingInput` 的源路径键、预览 shell）
与用户勾选交互。

## 输出

导出 `cardPageSelectionMethods`（由 AppleStyleView 统一组装）：
- `getCardPageSelection()`：当前有效勾选（版本失效 / 空集 → null）；
- `resolveCardSelectionSession()`：勾选所在的笔记会话；
- `toggleCardPageSelection(pageId)`：切换单页勾选（多选）；
- `applyCardPageSelection(pageIds)`：写入勾选（规范化 + 落会话 + 刷新 DOM）；
- `syncCardPageSelectionDom()`：按选择刷新勾选控件与摘要 chip。

## 定位

位于 views/converter/，卡片预览的勾选子域；渲染与编排在 card-preview.js，
选择状态的版本失效由 services/card-session.js 保证。从 card-preview.js 拆出
（该文件因勾选控件越过 800 行软警告线，按「按职责拆模块」拆分）。

## 依赖

`../apple-style-view-shared.js` 无直接依赖；会话形状由 services/card-session.js 的
`CardNoteSessionLike` 约束（以 unknown 持有，运行时由契约测试约束）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的 README 是否仍准确。
- **不变量**：非 null 选择必含 ≥1 页。空集一律走 `clearSelection`（选择回 null），
  语义统一为「未勾选 → 回落全部」，避免空数组被资格检查判成 `empty-selection`
  而把「全部」导出堵死。
- 版本失效（正文/设置/主题 bump）后会话自动置空，本模块返回 null，调用方回落「全部」并提示。
- 勾选只更新已有 DOM（不重建缩略页），勾选时不得抖动预览滚动位置。
- 样式在 styles/card-preview.css（icard-preview-page-check / -chip.is-selection）。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- reason: AppleStyleView 方法组跨模块动态组合（同 card-preview），会话合同字段以 unknown 持有，运行时语义由 B01 契约测试约束 */

/** @type {CardPageSelectionMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardPageSelectionMethods = {
/**
 * 当前有效页勾选（版本安全）：会话在任一 bump 后选择自动失效 → 返回 null（= 未勾选）。
 * 空集合按「未勾选」处理，调用方一律回落「全部」（§5.2 不把旧页号对应新内容）。
 * @returns {string[] | null}
 */
getCardPageSelection() {
  const session = /** @type {any} */ (this.resolveCardSelectionSession());
  const valid = session && typeof session.getValidSelection === 'function' ? session.getValidSelection() : null;
  if (!valid || !Array.isArray(valid.pageIds) || valid.pageIds.length === 0) return null;
  return [...valid.pageIds];
}
,

/**
 * 当前笔记的卡片会话（勾选读写与源定位共用）；无预览输入（未排版）时返回 null。
 * @returns {any | null}
 */
resolveCardSelectionSession() {
  const selfRecord = /** @type {any} */ (this);
  const sourcePathKey = String(selfRecord.cardPreviewPendingInput?.sourcePathKey || '');
  if (!sourcePathKey) return null;
  return /** @type {any} */ (this.getCardSessions()).getSession(sourcePathKey) || null;
}
,

/**
 * 切换单页勾选（多选）。
 * @param {string} pageId
 */
toggleCardPageSelection(pageId) {
  const id = String(pageId || '');
  if (!id) return;
  const ids = new Set(this.getCardPageSelection() || []);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  this.applyCardPageSelection([...ids]);
}
,

/**
 * 写入页勾选：会话持有并绑定当前版本；清空时用 `clearSelection`（保持「非 null 选择必含 ≥1 页」），
 * 使「未勾选」「全部取消」「版本失效」三种情形统一回落「全部」。
 * 只刷新已有 DOM（不重建缩略页），避免勾选时预览滚动位置跳动。
 * @param {string[]} pageIds
 */
applyCardPageSelection(pageIds) {
  // 规范化：去重 + 按页序升序（会话与导出都按页序消费）
  const ordinals = new Set();
  for (const id of Array.isArray(pageIds) ? pageIds : []) {
    const match = /^page-(\d+)$/.exec(String(id || ''));
    if (match) ordinals.add(Number(match[1]));
  }
  const ids = [...ordinals].sort((a, b) => a - b).map((n) => `page-${n}`);

  const session = /** @type {any} */ (this.resolveCardSelectionSession());
  if (session) {
    if (ids.length > 0 && typeof session.setSelection === 'function') session.setSelection(ids);
    else if (typeof session.clearSelection === 'function') session.clearSelection();
  }
  /** @type {any} */ (this).cardPreviewSelectedCount = ids.length;
  this.syncCardPageSelectionDom();
}
,

/**
 * 按当前选择刷新预览 DOM（页勾选态 + 摘要 chip），不重建缩略页。
 */
syncCardPageSelectionDom() {
  const selfRecord = /** @type {any} */ (this);
  const selected = this.getCardPageSelection();
  const count = selected ? selected.length : 0;
  selfRecord.cardPreviewSelectedCount = count;
  const shell = selfRecord.cardPreviewShell;
  if (!shell) return;
  const set = new Set(selected || []);
  shell.querySelectorAll('.icard-preview-page-item').forEach((item) => {
    const el = /** @type {HTMLElement} */ (item);
    const checked = set.has(`page-${el.dataset.pageIndex || ''}`);
    el.classList.toggle('is-selected', checked);
    const check = el.querySelector('.icard-preview-page-check');
    if (check) {
      check.classList.toggle('is-checked', checked);
      check.setAttribute('aria-pressed', checked ? 'true' : 'false');
    }
  });
  const chip = shell.querySelector('.icard-preview-chip.is-selection');
  if (!chip) return;
  if (count > 0) {
    chip.textContent = `已勾选 ${count} 页 · 导出时可只导这些页`;
    chip.classList.remove('hidden');
  } else {
    chip.textContent = '';
    chip.classList.add('hidden');
  }
}
,
};
