/*
## 核心功能

给「承载转换器视图的 Obsidian 侧栏」钉一条宽度下限：用户把侧栏往回收窄到下限时会被顶住，
手机框预览不再被压扁、经典预览也不会被挤成一列字。

## 输入

接收 AppleStyleView 实例（只读取 `containerEl`，侧栏由它向上查找）。

## 输出

无返回值；副作用是给侧栏 split 加 `owc-pane-min-width` 类并写入 `--owc-pane-min-width`
变量（样式规则在 styles/base.css），视图关闭时按「同一侧栏是否还挂着本插件的其它标签页」
决定是否撤销。

## 定位

位于 views/converter/，只负责「侧栏宽度闸门」这一件事；不参与预览排版。

## 依赖

关键依赖：`../shared/view-constants.js` 的 `APPLE_STYLE_VIEW`（判断同侧栏是否还有别的实例）。

## 维护规则

- `MIN_PANE_WIDTH` 的算式写在常量上方；改手机框宽度、画布留白或依赖 Obsidian 内边距时同步更新。
- 样式侧必须排除折叠态：Obsidian 折叠靠把 `width` 动画到 0，`min-width` 会把它顶住不动。
*/

import { APPLE_STYLE_VIEW } from '../shared/view-constants.js';

/**
 * 承载预览的侧栏宽度下限（px）。
 *
 * `400` 的来历：手机框 340 + 画布左右留白 16×2 + Obsidian 视图内边距 12×2（`--size-4-3`）
 * = 396，取 400 留 4px 余量（滚动条 / 取整）。低于这个宽度，机身会被画布裁掉一截。
 *
 * 为什么把闸门放在「侧栏」而不是「预览容器」：用户拖的是侧栏，预览只是它的内容。
 * 在容器上设 min-width 只会让内容溢出后被 `overflow:hidden` 裁掉（Issue #83 的原现象），
 * 完全挡不住拖拽动作本身。
 */
export const MIN_PANE_WIDTH = 400;

/** 标记类：只落在挂载本插件视图的侧栏上，不干扰其它侧栏内容。 */
const LOCK_CLASS = 'owc-pane-min-width';
/** 实际取值走 CSS 变量，方便测试注入与将来做设置项。 */
const MIN_WIDTH_VAR = '--owc-pane-min-width';

/**
 * 视图句柄 → 被锁的侧栏元素。
 * 用 WeakMap 而不是挂在 view 上：无需扩视图契约类型，视图销毁后条目自动释放。
 * @type {WeakMap<object, HTMLElement>}
 */
const lockedSplits = new WeakMap();

/**
 * 从视图容器向上找承载它的侧栏（左/右 sidedock）。
 *
 * 不能只用 `closest('.workspace-split')`：视图与 sidedock 之间可能还隔着内层 split，
 * 就近命中会拿到错的那一层。
 *
 * @param {HTMLElement|null|undefined} containerEl
 * @returns {HTMLElement|null}
 */
export function resolveHostSidedock(containerEl) {
  let node = /** @type {HTMLElement|null} */ (containerEl || null);
  while (node) {
    if (node.classList?.contains('mod-left-split') || node.classList?.contains('mod-right-split')) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * 同一侧栏里是否还挂着本插件的另一个标签页（排除正在关闭的这一个）。
 *
 * @param {HTMLElement} split
 * @param {HTMLElement|null|undefined} ownContainerEl
 * @returns {boolean}
 */
function hasOtherInstances(split, ownContainerEl) {
  const ownLeaf = ownContainerEl?.closest?.('.workspace-leaf') || null;
  const mounted = split.querySelectorAll(`.workspace-leaf-content[data-type="${APPLE_STYLE_VIEW}"]`);
  for (const leaf of mounted) {
    if (ownLeaf && ownLeaf.contains(leaf)) continue;
    return true;
  }
  return false;
}

/**
 * 给侧栏上锁。
 *
 * @param {{ containerEl?: HTMLElement }} view
 * @returns {boolean} 是否真的上锁（视图在主编辑区打开时返回 false，不动任何东西）
 */
export function lockPaneMinWidth(view) {
  const split = resolveHostSidedock(view?.containerEl);
  if (!split) return false;
  split.style.setProperty(MIN_WIDTH_VAR, `${MIN_PANE_WIDTH}px`);
  split.classList.add(LOCK_CLASS);
  lockedSplits.set(/** @type {object} */ (view), split);
  return true;
}

/**
 * 去掉锁标记与变量。
 *
 * @param {HTMLElement} split
 */
function releaseLock(split) {
  split.classList.remove(LOCK_CLASS);
  split.style.removeProperty(MIN_WIDTH_VAR);
}

/**
 * 撤锁。同一侧栏还有本插件的其它标签页时保持上锁，避免来回切标签把宽度弹回去。
 *
 * @param {{ containerEl?: HTMLElement }} view
 */
export function unlockPaneMinWidth(view) {
  const key = /** @type {object} */ (view);
  const split = lockedSplits.get(key) || resolveHostSidedock(view?.containerEl);
  if (!split) return;
  lockedSplits.delete(key);
  if (!hasOtherInstances(split, view?.containerEl)) {
    releaseLock(split);
    return;
  }

  // 关闭的瞬间本视图的 leaf 可能还没被摘除，同一侧栏的另一个标签也可能在同一轮关闭。
  // 下一帧 DOM 已稳定，再按「侧栏里还有没有本插件的视图」判一次，避免留下永远撤不掉的锁。
  const win = split.ownerDocument?.defaultView;
  if (typeof win?.requestAnimationFrame !== 'function') return;
  win.requestAnimationFrame(() => {
    if (!split.isConnected) return;
    const stillMounted = split.querySelector(`.workspace-leaf-content[data-type="${APPLE_STYLE_VIEW}"]`);
    if (!stillMounted) releaseLock(split);
  });
}
