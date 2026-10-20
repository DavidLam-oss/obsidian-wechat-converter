/*
## 核心功能

守护「侧栏最小宽度」闸门：插件视图挂在左右侧栏时给侧栏上锁（拖不窄），在主编辑区打开时
不上锁；同一侧栏还挂着第二个本插件标签页时不误撤锁；视图已从 DOM 摘除也能撤锁。

## 输入

构造与 Obsidian 侧栏同构的 DOM（`.workspace-split.mod-right-split` > `.workspace-leaf` >
`.workspace-leaf-content[data-type]` > `.view-content`），并读取 styles/base.css。

## 输出

断言上锁/撤锁的时机、CSS 变量取值，以及样式侧「排除折叠态」的契约。

## 定位

位于 tests/，为「预览不能被拖窄」这条产品约束提供回归保护。

## 维护规则

- 手机框宽度或画布留白变化时，同步 `MIN_PANE_WIDTH` 的下限断言。
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
 * @param {{ side?: 'left'|'right'|'root', leaves?: number }} [options]
 */
function mountPane({ side = 'right', leaves = 1 } = {}) {
  const split = document.createElement('div');
  split.className =
    side === 'root' ? 'workspace-split mod-root' : `workspace-split mod-vertical mod-${side}-split`;

  /** @type {HTMLElement[]} */
  const containers = [];
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
  }

  document.body.appendChild(split);
  return { split, containers };
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
    const rule = baseCss.match(/\.workspace-split\.owc-pane-min-width[^{]*\{(?<body>[^}]*)\}/);

    expect(rule).not.toBeNull();
    // 折叠靠把 width 动画到 0，min-width 不排除会把它顶住不动
    expect(rule[0]).toContain(':not(.is-sidedock-collapsed)');
    // 窄窗口兜底：下限要给编辑区留 360px 余量，别把小窗下的正文挤没
    expect(rule.groups.body).toContain('min(var(--owc-pane-min-width, 400px), calc(100vw - 360px))');
  });
});
