/*
## 核心功能

提供服务层通用能力：record utils。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `isRecord`、`toRecord`、`toOptionalText`、`toOptionalNumber`、`parseJsonRecord`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function toRecord(value) {
  return isRecord(value) ? value : {};
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toOptionalText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function toOptionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function parseJsonRecord(value) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    return toRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

export {
  isRecord,
  toRecord,
  toOptionalText,
  toOptionalNumber,
  parseJsonRecord,
};
