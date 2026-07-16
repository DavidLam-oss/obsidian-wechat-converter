/*
## 核心功能

集中声明项目 JavaScript 源码使用的 JSDoc 结构类型，不产生运行时代码。

## 输入

无运行时输入；由 TypeScript/ESLint 在静态分析阶段读取。

## 输出

提供视图、设置、AI 编排、同步和渲染边界的全局 JSDoc 类型合同。

## 定位

位于根目录，只服务静态类型检查；运行时模块不得导入本文件。

## 依赖

依赖 DOM 标准类型，不依赖项目运行时模块。

## 维护规则

- 只声明跨模块复用的结构类型，不放业务逻辑或默认值。
- 新增类型前优先复用现有合同，避免同义类型重复。
*/

/**
 * @typedef {{ cls?: string, text?: string, value?: string | number, type?: string, href?: string, title?: string, placeholder?: string, checked?: boolean, style?: string, attr?: Record<string, unknown> }} ElementCreateOptionsLike
 * @typedef {HTMLElement & {
 *   createEl: (tag: string, options?: ElementCreateOptionsLike) => ObsidianElementLike,
 *   createDiv: (options?: ElementCreateOptionsLike) => ObsidianElementLike,
 *   createSpan: (options?: ElementCreateOptionsLike) => ObsidianElementLike,
 *   empty: () => void,
 *   addClass: (className: string) => void,
 *   removeClass: (className: string) => void,
 *   toggleClass: (className: string, enabled: boolean) => void,
 *   setCssStyles?: (styles: Record<string, string | number>) => void,
 *   setText?: (text: string) => void,
 *   appendText?: (text: string) => void
 * }} ObsidianElementLike
 * @typedef {ObsidianElementLike & { value: string, checked: boolean, disabled: boolean, selected: boolean }} ObsidianInputLike
 * @typedef {{ base64?: string, mimeType?: string }} WechatsyncAssetLike
 * @typedef {{ getValue?: () => string, getSelection?: () => string, replaceSelection?: (value: string) => void }} EditorLike
 * @typedef {{ path?: string, name?: string, basename?: string }} TFileLike
 * @typedef {{ file?: TFileLike | null, editor?: EditorLike, contentEl: ObsidianElementLike }} MarkdownViewLike
 * @typedef {{ type?: string, state?: Record<string, unknown>, icon?: string, title?: string, active?: boolean }} ViewStateLike
 * @typedef {{ open?: () => void, view?: unknown, getViewState?: () => ViewStateLike, setViewState?: (state: ViewStateLike) => Promise<void> }} LeafLike
 * @typedef {{ on: (name: string, callback: (...args: unknown[]) => unknown) => unknown, getActiveViewOfType: (viewType: unknown) => MarkdownViewLike | null, getActiveFile?: () => TFileLike | null, getLeavesOfType: (viewType: string) => LeafLike[], getRightLeaf: (split?: boolean) => LeafLike | null, getLeaf?: (type?: string | boolean) => LeafLike | null, onLayoutReady: (callback: () => void) => void, revealLeaf?: (leaf: unknown) => Promise<void>, setActiveLeaf?: (leaf: unknown, options?: Record<string, unknown>) => void }} WorkspaceLike
 * @typedef {{ adapter?: unknown, configDir?: string, on?: (name: string, callback: (...args: unknown[]) => unknown) => unknown, getConfig?: (key: string) => unknown, getAbstractFileByPath?: (path: string) => unknown, getResourcePath?: (file: unknown) => string, trash?: (file: unknown, useSystemTrash?: boolean) => Promise<void>, delete?: (file: unknown, force?: boolean) => Promise<void>, read?: (file: unknown) => Promise<string>, readBinary?: (file: unknown) => Promise<unknown>, modify?: (file: unknown, data: string) => Promise<void> }} VaultLike
 * @typedef {{ processFrontMatter?: (file: unknown, callback: (frontmatter: Record<string, unknown>) => void) => Promise<void> }} FileManagerLike
 * @typedef {{ getFileCache?: (file: unknown) => { frontmatter?: Record<string, unknown> } | null, getFirstLinkpathDest?: (linkpath: string, sourcePath: string) => unknown }} MetadataCacheLike
 * @typedef {{ activeTab?: Record<string, unknown>, open?: () => void, openTabById?: (id: string) => void }} AppSettingLike
 * @typedef {{ vault: VaultLike, workspace: WorkspaceLike, fileManager?: FileManagerLike, metadataCache?: MetadataCacheLike, setting?: AppSettingLike, isMobile?: boolean }} AppLike
 * @typedef {{ id: string, name: string, callback?: () => unknown, editorCallback?: (editor: EditorLike) => unknown }} CommandLike
 * @typedef {{ app: AppLike, manifest?: { id?: string, version?: string, dir?: string }, registerEvent: (event: unknown) => void, registerView: (viewType: string, factory: (leaf: LeafLike) => unknown) => void, addRibbonIcon: (icon: string, title: string, callback: () => unknown) => unknown, addCommand: (command: CommandLike) => void, addSettingTab: (tab: unknown) => void, loadData: () => Promise<unknown>, saveData: (data: unknown) => Promise<void> }} PluginBaseLike
 * @typedef {{ app: AppLike, containerEl: ObsidianElementLike, registerEvent: (event: unknown) => void }} ItemViewBaseLike
 * @typedef {{ app: AppLike, containerEl: ObsidianElementLike }} SettingTabBaseLike
 * @typedef {{ titleEl: ObsidianElementLike, contentEl: ObsidianElementLike, modalEl?: ObsidianElementLike, open: () => void, close: () => void, onClose?: () => void }} ModalLike
 * @typedef {{ setValue: (value: boolean) => ToggleComponentLike, onChange: (callback: (value: boolean) => unknown) => ToggleComponentLike }} ToggleComponentLike
 * @typedef {{ inputEl?: ObsidianElementLike, setPlaceholder: (value: string) => TextComponentLike, setValue: (value: string) => TextComponentLike, onChange: (callback: (value: string) => unknown) => TextComponentLike }} TextComponentLike
 * @typedef {{ addOption: (value: string, label: string) => DropdownComponentLike, setValue: (value: string) => DropdownComponentLike, onChange: (callback: (value: string) => unknown) => DropdownComponentLike }} DropdownComponentLike
 * @typedef {{ setButtonText: (value: string) => ButtonComponentLike, onClick: (callback: () => unknown) => ButtonComponentLike, setDestructive?: () => ButtonComponentLike, setWarning?: () => ButtonComponentLike }} ButtonComponentLike
 * @typedef {{ setName: (value: string) => SettingComponentLike, setDesc: (value: string) => SettingComponentLike, setHeading: () => SettingComponentLike, addToggle: (callback: (toggle: ToggleComponentLike) => unknown) => SettingComponentLike, addText: (callback: (text: TextComponentLike) => unknown) => SettingComponentLike, addDropdown: (callback: (dropdown: DropdownComponentLike) => unknown) => SettingComponentLike, addButton: (callback: (button: ButtonComponentLike) => unknown) => SettingComponentLike }} SettingComponentLike
 * @typedef {{ setMessage: (message: string) => void, hide: () => void }} NoticeLike
 * @typedef {{ value: string, label: string }} ThemeOptionLike
 * @typedef {{ value: string, color: string }} ThemeColorOptionLike
 * @typedef {{ getThemeList: () => ThemeOptionLike[], getColorList: () => ThemeColorOptionLike[] }} AppleThemeApiLike
 * @typedef {{ new (...args: unknown[]): unknown }} ConstructorLike
 * @typedef {{ Plugin: new (...args: unknown[]) => PluginBaseLike, MarkdownView: ConstructorLike, ItemView: new (...args: unknown[]) => ItemViewBaseLike, Notice: new (message: string, timeout?: number) => NoticeLike, Platform: Record<string, unknown>, PluginSettingTab: new (...args: unknown[]) => SettingTabBaseLike, Setting: new (containerEl: ObsidianElementLike | HTMLElement) => SettingComponentLike, Modal?: new (app: AppLike) => ModalLike, setIcon?: (element: HTMLElement, icon: string) => void, requestUrl?: (options: Record<string, unknown>) => Promise<unknown>, request?: (options: Record<string, unknown>) => Promise<unknown>, MarkdownRenderer?: unknown }} ObsidianApiLike
 * @typedef {{ id: string, name: string, appId: string, appSecret: string, author?: string, contentSourceUrl?: string, openComment?: boolean, onlyFansCanComment?: boolean }} WechatAccountLike
 * @typedef {{ sourcePath?: string, mediaId?: string, index?: number }} DraftAssociationLike
 * @typedef {{ modal?: ModalLike, isProxyAuth?: boolean, draftAssociation?: DraftAssociationLike }} SyncModalOptionsLike
 * @typedef {{ mediaId: string, url?: string, name?: string }} WechatMaterialSelectionLike
 * @typedef {{ media_id?: string, mediaId?: string, url?: string, name?: string }} WechatMaterialItemLike
 * @typedef {{ item?: WechatMaterialItemLike[], total_count?: number, item_count?: number, fromCache?: boolean, [key: string]: unknown }} WechatMaterialPageLike
 * @typedef {{ cachedAt: number, data: WechatMaterialPageLike }} WechatMaterialCacheEntryLike
 * @typedef {{ coverBase64?: string, thumbMediaId?: string, materialCover?: WechatMaterialSelectionLike | null, title?: string, digest?: string }} ArticleSessionStateLike
 * @typedef {{ id?: string, platform?: string, name?: string, status?: string, success?: boolean, url?: string, error?: string, message?: string, [key: string]: unknown }} WechatsyncPlatformResultLike
 * @typedef {{ found?: boolean, title?: string, platforms?: WechatsyncPlatformResultLike[], [key: string]: unknown }} WechatsyncTaskSnapshotLike
 * @typedef {{ skippedPlatforms?: unknown[], publishedPlatforms?: unknown[], platforms?: unknown[], quotaBlocked?: boolean, reason?: string, message?: string, [key: string]: unknown }} WechatsyncQuotaResultLike
 * @typedef {{ start: () => Promise<unknown>, stop?: () => Promise<void>, waitForConnection?: (timeoutMs?: number) => Promise<unknown>, openSyncTask?: (taskId: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>, getSyncTaskLink?: (taskId: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>, getSyncTask?: (taskId: string, options?: Record<string, unknown>) => Promise<WechatsyncTaskSnapshotLike | Record<string, unknown>> }} WechatSyncBridgeServiceLike
 * @typedef {{ warning?: string, attempted?: boolean, success?: boolean, cleanedPath?: string }} CleanupResultLike
 * @typedef {{ src?: string, [key: string]: unknown }} ImageUploadFailureLike
 * @typedef {{ code?: string, message?: string, value?: string }} DraftContentIssueLike
 * @typedef {{ cleanupResult?: CleanupResultLike, imageUploadFailures?: ImageUploadFailureLike[], placeholderImageSources?: string[], draftWarnings?: DraftContentIssueLike[], mediaId?: string, isUpdate?: boolean, draftIndex?: number, [key: string]: unknown }} WechatDraftSyncResultLike
 * @typedef {{ account: WechatAccountLike, proxyUrl?: string, currentHtml: string, activeFile?: TFileLike | null, publishMeta?: Record<string, unknown> | null, sessionTitle?: string, sessionCoverBase64?: string, sessionThumbMediaId?: string, sessionDigest?: string, draftMediaId?: string, draftIndex?: number, onStatus?: (stage: string) => void, onImageProgress?: (current: number, total: number) => void, onMathProgress?: (current: number, total: number) => void }} WechatSyncToDraftOptionsLike
 * @typedef {{ syncToDraft: (options: WechatSyncToDraftOptionsLike) => Promise<WechatDraftSyncResultLike> }} WechatSyncServiceLike
 * @typedef {{ mediaId?: string, fingerprint?: string, [key: string]: unknown }} CoverCacheEntry
 * @typedef {{ url?: string, [key: string]: unknown }} ImageCacheEntry
 * @typedef {{ url?: string, [key: string]: unknown }} SvgUploadCacheEntry
 * @typedef {{ ok: boolean, markdown?: string, sourcePath?: string }} MarkdownSourceResultLike
 * @typedef {{ showLoading?: boolean, loadingText?: string, loadingDelay?: number, sourceOverride?: { markdown?: string, sourcePath?: string } | null }} ConvertCurrentOptionsLike
 * @typedef {{ sourcePath?: string, settings?: PluginSettingsLike | Record<string, unknown> }} RenderCandidateContextLike
 * @typedef {{ id: string, name: string, kind: string, baseUrl: string, apiKey: string, model: string, enabled?: boolean }} AiProviderLike
 * @typedef {{ enabled: boolean, defaultLayoutFamily: string, defaultColorPalette: string, defaultProviderId: string, customColor?: string, includeImagesInLayout?: boolean, requestTimeoutMs?: number, providers: AiProviderLike[], articleLayoutsByPath: Record<string, unknown> }} AiSettingsLike
 * @typedef {{ theme: string, themeColor: string, customColor: string, quoteCalloutStyleMode: string, fontFamily: string, fontSize: number, macCodeBlock: boolean, codeLineNumber: boolean, avatarUrl: string, avatarBase64: string, enableWatermark: boolean, showImageCaption: boolean, normalizeChinesePunctuation: boolean, wechatAccounts: WechatAccountLike[], defaultAccountId: string, proxyUrl: string, clientId: string, draftCache: unknown, usePhoneFrame: boolean, sidePadding: number, coloredHeader: boolean, cleanupAfterSync: boolean, cleanupUseSystemTrash: boolean, cleanupDirTemplate: string, multiPlatformSync: unknown, wechatAppId: string, wechatAppSecret: string, ai: AiSettingsLike, [key: string]: unknown }} PluginSettingsLike
 * @typedef {{ lineHeight: number, paragraphGap: number }} ThemeConfigLike
 * @typedef {{ update: (values: Record<string, unknown>) => void, getThemeConfig?: () => ThemeConfigLike }} ThemeRuntimeLike
 * @typedef {{ slider: ObsidianInputLike, valueLabel: ObsidianElementLike, getEffective: () => number }} SpacingSliderRefLike
 * @typedef {{ updateConfig?: (values: Record<string, unknown>) => void, reinit?: () => void, initMarkdownIt?: () => Promise<void> }} ConverterRuntimeLike
 * @typedef {{ renderForPreview: (markdown: string, context: { sourcePath: string, settings: PluginSettingsLike }) => Promise<string> }} RenderPipelineLike
 * @typedef {{ updateAiToolbarState?: () => void, refreshAiLayoutPanel?: () => void }} ConverterViewRefreshLike
 * @typedef {PluginBaseLike & { settings: PluginSettingsLike, obsidianApi?: ObsidianApiLike, _wechatSyncBridgeService?: WechatSyncBridgeServiceLike, _wechatSyncBridgeCacheKey?: string, _lastSaveSettingsErrorAt?: number, openConverter: () => Promise<void>, openExternalUrl?: (url: string) => boolean, getConverterView?: () => unknown, getWechatSyncBridgeService?: () => WechatSyncBridgeServiceLike, saveSettings: () => Promise<boolean>, getArticleLayoutState?: (sourcePath: string, selection?: AiLayoutSelectionLike | Record<string, unknown>) => AiLayoutStateLike | null, saveArticleLayoutState?: (sourcePath: string, nextState: AiLayoutStateLike | Record<string, unknown>, selection?: AiLayoutSelectionLike | Record<string, unknown>) => Promise<AiLayoutStateLike | null> }} AppleStylePluginLike
 * @typedef {{ settings?: PluginSettingsLike | Record<string, unknown> }} PluginWithSettingsLike
 * @typedef {{ setDestructive?: () => unknown, setWarning?: () => unknown }} ButtonCompatLike
 * @typedef {{ renderSettingsContent?: () => void, [key: string]: unknown }} SettingTabCompatLike
 * @typedef {{ commandName: string, zhTitle: string, enTitle: string, zhPlaceholder: string[], enPlaceholder: string[], zhNotice: string, enNotice: string }} ImageSwipeCopyLike
 * @typedef {{ message: string, isFatal?: boolean, isProxyAuth?: boolean }} ReadableErrorLike
 * @typedef {{ method?: string, body?: string, headers?: Record<string, string>, contentType?: string, throw?: boolean }} RequestUrlOptionsLike
 * @typedef {{ status: number, json?: unknown, text: string, arrayBuffer?: () => Promise<ArrayBuffer>, headers: Record<string, string> }} RequestUrlResponseLike
 * @typedef {{ checkbox: ObsidianInputLike, toggle: ObsidianElementLike }} CaptionToggleStateLike
 * @typedef {{ layoutFamily?: string, colorPalette?: string }} AiLayoutSelectionLike
 * @typedef {{ type?: string, sectionIndex?: number, sectionLabel?: string, headingLevel?: number, title?: string, eyebrow?: string, subtitle?: string, coverImageId?: string, variant?: string, caseLabel?: string, text?: string, quote?: string, note?: string, summary?: string, body?: string, highlight?: string, caption?: string, buttonText?: string, imageId?: string, imageIds?: string[], paragraphs?: string[], bullets?: string[], bulletGroups?: string[][], callouts?: AiLayoutCalloutLike[], subsections?: AiLayoutSubsectionLike[], items?: { label?: string, text?: string, title?: string }[], [key: string]: unknown }} AiLayoutBlockLike
 * @typedef {{ blocks?: AiLayoutBlockLike[], selection?: AiLayoutSelectionLike, resolved?: AiLayoutSelectionLike, articleType?: string, stylePack?: string, recommendedLayoutFamily?: string, recommendedColorPalette?: string, layoutFamily?: string, title?: string, summary?: string, [key: string]: unknown }} AiLayoutJsonLike
 * @typedef {{ source?: string, originalIndex?: number, blockKey?: string, type?: string, label?: string, index?: number, [key: string]: unknown }} AiLayoutBlockOriginLike
 * @typedef {{ providerName?: string, providerModel?: string, blockOrigins?: AiLayoutBlockOriginLike[], schemaValidation?: AiSchemaValidationLike, executionMode?: string, fallbackUsed?: boolean, fallbackBlockCount?: number, [key: string]: unknown }} AiLayoutGenerationMetaLike
 * @typedef {{ issueCount?: number, fatal?: boolean, issues?: { path?: string, message?: string, fatal?: boolean }[], [key: string]: unknown }} AiSchemaValidationLike
 * @typedef {{ status?: string, layoutJson?: AiLayoutJsonLike | null, generationMeta?: AiLayoutGenerationMetaLike | null, selection?: AiLayoutSelectionLike, resolved?: AiLayoutSelectionLike, sourceHash?: string, providerId?: string, model?: string, updatedAt?: number, lastError?: string, lastAttemptStatus?: string, lastAttemptError?: string, lastAttemptAt?: number, lastAttemptSchemaValidation?: AiSchemaValidationLike | null, dismissedBlockKeys?: string[], recommendedLayoutFamily?: string, recommendedColorPalette?: string, stylePack?: string, layoutFamily?: string, [key: string]: unknown }} AiLayoutStateLike
 * @typedef {{ sourcePath: string, markdown: string, sourceHash: string, isSourcePending?: boolean, isSourceSwitching?: boolean, isStaleSuppressed?: boolean, title: string }} AiLayoutContextLike
 * @typedef {{ layoutJson: AiLayoutJsonLike | null, blockOrigins: AiLayoutBlockOriginLike[], hiddenCount: number }} VisibleAiLayoutSnapshotLike
 * @typedef {{ name: string, desc?: string, searchable?: boolean, render: (setting: SettingComponentLike, group?: unknown) => void }} SettingDefinitionRenderLike
 * @typedef {{ id: string, label: string, description?: string, recommendedFor?: string[], tokens?: Record<string, string> }} AiLayoutColorPalette
 * @typedef {{ id: string, label?: string, description?: string, version?: string }} AiLayoutSkillManifest
 * @typedef {{ id: string, label: string, description?: string, version?: string, manifest: AiLayoutSkillManifest, prompt: string, blocks: unknown, fallback: unknown }} AiLayoutSkill
 * @typedef {{ typography?: Record<string, unknown>, image?: Record<string, unknown>, profiles?: Record<string, Record<string, unknown>>, sectionLabels?: Record<string, string>, allowedCssNotes?: unknown[] }} AiLayoutStylePrimitivesLike
 * @typedef {{ type?: string, title?: string, body?: string }} AiLayoutCalloutLike
 * @typedef {{ title?: string, heading?: string, level?: number, paragraphs?: string[], bulletGroups?: string[][], callouts?: AiLayoutCalloutLike[] }} AiLayoutSubsectionLike
 * @typedef {{ title?: string, heading?: string, index?: number|string, level?: number, paragraphs?: string[], bulletGroups?: string[][], callouts?: AiLayoutCalloutLike[], subsections?: AiLayoutSubsectionLike[] }} AiLayoutSourceSectionLike
 * @typedef {{ headings: string[], sectionTitles: string[], paragraphs: string[], leadParagraphs: string[], bulletGroups: string[][], lastParagraph: string }} MarkdownSignals
 * @typedef {{ role: string, content: string }} AiLayoutMessageLike
 * @typedef {{ level: number, text: string }} MarkdownHeading
 * @typedef {{ type: string, title: string, body: string }} MarkdownCallout
 * @typedef {{ level?: number, title: string, paragraphs: string[], bulletGroups: string[][], callouts: MarkdownCallout[] }} MarkdownSubsection
 * @typedef {{ index: number, level: number, title: string, paragraphs: string[], bulletGroups: string[][], callouts: MarkdownCallout[], subsections: MarkdownSubsection[] }} MarkdownSection
 * @typedef {{ id?: string, src?: string, alt?: string, caption?: string }} AiImageRefLike
 * @typedef {{ provider: AiProviderLike, title: string, markdown: string, selection: AiLayoutSelectionLike, stylePack: string, imageRefs: AiImageRefLike[], timeoutMs: number, abortTimeoutMs: number, fetchImpl: FetchLike }} AiLayoutRequestOptionsLike
 * @typedef {{ provider?: unknown, title?: unknown, markdown?: unknown, stylePack?: unknown, selection?: AiLayoutSelectionLike, imageRefs?: AiImageRefLike[], timeoutMs?: unknown, fetchImpl?: FetchLike }} AiLayoutGenerationOptionsLike
 * @typedef {{ layoutJson: AiLayoutJsonLike, generationMeta: AiLayoutGenerationMetaLike }} AiLayoutResultLike
 * @typedef {{ accent?: string, accentDeep?: string, accentSoft?: string, text?: string, muted?: string, border?: string, surface?: string, surfaceSoft?: string, quoteBg?: string }} AiColorTokens
 * @typedef {{ lastLayoutFamily?: string, lastAutoResolvedFamily?: string, familyStates?: Record<string, AiLayoutStateLike>, lastSelectionKey?: string, selectionStates?: Record<string, AiLayoutStateLike>, lastStylePack?: string, stylePackStates?: Record<string, AiLayoutStateLike> }} AiLayoutCacheEntryLike
 * @typedef {{ title?: string, leadHtml?: string, subsections?: RenderedSubsectionFragmentLike[] }} RenderedSectionFragmentLike
 * @typedef {{ title?: string, titleKey?: string, contentHtml?: string }} RenderedSubsectionFragmentLike
 * @typedef {(url: string, options: Record<string, unknown>) => Promise<FetchResponseLike>} FetchLike
 * @typedef {{ initMarkdownIt?: () => Promise<void> | void }} ConverterLike
 * @typedef {{ introParagraphs: string[], introBulletGroups: string[][], introCallouts: MarkdownCallout[], headings: MarkdownHeading[], sections: MarkdownSection[] }} MarkdownStructure
 * @typedef {{ ok: boolean, status: number, statusText?: string, text: () => Promise<string>, json: () => Promise<unknown> }} FetchResponseLike
 */
