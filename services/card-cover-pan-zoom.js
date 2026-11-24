/*
## 核心功能

小红书卡片封面配图交互控制器：支持鼠标与触控手势构图微调。
- 电脑端：鼠标按住拖拽位移（Pan / 焦点微调）与滚轮缩放（Zoom）；
- 移动端：单指长按（250ms）激活拖拽位移（不阻断日常翻页滑动）与双指捏合缩放（Pinch-to-zoom）。
直接作用于实时预览画布中的封面图元素，提供 60fps 丝滑手势响应，并在交互结束时提交会话持久化。

## 输入

- `coverPageEl`: 封面页 DOM 根元素（`.icard-cover`）
- `onCommit`: 坐标/缩放提交回调 `(change: { coverImagePosition?: { x: number, y: number }, coverImageScale?: number }) => void`

## 输出

- 挂载拖拽位移、滚轮缩放与移动触控手势监听，提供销毁函数（取消事件监听）。

## 定位

位于 services/，纯 DOM 事件控制器与坐标运算层。
*/

/** 长按判定延迟（毫秒）：静止按住 250ms 后激活单指平移拖拽 */
const LONG_PRESS_DELAY_MS = 250;
/** 滑动阈值（像素）：手指位移超过 8px 判定为正常翻页滑动，取消长按 */
const SCROLL_THRESHOLD_PX = 8;
const MIN_SCALE = 1.0;
const MAX_SCALE = 3.0;

/**
 * 为封面页的配图挂载鼠标拖拽（Pan）、滚轮缩放（Zoom）以及移动端触控手势（单指长按拖动 + 双指捏合缩放）
 * @param {HTMLElement | null | undefined} coverPageEl
 * @param {((change: { coverImagePosition: { x: number, y: number }, coverImageScale: number }) => void) | null | undefined} onCommit
 * @returns {(() => void) | null} 销毁函数（用于取消事件监听）
 */
export function attachCoverImagePanZoom(coverPageEl, onCommit) {
  if (!coverPageEl || !(coverPageEl instanceof HTMLElement)) return null;

  /** @type {HTMLElement | null} */
  const target = coverPageEl.querySelector(
    '.icard-cover-hero-img, .icard-cover-frame-img, .icard-cover-arch-img, .icard-cover-full-bleed-img, .icard-cover-bg',
  );
  if (!target) return null;

  const container = target.parentElement || target;
  container.classList.add('icard-cover-interactive-image-wrap');

  let currentScale = parseFloat(target.dataset.scale || '1') || 1.0;
  let currentPosX = parseFloat(target.dataset.posX || '50') || 50;
  let currentPosY = parseFloat(target.dataset.posY || '50') || 50;

  const isImg = target.tagName.toLowerCase() === 'img';

  const updateVisual = (scale, x, y) => {
    if (isImg) {
      target.style.setProperty('object-position', `${x}% ${y}%`);
      target.style.setProperty('transform', scale > 1.0 ? `scale(${scale})` : '');
      target.style.setProperty('transform-origin', `${x}% ${y}%`);
    } else {
      target.style.setProperty('background-position', `${x}% ${y}%`);
      target.style.setProperty('transform', scale > 1.0 ? `scale(${scale})` : '');
      target.style.setProperty('transform-origin', `${x}% ${y}%`);
    }
  };

  const commitChanges = () => {
    target.dataset.scale = String(currentScale);
    target.dataset.posX = String(currentPosX);
    target.dataset.posY = String(currentPosY);

    onCommit?.({
      coverImagePosition: { x: Math.round(currentPosX), y: Math.round(currentPosY) },
      coverImageScale: Number(currentScale.toFixed(2)),
    });
  };

  // ==========================================
  // 1. 桌面端：鼠标拖拽平移（Pan）与滚轮缩放（Zoom）
  // ==========================================
  let isDragging = false;
  let startClientX = 0;
  let startClientY = 0;
  let startPosX = currentPosX;
  let startPosY = currentPosY;
  /** @type {((ev: MouseEvent) => void) | null} */
  let activeMouseMove = null;
  /** @type {(() => void) | null} */
  let activeMouseUp = null;
  /** 用于抑制移动端 touch 结束后合成的模拟 mousedown 事件（防误触） */
  let lastTouchEndTime = 0;

  /** @param {MouseEvent} e */
  const onMouseDown = (e) => {
    if (e.button !== 0) return; // 仅响应鼠标左键
    if (Date.now() - lastTouchEndTime < 600) return; // 抑制移动端触控抬起后的模拟鼠标事件
    e.preventDefault();
    e.stopPropagation();

    isDragging = true;
    startClientX = e.clientX;
    startClientY = e.clientY;
    startPosX = currentPosX;
    startPosY = currentPosY;
    container.classList.add('is-dragging');

    /** @param {MouseEvent} ev */
    const onMouseMove = (ev) => {
      if (!isDragging) return;
      ev.preventDefault();

      const rect = container.getBoundingClientRect();
      const w = Math.max(rect.width || 300, 100);
      const h = Math.max(rect.height || 200, 100);

      const deltaX = ((ev.clientX - startClientX) / w) * 100;
      const deltaY = ((ev.clientY - startClientY) / h) * 100;

      // 往右拖动图片，使左侧内容露出，故 object-position 百分比变小；反之变大
      currentPosX = Math.min(100, Math.max(0, startPosX - deltaX));
      currentPosY = Math.min(100, Math.max(0, startPosY - deltaY));

      updateVisual(currentScale, currentPosX, currentPosY);
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      container.classList.remove('is-dragging');
      if (activeMouseMove) window.removeEventListener('mousemove', activeMouseMove);
      if (activeMouseUp) window.removeEventListener('mouseup', activeMouseUp);
      activeMouseMove = null;
      activeMouseUp = null;

      commitChanges();
    };

    activeMouseMove = onMouseMove;
    activeMouseUp = onMouseUp;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  /** @type {number | null} */
  let wheelCommitTimer = null;

  /** @param {WheelEvent} e */
  const onWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const zoomStep = e.deltaY < 0 ? 0.08 : -0.08;
    currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale + zoomStep));

    updateVisual(currentScale, currentPosX, currentPosY);

    if (wheelCommitTimer) window.clearTimeout(wheelCommitTimer);
    wheelCommitTimer = window.setTimeout(() => {
      commitChanges();
    }, 250);
  };

  // ==========================================
  // 2. 移动端：单指长按拖动平移 + 双指捏合缩放（Touch）
  // ==========================================
  /** @type {'idle' | 'pending' | 'panning' | 'pinching'} */
  let touchMode = 'idle';
  /** @type {number | null} */
  let longPressTimer = null;
  let touchStartPoint = { x: 0, y: 0 };
  let touchStartPos = { x: 50, y: 50 };
  let pinchStartDistance = 0;
  let pinchStartScale = 1.0;
  let pinchStartMidpoint = { x: 0, y: 0 };
  let pinchStartPos = { x: 50, y: 50 };

  const clearLongPressTimer = () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  /** @param {TouchEvent} e */
  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartPoint = { x: touch.clientX, y: touch.clientY };
      touchStartPos = { x: currentPosX, y: currentPosY };
      touchMode = 'pending';

      clearLongPressTimer();
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        if (touchMode === 'pending') {
          touchMode = 'panning';
          container.classList.add('is-dragging', 'is-touch-panning');
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
              navigator.vibrate(15);
            } catch {
              // 某些 WebView 环境安全策略限制振动，静默忽略
            }
          }
        }
      }, LONG_PRESS_DELAY_MS);
    } else if (e.touches.length === 2) {
      // 双指同时触控：立刻进入双指捏合缩放与构图模式，阻止画板滚动
      clearLongPressTimer();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchStartDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStartScale = currentScale;
      pinchStartMidpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      pinchStartPos = { x: currentPosX, y: currentPosY };
      touchMode = 'pinching';
      container.classList.remove('is-touch-panning');
      container.classList.add('is-dragging', 'is-touch-pinching');
      e.preventDefault();
    } else {
      clearLongPressTimer();
      touchMode = 'idle';
    }
  };

  /** @param {TouchEvent} e */
  const onTouchMove = (e) => {
    if (touchMode === 'pending') {
      // 处于长按等待窗口中：若单指位移超过阈值，判定为用户意图滚动卡片画板浏览，立即取消长按
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dist = Math.hypot(touch.clientX - touchStartPoint.x, touch.clientY - touchStartPoint.y);
        if (dist > SCROLL_THRESHOLD_PX) {
          clearLongPressTimer();
          touchMode = 'idle';
          // 不调用 preventDefault，让系统进行天然顺滑的单指上下翻页滚动
        }
      } else {
        clearLongPressTimer();
        touchMode = 'idle';
      }
      return;
    }

    if (touchMode === 'panning') {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      const rect = container.getBoundingClientRect();
      const w = Math.max(rect.width || 300, 100);
      const h = Math.max(rect.height || 200, 100);

      const deltaX = ((touch.clientX - touchStartPoint.x) / w) * 100;
      const deltaY = ((touch.clientY - touchStartPoint.y) / h) * 100;

      currentPosX = Math.min(100, Math.max(0, touchStartPos.x - deltaX));
      currentPosY = Math.min(100, Math.max(0, touchStartPos.y - deltaY));

      updateVisual(currentScale, currentPosX, currentPosY);
      return;
    }

    if (touchMode === 'pinching') {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      e.stopPropagation();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (pinchStartDistance > 0) {
        const scaleFactor = dist / pinchStartDistance;
        currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * scaleFactor));
      }

      const rect = container.getBoundingClientRect();
      const w = Math.max(rect.width || 300, 100);
      const h = Math.max(rect.height || 200, 100);
      const currentMidpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const deltaX = ((currentMidpoint.x - pinchStartMidpoint.x) / w) * 100;
      const deltaY = ((currentMidpoint.y - pinchStartMidpoint.y) / h) * 100;

      currentPosX = Math.min(100, Math.max(0, pinchStartPos.x - deltaX));
      currentPosY = Math.min(100, Math.max(0, pinchStartPos.y - deltaY));

      updateVisual(currentScale, currentPosX, currentPosY);
    }
  };

  /** @param {TouchEvent} e */
  const onTouchEnd = (e) => {
    clearLongPressTimer();
    lastTouchEndTime = Date.now();
    const wasActive = touchMode === 'panning' || touchMode === 'pinching';

    if (e.touches.length === 0) {
      touchMode = 'idle';
      container.classList.remove('is-dragging', 'is-touch-panning', 'is-touch-pinching');
      if (wasActive) {
        commitChanges();
      }
    } else if (touchMode === 'pinching' && e.touches.length === 1) {
      // 双指松开其中一指：退出缩放模式并提交结果
      touchMode = 'idle';
      container.classList.remove('is-dragging', 'is-touch-panning', 'is-touch-pinching');
      commitChanges();
    }
  };

  const onTouchCancel = () => {
    clearLongPressTimer();
    lastTouchEndTime = Date.now();
    const wasActive = touchMode === 'panning' || touchMode === 'pinching';
    touchMode = 'idle';
    container.classList.remove('is-dragging', 'is-touch-panning', 'is-touch-pinching');
    if (wasActive) {
      commitChanges();
    }
  };

  // 绑定事件
  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('touchstart', onTouchStart, { passive: false });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd);
  container.addEventListener('touchcancel', onTouchCancel);

  return () => {
    container.removeEventListener('mousedown', onMouseDown);
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
    container.removeEventListener('touchcancel', onTouchCancel);
    if (activeMouseMove) window.removeEventListener('mousemove', activeMouseMove);
    if (activeMouseUp) window.removeEventListener('mouseup', activeMouseUp);
    activeMouseMove = null;
    activeMouseUp = null;
    clearLongPressTimer();
    if (wheelCommitTimer) window.clearTimeout(wheelCommitTimer);
  };
}
