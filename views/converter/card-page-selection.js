/*
## 核心功能

卡片导出的「页选择」方法组：把「导出哪些页」的选择状态与其界面收口在同一处。
选择本身存在 B01 会话里（`setSelection` / `clearSelection` / `getValidSelection`），
本模块负责三件事——读写入口、空集与失效的回落语义、导出弹窗内的自选清单渲染。

选页界面在**导出弹窗**（`renderCardExportPicker`）：默认导全部，要挑几页就在弹窗里挑。
预览缩略图自 2026-09-20 起不再挂勾选控件
（David：那个勾选不好看，而且默认本来就该导全部）。

## 输入

AppleStyleView 实例（会话注册表、`cardPreviewPendingInput` 的源路径键）、导出弹窗内的
选页交互，以及 `renderCardExportPicker` 的入参（页全集 / 已选集合 / 三个变更回调）。

## 输出

导出 `cardPageSelectionMethods`（由 AppleStyleView 统一组装）：
- `getCardPageSelection()`：当前有效选择（版本失效 / 空集 → null）；null 即「未自选」；
- `resolveCardSelectionSession()`：选择所在的笔记会话；
- `toggleCardPageSelection(pageId)`：切换单页（多选）；
- `applyCardPageSelection(pageIds)`：写入选择（规范化 + 落会话）；
- `renderCardExportPicker(container, options)`：渲染自选页清单（纯展示，选择由回调驱动）。

## 定位

位于 views/converter/，导出选页的子域；清单只作为字段内容挂在 card-export-modal-view.js
的范围字段里，不参与弹窗整体布局。选择状态的版本失效由 services/card-session.js 保证。
从 card-preview.js 拆出（该文件曾因勾选控件越过 800 行软警告线，按「按职责拆模块」拆分）。

## 依赖

`../apple-style-view-shared.js`（getObsidianSetIcon）——清单行的勾选标记需要图标注入；
会话形状由 services/card-session.js 的 `CardNoteSessionLike` 约束
（以 unknown 持有，运行时由契约测试约束）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的 README 是否仍准确。
- **不变量**：非 null 选择必含 ≥1 页。空集一律走 `clearSelection`（选择回 null），
  语义统一为「未自选 → 回落全部」，避免空数组被资格检查判成 `empty-selection`
  而把「全部」这条路堵死。
  用户「选了自选却一页未勾」是另一回事：由弹窗的 `cardExportScope === 'selected'`
  显式区分，此时禁用开始按钮，绝不静默改判成全部。
- 版本失效（正文 / 设置 / 主题 bump）后会话自动置空，本模块返回 null；
  弹窗在「自选」态下即显示 0 页已选并禁用开始按钮，不得把旧页号对应到新内容（§5.2）。
- 清单的页全集由调用方（弹窗的 `listCardExportPageIds`）传入，本模块**不自己推导**：
  两侧必须是同一份判定（封面在前 + page-1..N），否则会出现「清单里勾得到、
  导出时被过滤掉」的静默少页。
- `renderCardExportPicker` 是纯展示：不自己攒选择状态，行内切换 / 全选 / 清空一律
  交给回调写回会话，再由调用方重绘。本模块不碰任何预览 DOM（缩略图已无选择态）。
- 样式在 styles/card-export.css（icard-export-picker- 前缀）。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- reason: AppleStyleView 方法组跨模块动态组合（同 card-preview），会话合同字段以 unknown 持有，运行时语义由 B01 契约测试约束 */

import { getObsidianSetIcon } from '../apple-style-view-shared.js';

/**
 * 注入 Obsidian 图标。图标不可用时保持空元素：行的选中态由 `is-on` 与 `aria-pressed`
 * 独立表达，不依赖图标渲染（测试替身与旧版 Obsidian 的 setIcon 可能为空实现）。
 * @param {any} el @param {string} name
 */
function applyIcon(el, name) {
  try {
    const setIcon = getObsidianSetIcon();
    if (typeof setIcon === 'function') setIcon(el, name);
  } catch {
    // 图标运行时不可用：状态语义不依赖图标
  }
  el?.setAttribute?.('aria-hidden', 'true');
  return el;
}

/**
 * 清单行标题：封面页与正文页用统一口径。页号直接取自 pageId（唯一真相），
 * 不按清单内序号——否则子集渲染会把 page-3 显示成「第 1 页」。
 * @param {string} pageId
 */
function pageRowLabel(pageId) {
  if (String(pageId) === 'cover') return '封面';
  const match = /^page-(\d+)$/.exec(String(pageId || ''));
  return match ? `第 ${Number(match[1])} 页` : String(pageId || '');
}

/** @type {CardPageSelectionMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardPageSelectionMethods = {
/**
 * 当前有效页选择（版本安全）：会话在任一 bump 后选择自动失效 → 返回 null（= 未自选）。
 * 空集合按「未自选」处理，调用方一律回落「全部」（§5.2 不把旧页号对应新内容）。
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
 * 当前笔记的卡片会话（选择读写与导出共用）；无预览输入（未排版）时返回 null。
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
 * 切换单页选择（多选）。
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
 * 写入页选择：会话持有并绑定当前版本；清空时用 `clearSelection`（保持「非 null 选择必含 ≥1 页」），
 * 使「未自选」「全部取消」「版本失效」三种情形统一回落「全部」。
 * 调用方（导出弹窗）自行重绘，本模块不碰预览 DOM。
 * @param {string[]} pageIds
 */
applyCardPageSelection(pageIds) {
  // 规范化：去重 + 按页序升序（会话与导出都按页序消费；封面页 id 固定为 `cover`，排在最前）
  const ordinals = new Set();
  let hasCover = false;
  for (const id of Array.isArray(pageIds) ? pageIds : []) {
    if (String(id || '') === 'cover') {
      hasCover = true;
      continue;
    }
    const match = /^page-(\d+)$/.exec(String(id || ''));
    if (match) ordinals.add(Number(match[1]));
  }
  const ids = [...ordinals].sort((a, b) => a - b).map((n) => `page-${n}`);
  if (hasCover) ids.unshift('cover');

  const session = /** @type {any} */ (this.resolveCardSelectionSession());
  if (session) {
    if (ids.length > 0 && typeof session.setSelection === 'function') session.setSelection(ids);
    else if (typeof session.clearSelection === 'function') session.clearSelection();
  }
}
,

/**
 * 渲染「自选页」清单：已选计数 + 全选 / 清空 + 逐页行（点击即切换）。
 * 纯展示——不自己攒选择状态，任何变更都经回调写回会话，由调用方重绘（单一真相）。
 * 「全选 / 清空」只在真能起作用时才渲染，不摆无效按钮；
 * 一页未选时计数处直接说清，而不是把问题留到开始按钮的禁用提示里。
 * @param {any} container @param {{ pageIds: string[], selected: Set<string>, onToggle: (pageId: string) => void, onSelectAll: () => void, onClear: () => void }} options
 */
renderCardExportPicker(container, options) {
  const pageIds = Array.isArray(options?.pageIds) ? options.pageIds : [];
  const selected = options?.selected instanceof Set ? options.selected : new Set();
  const picker = container.createEl('div', { cls: 'icard-export-picker' });

  const head = picker.createEl('div', { cls: 'icard-export-picker-head' });
  head.createEl('span', {
    cls: `icard-export-picker-count${selected.size === 0 ? ' is-empty' : ''}`,
    text: selected.size === 0 ? '尚未选择任何页' : `已选 ${selected.size} 页`,
  });
  const quick = head.createEl('div', { cls: 'icard-export-picker-quick' });
  if (selected.size < pageIds.length) {
    const allBtn = quick.createEl('button', {
      cls: 'icard-export-picker-quick-btn',
      text: '全选',
      attr: { type: 'button' },
    });
    allBtn.addEventListener('click', () => options.onSelectAll());
  }
  if (selected.size > 0) {
    const clearBtn = quick.createEl('button', {
      cls: 'icard-export-picker-quick-btn',
      text: '清空',
      attr: { type: 'button' },
    });
    clearBtn.addEventListener('click', () => options.onClear());
  }

  const list = picker.createEl('div', { cls: 'icard-export-picker-list' });
  for (const pageId of pageIds) {
    const on = selected.has(pageId);
    const row = list.createEl('button', {
      cls: `icard-export-picker-row${on ? ' is-on' : ''}`,
      attr: { type: 'button', 'data-page': pageId, 'aria-pressed': on ? 'true' : 'false' },
    });
    const mark = row.createEl('span', { cls: 'icard-export-picker-mark' });
    // 关态只留一个空框（CSS 画），开态才注入对勾：图标缺失时靠 is-on 区分
    if (on) applyIcon(mark, 'check');
    row.createEl('span', { cls: 'icard-export-picker-name', text: pageRowLabel(pageId) });
    row.addEventListener('click', () => options.onToggle(pageId));
  }
}
,
};
