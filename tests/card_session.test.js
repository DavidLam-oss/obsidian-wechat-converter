// @vitest-environment node
import { describe, it, expect } from "vitest";

/* 卡片会话层契约测试（B01，规划 §8.3）：
   状态隔离、版本键身份校验、晚到结果丢弃、快照不可变与资源所有权、
   选择/省略确认跨版本失效、导出任务生命周期（关弹窗不取消/重开恢复/生命周期取消）。
   无 UI、无 DOM；受控 Promise 驱动异步路径。 */

import {
  createNoteCardSession,
  createCardSessionRegistry,
  createPreviewRunner,
  MAX_RECENT_SNAPSHOTS,
} from "../services/card-session.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** 手动控制 resolve 的 deferred */
function deferred() {
  /** @type {(v: any) => void} */
  let resolve;
  /** @type {(e: any) => void} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: /** @type {(v: any) => void} */ (resolve), reject };
}

/** 可释放资源替身（retain/release 计数） */
function fakeResources() {
  const counter = { retains: 0, releases: 0 };
  return {
    counter,
    retain() {
      counter.retains += 1;
      return this;
    },
    release() {
      counter.releases += 1;
    },
  };
}

describe("注册表：按笔记隔离", () => {
  it("同路径返回同一会话实例，不同路径相互隔离", () => {
    const registry = createCardSessionRegistry();
    const a = registry.getSession("notes/a.md");
    const a2 = registry.getSession("notes/a.md");
    const b = registry.getSession("notes/b.md");
    expect(a).toBe(a2);
    expect(a).not.toBe(b);
    // 版本各自独立：bump a 不影响 b 的 layoutKey
    const keyBBefore = b.currentLayoutKey();
    a.bumpContent();
    expect(b.currentLayoutKey()).toBe(keyBBefore);
  });

  it("文件改名迁移会话身份：noteId 与状态保持，路径键更新", () => {
    const registry = createCardSessionRegistry();
    const session = registry.getSession("notes/old.md");
    session.bumpContent();
    const previewRunner = createPreviewRunner(session, async () => ({ ok: true }));
    void previewRunner;
    const noteIdBefore = session.noteId;
    expect(registry.renameNote("notes/old.md", "notes/new.md")).toBe(true);
    const migrated = registry.getSession("notes/new.md");
    expect(migrated).toBe(session);
    expect(migrated.noteId).toBe(noteIdBefore);
    expect(migrated.currentLayoutKey()).toBe("c2.k1.t1.r1");
    expect(registry.has("notes/old.md")).toBe(false);
  });

  it("删除文件使会话失效：同路径再取得到全新身份", () => {
    const registry = createCardSessionRegistry();
    const session = registry.getSession("notes/gone.md");
    const oldId = session.noteId;
    registry.removeNote("notes/gone.md");
    expect(session.disposed).toBe(true);
    const fresh = registry.getSession("notes/gone.md");
    expect(fresh.noteId).not.toBe(oldId);
    expect(fresh.disposed).toBe(false);
  });
});

describe("版本键与预览身份校验", () => {
  it("layoutKey 由四元版本组成；bump 只影响对应分量", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    expect(session.currentLayoutKey()).toBe("c1.k1.t1.r1");
    session.bumpConfig();
    expect(session.currentLayoutKey()).toBe("c1.k2.t1.r1");
    session.bumpContent();
    expect(session.currentLayoutKey()).toBe("c2.k2.t1.r1");
    session.bumpTheme();
    expect(session.currentLayoutKey()).toBe("c2.k2.t2.r1");
    session.bumpResource();
    expect(session.currentLayoutKey()).toBe("c2.k2.t2.r2");
  });

  it("旧请求晚到：版本变化后 settle 被拒，旧内容无法覆盖新预览", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const tokenA = session.beginPreviewUpdate();
    expect(tokenA).not.toBeNull();
    session.bumpContent(); // 用户编辑
    const result = session.settlePreviewUpdate(tokenA, { ok: true });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("version-changed");
    expect(session.getPreviewState().state).toBe("updating");
  });

  it("连续请求：旧 seq 被 newer 取代后 settle 丢弃（superseded）", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const tokenA = session.beginPreviewUpdate();
    const tokenB = session.beginPreviewUpdate();
    expect(session.settlePreviewUpdate(tokenA, { ok: true })).toEqual({ applied: false, reason: "superseded" });
    expect(session.settlePreviewUpdate(tokenB, { ok: true })).toEqual({ applied: true });
    expect(session.getPreviewState().state).toBe("ready");
  });

  it("设置连改：只有最新 token 且版本仍一致的结果生效", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    session.beginPreviewUpdate(); // 请求 1（被取代）
    session.bumpConfig();
    session.beginPreviewUpdate(); // 请求 2（被取代）
    session.bumpConfig();
    const token3 = session.beginPreviewUpdate();
    // token3 期间又改设置 → 也失效；必须再次 begin
    session.bumpTheme();
    expect(session.settlePreviewUpdate(token3, { ok: true }).applied).toBe(false);
    const token4 = session.beginPreviewUpdate();
    expect(session.settlePreviewUpdate(token4, { ok: true }).applied).toBe(true);
  });

  it("预览状态流转：idle→updating→ready；失败落账；旧预览暂留标 stale", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    expect(session.getPreviewState()).toMatchObject({ state: "idle", hasResult: false, stale: false });
    session.beginPreviewUpdate();
    expect(session.getPreviewState()).toMatchObject({ state: "updating", stale: false });
    session.settlePreviewUpdate(session.beginPreviewUpdate(), { ok: true });
    expect(session.getPreviewState()).toMatchObject({ state: "ready", stale: false });
    // 再次更新：旧结果暂留，stale = true
    session.beginPreviewUpdate();
    expect(session.getPreviewState()).toMatchObject({ state: "updating", hasResult: true, stale: true });
    // 失败落账
    session.settlePreviewUpdate(session.beginPreviewUpdate(), { ok: false, error: "boom" });
    expect(session.getPreviewState()).toMatchObject({ state: "failed", hasResult: true });
  });

  it("含省略的结果标记 hasOmissions；cancel 后回到旧结果状态", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    session.settlePreviewUpdate(session.beginPreviewUpdate(), { ok: true, omissions: { codeBlock: 2 } });
    expect(session.getPreviewState().hasOmissions).toBe(true);
    session.beginPreviewUpdate();
    session.cancelPreviewUpdate();
    expect(session.getPreviewState()).toMatchObject({ state: "ready", hasOmissions: true });
  });

  it("markPreviewStale：编辑事件到达即置 stale；无结果时 no-op；在途旧排版不再回写 ready", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });

    // 无结果（首渲染前）：不产生虚假的 updating
    session.markPreviewStale();
    expect(session.getPreviewState()).toMatchObject({ state: "idle", hasResult: false, stale: false });

    // 有旧结果：事件到达即 stale（§5.6 ≤250ms 的会话侧保证）
    session.settlePreviewUpdate(session.beginPreviewUpdate(), { ok: true });
    expect(session.getPreviewState()).toMatchObject({ state: "ready", stale: false });
    session.markPreviewStale();
    expect(session.getPreviewState()).toMatchObject({ state: "updating", hasResult: true, stale: true });

    // 合并等待窗口内完成的旧内容排版被作废：不短暂回写 ready 吞掉提示
    const inFlight = session.beginPreviewUpdate(); // 模拟 markStale 前已启动的旧排版（seq 落后）
    session.markPreviewStale();
    expect(session.settlePreviewUpdate(inFlight, { ok: true })).toMatchObject({ applied: false, reason: "superseded" });
    expect(session.getPreviewState()).toMatchObject({ state: "updating", stale: true });

    // 合并后的新排版落账 → 回到 ready
    session.settlePreviewUpdate(session.beginPreviewUpdate(), { ok: true });
    expect(session.getPreviewState()).toMatchObject({ state: "ready", stale: false });
  });

  it("settle 在会话销毁后被拒", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const token = session.beginPreviewUpdate();
    session.dispose();
    expect(session.settlePreviewUpdate(token, { ok: true })).toEqual({ applied: false, reason: "disposed" });
  });
});

describe("预览编排器（受控 Promise）", () => {
  it("A→B→A：切换笔记期间旧排版完成也不回灌（晚到丢弃）", async () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    /** @type {ReturnType<typeof deferred> | null} */
    let gate = null;
    let calls = 0;
    const runner = createPreviewRunner(session, () => {
      calls += 1;
      if (calls === 1) {
        gate = deferred();
        return gate.promise.then(() => ({ ok: true }));
      }
      return Promise.resolve({ ok: true });
    });

    const first = runner.schedule();
    await tick(); // 让 gate 建立并进入 updating
    expect(session.getPreviewState().state).toBe("updating");
    // 用户继续编辑 → 取消在途任务并起新一轮（runLayout 已返回结果时立即落账）
    runner.cancel();
    const second = runner.schedule();
    const secondResult = await second;
    expect(secondResult).toEqual({ applied: true });
    // 旧 Promise 迟到 resolve → 不得覆盖
    if (gate) gate.resolve();
    const firstResult = await first;
    expect(firstResult).toEqual({ applied: false, reason: "superseded" });
    expect(session.getPreviewState().state).toBe("ready");
  });

  it("runLayout 抛错落账为 failed", async () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const runner = createPreviewRunner(session, async () => {
      throw new Error("layout boom");
    });
    const result = await runner.schedule();
    expect(result).toEqual({ applied: true });
    expect(session.getPreviewState().state).toBe("failed");
  });
});

describe("冻结快照：不可变与资源所有权", () => {
  it("快照不受后续设置对象原地修改污染（深拷贝冻结）", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const plan = { pages: [{ pageId: "p1", height: 500 }], meta: { ratio: "3:4" } };
    const snapshot = session.freezeSnapshot({ plan });
    // 调用方事后原地改 plan
    plan.pages[0].height = 99999;
    plan.meta.ratio = "9:16";
    plan.pages.push({ pageId: "p2", height: 1 });
    expect(snapshot.plan.pages[0].height).toBe(500);
    expect(snapshot.plan.meta.ratio).toBe("3:4");
    expect(snapshot.plan.pages).toHaveLength(1);
    expect(Object.isFrozen(snapshot.plan)).toBe(true);
    expect(snapshot.versions).toEqual({ content: 1, config: 1, theme: 1, resource: 1 });
  });

  it("快照记录冻结时的版本与 layoutKey", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    session.bumpContent();
    const snapshot = session.freezeSnapshot({});
    expect(snapshot.versions.content).toBe(2);
    expect(snapshot.layoutKey).toBe("c2.k1.t1.r1");
  });

  it("资源所有权：freeze retain、release 释放、导出任务持有期间不归零", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const res = fakeResources();
    const snapshot = session.freezeSnapshot({ resources: res });
    expect(res.counter.retains).toBe(1);
    expect(res.counter.releases).toBe(0);
    // 任务持有：再 retain
    const job = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ["p1"], scale: 2 });
    expect(job.ok).toBe(true);
    expect(res.counter.retains).toBe(2);
    session.completeExport(/** @type {any} */ (job).job.jobId, { status: "completed" });
    expect(res.counter.releases).toBe(1); // 任务释放自己的持有
    session.releaseSnapshot(snapshot.snapshotId);
    expect(res.counter.releases).toBe(2); // 快照释放
    expect(session.getSnapshot(snapshot.snapshotId)).toBeNull();
  });

  it(`快照缓存上限 ${MAX_RECENT_SNAPSHOTS}：淘汰最旧并释放其资源`, () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const res = fakeResources();
    const first = session.freezeSnapshot({ resources: res });
    for (let i = 0; i < MAX_RECENT_SNAPSHOTS; i += 1) {
      session.bumpContent();
      session.freezeSnapshot({});
    }
    expect(session.getSnapshot(first.snapshotId)).toBeNull(); // 最旧被淘汰
    expect(res.counter.releases).toBe(1);
  });
});

describe("选择与省略确认的版本绑定", () => {
  it("选择有效后任一版本变化即失效（默认恢复全部由调用方执行）", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    session.setSelection(["p1", "p3"]);
    expect(session.getValidSelection()).toMatchObject({ pageIds: ["p1", "p3"] });
    session.bumpResource();
    expect(session.getValidSelection()).toBeNull();
  });

  it("已确认省略不能跨版本复用", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    session.confirmOmissions("diag-v1");
    expect(session.isOmissionConfirmed("diag-v1")).toBe(true);
    session.bumpContent(); // 编辑正文
    expect(session.isOmissionConfirmed("diag-v1")).toBe(false);
  });

  it("诊断版本不匹配的确认同样视为无效", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    session.confirmOmissions("diag-v1");
    expect(session.isOmissionConfirmed("diag-v2")).toBe(false);
  });
});

describe("导出任务生命周期", () => {
  function sessionWithSnapshot() {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const snapshot = session.freezeSnapshot({ plan: { pages: [{ pageId: "p1" }, { pageId: "p2" }, { pageId: "p3" }] } });
    return { session, snapshot };
  }

  it("导出各页引用相同 snapshotId（recordPageResult 强制注入）", () => {
    const { session, snapshot } = sessionWithSnapshot();
    const { job } = /** @type {any} */ (
      session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ["p1", "p2", "p3"], scale: 2 })
    );
    for (const pageId of ["p1", "p2", "p3"]) {
      session.recordPageResult(job.jobId, pageId, { status: "saved", bytes: 100, width: 750, height: 1000 });
    }
    const active = /** @type {any} */ (session.getActiveJob());
    expect(active.results).toHaveLength(3);
    for (const result of active.results) {
      expect(result.snapshotId).toBe(snapshot.snapshotId);
    }
  });

  it("单会话同时只允许一个运行中任务；任务结束后才能开始新任务", () => {
    const { session, snapshot } = sessionWithSnapshot();
    const first = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ["p1"], scale: 2 });
    expect(first.ok).toBe(true);
    const second = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ["p1"], scale: 2 });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("job-active");
    session.completeExport(/** @type {any} */ (first).job.jobId, { status: "completed" });
    const third = session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ["p1"], scale: 2 });
    expect(third.ok).toBe(true);
  });

  it("快照不存在时拒绝开始任务", () => {
    const { session } = sessionWithSnapshot();
    expect(session.beginExportJob({ snapshotId: "nope", pageIds: ["p1"], scale: 2 })).toEqual({
      ok: false,
      reason: "snapshot-missing",
    });
  });

  it("取消语义：停止调度下一页，已启动页落账仍计入；最终状态 canceled", () => {
    const { session, snapshot } = sessionWithSnapshot();
    const { job } = /** @type {any} */ (
      session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ["p1", "p2", "p3"], scale: 2 })
    );
    session.recordPageResult(job.jobId, "p1", { status: "saved" });
    session.requestCancel(job.jobId);
    expect(session.getActiveJob().state).toBe("canceling");
    expect(session.getActiveJob().cancelRequested).toBe(true);
    // 取消后不再调度
    expect(session.shouldStartNextPage(job.jobId)).toBe(false);
    // 已启动页（p2）写入成功仍计入
    expect(session.recordPageResult(job.jobId, "p2", { status: "saved" }).applied).toBe(true);
    // 未启动页不再落成功
    expect(session.recordPageResult(job.jobId, "p3", { status: "canceled" }).applied).toBe(true);
    session.completeExport(job.jobId, { status: "canceled" });
    const last = /** @type {any} */ (session.getLastJob());
    expect(last.state).toBe("canceled");
    expect(last.results.map((/** @type {any} */ r) => r.status)).toEqual(["saved", "saved", "canceled"]);
    expect(session.hasActiveJob()).toBe(false);
  });

  it("重复 complete / canceling 后再 requestCancel 均被拒", () => {
    const { session, snapshot } = sessionWithSnapshot();
    const { job } = /** @type {any} */ (
      session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ["p1"], scale: 2 })
    );
    session.requestCancel(job.jobId);
    expect(session.requestCancel(job.jobId).applied).toBe(false); // 已是 canceling
    expect(session.completeExport(job.jobId, { status: "canceled" }).applied).toBe(true);
    expect(session.completeExport(job.jobId, { status: "canceled" }).applied).toBe(false);
  });

  it("关弹窗不取消、不释放快照；重开恢复同一任务（不新建重复任务）", () => {
    const { session, snapshot } = sessionWithSnapshot();
    const res = fakeResources();
    session.releaseSnapshot(snapshot.snapshotId); // 仅测试隔离：重建带资源的快照
    const snap2 = session.freezeSnapshot({ resources: res });
    const { job } = /** @type {any} */ (
      session.beginExportJob({ snapshotId: snap2.snapshotId, pageIds: ["p1"], scale: 3 })
    );
    session.closeExportModal();
    const closed = /** @type {any} */ (session.getActiveJob());
    expect(closed.state).toBe("running"); // 任务存活状态不变
    expect(closed.display).toBe("closed");
    expect(res.counter.releases).toBe(0); // 快照不释放
    const reopened = session.reopenExportView();
    expect(reopened.kind).toBe("job");
    expect(/** @type {any} */ (reopened.job).jobId).toBe(job.jobId); // 同一任务
    expect(/** @type {any} */ (reopened.job).display).toBe("open");
  });

  it("完成后重开先展示待查看结果，不直接开新批次；已读后不再复现", () => {
    const { session, snapshot } = sessionWithSnapshot();
    const { job } = /** @type {any} */ (
      session.beginExportJob({ snapshotId: snapshot.snapshotId, pageIds: ["p1"], scale: 2 })
    );
    session.recordPageResult(job.jobId, "p1", { status: "saved" });
    session.completeExport(job.jobId, { status: "completed" });
    const view = session.reopenExportView();
    expect(view.kind).toBe("result");
    expect(/** @type {any} */ (view.job).jobId).toBe(job.jobId);
    expect(/** @type {any} */ (view.job).unseenResult).toBe(true);
    session.markResultSeen();
    expect(session.reopenExportView()).toEqual({ kind: "none" });
  });

  it("导出中换篇：另一笔记会话不受影响，取消与释放不串任务", () => {
    const registry = createCardSessionRegistry();
    const sA = registry.getSession("a.md");
    const sB = registry.getSession("b.md");
    const resA = fakeResources();
    const resB = fakeResources();
    const snapA = sA.freezeSnapshot({ resources: resA });
    const snapB = sB.freezeSnapshot({ resources: resB });
    const jobA = /** @type {any} */ (sA.beginExportJob({ snapshotId: snapA.snapshotId, pageIds: ["p1"], scale: 2 }).job);
    const jobB = /** @type {any} */ (sB.beginExportJob({ snapshotId: snapB.snapshotId, pageIds: ["p1"], scale: 2 }).job);
    // 取消 A：B 完全不受影响
    sA.requestCancel(jobA.jobId);
    expect(sB.shouldStartNextPage(jobB.jobId)).toBe(true);
    expect(sB.getActiveJob().state).toBe("running");
    sA.completeExport(jobA.jobId, { status: "canceled" });
    expect(resB.counter.releases).toBe(0); // B 的资源没被动过
    // B 正常完成
    sB.recordPageResult(jobB.jobId, "p1", { status: "saved" });
    sB.completeExport(jobB.jobId, { status: "completed" });
    expect(resA.counter.releases).toBe(1); // A 只释放自己的任务持有
    expect(resB.counter.releases).toBe(1); // B 收尾释放自己的
    expect(sB.getLastJob().state).toBe("completed");
    expect(sB.getLastJob().results[0].snapshotId).toBe(snapB.snapshotId);
  });

  it("视图关闭：生命周期取消标记 canceling、结果仍可落账；dispose 后拒绝新任务并释放全部资源", () => {
    const registry = createCardSessionRegistry();
    const session = registry.getSession("a.md");
    const res = fakeResources();
    const snap = session.freezeSnapshot({ resources: res });
    const job = /** @type {any} */ (session.beginExportJob({ snapshotId: snap.snapshotId, pageIds: ["p1", "p2"], scale: 2 }).job);
    session.lifecycleCancel();
    expect(session.getActiveJob().state).toBe("canceling");
    expect(session.getActiveJob().display).toBe("closed");
    // 尽力收尾：已启动页结果仍落账
    expect(session.recordPageResult(job.jobId, "p1", { status: "saved" }).applied).toBe(true);
    registry.disposeAll();
    expect(session.disposed).toBe(true);
    expect(res.counter.releases).toBe(2); // 任务持有 + 快照持有
    expect(session.beginExportJob({ snapshotId: snap.snapshotId, pageIds: ["p1"], scale: 2 }).reason).toBe("disposed");
    expect(() => session.freezeSnapshot({})).toThrow(/已销毁/);
  });

  it("dispose 后 reopen 不再返回任务", () => {
    const session = createNoteCardSession({ sourcePath: "a.md" });
    const snap = session.freezeSnapshot({});
    const { job } = /** @type {any} */ (session.beginExportJob({ snapshotId: snap.snapshotId, pageIds: ["p1"], scale: 2 }));
    session.lifecycleCancel();
    session.completeExport(job.jobId, { status: "canceled" });
    session.dispose();
    expect(session.reopenExportView()).toEqual({ kind: "none" });
  });
});
