/*
## 核心功能

卡片默认资源加载器 fetchBlob 的取字节路径：vault 本地图走 vault.readBinary、data: URL 内存解码、
远程走 Obsidian requestUrl；不再回退全局 fetch（Obsidian 社区审核规则）。

## 输入

被测模块 services/card-resource-loaders.js；vault / requestUrl 桩。

## 输出

断言各来源读到的 Blob 类型与字节，以及全局 fetch 不被调用。
*/

import { describe, it, expect, vi, afterEach } from "vitest";
import { createDefaultLoaders } from "../services/card-resource-loaders.js";

const readBytes = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(blob);
});

describe("createDefaultLoaders().fetchBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("vault 本地图走 vault.readBinary，不调用全局 fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const file = { path: "img/cover.jpg" };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => file),
        readBinary: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
      },
    };
    const { blob } = await createDefaultLoaders().fetchBlob(
      "app://local/img/cover.jpg",
      new AbortController().signal,
      { vaultPath: "img/cover.jpg", mime: "image/jpeg", app },
    );
    expect(app.vault.readBinary).toHaveBeenCalledWith(file);
    expect(blob.type).toBe("image/jpeg");
    expect(Array.from(await readBytes(blob))).toEqual([1, 2, 3]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("data:image base64 在内存解码", async () => {
    const { blob } = await createDefaultLoaders().fetchBlob(
      "data:image/png;base64,AQID",
      new AbortController().signal,
    );
    expect(blob.type).toBe("image/png");
    expect(Array.from(await readBytes(blob))).toEqual([1, 2, 3]);
  });

  it("无 vault 文件、非 http(s)、非 data: 时显式失败而非回退 fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      createDefaultLoaders().fetchBlob("app://local/missing.png", new AbortController().signal, { app: null }),
    ).rejects.toThrow("无法读取图片资源");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("已中止的 signal 立即拒绝", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createDefaultLoaders().fetchBlob("data:image/png;base64,AQID", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
