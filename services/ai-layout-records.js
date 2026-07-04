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
