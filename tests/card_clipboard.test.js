/*
## 核心功能

小红书卡片单张复制（C03）测试：
1. 剪贴板环境检测（canCopyImageToClipboard）；
2. 剪贴板写入（writeImageBlobToClipboard，支持 ClipboardItem 与兜底）；
3. 单张复制编排（copySingleCardImage）：
   - 统一输出资格检查（未接受省略/布局失败等硬阻断拦截，但不受 empty-selection 影响）；
   - 内存捕获与 PNG 尺寸核验；
   - 零磁盘落盘（绝不触碰本地文件系统 / vault）；
   - 页面有效性校验（封面与正文越界处理）；
4. 视图集成（copyCardPageImage 与 DOM 按钮交互反馈）。

## 维护规则

- 严格遵守单文件 800 行软线规范。
- 契约对齐 services/card-clipboard.js 与 views/converter/card-export-bridge.js。
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  canCopyImageToClipboard,
  writeImageBlobToClipboard,
  copySingleCardImage,
  DEFAULT_CARD_CLIPBOARD_SCALE,
} from "../services/card-clipboard.js";
import { createCardSessionRegistry } from "../services/card-session.js";

const { loadInputModule } = require("./helpers/input-module.cjs");
const { createObsidianLikeElement } = require("./helpers/obsidian-dom.js");
const { resetViewTestGlobals } = require("./helpers/view-test-helpers.js");

// 构造一个最小有效 1x1 像素 PNG 字节（供 readPngSize 测试）
const MINIMAL_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG 签名
  0x00, 0x00, 0x00, 0x0d,                         // IHDR 长度 13
  0x49, 0x48, 0x44, 0x52,                         // "IHDR"
  0x00, 0x00, 0x01, 0x77,                         // width = 375
  0x00, 0x00, 0x01, 0xf4,                         // height = 500
  0x08, 0x06, 0x00, 0x00, 0x00,                   // 8-bit RGBA
  0x00, 0x00, 0x00, 0x00,                         // CRC (桩)
]);

describe("card-clipboard 服务层", () => {
  describe("环境能力检测（canCopyImageToClipboard）", () => {
    it("环境支持 navigator.clipboard.write 与 ClipboardItem 时返回 true", () => {
      const origClipboard = globalThis.navigator?.clipboard;
      const origClipboardItem = globalThis.ClipboardItem;

      globalThis.ClipboardItem = class MockClipboardItem {};
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { write: vi.fn() },
        configurable: true,
      });

      expect(canCopyImageToClipboard()).toBe(true);

      if (origClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", {
          value: origClipboard,
          configurable: true,
        });
      }
      globalThis.ClipboardItem = origClipboardItem;
    });

    it("环境缺少剪贴板对象时安全回落为 false（非 Electron 且无 ClipboardItem）", () => {
      const origClipboardItem = globalThis.ClipboardItem;
      delete globalThis.ClipboardItem;

      expect(canCopyImageToClipboard()).toBe(false);

      globalThis.ClipboardItem = origClipboardItem;
    });
  });

  describe("剪贴板写入（writeImageBlobToClipboard）", () => {
    it("调用 navigator.clipboard.write 写入 image/png Blob", async () => {
      const writeMock = vi.fn().mockResolvedValue(undefined);
      const origClipboard = globalThis.navigator?.clipboard;
      const origClipboardItem = globalThis.ClipboardItem;

      globalThis.ClipboardItem = class MockClipboardItem {
        constructor(items) {
          this.items = items;
        }
      };
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { write: writeMock },
        configurable: true,
      });

      const blob = new Blob([MINIMAL_PNG_BYTES], { type: "image/png" });
      const result = await writeImageBlobToClipboard(blob, MINIMAL_PNG_BYTES);

      expect(result.ok).toBe(true);
      expect(writeMock).toHaveBeenCalledTimes(1);

      if (origClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", {
          value: origClipboard,
          configurable: true,
        });
      }
      globalThis.ClipboardItem = origClipboardItem;
    });

    it("navigator.clipboard.write 失败时返回包含错误信息的失败结果", async () => {
      const writeMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
      const origClipboard = globalThis.navigator?.clipboard;
      const origClipboardItem = globalThis.ClipboardItem;

      globalThis.ClipboardItem = class MockClipboardItem {
        constructor(items) {
          this.items = items;
        }
      };
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { write: writeMock },
        configurable: true,
      });

      const blob = new Blob([MINIMAL_PNG_BYTES], { type: "image/png" });
      const result = await writeImageBlobToClipboard(blob, MINIMAL_PNG_BYTES);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("clipboard-failed");
      expect(result.message).toContain("Permission denied");

      if (origClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", {
          value: origClipboard,
          configurable: true,
        });
      }
      globalThis.ClipboardItem = origClipboardItem;
    });
  });

  describe("单张复制编排（copySingleCardImage）", () => {
    let registry;
    let session;
    let baseOutcome;

    beforeEach(() => {
      registry = createCardSessionRegistry();
      session = registry.getSession("test.md");
      baseOutcome = {
        ok: true,
        layoutKey: "layout-v1",
        pages: [{}, {}], // 2 页正文
        coverPage: {},
        omissionSummary: { total: 0 },
        resources: { hasBlockingFailures: false },
      };
    });

    it("成功全流程：资格合格 → 内存捕获 → 写入剪贴板 → 返回成功与尺寸（零磁盘写入）", async () => {
      const captureMock = vi.fn().mockResolvedValue({ bytes: MINIMAL_PNG_BYTES });
      const writeMock = vi.fn().mockResolvedValue({ ok: true });

      const result = await copySingleCardImage({
        session,
        pageId: "page-1",
        ordinal: 1,
        outcome: baseOutcome,
        scale: 2,
        capturePageBytes: captureMock,
        writeClipboard: writeMock,
      });

      expect(result.ok).toBe(true);
      expect(result.size).toEqual({ width: 375, height: 500 });
      expect(result.bytes).toBe(MINIMAL_PNG_BYTES.byteLength);

      expect(captureMock).toHaveBeenCalledWith({
        pageId: "page-1",
        ordinal: 1,
        scale: 2,
      });
      expect(writeMock).toHaveBeenCalledTimes(1);
    });

    it("封面复制：pageId='cover' 且 ordinal=0 时可正常捕获封面", async () => {
      const captureMock = vi.fn().mockResolvedValue({ bytes: MINIMAL_PNG_BYTES });
      const writeMock = vi.fn().mockResolvedValue({ ok: true });

      const result = await copySingleCardImage({
        session,
        pageId: "cover",
        ordinal: 0,
        outcome: baseOutcome,
        capturePageBytes: captureMock,
        writeClipboard: writeMock,
      });

      expect(result.ok).toBe(true);
      expect(captureMock).toHaveBeenCalledWith({
        pageId: "cover",
        ordinal: 0,
        scale: DEFAULT_CARD_CLIPBOARD_SCALE,
      });
    });

    it("未确认的省略内容阻断单张复制", async () => {
      const outcomeWithOmission = {
        ...baseOutcome,
        omissionSummary: { total: 2 },
      };
      const captureMock = vi.fn();

      const result = await copySingleCardImage({
        session,
        pageId: "page-1",
        ordinal: 1,
        outcome: outcomeWithOmission,
        capturePageBytes: captureMock,
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("omissions-unconfirmed");
      expect(captureMock).not.toHaveBeenCalled();

      // 确认省略后放行
      session.confirmOmissions("layout-v1");
      const okResult = await copySingleCardImage({
        session,
        pageId: "page-1",
        ordinal: 1,
        outcome: outcomeWithOmission,
        capturePageBytes: vi.fn().mockResolvedValue({ bytes: MINIMAL_PNG_BYTES }),
        writeClipboard: vi.fn().mockResolvedValue({ ok: true }),
      });
      expect(okResult.ok).toBe(true);
    });

    it("不受 empty-selection 阻断：会话勾选为空集合时不影响单张复制", async () => {
      // 模拟会话设置了空选择
      session.getValidSelection = () => ({ pageIds: [], isAll: false });

      const captureMock = vi.fn().mockResolvedValue({ bytes: MINIMAL_PNG_BYTES });
      const writeMock = vi.fn().mockResolvedValue({ ok: true });

      const result = await copySingleCardImage({
        session,
        pageId: "page-1",
        ordinal: 1,
        outcome: baseOutcome,
        capturePageBytes: captureMock,
        writeClipboard: writeMock,
      });

      expect(result.ok).toBe(true);
    });

    it("排版失败（layout-failed）阻断复制", async () => {
      const failedOutcome = { ...baseOutcome, ok: false };
      const captureMock = vi.fn();

      const result = await copySingleCardImage({
        session,
        pageId: "page-1",
        ordinal: 1,
        outcome: failedOutcome,
        capturePageBytes: captureMock,
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("layout-failed");
      expect(captureMock).not.toHaveBeenCalled();
    });

    it("目标页码越界或未开启封面时阻断复制（page-not-found）", async () => {
      // 越界正文页
      const resultPage = await copySingleCardImage({
        session,
        pageId: "page-99",
        ordinal: 99,
        outcome: baseOutcome,
        capturePageBytes: vi.fn(),
      });
      expect(resultPage.ok).toBe(false);
      expect(resultPage.reason).toBe("page-not-found");

      // 无封面时请求封面
      const noCoverOutcome = { ...baseOutcome, coverPage: null };
      const resultCover = await copySingleCardImage({
        session,
        pageId: "cover",
        ordinal: 0,
        outcome: noCoverOutcome,
        capturePageBytes: vi.fn(),
      });
      expect(resultCover.ok).toBe(false);
      expect(resultCover.reason).toBe("page-not-found");
    });

    it("捕获返回非有效 PNG 数据时阻断（capture-invalid）", async () => {
      const invalidBytes = new Uint8Array([1, 2, 3, 4]); // 非 PNG 头
      const result = await copySingleCardImage({
        session,
        pageId: "page-1",
        ordinal: 1,
        outcome: baseOutcome,
        capturePageBytes: vi.fn().mockResolvedValue({ bytes: invalidBytes }),
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("capture-invalid");
    });
  });
});

describe("AppleStyleView 视图集成（copyCardPageImage）", () => {
  let AppleStyleView;
  let view;

  beforeEach(() => {
    resetViewTestGlobals(vi);
    const inputModule = loadInputModule();
    AppleStyleView = inputModule.AppleStyleView;

    view = new AppleStyleView(null, {
      settings: {},
    });

    const testPath = "test-note.md";
    view.cardPreviewPendingInput = { sourcePathKey: testPath, markdown: "# Title", sourcePath: testPath };
    view.getCardSettingsSession = () => view.getCardSessions().getSession(testPath);
    view.prepareCardExportResources = vi.fn().mockReturnValue({
      ensure: vi.fn().mockResolvedValue({}),
      summary: vi.fn().mockReturnValue({ ready: 0, failed: 0 }),
      release: vi.fn(),
    });
    view.createCardCaptureCallback = vi.fn().mockResolvedValue({ bytes: MINIMAL_PNG_BYTES });
  });

  afterEach(() => {
    resetViewTestGlobals(vi);
  });

  it("copyCardPageImage 成功时更新按钮状态并在 1.5s 后复原", async () => {
    view.cardRenderOutcome = {
      ok: true,
      layoutKey: "layout-v1",
      pages: [{}],
      omissionSummary: { total: 0 },
      resources: { hasBlockingFailures: false },
    };

    const btn = createObsidianLikeElement();
    const origClipboard = globalThis.navigator?.clipboard;
    const origClipboardItem = globalThis.ClipboardItem;

    globalThis.ClipboardItem = class MockClipboardItem {};
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { write: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    vi.useFakeTimers();

    const promise = view.copyCardPageImage("page-1", btn);
    expect(btn.classList.contains("is-copying")).toBe(true);

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(btn.classList.contains("is-copying")).toBe(false);
    expect(btn.classList.contains("is-copied")).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(btn.classList.contains("is-copied")).toBe(false);

    if (origClipboard) {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: origClipboard,
        configurable: true,
      });
    }
    globalThis.ClipboardItem = origClipboardItem;
  });

  it("未确认省略时 copyCardPageImage 返回阻断信息并不调用捕获", async () => {
    view.cardRenderOutcome = {
      ok: true,
      layoutKey: "layout-v1",
      pages: [{}],
      omissionSummary: { total: 3 },
      resources: { hasBlockingFailures: false },
    };

    const btn = createObsidianLikeElement();
    const result = await view.copyCardPageImage("page-1", btn);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("omissions-unconfirmed");
    expect(btn.classList.contains("is-copying")).toBe(false);
    expect(view.createCardCaptureCallback).not.toHaveBeenCalled();
  });
});
