// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import { clampNumber, coerceString, toAiLayoutBlocks, toRecord } from './utils.js';

function normalizeGenerationBlockOrigin(raw = {}, fallbackIndex = 0) {
  const rawRecord = toRecord(raw);
  if (!Object.keys(rawRecord).length) return null;
  const source = rawRecord.source === 'fallback' ? 'fallback' : 'ai';
  const type = coerceString(rawRecord.type);
  if (!type) return null;
  return {
    index: clampNumber(rawRecord.index, fallbackIndex, 0, 99),
    type,
    source,
    label: coerceString(rawRecord.label || type),
  };
}

function normalizeLayoutGenerationMeta(raw = {}, layoutJson = null) {
  const source = toRecord(raw);
  const layoutJsonRecord = toRecord(layoutJson);
  const blocks = toAiLayoutBlocks(layoutJsonRecord.blocks);
  const rawBlockOrigins = Array.isArray(source.blockOrigins) ? /** @type {unknown[]} */ (source.blockOrigins) : [];
  const blockOrigins = rawBlockOrigins.length
    ? rawBlockOrigins
      .map((item, index) => normalizeGenerationBlockOrigin(item, index))
      .filter(Boolean)
    : [];
  const derivedFallbackCount = blockOrigins.filter((item) => item.source === 'fallback').length;
  const finalBlockCount = clampNumber(
    source.finalBlockCount,
    blocks.length || blockOrigins.length || 0,
    0,
    99
  );
  const fallbackBlockCount = clampNumber(
    source.fallbackBlockCount,
    derivedFallbackCount,
    0,
    finalBlockCount
  );

  return {
    providerName: coerceString(source.providerName),
    providerModel: coerceString(source.providerModel),
    skillId: coerceString(source.skillId),
    skillLabel: coerceString(source.skillLabel),
    skillVersion: coerceString(source.skillVersion),
    executionMode: coerceString(source.executionMode),
    layoutFamilyLabel: coerceString(source.layoutFamilyLabel),
    colorPaletteLabel: coerceString(source.colorPaletteLabel),
    stylePackLabel: coerceString(source.stylePackLabel),
    recommendedLayoutFamilyLabel: coerceString(source.recommendedLayoutFamilyLabel),
    recommendedColorPaletteLabel: coerceString(source.recommendedColorPaletteLabel),
    headingCount: clampNumber(source.headingCount, 0, 0, 999),
    sectionCount: clampNumber(source.sectionCount, 0, 0, 999),
    leadParagraphCount: clampNumber(source.leadParagraphCount, 0, 0, 999),
    bulletGroupCount: clampNumber(source.bulletGroupCount, 0, 0, 999),
    imageCount: clampNumber(source.imageCount, 0, 0, 999),
    aiBlockCount: clampNumber(source.aiBlockCount, Math.max(0, finalBlockCount - fallbackBlockCount), 0, 99),
    finalBlockCount,
    fallbackUsed: source.fallbackUsed === true || fallbackBlockCount > 0,
    fallbackBlockCount,
    fallbackBlockTypes: Array.isArray(source.fallbackBlockTypes)
      ? source.fallbackBlockTypes.map((item) => coerceString(item)).filter(Boolean).slice(0, 6)
      : [],
    schemaValidation: normalizeSchemaValidation(source.schemaValidation),
    blockOrigins,
  };
}

function normalizeSchemaValidation(raw = {}) {
  const source = toRecord(raw);
  const issues = Array.isArray(source.issues)
    ? source.issues
      .map((item) => {
        const issue = toRecord(item);
        return {
          path: coerceString(issue.path),
          message: coerceString(issue.message),
          fatal: issue.fatal === true,
        };
      })
      .filter((item) => item.path || item.message)
      .slice(0, 12)
    : [];
  const issueCount = clampNumber(source.issueCount, issues.length, 0, 99);
  const fatal = source.fatal === true || issues.some((item) => item.fatal);
  return {
    isValid: source.isValid === true && issueCount === 0,
    fatal,
    issueCount,
    issues,
  };
}

class AiLayoutSchemaError extends Error {
  /**
   * @param {string} message
   * @param {unknown} schemaValidation
   * @param {AiLayoutGenerationMetaLike | null} [generationMeta=null]
   */
  constructor(message, schemaValidation, generationMeta = null) {
    super(message);
    this.name = 'AiLayoutSchemaError';
    this.code = 'ai-layout-schema-invalid';
    this.schemaValidation = normalizeSchemaValidation(schemaValidation);
    this.generationMeta = generationMeta;
  }
}

class AiLayoutTimeoutError extends Error {
  constructor(timeoutMs) {
    const seconds = Math.max(1, Math.round(Number(timeoutMs || 0) / 1000));
    super(`AI 请求超时（${seconds}s）`);
    this.name = 'AiLayoutTimeoutError';
    this.code = 'ai-layout-timeout';
    this.timeoutMs = Number(timeoutMs || 0);
  }
}

export {
  normalizeGenerationBlockOrigin,
  normalizeLayoutGenerationMeta,
  normalizeSchemaValidation,
  AiLayoutSchemaError,
  AiLayoutTimeoutError,
};
