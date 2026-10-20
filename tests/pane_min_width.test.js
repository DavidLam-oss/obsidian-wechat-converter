/*
## 核心功能

守护「侧栏最小宽度」闸门：插件视图挂在左右侧栏时给侧栏上锁（拖不窄），在主编辑区打开时
不上锁；同一侧栏还挂着第二个本插件标签页时不误撤锁；视图已从 DOM 摘除也能撤锁；
页签被拖到另一侧栏时锁跟着迁移；侧栏里切到别的插件标签页时自动让出宽度。

## 输入

构造与 Obsidian 侧栏同构的 DOM（`.workspace-split.mod-sidedock` > `.workspace-leaf` >
`.workspace-leaf-content[data-type]` > `.view-content`），并读取 styles/base.css；
布局迁移相关的用例额外挂一个假 `app.workspace`（`getLeavesOfType` / `on` / `offref`）。

## 输出

断言上锁/撤锁的时机、CSS 变量取值、布局监听的挂载与摘除，以及样式侧「排除折叠态」的契约。

## 定位

位于 tests/，为「预览不能被拖窄」这条产品约束提供回归保护。

## 维护规则

- 手机框宽度或画布留白变化时，同步 `MIN_PANE_WIDTH` 的下限断言。
- 新增布局场景（分屏、多窗口）时补一条「事件驱动后锁落在哪条侧栏」的用例，
  不要只测同步路径 —— 本模块的历史 bug 全部出在事件驱动的时序上。
*/

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MIN_PANE_WIDTH,
  lockPaneMinWidth,
  resolveHostSidedock,
  unlockPaneMinWidth,
} from '../views/converter/pane-min-width.js';
import { APPLE_STYLE_VIEW } from '../views/shared/view-constants.js';

const LOCK_CLASS = 'owc-pane-min-width';
const MIN_WIDTH_VAR = '--owc-pane-min-width';

const readProjectFile = (filePath) => readFileSync(resolve(process.cwd(), filePath), 'utf8');

/**
 * 造一个与 Obsidian 侧栏同构的最小 DOM。
 * @param {{ side?: 'left'|'right'|'root', leaves?: number, parent?: HTMLElement }} [options]
 */
function mountPane({ side = 'right', leaves = 1, parent } = {}) {
  const split = document.createElement('div');
  split.className = side === 'root'
    ? 'workspace-split mod-root'
    : `workspace-split mod-vertical mod-${side}-split mod-sidedock`;

  /** @type {HTMLElement[]} */
  const containers = [];
  /** @type {HTMLElement[]} */
  const leafEls = [];
  for (let index = 0; index < leaves; index += 1) {
    const leaf = document.createElement('div');
    leaf.className = 'workspace-leaf';
    const leafContent = document.createElement('div');
    leafContent.className = 'workspace-leaf-content';
    leafContent.setAttribute('data-type', APPLE_STYLE_VIEW);
    const container = document.createElement('div');
    container.className = 'view-content apple-converter-container';
    leafContent.appendChild(container);
    leaf.appendChild(leafContent);
    split.appendChild(leaf);
    containers.push(container);
    leafEls.push(leaf);
  }

  (parent || document.body).appendChild(split);
  return { split, containers, leafEls };
}

/**
 * 假 workspace：只实现本模块用到的四个成员，事件可以手动 emit。
 */
function createFakeWorkspace() {
  const containerEl = document.createElement('div');
  containerEl.className = 'workspace';
  document.body.appendChild(containerEl);

  /** @type {Map<string, Function[]>} */
  const handlers = new Map();
  /** @type {any[]} */
  const leaves = [];

  const workspace = {
    containerEl,
    getLeavesOfType: () => leaves.slice(),
    on(name, callback) {
      const list = handlers.get(name) || [];
      list.push(callback);
      handlers.set(name, list);
      return { name, callback };
    },
    offref(ref) {
      const list = handlers.get(ref?.name) || [];
      const index = list.indexOf(ref.callback);
      if (index >= 0) list.splice(index, 1);
    },
  };

  return {
    app: { workspace },
    containerEl,
    leaves,
    emit(name) {
      (handlers.get(name) || []).slice().forEach((callback) => callback());
    },
    listenerCount() {
      return [...handlers.values()].reduce((total, list) => total + list.length, 0);
    },
  };
}

/**
 * 把一个视图登记进假 workspace 的布局树。
 * `root` 可变：模拟把页签拖到另一条侧栏。
 */
function registerLeaf(env, { split, view }) {
  const leaf = {
    view,
    root: { containerEl: split },
    getRoot: () => leaf.root,
  };
  env.leaves.push(leaf);
  return leaf;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('侧栏最小宽度锁', () => {
  it('从视图容器向上能定位到承载它的侧栏，主编辑区则不锁', () => {
    const { split, containers } = mountPane({ side: 'right' });
    expect(resolveHostSidedock(containers[0])).toBe(split);

    const root = mountPane({ side: 'root' });
    expect(resolveHostSidedock(root.containers[0])).toBeNull();

    const view = { containerEl: root.containers[0] };
    expect(lockPaneMinWidth(view)).toBe(false);
    expect(root.split.classList.contains(LOCK_CLASS)).toBe(false);
  });

  it('上锁时写入标记类与 CSS 变量，撤锁时一并清理', () => {
    const { split, containers } = mountPane({ side: 'right' });
    const view = { containerEl: containers[0] };

    expect(lockPaneMinWidth(view)).toBe(true);
    expect(split.classList.contains(LOCK_CLASS)).toBe(true);
    expect(split.style.getPropertyValue(MIN_WIDTH_VAR)).toBe(`${MIN_PANE_WIDTH}px`);

    unlockPaneMinWidth(view);
    expect(split.classList.contains(LOCK_CLASS)).toBe(false);
    expect(split.style.getPropertyValue(MIN_WIDTH_VAR)).toBe('');
  });

  it('同一侧栏还有第二个本插件标签页时保留锁，最后一个关闭才撤掉', () => {
    const { split, containers } = mountPane({ side: 'right', leaves: 2 });
    const first = { containerEl: containers[0] };
    const second = { containerEl: containers[1] };

    lockPaneMinWidth(first);
    lockPaneMinWidth(second);

    // 关掉第一个标签：Obsidian 会把它的 leaf 从 DOM 摘掉
    containers[0].closest('.workspace-leaf')?.remove();
    unlockPaneMinWidth(first);
    expect(split.classList.contains(LOCK_CLASS)).toBe(true);

    unlockPaneMinWidth(second);
    expect(split.classList.contains(LOCK_CLASS)).toBe(false);
  });

  it('两个标签同轮关闭、DOM 还没摘除时，下一帧兜底撤锁', async () => {
    const { split, containers } = mountPane({ side: 'right', leaves: 2 });
    const first = { containerEl: containers[0] };
    const second = { containerEl: containers[1] };

    lockPaneMinWidth(first);
    lockPaneMinWidth(second);
    unlockPaneMinWidth(first);
    expect(split.classList.contains(LOCK_CLASS)).toBe(true);

    // 关闭第二个：此刻它自己的 leaf 还挂在 DOM 上，同步判定会误以为「还有实例」
    unlockPaneMinWidth(second);
    split.querySelectorAll('.workspace-leaf').forEach((leaf) => leaf.remove());
    await new Promise((done) => setTimeout(done, 40));

    expect(split.classList.contains(LOCK_CLASS)).toBe(false);
    expect(split.style.getPropertyValue(MIN_WIDTH_VAR)).toBe('');
  });

  it('视图已从 DOM 摘除（containerEl 失联）时仍能撤锁', () => {
    const { split, containers } = mountPane({ side: 'right' });
    const view = { containerEl: containers[0] };
    lockPaneMinWidth(view);

    containers[0].closest('.workspace-leaf')?.remove();
    expect(resolveHostSidedock(containers[0])).toBeNull();

    unlockPaneMinWidth(view);
    expect(split.classList.contains(LOCK_CLASS)).toBe(false);
    expect(split.style.getPropertyValue(MIN_WIDTH_VAR)).toBe('');
  });

  it('下限不低于手机框所需的最小面板宽度', () => {
    // 机身 340 + 画布左右留白 16×2 + Obsidian 视图内边距 12×2 = 396
    expect(MIN_PANE_WIDTH).toBeGreaterThanOrEqual(340 + 16 * 2 + 12 * 2);
  });

  it('样式侧：锁只作用在侧栏，且折叠态必须失效', () => {
    const baseCss = readProjectFile('styles/base.css');
    const rule = baseCss.match(/\.workspace-split[^{]*\.owc-pane-min-width[^{]*\{(?<body>[^}]*)\}/);

    expect(rule).not.toBeNull();
    // 只认侧栏：主编辑区（.mod-root）不能吃到这条 min-width
    expect(rule[0]).toContain('.mod-sidedock');
    // 折叠靠把 width 动画到 0，min-width 不排除会把它顶住不动
    expect(rule[0]).toContain(':not(.is-sidedock-collapsed)');
    // 窄窗口兜底：下限要给编辑区留 360px 余量，别把小窗下的正文挤没
    expect(rule.groups.body).toContain('min(var(--owc-pane-min-width, 400px), calc(100vw - 360px))');
  });

  it('把页签拖到另一侧栏后，锁迁移过去、旧侧栏撤锁', () => {
    const env = createFakeWorkspace();
    const right = mountPane({ side: 'right', parent: env.containerEl });
    const left = mountPane({ side: 'left', leaves: 0, parent: env.containerEl });

    const view = { containerEl: right.containers[0], app: env.app };
    const leaf = registerLeaf(env, { split: right.split, view });

    lockPaneMinWidth(view);
    expect(right.split.classList.contains(LOCK_CLASS)).toBe(true);

    // 用户把标签拖到左侧栏：DOM 换爹，布局树里的 root 也跟着换
    left.split.appendChild(right.leafEls[0]);
    leaf.root = { containerEl: left.split };
    env.emit('layout-change');

    expect(left.split.classList.contains(LOCK_CLASS)).toBe(true);
    expect(right.split.classList.contains(LOCK_CLASS)).toBe(false);
    expect(right.split.style.getPropertyValue(MIN_WIDTH_VAR)).toBe('');
  });

  it('侧栏里切到别的插件标签页时让出宽度，切回来重新上锁', () => {
    const env = createFakeWorkspace();
    const pane = mountPane({ side: 'right', parent: env.containerEl });
    const view = { containerEl: pane.containers[0], app: env.app };
    registerLeaf(env, { split: pane.split, view });

    lockPaneMinWidth(view);
    expect(pane.split.classList.contains(LOCK_CLASS)).toBe(true);

    // Obsidian 把非当前页签收起（这里用 is-hidden 复现，display:none / 摘节点同理）
    pane.leafEls[0].classList.add('is-hidden');
    env.emit('active-leaf-change');
    expect(pane.split.classList.contains(LOCK_CLASS)).toBe(false);

    pane.leafEls[0].classList.remove('is-hidden');
    env.emit('active-leaf-change');
    expect(pane.split.classList.contains(LOCK_CLASS)).toBe(true);
  });

  it('没有 requestAnimationFrame 时用 setTimeout 兜底，并摘掉布局监听', async () => {
    const env = createFakeWorkspace();
    const pane = mountPane({ side: 'right', parent: env.containerEl });
    const view = { containerEl: pane.containers[0], app: env.app };
    registerLeaf(env, { split: pane.split, view });

    lockPaneMinWidth(view);
    expect(env.listenerCount()).toBe(2);

    const win = /** @type {any} */ (window);
    const originalRaf = win.requestAnimationFrame;
    win.requestAnimationFrame = undefined;
    try {
      pane.leafEls[0].remove();
      env.leaves.length = 0;
      unlockPaneMinWidth(view);
      await new Promise((done) => setTimeout(done, 20));

      expect(pane.split.classList.contains(LOCK_CLASS)).toBe(false);
      expect(pane.split.style.getPropertyValue(MIN_WIDTH_VAR)).toBe('');
      expect(env.listenerCount()).toBe(0);
    } finally {
      win.requestAnimationFrame = originalRaf;
    }
  });
});
