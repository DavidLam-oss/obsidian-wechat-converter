/*
## 核心功能

声明转换器视图的状态字段和前半部分方法合同，供 JavaScript/JSDoc 类型检查使用。

## 输入

无运行时输入；由 TypeScript 和 ESLint 在静态分析阶段读取。

## 输出

通过全局 `AppleStyleViewContract` 接口提供视图状态与核心方法签名。

## 定位

位于项目根目录，是视图静态合同的第一部分，不参与插件打包或运行。

## 依赖

依赖 `project-types.js` 中的全局 JSDoc 类型，并与后续方法合同进行接口合并。

## 维护规则

- 只描述现有运行时行为，不在声明文件中定义默认值或业务逻辑。
- 视图方法签名变化时同步检查方法组合同和对应实现。

 * Static contracts recovered from the last pre-split class declarations.
 * This file has no runtime output and exists only for JSDoc type checking.
 */

interface StickerImageItemLike {
    source: 'body' | 'upload' | 'material' | 'render';
    key: string;
    displaySrc?: string;
    name?: string;
    fingerprint?: string;
    uploadRef:
        | { kind: 'src'; src: string }
        | { kind: 'blob'; blob: Blob }
        | { kind: 'media'; mediaId: string; accountId: string };
}

interface StickerUiStateLike {
    order: string[];
    removedKeys: string[];
    manualItems: StickerImageItemLike[];
    undoItems: Array<{ item: StickerImageItemLike; index: number; wasManual: boolean }>;
    objectUrls: Set<string>;
}

/** 微信贴图提取结果：侧边栏预览、发布弹窗与同步动作共用 */
interface StickerPreviewDataLike {
    title: string;
    content: string;
    /** 原始图片地址（用于上传） */
    images: string[];
    imageItems: StickerImageItemLike[];
    /** 可直接显示的图片地址（用于预览缩略图） */
    imageDisplaySources: string[];
    /** 超过公开接口 20 张上限、未进入本次发布列表的图片数量 */
    omittedImageCount: number;
    hasCodeBlocks: boolean;
    hasTables: boolean;
    hasMath: boolean;
    hasFootnotes: boolean;
    removed: Array<{ kind: string; count: number }>;
    sourcePath: string;
}

interface CompiledCustomCssLike {
    sourceIdentity: string;
    sourceHash: string;
    scopedCss: string;
    pseudoRules: Array<{
        baseSelector: string;
        pseudoType: "before" | "after";
        properties: Record<string, string>;
    }>;
    fallbackRules?: Array<{
        selector: string;
        properties: Record<string, string>;
    }>;
    counterConfig: {
        resets: Array<{ selector: string; name: string; value: number }>;
        increments: Array<{ selector: string; name: string; value: number }>;
    };
    matchSelectors: string[];
    diagnostics: Array<{
        severity: "fatal" | "blocked" | "warning" | "info";
        code: string;
        message: string;
        line?: number;
        column?: number;
    }>;
    usable: boolean;
}

interface AppleStyleViewContract extends ItemViewBaseLike {
    /** @type {AppleStylePluginLike} */
    plugin: AppleStylePluginLike;
    /** @type {string | null} */
    currentHtml: string | null;
    /** @type {ConverterRuntimeLike | null} */
    converter: ConverterRuntimeLike | null;
    /** @type {unknown} */
    nativeRenderPipeline: unknown;
    /** @type {ThemeRuntimeLike | null} */
    theme: ThemeRuntimeLike | null;
    /** @type {TFileLike | null} */
    lastActiveFile: TFileLike | null;
    /** @type {string | null} */
    sessionCoverBase64: string | null;
    /** @type {string} */
    sessionThumbMediaId: string;
    /** @type {string} */
    sessionDraftMediaId: string;
    /** @type {number} */
    sessionDraftIndex: number;
    /** @type {string} */
    sessionTitle: string;
    /** @type {string} */
    sessionDigest: string;
    /** @type {Map<string, WechatMaterialCacheEntryLike>} */
    wechatMaterialCache: Map<string, WechatMaterialCacheEntryLike>;
    wechatMaterialCoverAssetCache: Map<string, unknown>;
    /** @type {number | null} */
    scrollSyncFrame: number | null;
    /** @type {(() => void) | null} */
    cancelScrollSyncFrame: (() => void) | null;
    pendingScrollSyncSource: string;
    /** @type {number | null} */
    expectedEditorScrollTop: number | null;
    /** @type {number | null} */
    expectedPreviewScrollTop: number | null;
    /** @type {Map<string, ArticleSessionStateLike>} */
    articleStates: Map<string, ArticleSessionStateLike>;
    /** @type {Map<string, SvgUploadCacheEntry>} */
    svgUploadCache: Map<string, SvgUploadCacheEntry>;
    /** @type {Map<string, string | ImageCacheEntry>} */
    imageUploadCache: Map<string, string | ImageCacheEntry>;
    /** @type {Map<string, string | CoverCacheEntry>} */
    coverUploadCache: Map<string, string | CoverCacheEntry>;
    /** @type {Map<string, unknown>} */
    mermaidImageCache: Map<string, unknown>;
    stickerUiStates: Map<string, StickerUiStateLike>;
    stickerUploadCache: Map<string, string>;
    sessionStickerSourcePath: string;
    stickerModalGeneration: number;
    /** @type {number} */
    renderGeneration: number;
    /** @type {string} */
    lastRenderError: string;
    /** @type {string} */
    lastRenderFailureNoticeKey: string;
    /** @type {number | null} */
    activeLeafRenderTimer: number | null;
    /** @type {number} */
    loadingGeneration: number;
    /** @type {number | null} */
    loadingVisibilityTimer: number | null;
    /** @type {number | null} */
    sidePaddingPreviewTimer: number | null;
    /** @type {number | null} */
    resizeTimeout: number | null;
    /** @type {string} */
    lastResolvedMarkdown: string;
    /** @type {string} */
    lastResolvedSourcePath: string;
    /** @type {string} */
    lastResolvedSourceHash: string;
    /** @type {string} */
    aiLayoutSourceSwitchPath: string;
    /** @type {string} */
    aiLayoutStaleSuppressPath: string;
    /** @type {number} */
    aiLayoutStaleSuppressUntil: number;
    /** @type {number | null} */
    aiLayoutStaleSuppressTimer: number | null;
    /** @type {string | null} */
    baseRenderedHtml: string | null;
    _customCssLastValidBySource: Map<string, CompiledCustomCssLike>;
    customCssRefreshGeneration: number;
    customCssStatus: {
        state: string;
        sourceKind: string;
        sourcePath: string;
        sourceIdentity?: string;
        sourceHash?: string;
        usingLastValid?: boolean;
        diagnostics: Array<{
            severity: "fatal" | "blocked" | "warning" | "info";
            code: string;
            message: string;
            line?: number;
            column?: number;
        }>;
        matchedRuleCount: number;
        matchedElementCount: number;
    };
    /** @type {boolean} */
    aiPreviewApplied: boolean;
    aiLayoutBtn: ObsidianElementLike;
    settingsBtn: ObsidianElementLike;
    aiLayoutDebugMode: string;
    /** @type {Record<string, unknown> | null} */
    aiLayoutActiveGenerationSelection: Record<string, unknown> | null;
    /** @type {ObsidianElementLike | null} */
    previewContainer: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    settingsOverlay: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    settingsArea: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    settingsAdvancedArea: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    settingsAdvancedOptions: ObsidianElementLike | null;
    settingsSpacingGroup: ObsidianElementLike | null;
    settingsSpacingValues: ObsidianElementLike | null;
    spacingSliderRefs: SpacingSliderRefLike[];
    /** @type {ObsidianElementLike | null} */
    activeEditorScroller: ObsidianElementLike | null;
    /** @type {((event: Event) => void) | null} */
    editorScrollListener: ((event: Event) => void) | null;
    /** @type {((event: Event) => void) | null} */
    previewScrollListener: ((event: Event) => void) | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutOverlay: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutArea: ObsidianElementLike | null;
    /** @type {ObsidianInputLike | null} */
    aiLayoutFamilySelect: ObsidianInputLike | null;
    /** @type {ObsidianInputLike | null} */
    aiColorPaletteSelect: ObsidianInputLike | null;
    /** @type {ObsidianInputLike | null} */
    aiStylePackSelect: ObsidianInputLike | null;
    /** @type {ObsidianInputLike | null} */
    aiCustomColorInput: ObsidianInputLike | null;
    /** @type {ObsidianElementLike | null} */
    aiColorPaletteControls: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiColorPaletteGrid: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutStatus: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutStatusBadge: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutStatusBody: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutStatusText: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiCachedLayoutList: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutSummary: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiGenerateBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiRegenerateBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiResetBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiRestoreBlocksBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiResultSection: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutMetaNote: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiBlockList: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiAdvancedToggleBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiAdvancedBody: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutMetaChips: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiSchemaIssuePanel: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiViewJsonBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiViewErrorBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiDebugPanel: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiDebugPanelTitle: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiCopyPromptBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiCopyDebugBtn: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiDebugPanelBody: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutLoadingMask: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutLoadingSpinner: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    aiLayoutLoadingMaskText: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    currentDocLabel: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    docTitleText: ObsidianElementLike | null;
    /** @type {ObsidianElementLike | null} */
    copyBtn: ObsidianElementLike | null;
    /** @type {string} */
    selectedAccountId: string;
    /** @type {boolean} */
    isCopying: boolean;
    /** @type {CaptionToggleStateLike | null} */
    captionToggleState: CaptionToggleStateLike | null;
    /** @type {string} */
    pendingAiLayoutFamily: string;
    /** @type {string} */
    pendingAiColorPalette: string;
    /** @type {string} */
    pendingAiStylePack: string;
    /** @type {string} */
    aiPrimaryActionMode: string;
    /** @type {boolean} */
    aiLayoutLoading: boolean;
    /** @type {boolean} */
    aiAdvancedOpen: boolean;
    /** @type {string} */
    _sourceFirstRecoveryKey: string;
    /** @type {{ blockKey: string, relativeTop: number, fallbackScrollTop: number } | null} */
    aiLayoutPendingAnchor: {
        blockKey: string;
        relativeTop: number;
        fallbackScrollTop: number;
    } | null;
    getViewType(): string;
    getDisplayText(): string;
    getIcon(): string;
    onOpen(): Promise<void>;
    /**
     * 监听活动文件切换
     */
    registerActiveFileChange(): void;
    /**
     * @param {MarkdownViewLike | null} [activeViewOverride]
     */
    scheduleActiveLeafRender(activeViewOverride?: MarkdownViewLike | null): void;
    scheduleSidePaddingPreview(delay?: number): void;
    setPreviewLoading(active: boolean, text?: string): void;
    markAiLayoutSourceSwitch(sourcePath?: string): void;
    completeAiLayoutSourceSwitch(sourcePath?: string): void;
    isAiLayoutStaleSuppressedForPath(sourcePath?: string): boolean;
    /**
     * 注册同步滚动 (双向: Editor <-> Preview)
     * 用动画帧合并高频事件，并按预期目标位置过滤程序触发的回调。
     * @param {MarkdownViewLike | null} activeView
     */
    registerScrollSync(activeView: MarkdownViewLike | null): void;
    /**
     * 加载依赖库
     */
    loadDependencies(): Promise<void>;
    /**
     * 创建设置面板（重构为：顶部工具栏 + 悬浮设置层）
     * @param {ObsidianElementLike} container
     */
    createSettingsPanel(container: ObsidianElementLike): void;
    /** 预览模式：文章排版 / 微信贴图 */
    previewMode: 'article' | 'sticker';
    /** 最近一次贴图提取结果，供发布弹窗与同步动作复用 */
    previewStickerData: StickerPreviewDataLike | null;
    /** 是否在贴图文案中插入 [配图 N] 序号 */
    insertStickerImageIndex: boolean;
    switchPreviewMode(mode: string): void;
    /** 读取/初始化某个笔记的贴图交互状态（排序与排除项） */
    getStickerUiState(filePath: string): StickerUiStateLike;
    removeStickerImageItem(filePath: string, item: StickerImageItemLike, index: number): void;
    restoreLastStickerImage(filePath: string): string;
    restoreAllStickerImages(filePath: string): void;
    /** 把 vault 内图片地址解析成可直接显示的资源地址 */
    resolveStickerImageSrc(src: string, sourcePath: string): string;
    /** 提取当前笔记的贴图数据（标题、文案、图片顺序） */
    buildStickerData(options?: { sourcePath?: string }): Promise<StickerPreviewDataLike>;
    renderStickerPreview(): Promise<ObsidianElementLike | undefined>;
    toggleSettingsPanel(): void;
    saveTimeout: number;
    /**
     * 创建账号选择器
     */
    /**
     * @param {ObsidianElementLike} parent
     */
    createAccountSelector(parent: ObsidianElementLike): void;
    /**
     * 从文章内容中提取第一张图片作为封面
     */
    getFirstImageFromArticle(): string;
    /**
     * 获取当前发布上下文文件：
     * 1) 优先当前活动文件
     * 2) 回退到最近一次活动文件（侧边栏切换 tab 后常见）
     */
    getPublishContextFile(): TFileLike;
    /**
     * 读取当前文档 frontmatter 中的发布元数据
     * @returns {{ excerpt: string, cover: string, cover_dir: string, coverSrc: string|null, title: string }}
     */
    /**
     * @param {unknown} activeFile
     * @returns {{ excerpt: string, cover: string, cover_dir: string, coverSrc: string|null, title: string }}
     */
    getFrontmatterPublishMeta(activeFile: unknown): {
        excerpt: string;
        cover: string;
        cover_dir: string;
        coverSrc: string | null;
        title: string;
    };
    /**
     * @param {Record<string, unknown> | null | undefined} frontmatter
     * @param {string[]} keys
     * @returns {string}
     */
    getFrontmatterString(frontmatter: Record<string, unknown> | null | undefined, keys: string[]): string;
    /**
     * @param {unknown} key
     * @returns {string}
     */
    normalizeFrontmatterKey(key: unknown): string;
    /**
     * @param {Record<string, unknown> | null | undefined} frontmatter
     * @param {string[]} keys
     * @returns {Record<string, string>}
     */
    getFrontmatterKeyMap(frontmatter: Record<string, unknown> | null | undefined, keys: string[]): Record<string, string>;
    isPathInsideDirectory(filePath: string, dirPath: string): boolean;
    isPathInsideDirectoryByTail(filePath: string, dirPath: string): boolean;
    shouldClearFrontmatterPathAfterCleanup(pathValue: string, cleanedDir: string): boolean;
    /**
     * @param {Record<string, unknown> | null | undefined} frontmatter
     * @param {string} cleanedDir
     * @returns {boolean}
     */
    clearInvalidPublishMetaInFrontmatter(frontmatter: Record<string, unknown> | null | undefined, cleanedDir: string): boolean;
    clearInvalidPublishMetaByTextFallback(activeFile: TFileLike | null | undefined, cleanedDir: string): Promise<boolean>;
    clearInvalidPublishMetaAfterCleanup(activeFile: TFileLike | null | undefined, cleanedDirPath: string): Promise<string>;
    /**
     * 将 vault 相对路径解析为可预览/上传的资源 src（通常是 app://）
     */
    resolveVaultPathToResourceSrc(vaultPath: unknown): string | null;
    normalizeVaultPath(vaultPath: unknown): string;
    getVaultConfigDir(): string;
    getCleanupDirTemplate(): string;
    /**
     * @param {TFileLike | null | undefined} activeFile
     * @returns {{ path: string, warning?: string }}
     */
    resolveCleanupDirPath(activeFile: TFileLike | null | undefined): {
        path: string;
        warning?: string;
    };
    /**
     * 清理目录安全校验：禁止空路径、上跳路径、系统配置目录等危险路径
     */
    isSafeCleanupDirPath(vaultPath: string): boolean;
    /**
     * 在同步成功后按配置清理目录
     * 失败返回 warning，不抛错（避免影响同步成功状态）
     * @param {TFileLike | null | undefined} activeFile
     * @returns {Promise<CleanupResultLike>}
     */
    cleanupConfiguredDirectory(activeFile: TFileLike | null | undefined): Promise<CleanupResultLike>;
    /**
     * 创建设置区块
     * @param {ObsidianElementLike} parent
     * @param {string} label
     * @param {(content: ObsidianElementLike) => unknown} builder
     * @returns {ObsidianElementLike}
     */
    createSection(parent: ObsidianElementLike, label: string, builder: (content: ObsidianElementLike) => unknown): ObsidianElementLike;
    getEffectiveLineHeight(): number;
    getEffectiveParagraphGap(): number;
    getEffectiveLetterSpacing(): number;
    getThemeConfigSafe(): ThemeConfigLike | null;
    formatSpacingValue(value: unknown): string;
    updateSpacingSummary(): void;
    refreshSpacingSliders(): void;
    resetSettingsPanelViewState(): void;
    resetAiLayoutPanelViewState(): void;
    /**
     * @param {ObsidianElementLike | null} overlay
     * @param {ObsidianElementLike | null} button
     * @param {(() => unknown) | undefined} onOpen
     */
    /**
     * @param {ObsidianElementLike | null} overlay
     * @param {ObsidianElementLike | null} button
     * @param {(() => unknown) | undefined} [onOpen]
     */
    togglePanel(overlay: ObsidianElementLike | null, button: ObsidianElementLike | null, onOpen?: () => unknown): void;
    /**
     * @param {Element | null} element
     * @param {number} deltaY
     * @returns {boolean}
     */
    canScrollElementInDirection(element: Element | null, deltaY: number): boolean;
    /**
     * @param {ObsidianElementLike | null} overlay
     * @param {string[]} [nestedSelectors]
     */
    attachOverlayScrollGuard(overlay: ObsidianElementLike | null, nestedSelectors?: string[]): void;
    closeTransientPanels(): void;
    /**
     * @returns {AiLayoutStateLike | null}
     */
    getCurrentArticleAnyLayoutState(): AiLayoutStateLike | null;
    hasCurrentArticleAiLayoutCache(): boolean;
    updateAiToolbarState(): void;
    onAiLayoutButtonClick(): void;
    /**
     * @param {ObsidianElementLike} parent
     */
    createAiLayoutPanel(parent: ObsidianElementLike): void;
    /**
     * @returns {string}
     */
    getAiCustomColor(): string;
    /**
     * @param {string} [colorPaletteId]
     * @returns {{ customColor: string } | null}
     */
    getAiColorPaletteOverride(colorPaletteId?: string): {
        customColor: string;
    } | null;
    /**
     * @param {string} [colorPaletteId]
     * @returns {Record<string, unknown>}
     */
    getAiRenderColorPalette(colorPaletteId?: string): Record<string, unknown>;
    updateAiColorPaletteControls(): void;
    /**
     * @param {AiLayoutJsonLike | null} [layoutJson]
     * @param {string} [colorPaletteId]
     * @returns {AiLayoutJsonLike | null}
     */
    getAiRenderLayoutJson(layoutJson?: AiLayoutJsonLike | null, colorPaletteId?: string): AiLayoutJsonLike | null;
    /**
     * @param {string} value
     * @param {{ skipSave?: boolean }} [options]
     */
    onAiColorPaletteChange(value: string, { skipSave }?: {
        skipSave?: boolean;
    }): Promise<void>;
    /**
     * @param {string} value
     */
    onAiLayoutFamilyChange(value: string): Promise<void>;
    /**
     * @param {string} colorPaletteId
     */
    applyAiLayoutPanelStylePack(colorPaletteId: string): void;
    /**
     * @param {AiLayoutBlockLike | unknown} [block]
     * @param {number} [index]
     * @returns {string}
     */
    getAiLayoutBlockStateKey(block?: unknown, index?: number): string;
    /**
     * @param {AiLayoutStateLike | null} state
     * @returns {VisibleAiLayoutSnapshotLike}
     */
    getVisibleAiLayoutSnapshot(state: AiLayoutStateLike | null): VisibleAiLayoutSnapshotLike;
    /**
     * @param {number} originalIndex
     * @param {HTMLElement | ObsidianElementLike | null} [itemEl]
     */
    queueAiLayoutRemovalAnchor(originalIndex: number, itemEl?: HTMLElement | ObsidianElementLike | null): void;
    restoreAiLayoutPendingAnchor(): void;
    /**
     * @param {number} originalIndex
     * @param {HTMLElement | ObsidianElementLike | null} [itemEl]
     */
    removeAiLayoutBlock(originalIndex: number, itemEl?: HTMLElement | ObsidianElementLike | null): Promise<void>;
    restoreRemovedAiLayoutBlocks(): Promise<void>;
    handleAiPrimaryAction(): Promise<void>;
    /**
     * @param {string} mode
     */
    toggleAiLayoutDebugMode(mode: string): void;
    /**
     * @returns {AiLayoutContextLike}
     */
    getCurrentLayoutContext(): AiLayoutContextLike;
    /**
     * @returns {AiLayoutSelectionLike}
     */
    getCurrentAiLayoutSelection(): AiLayoutSelectionLike;
    /**
     * @returns {AiLayoutStateLike | null}
     */
    getCurrentArticleLayoutState(): AiLayoutStateLike | null;
    /**
     * @param {string} [sourcePath]
     * @param {AiLayoutSelectionLike | Record<string, unknown>} [selection]
     * @param {AiLayoutStateLike | null} [candidateState]
     * @param {string} [sourceHash]
     * @returns {AiLayoutStateLike | null}
     */
    preferFreshAiLayoutState(sourcePath?: string, selection?: AiLayoutSelectionLike | Record<string, unknown>, candidateState?: AiLayoutStateLike | null, sourceHash?: string): AiLayoutStateLike | null;
    /**
     * @param {AiLayoutStateLike | null} [currentState]
     * @param {AiLayoutSelectionLike | null} [selection]
     * @param {AiLayoutContextLike | null} [context]
     * @returns {Promise<AiLayoutJsonLike | null>}
     */
    recoverSourceFirstLayoutState(currentState?: AiLayoutStateLike | null, selection?: AiLayoutSelectionLike | null, context?: AiLayoutContextLike | null): Promise<AiLayoutJsonLike | null>;
    /**
     * @param {AiLayoutStateLike | null} [baseState]
     * @param {AiLayoutSelectionLike | null} [selection]
     * @returns {Promise<AiLayoutStateLike | null>}
     */
    ensureAiLayoutSelectionState(baseState?: AiLayoutStateLike | null, selection?: AiLayoutSelectionLike | null): Promise<AiLayoutStateLike | null>;
    isAiLayoutPanelVisible(): boolean;
    shouldSyncAiLayoutUi(): boolean;
    /**
     * @param {AiLayoutStateLike | null} state
     * @param {AiSettingsLike | null | undefined} aiSettings
     * @returns {string}
     */
    getArticleLayoutProviderLabel(state: AiLayoutStateLike | null, aiSettings: AiSettingsLike | null | undefined): string;
    /**
     * @param {AiLayoutStateLike | null} state
     * @param {AiSettingsLike | null | undefined} aiSettings
     * @returns {string}
     */
    getArticleLayoutModelLabel(state: AiLayoutStateLike | null, aiSettings: AiSettingsLike | null | undefined): string;
    /**
     * @param {AiLayoutBlockLike | unknown} block
     * @returns {string}
     */
    getAiLayoutBlockLabel(block: unknown): string;
    /**
     * @param {string} value
     * @returns {string}
     */
    getAiLayoutFamilyLabel(value: string): string;
    /**
     * @param {string} value
     * @returns {string}
     */
    getAiColorPaletteLabel(value: string): string;
    /**
     * @param {AiLayoutStateLike | null} state
     * @returns {AiSchemaValidationLike | null}
     */
    getVisibleAiSchemaValidation(state: AiLayoutStateLike | null): AiSchemaValidationLike | null;
    /**
     * @param {string[]} [chips]
     */
    renderAiLayoutMetaChips(chips?: string[]): void;
    /**
     * @returns {{ familyStates?: Record<string, AiLayoutStateLike>, lastLayoutFamily?: string } | null}
     */
    getCurrentArticleLayoutCacheEntry(): {
        familyStates?: Record<string, AiLayoutStateLike>;
        lastLayoutFamily?: string;
    } | null;
    /**
     * @param {AiLayoutContextLike} [context]
     * @returns {{ layoutFamily: string, state: AiLayoutStateLike, label: string, isCurrentContent: boolean, isStaleContent: boolean, fromAuto: boolean, updatedAt: number }[]}
     */
    getCachedAiLayoutFamilyItems(context?: AiLayoutContextLike): {
        layoutFamily: string;
        state: AiLayoutStateLike;
        label: string;
        isCurrentContent: boolean;
        isStaleContent: boolean;
        fromAuto: boolean;
        updatedAt: number;
    }[];
    /**
     * @param {{ context?: AiLayoutContextLike, currentLayoutFamily?: string, isLoading?: boolean }} [options]
     */
    renderAiCachedLayoutFamilies({ context, currentLayoutFamily, isLoading }?: {
        context?: AiLayoutContextLike;
        currentLayoutFamily?: string;
        isLoading?: boolean;
    }): void;
    /**
     * @param {string} [layoutFamily]
     */
    previewCachedAiLayoutFamily(layoutFamily?: string): void;
    /**
     * @param {{ hasDoc: boolean, aiFeatureEnabled: boolean, canGenerateForSelection: boolean, state: AiLayoutStateLike | null, visibleLayout: AiLayoutJsonLike | null, hasReusableLayout: boolean, hasLastAttemptFailure: boolean, hasApplied: boolean, isStale: boolean, isLoading: boolean }} options
     * @returns {{ mode: string, label: string, disabled: boolean }}
     */
    getAiPrimaryActionConfig({ hasDoc, aiFeatureEnabled, canGenerateForSelection, state, visibleLayout, hasReusableLayout, hasLastAttemptFailure, hasApplied, isStale, isLoading, }: {
        hasDoc: boolean;
        aiFeatureEnabled: boolean;
        canGenerateForSelection: boolean;
        state: AiLayoutStateLike | null;
        visibleLayout: AiLayoutJsonLike | null;
        hasReusableLayout: boolean;
        hasLastAttemptFailure: boolean;
        hasApplied: boolean;
        isStale: boolean;
        isLoading: boolean;
    }): {
        mode: string;
        label: string;
        disabled: boolean;
    };
    /**
     * @param {AiSchemaValidationLike | null} [schemaValidation]
     */
    refreshAiSchemaIssuePanel(schemaValidation?: AiSchemaValidationLike | null): void;
}
