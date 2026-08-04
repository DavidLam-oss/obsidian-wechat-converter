/*
## 核心功能

实现 Obsidian 插件视图层的 apple style view 能力。

## 输入

接收 Obsidian ItemView/PluginSettingTab 生命周期、插件实例、用户事件和服务层结果。

## 输出

输出 `AppleStyleView`，用于组装主视图、状态栏或共享视图方法。

## 定位

位于 views/，是 UI 编排层；复杂业务规则应委托 converter.js 或 services/。

## 依赖

关键依赖：`./apple-style-view-shared.js`、`./converter/core.js`、`./converter/settings-panel.js`、`./converter/panel-shell.js`、`./converter/sticker-preview.js`、`./publish-modal/publish-context.js`、`./publish-modal/wechat.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { ItemView } from './apple-style-view-shared.js';
import { coreMethods } from './converter/core.js';
import { settingsPanelMethods } from './converter/settings-panel.js';
import { panelShellMethods } from './converter/panel-shell.js';
import { stickerPreviewMethods } from './converter/sticker-preview.js';
import { aiLayoutPanelMethods } from './converter/ai-layout-panel.js';
import { aiLayoutDebugMethods } from './converter/ai-layout-debug.js';
import { clipboardMethods } from './converter/clipboard.js';
import { publishContextMethods } from './publish-modal/publish-context.js';
import { wechatPublishMethods } from './publish-modal/wechat.js';
import { materialPickerMethods } from './publish-modal/material-picker.js';

class AppleStyleView extends ItemView {
  /**
   * @param {LeafLike} leaf
   * @param {AppleStylePluginLike} plugin
   */
  constructor(leaf, plugin) {
    super(leaf);
    /** @type {AppleStylePluginLike} */
    this.plugin = plugin;
    /** @type {string | null} */
    this.currentHtml = null;
    /** @type {ConverterRuntimeLike | null} */
    this.converter = null;
    /** @type {unknown} */
    this.nativeRenderPipeline = null;
    /** @type {ThemeRuntimeLike | null} */
    this.theme = null;
    /** @type {TFileLike | null} */
    this.lastActiveFile = null;
    /** @type {'article' | 'sticker'} */
    this.previewMode = 'article';
    /** @type {StickerPreviewDataLike | null} */
    this.previewStickerData = null;
    /** @type {boolean} */
    this.insertStickerImageIndex = false;
    /**
     * 贴图模式的按笔记交互状态：拖拽后的顺序与被排除的图片。
     * 只影响这次发布，不会改写笔记正文。
     * @type {Map<string, {
     *   order: string[],
     *   removedKeys: string[],
     *   manualItems: object[],
     *   undoItems: object[],
     *   objectUrls: Set<string>
     * }>}
     */
    this.stickerUiStates = new Map();
    /** @type {Map<string, string>} */
    this.stickerUploadCache = new Map();
    /** @type {string} */
    this.sessionStickerSourcePath = '';
    /** @type {number} */
    this.stickerModalGeneration = 0;
    /** @type {string | null} */
    this.sessionCoverBase64 = ''; // 本次文章的临时封面
    /** @type {string} */
    this.sessionThumbMediaId = ''; // 从微信素材库选择的封面 media_id
    /** @type {string} */
    this.sessionDraftMediaId = ''; // 本次同步要更新的草稿 media_id
    /** @type {number} */
    this.sessionDraftIndex = 0; // 单图文默认更新第 0 篇
    /** @type {string} */
    this.sessionTitle = ''; // 本次同步的标题
    /** @type {string} */
    this.sessionDigest = ''; // 本次同步的摘要
    /** @type {Map<string, WechatMaterialCacheEntryLike>} */
    this.wechatMaterialCache = new Map(); // Map<account/page, { data, cachedAt }>
    this.wechatMaterialCoverAssetCache = new Map(); // Map<media/url, downloaded bridge asset bytes>

    // 双向滚动同步状态。滚动事件先合并到动画帧，再按预期目标位置
    // 区分用户滚动与代码同步滚动，避免 CodeMirror 重排和反向回弹。
    /** @type {number | null} */
    this.scrollSyncFrame = null;
    /** @type {(() => void) | null} */
    this.cancelScrollSyncFrame = null;
    this.pendingScrollSyncSource = '';
    /** @type {number | null} */
    this.expectedEditorScrollTop = null;
    /** @type {number | null} */
    this.expectedPreviewScrollTop = null;

    // 状态缓存：Map<FilePath, { coverBase64, digest }>
    // 用于在不关闭插件面板的情况下，切换文章或关闭弹窗后保留封面和摘要
    /** @type {Map<string, ArticleSessionStateLike>} */
    this.articleStates = new Map();

    // 公式/SVG 上传缓存：Map<Hash, WechatURL>
    // 避免重复上传相同的公式，节省微信 API 调用额度 (Quota) 并提升速度
    /** @type {Map<string, SvgUploadCacheEntry>} */
    this.svgUploadCache = new Map();
    // 普通图片上传缓存：Map<accountId::src, wechatUrl>
    // 用于同一视图生命周期内跨次同步复用，避免重复上传相同图片
    /** @type {Map<string, string | ImageCacheEntry>} */
    this.imageUploadCache = new Map();
    // 封面上传缓存：Map<accountId/appId::cover::src, { mediaId, fingerprint }>
    // 复用同一封面图的 thumb_media_id，封面内容变化时会自动重新上传。
    /** @type {Map<string, string | CoverCacheEntry>} */
    this.coverUploadCache = new Map();
    // Mermaid 导出缓存：Map<Hash, { dataUrl, width, height, style }>
    // 复制与同步复用同一份本地导出结果，避免重复栅格化
    /** @type {Map<string, unknown>} */
    this.mermaidImageCache = new Map();

    /** @type {number} */
    this.renderGeneration = 0;
    /** @type {string} */
    this.lastRenderError = '';
    /** @type {string} */
    this.lastRenderFailureNoticeKey = '';
    /** @type {number | null} */
    this.activeLeafRenderTimer = null;
    /** @type {number} */
    this.loadingGeneration = 0;
    /** @type {number | null} */
    this.loadingVisibilityTimer = null;
    /** @type {number | null} */
    this.sidePaddingPreviewTimer = null;
    /** @type {number | null} */
    this.resizeTimeout = null;
    /** @type {string} */
    this.lastResolvedMarkdown = '';
    /** @type {string} */
    this.lastResolvedSourcePath = '';
    /** @type {string} */
    this.lastResolvedSourceHash = '';
    /** @type {string} */
    this.aiLayoutSourceSwitchPath = '';
    /** @type {string} */
    this.aiLayoutStaleSuppressPath = '';
    /** @type {number} */
    this.aiLayoutStaleSuppressUntil = 0;
    /** @type {number | null} */
    this.aiLayoutStaleSuppressTimer = null;
    /** @type {string | null} */
    this.baseRenderedHtml = null;
    /** @type {Map<string, CompiledCustomCssLike>} */
    this._customCssLastValidBySource = new Map();
    /** @type {number} */
    this.customCssRefreshGeneration = 0;
    this.customCssStatus = {
      state: 'disabled',
      sourceKind: '',
      sourcePath: '',
      diagnostics: [],
      matchedRuleCount: 0,
      matchedElementCount: 0,
    };
    /** @type {boolean} */
    this.aiPreviewApplied = false;
    this.aiLayoutBtn = null;
    this.settingsBtn = null;
    this.aiLayoutDebugMode = '';
    /** @type {Record<string, unknown> | null} */
    this.aiLayoutActiveGenerationSelection = null;
    /** @type {ObsidianElementLike | null} */
    this.previewContainer = null;
    /** @type {ObsidianElementLike | null} */
    this.settingsOverlay = null;
    /** @type {ObsidianElementLike | null} */
    this.settingsArea = null;
    /** @type {ObsidianElementLike | null} */
    this.settingsAdvancedArea = null;
    /** @type {ObsidianElementLike | null} */
    this.settingsAdvancedOptions = null;
    /** @type {ObsidianElementLike | null} */
    this.activeEditorScroller = null;
    /** @type {((event: Event) => void) | null} */
    this.editorScrollListener = null;
    /** @type {((event: Event) => void) | null} */
    this.previewScrollListener = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutOverlay = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutArea = null;
    /** @type {ObsidianInputLike | null} */
    this.aiLayoutFamilySelect = null;
    /** @type {ObsidianInputLike | null} */
    this.aiColorPaletteSelect = null;
    /** @type {ObsidianInputLike | null} */
    this.aiStylePackSelect = null;
    /** @type {ObsidianInputLike | null} */
    this.aiCustomColorInput = null;
    /** @type {ObsidianElementLike | null} */
    this.aiColorPaletteControls = null;
    /** @type {ObsidianElementLike | null} */
    this.aiColorPaletteGrid = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutStatus = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutStatusBadge = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutStatusBody = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutStatusText = null;
    /** @type {ObsidianElementLike | null} */
    this.aiCachedLayoutList = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutSummary = null;
    /** @type {ObsidianElementLike | null} */
    this.aiGenerateBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiRegenerateBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiResetBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiRestoreBlocksBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiResultSection = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutMetaNote = null;
    /** @type {ObsidianElementLike | null} */
    this.aiBlockList = null;
    /** @type {ObsidianElementLike | null} */
    this.aiAdvancedToggleBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiAdvancedBody = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutMetaChips = null;
    /** @type {ObsidianElementLike | null} */
    this.aiSchemaIssuePanel = null;
    /** @type {ObsidianElementLike | null} */
    this.aiViewJsonBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiViewErrorBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiDebugPanel = null;
    /** @type {ObsidianElementLike | null} */
    this.aiDebugPanelTitle = null;
    /** @type {ObsidianElementLike | null} */
    this.aiCopyPromptBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiCopyDebugBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiDebugPanelBody = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutLoadingMask = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutLoadingSpinner = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutLoadingMaskText = null;
    /** @type {ObsidianElementLike | null} */
    this.currentDocLabel = null;
    /** @type {ObsidianElementLike | null} */
    this.docTitleText = null;
    /** @type {ObsidianElementLike | null} */
    this.copyBtn = null;
    /** @type {string} */
    this.selectedAccountId = '';
    /** @type {boolean} */
    this.isCopying = false;
    /** @type {CaptionToggleStateLike | null} */
    this.captionToggleState = null;
    /** @type {string} */
    this.pendingAiLayoutFamily = '';
    /** @type {string} */
    this.pendingAiColorPalette = '';
    /** @type {string} */
    this.pendingAiStylePack = '';
    /** @type {string} */
    this.aiPrimaryActionMode = '';
    /** @type {boolean} */
    this.aiLayoutLoading = false;
    /** @type {boolean} */
    this.aiAdvancedOpen = false;
    /** @type {string} */
    this._sourceFirstRecoveryKey = '';
    /** @type {{ blockKey: string, relativeTop: number, fallbackScrollTop: number } | null} */
    this.aiLayoutPendingAnchor = null;
  }

}

Object.assign(
  AppleStyleView.prototype,
  coreMethods,
  settingsPanelMethods,
  panelShellMethods,
  stickerPreviewMethods,
  aiLayoutPanelMethods,
  aiLayoutDebugMethods,
  clipboardMethods,
  publishContextMethods,
  wechatPublishMethods,
  materialPickerMethods,
);

export { AppleStyleView };
