/*
## 核心功能

提供服务层通用能力：ai layout records。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `toAiLayoutState`、`toAiLayoutJson`、`toAiLayoutBlock`、`toAiLayoutGenerationMeta`、`toAiLayoutSelection`、`toAiLayoutFamilyStates`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：`./record-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { isRecord } from './record-utils.js';

/**
 * @param {unknown} value
 * @returns {AiLayoutStateLike | null}
 */
function toAiLayoutState(value) {
  return isRecord(value) ? /** @type {AiLayoutStateLike} */ (value) : null;
}

/**
 * @param {unknown} value
 * @returns {AiLayoutJsonLike | null}
 */
function toAiLayoutJson(value) {
  return isRecord(value) ? /** @type {AiLayoutJsonLike} */ (value) : null;
}

/**
 * @param {unknown} value
 * @returns {AiLayoutBlockLike}
 */
function toAiLayoutBlock(value) {
  return isRecord(value) ? /** @type {AiLayoutBlockLike} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {AiLayoutGenerationMetaLike | null}
 */
function toAiLayoutGenerationMeta(value) {
  return isRecord(value) ? /** @type {AiLayoutGenerationMetaLike} */ (value) : null;
}

/**
 * @param {unknown} value
 * @returns {AiLayoutSelectionLike}
 */
function toAiLayoutSelection(value) {
  return isRecord(value) ? /** @type {AiLayoutSelectionLike} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {Record<string, AiLayoutStateLike>}
 */
function toAiLayoutFamilyStates(value) {
  if (!isRecord(value)) return {};
  return /** @type {Record<string, AiLayoutStateLike>} */ (value);
}

export {
  toAiLayoutState,
  toAiLayoutJson,
  toAiLayoutBlock,
  toAiLayoutGenerationMeta,
  toAiLayoutSelection,
  toAiLayoutFamilyStates,
};
