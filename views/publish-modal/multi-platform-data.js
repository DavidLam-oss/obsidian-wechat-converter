/*
## 核心功能

归一化多平台 Bridge 响应、发布资源和任务结果，隔离协议兼容细节。

## 输入

Bridge 返回值、任务快照、资源集合和错误对象。

## 输出

稳定的记录、列表、资源、任务结果和兼容错误判断结果。

## 定位

位于 views/publish-modal/，是多平台发布的数据适配层。

## 依赖

关键依赖：`../../services/wechatsync-bridge.js`。

## 边界

- 不创建 DOM、不发起请求、不修改设置。
- 只移动现有数据适配逻辑，保持字段优先级和兼容行为不变。

## 维护规则

- 只做字段归一化，不创建 DOM、发起请求或修改设置。
- 新增协议字段时先补兼容测试，再调整适配器。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- reason: protocol adapters intentionally accept dynamic Bridge response shapes */

import {
  isUnsupportedBridgeMethodError as isWechatSyncUnsupportedMethodError,
} from '../../services/wechatsync-bridge.js';

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value) {
  return isRecord(value) ? value : {};
}

function toRecordList(value) {
  return Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({ ...item }))
    : [];
}

function toText(value) {
  return typeof value === 'string' ? value : '';
}

function toReadableError(error) {
  if (error instanceof Error) {
    const errorRecord = error;
    return {
      message: error.message,
      code: toText(errorRecord.code),
      stack: toText(error.stack),
    };
  }
  const record = toRecord(error);
  return {
    message: toText(record.message) || String(error || ''),
    code: toText(record.code),
    stack: toText(record.stack),
  };
}

function toEnqueueResult(value) {
  return { ...toRecord(value) };
}

function toBridgeAssets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((asset) => ({ ...asset }));
}

function toResolvedImages(value) {
  const record = toRecord(value);
  return {
    markdown: toText(record.markdown),
    assets: toBridgeAssets(record.assets),
    cover: toText(record.cover),
    firstImageSrc: toText(record.firstImageSrc),
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
  };
}

function toBridgeAsset(value) {
  const record = toRecord(value);
  if (!record.filename || !record.mimeType || typeof record.size !== 'number' || typeof record.base64 !== 'string') {
    return null;
  }
  return {
    ...record,
    filename: toText(record.filename),
    mimeType: toText(record.mimeType),
    size: record.size,
    base64: record.base64,
    source: isRecord(record.source) ? { ...record.source } : undefined,
  };
}

function toTaskResults(value) {
  return toRecordList(value).map((item) => {
    const record = toRecord(item);
    return {
      platform: toText(record.id || record.platform),
      platformName: toText(record.name),
      success: record.success === true || record.status === 'success',
      error: toText(record.error || record.message),
    };
  }).filter((item) => item.platform);
}

function getRecentTaskPlatforms(result, requestedPlatformIds) {
  const publishedPlatforms = toUnknownList(result.publishedPlatforms);
  if (publishedPlatforms.length) return publishedPlatforms;
  const resultPlatforms = toUnknownList(result.platforms);
  return resultPlatforms.length ? resultPlatforms : requestedPlatformIds;
}

function toUnknownList(value) {
  return Array.isArray(value) ? value : [];
}

function isUnsupportedBridgeError(error) {
  return isWechatSyncUnsupportedMethodError(toReadableError(error));
}

export {
  toRecord,
  toRecordList,
  toText,
  toReadableError,
  toEnqueueResult,
  toBridgeAssets,
  toResolvedImages,
  toBridgeAsset,
  toTaskResults,
  getRecentTaskPlatforms,
  toUnknownList,
  isUnsupportedBridgeError,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- reason: restore unsafe-rule checking after the dynamic protocol adapter */
