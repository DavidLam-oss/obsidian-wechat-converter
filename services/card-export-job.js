/*
## 核心功能

卡片导出任务生命周期状态机（B01，自 card-session.js 拆出）：单会话单任务、逐页结果落账、
取消语义（请求取消不中断已启动页）、任务存活状态与弹窗展示状态分离、完成后转入待查看。

## 输入

`createExportJobState({ nextId, toLayoutKey, cloneAndFreeze })`：
- `beginExportJob(input, snapshots)`：开始任务（snapshots 为会话快照 Map，任务期间 retain 资源）。
- `shouldStartNextPage(jobId)` / `recordPageResult(jobId, pageId, result)` / `requestCancel(jobId)`。
- `lifecycleCancel()` / `completeExport(jobId, result)` / `closeExportModal()` / `reopenExportView(disposed)`。
- `markResultSeen()` / `hasActiveJob()` / `getActiveJob()` / `getLastJob()` / `releaseActiveJob()`（dispose 用）。

## 输出

任务公开视图 `CardExportJobView`（冻结副本；display 独立于 state）；结果页强制携带任务冻结的 snapshotId。

## 关键语义（§5.4 / §6.2）

- 单会话同时只允许一个运行/取消中任务；任务期间持有快照引用。
- 仅 running 允许调度下一页；canceling 后停止调度，已启动页不受影响。
- recordPageResult 在 running/canceling 均接受（写入已启动后取消仍计入已保存）。
- 关弹窗只关展示层（display="closed"），不取消任务、不释放快照。
- completeExport：final state 落账、释放快照引用、结果转入待查看（unseenResult）。
- releaseActiveJob：视图终止语义——释放任务对快照的持有，任务本体不再可用。

## 定位

位于 services/，卡片导出的纯状态层；card-session.js 内嵌组合（依赖经参数注入，无反向依赖）。
不导入 Obsidian/DOM，可在 node 下独立测试。

## 依赖

无运行时依赖；nextId/toLayoutKey/cloneAndFreeze 由 card-session.js 注入。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否准确。
- 任务/预览状态枚举变更须同步 project-types.js 的视图状态类型与规划 §5.4/§6.2。
- 禁止在此引入 DOM、Obsidian app 或直接调用渲染/捕获引擎。
*/

/**
 * @typedef {"running"|"canceling"|"completed"|"partial"|"failed"|"canceled"} CardExportJobState
 */

/**
 * 单页导出结果（snapshotId 由状态机强制注入，导出各页必然引用同一冻结快照）。
 * @typedef {{ pageId: string, snapshotId: string, status: "saved"|"failed"|"canceled", bytes?: number, width?: number, height?: number, reason?: string }} CardExportPageResult
 */

/**
 * 导出任务公开视图（冻结副本；display 是弹窗展示状态，独立于 state 任务存活状态）。
 * @typedef {{
 *   jobId: string, snapshotId: string, state: CardExportJobState, display: "open"|"closed",
 *   pageIds: string[], scale: number, results: CardExportPageResult[], cancelRequested: boolean,
 *   unseenResult: boolean, versions: Record<string, number>, layoutKey: string
 * }} CardExportJobView
 */

/** 会话持有的运行中任务内部态 */
/**
 * @typedef {{
 *   job: { jobId: string, snapshotId: string, state: CardExportJobState, display: "open"|"closed",
 *     pageIds: string[], scale: number, results: CardExportPageResult[], cancelRequested: boolean,
 *     unseenResult: boolean },
 *   resources: { retain(): any, release(): void } | null,
 *   versions: Record<string, number>, layoutKey: string
 * }} ActiveJobEntry
 */

/**
 * 创建导出任务生命周期状态机。
 * @param {{
 *   nextId: (prefix: string) => string,
 *   toLayoutKey: (versions: Record<string, number>) => string,
 *   cloneAndFreeze: <T>(value: T) => T,
 * }} deps
 */
export function createExportJobState(deps) {
  const { nextId, toLayoutKey, cloneAndFreeze } = deps;

  /** @type {ActiveJobEntry | null} */
  let activeJob = null;
  /** @type {CardExportJobView | null} 待查看的最近完成结果 */
  let lastJob = null;

  /**
   * 任务公开视图的冻结副本。
   * @param {ActiveJobEntry} entry
   * @param {CardExportJobState} state
   * @returns {CardExportJobView}
   */
  function jobView(entry, state) {
    return cloneAndFreeze({
      jobId: entry.job.jobId,
      snapshotId: entry.job.snapshotId,
      state,
      display: entry.job.display,
      pageIds: entry.job.pageIds,
      scale: entry.job.scale,
      results: entry.job.results,
      cancelRequested: entry.job.cancelRequested,
      unseenResult: entry.job.unseenResult,
      versions: entry.versions,
      layoutKey: entry.layoutKey,
    });
  }

  return {
    /**
     * 开始导出任务：单会话同时只允许一个运行/取消中任务（§5.4）；任务期间持有快照引用。
     * @param {{ snapshotId: string, pageIds: string[], scale: number }} input
     * @param {Map<string, { data: { versions: Record<string, number> }, resources: { retain(): any, release(): void } | null }>} snapshots
     * @returns {{ ok: boolean, reason?: string, job?: CardExportJobView }}
     */
    beginExportJob(input, snapshots) {
      if (activeJob) return { ok: false, reason: "job-active" };
      const entry = snapshots.get(input.snapshotId);
      if (!entry) return { ok: false, reason: "snapshot-missing" };
      if (entry.resources && typeof entry.resources.retain === "function") entry.resources.retain();
      /** @type {ActiveJobEntry} */
      const active = {
        job: {
          jobId: nextId("job"),
          snapshotId: input.snapshotId,
          state: "running",
          display: "open",
          pageIds: [...input.pageIds],
          scale: input.scale,
          results: [],
          cancelRequested: false,
          unseenResult: true,
        },
        resources: entry.resources,
        versions: { ...entry.data.versions },
        layoutKey: toLayoutKey(entry.data.versions),
      };
      activeJob = active;
      return { ok: true, job: jobView(active, "running") };
    },

    /**
     * 下一页调度许可：仅 running 为 true；canceling 后停止调度（已启动页不受影响）。
     * @param {string} jobId
     * @returns {boolean}
     */
    shouldStartNextPage(jobId) {
      return !!activeJob && activeJob.job.jobId === jobId && activeJob.job.state === "running";
    },

    /**
     * 记录单页结果：running/canceling 均接受（§6.2「写入已启动后取消仍计入已保存」）。
     * 结果强制携带任务冻结的 snapshotId（导出各页引用同一快照）。
     * @param {string} jobId
     * @param {string} pageId
     * @param {Omit<CardExportPageResult, "snapshotId">} result
     * @returns {{ applied: boolean }}
     */
    recordPageResult(jobId, pageId, result) {
      if (!activeJob || activeJob.job.jobId !== jobId) return { applied: false };
      const state = activeJob.job.state;
      if (state !== "running" && state !== "canceling") return { applied: false };
      if (!activeJob.job.pageIds.includes(pageId)) return { applied: false };
      /** @type {CardExportPageResult} */
      const entry = {
        pageId,
        snapshotId: activeJob.job.snapshotId,
        status: result.status,
      };
      if (result.bytes !== undefined) entry.bytes = result.bytes;
      if (result.width !== undefined) entry.width = result.width;
      if (result.height !== undefined) entry.height = result.height;
      if (result.reason !== undefined) entry.reason = result.reason;
      activeJob.job.results.push(Object.freeze(entry));
      return { applied: true };
    },

    /**
     * 请求取消：running → canceling；不中断已启动页。
     * @param {string} jobId
     * @returns {{ applied: boolean }}
     */
    requestCancel(jobId) {
      if (!activeJob || activeJob.job.jobId !== jobId) return { applied: false };
      if (activeJob.job.state !== "running") return { applied: false };
      activeJob.job.state = "canceling";
      activeJob.job.cancelRequested = true;
      return { applied: true };
    },

    /** 生命周期取消（§6.2）：标记取消、收起展示层；结果仍可落账后收尾。@returns {boolean} 是否有运行中任务被取消 */
    lifecycleCancel() {
      if (!activeJob || activeJob.job.state !== "running") return false;
      activeJob.job.state = "canceling";
      activeJob.job.cancelRequested = true;
      activeJob.job.display = "closed";
      return true;
    },

    /**
     * 任务收尾：final state 落账、释放快照引用、结果转入待查看（unseenResult）。
     * @param {string} jobId
     * @param {{ status: "completed"|"partial"|"failed"|"canceled", summary?: string }} result
     * @returns {{ applied: boolean }}
     */
    completeExport(jobId, result) {
      if (!activeJob || activeJob.job.jobId !== jobId) return { applied: false };
      if (activeJob.job.state !== "running" && activeJob.job.state !== "canceling") {
        return { applied: false };
      }
      const finished = jobView(activeJob, result.status);
      lastJob = /** @type {CardExportJobView} */ ({
        ...finished,
        display: "closed",
        unseenResult: true,
      });
      if (activeJob.resources && typeof activeJob.resources.release === "function") {
        activeJob.resources.release();
      }
      activeJob = null;
      return { applied: true };
    },

    /** 关闭导出弹窗：只关展示层，任务继续、快照不释放（§6.2）。 */
    closeExportModal() {
      if (activeJob) activeJob.job.display = "closed";
    },

    /**
     * 再次打开导出入口：优先恢复运行中任务；有待查看结果先展示原结果，不直接开始新批次（§6.2）。
     * 会话已销毁（视图关闭）时一律无任务。
     * @param {boolean} disposed
     * @returns {{ kind: "job"|"result"|"none", job?: CardExportJobView }}
     */
    reopenExportView(disposed) {
      if (disposed) return { kind: "none" };
      if (activeJob) {
        activeJob.job.display = "open";
        return { kind: "job", job: jobView(activeJob, activeJob.job.state) };
      }
      if (lastJob && lastJob.unseenResult) {
        return { kind: "result", job: lastJob };
      }
      return { kind: "none" };
    },

    /** 查看待查看结果后标记已读。 */
    markResultSeen() {
      if (lastJob) lastJob.unseenResult = false;
    },

    /** @returns {boolean} */
    hasActiveJob() {
      return !!activeJob;
    },

    /** @returns {CardExportJobView | null} */
    getActiveJob() {
      return activeJob ? jobView(activeJob, activeJob.job.state) : null;
    },

    /** @returns {CardExportJobView | null} */
    getLastJob() {
      return lastJob ? cloneAndFreeze(lastJob) : null;
    },

    /** 视图终止语义（dispose 用）：释放任务对快照的持有并清空；任务本体不再可用，结果不承诺保留。 */
    releaseActiveJob() {
      if (activeJob) {
        if (activeJob.resources && typeof activeJob.resources.release === "function") {
          activeJob.resources.release();
        }
        activeJob = null;
      }
    },
  };
}
