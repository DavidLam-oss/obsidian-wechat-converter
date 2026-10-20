/*
## 核心功能

给「承载转换器视图的 Obsidian 侧栏」钉一条宽度下限：用户把侧栏往回收窄到下限时会被顶住，
手机框预览不再被压扁、经典预览也不会被挤成一列字。

## 输入

接收 AppleStyleView 实例（读取 `containerEl` 与 `app`）。侧栏优先由 `leaf.getRoot()` 认领，
拿不到再退回 DOM 向上查找；`app.workspace` 可用时挂 `layout-change` / `active-leaf-change`
监听，用于「页签被拖到另一侧栏」「侧栏里切到了别的标签」这类布局变化后的对账。

## 输出

无返回值；副作用是给侧栏 split 加 `owc-pane-min-width` 类并写入 `--owc-pane-min-width`
变量（样式规则在 styles/base.css）。

## 定位

位于 views/converter/，只负责「侧栏宽度闸门」这一件事；不参与预览排版。

## 依赖

关键依赖：`../shared/view-constants.js` 的 `APPLE_STYLE_VIEW`（认领本插件自己的标签页）。

## 维护规则

- `MIN_PANE_WIDTH` 的算式写在常量上方；改手机框宽度、画布留白或依赖 Obsidian 内边距时同步更新。
- 样式侧必须排除折叠态：Obsidian 折叠靠把 `width` 动画到 0，`min-width` 会把它顶住不动。
- 「该不该上锁」只允许有一个判定入口（`reconcile()`）。新增场景（拖页签、切标签、分屏、
  多窗口）都往这里加，不要另开旁路，否则两套判断迟早互相打架。
- 判不准时一律按「上锁」处理：少锁一次会直接退回 Issue #83 的现象，多锁一次只是宽度偏宽。
*/

import { APPLE_STYLE_VIEW } from '../shared/view-constants.js';

/**
 * 本模块用到的 Obsidian `WorkspaceLeaf` 子集（只声明用到的成员）。
 * @typedef {Object} PaneLeafLike
 * @property {() => ({ containerEl?: HTMLElement } | null)} [getRoot]
 * @property {{ containerEl?: HTMLElement }} [view]
 */

/**
 * 本模块用到的 Obsidian `Workspace` 子集。
 * @typedef {Object} PaneWorkspaceLike
 * @property {HTMLElement} [containerEl]
 * @property {(type: string) => PaneLeafLike[]} [getLeavesOfType]
 * @property {(name: string, callback: () => void) => unknown} [on]
 * @property {(ref: unknown) => void} [offref]
 */

/**
 * 本模块用到的 Obsidian `App` 子集。
 * @typedef {Object} PaneAppLike
 * @property {PaneWorkspaceLike} [workspace]
 */

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
/** 侧栏容器的选择器（与 styles/base.css 的规则保持一致）。 */
const SIDEDOCK_SELECTOR = '.workspace-split.mod-sidedock';
/** 本插件视图在 leaf 上的身份标记（Obsidian 给 `.workspace-leaf-content` 打的）。 */
const VIEW_CONTENT_SELECTOR = `.workspace-leaf-content[data-type="${APPLE_STYLE_VIEW}"]`;

/**
 * 会改变「视图落在哪个侧栏 / 是否可见」的事件。
 * `layout-change` 管结构（拖页签、开关标签），`active-leaf-change` 管切换（点标签、点正文）。
 * @type {string[]}
 */
const LAYOUT_EVENTS = ['layout-change', 'active-leaf-change'];

/**
 * 视图句柄 → 被锁的侧栏元素。
 * 用 WeakMap 而不是挂在 view 上：无需扩视图契约类型，视图销毁后条目自动释放。
 * @type {WeakMap<object, HTMLElement>}
 */
const lockedSplits = new WeakMap();

/**
 * workspace → 已注册的事件引用。
 * 同一个 workspace 只注册一份；最后一个本插件视图关闭时摘下，避免插件反复加载后堆监听。
 * @type {WeakMap<PaneWorkspaceLike, unknown[]>}
 */
const layoutRefs = new WeakMap();

/**
 * 判断元素是不是左右侧栏（sidedock）。
 *
 * Obsidian 给侧栏容器同时加 `mod-sidedock` 与 `mod-{left|right}-split`
 * （`SideDock` 构造器里连续两行 `addClass`），所以用前者就够；
 * 后两个留作兜底，防止将来某一侧的类名被单独改动时整个闸门失效。
 *
 * @param {Element|null|undefined} el
 * @returns {boolean}
 */
function isSidedock(el) {
  const classList = el?.classList;
  if (!classList) return false;
  return classList.contains('mod-sidedock')
    || classList.contains('mod-left-split')
    || classList.contains('mod-right-split');
}

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
    if (isSidedock(node)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * 该 leaf 元素是否被「收到后台」。
 *
 * Obsidian 切换标签时对非当前页做 `leaf.containerEl.toggle(currentTab === index)`
 * （见 app.js 的 `updateTabDisplay`），具体落成 `display:none`、`is-hidden`
 * 还是把节点摘走取决于版本 / 是否堆叠模式，所以三种形态都要认。
 *
 * @param {Element|null|undefined} leafEl
 * @returns {boolean}
 */
function isHiddenLeaf(leafEl) {
  if (!leafEl) return true;
  if (leafEl.isConnected === false) return true;
  if (leafEl.classList?.contains('is-hidden')) return true;
  return /** @type {HTMLElement} */ (leafEl).style?.display === 'none';
}

/**
 * 从 leaf 认领它所在的侧栏容器。
 *
 * 优先 `leaf.getRoot().containerEl`：它走 Obsidian 自己的布局树，页签被隐藏
 * （容器从 DOM 摘走）时依然准；DOM 向上查找只作兜底。
 *
 * @param {PaneLeafLike} leaf
 * @returns {HTMLElement|null}
 */
function resolveDockOfLeaf(leaf) {
  const fromTree = leaf?.getRoot?.()?.containerEl;
  if (isSidedock(fromTree)) return /** @type {HTMLElement} */ (fromTree);
  return resolveHostSidedock(leaf?.view?.containerEl);
}

/**
 * 该 leaf 此刻是否真的显示在这条侧栏里。
 *
 * 三个条件：视图容器还在、它的页签没被收起、容器确实位于这条侧栏内。
 * 用户把本插件标签和别的插件标签放同一个侧栏、又切到别人那一页时，
 * 不该让整条侧栏替他保持 400px —— 这里返回 false，锁就被撤掉。
 *
 * @param {PaneLeafLike} leaf
 * @param {HTMLElement|null} split
 * @returns {boolean}
 */
function isLeafShownIn(leaf, split) {
  const el = leaf?.view?.containerEl;
  if (!el) return false;
  if (isHiddenLeaf(el.closest('.workspace-leaf'))) return false;
  return typeof split?.contains === 'function' ? split.contains(el) : true;
}

/**
 * 没有布局树可用时的兜底判定：在侧栏里找「显示着的本插件视图」。
 *
 * @param {HTMLElement} split
 * @param {{ containerEl?: HTMLElement }} [ignoredView] 正在关闭的视图，不计入
 * @returns {boolean}
 */
function hasShownView(split, ignoredView) {
  const ownEl = ignoredView?.containerEl;
  for (const content of split.querySelectorAll(VIEW_CONTENT_SELECTOR)) {
    if (ownEl && content.contains(ownEl)) continue;
    const leafEl = content.closest('.workspace-leaf');
    if (!leafEl) return true;
    if (!isHiddenLeaf(leafEl)) return true;
  }
  return false;
}

/**
 * 落锁：写标记类 + CSS 变量（幂等）。
 *
 * @param {HTMLElement} split
 */
function applyLock(split) {
  split.style.setProperty(MIN_WIDTH_VAR, `${MIN_PANE_WIDTH}px`);
  split.classList.add(LOCK_CLASS);
}

/**
 * 撤锁：标记类与变量一起清掉（幂等）。
 *
 * @param {HTMLElement} split
 */
function releaseLock(split) {
  split.classList.remove(LOCK_CLASS);
  split.style.removeProperty(MIN_WIDTH_VAR);
}

/**
 * 对账：把「应该上锁的侧栏」与「DOM 上实际锁着的侧栏」对齐。
 *
 * 这是唯一的上锁/撤锁判定入口，能一并对付这些变化：
 * - 页签被拖到另一条侧栏 → 新侧栏加锁、旧侧栏撤锁；
 * - 侧栏里的本插件标签被切到后台 → 撤锁；切回来 → 复锁；
 * - 最后一个本插件标签被关闭 → 全部撤锁（不依赖 `unlock` 的调用时序）。
 *
 * 有 workspace 时以布局树（`getLeavesOfType` + `getRoot`）为准：只有真正打开的视图才算数，
 * 避免页签关闭后残留的 `data-type` 节点把锁一直续上。没有 workspace 时退化成纯 DOM 扫描。
 *
 * @param {PaneAppLike} [app]
 * @param {{ containerEl?: HTMLElement }} [ignoredView] 正在关闭的视图（同步对账时排除它自己）
 * @returns {Set<HTMLElement>} 本次被判定为应上锁的侧栏
 */
function reconcile(app, ignoredView) {
  const workspace = app?.workspace;
  /** @type {HTMLElement|Document} */
  const scope = workspace?.containerEl || document;
  /** @type {Set<HTMLElement>} */
  const hosts = new Set();

  const leaves = workspace?.getLeavesOfType?.(APPLE_STYLE_VIEW) ?? null;

  if (leaves) {
    for (const leaf of leaves) {
      if (ignoredView && leaf?.view === ignoredView) continue;
      const host = resolveDockOfLeaf(leaf);
      if (host && isLeafShownIn(leaf, host)) hosts.add(host);
    }
  } else {
    for (const split of scope.querySelectorAll(SIDEDOCK_SELECTOR)) {
      const el = /** @type {HTMLElement} */ (split);
      if (hasShownView(el, ignoredView)) hosts.add(el);
    }
  }

  for (const host of hosts) applyLock(host);
  for (const split of scope.querySelectorAll(`.${LOCK_CLASS}`)) {
    const el = /** @type {HTMLElement} */ (split);
    if (!hosts.has(el)) releaseLock(el);
  }
  return hosts;
}

/**
 * 挂布局监听（同一个 workspace 只挂一份）。
 *
 * @param {PaneAppLike} [app]
 */
function attachLayoutListeners(app) {
  const workspace = app?.workspace;
  if (!workspace || typeof workspace.on !== 'function') return;
  if (layoutRefs.has(workspace)) return;

  /** @type {unknown[]} */
  const refs = [];
  for (const name of LAYOUT_EVENTS) {
    try {
      refs.push(workspace.on(name, () => reconcile(app)));
    } catch {
      // 事件名在不同版本间有增减：缺一个不影响另一个。
    }
  }
  layoutRefs.set(workspace, refs);
}

/**
 * 摘布局监听。只在「一个本插件视图都不剩」时调用。
 *
 * @param {PaneAppLike} [app]
 */
function detachIfIdle(app) {
  const workspace = app?.workspace;
  if (!workspace) return;
  const refs = layoutRefs.get(workspace);
  if (!refs) return;

  const remaining = workspace.getLeavesOfType?.(APPLE_STYLE_VIEW);
  if (remaining && remaining.length > 0) return;

  layoutRefs.delete(workspace);
  for (const ref of refs) {
    try {
      workspace.offref?.(ref);
    } catch {
      // 已经失效的 EventRef 忽略即可。
    }
  }
}

/**
 * 下一帧（或下一个宏任务）再执行。
 *
 * 关闭页签的瞬间 DOM 还没稳定：本视图的 leaf 可能仍挂着、同一侧栏的另一个标签也可能
 * 在同一轮关闭，所以撤锁必须延后复检一次。
 *
 * 没有 `requestAnimationFrame` 时退到 `setTimeout`，两者都没有就同步执行
 * —— 宁可早一帧判断，也绝不留下一把撤不掉的锁。
 *
 * @param {Document|undefined} doc
 * @param {() => void} callback
 */
function deferAfterLayout(doc, callback) {
  const win = doc?.defaultView;
  if (typeof win?.requestAnimationFrame === 'function') {
    win.requestAnimationFrame(callback);
    return;
  }
  if (typeof win?.setTimeout === 'function') {
    win.setTimeout(callback, 0);
    return;
  }
  callback();
}

/**
 * 给侧栏上锁。
 *
 * @param {{ containerEl?: HTMLElement, app?: PaneAppLike }} view
 * @returns {boolean} 是否真的上锁（视图在主编辑区打开时返回 false，不动任何东西）
 */
export function lockPaneMinWidth(view) {
  const split = resolveHostSidedock(view?.containerEl);
  if (!split) return false;
  applyLock(split);
  lockedSplits.set(/** @type {object} */ (view), split);
  attachLayoutListeners(view?.app);
  return true;
}

/**
 * 撤锁。
 *
 * 不在这里直接判定「同侧栏还有没有别的标签页」——那件事 `reconcile()` 更清楚
 * （它能同时看到被隐藏的页签、以及页签被拖走后落在哪条侧栏），这里只做两步：
 * 立刻对账一次（排除正在关闭的自己，同侧栏仍有可见视图就保持上锁），下一帧再复检收尾。
 *
 * @param {{ containerEl?: HTMLElement, app?: PaneAppLike }} view
 */
export function unlockPaneMinWidth(view) {
  const key = /** @type {object} */ (view);
  const split = lockedSplits.get(key) || resolveHostSidedock(view?.containerEl);
  lockedSplits.delete(key);

  const app = view?.app;
  reconcile(app, view);

  const doc = split?.ownerDocument || view?.containerEl?.ownerDocument;
  deferAfterLayout(doc, () => {
    reconcile(app);
    detachIfIdle(app);
  });
}
