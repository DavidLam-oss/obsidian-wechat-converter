/*
## 核心功能

卡片资源的默认加载器（自 card-resources.js 拆出）：远程图片经 Obsidian requestUrl 主进程转发取字节、
标准 fetch 回退、图片解码尺寸探测、已加载字节内联为 data: URL、字体就绪等待；以及统一的取消错误构造。

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

`./obsidian-compat.js`（requestUrl 能力探测）；浏览器全局 fetch/Image/FileReader。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 新增加载能力须保持「可整体注入替换」的契约（见 CardResourceLoaders typedef）。
*/

import { getObsidianRequestUrl } from './obsidian-compat.js';

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
     * 远程 http(s) 优先走 Obsidian requestUrl（主进程转发，不受渲染进程 CORS 限制；
     * 参考 Export Img remote-images 的做法），失败或不可用时回退标准 fetch。
     * requestUrl 不支持 AbortSignal，取消语义由外层「晚到结果丢弃」兜底（§5.6）。
     * @param {string} src
     * @param {AbortSignal} signal
     * @returns {Promise<{ blob: Blob }>}
     */
    async fetchBlob(src, signal) {
      if (/^https?:\/\//i.test(src)) {
        try {
          const requestUrl = getObsidianRequestUrl();
          if (typeof requestUrl === 'function') {
            const response = await requestUrl({ url: src, throw: false });
            if (response && response.status >= 200 && response.status < 300) {
              const buffer = /** @type {ArrayBufferLike} */ (response.arrayBuffer);
              const mime = String(response.headers?.['content-type'] || '').split(';')[0] || 'image/png';
              return { blob: new Blob([/** @type {BlobPart} */ (buffer)], { type: mime }) };
            }
            throw new Error(`HTTP ${response?.status ?? 'unknown'}（requestUrl）`);
          }
        } catch (error) {
          if (signal.aborted) throw abortError();
          // 回退 fetch（可能因 CORS 失败，届时进入显式资源失败诊断）
          void error;
        }
      }
      const response = await fetch(src, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return { blob };
    },
    /**
     * @param {string} src
     * @param {AbortSignal} signal
     * @returns {Promise<{ width: number, height: number }>}
     */
    decodeImage(src, signal) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        const onAbort = () => {
          image.src = '';
          reject(abortError());
        };
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        image.onload = () => {
          signal.removeEventListener('abort', onAbort);
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
          signal.removeEventListener('abort', onAbort);
          reject(new Error('图片解码失败'));
        };
        image.src = src;
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
