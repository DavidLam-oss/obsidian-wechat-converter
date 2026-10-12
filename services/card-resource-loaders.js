/*
## 核心功能

卡片资源的默认加载器（自 card-resources.js 拆出）：远程图片经 Obsidian requestUrl 主进程转发取字节、
本地 vault 图经 vault.readBinary、data: URL 内存解码（不使用全局 fetch）、图片解码尺寸探测、已加载字节内联为 data: URL、字体就绪等待；以及统一的取消错误构造。

## 输入

无构造参数（`createDefaultLoaders()`）；运行环境需要 window / Image / FileReader / Document.fonts
（可用 `pool` 的 `loaders` 选项整体替换，测试注入替身）。

## 输出

- `createDefaultLoaders()` → CardResourceLoaders（fetchBlob / decodeImage / blobToDataUrl / waitFonts）。
- `abortError()` → name 为 "AbortError" 的 Error。

## 定位

位于 services/，属于卡片资源层的 IO 适配部分；资源语义（预算、诊断、快照冻结、引用计数）
仍在 card-resources.js，本模块不含业务规则。

## 依赖

`./obsidian-compat.js`（requestUrl 能力探测）；浏览器全局 Image/FileReader/atob。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 新增加载能力须保持「可整体注入替换」的契约（见 CardResourceLoaders typedef）。
*/

import { getObsidianRequestUrl } from './obsidian-compat.js';

/**
 * data: URL → Blob（base64 与百分号编码两种载荷）。
 * @param {string} dataUrl
 * @returns {Blob}
 */
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const meta = comma >= 0 ? dataUrl.slice(5, comma) : '';
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  const mime = meta.split(';')[0] || 'application/octet-stream';
  if (/;base64/i.test(meta)) {
    const binary = window.atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/** @returns {Error} */
export function abortError() {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * 默认加载器：基于活动窗口（支持 popout window 的 Document）。
 * @returns {import('./card-resources.js').CardResourceLoaders}
 */
export function createDefaultLoaders() {
  return {
    /**
     * 取图片字节（不使用全局 fetch，遵循 Obsidian 社区审核规则）：
     * - data:image/* → 内存解码；
     * - vault 本地图（资源池解析出 vaultPath）→ `vault.readBinary`；
     * - 远程 http(s) → Obsidian requestUrl（主进程转发，不受渲染进程 CORS 限制）。
     * requestUrl / readBinary 不支持 AbortSignal，取消语义由外层「晚到结果丢弃」兜底（§5.6）。
     * @param {string} src
     * @param {AbortSignal} signal
     * @param {{ vaultPath?: string, mime?: string, app?: import('./card-resources.js').CardAppLike | null }} [context]
     * @returns {Promise<{ blob: Blob }>}
     */
    async fetchBlob(src, signal, context = {}) {
      if (signal.aborted) throw abortError();
      if (/^data:/i.test(src)) return { blob: dataUrlToBlob(src) };
      const vault = context.app?.vault;
      const vaultFile = context.vaultPath ? vault?.getAbstractFileByPath?.(context.vaultPath) : null;
      if (vaultFile && typeof vault?.readBinary === 'function') {
        /** @type {ArrayBuffer} */
        const buffer = await vault.readBinary(vaultFile);
        if (signal.aborted) throw abortError();
        return { blob: new Blob([/** @type {BlobPart} */ (buffer)], { type: context.mime || 'image/png' }) };
      }
      if (/^https?:\/\//i.test(src)) {
        const requestUrl = getObsidianRequestUrl();
        if (typeof requestUrl !== 'function') throw new Error('当前环境缺少 requestUrl，无法加载远程图片');
        const response = await requestUrl({ url: src, throw: false });
        if (signal.aborted) throw abortError();
        if (!response || response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP ${response?.status ?? 'unknown'}（requestUrl）`);
        }
        const headers = response.headers || {};
        const mime = String(headers['content-type'] || headers['Content-Type'] || '').split(';')[0] || 'image/png';
        return { blob: new Blob([/** @type {BlobPart} */ (response.arrayBuffer)], { type: mime }) };
      }
      throw new Error(`无法读取图片资源：${src.slice(0, 80)}`);
    },
    /**
     * @param {string} src
     * @param {AbortSignal} signal
     * @param {Blob} [blob]
     * @returns {Promise<{ width: number, height: number }>}
     */
    decodeImage(src, signal, blob) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        let objectUrl = '';
        if (blob instanceof Blob && typeof URL?.createObjectURL === 'function') {
          try {
            objectUrl = URL.createObjectURL(blob);
          } catch (e) {
            void e;
            objectUrl = '';
          }
        }
        const targetSrc = objectUrl || src;
        const cleanup = () => {
          if (objectUrl) {
            try {
              URL.revokeObjectURL(objectUrl);
            } catch (e) {
              void e;
            }
          }
        };
        const onAbort = () => {
          cleanup();
          image.src = '';
          reject(abortError());
        };
        if (signal.aborted) {
          cleanup();
          reject(abortError());
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        image.onload = () => {
          cleanup();
          signal.removeEventListener('abort', onAbort);
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
          cleanup();
          signal.removeEventListener('abort', onAbort);
          reject(new Error('图片解码失败'));
        };
        image.src = targetSrc;
      });
    },
    /**
     * 已加载字节 → 内联 data: URL。
     * 捕获引擎（modern-screenshot）会对非 data: 的图片发起 fetch，跨域图（COS 等无 CORS 头）
     * 失败后回退 1×1 透明占位图 → 成片丢图。资源层先内联，引擎直接跳过取图（§5.5 受控远程）。
     * @param {Blob} blob
     * @returns {Promise<string>}
     */
    blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result.startsWith('data:')) {
            reject(new Error('图片无法内联为 data URL'));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(reader.error || new Error('图片无法内联为 data URL'));
        reader.readAsDataURL(blob);
      });
    },
    /**
     * @param {Document} doc
     * @param {AbortSignal} signal
     * @returns {Promise<"ok">}
     */
    waitFonts(doc, signal) {
      return new Promise((resolve, reject) => {
        // Document.fonts 在部分 TS lib 中缺失，经 any 中转后按最小接口断言（双 cast 规避 no-unsafe-assignment）
        const docLike = /** @type {{ fonts?: { ready?: Promise<unknown> } }} */ (
          /** @type {unknown} */ (doc)
        );
        const fonts = docLike.fonts;
        if (!fonts || typeof fonts.ready?.then !== 'function') {
          resolve('ok');
          return;
        }
        fonts.ready.then(
          () => {
            if (!signal.aborted) resolve('ok');
          },
          () => {
            if (!signal.aborted) resolve('ok'); // 字体查询失败按可用字体继续
          }
        );
        signal.addEventListener(
          'abort',
          () => reject(abortError()),
          { once: true }
        );
      });
    },
  };
}
