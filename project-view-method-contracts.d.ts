/*
## 核心功能

声明转换器视图的后半部分方法及设置页合同，供 JavaScript/JSDoc 类型检查使用。

## 输入

无运行时输入；由 TypeScript 和 ESLint 在静态分析阶段读取。

## 输出

补充全局 `AppleStyleViewContract`，并提供 `AppleStyleSettingTabContract`。

## 定位

位于项目根目录，是视图静态合同的第二部分，不参与插件打包或运行。

## 依赖

依赖 `project-types.js` 与 `project-view-contracts.d.ts` 中的全局类型和接口合并。

## 维护规则

- 只描述现有运行时行为，不在声明文件中定义默认值或业务逻辑。
- 保持与视图实现及方法组合同的签名一致。

 * Static method contracts split from project-view-contracts.d.ts.
 * Interface declaration merging keeps the JSDoc contract runtime-free.
 */

interface AppleStyleViewContract {
    /**
     * @param {AiLayoutStateLike | null} state
     * @returns {string}
     */
    buildAiLayoutDebugJson(state: AiLayoutStateLike | null): string;
    /**
     * @param {{ state: AiLayoutStateLike | null, providerLabel?: string, modelLabel?: string, isStale?: boolean }} options
     * @returns {string}
     */
    buildAiLayoutErrorDetails({ state, providerLabel, modelLabel, isStale }: {
        state: AiLayoutStateLike | null;
        providerLabel?: string;
        modelLabel?: string;
        isStale?: boolean;
    }): string;
    /**
     * @param {{ mode?: string, state: AiLayoutStateLike | null, providerLabel?: string, modelLabel?: string, isStale?: boolean, sourcePath?: string }} options
     * @returns {string}
     */
    buildAiLayoutDebugSnapshot({ mode, state, providerLabel, modelLabel, isStale, sourcePath }: {
        mode?: string;
        state: AiLayoutStateLike | null;
        providerLabel?: string;
        modelLabel?: string;
        isStale?: boolean;
        sourcePath?: string;
    }): string;
    truncateAiPromptMarkdown(markdown: any, maxLength?: number): string;
    /**
     * @param {{ state: AiLayoutStateLike | null, context: AiLayoutContextLike, providerLabel?: string, modelLabel?: string, isStale?: boolean }} options
     * @returns {string}
     */
    buildAiLayoutPromptContext({ state, context, providerLabel, modelLabel, isStale }: {
        state: AiLayoutStateLike | null;
        context: AiLayoutContextLike;
        providerLabel?: string;
        modelLabel?: string;
        isStale?: boolean;
    }): string;
    /**
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    copyPlainTextSnapshot(text: string): Promise<boolean>;
    copyAiLayoutDebugSnapshot(): Promise<void>;
    copyAiLayoutPromptContext(): Promise<void>;
    /**
     * @param {{ state: AiLayoutStateLike | null, providerLabel?: string, modelLabel?: string, isStale?: boolean }} options
     */
    refreshAiLayoutDebugPanel({ state, providerLabel, modelLabel, isStale }: {
        state: AiLayoutStateLike | null;
        providerLabel?: string;
        modelLabel?: string;
        isStale?: boolean;
    }): void;
    refreshAiLayoutPanel(): void;
    ensureCurrentArticleContext(): Promise<{
        markdown: string;
        sourcePath: string;
        sourceHash: string;
        title: string;
    }>;
    generateAiLayoutForCurrentArticle({ applyAfterGenerate }?: {
        applyAfterGenerate?: boolean;
    }): Promise<void>;
    /**
     * @param {{ stateOverride?: AiLayoutStateLike | null, allowStale?: boolean }} [options]
     */
    applyAiLayoutToPreview({ stateOverride, allowStale }?: {
        stateOverride?: AiLayoutStateLike | null;
        allowStale?: boolean;
    }): void;
    getCurrentExportHtml(): string;
    restoreBasePreview(): void;
    syncPreviewPresentationMode(): void;
    /**
     * @returns {boolean}
     */
    openPluginSettings(): boolean;
    /**
     * @param {string} url
     * @param {{ allowExtensionUrls?: boolean }} [options]
     * @returns {boolean}
     */
    openExternalUrl(url: string, options?: {
        allowExtensionUrls?: boolean;
    }): boolean;
    openPublisherProPage(): boolean;
    openPublisherGuidePage(section?: string): boolean;
    showAccountSetupEmptyState(): void;
    /**
     * @param {string} message
     * @param {SyncModalOptionsLike} [options]
     */
    showSyncFailureActions(message: string, options?: SyncModalOptionsLike): void;
    /**
     * 提示用户先配置公众号账号（空状态 + 引导操作）
     */
    promptConfigureWechatAccount(): void;
    /**
     * 显示同步选项 Modal
     */
    /**
     * @param {ModalLike} modal
     * @param {{ mode?: string, mobileSync?: boolean }} [options]
     */
    preparePublishModalShell(modal: ModalLike, { mode, mobileSync }?: {
        mode?: string;
        mobileSync?: boolean;
    }): void;
    /**
     * @param {ModalLike} modal
     * @param {string} [activeMode]
     * @returns {{ wechatTab: ObsidianElementLike, multiPlatformTab: ObsidianElementLike }}
     */
    createPublishModeTabs(modal: ModalLike, activeMode?: string): {
        wechatTab: ObsidianElementLike;
        multiPlatformTab: ObsidianElementLike;
    };
    /**
     * @param {SyncModalOptionsLike} [options]
     */
    showSyncModal(options?: SyncModalOptionsLike): void;
    /**
     * @param {WechatAPI} api
     * @param {string} type
     * @param {number} offset
     * @param {number} count
     * @returns {string}
     */
    getWechatMaterialCacheKey(api: WechatApiContract, type: string, offset: number, count: number): string;
    /**
     * @param {WechatAPI} api
     * @param {string} type
     * @param {number} offset
     * @param {number} count
     * @param {{ forceRefresh?: boolean, ttlMs?: number }} [options]
     * @returns {Promise<WechatMaterialPageLike>}
     */
    loadWechatMaterialPage(api: WechatApiContract, type: string, offset: number, count: number, options?: {
        forceRefresh?: boolean;
        ttlMs?: number;
    }): Promise<WechatMaterialPageLike>;
    /**
     * @param {WechatAPI} api
     * @param {(material: WechatMaterialSelectionLike) => unknown} onSelect
     */
    showMaterialPickerModal(api: WechatApiContract, onSelect: (material: WechatMaterialSelectionLike) => unknown): Promise<void>;
    /**
     * @param {unknown} syncId
     * @returns {Promise<boolean>}
     */
    openWechatsyncTask(syncId: unknown): Promise<boolean>;
    /**
     * @param {WechatSyncBridgeServiceLike} bridge
     * @param {unknown} syncId
     * @returns {Promise<WechatsyncTaskSnapshotLike | null>}
     */
    getWechatsyncTaskSnapshot(bridge: WechatSyncBridgeServiceLike, syncId: unknown): Promise<WechatsyncTaskSnapshotLike | null>;
    /**
     * @param {{ syncId?: string, title?: string, platforms?: unknown[], task?: WechatsyncTaskSnapshotLike | null, usedFallbackSend?: boolean, quotaResult?: WechatsyncQuotaResultLike | null }} [options]
     */
    showWechatsyncEnqueueAcceptedModal({ syncId, title, platforms, task, usedFallbackSend, quotaResult, }?: {
        syncId?: string;
        title?: string;
        platforms?: unknown[];
        task?: WechatsyncTaskSnapshotLike | null;
        usedFallbackSend?: boolean;
        quotaResult?: WechatsyncQuotaResultLike | null;
    }): void;
    /**
     * @param {{ quotaResult?: WechatsyncQuotaResultLike, requestedPlatformIds?: unknown[] }} [options]
     */
    showMultiPlatformQuotaBlockedModal({ quotaResult, requestedPlatformIds }?: {
        quotaResult?: WechatsyncQuotaResultLike;
        requestedPlatformIds?: unknown[];
    }): void;
    /**
     * @param {{ results?: WechatsyncPlatformResultLike[], requestedPlatformIds?: unknown[], fatalError?: ReadableErrorLike | null }} [options]
     */
    showMultiPlatformSyncResultModal({ results, requestedPlatformIds, fatalError }?: {
        results?: WechatsyncPlatformResultLike[];
        requestedPlatformIds?: unknown[];
        fatalError?: ReadableErrorLike | null;
    }): void;
    /**
     * @param {Record<string, unknown>} [options]
     * @returns {Promise<unknown>}
     */
    showMultiPlatformSyncModal(options?: Record<string, unknown>): Promise<unknown>;
    /**
     * @param {{ modal?: ModalLike }} [options]
     */
    showFeishuSyncModal(options?: {
        modal?: ModalLike;
    }): void;
    /**
     * 处理同步到微信逻辑
     */
    onSyncToWechat(): Promise<void>;
    /**
     * @param {string} src
     * @returns {unknown | null}
     */
    resolveLocalImageFileForUpload(src: string): unknown | null;
    /**
     * @param {unknown} file
     * @returns {Promise<Blob>}
     */
    vaultFileToBlob(file: unknown): Promise<Blob>;
    /**
     * 将各种形式的 src (Base64, URL, 路径) 转为 Blob
     */
    /**
     * @param {string} src
     * @returns {Promise<Blob>}
     */
    srcToBlob(src: string): Promise<Blob>;
    /**
     * 处理 HTML 中的所有图片，上传到微信并替换链接
     * 支持并发上传 (Limit 3) 和进度回调
     */
    /**
     * @param {string} html
     * @param {WechatAPI} api
     * @param {((current: number, total: number) => unknown) | undefined} progressCallback
     * @param {{ accountId?: string, onImageFailure?: (failure: ImageUploadFailureLike) => unknown }} [cacheContext]
     * @returns {Promise<string>}
     */
    processAllImages(html: string, api: WechatApiContract, progressCallback: ((current: number, total: number) => unknown) | undefined, cacheContext?: {
        accountId?: string;
        onImageFailure?: (failure: ImageUploadFailureLike) => unknown;
    }): Promise<string>;
    /**
     * 处理 HTML 中的数学公式 (MathJax SVG -> Wechat Image)
     * 解决微信接口内容长度限制问题
     */
    /**
     * @param {string} html
     * @param {WechatAPI} api
     * @param {((current: number, total: number) => unknown) | undefined} progressCallback
     * @returns {Promise<string>}
     */
    processMathFormulas(html: string, api: WechatApiContract, progressCallback: ((current: number, total: number) => unknown) | undefined): Promise<string>;
    /**
     * 将 SVG 元素转换为高分辨率 PNG Blob
     * 返回: { blob, width, height, style }
     */
    /**
     * @param {SVGElement} svgElement
     * @param {number} [scale]
     * @returns {Promise<{ blob: Blob, width: number, height: number, style?: string }>}
     */
    svgToPngBlob(svgElement: SVGElement, scale?: number): Promise<{
        blob: Blob;
        width: number;
        height: number;
        style?: string;
    }>;
    /**
     * 清理 HTML 以适配微信编辑器
     * 微信编辑器对嵌套列表支持不佳，需要：
     * 1. 处理嵌套列表父级 li 内的段落与行内内容（避免嵌套层级被打散）
     * 2. 将深层嵌套列表转为伪列表（避免微信扁平化）
     * 3. 移除嵌套 ul/ol 的 margin（避免被当成独立块）
     * 4. 移除空的 li 元素和空白文本节点
     */
    /**
     * @param {string} html
     * @returns {string}
     */
    cleanHtmlForDraft(html: string): string;
    /**
     * @param {string} value
     * @param {Element} grid
     */
    onThemeChange(value: string, grid: Element): Promise<void>;
    /**
     * @param {string} value
     */
    onFontFamilyChange(value: string): Promise<void>;
    /**
     * @param {number} value
     * @param {Element} grid
     */
    onFontSizeChange(value: number, grid: Element): Promise<void>;
    /**
     * @param {string} value
     * @param {Element} grid
     */
    onColorChange(value: string, grid: Element): Promise<void>;
    /**
     * @param {string} value
     */
    onQuoteCalloutStyleModeChange(value: string): Promise<void>;
    /**
     * @param {boolean} checked
     */
    onMacCodeBlockChange(checked: boolean): Promise<void>;
    /**
     * @param {boolean} checked
     */
    onCodeLineNumberChange(checked: boolean): Promise<void>;
    /**
     * @param {Element} grid
     * @param {string | number | boolean} value
     */
    updateButtonActive(grid: Element, value: string | number | boolean): void;
    /**
     * @returns {RenderPipelineLike | null}
     */
    getActiveRenderPipeline(): RenderPipelineLike | null;
    /**
     * @param {string} markdown
     * @param {string} sourcePath
     * @returns {Promise<string>}
     */
    renderMarkdownForPreview(markdown: string, sourcePath: string): Promise<string>;
    applyCustomCss(html: string): Promise<string>;
    /**
     * 更新当前文档显示
     */
    updateCurrentDoc(): void;
    /**
     * 设置占位符
     */
    setPlaceholder(): void;
    /**
     * @param {ObsidianElementLike} iconDiv
     * @returns {Promise<void>}
     */
    renderPlaceholderIcon(iconDiv: ObsidianElementLike): Promise<void>;
    showRenderFailurePlaceholder(message?: string): void;
    getMissingRenderNotice(): "❌ 当前文档渲染失败，请修复后重试" | "⚠️ 请先打开一个文章进行转换";
    /**
     * 转换当前文档
     * @param {boolean} [silent]
     * @param {ConvertCurrentOptionsLike} [options]
     */
    convertCurrent(silent?: boolean, options?: ConvertCurrentOptionsLike): Promise<void>;
    /**
     * 视图改变大小时触发 (包括侧边栏展开、Tab切换等导致的大小变化)
     */
    onResize(): void;
    /**
     * 渲染 HTML
     * @param {string} html
     */
    renderHTML(html: string): void;
    /**
     * @param {string} htmlContent
     * @returns {Promise<boolean>}
     */
    copyRichHTMLByClipboard(htmlContent: string): Promise<boolean>;
    /**
     * @param {unknown} text
     * @returns {string}
     */
    normalizeClipboardText(text: unknown): string;
    /**
     * @param {string} icon
     */
    setCopyButtonIcon(icon: string): void;
    setCopyButtonSpinner(): void;
    /**
     * @param {HTMLElement | null} root
     */
    enhanceHtmlForWechatPublishing(root: HTMLElement | null): Promise<void>;
    /**
     * @param {string} html
     * @returns {Promise<string>}
     */
    prepareHtmlForWechatDraft(html: string): Promise<string>;
    /**
     * @param {string} html
     * @returns {Promise<string>}
     */
    prepareHtmlForWechatsyncArticle(html: string): Promise<string>;
    /**
     * @param {string} html
     * @param {unknown[]} [assets]
     * @returns {Promise<string>}
     */
    prepareHtmlForWechatsyncArticleViaBridge(html: string, assets?: unknown[]): Promise<string>;
    /**
     * @param {WechatsyncAssetLike | null | undefined} asset
     * @returns {Promise<string>}
     */
    generateCoverThumbnailFromAsset(asset: WechatsyncAssetLike | null | undefined): Promise<string>;
    /**
     * @param {Element | null | undefined} block
     * @returns {string}
     */
    extractCodeTextForWechatsync(block: Element | null | undefined): string;
    /**
     * @param {Element | null} root
     */
    transformCodeBlocksForWechatsync(root: Element | null): void;
    /**
     * @param {Element | null} root
     */
    transformCodeBlocksForClipboard(root: Element | null): void;
    readClipboardTextSnapshot(): Promise<{
        supported: boolean;
        text: string;
    }>;
    /**
     * 复制 HTML
     */
    copyHTML(): Promise<void>;
    /**
     * 将 HTML 中的本地图片转换为 Base64 (Canvas Compressed)
     */
    /**
     * @param {Element} container
     * @returns {Promise<boolean>}
     */
    processImagesToDataURL(container: Element): Promise<boolean>;
    /**
     * @param {HTMLImageElement} img
     * @returns {Promise<void>}
     */
    convertImageToLocally(img: HTMLImageElement): Promise<void>;
    /**
     * @param {Blob} blob
     * @returns {Promise<string>}
     */
    blobToDataUrl(blob: Blob): Promise<string>;
    /**
     * @param {Blob} blob
     * @returns {Promise<string>}
     */
    blobToJpegDataUrl(blob: Blob): Promise<string>;
    onClose(): Promise<void>;
    /**
     * 简单的字符串哈希函数 (DJB2算法)
     * @param {string} str
     * @returns {number}
     */
    simpleHash(str: string): number;
}

interface AppleStyleSettingTabContract extends SettingTabBaseLike {
    /** @type {AppleStylePluginLike} */
    plugin: AppleStylePluginLike;
    /**
     * @param {string} vaultPath
     * @returns {string}
     */
    normalizeVaultPath(vaultPath: string): string;
    /**
     * @param {string} vaultPath
     * @returns {boolean}
     */
    isAbsolutePathLike(vaultPath: string): boolean;
    refreshOpenConverterAiState(): void;
    /**
     * @param {{ title?: string, message?: string, confirmText?: string, cancelText?: string }} options
     * @returns {Promise<boolean>}
     */
    confirmDestructiveAction({ title, message, confirmText, cancelText }: {
        title?: string;
        message?: string;
        confirmText?: string;
        cancelText?: string;
    }): Promise<boolean>;
    /** @returns {SettingDefinitionRenderLike[]} */
    getSettingDefinitions(): SettingDefinitionRenderLike[];
    /**
     * @param {ObsidianElementLike} containerEl
     */
    renderGitHubStarBanner(containerEl: ObsidianElementLike): void;
    /**
     * @param {ObsidianElementLike} containerEl
     * @param {string} description
     */
    renderSettingsTabIntro(containerEl: ObsidianElementLike, description: string): void;
    renderSettingsContent(): void;
    renderWechatSettingsTab(containerEl: ObsidianElementLike): void;
    renderCustomCssSection(containerEl: ObsidianElementLike): void;
    _activeSettingsTab: string;
    /**
     * @param {ObsidianElementLike} containerEl
     */
    renderAiSettingsSection(containerEl: ObsidianElementLike): void;
    /**
     * 显示添加/编辑账号的模态框
     */
    /**
     * @param {AiProviderLike | null} provider
     */
    showEditAiProviderModal(provider: AiProviderLike | null): void;
    /**
     * 显示添加/编辑账号的模态框
     */
    /**
     * @param {WechatAccountLike | null} account
     */
    showEditAccountModal(account: WechatAccountLike | null): void;
}
