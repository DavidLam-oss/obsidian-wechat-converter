/*
## 核心功能

提供服务层通用能力：ai layout skill bundle。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `AI_LAYOUT_SKILL_VERSION`、`AI_LAYOUT_SELECTION_AUTO`、`AI_LAYOUT_FAMILIES`、`AI_LAYOUT_COLOR_PALETTES`、`AI_LAYOUT_ALLOWED_BLOCKS`、`AI_LAYOUT_SKILL_SYSTEM_LINES`、`AI_LAYOUT_OUTPUT_FIELDS`、`getAiLayoutBlockConstraintLines`、`getAiLayoutTemplate`、`validateAiLayoutPayload`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：`./ai-layout-runtime/registry.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  loadAiLayoutSkillRegistry,
  getAiLayoutSkillById,
  getAiLayoutSkillList,
  getAiLayoutSharedResources,
} from './ai-layout-runtime/registry.js';

const AI_LAYOUT_SELECTION_AUTO = 'auto';
/**
 * @typedef {{ type: string, fields: string[] }} AiLayoutBlockDefinition
 * @typedef {{ path: string, message: string, fatal: boolean }} AiLayoutSchemaIssue
 * @typedef {{ isValid: boolean, fatal: boolean, issueCount: number, issues: AiLayoutSchemaIssue[] }} AiLayoutValidationResult
 */

const shared = getAiLayoutSharedResources();

const AI_LAYOUT_SKILL_VERSION = shared.version || '2026.03.25-alpha.1';
const AI_LAYOUT_FAMILIES = getAiLayoutSkillList().map((skill) => skill.id);
const AI_LAYOUT_COLOR_PALETTES = (shared.colorPalettes?.colorPalettes || []).map((item) => item.id);
/** @type {AiLayoutBlockDefinition[]} */
const AI_LAYOUT_ALLOWED_BLOCKS = (shared.blockCatalog?.blocks || []).map((block) => ({
  type: String(block.type || ''),
  fields: Array.isArray(block.fields) ? block.fields.map((field) => String(field || '')) : [],
}));
const AI_LAYOUT_OUTPUT_FIELDS = Array.isArray(shared.blockCatalog?.outputFields)
  ? shared.blockCatalog.outputFields.slice()
  : [
    'articleType',
    'selection',
    'resolved',
    'recommendedLayoutFamily',
    'recommendedColorPalette',
    'title',
    'summary',
    'blocks',
  ];

const AI_LAYOUT_SKILL_SYSTEM_LINES = [
  '你是微信公众号排版助手。',
  '你的职责是把文章内容映射为结构化的排版 JSON。',
  '不要输出 Markdown，不要输出 HTML，不要解释，只输出一个 JSON 对象。',
  `只允许使用这些 block type: ${AI_LAYOUT_ALLOWED_BLOCKS.map((block) => block.type).join(', ')}。`,
  `layoutFamily 只允许使用这些值: ${AI_LAYOUT_FAMILIES.join(', ')}。`,
  `colorPalette 只允许使用这些值: ${AI_LAYOUT_COLOR_PALETTES.join(', ')}。`,
  'block 内不要杜撰图片 URL，只能使用提供的 image id。',
  '尽量保留原文信息，不要改写作者观点，不要编造数据。',
  '优先覆盖全文主要章节，保真优先于花哨编排。',
  'selection 表示用户当前选择；resolved 表示本次最终采用的布局和颜色。',
  '如果 selection 为 auto，请根据内容推荐 recommendedLayoutFamily 和 recommendedColorPalette，并写入 resolved。',
  '如果 selection 已指定具体布局或颜色，resolved 必须尊重该选择。',
  'AI 编排最终会被渲染为微信安全 HTML，不能依赖额外 style 标签或 class 选择器。',
  '公众号可见文本里不要输出裸 Markdown 源码，例如 - [ ]、- [x]、## 标题、|---|、代码围栏。',
  '原文任务清单必须转换成公众号安全文本：未完成项用 ☐ 事项，完成项用 ☑ 事项；不要保留 [ ] 或 [x]。',
  '长清单项要拆成主项和说明，或放入 bulletGroups / paragraphs，避免手机端出现圆点 + [ ] + 长括号导致缩进错位。',
];

function getAiLayoutBlockConstraintLines() {
  return AI_LAYOUT_ALLOWED_BLOCKS.map((block) => `- ${block.type}: ${block.fields.join(', ')}`);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function optionalString(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {string} path
 * @param {string} message
 * @param {boolean} [fatal=false]
 * @returns {AiLayoutSchemaIssue}
 */
function createSchemaIssue(path, message, fatal = false) {
  return {
    path,
    message,
    fatal: fatal === true,
  };
}

/**
 * @param {unknown} field
 * @returns {string}
 */
function normalizeBlockFieldKey(field) {
  const normalized = String(field || '').trim();
  if (!normalized) return normalized;
  if (normalized === 'items[{label,text}]') return 'items';
  const bracketIndex = normalized.indexOf('[');
  return bracketIndex === -1 ? normalized : normalized.slice(0, bracketIndex);
}

/**
 * @param {unknown} rawLayout
 * @returns {AiLayoutValidationResult}
 */
function validateAiLayoutPayload(rawLayout) {
  /** @type {AiLayoutSchemaIssue[]} */
  const issues = [];
  const allowedBlockTypes = new Set(AI_LAYOUT_ALLOWED_BLOCKS.map((block) => block.type));
  const allowedLayoutFamilies = new Set(AI_LAYOUT_FAMILIES);
  const allowedColorPalettes = new Set(AI_LAYOUT_COLOR_PALETTES);
  const fieldMap = new Map(AI_LAYOUT_ALLOWED_BLOCKS.map((block) => [block.type, new Set(['type', ...block.fields.map((field) => normalizeBlockFieldKey(field)).filter(Boolean)])]));
  if (fieldMap.has('section-block')) {
    fieldMap.get('section-block')?.add('callouts');
  }

  /**
   * @param {unknown} value
   * @param {string} path
   * @returns {void}
   */
  const validateCalloutArray = (value, path) => {
    if (!Array.isArray(value)) {
      issues.push(createSchemaIssue(path, `${path.split('.').pop()} 必须是数组。`, false));
      return;
    }
    value.forEach((callout, calloutIndex) => {
      if (!isPlainRecord(callout)) {
        issues.push(createSchemaIssue(`${path}[${calloutIndex}]`, 'callout 必须是对象。', false));
        return;
      }
      if ('type' in callout && typeof callout.type !== 'string') {
        issues.push(createSchemaIssue(`${path}[${calloutIndex}].type`, 'callout.type 必须是字符串。', false));
      }
      if ('title' in callout && typeof callout.title !== 'string') {
        issues.push(createSchemaIssue(`${path}[${calloutIndex}].title`, 'callout.title 必须是字符串。', false));
      }
      if ('body' in callout && typeof callout.body !== 'string') {
        issues.push(createSchemaIssue(`${path}[${calloutIndex}].body`, 'callout.body 必须是字符串。', false));
      }
    });
  };

  if (!isPlainRecord(rawLayout)) {
    issues.push(createSchemaIssue('$', '顶层必须是一个 JSON 对象。', true));
    return {
      isValid: false,
      fatal: true,
      issueCount: issues.length,
      issues,
    };
  }
  const layout = rawLayout;

  const requiredTopLevelFields = ['articleType', 'selection', 'resolved', 'title', 'summary', 'blocks'];
  requiredTopLevelFields.forEach((field) => {
    if (!(field in layout)) {
      issues.push(createSchemaIssue(`$.${field}`, `缺少顶层字段 ${field}。`, field === 'blocks'));
      return;
    }
    if (field === 'blocks') {
      if (!Array.isArray(layout.blocks)) {
        issues.push(createSchemaIssue('$.blocks', 'blocks 必须是数组。', true));
      }
      return;
    }
    if ((field === 'selection' || field === 'resolved') && !isPlainRecord(layout[field])) {
      issues.push(createSchemaIssue(`$.${field}`, `${field} 必须是对象。`, true));
      return;
    }
    if (field !== 'selection' && field !== 'resolved' && typeof layout[field] !== 'string') {
      issues.push(createSchemaIssue(`$.${field}`, `${field} 必须是字符串。`, false));
    }
  });

  if (isPlainRecord(layout.selection)) {
    const selectionLayoutFamily = optionalString(layout.selection.layoutFamily).trim();
    const selectionColorPalette = optionalString(layout.selection.colorPalette).trim();
    if (!selectionLayoutFamily || (selectionLayoutFamily !== AI_LAYOUT_SELECTION_AUTO && !allowedLayoutFamilies.has(selectionLayoutFamily))) {
      issues.push(createSchemaIssue('$.selection.layoutFamily', 'selection.layoutFamily 必须是 auto 或合法的 layoutFamily。', true));
    }
    if (!selectionColorPalette || (selectionColorPalette !== AI_LAYOUT_SELECTION_AUTO && !allowedColorPalettes.has(selectionColorPalette))) {
      issues.push(createSchemaIssue('$.selection.colorPalette', 'selection.colorPalette 必须是 auto 或合法的 colorPalette。', true));
    }
  }

  if (isPlainRecord(layout.resolved)) {
    const resolvedLayoutFamily = optionalString(layout.resolved.layoutFamily).trim();
    const resolvedColorPalette = optionalString(layout.resolved.colorPalette).trim();
    if (!allowedLayoutFamilies.has(resolvedLayoutFamily)) {
      issues.push(createSchemaIssue('$.resolved.layoutFamily', 'resolved.layoutFamily 必须是合法的 layoutFamily。', true));
    }
    if (!allowedColorPalettes.has(resolvedColorPalette)) {
      issues.push(createSchemaIssue('$.resolved.colorPalette', 'resolved.colorPalette 必须是合法的 colorPalette。', true));
    }
  }

  if ('recommendedLayoutFamily' in layout) {
    const recommendedLayoutFamily = optionalString(layout.recommendedLayoutFamily).trim();
    if (recommendedLayoutFamily && !allowedLayoutFamilies.has(recommendedLayoutFamily)) {
      issues.push(createSchemaIssue('$.recommendedLayoutFamily', 'recommendedLayoutFamily 必须是合法的 layoutFamily。', false));
    }
  }

  if ('recommendedColorPalette' in layout) {
    const recommendedColorPalette = optionalString(layout.recommendedColorPalette).trim();
    if (recommendedColorPalette && !allowedColorPalettes.has(recommendedColorPalette)) {
      issues.push(createSchemaIssue('$.recommendedColorPalette', 'recommendedColorPalette 必须是合法的 colorPalette。', false));
    }
  }

  if (!Array.isArray(layout.blocks)) {
    return {
      isValid: issues.length === 0,
      fatal: issues.some((issue) => issue.fatal),
      issueCount: issues.length,
      issues,
    };
  }

  layout.blocks.forEach((block, index) => {
    const path = `$.blocks[${index}]`;
    if (!isPlainRecord(block)) {
      issues.push(createSchemaIssue(path, 'block 必须是对象。', true));
      return;
    }
    if (typeof block.type !== 'string' || !block.type.trim()) {
      issues.push(createSchemaIssue(`${path}.type`, 'block 缺少合法的 type。', true));
      return;
    }
    const blockType = block.type;
    if (!allowedBlockTypes.has(blockType)) {
      issues.push(createSchemaIssue(`${path}.type`, `不支持的 block type: ${block.type}。`, true));
      return;
    }

    const allowedFields = fieldMap.get(blockType) || new Set(['type']);
    Object.keys(block).forEach((key) => {
      if (!allowedFields.has(key)) {
        issues.push(createSchemaIssue(`${path}.${key}`, `${blockType} 不支持字段 ${key}。`, false));
      }
    });

    if (blockType === 'hero' && typeof block.title !== 'string') {
      issues.push(createSchemaIssue(`${path}.title`, 'hero.title 必须是字符串。', false));
    }
    if (blockType === 'part-nav') {
      if (!Array.isArray(block.items)) {
        issues.push(createSchemaIssue(`${path}.items`, 'part-nav.items 必须是数组。', true));
      } else {
        block.items.forEach((item, itemIndex) => {
          if (!isPlainRecord(item)) {
            issues.push(createSchemaIssue(`${path}.items[${itemIndex}]`, 'part-nav item 必须是对象。', false));
            return;
          }
          if (typeof item.label !== 'string' || typeof item.text !== 'string') {
            issues.push(createSchemaIssue(`${path}.items[${itemIndex}]`, 'part-nav item 需要 label 和 text 字符串。', false));
          }
        });
      }
    }
    if (blockType === 'lead-quote' && typeof block.text !== 'string') {
      issues.push(createSchemaIssue(`${path}.text`, 'lead-quote.text 必须是字符串。', false));
    }
    if (blockType === 'case-block') {
      if ('bullets' in block && !Array.isArray(block.bullets)) {
        issues.push(createSchemaIssue(`${path}.bullets`, 'case-block.bullets 必须是数组。', false));
      }
      if ('imageIds' in block && !Array.isArray(block.imageIds)) {
        issues.push(createSchemaIssue(`${path}.imageIds`, 'case-block.imageIds 必须是数组。', false));
      }
    }
    if (blockType === 'section-block') {
      const isNumber = Number.isInteger(block.sectionIndex) && block.sectionIndex >= 0;
      const isNumericString = typeof block.sectionIndex === 'string' && /^\d+$/.test(block.sectionIndex.trim());
      if (!isNumber && !isNumericString) {
        issues.push(createSchemaIssue(`${path}.sectionIndex`, 'section-block.sectionIndex 必须是非负整数。', true));
      }
      if ('sectionLabel' in block && typeof block.sectionLabel !== 'string') {
        issues.push(createSchemaIssue(`${path}.sectionLabel`, 'section-block.sectionLabel 必须是字符串。', false));
      }
      if ('headingLevel' in block && (!Number.isInteger(block.headingLevel) || block.headingLevel < 2 || block.headingLevel > 6)) {
        issues.push(createSchemaIssue(`${path}.headingLevel`, 'section-block.headingLevel 必须是 2 到 6 之间的整数。', false));
      }
      if ('title' in block && typeof block.title !== 'string') {
        issues.push(createSchemaIssue(`${path}.title`, 'section-block.title 必须是字符串。', false));
      }
      if ('paragraphs' in block && !Array.isArray(block.paragraphs)) {
        issues.push(createSchemaIssue(`${path}.paragraphs`, 'section-block.paragraphs 必须是数组。', false));
      }
      if ('bulletGroups' in block) {
        if (!Array.isArray(block.bulletGroups)) {
          issues.push(createSchemaIssue(`${path}.bulletGroups`, 'section-block.bulletGroups 必须是数组。', false));
        } else {
          block.bulletGroups.forEach((group, groupIndex) => {
            if (!Array.isArray(group) || group.some((item) => typeof item !== 'string')) {
              issues.push(createSchemaIssue(`${path}.bulletGroups[${groupIndex}]`, 'section-block.bulletGroups 中的每组必须是字符串数组。', false));
            }
          });
        }
      }
      if ('callouts' in block) {
        validateCalloutArray(block.callouts, `${path}.callouts`);
      }
      if ('subsections' in block) {
        if (!Array.isArray(block.subsections)) {
          issues.push(createSchemaIssue(`${path}.subsections`, 'section-block.subsections 必须是数组。', false));
        } else {
          block.subsections.forEach((subsection, subsectionIndex) => {
            if (!isPlainRecord(subsection)) {
              issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}]`, 'subsection 必须是对象。', false));
              return;
            }
            if (typeof subsection.title !== 'string') {
              issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].title`, 'subsection.title 必须是字符串。', false));
            }
            if ('level' in subsection && (!Number.isInteger(subsection.level) || subsection.level < 3 || subsection.level > 6)) {
              issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].level`, 'subsection.level 必须是 3 到 6 之间的整数。', false));
            }
            if ('paragraphs' in subsection && !Array.isArray(subsection.paragraphs)) {
              issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].paragraphs`, 'subsection.paragraphs 必须是数组。', false));
            }
            if ('bulletGroups' in subsection) {
              if (!Array.isArray(subsection.bulletGroups)) {
                issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].bulletGroups`, 'subsection.bulletGroups 必须是数组。', false));
              } else {
                subsection.bulletGroups.forEach((group, groupIndex) => {
                  if (!Array.isArray(group) || group.some((item) => typeof item !== 'string')) {
                    issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].bulletGroups[${groupIndex}]`, 'subsection.bulletGroups 中的每组必须是字符串数组。', false));
                  }
                });
              }
            }
            if ('callouts' in subsection) {
              validateCalloutArray(subsection.callouts, `${path}.subsections[${subsectionIndex}].callouts`);
            }
          });
        }
      }
      if ('imageIds' in block && !Array.isArray(block.imageIds)) {
        issues.push(createSchemaIssue(`${path}.imageIds`, 'section-block.imageIds 必须是数组。', false));
      }
    }
    if (blockType === 'phone-frame' && typeof block.imageId !== 'string') {
      issues.push(createSchemaIssue(`${path}.imageId`, 'phone-frame.imageId 必须是字符串。', true));
    }
  });

  const fatal = issues.some((issue) => issue.fatal);
  return {
    isValid: issues.length === 0,
    fatal,
    issueCount: issues.length,
    issues,
  };
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
  const serialized = JSON.stringify(value);
  const parsed = /** @type {unknown} */ (JSON.parse(serialized));
  return /** @type {T} */ (parsed);
}

/** @returns {Record<string, unknown>} */
function getAiLayoutTemplate() {
  return cloneJson(shared.template || {});
}

export {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
  AI_LAYOUT_FAMILIES,
  AI_LAYOUT_COLOR_PALETTES,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutBlockConstraintLines,
  getAiLayoutTemplate,
  validateAiLayoutPayload,
  loadAiLayoutSkillRegistry as getAiLayoutSkillRegistry,
  getAiLayoutSkillById,
  getAiLayoutSkillList,
  getAiLayoutSharedResources,
};
