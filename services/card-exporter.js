/*
## 核心功能

卡片导出编排服务（B04，§5.4/§6.1/§6.2）：输出资格再校验（快照/版本/省略确认/选择/预算）、
安全批次目录创建（冲突重生成 ≤5 次）、逐页「捕获 → PNG 核验 → 排他写盘 → 落账 → 清单更新」、
取消检查点（不中断已启动页）、清单失败的部分成功语义（首份失败不写图；逐页失败暂停可修复续跑；
最终失败标记 manifestPending）、同快照失败页重试与清单单独重试。

## 输入

`createCardExporter({ fs, nextBatchId, now, capturePageBytes })`：
- `fs` 适配器（vault 相对路径，全部注入以保证可测试）：`exists/mkdir/readText/writeBinary/remove/
  createBinaryExclusive（create-only，绝不覆盖）/realpath（无法验证返回 null → 拒绝输出）`。
- `capturePageBytes({ pageId, ordinal })`：调用方注入的离屏重渲 + 捕获回调（本层无 DOM）。
- `exportCards(input)`：session、snapshotId、sourcePath、rootPath、configDir、scale、pageSize、
  pages（{pageId, ordinal}）、omissionTotal。

## 输出

导出控制器：`run()`（自动流程）、`retryManifest()`（清单单独重试，可收尾）、`resume()`
（清单修复后继续剩余页）、`retryFailedPages()`（同批次同快照重试失败页，成功页不重写）、
`getBatchInfo()`。结果结构化区分图片失败（capture/io/path）与清单失败（manifestPending），
错误细节经 sanitizeExportMessage 脱敏。

## 关键语义（§6.1/§6.2）

- 首份空清单创建失败 → 不写任何图片，任务 failed。
- 逐页清单更新失败 → 保留已存图片与内存记录、停止后续页（paused-manifest），不报整批成功。
- 取消后不再调度下一页；已启动页写入成功仍计入已保存，不删除已存文件伪装取消更早。
- 批次内 createBinaryExclusive 遇非本任务同名文件 → 立即停止整批，不覆盖/改名/删除。
- 已成功 PNG 不可变；清单是本任务拥有的可更新文件，覆盖前核验批次归属。
- realpath 无法验证（能力不可验证）或祖先重定向出 vault 根 → 拒绝该位置。

## 定位

位于 services/，卡片导出的编排层；路径净化/保留目录等纯逻辑在 card-export-paths.js。
任务生命周期（begin/record/cancel/complete）经注入的 session 完成，本层不自建任务状态。

## 依赖

`./card-export-paths.js`（validateExportRoot/buildNoteDirName/buildBatchDirName/imageFileName/
sanitizeExportMessage/EXPORT_MANIFEST_NAME/MAX_BATCH_DIR_ATTEMPTS）、
`./card-render-capture.js`（readPngSize，PNG 头核验；不触发捕获引擎加载）。
不导入 Obsidian/DOM；fs 与捕获均依赖注入，可在 node 下独立测试。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 安全/冲突语义变更须同步 tests/card_exporter.test.js、tests/card_export_manifest.test.js 与规划 §6.1/§6.2。
- 禁止在此引入 DOM、Obsidian app 或直接调用捕获引擎（捕获经注入回调）。
*/

import {
  EXPORT_MANIFEST_NAME,
  MAX_BATCH_DIR_ATTEMPTS,
  buildBatchDirName,
  buildNoteDirName,
  imageFileName,
  sanitizeExportMessage,
  validateExportRoot,
} from './card-export-paths.js';
import { readPngSize } from './card-render-capture.js';

/** 导出预算（§5.5 初始值；C04 复核校准） */
export const CARD_EXPORT_LIMITS = Object.freeze({
  /** 每批最多页数 */
  MAX_PAGES_PER_BATCH: 50,
  /** 每批输出总像素上限（宽×高×scale² 累计） */
  MAX_TOTAL_OUTPUT_PIXELS: 150_000_000,
});

/** @typedef {"saved"|"failed"|"pending"|"canceled"|"skipped"} CardExportPageStatus */

/**
 * @typedef {{
 *   pageId: string, ordinal: number, fileName: string, status: CardExportPageStatus,
 *   bytes?: number, width?: number, height?: number, reason?: string, detail?: string
 * }} CardExportPageEntry
 */

/**
 * @typedef {{
 *   status: "completed"|"partial"|"failed"|"canceled"|"paused-manifest",
 *   manifestPending: boolean, batchDir: string, manifestPath: string,
 *   summary: { total: number, saved: number, failed: number, canceled: number, skipped: number },
 *   results: CardExportPageEntry[], reason?: string
 * }} CardExportOutcome
 */

/** fs 适配器契约说明见文件头；此处仅 JSDoc 形状，无运行时校验。 */

/**
 * @param {{
 *   session: import('./card-session.js').CardNoteSessionLike,
 *   fs: {
 *     exists(path: string): Promise<boolean>,
 *     mkdir(path: string): Promise<void>,
 *     createBinaryExclusive(path: string, bytes: Uint8Array): Promise<{ ok: boolean, reason?: string, message?: string }>,
 *     writeBinary(path: string, bytes: Uint8Array): Promise<void>,
 *     remove(path: string): Promise<void>,
 *     readText(path: string): Promise<string>,
 *     realpath(path: string): Promise<string | null>,
 *   },
 *   nextBatchId?: () => string,
 *   now?: () => Date,
 *   capturePageBytes: (input: { pageId: string, ordinal: number }) => Promise<{ bytes: Uint8Array }>,
 * }} deps
 */
export function createCardExporter(deps) {
  const { session, fs, capturePageBytes } = deps;
  const nextBatchId = deps.nextBatchId || (() => Math.random().toString(36).slice(2, 8));
  const now = deps.now || (() => new Date());

  /**
   * 逐层核验路径及其存在祖先的真实位置仍在 vault 根内（§6.1 符号链接/重定向防护）。
   * realpath 返回 null（不存在或能力不可验证）：不存在 → 后续靠 createBinaryExclusive；
   * 能力不可验证由 fs 实现保证（无法验证必须返回特殊错误而非 null——契约约定
   * 「不存在返回 null，不可验证抛错」，抛错一律按拒绝处理）。
   * @param {string} path
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async function verifyPathInsideRoot(path) {
    /** @type {string | null} */
    let rootReal = null;
    try {
      rootReal = await fs.realpath('');
    } catch {
      return { ok: false, reason: 'realpath-unavailable' };
    }
    if (!rootReal) return { ok: false, reason: 'realpath-unavailable' };
    const prefix = rootReal.endsWith('/') ? rootReal : `${rootReal}/`;
    const segments = String(path).split('/').filter(Boolean);
    /** @type {string[]} */
    const chain = [];
    let probe = segments.join('/');
    while (probe) {
      chain.push(probe);
      probe = probe.includes('/') ? probe.slice(0, probe.lastIndexOf('/')) : '';
    }
    for (const part of chain) {
      /** @type {string | null} */
      let real = null;
      try {
        real = await fs.realpath(part);
      } catch {
        return { ok: false, reason: 'realpath-unavailable' };
      }
      if (real === null) continue; // 尚不存在：无重定向载体，写入由排他创建兜底
      if (real !== rootReal && !real.startsWith(prefix)) {
        return { ok: false, reason: 'path-redirect' };
      }
    }
    return { ok: true };
  }

  /**
   * 导出控制器（与 deps.session 绑定；批次状态跨 retry/resume 存续）。
   */
  function createCardExporterForSession() {
    /** @type {ReturnType<typeof buildManifestState> | null} */
    let manifestState = null;
    /** @type {string | null} */
    let jobId = null;
    /** @type {Array<{ pageId: string, ordinal: number }>} */
    let remaining = [];
    let phase = /** @type {"idle"|"running"|"paused-manifest"|"done"} */ ('idle');
    /** @type {string | null} */
    let snapshotIdRef = null;
    /** 同步占位：exportCards 校验段无 await，从入口到首个 await 之间防并发穿透 */
    let runActive = false;
    /** 清单健康位：更新失败置 false，修复成功（retryManifest）才允许 resume 续跑（§6.1） */
    let manifestHealthy = true;
    /** 首份空清单是否成功落盘过：决定「最终清单失败」是否算 manifestPending（未开始 ≠ 记录未完成） */
    let manifestEverWritten = false;
    /** 已收尾但最终清单写失败：retryManifest 修复成功后需再 finalize 更新任务状态 */
    let needsFinalSettle = false;

    /**
     * @param {{ batchId: string, batchDir: string, sourcePath: string, snapshotId: string,
     *   layoutKey: string, scale: number, pages: Array<{ pageId: string, ordinal: number }> }} input
     */
    function buildManifestState(input) {
      /** @type {CardExportPageEntry[]} */
      const pages = input.pages.map((page) => ({
        pageId: page.pageId,
        ordinal: page.ordinal,
        fileName: imageFileName(page.ordinal),
        status: 'pending',
      }));
      return {
        batchId: input.batchId,
        batchDir: input.batchDir,
        manifestPath: `${input.batchDir}/${EXPORT_MANIFEST_NAME}`,
        sourcePath: input.sourcePath,
        snapshotId: input.snapshotId,
        layoutKey: input.layoutKey,
        scale: input.scale,
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
        tmpSeq: 0,
        pages,
      };
    }

    /** @param {{ status: CardExportPageStatus, reason?: string, detail?: string, bytes?: number, width?: number, height?: number }} patch */
    function patchPage(pageId, patch) {
      const entry = manifestState ? manifestState.pages.find((p) => p.pageId === pageId) : null;
      if (!entry) return;
      Object.assign(entry, patch);
    }

    function manifestPayload() {
      if (!manifestState) return null;
      const saved = manifestState.pages.filter((p) => p.status === 'saved').length;
      const failed = manifestState.pages.filter((p) => p.status === 'failed').length;
      const canceled = manifestState.pages.filter((p) => p.status === 'canceled').length;
      const skipped = manifestState.pages.filter((p) => p.status === 'skipped').length;
      manifestState.updatedAt = now().toISOString();
      return {
        manifestVersion: 1,
        batchId: manifestState.batchId,
        batchDir: manifestState.batchDir,
        snapshotId: manifestState.snapshotId,
        layoutKey: manifestState.layoutKey,
        sourcePath: manifestState.sourcePath,
        scale: manifestState.scale,
        createdAt: manifestState.createdAt,
        updatedAt: manifestState.updatedAt,
        summary: {
          total: manifestState.pages.length, saved, failed, canceled, skipped,
        },
        pages: manifestState.pages.map((p) => {
          /** @type {Record<string, unknown>} */
          const row = {
            pageId: p.pageId, ordinal: p.ordinal, fileName: p.fileName, status: p.status,
          };
          if (p.bytes !== undefined) row.bytes = p.bytes;
          if (p.width !== undefined) row.width = p.width;
          if (p.height !== undefined) row.height = p.height;
          if (p.reason) row.reason = p.reason;
          if (p.detail) row.detail = p.detail;
          return row;
        }),
      };
    }

    /**
     * 清单安全更新：tmp 排他创建 → 覆盖自己的最终清单（批次归属已由创建语义保证）→ 清理 tmp。
     * @returns {Promise<{ ok: boolean, reason?: string, detail?: string }>}
     */
    async function updateManifest() {
      if (!manifestState) return { ok: false, reason: 'manifest-state-missing' };
      const payload = manifestPayload();
      if (!payload) return { ok: false, reason: 'manifest-state-missing' };
      manifestState.tmpSeq += 1;
      const tmpPath = `${manifestState.manifestPath}.tmp-${manifestState.tmpSeq}`;
      const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
      try {
        const created = await fs.createBinaryExclusive(tmpPath, bytes);
        if (!created.ok) {
          manifestHealthy = false;
          return { ok: false, reason: 'manifest-write-failed', detail: sanitizeExportMessage(created.message || 'tmp create failed') };
        }
      } catch (error) {
        manifestHealthy = false;
        return { ok: false, reason: 'manifest-write-failed', detail: sanitizeExportMessage(error instanceof Error ? error.message : String(error)) };
      }
      try {
        await fs.writeBinary(manifestState.manifestPath, bytes);
      } catch (error) {
        manifestHealthy = false;
        await discardTmp(tmpPath);
        return { ok: false, reason: 'manifest-write-failed', detail: sanitizeExportMessage(error instanceof Error ? error.message : String(error)) };
      }
      await discardTmp(tmpPath);
      manifestHealthy = true;
      manifestEverWritten = true;
      return { ok: true };
    }

    /** @param {string} tmpPath @returns {Promise<void>} */
    async function discardTmp(tmpPath) {
      try {
        await fs.remove(tmpPath); // 仅清理本任务自己创建的 tmp（§6.1）
      } catch {
        // 清理失败不阻塞主流程；tmp 命名唯一不会与后续冲突
      }
    }

    /** @returns {{ total: number, saved: number, failed: number, canceled: number, skipped: number }} */
    function summaryOf() {
      const pages = manifestState ? manifestState.pages : [];
      return {
        total: pages.length,
        saved: pages.filter((p) => p.status === 'saved').length,
        failed: pages.filter((p) => p.status === 'failed').length,
        canceled: pages.filter((p) => p.status === 'canceled').length,
        skipped: pages.filter((p) => p.status === 'skipped').length,
      };
    }

    /**
     * 收尾：尽力写最终清单 → 状态映射 → completeExport。
     * @param {{ canceled?: boolean }} flags
     * @returns {Promise<CardExportOutcome>}
     */
    async function finalize(flags = {}) {
      phase = 'running';
      const finalWrite = await updateManifest();
      const finalWriteFailed = !finalWrite.ok;
      needsFinalSettle = finalWriteFailed;
      const manifestPending = finalWriteFailed && manifestEverWritten;
      const summary = summaryOf();
      const cancelRequested = flags.canceled === true ||
        Boolean(jobId && session.getActiveJob()?.cancelRequested);
      /** @type {CardExportOutcome["status"]} */
      let status;
      if (cancelRequested) status = 'canceled';
      else if (manifestPending && summary.saved > 0) status = 'partial';
      else if (manifestPending) status = 'failed';
      else if (summary.saved === summary.total && summary.total > 0) status = 'completed';
      else if (summary.saved === 0) status = 'failed';
      else status = 'partial';
      const summaryText = `已保存 ${summary.saved} / ${summary.total} 张` +
        (summary.failed ? `，${summary.failed} 张失败` : '') +
        (manifestPending ? '；结果记录（清单）未完成' : '');
      if (jobId) {
        session.completeExport(jobId, { status, summary: summaryText });
        jobId = null;
      }
      phase = 'done';
      runActive = false;
      return {
        status,
        manifestPending,
        batchDir: manifestState ? manifestState.batchDir : '',
        manifestPath: manifestState ? manifestState.manifestPath : '',
        summary,
        results: manifestState ? manifestState.pages.map((p) => ({ ...p })) : [],
        reason: finalWriteFailed ? 'manifest-write-failed' : undefined,
      };
    }

    /**
     * 逐页循环：取消检查点 → 捕获 → PNG 核验 → realpath 核验 → 排他写盘 → 落账 → 清单更新。
     * @returns {Promise<{ pausedManifest: boolean, stopReason?: string }>}
     */
    async function runPageLoop() {
      while (remaining.length > 0) {
        if (jobId && !session.shouldStartNextPage(jobId)) {
          for (const page of remaining) patchPage(page.pageId, { status: 'canceled' });
          remaining = [];
          return { pausedManifest: false };
        }
        const page = /** @type {{ pageId: string, ordinal: number }} */ (remaining.shift());
        /** @type {{ bytes: Uint8Array }} */
        let captured;
        try {
          captured = await capturePageBytes({ pageId: page.pageId, ordinal: page.ordinal });
        } catch (error) {
          patchPage(page.pageId, {
            status: 'failed',
            reason: 'capture-failed',
            detail: sanitizeExportMessage(error instanceof Error ? error.message : String(error)),
          });
          continue;
        }
        /** @type {{ width: number, height: number }} */
        let size;
        try {
          size = readPngSize(captured.bytes);
        } catch {
          patchPage(page.pageId, { status: 'failed', reason: 'capture-invalid', detail: '非 PNG 输出' });
          continue;
        }
        const fileName = imageFileName(page.ordinal);
        const imagePath = manifestState ? `${manifestState.batchDir}/${fileName}` : '';
        const security = await verifyPathInsideRoot(imagePath);
        if (!security.ok) {
          patchPage(page.pageId, { status: 'failed', reason: security.reason || 'path-redirect' });
          for (const rest of remaining) patchPage(rest.pageId, { status: 'skipped' });
          remaining = [];
          return { pausedManifest: false, stopReason: security.reason || 'path-redirect' };
        }
        const write = await fs.createBinaryExclusive(imagePath, captured.bytes);
        if (!write.ok) {
          if (write.reason === 'conflict') {
            // 非本任务创建的同名文件：立即停止整批，不覆盖、改名认领或删除（§6.1）
            patchPage(page.pageId, { status: 'failed', reason: 'path-conflict' });
            for (const rest of remaining) patchPage(rest.pageId, { status: 'skipped' });
            remaining = [];
            return { pausedManifest: false, stopReason: 'path-conflict' };
          }
          patchPage(page.pageId, {
            status: 'failed',
            reason: 'write-failed',
            detail: sanitizeExportMessage(write.message || 'binary create failed'),
          });
          continue;
        }
        patchPage(page.pageId, {
          status: 'saved',
          bytes: captured.bytes.byteLength,
          width: size.width,
          height: size.height,
        });
        if (jobId) {
          session.recordPageResult(jobId, page.pageId, {
            status: 'saved',
            bytes: captured.bytes.byteLength,
            width: size.width,
            height: size.height,
          });
        }
        const manifestUpdate = await updateManifest();
        if (!manifestUpdate.ok) {
          // 已存图片与内存记录保留；停止后续页，等待清单修复（§6.1 部分成功语义）
          patchPage(page.pageId, { status: 'saved' });
          return { pausedManifest: true, stopReason: 'manifest-write-failed' };
        }
      }
      return { pausedManifest: false };
    }

    /**
     * 导出入口：资格再校验 → 批次目录 → 任务 → 首份清单 → 逐页循环 → 收尾。
     * @param {{
     *   rootPath: string, configDir?: string, snapshotId: string, sourcePath: string,
     *   scale: number, pageSize: { width: number, height: number },
     *   pages: Array<{ pageId: string, ordinal: number }>, omissionTotal?: number,
     * }} input
     * @returns {Promise<CardExportOutcome | { ok: false, reason: string }>}
     */
    async function exportCards(input) {
      if (runActive || (phase !== 'idle' && phase !== 'done')) {
        return { ok: false, reason: 'export-in-progress' };
      }
      const pages = Array.isArray(input.pages) ? input.pages : [];
      if (pages.length === 0) return { ok: false, reason: 'no-pages' };
      const seenIds = new Set();
      const seenOrdinals = new Set();
      for (const page of pages) {
        const ordinal = Math.floor(Number(page?.ordinal));
        if (!page?.pageId || !Number.isFinite(ordinal) || ordinal < 1) return { ok: false, reason: 'page-invalid' };
        if (seenIds.has(page.pageId) || seenOrdinals.has(ordinal)) return { ok: false, reason: 'page-duplicate' };
        seenIds.add(page.pageId);
        seenOrdinals.add(ordinal);
      }
      // 页数与总像素预算（§5.5）
      if (pages.length > CARD_EXPORT_LIMITS.MAX_PAGES_PER_BATCH) return { ok: false, reason: 'budget-pages' };
      const scale = Number(input.scale) || 2;
      const width = Number(input.pageSize?.width) || 0;
      const height = Number(input.pageSize?.height) || 0;
      if (!(width > 0) || !(height > 0)) return { ok: false, reason: 'page-size-missing' };
      const perPagePixels = Math.ceil(width * scale) * Math.ceil(height * scale);
      if (perPagePixels * pages.length > CARD_EXPORT_LIMITS.MAX_TOTAL_OUTPUT_PIXELS) {
        return { ok: false, reason: 'budget-pixels' };
      }
      // 快照与版本（§5.4 禁止导出旧结果）
      const snapshot = session.getSnapshot(String(input.snapshotId || ''));
      if (!snapshot) return { ok: false, reason: 'snapshot-missing' };
      if (snapshot.layoutKey !== session.currentLayoutKey()) return { ok: false, reason: 'version-changed' };
      // 省略确认（B03 闭环；有省略未确认不可输出）
      const omissionTotal = Number(input.omissionTotal) || 0;
      if (omissionTotal > 0 && !session.isOmissionConfirmed(snapshot.layoutKey)) {
        return { ok: false, reason: 'omission-unconfirmed' };
      }
      // 计划页数边界（ ordinal 不得超出快照页计划）
      const planPages = snapshot.plan && typeof snapshot.plan === 'object'
        ? /** @type {{ pages?: unknown[] }} */ (snapshot.plan).pages
        : null;
      const pageCount = Array.isArray(planPages) ? planPages.length : 0;
      if (pageCount > 0 && pages.some((p) => Math.floor(Number(p.ordinal)) > pageCount)) {
        return { ok: false, reason: 'page-out-of-range' };
      }
      // 路径配置校验（§6.1）——以上校验全部同步，此后进入异步段前先同步占位防并发
      const rootCheck = validateExportRoot(input.rootPath, { configDir: input.configDir || '.obsidian' });
      if (!rootCheck.ok) return { ok: false, reason: String(rootCheck.reason) };
      const root = rootCheck.root;
      runActive = true;

      // 批次目录：冲突重生成批次标识，最多 5 次（§6.1）
      const noteDir = buildNoteDirName(input.sourcePath).dirName;
      /** @type {string | null} */
      let batchDir = null;
      /** @type {string | null} */
      let batchId = null;
      for (let attempt = 0; attempt < MAX_BATCH_DIR_ATTEMPTS; attempt += 1) {
        const candidateId = nextBatchId();
        const candidate = `${root}/${noteDir}/${buildBatchDirName({ now, batchId: candidateId })}`;
        if (await fs.exists(candidate)) continue;
        batchDir = candidate;
        batchId = candidateId;
        break;
      }
      if (!batchDir || !batchId) {
        runActive = false;
        return { ok: false, reason: 'batch-conflict' };
      }
      try {
        await fs.mkdir(batchDir);
      } catch (error) {
        runActive = false;
        return { ok: false, reason: 'mkdir-failed', detail: sanitizeExportMessage(error instanceof Error ? error.message : String(error)) };
      }
      const dirSecurity = await verifyPathInsideRoot(batchDir);
      if (!dirSecurity.ok) {
        runActive = false;
        return { ok: false, reason: dirSecurity.reason || 'path-redirect' };
      }

      // 任务生命周期：单会话单任务；retain 失败（快照资源已最终释放）按快照失效拒绝
      const orderedPages = [...pages].sort((a, b) => Math.floor(a.ordinal) - Math.floor(b.ordinal));
      snapshotIdRef = String(input.snapshotId);
      /** @type {ReturnType<typeof session.beginExportJob>} */
      let jobBegin;
      try {
        jobBegin = session.beginExportJob({
          snapshotId: String(input.snapshotId),
          pageIds: orderedPages.map((p) => p.pageId),
          scale,
        });
      } catch {
        runActive = false;
        return { ok: false, reason: 'snapshot-released' };
      }
      if (!jobBegin.ok || !jobBegin.job) {
        runActive = false;
        return { ok: false, reason: jobBegin.reason || 'job-begin-failed' };
      }
      jobId = jobBegin.job.jobId;

      manifestState = buildManifestState({
        batchId, batchDir, sourcePath: String(input.sourcePath || ''),
        snapshotId: String(input.snapshotId), layoutKey: snapshot.layoutKey,
        scale, pages: orderedPages,
      });
      remaining = orderedPages.map((p) => ({ pageId: p.pageId, ordinal: Math.floor(p.ordinal) }));

      // 首份空清单：失败则不开始写图片（§6.1）
      const initialManifest = await updateManifest();
      if (!initialManifest.ok) {
        for (const page of remaining) patchPage(page.pageId, { status: 'skipped' });
        remaining = [];
        return await finalize({});
      }
      phase = 'running';
      const loopResult = await runPageLoop();
      if (loopResult.pausedManifest) {
        phase = 'paused-manifest';
        return {
          status: 'paused-manifest',
          manifestPending: true,
          batchDir: manifestState.batchDir,
          manifestPath: manifestState.manifestPath,
          summary: summaryOf(),
          results: manifestState.pages.map((p) => ({ ...p })),
          reason: 'manifest-write-failed',
        };
      }
      return await finalize({});
    }

    /**
     * 清单单独重试：paused-manifest 时修复后若还有剩余页由 resume() 续跑；
     * 已收尾（最终清单失败）时重写成功即视为记录修复完成。
     * @returns {Promise<{ ok: boolean, reason?: string, finalized?: boolean, outcome?: CardExportOutcome }>}
     */
    async function retryManifest() {
      if (!manifestState) return { ok: false, reason: 'no-batch' };
      if (phase === 'running') return { ok: false, reason: 'export-in-progress' };
      const update = await updateManifest();
      if (!update.ok) return { ok: false, reason: update.reason || 'manifest-write-failed' };
      if (phase === 'paused-manifest' && remaining.length === 0) {
        const outcome = await finalize({});
        return { ok: true, finalized: true, outcome };
      }
      // 已收尾但最终清单失败：重写成功即视为记录修复完成，重新收尾更新任务状态
      if (phase === 'done' && needsFinalSettle) {
        const outcome = await finalize({});
        return { ok: true, finalized: true, outcome };
      }
      return { ok: true };
    }

    /** 清单修复后继续剩余页（§6.1：清单修复成功后才允许继续，不重新捕获已保存图片）。 */
    async function resume() {
      if (phase !== 'paused-manifest') return { ok: false, reason: 'not-paused' };
      // 清单不健康时先尝试修复（修复成功才允许续跑；修复失败拒绝）
      if (!manifestHealthy) {
        const repair = await updateManifest();
        if (!repair.ok) return { ok: false, reason: 'manifest-unhealthy' };
      }
      phase = 'running';
      const loopResult = await runPageLoop();
      if (loopResult.pausedManifest) {
        phase = 'paused-manifest';
        return {
          ok: true,
          outcome: /** @type {CardExportOutcome} */ ({
            status: 'paused-manifest',
            manifestPending: true,
            batchDir: manifestState ? manifestState.batchDir : '',
            manifestPath: manifestState ? manifestState.manifestPath : '',
            summary: summaryOf(),
            results: manifestState ? manifestState.pages.map((p) => ({ ...p })) : [],
            reason: 'manifest-write-failed',
          }),
        };
      }
      return { ok: true, outcome: await finalize({}) };
    }

    /**
     * 同批次失败页重试（§6.2：同一冻结快照内重试；成功页不重写）。
     * 新任务引用同一 snapshotId（缓存内仍持有）；清单核验批次归属后合并结果。
     * @returns {Promise<{ ok: boolean, reason?: string, outcome?: CardExportOutcome }>}
     */
    async function retryFailedPages() {
      if (phase !== 'done') return { ok: false, reason: 'export-not-finished' };
      if (!manifestState || !snapshotIdRef) return { ok: false, reason: 'no-batch' };
      const failedPages = manifestState.pages.filter((p) => p.status === 'failed');
      if (failedPages.length === 0) return { ok: false, reason: 'no-failed-pages' };
      // 清单归属核验：批次标识与快照必须匹配现批次，不允许覆盖其他批次的清单（§6.1）
      try {
        const raw = await fs.readText(manifestState.manifestPath);
        const parsedJson = /** @type {unknown} */ (JSON.parse(raw));
        const parsed = /** @type {{ batchId?: string, snapshotId?: string }} */ (parsedJson);
        if (parsed?.batchId !== manifestState.batchId || parsed?.snapshotId !== snapshotIdRef) {
          return { ok: false, reason: 'manifest-foreign' };
        }
      } catch {
        // 清单缺失/损坏：重建为本任务自己的清单（首次创建走排他语义）
      }
      const snapshot = session.getSnapshot(snapshotIdRef);
      if (!snapshot) return { ok: false, reason: 'snapshot-missing' };
      const pageIds = failedPages.map((p) => p.pageId);
      /** @type {ReturnType<typeof session.beginExportJob>} */
      let jobBegin;
      try {
        jobBegin = session.beginExportJob({ snapshotId: snapshotIdRef, pageIds, scale: manifestState.scale });
      } catch {
        runActive = false;
        return { ok: false, reason: 'snapshot-released' };
      }
      if (!jobBegin.ok || !jobBegin.job) {
        runActive = false;
        return { ok: false, reason: jobBegin.reason || 'job-begin-failed' };
      }
      jobId = jobBegin.job.jobId;
      for (const page of failedPages) {
        // 失败页复位为待处理；此前成功页保持不动（不重新捕获/不重写）
        patchPage(page.pageId, { status: 'pending', reason: undefined, detail: undefined });
      }
      remaining = failedPages.map((p) => ({ pageId: p.pageId, ordinal: p.ordinal }));
      phase = 'running';
      const loopResult = await runPageLoop();
      if (loopResult.pausedManifest) {
        phase = 'paused-manifest';
        return {
          ok: true,
          outcome: /** @type {CardExportOutcome} */ ({
            status: 'paused-manifest',
            manifestPending: true,
            batchDir: manifestState.batchDir,
            manifestPath: manifestState.manifestPath,
            summary: summaryOf(),
            results: manifestState.pages.map((p) => ({ ...p })),
            reason: 'manifest-write-failed',
          }),
        };
      }
      return { ok: true, outcome: await finalize({}) };
    }

    /** @returns {{ batchDir: string, manifestPath: string, batchId: string } | null} */
    function getBatchInfo() {
      if (!manifestState) return null;
      return {
        batchDir: manifestState.batchDir,
        manifestPath: manifestState.manifestPath,
        batchId: manifestState.batchId,
      };
    }

    return {
      exportCards,
      retryManifest,
      resume,
      retryFailedPages,
      getBatchInfo,
    };
  }

  return createCardExporterForSession();
}
