/*
## 核心功能

声明转换器视图的**状态字段、生命周期与设置面板外壳**合同，供 JavaScript/JSDoc 类型检查使用。

## 输入

无运行时输入；由 TypeScript 和 ESLint 在静态分析阶段读取。

## 输出

通过全局 `AppleStyleViewContract` 接口提供视图状态与核心方法签名，并提供 `CompiledCustomCssLike`。

## 定位

位于项目根目录，是视图静态合同的主文件，不参与插件打包或运行。

## 依赖

依赖 `project-types.js` 中的全局 JSDoc 类型；与 `project-view-contracts-{card,publish,ai}.d.ts`、`project-view-method-contracts.d.ts` 接口合并。

## 维护规则

- 只描述现有运行时行为，不在声明文件中定义默认值或业务逻辑。
- 同名 `interface` 跨这些文件由 TypeScript 声明合并成同一个合同，方法顺序无关，移动成员不需改调用方。
- 视图方法签名变化时同步检查方法组合同和对应实现。

 * Split from the 888-line project-view-contracts.d.ts by domain.
 * Interface declaration merging keeps the JSDoc contract runtime-free.
 */

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
     * @param {MarkdownViewLike | null | undefined} [activeViewOverride]
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
    /** 预览模式：文章排版 / 微信贴图 / 图片卡片 */
    previewMode: 'article' | 'sticker' | 'card';
    /** 最近一次贴图提取结果，供发布弹窗与同步动作复用 */
    previewStickerData: StickerPreviewDataLike | null;
    /** 是否在贴图文案中插入 [配图 N] 序号 */
    insertStickerImageIndex: boolean;
    switchPreviewMode(mode: string): void;
    /**
     * 模式渲染的兜底观察器：拒绝时在预览区显示可见错误面板，超时未落地同样提示。
     * @param {string} label 模式名（用于错误文案）
     * @param {unknown} renderPromise 模式渲染 promise
     * @param {number} timeoutMs 看门狗超时毫秒数
     */
    runModeRenderWithDiagnostics(label: string, renderPromise: unknown, timeoutMs: number): void;
    /**
     * 在预览区渲染可见的错误面板（诊断用，不影响导出链路）。
     * @param {string} label 模式名
     * @param {Error} error 渲染错误
     */
    showModeRenderFailure(label: string, error: Error): void;
    toggleSettingsPanel(): void;
    saveTimeout: number;
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
}
