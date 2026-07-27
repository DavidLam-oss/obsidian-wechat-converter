/*
## 核心功能

实现微信贴图的临时交互状态、数据构建与侧边栏预览。

## 输入

接收 AppleStyleView 实例状态、活动笔记、渲染结果和用户交互事件。

## 输出

输出 `stickerPreviewMethods`，由 AppleStyleView 统一组装。

## 定位

位于 views/converter/，负责贴图预览编排；提取、图片模型和列表渲染分别委托 services/ 与 views/shared/。

## 依赖

关键依赖：`../apple-style-view-shared.js`、贴图 services 与共享图片列表。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查所属目录 README 是否仍准确。
- 保持现有 AppleStyleView 方法签名与 this 语义，业务规则优先委托 services/。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- reason: Obsidian view state and DOM helpers are dynamically composed across method groups */

import {
  toRecord,
  getObsidianSetIcon,
  resolveMarkdownSource,
  MarkdownView,
} from '../apple-style-view-shared.js';
import { normalizeVaultPath } from '../../services/path-utils.js';
import {
  extractStickerData,
  STICKER_MAX_IMAGES,
  STICKER_MAX_CONTENT_LENGTH,
} from '../../services/sticker-extractor.js';
import { getStickerImageItemSrc } from '../../services/sticker-image-items.js';
import {
  moveStickerImageItem,
  renderStickerImageList,
} from '../shared/sticker-image-list.js';

const STICKER_TRANSFORM_LABELS = {
  codeBlocks: '代码块',
  mermaid: '流程图',
  pluginBlocks: '查询块',
  tables: '表格',
  math: '公式',
  footnotes: '脚注',
};

/** @type {StickerPreviewMethodsContract & ThisType<AppleStyleViewContract>} */
export const stickerPreviewMethods = {
getStickerUiState(filePath) {
  const selfRecord = toRecord(this);
  if (!selfRecord.stickerUiStates) {
    selfRecord.stickerUiStates = new Map();
  }
  const states = /** @type {Map<string, {
   * order: string[],
   * removedKeys: string[],
   * manualItems: object[],
   * undoItems: Array<{item:object,index:number,wasManual:boolean}>,
   * objectUrls: Set<string>
   * }>} */ (selfRecord.stickerUiStates);
  const key = filePath || '';
  let state = states.get(key);
  if (!state) {
    state = {
      order: [],
      removedKeys: [],
      manualItems: [],
      undoItems: [],
      objectUrls: new Set(),
    };
    states.set(key, state);
  }
  return state;
}
,

removeStickerImageItem(filePath, item, index) {
  const uiState = this.getStickerUiState(filePath);
  const wasManual = item?.source !== 'body';
  uiState.undoItems.push({ item, index, wasManual });
  if (uiState.undoItems.length > 9) uiState.undoItems.shift();

  if (wasManual) {
    uiState.manualItems = uiState.manualItems.filter((candidate) => candidate.key !== item.key);
  } else if (!uiState.removedKeys.includes(item.key)) {
    uiState.removedKeys.push(item.key);
  }
  uiState.order = uiState.order.filter((key) => key !== item.key);
}
,

restoreLastStickerImage(filePath) {
  const uiState = this.getStickerUiState(filePath);
  const undo = uiState.undoItems.pop();
  if (!undo?.item) return '';
  const item = undo.item;
  if (undo.wasManual && !uiState.manualItems.some((candidate) => candidate.key === item.key)) {
    uiState.manualItems.push(item);
  }
  uiState.removedKeys = uiState.removedKeys.filter((key) => key !== item.key);
  const nextOrder = uiState.order.filter((key) => key !== item.key);
  nextOrder.splice(Math.min(Math.max(undo.index, 0), nextOrder.length), 0, item.key);
  uiState.order = nextOrder;
  return item.key;
}
,

restoreAllStickerImages(filePath) {
  const uiState = this.getStickerUiState(filePath);
  while (uiState.undoItems.length > 0) {
    this.restoreLastStickerImage(filePath);
  }
  uiState.removedKeys = [];
}
,

resolveStickerImageSrc(src, sourcePath) {
  const raw = String(src || '');
  if (!raw || /^(data:|https?:\/\/|app:\/\/|capacitor:\/\/)/i.test(raw)) return raw;

  const linkFile = this.app?.metadataCache?.getFirstLinkpathDest?.(raw, sourcePath || '');
  if (!linkFile) return raw;

  const vault = toRecord(this.app.vault);
  const getResourcePathRaw = ('getResourcePath' in vault) ? vault.getResourcePath : null;
  if (typeof getResourcePathRaw !== 'function') return raw;

  const getResourcePath = /** @type {(file: unknown) => unknown} */ (getResourcePathRaw);
  const resolved = getResourcePath(linkFile);
  return typeof resolved === 'string' && resolved ? resolved : raw;
}
,

async buildStickerData(options = {}) {
  const requestedSourcePath = typeof options.sourcePath === 'string' ? options.sourcePath : '';
  const activeFile = requestedSourcePath
    ? (this.app?.vault?.getAbstractFileByPath?.(requestedSourcePath) || this.getPublishContextFile())
    : this.getPublishContextFile();
  const sourcePath = activeFile && typeof activeFile.path === 'string' ? activeFile.path : '';

  // 贴图模式不复用 convertCurrent 的文章渲染结果：直接读当前笔记，
  // 这样在贴图模式下编辑正文，预览也能实时更新。
  let markdown = '';
  if (requestedSourcePath && activeFile && activeFile.path === requestedSourcePath) {
    const vault = toRecord(this.app.vault);
    const cachedReadRaw = 'cachedRead' in vault ? vault.cachedRead : null;
    if (typeof cachedReadRaw === 'function') {
      markdown = String(await cachedReadRaw.call(this.app.vault, activeFile));
    }
  }
  if (!markdown) {
    const source = /** @type {MarkdownSourceResultLike} */ (await resolveMarkdownSource({
      app: this.app,
      lastActiveFile: this.lastActiveFile,
      MarkdownViewType: MarkdownView,
    }));
    if (source.ok && typeof source.markdown === 'string') {
      markdown = source.markdown;
    } else if (typeof this.lastResolvedMarkdown === 'string') {
      markdown = this.lastResolvedMarkdown;
    }
  }

  const fileCache = activeFile ? this.app.metadataCache.getFileCache(activeFile) : null;
  const frontmatter = (fileCache && fileCache.frontmatter && typeof fileCache.frontmatter === 'object')
    ? /** @type {Record<string, unknown>} */ (fileCache.frontmatter)
    : {};
  const fallbackTitle = activeFile && typeof activeFile.basename === 'string' ? activeFile.basename : '未命名贴图';
  const uiState = this.getStickerUiState(sourcePath);
  const resolveBodyImageIdentity = (src) => {
    const resolved = this.app?.metadataCache?.getFirstLinkpathDest?.(src, sourcePath);
    return resolved && typeof resolved.path === 'string'
      ? normalizeVaultPath(resolved.path)
      : normalizeVaultPath(src);
  };

  const extracted = extractStickerData({
    markdown,
    frontmatter,
    fallbackTitle,
    insertImageIndex: Boolean(this.insertStickerImageIndex),
    imageOrder: uiState.order,
    removedImageKeys: uiState.removedKeys,
    manualImageItems: uiState.manualItems,
    resolveBodyImageIdentity,
  });

  // 用对齐后的结果回写用户顺序，避免下一次渲染继续携带已失效的路径。
  uiState.order = extracted.imageItems.map((item) => item.key);

  /** @type {StickerPreviewDataLike} */
  const stickerData = {
    title: extracted.title,
    content: extracted.content,
    images: extracted.images,
    imageItems: extracted.imageItems,
    omittedImageCount: extracted.omittedImageCount,
    hasCodeBlocks: extracted.hasCodeBlocks,
    hasTables: extracted.hasTables,
    hasMath: extracted.hasMath,
    hasFootnotes: extracted.hasFootnotes,
    removed: extracted.removed,
    // 弹窗与侧边栏都需要可直接显示的地址（vault 内图片必须转成 app:// 资源路径）
    imageDisplaySources: extracted.imageItems.map((item) => (
      item.source === 'body'
        ? this.resolveStickerImageSrc(getStickerImageItemSrc(item), sourcePath)
        : (item.displaySrc || getStickerImageItemSrc(item))
    )),
    sourcePath,
  };

  this.previewStickerData = stickerData;
  return stickerData;
}
,

async renderStickerPreview() {
  if (!this.previewContainer) return undefined;

  // 连续输入会触发多次渲染：只让最后一次结果落到 DOM，避免卡片重复堆叠。
  const selfRecord = toRecord(this);
  const generation = (typeof selfRecord.stickerRenderGeneration === 'number' ? selfRecord.stickerRenderGeneration : 0) + 1;
  selfRecord.stickerRenderGeneration = generation;

  const stickerData = await this.buildStickerData();
  if (this.previewMode !== 'sticker' || selfRecord.stickerRenderGeneration !== generation) return undefined;

  this.previewContainer.empty();
  const stickerContainer = this.previewContainer.createEl('div', { cls: 'apple-sticker-preview-wrapper' });
  const uiState = this.getStickerUiState(stickerData.sourcePath || '');

  // 1. 复杂结构转换提醒（说明降级范围，但不暗示作者内容已被删除）
  const strippedParts = (Array.isArray(stickerData.removed) ? stickerData.removed : [])
    .filter((entry) => entry?.count > 0)
    .map((entry) => `${STICKER_TRANSFORM_LABELS[entry.kind] || '内容'} ${entry.count} 处`);
  if (strippedParts.length > 0) {
    const notice = stickerContainer.createEl('div', { cls: 'apple-sticker-notice-warning' });
    const noticeIcon = notice.createEl('span', { cls: 'apple-sticker-notice-icon' });
    const noticeSetIcon = getObsidianSetIcon();
    if (typeof noticeSetIcon === 'function') noticeSetIcon(noticeIcon, 'info');
    const noticeContent = notice.createEl('div', { cls: 'apple-sticker-notice-content' });
    noticeContent.createEl('span', { cls: 'apple-sticker-notice-title', text: `已转换：${strippedParts.join('、')}` });
    noticeContent.createEl('span', {
      cls: 'apple-sticker-notice-desc',
      text: '内容已转换为适合贴图的纯文本，不会改动笔记原文。',
    });
  }

  // 2. 图片卡片墙预览与交互（上限 20 张）
  const imagesSection = stickerContainer.createEl('div', { cls: 'apple-sticker-images-section' });
  const sectionHeader = imagesSection.createEl('div', { cls: 'apple-sticker-section-header' });
  const sectionTitle = sectionHeader.createEl('div', { cls: 'apple-sticker-section-title' });
  const setIcon = getObsidianSetIcon();
  if (typeof setIcon === 'function') {
    const iconSpan = sectionTitle.createEl('span', { cls: 'apple-sticker-section-icon-lucide' });
    setIcon(iconSpan, 'image');
  }
  sectionTitle.createEl('span', { text: '贴图图片列表' });
  sectionHeader.createEl('span', {
    cls: 'apple-sticker-count-badge',
    text: `${stickerData.imageItems.length} / ${STICKER_MAX_IMAGES} 张`
  });

  renderStickerImageList(imagesSection, {
    items: stickerData.imageItems,
    getDisplaySrc: (_, index) => stickerData.imageDisplaySources[index] || '',
    setIcon,
    emptyText: '正文中还没有图片；可在发布弹窗中添加本地图片或公众号素材。',
    onMove: (fromIndex, toIndex, movedItem) => {
      uiState.order = moveStickerImageItem(
        stickerData.imageItems.map((item) => item.key),
        fromIndex,
        toIndex
      );
      selfRecord.stickerFocusKey = movedItem?.key || '';
      void this.renderStickerPreview();
    },
    onRemove: (item, index) => {
      this.removeStickerImageItem(stickerData.sourcePath, item, index);
      void this.renderStickerPreview();
    },
    focusKey: typeof selfRecord.stickerFocusKey === 'string' ? selfRecord.stickerFocusKey : '',
  });
  selfRecord.stickerFocusKey = '';

  if (uiState.undoItems.length > 0 || uiState.removedKeys.length > 0) {
    const restoreRow = imagesSection.createDiv({ cls: 'apple-sticker-restore-row' });
    if (uiState.undoItems.length > 0) {
      const undoButton = restoreRow.createEl('button', {
        cls: 'apple-sticker-restore-btn',
        text: '撤销上次移除',
      });
      undoButton.onclick = () => {
        selfRecord.stickerFocusKey = this.restoreLastStickerImage(stickerData.sourcePath);
        void this.renderStickerPreview();
      };
    }
    const restoreAllButton = restoreRow.createEl('button', {
      cls: 'apple-sticker-restore-btn',
      text: '恢复全部',
    });
    restoreAllButton.onclick = () => {
      this.restoreAllStickerImages(stickerData.sourcePath);
      void this.renderStickerPreview();
    };
  }

  // 💡 温馨提示：贴图提取自正文，如需添加请在发布弹窗操作
  const hintLine = imagesSection.createEl('div', { cls: 'apple-sticker-hint-line' });
  const hintIcon = hintLine.createSpan({ cls: 'apple-sticker-hint-icon' });
  if (typeof setIcon === 'function') {
    setIcon(hintIcon, 'info');
  }
  hintLine.createEl('span', {
    cls: 'apple-sticker-hint-text',
    text: '这里确认发布顺序；添加本地图片或公众号素材，请打开发布弹窗。移除不会改动笔记。'
  });

  // 3. 纯文本正文预览
  const textSection = stickerContainer.createEl('div', { cls: 'apple-sticker-text-section' });
  const textHeader = textSection.createEl('div', { cls: 'apple-sticker-section-header' });
  const textTitle = textHeader.createEl('div', { cls: 'apple-sticker-section-title' });
  if (typeof setIcon === 'function') {
    const iconSpan = textTitle.createEl('span', { cls: 'apple-sticker-section-icon-lucide' });
    setIcon(iconSpan, 'file-text');
  }
  textTitle.createEl('span', { text: '贴图描述文案' });

  const charCount = stickerData.content ? stickerData.content.length : 0;
  const isOverLimit = charCount > STICKER_MAX_CONTENT_LENGTH;
  const countBadge = textHeader.createEl('span', { cls: 'apple-sticker-count-badge' });
  countBadge.createEl('span', {
    cls: `apple-sticker-count-current${isOverLimit ? ' is-error' : ''}`,
    text: `${charCount}`
  });
  countBadge.createEl('span', {
    cls: 'apple-sticker-count-total',
    text: ` / ${STICKER_MAX_CONTENT_LENGTH}`
  });

  textSection.createEl('div', {
    cls: 'apple-sticker-text-preview',
    text: stickerData.content || '(正文无纯文本内容)'
  });

  return stickerContainer;
}
,
};
