/*
## 核心功能

声明转换器视图的**微信贴图提取、发布前置元数据、Vault 路径工具与目录清洗**合同。

## 输入

无运行时输入；由 TypeScript 和 ESLint 在静态分析阶段读取。

## 输出

补充全局 `AppleStyleViewContract`，并提供 `StickerImageItemLike`、`StickerUiStateLike`、`StickerPreviewDataLike`。

## 定位

位于项目根目录，是 `project-view-contracts.d.ts` 按域拆出的发布/清洗部分，不参与插件打包或运行。

## 依赖

依赖 `project-types.js` 与 `project-view-contracts.d.ts` 中的全局类型。

## 维护规则

- 只描述现有运行时行为，不在声明文件中定义默认值或业务逻辑。
- 同名 `interface` 跨这些文件由 TypeScript 声明合并成同一个合同，方法顺序无关，移动成员不需改调用方。
- 视图方法签名变化时同步检查方法组合同和对应实现。

 * Split from the 888-line project-view-contracts.d.ts by domain.
 * Interface declaration merging keeps the JSDoc contract runtime-free.
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

interface AppleStyleViewContract {
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
}
