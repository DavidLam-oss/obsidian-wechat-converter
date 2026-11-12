/*
## 核心功能

验证卡片导出弹窗的原地增量更新（In-place Patching）与用户手动翻看防打扰机制。

## 输入

通过 jsdom 构造弹窗 DOM 结构与 Mock 会话状态。

## 输出

作为 Vitest 自动化测试，验证：
1. patchCardExportProgress 在导出进行中原地更新状态、进度条与列表行，不销毁 DOM 节点；
2. 保持滚动容器与 DOM 引用存活，防止拖拽手势被打断；
3. 用户触发交互（wheel/pointerdown 等）后 2 秒内暂停 auto-scroll，避免与用户拔河。
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  patchCardExportProgress,
  bindCardExportUserInteraction,
  isCardExportUserInteracting,
  formatExportReason,
  pageChipText,
  pageChipTone,
  pageOrdinal,
  pageRowLabel,
} from '../views/converter/card-export-modal-progress.js';

describe('card-export-modal-progress unit tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('文案与页号工具函数映射正确', () => {
    expect(formatExportReason('capture-failed')).toBe('捕获失败');
    expect(formatExportReason('path-conflict')).toBe('同名文件冲突');
    expect(formatExportReason('unknown-code')).toBe('未能输出');

    expect(pageOrdinal('cover', 1)).toBe(0);
    expect(pageOrdinal('page-3', 1)).toBe(3);
    expect(pageOrdinal('invalid', 5)).toBe(5);

    expect(pageRowLabel('cover', 1)).toBe('封面');
    expect(pageRowLabel('page-2', 2)).toBe('第 2 页');

    expect(pageChipText({ running: true, failed: 0, canceled: 0, total: 3 })).toBe('进行中');
    expect(pageChipText({ running: false, failed: 1, canceled: 0, total: 3 })).toBe('1 张失败');
    expect(pageChipText({ running: false, failed: 0, canceled: 1, total: 3 })).toBe('1 张已取消');
    expect(pageChipText({ running: false, failed: 0, canceled: 0, total: 3 })).toBe('全部成功');

    expect(pageChipTone({ running: true, failed: 0, canceled: 0 })).toBe('accent');
    expect(pageChipTone({ running: false, failed: 1, canceled: 0 })).toBe('error');
    expect(pageChipTone({ running: false, failed: 0, canceled: 1 })).toBe('muted');
    expect(pageChipTone({ running: false, failed: 0, canceled: 0 })).toBe('success');
  });

  it('用户交互事件（wheel, pointerdown 等）激活防打扰并持续 2 秒', () => {
    const view = { cardExportUserInteractingUntil: 0 };
    const content = document.createElement('div');
    bindCardExportUserInteraction(view, content);

    expect(isCardExportUserInteracting(view)).toBe(false);

    // 触发 wheel 事件
    content.dispatchEvent(new Event('wheel'));
    expect(isCardExportUserInteracting(view)).toBe(true);

    // 1.5 秒后仍处于交互保护期
    vi.advanceTimersByTime(1500);
    expect(isCardExportUserInteracting(view)).toBe(true);

    // 2 秒后（总计 2.1 秒）保护期结束
    vi.advanceTimersByTime(600);
    expect(isCardExportUserInteracting(view)).toBe(false);

    // 触发 pointerdown 事件（模拟按住滚动条滑块）
    content.dispatchEvent(new Event('pointerdown'));
    expect(isCardExportUserInteracting(view)).toBe(true);
  });

  it('patchCardExportProgress 原地更新进度且不替换或销毁现有 DOM 节点', () => {
    const content = document.createElement('div');
    const body = document.createElement('div');
    body.className = 'icard-export-body';
    content.appendChild(body);

    const statusDesc = document.createElement('div');
    statusDesc.className = 'icard-export-status-desc';
    statusDesc.textContent = '准备中…';
    body.appendChild(statusDesc);

    const progress = document.createElement('div');
    progress.className = 'icard-export-progress';
    const bar = document.createElement('div');
    bar.className = 'icard-export-progress-bar';
    progress.appendChild(bar);
    const label = document.createElement('div');
    label.className = 'icard-export-progress-label';
    label.textContent = '0%';
    progress.appendChild(label);
    body.appendChild(progress);

    const details = document.createElement('details');
    details.className = 'icard-export-pages-details';
    const summary = document.createElement('summary');
    summary.className = 'icard-export-pages-summary';
    const summaryLabel = document.createElement('span');
    summaryLabel.className = 'icard-export-pages-label';
    summary.appendChild(summaryLabel);
    const chip = document.createElement('span');
    chip.className = 'icard-export-chip is-accent';
    summary.appendChild(chip);
    details.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'icard-export-pages';

    const row1 = document.createElement('div');
    row1.className = 'icard-export-page-row is-pending';
    const state1 = document.createElement('span');
    state1.className = 'icard-export-page-state';
    state1.textContent = '待处理';
    row1.appendChild(state1);
    list.appendChild(row1);

    const row2 = document.createElement('div');
    row2.className = 'icard-export-page-row is-pending';
    const state2 = document.createElement('span');
    state2.className = 'icard-export-page-state';
    state2.textContent = '待处理';
    row2.appendChild(state2);
    list.appendChild(row2);

    details.appendChild(list);
    body.appendChild(details);

    const scrollIntoViewMock = vi.fn();
    row1.scrollIntoView = scrollIntoViewMock;
    row2.scrollIntoView = scrollIntoViewMock;

    const job = {
      state: 'running',
      pageIds: ['page-1', 'page-2'],
      results: [],
    };

    const view = {
      cardExportModal: { contentEl: content },
      cardExportController: { isPausedManifest: () => false },
      cardExportProgress: { stage: 'page', current: 1 },
      resolveCardExportView: () => ({ job }),
    };

    // 第一次增量更新：正在渲染第 1 页
    const ok1 = patchCardExportProgress(view);
    expect(ok1).toBe(true);
    // 节点本身未被替换（引用保持同一对象）
    expect(body.querySelector('.icard-export-status-desc')).toBe(statusDesc);
    expect(statusDesc.textContent).toContain('正在渲染第 1 页');
    expect(row1.className).toContain('is-rendering');
    expect(state1.textContent).toBe('渲染中…');
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    // 第 1 页保存成功，进入第 2 页
    job.results.push({ pageId: 'page-1', status: 'saved', width: 800, height: 1200 });
    view.cardExportProgress = { stage: 'page', current: 2 };
    const ok2 = patchCardExportProgress(view);
    expect(ok2).toBe(true);

    expect(statusDesc.textContent).toContain('已保存 1 / 2 张 · 正在渲染第 2 页');
    expect(bar.style.width).toBe('50%');
    expect(label.textContent).toBe('50%');
    expect(row1.className).toBe('icard-export-page-row is-saved');
    expect(state1.textContent).toBe('已保存');
    expect(row2.className).toBe('icard-export-page-row is-rendering');
    expect(state2.textContent).toBe('渲染中…');
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);

    // 用户正在交互时抑制 auto-scroll
    view.cardExportUserInteractingUntil = Date.now() + 2000;
    job.results.push({ pageId: 'page-2', status: 'saved', width: 800, height: 1200 });
    view.cardExportProgress = { stage: 'page', current: 2 };
    patchCardExportProgress(view);
    // 依然只有之前的 2 次，未触发第 3 次 scrollIntoView
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);

    // 任务终态时 patchCardExportProgress 返回 false，交由全量渲染接管
    job.state = 'completed';
    const ok3 = patchCardExportProgress(view);
    expect(ok3).toBe(false);
  });
});
