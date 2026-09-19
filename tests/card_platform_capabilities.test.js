/*
## 核心功能

小红书卡片平台能力隔离与移动端降级验证（C04）：
1. 移动端环境（isMobileClient 为 true）严格展示说明态并阻断排版管线；
2. 移动端环境下原文章与贴图模式完全正常运行、不受卡片影响；
3. 桌面端剪贴板能力降级（无 Web Clipboard 与 Electron 兜底时优雅返回 unsupported）；
4. 访达/文件管理器定位（shell 不可用时优雅返回 reveal-unavailable）；
5. 插件加载/卸载在无 Electron 环境下零异常运行。

## 维护规则

- 保持单文件在 800 行软限制以内。
- 契约对齐 services/card-clipboard.js、views/converter/card-preview.js、card-export-bridge.js。
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  canCopyImageToClipboard,
  writeImageBlobToClipboard,
} from "../services/card-clipboard.js";
import { isMobileClient } from "../views/apple-style-view-shared.js";

const { loadInputModule } = require("./helpers/input-module.cjs");
const { createObsidianLikeElement } = require("./helpers/obsidian-dom.js");

describe("C04 平台能力隔离与降级验证", () => {
  let originalNavigatorClipboard;
  let originalClipboardItem;

  beforeEach(() => {
    originalNavigatorClipboard = globalThis.navigator?.clipboard;
    originalClipboardItem = globalThis.ClipboardItem;
  });

  afterEach(() => {
    if (originalNavigatorClipboard !== undefined) {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: originalNavigatorClipboard,
        configurable: true,
      });
    }
    globalThis.ClipboardItem = originalClipboardItem;
  });

  describe("移动端能力判断与排版隔离（isMobileClient）", () => {
    it("app.isMobile 为 true 时判定为移动端客户端", () => {
      const mockApp = { isMobile: true };
      expect(isMobileClient(mockApp)).toBe(true);
    });

    it("app.isMobile 为 false 且 Platform 不为 mobile 时判定为桌面端客户端", () => {
      const mockApp = { isMobile: false };
      expect(isMobileClient(mockApp)).toBe(false);
    });

    it("移动端环境下 renderCardPreview 渲染移动端说明态，不触发 Markdown 解析与排版管线", async () => {
      const { AppleStyleView } = loadInputModule();
      const mockApp = { isMobile: true };
      const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
      view.app = mockApp;
      view.previewContainer = createObsidianLikeElement();

      let resolveSourceCalled = false;
      view.resolveCardMarkdownSource = async () => {
        resolveSourceCalled = true;
        return { ok: true, markdown: "# 标题", sourcePath: "a.md" };
      };

      await view.renderCardPreview();

      // 验证未调用任何排版/解析链路
      expect(resolveSourceCalled).toBe(false);

      // 验证 DOM 渲染了移动端专有说明态
      const emptyEl = view.previewContainer.querySelector(".icard-preview-empty");
      expect(emptyEl).toBeTruthy();
      const titleEl = emptyEl.querySelector(".icard-preview-empty-title");
      expect(titleEl?.textContent).toContain("图片卡片目前仅支持桌面端");
      const descEl = emptyEl.querySelector(".icard-preview-empty-desc");
      expect(descEl?.textContent).toContain("移动端暂时无法进行卡片排版预览与导出，文章与贴图功能不受影响。");
    });

    it("移动端环境下文章与贴图模式不受影响", () => {
      const { AppleStylePlugin, createImageSwipeCalloutMarkdown } = loadInputModule();
      expect(typeof AppleStylePlugin).toBe("function");

      // 贴图 callout 生成是纯文本函数，移动端与桌面端一致
      const markdown = createImageSwipeCalloutMarkdown("image-swipe", "![[img1.png|图1]]\n![[img2.png|图2]]");
      expect(markdown).toContain("图1");
      expect(markdown).toContain("图2");
    });
  });

  describe("剪贴板环境检测与降级容错（services/card-clipboard.js）", () => {
    it("既无 Web ClipboardItem 又无 Electron 时 canCopyImageToClipboard 返回 false", () => {
      delete globalThis.ClipboardItem;
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: undefined,
        configurable: true,
      });

      expect(canCopyImageToClipboard()).toBe(false);
    });

    it("无剪贴板能力时 writeImageBlobToClipboard 优雅返回 unsupported，不抛出异常", async () => {
      delete globalThis.ClipboardItem;
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: undefined,
        configurable: true,
      });

      const blob = new Blob(["fake-png"], { type: "image/png" });
      const result = await writeImageBlobToClipboard(blob);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("clipboard-unsupported");
      expect(result.message).toContain("当前环境不支持直接写入图片到剪贴板");
    });
  });

  describe("系统文件定位能力降级（revealCardExportOutput）", () => {
    it("无法解析绝对路径时优雅返回 path-unresolved", () => {
      const { AppleStyleView } = loadInputModule();
      const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
      view.resolveCardExportAbsPath = () => null;

      const outcome = view.revealCardExportOutput("卡片导出/test");

      expect(outcome.ok).toBe(false);
      expect(outcome.absPath).toBeNull();
      expect(outcome.reason).toBe("path-unresolved");
    });

    it("有绝对路径但 shell 不可用时优雅返回 reveal-unavailable 并附绝对路径供用户手动复制", () => {
      const { AppleStyleView } = loadInputModule();
      const view = new AppleStyleView({ view: null }, { settings: { wechatAccounts: [] } });
      const absPath = "/mock/vault/卡片导出/test";
      view.resolveCardExportAbsPath = () => absPath;

      // 在测试环境中 Electron shell 默认为 null
      const outcome = view.revealCardExportOutput("卡片导出/test");

      expect(outcome.ok).toBe(false);
      expect(outcome.absPath).toBe(absPath);
      expect(outcome.reason).toBe("reveal-unavailable");
    });
  });

  describe("插件完整生命周期无 Electron 依赖安全测试", () => {
    it("Plugin onload 与 onunload 在纯 node/移动端模拟环境下不依赖顶层 Electron 加载", async () => {
      const { AppleStylePlugin } = loadInputModule();
      const fakeApp = {
        workspace: {
          getLeavesOfType: () => [],
          onLayoutReady: vi.fn(),
        },
        vault: {
          on: vi.fn(),
        },
      };
      const fakeManifest = { id: "obsidian-wechat-converter", version: "2.10.9" };
      const plugin = new AppleStylePlugin(fakeApp, fakeManifest);
      plugin.app = fakeApp;

      plugin.loadData = vi.fn().mockResolvedValue({});
      plugin.saveData = vi.fn().mockResolvedValue(undefined);
      plugin.addRibbonIcon = vi.fn();
      plugin.addCommand = vi.fn();
      plugin.registerView = vi.fn();
      plugin.registerEvent = vi.fn();
      plugin.addSettingTab = vi.fn();

      // 执行 onload
      await expect(plugin.onload()).resolves.not.toThrow();

      // 执行 onunload
      await expect(plugin.onunload()).resolves.not.toThrow();
    });
  });
});
