// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
  AI_LAYOUT_FAMILIES,
  AI_LAYOUT_COLOR_PALETTES,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutBlockConstraintLines,
  getAiLayoutSkillById,
  getAiLayoutSkillList,
  getAiLayoutSharedResources,
  validateAiLayoutPayload,
} from '../ai-layout-skill-bundle.js';

const AI_LAYOUT_SCHEMA_VERSION = 1;

const AI_PROVIDER_KINDS = {
  OPENAI_COMPATIBLE: 'openai-compatible',
  GEMINI: 'gemini',
  ANTHROPIC: 'anthropic',
};

const MAX_LAYOUT_BLOCKS = 24;

const MAX_PART_NAV_ITEMS = 6;

const MAX_CASE_BLOCK_BULLETS = 6;

const MAX_CASE_BLOCK_IMAGE_IDS = 4;

const ANTHROPIC_LAYOUT_MAX_TOKENS = 8192;

const DEFAULT_AI_REQUEST_TIMEOUT_MS = 120000;

const AI_LAYOUT_DEFAULT_FAMILY = 'source-first';

const AI_LAYOUT_DEFAULT_COLOR_PALETTE = 'tech-green';

const AI_LAYOUT_IMPLEMENTED_FAMILIES = new Set(AI_LAYOUT_FAMILIES);

const AI_LAYOUT_RESERVED_FAMILY_FALLBACKS = {};

const AI_LAYOUT_SHARED_RESOURCES = getAiLayoutSharedResources();

const AI_LAYOUT_SKILL_LIST = getAiLayoutSkillList();

const AI_LAYOUT_FAMILY_DEFS = AI_LAYOUT_SKILL_LIST.reduce((acc, skill) => {
  acc[skill.id] = {
    id: skill.id,
    label: skill.manifest.label,
    description: skill.manifest.description || '',
    version: skill.manifest.version,
    manifest: skill.manifest,
    prompt: skill.prompt,
    blocks: skill.blocks,
    fallback: skill.fallback,
  };
  return acc;
}, /** @type {Record<string, AiLayoutSkill>} */ ({}));

const AI_COLOR_PALETTES = (AI_LAYOUT_SHARED_RESOURCES.colorPalettes?.colorPalettes || []).reduce((acc, palette) => {
  acc[palette.id] = {
    id: palette.id,
    label: palette.label,
    description: palette.description || '',
    recommendedFor: Array.isArray(palette.recommendedFor) ? palette.recommendedFor.slice() : [],
    tokens: { ...(palette.tokens || {}) },
  };
  return acc;
}, /** @type {Record<string, AiLayoutColorPalette>} */ ({}));

const AI_WECHAT_SAFE_STYLE_PRIMITIVES = AI_LAYOUT_SHARED_RESOURCES.wechatSafeStylePrimitives || {
  typography: {},
  image: {},
  profiles: {},
  sectionLabels: {},
};

const AI_STYLE_PACKS = AI_COLOR_PALETTES;

const AI_PROVIDER_KIND_DEFAULTS = {
  [AI_PROVIDER_KINDS.OPENAI_COMPATIBLE]: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
  },
  [AI_PROVIDER_KINDS.GEMINI]: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
  },
  [AI_PROVIDER_KINDS.ANTHROPIC]: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-haiku-latest',
  },
};

export {
  AI_LAYOUT_SCHEMA_VERSION,
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
  AI_LAYOUT_FAMILIES,
  AI_LAYOUT_COLOR_PALETTES,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutBlockConstraintLines,
  getAiLayoutSkillById,
  getAiLayoutSkillList,
  getAiLayoutSharedResources,
  validateAiLayoutPayload,
  AI_PROVIDER_KINDS,
  MAX_LAYOUT_BLOCKS,
  MAX_PART_NAV_ITEMS,
  MAX_CASE_BLOCK_BULLETS,
  MAX_CASE_BLOCK_IMAGE_IDS,
  ANTHROPIC_LAYOUT_MAX_TOKENS,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
  AI_LAYOUT_DEFAULT_FAMILY,
  AI_LAYOUT_DEFAULT_COLOR_PALETTE,
  AI_LAYOUT_IMPLEMENTED_FAMILIES,
  AI_LAYOUT_RESERVED_FAMILY_FALLBACKS,
  AI_LAYOUT_SHARED_RESOURCES,
  AI_LAYOUT_SKILL_LIST,
  AI_LAYOUT_FAMILY_DEFS,
  AI_COLOR_PALETTES,
  AI_WECHAT_SAFE_STYLE_PRIMITIVES,
  AI_STYLE_PACKS,
  AI_PROVIDER_KIND_DEFAULTS,
};
