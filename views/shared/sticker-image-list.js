/*
## 核心功能

渲染微信贴图共用的图片列表，并统一鼠标拖拽、键盘与触屏排序行为。

## 输入

接收图片项、可显示地址解析器，以及排序、移除回调和 Obsidian 图标函数。

## 输出

输出可访问的图片网格 DOM，并支持调用方按行数启用展开/收起；导出纯函数 `moveStickerImageItem` 供状态更新和测试复用。

## 定位

位于 views/shared/，供侧栏预览和发布弹窗共同使用，不负责持久化或微信上传。

## 依赖

依赖 Obsidian DOM helper 约定与调用方传入的图标、图片地址及状态更新函数。

## 维护规则

- 图片 `key` 仅用于相等比较和 DOM 定位，不反解析业务信息。
- 所有排序入口必须汇聚到同一个 `onMove` 回调。
- 按钮必须保留文本化 aria-label，图标只承担视觉表达。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- reason: shared renderer accepts dynamic Obsidian elements and source-specific image records */

/**
 * @param {unknown[]} items
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {unknown[]}
 */
function moveStickerImageItem(items, fromIndex, toIndex) {
  const list = Array.isArray(items) ? [...items] : [];
  if (
    !Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= list.length
    || toIndex >= list.length
    || fromIndex === toIndex
  ) {
    return list;
  }
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return list;
}

/**
 * @param {ObsidianElementLike} container
 * @param {object} options
 * @param {Array<{key:string,source:string,name?:string,displaySrc?:string}>} options.items
 * @param {(item:object,index:number)=>string} [options.getDisplaySrc]
 * @param {(fromIndex:number,toIndex:number,item:object)=>void} [options.onMove]
 * @param {(item:object,index:number)=>void} [options.onRemove]
 * @param {(element:HTMLElement,icon:string)=>void} [options.setIcon]
 * @param {string} [options.emptyText]
 * @param {string} [options.focusKey]
 * @param {number} [options.collapsedRows]
 * @param {number} [options.columnCount]
 * @param {boolean} [options.expanded]
 * @param {(expanded:boolean)=>void} [options.onExpandedChange]
 * @returns {ObsidianElementLike}
 */
function renderStickerImageList(container, {
  items = [],
  getDisplaySrc = (item) => item.displaySrc || '',
  onMove,
  onRemove,
  setIcon,
  emptyText = '还没有可发布的图片。',
  focusKey = '',
  collapsedRows = 0,
  columnCount = 3,
  expanded = false,
  onExpandedChange,
} = {}) {
  const grid = container.createDiv({ cls: 'sticker-image-list' });
  grid.setAttribute('role', 'list');
  grid.setAttribute('aria-label', '贴图图片顺序');

  if (!items.length) {
    grid.addClass('is-empty');
    const emptyIcon = grid.createDiv({ cls: 'sticker-image-list__empty-icon' });
    if (typeof setIcon === 'function') setIcon(emptyIcon, 'image');
    grid.createDiv({ cls: 'sticker-image-list__empty-text', text: emptyText });
    return grid;
  }

  const sourceLabels = {
    body: '正文',
    upload: '本地',
    material: '素材库',
    render: '渲染',
  };

  const cells = [];

  items.forEach((item, index) => {
    const cell = grid.createDiv({ cls: 'sticker-image-list__item' });
    cells.push(cell);
    cell.setAttribute('role', 'listitem');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('draggable', 'true');
    cell.dataset.stickerKey = item.key;
    cell.setAttribute('aria-label', `第 ${index + 1} 张图片，${sourceLabels[item.source] || '图片'}`);

    const src = getDisplaySrc(item, index);
    if (src) {
      const image = cell.createEl('img', {
        cls: 'sticker-image-list__thumb',
        attr: {
          src,
          alt: item.name || `第 ${index + 1} 张贴图`,
          draggable: 'false',
          decoding: 'async',
        },
      });
      image.onerror = () => cell.addClass('has-image-error');
    } else {
      cell.addClass('has-image-error');
    }

    cell.createDiv({ cls: 'sticker-image-list__order', text: String(index + 1) });
    cell.createDiv({
      cls: 'sticker-image-list__source',
      text: sourceLabels[item.source] || '图片',
    });

    const removeButton = cell.createEl('button', {
      cls: 'sticker-image-list__remove',
      attr: {
        type: 'button',
        title: '不发布这张图片',
        'aria-label': `移除第 ${index + 1} 张图片`,
      },
    });
    if (typeof setIcon === 'function') setIcon(removeButton, 'x');
    else removeButton.setText('移除');
    removeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove?.(item, index);
    });

    const moveControls = cell.createDiv({ cls: 'sticker-image-list__move-controls' });
    const previousButton = moveControls.createEl('button', {
      attr: {
        type: 'button',
        title: '向前移动',
        'aria-label': `将第 ${index + 1} 张图片向前移动`,
      },
    });
    const nextButton = moveControls.createEl('button', {
      attr: {
        type: 'button',
        title: '向后移动',
        'aria-label': `将第 ${index + 1} 张图片向后移动`,
      },
    });
    if (typeof setIcon === 'function') {
      setIcon(previousButton, 'chevron-left');
      setIcon(nextButton, 'chevron-right');
    } else {
      previousButton.setText('前');
      nextButton.setText('后');
    }
    previousButton.disabled = index === 0;
    nextButton.disabled = index === items.length - 1;
    previousButton.onclick = (event) => {
      event.stopPropagation();
      if (index > 0) onMove?.(index, index - 1, item);
    };
    nextButton.onclick = (event) => {
      event.stopPropagation();
      if (index < items.length - 1) onMove?.(index, index + 1, item);
    };

    cell.addEventListener('keydown', (event) => {
      let targetIndex = index;
      if (event.key === 'ArrowLeft') targetIndex = Math.max(0, index - 1);
      if (event.key === 'ArrowRight') targetIndex = Math.min(items.length - 1, index + 1);
      if (event.key === 'ArrowUp') targetIndex = Math.max(0, index - 3);
      if (event.key === 'ArrowDown') targetIndex = Math.min(items.length - 1, index + 3);
      if (event.key === 'Home') targetIndex = 0;
      if (event.key === 'End') targetIndex = items.length - 1;
      if (targetIndex === index) return;
      event.preventDefault();
      onMove?.(index, targetIndex, item);
    });

    cell.addEventListener('dragstart', (event) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData('text/plain', String(index));
      event.dataTransfer.effectAllowed = 'move';
      cell.addClass('is-dragging');
    });
    cell.addEventListener('dragend', () => cell.removeClass('is-dragging'));
    cell.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    cell.addEventListener('drop', (event) => {
      event.preventDefault();
      const fromIndex = Number.parseInt(event.dataTransfer?.getData('text/plain') || '', 10);
      if (Number.isInteger(fromIndex) && fromIndex !== index) {
        onMove?.(fromIndex, index, items[fromIndex]);
      }
    });

    if (focusKey && item.key === focusKey) {
      window.setTimeout(() => cell.focus(), 0);
    }
  });

  const safeRows = Math.max(0, Math.floor(Number(collapsedRows) || 0));
  const safeColumns = Math.max(1, Math.floor(Number(columnCount) || 3));
  const collapsedItemLimit = safeRows * safeColumns;
  const canCollapse = collapsedItemLimit > 0 && items.length > collapsedItemLimit;

  if (canCollapse) {
    const focusedIndex = focusKey
      ? items.findIndex((item) => item.key === focusKey)
      : -1;
    let isExpanded = expanded === true || focusedIndex >= collapsedItemLimit;
    if (isExpanded && expanded !== true) onExpandedChange?.(true);

    const toggleButton = container.createEl('button', {
      cls: 'sticker-image-list__toggle',
      attr: { type: 'button' },
    });

    const updateCollapsedState = () => {
      grid.classList.toggle('is-collapsed', !isExpanded);
      cells.forEach((cell, index) => {
        cell.hidden = !isExpanded && index >= collapsedItemLimit;
      });
      toggleButton.setAttribute('aria-expanded', String(isExpanded));
      toggleButton.setText(
        isExpanded
          ? `收起到 ${safeRows} 行`
          : `展开全部 ${items.length} 张`
      );
    };

    toggleButton.addEventListener('click', () => {
      isExpanded = !isExpanded;
      onExpandedChange?.(isExpanded);
      updateCollapsedState();
    });
    updateCollapsedState();
  }

  return grid;
}

export {
  moveStickerImageItem,
  renderStickerImageList,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- reason: resume typed linting after the shared sticker image renderer boundary */
