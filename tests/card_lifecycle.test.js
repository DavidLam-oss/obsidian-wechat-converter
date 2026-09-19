/*
## 核心功能

小红书卡片生命周期、双视图预算与捕获槽隔离验证（C04）：
1. 捕获槽有界队列（MAX_CAPTURE_QUEUE_SIZE = 100）超额阻断；
2. 排队任务取消与引用释放（AbortSignal 中止排队不占槽）；
3. 逻辑超时与底层槽位生命周期分离（底层运行中不得提前放开槽位）；
4. drainCaptureQueue 清空排队与 AbortError 广播；
5. 视图关闭（disposeCardPreview / disposeCardExportModal）与会话销毁（session.dispose）；
6. 20 张批次多轮导出/取消/重试快照持有计数归零验证。

## 维护规则

- 保持文件在 800 行软限制以内。
- 契约对齐 services/card-render-capture.js、card-session.js、card-exporter.js 与 views/converter/。
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  acquireCaptureSlotForTests,
  releaseCaptureSlotForTests,
  resetCaptureSlotForTests,
  getCaptureSlotState,
  drainCaptureQueue,
  MAX_CAPTURE_QUEUE_SIZE,
} from "../services/card-render-capture.js";
import {
  createNoteCardSession,
  createCardSessionRegistry,
} from "../services/card-session.js";
import { createCardExporter } from "../services/card-exporter.js";

const { loadInputModule } = require("./helpers/input-module.cjs");
const { createObsidianLikeElement } = require("./helpers/obsidian-dom.js");

const MINIMAL_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x01, 0x77,
  0x00, 0x00, 0x01, 0xf4,
  0x08, 0x06, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
]);

describe("C04 卡片生命周期与捕获槽预算", () => {
  beforeEach(() => {
    resetCaptureSlotForTests();
  });

  afterEach(() => {
    resetCaptureSlotForTests();
  });

  describe("捕获槽有界队列与排队控制", () => {
    it("首个请求成功占用槽位，状态为 busy: true, queued: 0", async () => {
      await acquireCaptureSlotForTests();
      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 0 });
      releaseCaptureSlotForTests();
      expect(getCaptureSlotState()).toEqual({ busy: false, queued: 0 });
    });

    it("槽位占用期间新请求进入排队队列", async () => {
      await acquireCaptureSlotForTests();
      let acquiredSecond = false;
      const secondPromise = acquireCaptureSlotForTests().then(() => {
        acquiredSecond = true;
      });

      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 1 });
      expect(acquiredSecond).toBe(false);

      releaseCaptureSlotForTests();
      await secondPromise;

      expect(acquiredSecond).toBe(true);
      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 0 });
      releaseCaptureSlotForTests();
      expect(getCaptureSlotState()).toEqual({ busy: false, queued: 0 });
    });

    it("排队超过 MAX_CAPTURE_QUEUE_SIZE 时立即拒绝（CAPTURE_QUEUE_FULL）", async () => {
      await acquireCaptureSlotForTests();

      const promises = [];
      for (let i = 0; i < MAX_CAPTURE_QUEUE_SIZE; i += 1) {
        promises.push(acquireCaptureSlotForTests().catch((err) => err));
      }
      expect(getCaptureSlotState()).toEqual({ busy: true, queued: MAX_CAPTURE_QUEUE_SIZE });

      // 超过上限的第 101 个排队请求应立即被拒绝
      await expect(acquireCaptureSlotForTests()).rejects.toThrow(/capture queue limit reached/);

      // 清理已排队的任务
      drainCaptureQueue("cleanup");
      await Promise.all(promises);
      releaseCaptureSlotForTests();
      expect(getCaptureSlotState()).toEqual({ busy: false, queued: 0 });
    });

    it("逻辑超时发生后底层槽位仍保持占用，直到底层真正结束才释放（§5.6）", async () => {
      // 模拟底层任务需要 100ms
      let underlyingSettled = false;
      let resolveUnderlying;
      const underlyingPromise = new Promise((resolve) => {
        resolveUnderlying = () => {
          underlyingSettled = true;
          resolve();
        };
      });

      // 模拟类似 capturePage 内部机制：
      // 1. acquire slot
      await acquireCaptureSlotForTests();
      expect(getCaptureSlotState().busy).toBe(true);

      // 2. 底层任务持有 release 回调
      let slotReleased = false;
      const releaseOnce = () => {
        if (slotReleased) return;
        slotReleased = true;
        releaseCaptureSlotForTests();
      };
      underlyingPromise.then(releaseOnce, releaseOnce);

      // 3. 模拟逻辑层 20ms 超时先行返回
      await new Promise((r) => setTimeout(r, 20));
      // 此时逻辑层已超时，但底层尚未结束：捕获槽必须依然为 busy，不能提前放开
      expect(underlyingSettled).toBe(false);
      expect(getCaptureSlotState().busy).toBe(true);

      // 排队的下一个任务不能获取到槽位
      let nextAcquired = false;
      acquireCaptureSlotForTests().then(() => { nextAcquired = true; });
      expect(getCaptureSlotState().queued).toBe(1);
      expect(nextAcquired).toBe(false);

      // 4. 底层真正结束
      resolveUnderlying();
      await Promise.resolve();
      await Promise.resolve();

      // 底层结束触发 releaseOnce 后，排队中的下一个任务才获得槽位
      expect(underlyingSettled).toBe(true);
      expect(nextAcquired).toBe(true);
      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 0 });
      releaseCaptureSlotForTests();
    });

    it("排队中收到 AbortSignal 时立即移除自身并不占用后续槽位", async () => {
      await acquireCaptureSlotForTests(); // Task 1 占有槽位

      const controller = new AbortController();
      let task2Resolved = false;
      let task2Error = null;

      const task2 = acquireCaptureSlotForTests({ signal: controller.signal })
        .then(() => { task2Resolved = true; })
        .catch((err) => { task2Error = err; });

      let task3Resolved = false;
      const task3 = acquireCaptureSlotForTests()
        .then(() => { task3Resolved = true; });

      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 2 });

      // 取消 Task 2
      controller.abort();
      await task2;

      expect(task2Resolved).toBe(false);
      expect(task2Error).toBeTruthy();
      expect(task2Error.name).toBe("AbortError");
      // Task 2 已被移出队列，队列只剩 Task 3
      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 1 });

      // 释放 Task 1，Task 3 应立即获得槽位
      releaseCaptureSlotForTests();
      await task3;

      expect(task3Resolved).toBe(true);
      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 0 });
      releaseCaptureSlotForTests();
    });

    it("已处于 aborted 状态的 signal 请求立即拒绝，不入队", async () => {
      await acquireCaptureSlotForTests();
      const controller = new AbortController();
      controller.abort();

      await expect(acquireCaptureSlotForTests({ signal: controller.signal })).rejects.toThrow();
      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 0 });
      releaseCaptureSlotForTests();
    });

    it("drainCaptureQueue 清空全部排队任务并抛出 AbortError", async () => {
      await acquireCaptureSlotForTests();

      let err1 = null;
      let err2 = null;
      acquireCaptureSlotForTests().catch((err) => { err1 = err; });
      acquireCaptureSlotForTests().catch((err) => { err2 = err; });

      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 2 });

      drainCaptureQueue("view-closed");
      await Promise.resolve();

      expect(err1).toBeTruthy();
      expect(err1.name).toBe("AbortError");
      expect(err2).toBeTruthy();
      expect(err2.name).toBe("AbortError");
      expect(getCaptureSlotState()).toEqual({ busy: true, queued: 0 });

      releaseCaptureSlotForTests();
    });
  });

  describe("会话与快照生命周期销毁", () => {
    it("session.dispose() 取消运行中任务并释放所有快照引用", () => {
      const session = createNoteCardSession({ sourcePath: "notes/sample.md" });
      let releasedCount = 0;
      const fakeResource = {
        retain: () => fakeResource,
        release: () => { releasedCount += 1; },
      };

      const snap = session.freezeSnapshot({
        plan: { ok: true, pages: [{ pageId: "p1", ordinal: 1 }] },
        resources: fakeResource,
      });

      expect(releasedCount).toBe(0);

      const jobRes = session.beginExportJob({
        snapshotId: snap.snapshotId,
        pageIds: ["p1"],
        scale: 2,
      });
      expect(jobRes.ok).toBe(true);
      expect(session.hasActiveJob()).toBe(true);
      expect(session.shouldStartNextPage(jobRes.job.jobId)).toBe(true);

      // 销毁会话
      session.dispose();

      expect(session.disposed).toBe(true);
      expect(session.shouldStartNextPage(jobRes.job.jobId)).toBe(false);
      // 快照被释放
      expect(releasedCount).toBeGreaterThanOrEqual(1);

      // 销毁后拒绝新任务
      const newJob = session.beginExportJob({
        snapshotId: snap.snapshotId,
        pageIds: ["p1"],
        scale: 2,
      });
      expect(newJob.ok).toBe(false);
      expect(newJob.reason).toBe("disposed");
    });

    it("registry.disposeAll() 销毁所有管理的笔记会话", () => {
      const registry = createCardSessionRegistry();
      const s1 = registry.getSession("notes/a.md");
      const s2 = registry.getSession("notes/b.md");

      expect(s1.disposed).toBe(false);
      expect(s2.disposed).toBe(false);

      registry.disposeAll();

      expect(s1.disposed).toBe(true);
      expect(s2.disposed).toBe(true);
      expect(registry.listSessions()).toEqual([]);
    });
  });

  describe("视图与弹窗生命周期清理集成", () => {
    it("disposeCardPreview 清除合并定时器并销毁注册表", () => {
      const { AppleStyleView } = loadInputModule();
      const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
      view.containerEl = createObsidianLikeElement();
      view.previewContainer = createObsidianLikeElement();

      // 触发会话生成
      const reg = view.getCardSessions();
      const session = reg.getSession("notes/test.md");
      expect(session.disposed).toBe(false);

      // 设置假定时器
      view.cardPreviewMergeTimer = window.setTimeout(() => {}, 5000);

      view.disposeCardPreview();

      expect(view.cardPreviewMergeTimer).toBeNull();
      expect(session.disposed).toBe(true);
      expect(view.cardSessionRegistry).toBeNull();
    });

    it("disposeCardExportModal 释放弹窗控制器与资源（幂等）", () => {
      const { AppleStyleView } = loadInputModule();
      const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
      view.containerEl = createObsidianLikeElement();

      let resourcesDisposed = 0;
      view.cardExportController = {
        disposeResources: () => { resourcesDisposed += 1; },
      };
      view.cardExportModal = {
        close: vi.fn(),
      };

      view.disposeCardExportModal();

      expect(resourcesDisposed).toBe(1);
      expect(view.cardExportController).toBeNull();
      expect(view.cardExportModal).toBeNull();

      // 再次调用幂等不抛错
      expect(() => view.disposeCardExportModal()).not.toThrow();
    });
  });

  describe("多轮 20 张批次导出/取消/重试压力与持有计数验证", () => {
    it("进行 3 轮导出、中途取消与重试，成功图片保留且快照资源计数清零", async () => {
      const session = createNoteCardSession({ sourcePath: "notes/heavy.md" });

      let retainCount = 1;
      let finalReleaseCalled = false;
      const fakeSnapshotResource = {
        retain: () => { retainCount += 1; return fakeSnapshotResource; },
        release: () => {
          retainCount -= 1;
          if (retainCount <= 0) finalReleaseCalled = true;
        },
      };

      // 20 页计划
      const pages = Array.from({ length: 20 }, (_, i) => ({
        pageId: `page-${i + 1}`,
        ordinal: i + 1,
      }));

      const snapshot = session.freezeSnapshot({
        plan: { ok: true, pages },
        resources: fakeSnapshotResource,
      });

      const fakeFs = {
        files: new Map(),
        async exists(p) { return this.files.has(p); },
        async mkdir() {},
        async createBinaryExclusive(p, bytes) {
          if (this.files.has(p)) return { ok: false, reason: "conflict" };
          this.files.set(p, bytes);
          return { ok: true };
        },
        async writeBinary(p, bytes) { this.files.set(p, bytes); },
        async readText() { return ""; },
        async realpath(p) { return "/vault/" + p; },
      };

      // 第一轮：运行 20 张，前 5 张后取消
      let captureCount = 0;
      const exporter1 = createCardExporter({
        session,
        fs: fakeFs,
        capturePageBytes: async ({ ordinal }) => {
          captureCount += 1;
          if (ordinal === 5) {
            const active = session.getActiveJob();
            if (active) session.requestCancel(active.jobId);
          }
          return { bytes: MINIMAL_PNG_BYTES };
        },
      });

      const outcome1 = await exporter1.exportCards({
        rootPath: "卡片导出",
        snapshotId: snapshot.snapshotId,
        sourcePath: "notes/heavy.md",
        scale: 2,
        pageSize: { width: 375, height: 500 },
        pages,
      });

      expect(outcome1.status).toBe("canceled");
      expect(captureCount).toBe(5);
      expect(outcome1.summary.saved).toBe(5);
      expect(outcome1.summary.canceled).toBe(15);
      expect(fakeFs.files.size).toBe(5); // 已经保存的 5 张图片不可变且保留

      // 第二轮：重试剩余 15 张
      const remainingPages = pages.slice(5);
      const exporter2 = createCardExporter({
        session,
        fs: fakeFs,
        capturePageBytes: async () => ({ bytes: MINIMAL_PNG_BYTES }),
      });

      const outcome2 = await exporter2.exportCards({
        rootPath: "卡片导出",
        snapshotId: snapshot.snapshotId,
        sourcePath: "notes/heavy.md",
        scale: 2,
        pageSize: { width: 375, height: 500 },
        pages: remainingPages,
      });

      expect(outcome2.status).toBe("completed");
      expect(outcome2.summary.saved).toBe(15);
      expect(fakeFs.files.size).toBe(20); // 全部 20 张均已保存

      // 第三轮：整批完成后销毁会话
      session.dispose();
      expect(session.disposed).toBe(true);

      // 模拟资源池/创建方在快照生命周期结束时释放初始引用
      fakeSnapshotResource.release();
      expect(finalReleaseCalled).toBe(true);
      expect(retainCount).toBe(0);
    });
  });
});
