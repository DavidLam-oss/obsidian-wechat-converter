/*
## 核心功能

声明转换器视图的 **AI 排版面板**合同（面板渲染、配色/风格包、块级操作与状态恢复）。

## 输入

无运行时输入；由 TypeScript 和 ESLint 在静态分析阶段读取。

## 输出

补充全局 `AppleStyleViewContract`，提供 AI 排版面板域的字段与方法签名。

## 定位

位于项目根目录，是 `project-view-contracts.d.ts` 按域拆出的 AI 面板部分（AI 的调试与动作方法在 `project-view-method-contracts.d.ts`），不参与插件打包或运行。

## 依赖

依赖 `project-types.js` 与 `project-view-contracts.d.ts` 中的全局类型。

## 维护规则

- 只描述现有运行时行为，不在声明文件中定义默认值或业务逻辑。
- 同名 `interface` 跨这些文件由 TypeScript 声明合并成同一个合同，方法顺序无关，移动成员不需改调用方。
- 视图方法签名变化时同步检查方法组合同和对应实现。

 * Split from the 888-line project-view-contracts.d.ts by domain.
 * Interface declaration merging keeps the JSDoc contract runtime-free.
 */

interface AppleStyleViewContract {
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
