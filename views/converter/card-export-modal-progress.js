/*
## 核心功能

卡片导出进度增量更新（In-place Patching）：导出进行中避免暴力 content.empty() 销毁重构 DOM，
实现平滑状态更新、进度条拉伸与逐页行状态切换；结合用户交互防打扰机制，避免 auto-scroll 抢夺滚动条控制权。

## 输入

- `view`: AppleStyleView 实例，读取当前 cardExportModal、cardExportProgress、cardExportController 与会话任务
- 用户滚动与指针交互事件（wheel, pointerdown, touchstart, keydown）

## 输出

- `patchCardExportProgress(view)`: boolean。若成功增量更新返回 true，未挂载或终态返回 false。
- `bindCardExportUserInteraction(view, content)`: 挂载防打扰交互监听。
- `isCardExportUserInteracting(view)`: 判定用户最近是否在翻看列表。
- `formatExportReason`, `jobStatusDescription`, `pageChipText`, `pageChipTone`, `pageOrdinal`, `pageRowLabel`, `EXPORT_PAGE_LABELS`。

## 定位

位于 views/converter/，作为 card-export-modal-view.js 的增量补丁助手与文案工具库。

## 维护规则

- 只在 running / canceling 且 job DOM 已挂载时增量更新，其余状态回落全量 renderCardExportModal。
- 绝不在增量更新中清空或替换 content 容器，保持用户的鼠标拖拽手势存活。
- 用户交互（滚轮/拖动/触控）触发后 2 秒内静默 auto-scroll，禁止与用户拔河。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- reason: 导出任务进度跨模块增量修补，DOM 节点与任务载荷以 any/unknown 访问 */

import { getActiveDocumentCompat } from '../apple-style-view-shared.js';

/** 单页结果状态 → 标签 */
export const EXPORT_PAGE_LABELS = {
  saved: '已保存',
  failed: '失败',
  canceled: '已取消',
  pending: '待处理',
  skipped: '已跳过',
};

/**
 * 失败原因转中文友好提示。
 * @param {unknown} reason
 * @returns {string}
 */
export const formatExportReason = (reason) => {
  const map = {
    'capture-failed': '捕获失败',
    'capture-invalid': '输出非 PNG',
    'write-failed': '写入失败',
    'path-conflict': '同名文件冲突',
    'path-redirect': '输出位置被重定向',
    'manifest-write-failed': '结果记录未写入',
    'manifest-unhealthy': '结果清单写入失败',
    'manifest-missing': '清单丢失',
    'io-write-failed': '文件写入失败',
    'render-timeout': '渲染超时',
    'no-pages': '无有效卡片内容',
    'not-ready': '卡片尚未准备就绪',
    'session-conflict': '已有导出任务正在运行',
    'resource-failure': '图片资源加载失败',
    'canceled-by-user': '用户已取消',
  };
  return map[String(reason)] || '未能输出';
};

/**
 * 页号（1-based）：取自 pageId（`page-N`），非法 id 回落批次内序号。
 * 封面返回 0。
 * @param {string} pageId
 * @param {number} fallback
 * @returns {number}
 */
export const pageOrdinal = (pageId, fallback) => {
  if (String(pageId || '') === 'cover') return 0;
  const match = /^page-(\d+)$/.exec(String(pageId || ''));
  return match ? Number(match[1]) : fallback;
};

/**
 * 逐页明细里的页名：封面叫「封面」，正文叫「第 N 页」。
 * @param {string} pageId
 * @param {number} fallback
 * @returns {string}
 */
export const pageRowLabel = (pageId, fallback) => {
  const ordinal = pageOrdinal(pageId, fallback);
  return ordinal > 0 ? `第 ${ordinal} 页` : '封面';
};

/**
 * 逐页明细右侧徽标文案。
 * @param {{ running: boolean, failed: number, canceled: number, total: number }} params
 * @returns {string}
 */
export const pageChipText = ({ running, failed, canceled, total }) => {
  if (failed > 0) return `${failed} 张失败`;
  if (running) return '进行中';
  if (canceled > 0) return `${canceled} 张已取消`;
  return total > 0 ? '全部成功' : '无内容';
};

/**
 * 逐页明细右侧徽标色调。
 * @param {{ running: boolean, failed: number, canceled: number }} params
 * @returns {'error' | 'accent' | 'muted' | 'success'}
 */
export const pageChipTone = ({ running, failed, canceled }) => {
  if (failed > 0) return 'error';
  if (running) return 'accent';
  if (canceled > 0) return 'muted';
  return 'success';
};

/**
 * 状态区副文案。
 * @param {{ state: string, running: boolean, progressEvent: any, currentOrdinal: number, saved: number, total: number, failed: number, uniformSize?: string | null }} input
 * @returns {string}
 */
export const jobStatusDescription = ({ state, running, progressEvent, currentOrdinal, saved, total, failed, uniformSize }) => {
  if (!running) {
    if (state === 'paused-manifest') {
      return `清单写入失败，已暂停后续页（已存 ${saved} 张）；可重试记录清单并继续导出，或取消导出。`;
    }
    const sizeNote = uniformSize ? `（${uniformSize}）` : '';
    const base = `${saved} 张卡片已保存${sizeNote}`;
    if (failed > 0) return `${saved} 张卡片已保存，${failed} 张失败`;
    if (state === 'canceled') return `已在保存 ${saved} 张后取消`;
    return base;
  }
  if (progressEvent && progressEvent.stage === 'preparing') return '正在下载并内联笔记图片（图片多时首次较慢）…';
  if (currentOrdinal > 0) return `已保存 ${saved} / ${total} 张 · 正在渲染第 ${currentOrdinal} 页`;
  if (currentOrdinal === 0) return `已保存 ${saved} / ${total} 张 · 正在渲染封面`;
  return `已保存 ${saved} / ${total} 张 · 正在准备…`;
};

/**
 * 挂载用户滚动与输入交互监听，用于识别用户主动翻看列表的意图并暂时抑制 auto-scroll。
 * @param {any} view AppleStyleView 实例
 * @param {any} content 弹窗 contentEl
 */
export const bindCardExportUserInteraction = (view, content) => {
  if (!content || typeof content.addEventListener !== 'function') return;
  const markInteracting = () => {
    view.cardExportUserInteractingUntil = Date.now() + 2000;
  };
  content.addEventListener('wheel', markInteracting, { passive: true });
  content.addEventListener('pointerdown', markInteracting, { passive: true });
  content.addEventListener('touchstart', markInteracting, { passive: true });
  content.addEventListener('keydown', markInteracting, { passive: true });
};

/**
 * 判定用户当前是否正在主动翻看导出列表。
 * @param {any} view AppleStyleView 实例
 * @returns {boolean}
 */
export const isCardExportUserInteracting = (view) => {
  return Date.now() < Number(view?.cardExportUserInteractingUntil || 0);
};

/**
 * 原地增量更新卡片导出任务进度（In-place Patching）。
 * 导出进行中（running）且 DOM 节点已挂载时，避免暴力 content.empty() 销毁重绘，
 * 保留容器与用户的滚动条拖动手势，并在用户手动翻看时抑制 auto-scroll。
 * @param {any} view AppleStyleView 实例
 * @returns {boolean} 成功增量更新返回 true；若尚未挂载或已进入终态返回 false（触发全量渲染）
 */
export const patchCardExportProgress = (view) => {
  const modal = view?.cardExportModal;
  const content = modal?.contentEl;
  if (!content) return false;
  const body = content.querySelector?.('.icard-export-body');
  if (!body) return false;

  const exportView = typeof view.resolveCardExportView === 'function' ? view.resolveCardExportView() : null;
  const job = exportView && exportView.job ? exportView.job : null;
  if (!job) return false;

  const controller = view.cardExportController;
  const isPaused = Boolean(controller && typeof controller.isPausedManifest === 'function' && controller.isPausedManifest());
  const state = isPaused ? 'paused-manifest' : String(job.state || 'running');
  const running = !isPaused && (state === 'running' || state === 'canceling');
  if (!running) return false;

  const descEl = body.querySelector?.('.icard-export-status-desc');
  const barEl = body.querySelector?.('.icard-export-progress-bar');
  const labelEl = body.querySelector?.('.icard-export-progress-label');
  if (!descEl || !barEl || !labelEl) return false;

  const pageIds = Array.isArray(job.pageIds) ? job.pageIds : [];
  const total = pageIds.length;
  const results = Array.isArray(job.results) ? job.results : [];
  const saved = results.filter((r) => r.status === 'saved').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const canceled = results.filter((r) => r.status === 'canceled').length;

  const progressEvent = view.cardExportProgress;
  const renderingPage = Boolean(progressEvent) && progressEvent.stage === 'page';
  const currentOrdinal = renderingPage ? Number(progressEvent.current) || 0 : -1;

  // 1. 状态区文案
  const nextDesc = jobStatusDescription({ state, running, progressEvent, currentOrdinal, saved, total, failed });
  if (descEl.textContent !== nextDesc) descEl.textContent = nextDesc;

  // 2. 进度条与百分比
  const percent = total > 0 ? Math.round((results.length / total) * 100) : 0;
  barEl.style.setProperty('width', `${percent}%`);
  const nextPercent = `${percent}%`;
  if (labelEl.textContent !== nextPercent) labelEl.textContent = nextPercent;

  // 3. 取消状态响应
  if (state === 'canceling') {
    const cancelBtn = body.querySelector?.('.icard-export-cancel');
    if (cancelBtn) {
      cancelBtn.textContent = '正在取消…';
      cancelBtn.classList.add('is-disabled');
    }
  }

  // 4. 若 DOM 中挂载了逐页明细（例如异常诊断或测试沙箱），按需增量更新各行
  const listEl = body.querySelector?.('.icard-export-pages');
  if (listEl) {
    const detailsEl = body.querySelector?.('.icard-export-pages-details');
    const summaryLabel = detailsEl?.querySelector?.('.icard-export-pages-label');
    if (summaryLabel) {
      const nextSummary = `逐页进度 ${results.length} / ${total}`;
      if (summaryLabel.textContent !== nextSummary) summaryLabel.textContent = nextSummary;
    }
    const chip = detailsEl?.querySelector?.('.icard-export-chip');
    if (chip) {
      const tone = pageChipTone({ running, failed, canceled });
      chip.className = `icard-export-chip is-${tone}`;
      const nextChipText = pageChipText({ running, failed, canceled, total });
      if (chip.textContent !== nextChipText) chip.textContent = nextChipText;
    }

    const resultByPage = new Map(results.map((r) => [r.pageId, r]));
    const rows = listEl.querySelectorAll?.('.icard-export-page-row') || [];
    pageIds.forEach((pageId, index) => {
      const row = rows[index];
      if (!row) return;
      const result = resultByPage.get(pageId);
      const status = result ? result.status : 'pending';
      const ordinal = pageOrdinal(pageId, index + 1);
      const isCurrent = running && status === 'pending' && currentOrdinal >= 0 && ordinal === currentOrdinal;
      const targetClass = `icard-export-page-row is-${isCurrent ? 'rendering' : status}`;
      if (row.className !== targetClass) row.className = targetClass;

      const stateEl = row.querySelector?.('.icard-export-page-state');
      if (stateEl) {
        const nextStateText = isCurrent ? '渲染中…' : (EXPORT_PAGE_LABELS[status] || status);
        if (stateEl.textContent !== nextStateText) stateEl.textContent = nextStateText;
      }

      if (result && result.status === 'failed' && result.reason) {
        let reasonEl = row.querySelector?.('.icard-export-page-reason');
        if (!reasonEl) {
          reasonEl = typeof row.createEl === 'function'
            ? row.createEl('span', { cls: 'icard-export-page-reason' })
            : (row.ownerDocument || getActiveDocumentCompat()).createElement('span');
          reasonEl.className = 'icard-export-page-reason';
          if (!row.contains(reasonEl)) row.appendChild(reasonEl);
        }
        const nextReason = formatExportReason(result.reason);
        if (reasonEl.textContent !== nextReason) reasonEl.textContent = nextReason;
      }
    });

    if (failed > 0 && detailsEl && !detailsEl.hasAttribute('open')) {
      detailsEl.setAttribute('open', '');
    }

    const isDetailsOpen = Boolean(detailsEl && detailsEl.hasAttribute('open'));
    if (isDetailsOpen && !isCardExportUserInteracting(view)) {
      const current = listEl.querySelector?.('.icard-export-page-row.is-rendering');
      if (current && typeof current.scrollIntoView === 'function') {
        current.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  return true;
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- reason: close the scoped disable block above */
