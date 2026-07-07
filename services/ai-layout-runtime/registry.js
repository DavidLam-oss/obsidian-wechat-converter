/*
## 核心功能

提供 AI layout skill runtime 的注册表访问能力，连接生成 skill 数据与运行时查询。

## 输入

接收生成的 skill registry、layout family、skill id 和调用方查询参数。

## 输出

输出 `loadAiLayoutSkillRegistry`、`getAiLayoutSkillById`、`getAiLayoutSkillList`、`getAiLayoutSharedResources`，供 AI layout 服务选择和读取 skill 元数据。

## 定位

位于 services/ai-layout-runtime/，只包装运行时 registry，不直接发起 AI 请求。

## 依赖

关键依赖：`./generated-skills.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout-runtime 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import generatedSkills from './generated-skills.js';

/**
 * @typedef {Record<string, unknown>} JsonObject
 * @typedef {{ id: string, label?: string, description?: string, version?: string, order?: number }} AiLayoutSkillManifest
 * @typedef {{ type: string, fields: string[] }} AiLayoutBlockDefinition
 * @typedef {{ id: string, label: string, description?: string, recommendedFor?: string[], tokens?: Record<string, string> }} AiLayoutColorPalette
 * @typedef {{ version?: string, defaultColorPalette?: string, colorPalettes?: AiLayoutColorPalette[] }} AiLayoutColorPaletteCatalog
 * @typedef {{ blocks?: AiLayoutBlockDefinition[], outputFields?: string[] }} AiLayoutBlockCatalog
 * @typedef {{ typography?: JsonObject, image?: JsonObject, profiles?: Record<string, JsonObject>, sectionLabels?: Record<string, string> }} AiLayoutStylePrimitives
 * @typedef {{ version?: string, colorPalettes?: AiLayoutColorPaletteCatalog, blockCatalog?: AiLayoutBlockCatalog, wechatSafeStylePrimitives?: AiLayoutStylePrimitives, schema?: JsonObject, template?: JsonObject }} AiLayoutSharedResources
 * @typedef {{ id: string, manifest: AiLayoutSkillManifest, prompt: string, blocks: unknown, fallback: unknown, skillDoc?: string, examples?: Array<{ name: string, value: unknown }> }} AiLayoutSkill
 * @typedef {{ root: string, shared: AiLayoutSharedResources, skills: AiLayoutSkill[] }} AiLayoutSkillRegistry
 */

/** @type {{ shared: AiLayoutSharedResources, skills: AiLayoutSkill[] }} */
const generatedRegistry = generatedSkills;

/** @type {AiLayoutSkillRegistry | null} */
let cachedRegistry = null;

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function clone(value) {
  const parsed = /** @type {unknown} */ (JSON.parse(JSON.stringify(value)));
  return /** @type {T} */ (parsed);
}

/** @returns {AiLayoutSkillRegistry} */
export function loadAiLayoutSkillRegistry() {
  if (cachedRegistry) return cachedRegistry;
  cachedRegistry = {
    root: 'embedded://ai-layout-skills',
    shared: clone(generatedRegistry.shared),
    skills: clone(generatedRegistry.skills),
  };
  return cachedRegistry;
}

/**
 * @param {string} id
 * @returns {AiLayoutSkill | null}
 */
export function getAiLayoutSkillById(id) {
  const registry = loadAiLayoutSkillRegistry();
  return registry.skills.find((skill) => skill.id === id) || null;
}

/** @returns {AiLayoutSkill[]} */
export function getAiLayoutSkillList() {
  return loadAiLayoutSkillRegistry().skills.slice();
}

/** @returns {AiLayoutSharedResources} */
export function getAiLayoutSharedResources() {
  return loadAiLayoutSkillRegistry().shared;
}
