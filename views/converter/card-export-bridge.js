/*
## 核心功能

图片卡片导出接线层（B05）：把纯服务层 `services/card-exporter.js` 与真实 Obsidian 环境接起来——
vault 文件系统适配器（create-only 语义 + 冲突识别 + realpath 校验）、逐页离屏重渲与捕获回调、
导出参数组装（来源/范围/倍率/尺寸/目录/省略摘要）。供 `card-export-modal.js` 编排调用。

## 输入

AppleStyleView 实例（app / 会话 / 当前渲染负载）与用户在弹窗中的选择
（rootPath / scale / 选中页 / 是否全部）。

## 输出

导出 `cardExportBridgeMethods`（由 AppleStyleView 组装）：
- `buildCardExportFsAdapter()`：vault fs 适配器（contract 见 card-exporter.js 文件头）。
- `prepareCardExportResources({ markdown, sourcePath })`：每批共享的图片资源快照（ensure / summary / release）；
  图片在资源层内联为 data: URL，捕获引擎不再取图，规避跨域图被占位图顶替（成片丢图）。
- `createCardCaptureCallback({ pageId, ordinal, settings, markdown, sourcePath, scale, resources })`：B04 的 `capturePageBytes`。
- `collectCardExportInput({ rootPath, scale, pageIds })`：组装 exportCards 入参（含资格预检）。
- `resolveCardExportAbsPath(vaultRelativePath)`：把 vault 相对路径解析成系统绝对路径（不可解析返回 null）。
- `canRevealCardExportOutput()`：当前环境能否在系统文件管理器中定位目录（桌面端且有 electron shell）。
- `revealCardExportOutput(vaultRelativePath)`：在访达 / 资源管理器中选中该批次目录，返回 `{ ok, absPath, reason? }`。

模块级导出：
- `listCardExportPageIds(outcome)`：本次可导出的页全集（封面在前 + page-1..N）。
  导出入参组装与导出弹窗的自选页清单**共用本函数**，避免两处口径漂移
  （清单里勾得到、导出时被过滤掉的静默少页）。
- `CARD_EXPORT_SCALES` / `DEFAULT_CARD_EXPORT_SCALE` / `DEFAULT_CARD_EXPORT_ROOT`：共享常量。

## 定位

位于 views/converter/，视图与服务之间的接线层；不含业务规则（路径安全/清单/部分成功语义在 services）。
拆出本文件避免 core.js 膨胀，且导出相关的 Obsidian 能力访问集中一处便于复用（目录定位等）。

## 依赖

`../../services/card-exporter.js`、`card-render-engine.js`、`card-export-paths.js`、
`card-document.js`、`card-resources.js`、`card-themes.js`；Obsidian `app.vault`（经 this.app 访问）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查所属目录 README 是否仍准确。
- 禁止在此引入分页/测量/清单等业务规则；只做能力适配与参数组装。
- 新增 vault 写入能力须核对 §6.1（不覆盖、不越界、不删旧文件），并同步 tests/card_export_flow.test.js。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- reason: 视图方法组跨模块动态组合（同 card-preview），Obsidian app.vault 与 renderCardPages 产物以 unknown 持有，运行时语义由 B04 契约测试 + card_export_flow 约束 */

import { createCardExporter } from '../../services/card-exporter.js';
import { DEFAULT_EXPORT_ROOT, EXPORT_MANIFEST_NAME, COVER_EXPORT_FILE_NAME } from '../../services/card-export-paths.js';
import { createCardDocument } from '../../services/card-document.js';
import { deriveCoverFields, isCoverUsable } from '../../services/card-cover-model.js';
import {
  createCardResourcePool,
  createCardResourceSession,
  createInlineSnapshotResolver,
} from '../../services/card-resources.js';
import { renderCardPages, RATIO_PRESETS, capturePage, CAPTURE_LIBRARY_IDS } from '../../services/card-render-engine.js';
import { DEFAULT_CARD_THEME_ID, getCardTheme } from '../../services/card-themes.js';
import { loadCommonJsDependency } from '../../services/obsidian-compat.js';

/** 导出倍率白名单（§5.5；C01 扩展比例时同步） */
export const CARD_EXPORT_SCALES = /** @type {const} */ ([1, 2, 3]);
/** 默认导出倍率 */
export const DEFAULT_CARD_EXPORT_SCALE = 2;
/** 导出默认输出目录（vault 相对；C02 全局默认可覆盖初始值；单一事实在 card-export-paths.js） */
export const DEFAULT_CARD_EXPORT_ROOT = DEFAULT_EXPORT_ROOT;

/**
 * 本次可导出的页全集：封面在前 + page-1..N（导出的唯一页序口径）。
 * 导出入参组装（`collectCardExportInput`）与导出弹窗的自选页清单**共用本函数**：
 * 两处各写一份判定就会出现「清单里勾得到、导出时被过滤掉」的静默少页。
 * 封面是否成立必须与导出一致——只看 hasCover 还不够，捕获需要真实的 coverPage 元素。
 * @param {any} outcome 卡片预览负载
 * @returns {string[]}
 */
export function listCardExportPageIds(outcome) {
  const safe = outcome && typeof outcome === 'object' ? outcome : {};
  const hasCover = safe.hasCover === true && safe.coverPage instanceof HTMLElement;
  const pages = Array.isArray(safe.pages) ? safe.pages : [];
  const pageCount = Number(safe.pageCount || pages.length || 0);
  return [
    ...(hasCover ? ['cover'] : []),
    ...Array.from({ length: pageCount }, (_, i) => `page-${i + 1}`),
  ];
}

/**
 * @typedef {{
 *   exists(path: string): Promise<boolean>,
 *   mkdir(path: string): Promise<void>,
 *   createBinaryExclusive(path: string, bytes: Uint8Array): Promise<{ ok: boolean, reason?: string, message?: string }>,
 *   writeBinary(path: string, bytes: Uint8Array): Promise<void>,
 *   readText(path: string): Promise<string>,
 *   realpath(path: string): Promise<string | null>,
 * }} CardExportFsAdapter
 */

/** @type {CardExportBridgeMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardExportBridgeMethods = {
/**
 * vault fs 适配器（§6.1）：路径一律 vault 相对；
 * - createBinaryExclusive 必须 create-only（存在即 conflict，绝不覆盖）；
 * - realpath 支持祖先目录解析（校验符号链接/重定向）；能力不可用抛错（exporter 按拒绝处理）；
 * - 不提供 remove：导出流程不得删除 vault 内任何文件（含临时文件），避免触发同步类插件的删除事件。
 * @returns {CardExportFsAdapter}
 */
buildCardExportFsAdapter() {
  const app = /** @type {any} */ (this.app);
  const adapter = app?.vault?.adapter;
  const vault = app?.vault;
  if (!adapter && !vault) {
    // 无 vault 能力：所有操作抛错，exporter 会以相应 reason 拒绝，不静默产出
    const unavailable = () => Promise.reject(new Error('vault adapter unavailable'));
    return {
      exists: unavailable,
      mkdir: unavailable,
      createBinaryExclusive: unavailable,
      writeBinary: unavailable,
      readText: unavailable,
      realpath: unavailable,
    };
  }

  const toAbs = (vaultRelativePath) => {
    if (typeof adapter?.getFullPath === 'function') return adapter.getFullPath(vaultRelativePath);
    if (typeof vault?.getAbstractFileByPath === 'function') {
      const file = vault.getAbstractFileByPath(vaultRelativePath);
      if (file && typeof file.path === 'string' && typeof adapter?.getFullPath === 'function') {
        return adapter.getFullPath(file.path);
      }
    }
    return vaultRelativePath;
  };

  return {
    async exists(path) {
      if (typeof adapter?.exists === 'function') return Boolean(await adapter.exists(path));
      return Boolean(vault.getAbstractFileByPath(path));
    },

    async mkdir(path) {
      if (typeof adapter?.mkdir === 'function') {
        await adapter.mkdir(path);
        return;
      }
      await vault.createFolder(path);
    },

    /**
     * create-only 二进制写入：目标已存在 → 返回 conflict（不覆盖）。
     * 依据 adapter.writeBinary 不具备 create-only 语义，先用 exists 兜底，再写入后核对。
     * @param {string} path @param {Uint8Array} bytes
     */
    async createBinaryExclusive(path, bytes) {
      try {
        const present = typeof adapter?.exists === 'function'
          ? await adapter.exists(path)
          : Boolean(vault.getAbstractFileByPath(path));
        if (present) return { ok: false, reason: 'conflict' };
      } catch (error) {
        return { ok: false, reason: 'io', message: error instanceof Error ? error.message : String(error) };
      }
      if (typeof adapter?.writeBinary !== 'function') {
        return { ok: false, reason: 'io', message: 'adapter.writeBinary unavailable' };
      }
      try {
        await adapter.writeBinary(path, bytes);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: 'io', message: error instanceof Error ? error.message : String(error) };
      }
    },

    async writeBinary(path, bytes) {
      if (typeof adapter?.writeBinary !== 'function') {
        throw new Error('adapter.writeBinary unavailable');
      }
      await adapter.writeBinary(path, bytes);
    },

    async readText(path) {
      if (typeof adapter?.read === 'function') {
        const raw = await adapter.read(path);
        return typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      }
      const file = vault.getAbstractFileByPath(path);
      if (!file) throw new Error(`missing: ${path}`);
      return vault.read(file);
    },

    /**
     * realpath：返回 vault 相对路径对应的真实绝对路径（尽力解析存在的祖先）。
     * 不存在 → null；能力不可用 → 抛错（exporter 按拒绝处理）。
     * @param {string} path
     * @returns {Promise<string | null>}
     */
    async realpath(path) {
      const normalizeReal = (value) => {
        let text = String(value);
        // 去掉 URL scheme / UNC 前缀的差异，仅保留可比较的路径主体
        text = text.replace(/^file:\/\//, '');
        if (!text) return '';
        text = text.replace(/\\/g, '/');
        return text.endsWith('/') ? text.slice(0, -1) : text;
      };
      if (!path) {
        // vault 根：必须能解析，否则拒绝
        const root = toAbs('');
        if (!root || root === '') throw new Error('realpath unavailable');
        return normalizeReal(root);
      }
      const segments = String(path).split('/').filter(Boolean);
      // 逐层回溯到存在的最近祖先（不存在 → null，交由 createBinaryExclusive 兜底）
      for (let end = segments.length; end >= 1; end -= 1) {
        const probe = segments.slice(0, end).join('/');
        let present = false;
        try {
          present = typeof adapter?.exists === 'function'
            ? Boolean(await adapter.exists(probe))
            : Boolean(vault.getAbstractFileByPath(probe));
        } catch {
          throw new Error('realpath unavailable');
        }
        if (present) return normalizeReal(toAbs(probe));
      }
      return null;
    },
  };
}
,

/**
 * 单批导出共享的图片资源快照：把「逐页重复下载」收敛为「每批一次」，并暴露加载失败摘要
 * （§5.5：资源不可用时导出侧不得静默少图）；release() 幂等，批次结束或视图释放时调用。
 * @param {{ markdown: string, sourcePath: string }} input
 */
prepareCardExportResources(input) {
  const self = this;
  /** @type {import('../../services/card-resources.js').CardResourceSnapshot | null} */
  let snapshot = null;
  /** @type {Promise<import('../../services/card-resources.js').CardResourceSnapshot> | null} */
  let pending = null;

  /** 懒准备（并发调用共享同一次准备）；失败不缓存，允许重试 */
  const ensure = async () => {
    if (snapshot) return snapshot;
    if (!pending) {
      pending = (async () => {
        const cardDoc = createCardDocument(String(input.markdown || ''));
        const imageRefs = [];
        for (const block of cardDoc.blocks || []) {
          for (const image of block.images || []) imageRefs.push(image);
        }
        const pool = createCardResourcePool({
          app: self.app,
          sourcePath: String(input.sourcePath || ''),
          session: createCardResourceSession(),
        });
        const prepared = await pool.prepare(imageRefs);
        await pool.waitForFonts(window.document);
        return prepared;
      })();
    }
    try {
      snapshot = await pending;
      return snapshot;
    } catch (error) {
      pending = null;
      throw error;
    }
  };

  return {
    ensure,
    /** 图片加载摘要（未准备时 null）：ready 为可用张数，failures 为显式失败项 */
    summary: () => {
      if (!snapshot) return null;
      const failed = snapshot.diagnostics.filter((d) => d.status !== 'filtered');
      return {
        ready: Object.keys(snapshot.images).length,
        failed: failed.length,
        hasBlockingFailures: Boolean(snapshot.hasBlockingFailures),
        failures: failed.map((d) => ({ ref: d.ref, status: d.status })),
      };
    },
    release: () => {
      const current = snapshot;
      snapshot = null;
      pending = null;
      if (!current) return;
      try {
        current.release();
      } catch {
        // 已最终释放：忽略（幂等）
      }
    },
  };
}
,

/**
 * 逐页捕获回调（B04 的 capturePageBytes）：用与预览同一套 settings 版本重新跑一次
 * 布局管线（§5.1「预览与导出同一页面模板，仅倍率不同」），捕获目标页后整体 detach。
 * 图片走批次共享快照的内联 data: URL，捕获引擎不重新取图（跨域图否则被占位图顶替）。
 * @param {{
 *   pageId: string, ordinal: number, settings: Record<string, unknown>,
 *   markdown: string, sourcePath: string, scale: number,
 *   resources: { ensure(): Promise<import('../../services/card-resources.js').CardResourceSnapshot> },
 *   isCanceled?: () => boolean,
 * }} input
 */
async createCardCaptureCallback(input) {
  if ((typeof input.isCanceled === 'function' && input.isCanceled()) || input.signal?.aborted) {
    const error = new Error('export canceled before capture');
    error.name = 'AbortError';
    throw error;
  }
  const settings = input.settings || {};
  const markdown = String(input.markdown || '');
  const resources = await input.resources.ensure();
  const isCover = String(input.pageId || '') === 'cover';

  const cardDoc = createCardDocument(markdown);
  const theme = getCardTheme(String(settings.themeId || DEFAULT_CARD_THEME_ID));
  const size = RATIO_PRESETS[String(settings.ratioId || '3:4')] || RATIO_PRESETS['3:4'];
  const typography = {
    fontSize: Number(settings.fontSize),
    lineHeight: Number(settings.lineHeight),
    pagePadding: Number(settings.pagePadding),
  };
  // 封面字段：优先取会话当前值（含用户编辑）；无会话时按内容派生（C01③）
  const coverFields = settings.coverEnabled === true
    ? (input.coverFields && typeof input.coverFields === 'object'
        ? input.coverFields
        : deriveCoverFields({ markdown, sourcePath: String(input.sourcePath || '') }))
    : null;

  const result = await renderCardPages(cardDoc, {
    theme,
    size,
    typography,
    resolveImageSrc: createInlineSnapshotResolver(resources),
    resources,
    document: window.document,
    pageNumberEnabled: settings.pageNumberEnabled !== false,
    watermarkText: String(settings.watermarkText || ''),
    cover: coverFields && isCoverUsable(coverFields) ? { fields: coverFields } : undefined,
  });

  try {
    if ((typeof input.isCanceled === 'function' && input.isCanceled()) || input.signal?.aborted) {
      const error = new Error('export canceled before capture');
      error.name = 'AbortError';
      throw error;
    }
    if (!result.ok || !Array.isArray(result.pages)) {
      throw new Error('card layout failed during export');
    }
    const target = isCover
      ? result.coverPage
      : result.pages[Number(input.ordinal) - 1];
    if (!(target instanceof HTMLElement)) {
      throw new Error(isCover ? 'cover page not rendered' : `page not found: ordinal ${input.ordinal}`);
    }
    const blob = await capturePage(target, {
      library: CAPTURE_LIBRARY_IDS[0],
      pixelRatio: Number(input.scale) || DEFAULT_CARD_EXPORT_SCALE,
      signal: input.signal,
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes };
  } finally {
    result.detach();
  }
}
,

/**
 * 组装导出入参（B04 exportCards 契约）：从当前会话与渲染负载收集来源、范围、倍率、
 * 尺寸与省略摘要；未就绪（无快照/无渲染）返回 { ok:false, reason }。
 * @param {{ rootPath?: string, scale?: number, pageIds?: string[] | null }} options
 */
collectCardExportInput(options = {}) {
  const selfRecord = /** @type {any} */ (this);
  const outcome = selfRecord.cardPreviewOutcome;
  const session = typeof this.getCardSettingsSession === 'function' ? this.getCardSettingsSession() : null;
  if (!outcome || !session) return { ok: false, reason: 'not-ready' };
  const hasCover = outcome?.hasCover === true && outcome?.coverPage instanceof HTMLElement;
  if (!Array.isArray(outcome.pages) || outcome.pages.length === 0) {
    // 正文全空但封面有效（C01③）：允许「仅导出封面」
    if (!hasCover) return { ok: false, reason: 'no-pages' };
  }

  const settings = typeof this.getCurrentCardLayoutSettings === 'function'
    ? this.getCurrentCardLayoutSettings()
    : {};
  const size = RATIO_PRESETS[String(settings.ratioId || '3:4')] || RATIO_PRESETS['3:4'];
  // 页全集与导出弹窗的自选清单共用同一份判定（避免两处口径漂移）
  const allPageIds = listCardExportPageIds(outcome);
  const selected = Array.isArray(options.pageIds) && options.pageIds.length > 0
    ? options.pageIds.filter((id) => allPageIds.includes(id))
    : allPageIds;
  if (selected.length === 0) return { ok: false, reason: 'no-selection' };

  const pages = selected
    .map((pageId) => {
      if (pageId === 'cover') return { pageId, ordinal: 0, fileName: COVER_EXPORT_FILE_NAME };
      return { pageId, ordinal: Number(String(pageId).replace(/^page-/, '')) };
    })
    .filter((p) => p.pageId === 'cover' || (Number.isFinite(p.ordinal) && p.ordinal >= 1));

  const scale = CARD_EXPORT_SCALES.includes(Number(options.scale))
    ? Number(options.scale)
    : DEFAULT_CARD_EXPORT_SCALE;

  return {
    ok: true,
    input: {
      rootPath: String(options.rootPath || DEFAULT_CARD_EXPORT_ROOT),
      sourcePath: String(outcome.sourcePath || ''),
      scale,
      pageSize: { ...size },
      pages,
      omissionTotal: Number(outcome?.omissionSummary?.total || 0),
    },
    settings,
    session,
    size,
    markdown: String(selfRecord.cardPreviewPendingInput?.markdown || ''),
    selectedPageIds: selected,
  };
}
,

/**
 * 创建导出控制器（B05 编排入口）：把 fs 适配器、捕获回调、进度回调与会话接进 B04 exporter。
 * 追加 getResourceSummary / disposeResources：整批共用一份内联图片快照，批次见底或视图释放时回收。
 * 首批捕获前先下载并内联全部图片（可能耗时数秒），此间发送 stage:"preparing" 信号，
 * 否则用户点完「开始导出」后到第一页产出之间完全没有反馈。
 * @param {import('../../services/card-session.js').CardNoteSessionLike} session
 * @param {{ settings: Record<string, unknown>, markdown: string, sourcePath: string, scale: number, isCanceled?: () => boolean, onProgress?: (event: Record<string, unknown>) => void }} context
 */
createCardExportController(session, context) {
  const fsAdapter = this.buildCardExportFsAdapter();
  const self = this;
  const notify = typeof context.onProgress === 'function' ? context.onProgress : null;
  // 图片资源每批只准备一次（内联 data: URL），整批捕获复用同一快照
  const resources = this.prepareCardExportResources({
    markdown: context.markdown,
    sourcePath: context.sourcePath,
  });
  /** 资源是否已就绪：首批捕获结束即视为就绪（ensure 幂等，失败后续页会重试并再次发信号） */
  let resourcesPrepared = false;
  const capturePageBytes = async (page) => {
    if (notify && !resourcesPrepared) {
      notify({ stage: 'preparing', total: 0, settled: 0, saved: 0, failed: 0 });
    }
    try {
      return await self.createCardCaptureCallback({
        pageId: page.pageId,
        ordinal: page.ordinal,
        settings: context.settings,
        markdown: context.markdown,
        sourcePath: context.sourcePath,
        scale: context.scale,
        resources,
        isCanceled: context.isCanceled,
        // 封面字段取会话当前值（含用户编辑；C01③）
        coverFields: typeof session.getCoverFields === 'function' ? session.getCoverFields() : null,
      });
    } finally {
      resourcesPrepared = true;
    }
  };
  const exporter = createCardExporter({
    session,
    fs: fsAdapter,
    capturePageBytes,
    onProgress: notify || undefined,
  });
  return {
    ...exporter,
    /** 本批图片加载摘要（ready / failed / failures） */
    getResourceSummary: () => resources.summary(),
    /** 释放本批图片资源（批次结束或视图释放时调用；幂等） */
    disposeResources: () => resources.release(),
  };
}
,

/**
 * 把 vault 相对路径换算成系统绝对路径（失败返回 null）。
 * 优先走 `adapter.getFullPath`（Obsidian 官方换算，跨平台分隔符正确）；
 * 退化用 `getBasePath` 拼接；两者都不可用返回 null（调用方据此隐藏「打开所在文件夹」）。
 * @param {string} vaultRelativePath
 * @returns {string | null}
 */
resolveCardExportAbsPath(vaultRelativePath) {
  const rel = String(vaultRelativePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) return null;
  const adapter = /** @type {any} */ (this.app)?.vault?.adapter;
  if (typeof adapter?.getFullPath === 'function') {
    try {
      const abs = adapter.getFullPath(rel);
      if (abs) return String(abs);
    } catch {
      // 换算失败：继续尝试 getBasePath 拼接
    }
  }
  if (typeof adapter?.getBasePath === 'function') {
    try {
      const base = String(adapter.getBasePath() || '').replace(/[/\\]+$/, '');
      if (base) return `${base}/${rel}`;
    } catch {
      // 无绝对路径能力：调用方降级为复制 vault 相对路径
    }
  }
  return null;
}
,

/** 当前环境是否支持在系统文件管理器中定位输出目录（桌面端 + electron shell + 绝对路径能力） */
canRevealCardExportOutput() {
  if (!getRevealShell()) return false;
  const adapter = /** @type {any} */ (this.app)?.vault?.adapter;
  return typeof adapter?.getFullPath === 'function' || typeof adapter?.getBasePath === 'function';
}
,

/**
 * 在访达 / 资源管理器中选中该批次目录（桌面端）。不谎报成功：
 * shell 不可用或调用抛错都返回 `ok:false`，由展示层降级为「复制路径」并说明原因。
 * @param {string} vaultRelativePath
 * @returns {{ ok: boolean, absPath: string | null, reason?: string }}
 */
revealCardExportOutput(vaultRelativePath) {
  const absPath = this.resolveCardExportAbsPath(vaultRelativePath);
  if (!absPath) return { ok: false, absPath: null, reason: 'path-unresolved' };
  const shell = getRevealShell();
  if (!shell) return { ok: false, absPath, reason: 'reveal-unavailable' };
  try {
    shell.showItemInFolder(absPath);
    return { ok: true, absPath };
  } catch {
    return { ok: false, absPath, reason: 'reveal-failed' };
  }
}
,

};

/** @type {{ showItemInFolder(path: string): void } | null | undefined} */
let revealShellCache;

/**
 * 惰性解析 Electron shell：仅在首次需要时 require('electron')；
 * 移动端与测试环境必然失败，结果缓存为 null（不重复尝试）。
 * @returns {{ showItemInFolder(path: string): void } | null}
 */
function getRevealShell() {
  if (revealShellCache === undefined) {
    try {
      const electron = /** @type {any} */ (loadCommonJsDependency('electron'));
      revealShellCache = electron && typeof electron.shell?.showItemInFolder === 'function'
        ? electron.shell
        : null;
    } catch {
      revealShellCache = null;
    }
  }
  return revealShellCache ?? null;
}

export { EXPORT_MANIFEST_NAME };
