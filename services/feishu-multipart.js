/*
## 核心功能

实现飞书云文档同步链路的 feishu multipart 服务能力。

## 输入

接收飞书设置、Markdown/HTML 内容、本地图片、Mermaid 图和飞书 API 响应。

## 输出

输出 `buildMultipartBody`、`toUint8Array`，用于文档创建/更新、媒体上传、块写入或错误恢复。

## 定位

位于 services/，属于飞书发布服务层；不承载微信专属逻辑。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// services/feishu-multipart.js
//
// Small multipart/form-data builder for Feishu OpenAPI uploads.

/**
 * @param {unknown} binary
 * @returns {Uint8Array}
 */
function toUint8Array(binary) {
  if (binary instanceof Uint8Array) return binary;
  if (binary instanceof ArrayBuffer) return new Uint8Array(binary);
  if (ArrayBuffer.isView(binary)) {
    return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  return new Uint8Array(0);
}

/**
 * @param {Uint8Array[]} parts
 * @returns {ArrayBuffer}
 */
function mergeParts(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const bodyBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    bodyBuffer.set(part, offset);
    offset += part.length;
  }
  return bodyBuffer.buffer;
}

/**
 * @param {{
 *   boundary: string,
 *   fields?: Record<string, string>,
 *   file: { fieldName?: string, fileName: string, mimeType?: string, bytes: ArrayBuffer | Uint8Array },
 * }} params
 * @returns {ArrayBuffer}
 */
function buildMultipartBody({ boundary, fields = {}, file }) {
  const encoder = new TextEncoder();
  /** @type {Uint8Array[]} */
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    parts.push(encoder.encode(`${value}\r\n`));
  }

  const fileBytes = toUint8Array(file.bytes);
  parts.push(encoder.encode(`--${boundary}\r\n`));
  parts.push(encoder.encode(`Content-Disposition: form-data; name="${file.fieldName || 'file'}"; filename="${file.fileName}"\r\n`));
  parts.push(encoder.encode(`Content-Type: ${file.mimeType || 'application/octet-stream'}\r\n\r\n`));
  parts.push(fileBytes);
  parts.push(encoder.encode(`\r\n`));
  parts.push(encoder.encode(`--${boundary}--\r\n`));

  return mergeParts(parts);
}

export {
  buildMultipartBody,
  toUint8Array,
};
