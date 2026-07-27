/*
## 核心功能

按“顺序优先单列”方向渲染微信贴图发布弹窗，集中管理账号、标题、图片素材与发布校验。

## 输入

接收 AppleStyleView、发布 Modal、公众号账号列表、打开时冻结的源文件和移动端状态。

## 输出

输出可添加本地图片/公众号素材、可排序移除撤销并触发贴图同步的发布界面。

## 定位

位于 views/publish-modal/，仅编排贴图发布 UI；图片提取、列表渲染与上传分别委托共享模块。

## 依赖

关键依赖：Obsidian Modal API、共享贴图列表、统一图片项模型、素材选择器和贴图同步动作。

## 维护规则

- 发布弹窗始终绑定打开时的 sourcePath，活动文件切换不得偷换发布对象。
- 素材项必须保留选择时的 accountId；切换账号后先阻断，不静默替换素材。
- 图片网格顺序就是微信发布顺序，所有交互写回同一个 key 数组。
- 手动添加达到平台上限后必须明确阻止，不得静默丢弃用户选择。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: UI adapter consumes dynamic Obsidian modal elements, files, and account records */

import {
  Notice,
  WechatAPI,
  getActiveDocumentCompat,
  getEventTargetValue,
  getObsidianSetIcon,
} from '../apple-style-view-shared.js';
import {
  STICKER_MAX_CONTENT_LENGTH,
  STICKER_MAX_IMAGES,
  STICKER_MAX_TITLE_LENGTH,
} from '../../services/sticker-extractor.js';
import {
  createBodyStickerImageItem,
  createMaterialStickerImageItem,
  createUploadStickerImageItem,
} from '../../services/sticker-image-items.js';
import {
  moveStickerImageItem,
  renderStickerImageList,
} from '../shared/sticker-image-list.js';

/**
 * @param {StickerPreviewDataLike|null|undefined} data
 * @returns {object[]}
 */
function getStickerModalItems(data) {
  if (Array.isArray(data?.imageItems)) return data.imageItems;
  return (Array.isArray(data?.images) ? data.images : [])
    .map((src) => createBodyStickerImageItem(src))
    .filter(Boolean);
}

/**
 * @param {AppleStyleViewContract} view
 * @param {object} params
 * @param {PublishModalLike} params.modal
 * @param {WechatAccountLike[]} params.accounts
 * @param {TFileLike|null} params.activeFile
 * @param {string} params.sourcePath
 * @param {Record<string,unknown>} params.frontmatterMeta
 * @param {boolean} params.shouldOpenModal
 * @returns {void}
 */
function renderStickerPublishContent(view, {
  modal,
  accounts,
  activeFile,
  sourcePath,
  frontmatterMeta,
  shouldOpenModal,
}) {
  modal.contentEl.addClass('wechat-sticker-publish-content');
  const setIcon = getObsidianSetIcon();
  const generation = view.stickerModalGeneration;
  view.sessionStickerSourcePath = sourcePath;

  const defaultId = view.plugin.settings.defaultAccountId;
  const hasDefault = accounts.some((account) => account.id === defaultId);
  let selectedAccountId = hasDefault ? defaultId : (accounts[0]?.id || '');
  let focusKey = '';
  let currentData = view.previewStickerData?.sourcePath === sourcePath
    ? view.previewStickerData
    : null;
  let previewNeedsRefresh = false;

  const accountSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section sticker-publish-account' });
  accountSection.createEl('label', { text: '发布账号', cls: 'wechat-modal-label' });
  if (accounts.length === 1) {
    selectedAccountId = accounts[0].id;
    accountSection.createDiv({
      cls: 'wechat-sync-account-single',
      text: `${accounts[0].name}（默认）`,
    });
  } else {
    const accountSelect = accountSection.createEl('select', { cls: 'wechat-account-select' });
    for (const account of accounts) {
      const option = accountSelect.createEl('option', {
        value: account.id,
        text: account.id === defaultId ? `${account.name}（默认）` : account.name,
      });
      option.selected = account.id === selectedAccountId;
    }
    accountSelect.addEventListener('change', (event) => {
      selectedAccountId = getEventTargetValue(event, selectedAccountId);
      renderCurrent();
    });
  }

  const titleSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section sticker-publish-title' });
  const titleHeader = titleSection.createDiv({ cls: 'sticker-publish-field-header' });
  titleHeader.createEl('label', { text: '贴图标题', cls: 'wechat-modal-label' });
  const titleCount = titleHeader.createSpan({ cls: 'sticker-publish-count' });
  const titleCountValue = titleCount.createSpan({ cls: 'sticker-publish-count-value' });
  titleCount.createSpan({ text: `/${STICKER_MAX_TITLE_LENGTH} 字` });
  const titleInput = titleSection.createEl('input', {
    type: 'text',
    cls: 'wechat-modal-title-input',
    placeholder: '默认使用 frontmatter title 或文件名',
  });
  titleInput.value = String(frontmatterMeta.title || activeFile?.basename || '未命名贴图');

  const statusSection = modal.contentEl.createDiv({ cls: 'sticker-publish-status' });
  const imageSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section sticker-publish-images' });
  const imageHeader = imageSection.createDiv({ cls: 'sticker-publish-section-header' });
  const imageTitle = imageHeader.createDiv({ cls: 'sticker-publish-section-title' });
  const imageIcon = imageTitle.createSpan({ cls: 'sticker-publish-section-icon' });
  if (typeof setIcon === 'function') setIcon(imageIcon, 'images');
  imageTitle.createSpan({ text: '发布图片' });
  const imageCount = imageTitle.createSpan({ cls: 'sticker-publish-count' });

  const imageActions = imageHeader.createDiv({
    cls: 'sticker-publish-image-actions wechat-modal-cover-btns',
  });
  const localButton = imageActions.createEl('button', {
    text: '上传',
    attr: { type: 'button' },
  });
  const materialButton = imageActions.createEl('button', {
    text: '从素材库选择',
    cls: 'wechat-cover-select-material-btn',
    attr: { type: 'button' },
  });

  const imageBody = imageSection.createDiv({ cls: 'sticker-publish-image-body wechat-modal-sticker-grid-preview' });
  const restoreRow = imageSection.createDiv({ cls: 'sticker-publish-restore-row' });
  modal.contentEl.createDiv({ cls: 'wechat-draft-status' });

  const buttonRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons sticker-publish-footer' });
  const cancelButton = buttonRow.createEl('button', { text: '取消' });
  const syncButton = buttonRow.createEl('button', { text: '同步到贴图草稿', cls: 'mod-cta' });
  cancelButton.onclick = () => modal.close();
  let currentItems = [];
  let currentContent = '';
  let currentForeignMaterialCount = 0;

  const getSelectedAccount = () => accounts.find((account) => account.id === selectedAccountId) || accounts[0] || null;
  const markPreviewDirty = () => {
    previewNeedsRefresh = true;
  };
  const originalOnClose = typeof modal.onClose === 'function'
    ? /** @type {() => void} */ (modal.onClose.bind(modal))
    : null;
  modal.onClose = () => {
    if (originalOnClose) originalOnClose();
    if (!previewNeedsRefresh || view.previewMode !== 'sticker') return;
    previewNeedsRefresh = false;
    Promise.resolve(view.renderStickerPreview?.()).catch((error) => {
      console.error('Sticker preview refresh after modal close failed:', error);
    });
  };

  const refreshData = async () => {
    const nextData = await view.buildStickerData({ sourcePath });
    if (view.stickerModalGeneration !== generation) return;
    currentData = nextData;
    renderCurrent();
  };

  function updatePublishState() {
    const titleLength = titleInput.value.length;
    const normalizedTitleLength = titleInput.value.trim().length;
    const imageLimitReached = currentItems.length >= STICKER_MAX_IMAGES;
    titleCountValue.setText(String(titleLength));
    titleCountValue.toggleClass?.('is-error', titleLength > STICKER_MAX_TITLE_LENGTH);
    imageCount.toggleClass?.('is-error', currentItems.length > STICKER_MAX_IMAGES);

    localButton.disabled = imageLimitReached;
    materialButton.disabled = imageLimitReached || !getSelectedAccount();
    const imageLimitHint = `贴图最多 ${STICKER_MAX_IMAGES} 张，请先移除一张`;
    if (imageLimitReached) {
      localButton.setAttribute('title', imageLimitHint);
      materialButton.setAttribute('title', imageLimitHint);
    } else {
      localButton.removeAttribute('title');
      materialButton.removeAttribute('title');
    }

    let disabledReason = '';
    if (currentItems.length === 0) disabledReason = '微信贴图至少需要 1 张图片';
    else if (currentItems.length > STICKER_MAX_IMAGES) {
      disabledReason = `当前有 ${currentItems.length} 张图片，超过 ${STICKER_MAX_IMAGES} 张上限`;
    }
    else if (normalizedTitleLength === 0) disabledReason = '请输入贴图标题';
    else if (titleLength > STICKER_MAX_TITLE_LENGTH) {
      disabledReason = `当前标题 ${titleLength} 字，超过 ${STICKER_MAX_TITLE_LENGTH} 字上限`;
    } else if (currentContent.length > STICKER_MAX_CONTENT_LENGTH) {
      disabledReason = `当前文案 ${currentContent.length} 字，超过 ${STICKER_MAX_CONTENT_LENGTH} 字上限`;
    } else if (currentForeignMaterialCount > 0) {
      disabledReason = '当前账号不能使用其他公众号的素材';
    }
    syncButton.disabled = Boolean(disabledReason);
    syncButton.toggleClass?.('apple-btn-disabled', Boolean(disabledReason));
    syncButton.setText(
      currentItems.length === 0
        ? '图片不足，无法同步'
        : (currentItems.length > STICKER_MAX_IMAGES
          ? '图片超限，无法同步'
          : (normalizedTitleLength === 0
            ? '请输入贴图标题'
            : (titleLength > STICKER_MAX_TITLE_LENGTH
              ? '标题超长，无法同步'
              : (currentContent.length > STICKER_MAX_CONTENT_LENGTH ? '文字超长，无法同步' : '同步到贴图草稿'))))
    );
    if (disabledReason) syncButton.setAttribute('title', disabledReason);
    else syncButton.removeAttribute('title');
  }

  function renderCurrent() {
    const data = currentData;
    const items = getStickerModalItems(data);
    const displaySources = Array.isArray(data?.imageDisplaySources) ? data.imageDisplaySources : [];
    const content = typeof data?.content === 'string' ? data.content : '';
    const uiState = view.getStickerUiState(sourcePath);
    const selectedAccount = getSelectedAccount();
    const foreignMaterialCount = items.filter((item) => (
      item.uploadRef?.kind === 'media'
      && item.uploadRef.accountId !== selectedAccount?.id
    )).length;
    currentItems = items;
    currentContent = content;
    currentForeignMaterialCount = foreignMaterialCount;

    imageCount.setText(`${items.length} / ${STICKER_MAX_IMAGES}`);
    imageBody.empty();
    renderStickerImageList(imageBody, {
      items,
      getDisplaySrc: (item, index) => (
        item.source === 'body'
          ? (displaySources[index] || item.displaySrc || '')
          : (item.displaySrc || displaySources[index] || '')
      ),
      setIcon,
      emptyText: `先添加 1–${STICKER_MAX_IMAGES} 张图片；发布顺序按这里从左到右排列。`,
      focusKey,
      onMove: (fromIndex, toIndex, movedItem) => {
        uiState.order = moveStickerImageItem(
          items.map((item) => item.key),
          fromIndex,
          toIndex
        );
        focusKey = movedItem?.key || '';
        markPreviewDirty();
        void refreshData();
      },
      onRemove: (item, index) => {
        view.removeStickerImageItem(sourcePath, item, index);
        focusKey = '';
        markPreviewDirty();
        void refreshData();
      },
    });
    focusKey = '';

    restoreRow.empty();
    if (uiState.undoItems.length > 0) {
      const undoButton = restoreRow.createEl('button', { text: '撤销上次移除' });
      undoButton.onclick = () => {
        focusKey = view.restoreLastStickerImage(sourcePath);
        markPreviewDirty();
        void refreshData();
      };
    }
    if (uiState.removedKeys.length > 0 || uiState.undoItems.length > 0) {
      const restoreAllButton = restoreRow.createEl('button', { text: '恢复全部' });
      restoreAllButton.onclick = () => {
        view.restoreAllStickerImages(sourcePath);
        markPreviewDirty();
        void refreshData();
      };
    }

    statusSection.empty();
    statusSection.createDiv({ cls: 'sticker-publish-status-label', text: '发布检查' });
    const summary = statusSection.createDiv({ cls: 'sticker-publish-summary' });
    summary.createSpan({ text: `图片 ${items.length} / ${STICKER_MAX_IMAGES} 张` });
    summary.createSpan({ text: `文案 ${content.length} / ${STICKER_MAX_CONTENT_LENGTH} 字` });
    const omittedImageCount = Number.isFinite(data?.omittedImageCount)
      ? Math.max(0, Number(data.omittedImageCount))
      : 0;
    if (omittedImageCount > 0) {
      statusSection.createDiv({
        cls: 'sticker-publish-account-warning',
        text: `另有 ${omittedImageCount} 张图片超过 ${STICKER_MAX_IMAGES} 张上限，未加入本次贴图。`,
      });
    }
    const removed = (Array.isArray(data?.removed) ? data.removed : [])
      .filter((entry) => entry?.count > 0)
      .map((entry) => `${entry.kind} ${entry.count} 处`);
    if (removed.length > 0) {
      statusSection.createDiv({
        cls: 'sticker-publish-cleaning-note',
        text: `已为贴图清理：${removed.join('、')}。笔记原文未改动。`,
      });
    }
    if (foreignMaterialCount > 0) {
      statusSection.createDiv({
        cls: 'sticker-publish-account-warning',
        text: `有 ${foreignMaterialCount} 张公众号素材不属于当前账号，请移除或切回原账号。`,
      });
    }

    updatePublishState();
  }

  titleInput.addEventListener('input', updatePublishState);

  localButton.onclick = () => {
    const remainingSlots = Math.max(0, STICKER_MAX_IMAGES - currentItems.length);
    if (remainingSlots === 0) {
      new Notice(`贴图最多 ${STICKER_MAX_IMAGES} 张，请先移除一张`);
      return;
    }
    const activeDocument = getActiveDocumentCompat();
    if (!activeDocument) return;
    const input = activeDocument.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      const uiState = view.getStickerUiState(sourcePath);
      let addedCount = 0;
      let duplicateCount = 0;
      let overLimitCount = 0;
      for (const file of files) {
        const fingerprint = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
        const existing = uiState.manualItems.find((item) => item.key === `upload:${fingerprint}`);
        if (existing) {
          duplicateCount += 1;
          continue;
        }
        if (addedCount >= remainingSlots) {
          overLimitCount += 1;
          continue;
        }
        const objectUrl = window.URL.createObjectURL(file);
        const item = createUploadStickerImageItem({
          blob: file,
          fingerprint,
          displaySrc: objectUrl,
          name: file.name,
        });
        if (!item) {
          window.URL.revokeObjectURL(objectUrl);
          continue;
        }
        uiState.objectUrls.add(objectUrl);
        uiState.manualItems.push(item);
        uiState.order.push(item.key);
        addedCount += 1;
      }
      if (addedCount > 0) {
        markPreviewDirty();
        void refreshData();
      }
      if (overLimitCount > 0) {
        new Notice(`已添加 ${addedCount} 张；另有 ${overLimitCount} 张超过 ${STICKER_MAX_IMAGES} 张上限，未添加`);
      } else if (duplicateCount > 0) {
        new Notice(`有 ${duplicateCount} 张本地图片已在列表中，未重复添加`);
      }
    };
    input.click();
  };

  materialButton.onclick = async () => {
    if (currentItems.length >= STICKER_MAX_IMAGES) {
      new Notice(`贴图最多 ${STICKER_MAX_IMAGES} 张，请先移除一张`);
      return;
    }
    const account = getSelectedAccount();
    if (!account) {
      new Notice('请先选择公众号账号');
      return;
    }
    const api = new WechatAPI(
      account.appId,
      account.appSecret,
      view.plugin.settings.proxyUrl,
      view.plugin.settings.clientId
    );
    await view.showMaterialPickerModal(api, (material) => {
      if (currentItems.length >= STICKER_MAX_IMAGES) {
        new Notice(`贴图最多 ${STICKER_MAX_IMAGES} 张，请先移除一张`);
        return;
      }
      const item = createMaterialStickerImageItem({
        mediaId: material.mediaId,
        accountId: account.id,
        displaySrc: material.url,
        name: material.name,
      });
      if (!item) return;
      const uiState = view.getStickerUiState(sourcePath);
      if (!uiState.manualItems.some((candidate) => candidate.key === item.key)) {
        uiState.manualItems.push(item);
        uiState.order.push(item.key);
        markPreviewDirty();
        void refreshData();
      } else {
        new Notice('这张公众号素材已在列表中');
      }
    }, {
      title: '从公众号素材库添加图片',
      confirmText: '添加这张图片',
    });
  };

  syncButton.onclick = async () => {
    if (syncButton.disabled) return;
    const account = getSelectedAccount();
    if (!account) {
      new Notice('请先选择公众号账号');
      return;
    }
    view.selectedAccountId = account.id;
    view.sessionStickerSourcePath = sourcePath;
    view.sessionTitle = titleInput.value.trim();
    view.sessionDraftMediaId = '';
    view.sessionDraftIndex = 0;
    modal.close();
    await view.onSyncToWechat();
  };

  const handleRefreshError = (error) => {
    if (view.stickerModalGeneration !== generation) return;
    statusSection.empty();
    statusSection.createDiv({
      cls: 'sticker-publish-account-warning',
      text: `暂时无法读取贴图内容：${error?.message || '未知错误'}`,
    });
    syncButton.disabled = true;
    if (shouldOpenModal) modal.open();
  };

  if (currentData) {
    // 侧边栏已持有同一来源的最新贴图数据，直接复用，避免打开后重复清空图片 DOM 造成闪烁。
    renderCurrent();
    if (shouldOpenModal) modal.open();
  } else {
    // 首次没有缓存时先读取数据，再展示弹窗，避免用户看到空态到完整内容的布局跳变。
    void refreshData()
      .then(() => {
        if (shouldOpenModal && view.stickerModalGeneration === generation) modal.open();
      })
      .catch(handleRefreshError);
  }
}

export {
  getStickerModalItems,
  renderStickerPublishContent,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: resume typed linting after the dynamic sticker publish UI boundary */
