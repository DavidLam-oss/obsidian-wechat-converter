/*
## 核心功能

从视图合同中选择各拆分模块拥有的方法签名，为方法对象提供静态上下文类型。

## 输入

无运行时输入；静态分析阶段读取视图合同和微信 API 类签名。

## 输出

提供 converter、publish modal 和 settings 各方法组的全局类型别名。

## 定位

位于项目根目录，连接拆分后的视图模块与全局静态合同，不参与插件运行。

## 依赖

依赖 `AppleStyleViewContract`、`AppleStyleSettingTabContract` 和 `services/wechat-api.js` 的类型。

## 维护规则

- 方法移动或改名时同步更新对应 `Pick` 列表。
- 不添加运行时 import、默认值或业务分支。

 * Method-group contracts generated from the current split module exports.
 * They select signatures from the last pre-split class contracts.
 */

type WechatApiContract = InstanceType<typeof import('./services/wechat-api.js').WechatAPI>;

type AiLayoutDebugMethodsContract = Pick<
    AppleStyleViewContract,
    | 'buildAiLayoutDebugJson'
    | 'buildAiLayoutErrorDetails'
    | 'buildAiLayoutDebugSnapshot'
    | 'truncateAiPromptMarkdown'
    | 'buildAiLayoutPromptContext'
    | 'copyPlainTextSnapshot'
    | 'copyAiLayoutDebugSnapshot'
    | 'copyAiLayoutPromptContext'
    | 'refreshAiLayoutDebugPanel'
    | 'refreshAiLayoutPanel'
    | 'ensureCurrentArticleContext'
    | 'generateAiLayoutForCurrentArticle'
    | 'applyAiLayoutToPreview'
>;

type AiLayoutPanelMethodsContract = Pick<
    AppleStyleViewContract,
    | 'getCurrentArticleAnyLayoutState'
    | 'hasCurrentArticleAiLayoutCache'
    | 'updateAiToolbarState'
    | 'onAiLayoutButtonClick'
    | 'createAiLayoutPanel'
    | 'getAiCustomColor'
    | 'getAiColorPaletteOverride'
    | 'getAiRenderColorPalette'
    | 'updateAiColorPaletteControls'
    | 'getAiRenderLayoutJson'
    | 'onAiColorPaletteChange'
    | 'onAiLayoutFamilyChange'
    | 'applyAiLayoutPanelStylePack'
    | 'getAiLayoutBlockStateKey'
    | 'getVisibleAiLayoutSnapshot'
    | 'queueAiLayoutRemovalAnchor'
    | 'restoreAiLayoutPendingAnchor'
    | 'removeAiLayoutBlock'
    | 'restoreRemovedAiLayoutBlocks'
    | 'handleAiPrimaryAction'
    | 'toggleAiLayoutDebugMode'
    | 'getCurrentLayoutContext'
    | 'getCurrentAiLayoutSelection'
    | 'getCurrentArticleLayoutState'
    | 'preferFreshAiLayoutState'
    | 'recoverSourceFirstLayoutState'
    | 'ensureAiLayoutSelectionState'
    | 'isAiLayoutPanelVisible'
    | 'shouldSyncAiLayoutUi'
    | 'getArticleLayoutProviderLabel'
    | 'getArticleLayoutModelLabel'
    | 'getAiLayoutBlockLabel'
    | 'getAiLayoutFamilyLabel'
    | 'getAiColorPaletteLabel'
    | 'getVisibleAiSchemaValidation'
    | 'renderAiLayoutMetaChips'
    | 'getCurrentArticleLayoutCacheEntry'
    | 'getCachedAiLayoutFamilyItems'
    | 'renderAiCachedLayoutFamilies'
    | 'previewCachedAiLayoutFamily'
    | 'getAiPrimaryActionConfig'
    | 'refreshAiSchemaIssuePanel'
>;

type ClipboardMethodsContract = Pick<
    AppleStyleViewContract,
    | 'resolveLocalImageFileForUpload'
    | 'vaultFileToBlob'
    | 'srcToBlob'
    | 'processAllImages'
    | 'processMathFormulas'
    | 'svgToPngBlob'
    | 'cleanHtmlForDraft'
    | 'renderHTML'
    | 'copyRichHTMLByClipboard'
    | 'normalizeClipboardText'
    | 'setCopyButtonIcon'
    | 'setCopyButtonSpinner'
    | 'enhanceHtmlForWechatPublishing'
    | 'prepareHtmlForWechatDraft'
    | 'prepareHtmlForWechatsyncArticle'
    | 'prepareHtmlForWechatsyncArticleViaBridge'
    | 'generateCoverThumbnailFromAsset'
    | 'extractCodeTextForWechatsync'
    | 'transformCodeBlocksForWechatsync'
    | 'transformCodeBlocksForClipboard'
    | 'readClipboardTextSnapshot'
    | 'copyHTML'
    | 'processImagesToDataURL'
    | 'convertImageToLocally'
    | 'blobToDataUrl'
    | 'blobToJpegDataUrl'
>;

type CoreMethodsContract = Pick<
    AppleStyleViewContract,
    | 'getViewType'
    | 'getDisplayText'
    | 'getIcon'
    | 'onOpen'
    | 'registerActiveFileChange'
    | 'scheduleActiveLeafRender'
    | 'scheduleSidePaddingPreview'
    | 'setPreviewLoading'
    | 'markAiLayoutSourceSwitch'
    | 'completeAiLayoutSourceSwitch'
    | 'isAiLayoutStaleSuppressedForPath'
    | 'registerScrollSync'
    | 'loadDependencies'
    | 'onThemeChange'
    | 'onFontFamilyChange'
    | 'onFontSizeChange'
    | 'onColorChange'
    | 'onQuoteCalloutStyleModeChange'
    | 'onMacCodeBlockChange'
    | 'onCodeLineNumberChange'
    | 'updateButtonActive'
    | 'getActiveRenderPipeline'
    | 'renderMarkdownForPreview'
    | 'applyCustomCss'
    | 'updateCurrentDoc'
    | 'setPlaceholder'
    | 'renderPlaceholderIcon'
    | 'showRenderFailurePlaceholder'
    | 'getMissingRenderNotice'
    | 'convertCurrent'
    | 'onResize'
    | 'onClose'
    | 'simpleHash'
>;

type SettingsPanelMethodsContract = Pick<
    AppleStyleViewContract,
    | 'createSettingsPanel'
    | 'createSection'
    | 'getEffectiveLineHeight'
    | 'getEffectiveParagraphGap'
    | 'getEffectiveLetterSpacing'
    | 'getThemeConfigSafe'
    | 'formatSpacingValue'
    | 'updateSpacingSummary'
    | 'refreshSpacingSliders'
>;

type PanelShellMethodsContract = Pick<
    AppleStyleViewContract,
    | 'resetSettingsPanelViewState'
    | 'resetAiLayoutPanelViewState'
    | 'togglePanel'
    | 'canScrollElementInDirection'
    | 'attachOverlayScrollGuard'
    | 'closeTransientPanels'
    | 'toggleSettingsPanel'
    | 'switchPreviewMode'
>;

type StickerPreviewMethodsContract = Pick<
    AppleStyleViewContract,
    | 'getStickerUiState'
    | 'removeStickerImageItem'
    | 'restoreLastStickerImage'
    | 'restoreAllStickerImages'
    | 'resolveStickerImageSrc'
    | 'buildStickerData'
    | 'renderStickerPreview'
>;

type PublishContextMethodsContract = Pick<
    AppleStyleViewContract,
    | 'createAccountSelector'
    | 'getFirstImageFromArticle'
    | 'getPublishContextFile'
    | 'getFrontmatterPublishMeta'
    | 'getFrontmatterString'
    | 'normalizeFrontmatterKey'
    | 'getFrontmatterKeyMap'
    | 'isPathInsideDirectory'
    | 'isPathInsideDirectoryByTail'
    | 'shouldClearFrontmatterPathAfterCleanup'
    | 'clearInvalidPublishMetaInFrontmatter'
    | 'clearInvalidPublishMetaByTextFallback'
    | 'clearInvalidPublishMetaAfterCleanup'
    | 'resolveVaultPathToResourceSrc'
    | 'normalizeVaultPath'
    | 'getVaultConfigDir'
    | 'getCleanupDirTemplate'
    | 'resolveCleanupDirPath'
    | 'isSafeCleanupDirPath'
    | 'cleanupConfiguredDirectory'
>;

type MaterialPickerMethodsContract = Pick<
    AppleStyleViewContract,
    | 'getWechatMaterialCacheKey'
    | 'loadWechatMaterialPage'
    | 'showMaterialPickerModal'
>;

type WechatAccountStateMethodsContract = Pick<
    AppleStyleViewContract,
    | 'showAccountSetupEmptyState'
    | 'showSyncFailureActions'
    | 'promptConfigureWechatAccount'
>;

type WechatModalShellMethodsContract = Pick<
    AppleStyleViewContract,
    | 'preparePublishModalShell'
    | 'createPublishModeTabs'
>;

type WechatMultiPlatformActionMethodsContract = Pick<
    AppleStyleViewContract,
    | 'openWechatsyncTask'
    | 'getWechatsyncTaskSnapshot'
    | 'showWechatsyncEnqueueAcceptedModal'
    | 'showMultiPlatformQuotaBlockedModal'
    | 'showMultiPlatformSyncResultModal'
    | 'showMultiPlatformSyncModal'
    | 'showFeishuSyncModal'
>;

type WechatPreviewExportMethodsContract = Pick<
    AppleStyleViewContract,
    | 'getCurrentExportHtml'
    | 'restoreBasePreview'
    | 'syncPreviewPresentationMode'
    | 'openPluginSettings'
    | 'openExternalUrl'
    | 'openPublisherProPage'
    | 'openPublisherGuidePage'
>;

type WechatSyncActionMethodsContract = Pick<
    AppleStyleViewContract,
    | 'onSyncToWechat'
    | 'onSyncStickerToWechat'
>;

type WechatSyncModalMethodsContract = Pick<
    AppleStyleViewContract,
    | 'showSyncModal'
>;

type AiSettingsMethodsContract = Pick<
    AppleStyleSettingTabContract,
    | 'renderAiSettingsSection'
    | 'showEditAiProviderModal'
>;

type ConfirmModalMethodsContract = Pick<
    AppleStyleSettingTabContract,
    | 'confirmDestructiveAction'
>;

type SettingsTabShellMethodsContract = Pick<
    AppleStyleSettingTabContract,
    | 'getSettingDefinitions'
    | 'renderGitHubStarBanner'
    | 'renderSettingsTabIntro'
    | 'renderSettingsContent'
>;

type WechatAccountModalMethodsContract = Pick<
    AppleStyleSettingTabContract,
    | 'showEditAccountModal'
>;

type WechatSettingsMethodsContract = Pick<
    AppleStyleSettingTabContract,
    | 'renderWechatSettingsTab'
    | 'renderCustomCssSection'
>;
