/*
## 核心功能

小红书卡片封面配图交互控制器：支持鼠标按住拖拽位移（Pan / 焦点微调）与滚轮缩放（Zoom）。
直接作用于实时预览画布中的封面图元素，提供 60fps 丝滑手势响应，并在交互结束时提交会话持久化。

## 输入

- `coverPageEl`: 封面页 DOM 根元素（`.icard-cover`）
- `onCommit`: 坐标/缩放提交回调 `(change: { coverImagePosition?: { x: number, y: number }, coverImageScale?: number }) => void`

## 输出

- 挂载拖拽位移与滚轮缩放监听，提供 `destroy()` 资源销毁方法。

## 定位

位于 services/，纯 DOM 事件控制器与坐标运算层。
*/

/**
 * 为封面页的配图挂载鼠标拖拽（Pan）与滚轮缩放（Zoom）能力
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

  // 1. 拖拽平移（Pan）
  let isDragging = false;
  let startClientX = 0;
  let startClientY = 0;
  let startPosX = currentPosX;
  let startPosY = currentPosY;

  /** @param {MouseEvent} e */
  const onMouseDown = (e) => {
    if (e.button !== 0) return; // 仅响应鼠标左键
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
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      target.dataset.scale = String(currentScale);
      target.dataset.posX = String(currentPosX);
      target.dataset.posY = String(currentPosY);

      onCommit?.({
        coverImagePosition: { x: Math.round(currentPosX), y: Math.round(currentPosY) },
        coverImageScale: Number(currentScale.toFixed(2)),
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 2. 滚轮缩放（Zoom）
  /** @type {number | null} */
  let wheelCommitTimer = null;

  /** @param {WheelEvent} e */
  const onWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const zoomStep = e.deltaY < 0 ? 0.08 : -0.08;
    currentScale = Math.min(3.0, Math.max(1.0, currentScale + zoomStep));

    updateVisual(currentScale, currentPosX, currentPosY);

    if (wheelCommitTimer) window.clearTimeout(wheelCommitTimer);
    wheelCommitTimer = window.setTimeout(() => {
      target.dataset.scale = String(currentScale);
      target.dataset.posX = String(currentPosX);
      target.dataset.posY = String(currentPosY);

      onCommit?.({
        coverImagePosition: { x: Math.round(currentPosX), y: Math.round(currentPosY) },
        coverImageScale: Number(currentScale.toFixed(2)),
      });
    }, 250);
  };

  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    container.removeEventListener('mousedown', onMouseDown);
    container.removeEventListener('wheel', onWheel);
    if (wheelCommitTimer) window.clearTimeout(wheelCommitTimer);
  };
}
