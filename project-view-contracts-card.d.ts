/*
## 核心功能

声明转换器视图的**图片卡片**合同（卡片预览、卡片设置、卡片导出全链路）。

## 输入

无运行时输入；由 TypeScript 和 ESLint 在静态分析阶段读取。

## 输出

补充全局 `AppleStyleViewContract`，提供卡片域的字段与方法签名。

## 定位

位于项目根目录，是 `project-view-contracts.d.ts` 按域拆出的卡片部分，不参与插件打包或运行。

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
    /** 卡片模式：模式胶囊第三个按钮（B02） */
    btnCardMode: ObsidianElementLike | null;
    /** 卡片模式导出入口（B04/B05：打开导出弹窗） */
    cardExportBtn: ObsidianElementLike | null;
    /** 卡片导出：Obsidian 原生 Modal 实例（关闭仅销毁展示层，任务在会话里续跑） */
    cardExportModal: unknown;
    /** 卡片导出：准备中阶段标记（resources = 图片下载内联中；null = 无） */
    cardExportStage: string | null;
    /** 卡片导出：最近一次导出器进度事件（驱动状态区与逐页明细） */
    cardExportProgress: Record<string, unknown> | null;
    /** 卡片导出：逐页明细是否被用户手动展开（跨重绘保留） */
    cardExportPagesExpanded: boolean;
    /** 卡片导出：用户显式选择的导出范围（'all' / 'selected'；null = 跟随预览勾选） */
    cardExportScope: 'all' | 'selected' | null;
    /** 卡片导出：弹窗内容区滚动位置（进度事件重绘后还原） */
    cardExportScrollTop: number;
    /** 卡片导出：本批导出控制器（含 getBatchInfo / getResourceSummary / disposeResources） */
    cardExportController: unknown;
    /** 卡片导出：本批图片加载摘要（未加载成功的图片会被跳过并提示） */
    cardExportResourceSummary: Record<string, unknown> | null;
    /** 卡片导出：最近一批的批次目录与清单路径（结果定位用） */
    cardExportLastBatchInfo: Record<string, unknown> | null;
    /** 发布与分发按钮引用（集中控制模式显隐，B02 ①） */
    publishBtn: ObsidianElementLike | null;
    /** 卡片预览：按笔记隔离的会话注册表（B01，懒建） */
    cardSessionRegistry: unknown;
    /** 卡片预览：编辑合并计时器（300ms，§5.6） */
    cardPreviewMergeTimer: number | null;
    /** 卡片预览：渲染代次（晚到渲染丢弃） */
    cardPreviewGeneration: number;
    /** 卡片预览：当前会话绑定的预览编排器（B01） */
    cardPreviewRunner: unknown;
    cardPreviewRunnerNoteId: string;
    cardPreviewPendingInput: { markdown: string, sourcePath: string, sourcePathKey: string } | null;
    /** 卡片预览：最近一次落账的渲染负载（layoutKey 版本安全校验用） */
    cardPreviewLastOutcome: unknown;
    cardPreviewOutcome: unknown;
    cardPreviewShell: ObsidianElementLike | null;
    /** 卡片预览：按笔记记录的正文内容 hash（变化 → bumpContent） */
    cardContentHashes: Map<string, string>;
    /** 卡片预览：会话级资源累计预算（§5.5） */
    cardResourceBudget: unknown;
    /** 卡片预览渲染入口（卡片模式下 convertCurrent 的分支） */
    renderCardPreview(): Promise<ObsidianElementLike | undefined>;
    /** 编辑合并入口：连续输入只保留最后一次（§5.6） */
    scheduleCardPreviewUpdate(): void;
    /** 编辑事件到达即置 stale 并刷新摘要条提示（§5.6 事件→标记 ≤250ms；不重绘缩略图） */
    markCardPreviewStaleNow(): void;
    resolveCardMarkdownSource(): Promise<{ ok: boolean, markdown?: string, sourcePath?: string } | null>;
    /** 排版管线：解析 → 资源就绪 → 字体 → 测量分页装配（测试可注入替身） */
    runCardLayoutPipeline(ctx: { layoutKey: string, isStale: () => boolean }): Promise<Record<string, unknown>>;
    /** 三模式操作按钮显隐的单一事实来源（B02 ①） */
    applyModeActionVisibility(): void;
    /** 设置按钮 tooltip/aria-label 随模式切换（B03） */
    updateSettingsButtonLabel(): void;
    getCardSessions(): unknown;
    getCardPreviewZoom(): number;
    setCardPreviewZoom(zoom: number): void;
    adjustCardPreviewZoom(direction: number): void;
    applyCardPreviewZoom(): void;
    /**
     * 首次渲染（用户未手动调过缩放）时按容器宽度自适应：取不产生横向滚动的最大缩放。
     * @param {number} pageWidth 页面自然宽度（px）
     */
    maybeAutoFitCardPreviewZoom(pageWidth: number): void;
    renderCardEmptyState(): void;
    renderCardMobileNotice(): void;
    renderCardFailureState(outcome: unknown): void;
    renderCardPreviewDom(): ObsidianElementLike | undefined;
    /** 当前有效页选择（版本失效/空集 → null，调用方回落「全部」）；有选择即「已自选」 */
    getCardPageSelection(): string[] | null;
    /** 选择读写与源定位共用的会话（无预览输入返回 null） */
    resolveCardSelectionSession(): unknown;
    /** 切换单页选择（多选） */
    toggleCardPageSelection(pageId: string): void;
    /** 写入页选择（多选；空集走 clearSelection 回落「全部」） */
    applyCardPageSelection(pageIds: string[]): void;
    /** 渲染导出弹窗内的「自选页」清单（纯展示；变更经回调写回会话后由调用方重绘） */
    renderCardExportPicker(container: ObsidianElementLike, options: { pageIds: string[], selected: Set<string>, onToggle: (pageId: string) => void, onSelectAll: () => void, onClear: () => void }): void;
    /** 版本安全源定位：结果过期时不跳转编辑器 */
    locateCardPageSource(pageIndex: number): void;
    /** 源定位共用入口（行号 1-based；B03 从页定位与诊断定位共用） */
    locateCardSourceLine(lineNumber: number): void;
    /** 省略/资源诊断区：可展开明细 + 绑定版本的确认操作（B03） */
    renderCardDiagnosticArea(shell: ObsidianElementLike, outcome: Record<string, unknown>, session: unknown): void;
    /** 诊断明细行：类型 + 摘录 +（可定位时）定位按钮（B03，自 card-preview 拆出） */
    appendCardDiagnosticRow(area: ObsidianElementLike, list: ObsidianElementLike, item: { kind: string, excerpt: string, sourceStart: number, highRisk: boolean }): void;
    /** 卡片设置浮层：一次性构建 DOM（createSettingsPanel 调用） */
    buildCardSettingsPanel(): void;
    /** 卡片设置浮层：同步显示值（active 态/滑块位置与数值） */
    renderCardSettingsValues(): void;
    /** 卡片设置：应用单项设置（值实际变化 → bumpConfig → 重排版） */
    applyCardLayoutSetting(key: string, value: unknown): void;
    /** 卡片设置：批量应用多项（值实际变化才写；避免逐项触发重排） */
    applyCardLayoutSettings(partial: Record<string, unknown>): void;
    /** 卡片设置：切主题 = 切到该主题的默认排版（「恢复默认」的唯一入口，无独立重置按钮） */
    applyCardTheme(themeId: string): void;
    /**
     * 卡片设置：把归一化后的排版值写回全局默认（2026-09-19 起侧栏是唯一配置入口，调完即存）。
     * `normalizeCardLayoutSettings` 的输出即持久化白名单；封面字段属笔记级，不落默认。
     * @param {Record<string, unknown>} partial
     */
    persistCardLayoutDefaults(partial: Record<string, unknown>): void;
    /** 卡片设置：合并短时间内的多次默认变更，只落盘一次（滑块拖动不每次写盘） */
    scheduleCardDefaultsSave(): void;
    /** 卡片设置：当前笔记会话（无会话返回 null） */
    getCardSettingsSession(): unknown;
    /** 卡片设置：当前生效设置（无会话时为默认值） */
    getCurrentCardLayoutSettings(): Record<string, unknown>;
    /** 封面字段（C01③）：应用用户编辑（会话 applyCoverFields；实际变化 → bumpConfig → 重排版） */
    applyCardCoverField(key: string, value: unknown): void;
    /** 封面字段（C01③）：按当前笔记重新填入（清手工编辑，回 seed 跟随） */
    resetCardCoverFields(): void;
    /** 侧边栏卡片设置：切换子 Tab（'token' | 'cover'） */
    switchCardSettingsSubTab(subTab: 'token' | 'cover'): void;
    /** 侧边栏卡片设置：打开面板并聚焦到指定子 Tab（供预览区等入口直通） */
    openCardSettingsTab(tabName?: 'token' | 'cover'): void;
    /** 视图关闭：销毁会话注册表与合并计时器 */
    disposeCardPreview(): void;
    /** 卡片导出接线：vault fs 适配器（create-only + realpath 校验，§6.1） */
    buildCardExportFsAdapter(): Record<string, (...args: unknown[]) => Promise<unknown>>;
    /** 卡片导出接线：每批共享的图片资源快照（内联 data: URL；ensure/summary/release） */
    prepareCardExportResources(input: Record<string, unknown>): {
      ensure(): Promise<unknown>;
      summary(): Record<string, unknown> | null;
      release(): void;
    };
    /** 卡片导出接线：逐页离屏重渲 + 捕获回调（B04 capturePageBytes） */
    createCardCaptureCallback(input: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
    /** 卡片导出接线：组装 exportCards 入参（含资格预检与页范围） */
    collectCardExportInput(options: Record<string, unknown>): Record<string, unknown>;
    /** 卡片导出接线：创建导出控制器（接 session + fs + 捕获） */
    createCardExportController(session: unknown, context: Record<string, unknown>): unknown;
    /** 卡片导出：当前笔记会话（无会话返回 null） */
    getCardExportSession(): unknown;
    /** 卡片导出：打开或恢复弹窗（运行中任务 / 待查看结果，不新建重复任务） */
    openCardExportModal(): void;
    /** 卡片导出：关闭弹窗（仅展示层，任务后台继续） */
    closeCardExportModal(): void;
    /** 卡片导出：弹窗应展示的状态（job / result / none） */
    resolveCardExportView(): { kind: string, job?: unknown };
    /** 卡片导出：本次导出范围（'all' 全部页，默认 / 'selected' 弹窗清单里的自选页） */
    resolveCardExportScope(): 'all' | 'selected';
    /** 卡片导出：解析输出目录（本次弹窗输入 > 上次记住的目录 cardDefaults.exportRoot > 内置默认，C02） */
    resolveCardExportRootDefault(): string;
    /** 卡片导出：记住弹窗内填写的输出目录，作为下次预填的默认（2026-09-19：不单设配置项） */
    rememberCardExportRoot(root: string): void;
    /** 卡片导出：按会话任务状态重绘弹窗 */
    renderCardExportModal(): void;
    /** 卡片导出：准备中视图（点击开始后、任务建立与图片内联完成之前） */
    renderCardExportPreparing(body: ObsidianElementLike, stage: string): void;
    /** 卡片导出：接收导出器进度事件并刷新弹窗（preparing/begin/page/done） */
    handleCardExportProgress(event: Record<string, unknown>): void;
    /** 卡片导出：可开始表单（摘要 / 倍率 / 目录 / 开始） */
    renderCardExportForm(body: ObsidianElementLike): void;
    /** 卡片导出：任务进度与结果视图（状态区 / 告警 / 结果卡片 / 进度 / 操作） */
    renderCardExportJob(body: ObsidianElementLike, job: unknown): void;
    /** 卡片导出：逐页明细（默认折叠；进行中或存在失败页时展开） */
    renderCardExportPages(body: ObsidianElementLike, input: Record<string, unknown>): void;
    /** 卡片导出：结果定位（输出目录单行省略 + 在文件管理器中打开 / 复制路径 / 清单文件名） */
    renderCardExportResultLinks(body: ObsidianElementLike): void;
    /** 卡片导出：把 vault 相对路径解析成系统绝对路径（不可解析返回 null） */
    resolveCardExportAbsPath(vaultRelativePath: string): string | null;
    /** 卡片导出：当前环境是否支持在系统文件管理器中定位输出目录 */
    canRevealCardExportOutput(): boolean;
    /** 卡片导出：在系统文件管理器中选中批次目录 */
    revealCardExportOutput(vaultRelativePath: string): { ok: boolean, absPath: string | null, reason?: string };
    /** 卡片导出：开始导出（冻结快照 → 建任务 → 逐页输出） */
    startCardExport(): Promise<void>;
    /** 卡片导出：结果已读后回到表单，允许换倍率/目录再导一批 */
    startNewCardExport(): void;
    /** 卡片导出：显式取消（关闭弹窗不取消） */
    cancelCardExport(): void;
    /** 卡片导出：同快照重试失败页 */
    retryCardExportFailedPages(): Promise<void>;
    /** 卡片导出：清单单独重试（结果记录收尾） */
    retryCardExportManifest(): Promise<void>;
    /** 卡片导出：视图释放（移除弹窗 DOM 与监听） */
    disposeCardExportModal(): void;
}
