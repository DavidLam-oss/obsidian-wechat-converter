/*
## 核心功能

实现发布弹窗中的 wechat sync modal 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `wechatSyncModalMethods`，用于微信、飞书或多平台发布流程的 UI 编排。

## 定位

位于 views/publish-modal/，负责发布弹窗 UI 层；API 调用委托 services/。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  resolveSyncAccount,
  getDraftAssociation,
  clearDraftAssociation,
  htmlToText,
  WechatAPI,
  Notice,
  getActiveDocumentCompat,
  isRecord,
  createObsidianModal,
  getEventTargetValue,
  isMobileClient,
} from '../apple-style-view-shared.js';
import { STICKER_MAX_CONTENT_LENGTH } from '../../services/sticker-extractor.js';
import { renderStickerPublishContent } from './sticker-publish-content.js';

/** @type {WechatSyncModalMethodsContract & ThisType<AppleStyleViewContract>} */
const wechatSyncModalMethods = {
showSyncModal(options = {}) {
  if (this.previewMode !== 'sticker' && !this.currentHtml) {
    new Notice(this.getMissingRenderNotice());
    return;
  }

  const accounts = this.plugin.settings.wechatAccounts || [];
  if (accounts.length === 0) {
    if (!options.modal) {
      if (this.plugin.settings.feishuSync?.enabled) {
        this.showFeishuSyncModal();
        return;
      }
      if (this.plugin.settings.multiPlatformSync?.enabled) {
        this.showMultiPlatformSyncModal();
        return;
      }
    }
    const modal = options.modal || createObsidianModal(this.app);
    const mobileSync = isMobileClient(this.app);
    this.preparePublishModalShell(modal, { mode: 'wechat', mobileSync });
    const { feishuTab, multiPlatformTab } = this.createPublishModeTabs(modal, 'wechat');
    if (feishuTab) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- reason: dynamic tab element click handler
      feishuTab.onclick = () => this.showFeishuSyncModal({ modal });
    }
    multiPlatformTab.onclick = () => this.showMultiPlatformSyncModal({ modal });
    const empty = modal.contentEl.createDiv({ cls: 'wechat-sync-empty-state' });
    empty.createEl('h3', { text: '尚未配置微信公众号账号' });
    empty.createEl('p', { text: '微信草稿箱需要先配置公众号 API。其他平台仍可通过浏览器插件发送。' });
    const settingsBtn = empty.createEl('button', { text: '去设置', cls: 'mod-cta' });
    settingsBtn.onclick = () => {
      modal.close();
      this.openPluginSettings();
    };
    if (!options.modal) {
      modal.open();
    }
    return;
  }
  const modal = options.modal || createObsidianModal(this.app);
  const shouldOpenModal = !options.modal;
  const mobileSync = isMobileClient(this.app);
  this.preparePublishModalShell(modal, { mode: 'wechat', mobileSync });

  const { feishuTab, multiPlatformTab } = this.createPublishModeTabs(modal, 'wechat');
  if (feishuTab) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- reason: dynamic tab element click handler
    feishuTab.onclick = () => {
      this.showFeishuSyncModal({ modal });
    };
  }
  multiPlatformTab.onclick = () => {
    this.showMultiPlatformSyncModal({ modal });
  };

  // 获取当前活动文件的路径，用于状态缓存
  const activeFile = this.getPublishContextFile();
  const currentPath = activeFile ? activeFile.path : null;
  const frontmatterMeta = this.getFrontmatterPublishMeta(activeFile);

  // 尝试从缓存读取状态
  /** @type {ArticleSessionStateLike | null} */
  let cachedState = null;
  if (currentPath && this.articleStates.has(currentPath)) {
    cachedState = this.articleStates.get(currentPath);
  }

  const defaultId = this.plugin.settings.defaultAccountId;
  const hasDefault = accounts.some((account) => account.id === defaultId);
  let selectedAccountId = hasDefault ? defaultId : (accounts[0]?.id || '');

  if (this.previewMode === 'sticker') {
    renderStickerPublishContent(this, {
      modal,
      accounts,
      activeFile,
      sourcePath: currentPath || '',
      frontmatterMeta,
      shouldOpenModal,
    });
    return;
  }

  // 封面逻辑：优先使用缓存 -> frontmatter.cover -> 文章第一张图
  let coverBase64 = cachedState?.coverBase64 || frontmatterMeta.coverSrc || this.getFirstImageFromArticle() || '';
  let thumbMediaId = cachedState?.thumbMediaId || '';
  /** @type {WechatMaterialSelectionLike | null} */
  let materialCover = cachedState?.materialCover || null;

  // 更新 sessionCoverBase64 以便 onSyncToWechat 使用
  this.sessionCoverBase64 = coverBase64;
  this.sessionThumbMediaId = thumbMediaId;

  /** @returns {WechatAccountLike | null} */
  const getSelectedAccount = () => {
    const resolvedAccount = /** @type {unknown} */ (resolveSyncAccount({
      accounts: this.plugin.settings.wechatAccounts || [],
      selectedAccountId,
      defaultAccountId: this.plugin.settings.defaultAccountId,
    }));
    return isRecord(resolvedAccount) ? /** @type {WechatAccountLike} */ (resolvedAccount) : null;
  };
  const getSelectedDraftAssociation = () => currentPath
    ? /** @type {DraftAssociationLike | null} */ (getDraftAssociation(this.plugin.settings, currentPath, getSelectedAccount()?.id || selectedAccountId))
    : null;
  /** @type {DraftAssociationLike | null} */
  let draftAssociation = getSelectedDraftAssociation();
  let forceNewDraft = false;

  // 账号选择器
  const accountSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section' });
  accountSection.createEl('label', { text: '账号', cls: 'wechat-modal-label' });
  if (accounts.length === 1) {
    const onlyAccount = accounts[0];
    selectedAccountId = onlyAccount.id;
    accountSection.createEl('div', {
      cls: 'wechat-sync-account-single',
      text: `${onlyAccount.name} (默认)`
    });
  } else {
    const accountSelect = /** @type {ObsidianInputLike} */ (accountSection.createEl('select', { cls: 'wechat-account-select' }));

    for (const account of accounts) {
      const option = /** @type {ObsidianInputLike} */ (accountSelect.createEl('option', {
        value: account.id,
        text: account.id === defaultId ? `${account.name} (默认)` : account.name
      }));
      if (account.id === selectedAccountId) option.selected = true;
    }
    accountSelect.addEventListener('change', (e) => {
      selectedAccountId = getEventTargetValue(e, selectedAccountId);
      draftAssociation = getSelectedDraftAssociation();
      forceNewDraft = false;
      if (typeof updatePreview === 'function') updatePreview();
      if (typeof updateDraftStatusUI === 'function') updateDraftStatusUI();
    });
  }

  if (mobileSync) {
    const hasCoverForModal = !!coverBase64 || !!thumbMediaId;
    modal.contentEl.createEl('p', {
      cls: 'wechat-sync-mobile-quick-hint',
      text: hasCoverForModal
        ? '可直接同步；封面与摘要可在高级选项中调整。'
        : '当前未检测到封面，请在高级选项中上传封面后再同步。'
    });
  }

  const advancedOptions = modal.contentEl.createEl('details', { cls: 'wechat-sync-advanced' });
  const shouldExpandAdvanced = !mobileSync || (!coverBase64 && !thumbMediaId);
  if (shouldExpandAdvanced) advancedOptions.setAttribute('open', '');
  advancedOptions.createEl('summary', {
    cls: 'wechat-sync-advanced-summary',
    text: this.previewMode === 'sticker' ? '贴图发布配置（标题与配图）' : '高级选项（标题、封面与摘要）'
  });
  const advancedBody = advancedOptions.createDiv({ cls: 'wechat-sync-advanced-body' });

  // 标题设置
  const titleSection = advancedBody.createDiv({ cls: 'wechat-modal-section' });
  titleSection.createEl('label', {
    text: this.previewMode === 'sticker' ? '贴图标题' : '文章标题',
    cls: 'wechat-modal-label'
  });

  // 标题逻辑：优先使用缓存 -> frontmatter.title -> 文件名
  const initialTitle = cachedState?.title !== undefined
    ? cachedState.title
    : (frontmatterMeta.title || (activeFile ? activeFile.basename : ''));

  const titleInput = /** @type {ObsidianInputLike} */ (titleSection.createEl('input', {
    type: 'text',
    cls: 'wechat-modal-title-input',
    placeholder: '留空则默认使用 frontmatter 中的 title 或文件名'
  }));
  titleInput.value = initialTitle;
  titleInput.setCssStyles({ width: '100%' });
  titleInput.maxLength = 64; // 微信标题最大限制 64 字符

  // 实时更新缓存（标题）
  titleInput.addEventListener('input', () => {
    if (currentPath) {
      const state = this.articleStates.get(currentPath) || {};
      this.articleStates.set(currentPath, { ...state, title: titleInput.value.trim() });
    }
  });

  // 封面设置
  const coverSection = advancedBody.createDiv({ cls: 'wechat-modal-section' });
  coverSection.createEl('label', {
    text: this.previewMode === 'sticker' ? '贴图配图列表' : '封面图',
    cls: 'wechat-modal-label'
  });

  const coverContent = coverSection.createDiv({ cls: 'wechat-modal-cover-content' });
  const coverPreview = coverContent.createDiv({ cls: 'wechat-modal-cover-preview' });
  const stickerStatusEl = coverSection.createDiv({ cls: 'wechat-modal-sticker-status' });
  if (this.previewMode !== 'sticker') {
    stickerStatusEl.setCssStyles({ display: 'none' });
  }

  const updatePreview = () => {
    coverPreview.empty();
    coverPreview.removeClass('has-material-cover');

    if (this.previewMode === 'sticker') {
      const stickerData = this.previewStickerData;
      const stickerImages = stickerData && Array.isArray(stickerData.images) ? stickerData.images : [];
      // 缩略图要用能直接显示的地址；vault 内图片的原始写法（如 ![[a.png]]）无法当 img src。
      const displaySources = stickerData && Array.isArray(stickerData.imageDisplaySources)
        ? stickerData.imageDisplaySources
        : [];
      const stickerContent = stickerData && typeof stickerData.content === 'string' ? stickerData.content : '';
      const stickerCharCount = stickerContent.length;

      coverPreview.addClass('has-sticker-preview');
      const stickerGrid = coverPreview.createDiv({ cls: 'wechat-modal-sticker-grid-preview' });

      if (stickerImages.length === 0) {
        stickerGrid.createEl('div', { text: '未检测到图片素材（贴图要求至少有一张图片）', cls: 'wechat-modal-no-cover' });
      } else {
        stickerImages.slice(0, 4).forEach((imgSrc, idx) => {
          stickerGrid.createEl('img', { attr: { src: displaySources[idx] || imgSrc } });
        });
        if (stickerImages.length > 4) {
          stickerGrid.createEl('div', { cls: 'more-badge', text: `+${stickerImages.length - 4}` });
        }
      }

      // 图片数量与文案字数都要过关才允许同步，避免带着必然失败的请求打微信接口。
      if (stickerImages.length === 0) {
        syncBtn.disabled = true;
        syncBtn.setText('图片不足，无法同步');
        syncBtn.addClass('apple-btn-disabled');
        syncBtn.setAttribute('title', '微信贴图要求至少包含 1 张图片素材，请先在笔记中插入图片');
      } else if (stickerCharCount > STICKER_MAX_CONTENT_LENGTH) {
        syncBtn.disabled = true;
        syncBtn.setText('文字超长，无法同步');
        syncBtn.addClass('apple-btn-disabled');
        syncBtn.setAttribute(
          'title',
          `微信贴图限制文案在 ${STICKER_MAX_CONTENT_LENGTH} 字以内，当前为 ${stickerCharCount} 字，请精简后再同步`
        );
      } else {
        syncBtn.disabled = false;
        syncBtn.setText('同步到贴图草稿');
        syncBtn.removeClass('apple-btn-disabled');
        syncBtn.removeAttribute('title');
      }

      stickerStatusEl.empty();
      stickerStatusEl.createEl('span', {
        text: `共 ${stickerImages.length} 张图片 · 文案 ${stickerCharCount} / ${STICKER_MAX_CONTENT_LENGTH} 字`,
        cls: stickerCharCount > STICKER_MAX_CONTENT_LENGTH ? 'is-error' : '',
      });
      return;
    }
    if (thumbMediaId) {
      coverPreview.addClass('has-material-cover');
      const materialPreview = coverPreview.createDiv({ cls: 'wechat-modal-cover-material-preview' });
      const materialTitle = materialCover?.name || '素材库封面';
      const imageFrame = materialPreview.createDiv({ cls: 'wechat-modal-cover-material-frame' });
      if (coverBase64) {
        const img = imageFrame.createEl('img', {
          attr: { src: coverBase64, alt: materialTitle },
        });
        img.onerror = () => {
          img.remove();
          imageFrame.addClass('has-image-error');
        };
      } else {
        imageFrame.addClass('has-image-error');
      }
      const meta = materialPreview.createDiv({ cls: 'wechat-modal-cover-material-meta' });
      meta.createEl('span', { text: '素材库' });
      meta.createEl('strong', { text: materialTitle });
      syncBtn.disabled = false;
      syncBtn.setText(getSyncButtonText());
      syncBtn.removeClass('apple-btn-disabled');
    } else if (coverBase64) {
      coverPreview.createEl('img', { attr: { src: coverBase64 } });
      // 有封面 -> 启用同步按钮
      syncBtn.disabled = false;
      syncBtn.setText(getSyncButtonText());
      syncBtn.removeClass('apple-btn-disabled');
    } else {
      // UI 优化：去除 emoji，使用纯净的提示样式 (样式在 CSS 中定义)
      coverPreview.createEl('div', {
        text: '暂无封面',
        cls: 'wechat-modal-no-cover'
      });
      // 无封面 -> 禁用同步按钮
      syncBtn.disabled = true;
      syncBtn.setText('请先设置封面');
      syncBtn.addClass('apple-btn-disabled');
    }
  };

  const coverBtns = coverContent.createDiv({ cls: 'wechat-modal-cover-btns' });
  const uploadBtn = coverBtns.createEl('button', { text: '上传' });
  const selectMaterialBtn = coverBtns.createEl('button', {
    text: '从素材库选择',
    cls: 'wechat-cover-select-material-btn',
  });
  if (this.previewMode === 'sticker') {
    coverBtns.setCssStyles({ display: 'none' });
  }

  // 摘要设置
  const digestSection = advancedBody.createDiv({ cls: 'wechat-modal-section' });
  if (this.previewMode === 'sticker') {
    digestSection.setCssStyles({ display: 'none' });
  }
  digestSection.createEl('label', { text: '文章摘要（可选）', cls: 'wechat-modal-label' });

  // 自动提取文章前 45 字作为默认摘要
  const autoDigest = htmlToText(this.currentHtml || '').replace(/\s+/g, ' ').trim().substring(0, 45);

  // 摘要逻辑：优先使用缓存 -> frontmatter.excerpt -> 自动提取
  const initialDigest = cachedState?.digest !== undefined
    ? cachedState.digest
    : (frontmatterMeta.excerpt || autoDigest);

  const digestInput = /** @type {ObsidianInputLike & { rows: number, maxLength: number }} */ (digestSection.createEl('textarea', {
    cls: 'wechat-modal-digest-input',
    placeholder: '留空则自动提取文章前 45 字'
  }));
  // Explicitly set the value to ensure it renders correctly in the textarea
  digestInput.value = initialDigest;

  digestInput.rows = 3;
  digestInput.setCssStyles({
    width: '100%',
    resize: 'vertical',
  });
  digestInput.maxLength = 120; // 限制最大输入 120 字

  // 字数统计
  const charCount = digestSection.createEl('div', {
    cls: 'wechat-digest-count',
    text: `${digestInput.value.length}/120`,
    style: 'text-align: right; font-size: 11px; color: var(--text-muted); margin-top: 4px; opacity: 0.7;'
  });

  // 实时更新缓存（摘要）
  digestInput.addEventListener('input', () => {
    charCount.setText(`${digestInput.value.length}/120`);
    if (currentPath) {
      const state = this.articleStates.get(currentPath) || {};
      state.digest = digestInput.value.trim(); // 允许为空字符串（代表清空）
      // 如果用户清空了输入框，我们存空字符串，以便下次打开也是空的（还是说回退到 auto?）
      // 逻辑修正：如果用户清空，通常意味着想用默认或不发摘要。这里我们存用户输入的值。
      // 但如果原本逻辑是"空则自动提取"，那这里输入框空的时候，sessionDigest 会变成 autoDigest
      this.articleStates.set(currentPath, { ...state, digest: digestInput.value });
    }
  });

  const draftStatusEl = modal.contentEl.createDiv({ cls: 'wechat-draft-status' });
  const getSyncButtonText = () => (draftAssociation && !forceNewDraft ? '更新草稿' : '开始同步');
  const updateDraftStatusUI = () => {
    if (!draftStatusEl) return;
    draftStatusEl.empty();
    // 贴图是独立的图片消息类型，微信不支持在原文章草稿上更新，
    // 所以贴图模式下不展示、也不复用普通文章的草稿关联。
    if (this.previewMode === 'sticker') return;
    if (!draftAssociation || forceNewDraft) return;

    let confirmUnlink = false;
    const statusText = draftStatusEl.createEl('span', {
      text: '已关联微信草稿，同步将更新该草稿',
    });
    const unlinkBtn = draftStatusEl.createEl('button', {
      text: '取消关联',
      cls: 'wechat-draft-unlink',
    });
    unlinkBtn.onclick = async () => {
      if (!confirmUnlink) {
        confirmUnlink = true;
        draftStatusEl.addClass('is-confirming');
        statusText.setText('再次点击确认取消关联');
        unlinkBtn.setText('确认取消');
        return;
      }
      forceNewDraft = true;
      if (currentPath) {
        clearDraftAssociation(this.plugin.settings, currentPath);
        await this.plugin.saveSettings();
      }
      draftAssociation = null;
      syncBtn.setText(getSyncButtonText());
      updateDraftStatusUI();
    };
  };

  // 操作按钮
  const btnRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });

  const cancelBtn = btnRow.createEl('button', { text: '取消' });
  cancelBtn.onclick = () => modal.close();

  const syncBtn = btnRow.createEl('button', { text: getSyncButtonText(), cls: 'mod-cta' });
  // 初始化时就检查状态
  updatePreview();
  updateDraftStatusUI();

  // 贴图数据来自侧边栏预览；打开弹窗时再取一次最新结果，避免展示上一次的顺序。
  if (this.previewMode === 'sticker') {
    void this.buildStickerData()
      .then(() => updatePreview())
      .catch(() => undefined);
  }

  syncBtn.onclick = async () => {
    const isStickerMode = this.previewMode === 'sticker';
    // 贴图发布没有封面概念，图片本身就是内容。
    if (!isStickerMode && !coverBase64 && !thumbMediaId) {
      new Notice('❌ 请先设置封面图');
      return;
    }
    modal.close();
    this.selectedAccountId = selectedAccountId;
    this.sessionCoverBase64 = coverBase64;
    this.sessionThumbMediaId = thumbMediaId;
    this.sessionDraftMediaId = (!isStickerMode && !forceNewDraft && draftAssociation?.mediaId) ? draftAssociation.mediaId : '';
    this.sessionDraftIndex = (!isStickerMode && !forceNewDraft && Number.isInteger(draftAssociation?.index)) ? draftAssociation.index : 0;
    // 传递用户输入的标题，或使用 frontmatter 标题或文件名
    this.sessionTitle = titleInput.value.trim() || frontmatterMeta.title || (activeFile ? activeFile.basename : '无标题文章');
    // 传递用户输入的摘要，或使用自动提取的摘要
    this.sessionDigest = digestInput.value.trim() || autoDigest || '一键同步自 Obsidian';
    await this.onSyncToWechat();
  };

  // 实时更新缓存（封面图） - 需要修改 uploadBtn 的回调逻辑
  uploadBtn.onclick = () => {
    const activeDocument = getActiveDocumentCompat();
    if (!activeDocument) return;
    const input = /** @type {HTMLInputElement} */ (activeDocument.createElement('input'));
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const target = e.target instanceof HTMLInputElement ? e.target : null;
      const file = target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        coverBase64 = typeof event.target?.result === 'string' ? event.target.result : '';
        thumbMediaId = '';
        materialCover = null;
        this.sessionCoverBase64 = coverBase64;
        this.sessionThumbMediaId = '';
        updatePreview();

        // 更新缓存
        if (currentPath) {
          const state = this.articleStates.get(currentPath) || {};
          this.articleStates.set(currentPath, {
            ...state,
            coverBase64: coverBase64,
            thumbMediaId: '',
            materialCover: null,
          });
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  selectMaterialBtn.onclick = async () => {
    const account = getSelectedAccount();
    if (!account) {
      new Notice('请先配置公众号账号');
      return;
    }

    const api = new WechatAPI(account.appId, account.appSecret, this.plugin.settings.proxyUrl, this.plugin.settings.clientId);
    await this.showMaterialPickerModal(api, (material) => {
      thumbMediaId = material.mediaId;
      coverBase64 = material.url || '';
      materialCover = {
        mediaId: material.mediaId,
        url: material.url || '',
        name: material.name || '',
      };
      this.sessionCoverBase64 = coverBase64;
      this.sessionThumbMediaId = thumbMediaId;
      updatePreview();

      if (currentPath) {
        const state = this.articleStates.get(currentPath) || {};
        this.articleStates.set(currentPath, { ...state, coverBase64, thumbMediaId, materialCover });
      }
    });
  };

  if (shouldOpenModal) modal.open();
}
};

export { wechatSyncModalMethods };
