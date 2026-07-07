/*
## 核心功能

覆盖 AI layout skill bundle 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 AI layout skill bundle 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, expect, it } from 'vitest';
const fs = require('fs');
const path = require('path');

const {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutSkillList,
  getAiLayoutSkillById,
  getAiLayoutSharedResources,
  getAiLayoutBlockConstraintLines,
  getAiLayoutTemplate,
  validateAiLayoutPayload,
} = require('../services/ai-layout-skill-bundle');

describe('ai-layout skill bundle', () => {
  it('should expose the canonical allowed block list', () => {
    expect(AI_LAYOUT_SKILL_VERSION).toBeTruthy();
    expect(AI_LAYOUT_ALLOWED_BLOCKS.map((item) => item.type)).toEqual([
      'hero',
      'part-nav',
      'lead-quote',
      'case-block',
      'section-block',
      'phone-frame',
      'cta-card',
    ]);
    expect(AI_LAYOUT_SKILL_SYSTEM_LINES.join('\n')).toContain('只允许使用这些 block type');
    expect(AI_LAYOUT_SKILL_SYSTEM_LINES.join('\n')).toContain('保真优先');
  });

  it('should expose output fields and block constraints for prompt building', () => {
    expect(AI_LAYOUT_OUTPUT_FIELDS).toEqual([
      'articleType',
      'selection',
      'resolved',
      'recommendedLayoutFamily',
      'recommendedColorPalette',
      'title',
      'summary',
      'blocks',
    ]);
    expect(getAiLayoutBlockConstraintLines()).toContain('- hero: eyebrow, title, subtitle, coverImageId, variant');
    expect(getAiLayoutBlockConstraintLines()).toContain('- section-block: sectionIndex, sectionLabel, headingLevel, title, paragraphs, bulletGroups, callouts, subsections[{title,level,paragraphs,bulletGroups,callouts}], imageIds');
    expect(getAiLayoutBlockConstraintLines()).toContain('- cta-card: title, body, buttonText, note');
  });

  it('should load skills and shared resources from the skill registry', () => {
    const skills = getAiLayoutSkillList();
    const sourceFirst = getAiLayoutSkillById('source-first');
    const shared = getAiLayoutSharedResources();

    expect(skills.map((item) => item.id)).toEqual([
      'source-first',
      'tutorial-cards',
      'editorial-lite',
    ]);
    expect(sourceFirst?.manifest?.providerStrategy).toBe('prefer-ai-fallback-local');
    expect(sourceFirst?.prompt).toContain('原文增强型');
    expect(shared.wechatSafeStylePrimitives?.profiles?.['tutorial-cards']).toBeTruthy();
    expect(shared.colorPalettes?.colorPalettes?.map((item) => item.id)).toEqual([
      'tech-green',
      'ocean-blue',
      'sunset-amber',
      'graphite-rose',
      'basic-blue',
      'basic-green',
      'basic-purple',
      'basic-orange',
      'basic-teal',
      'basic-rose',
      'basic-ruby',
      'basic-slate',
      'custom',
    ]);
  });

  it('should source runtime prompt and skill docs from ai-layout-skills resources', () => {
    const skillIds = ['source-first', 'tutorial-cards', 'editorial-lite'];

    skillIds.forEach((skillId) => {
      const skill = getAiLayoutSkillById(skillId);
      const skillDir = path.join(__dirname, '..', 'ai-layout-skills', skillId);
      const expectedPrompt = fs.readFileSync(path.join(skillDir, 'prompt.md'), 'utf8').trimEnd();
      const expectedSkillDoc = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8').trimEnd();

      expect(skill?.prompt).toBe(expectedPrompt);
      expect(skill?.skillDoc).toBe(expectedSkillDoc);
    });
  });

  it('should expose callout-aware section-block fields in shared resources', () => {
    const shared = getAiLayoutSharedResources();
    const sectionBlock = shared.blockCatalog.blocks.find((block) => block.type === 'section-block');
    const sectionBlockSchema = shared.schema.properties.blocks.items.oneOf.find((block) => block.properties?.type?.const === 'section-block');

    expect(sectionBlock.fields).toContain('callouts');
    expect(sectionBlock.fields).toContain('subsections[{title,level,paragraphs,bulletGroups,callouts}]');
    expect(sectionBlock.description).toContain('callout');
    expect(sectionBlockSchema.properties.callouts).toBeTruthy();
    expect(sectionBlockSchema.properties.subsections.items.properties.callouts).toBeTruthy();
  });

  it('should validate section and subsection callouts via shared schema-compatible payloads', () => {
    const result = validateAiLayoutPayload({
      articleType: 'tutorial',
      selection: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'ocean-blue',
      },
      title: '文章标题',
      summary: '一句摘要',
      blocks: [
        {
          type: 'section-block',
          sectionIndex: 0,
          title: '第一部分',
          callouts: [
            { type: 'tip', title: '提示', body: '这里是 callout' },
          ],
          subsections: [
            {
              title: '子节一',
              level: 3,
              callouts: [
                { type: 'note', title: '说明', body: '子节里的 callout' },
              ],
            },
          ],
        },
      ],
    });

    expect(result.isValid).toBe(true);
    expect(result.fatal).toBe(false);
    expect(result.issueCount).toBe(0);
  });

  it('should provide a reusable layout template', () => {
    const template = getAiLayoutTemplate();
    expect(template.articleType).toBe('tutorial');
    expect(template.selection).toEqual({
      layoutFamily: 'auto',
      colorPalette: 'auto',
    });
    expect(template.resolved).toEqual({
      layoutFamily: 'tutorial-cards',
      colorPalette: 'tech-green',
    });
    expect(template.recommendedLayoutFamily).toBe('tutorial-cards');
    expect(template.recommendedColorPalette).toBe('tech-green');
    expect(Array.isArray(template.blocks)).toBe(true);
    const sectionBlock = template.blocks.find((block) => block.type === 'section-block');
    expect(sectionBlock).toBeTruthy();
    expect(sectionBlock.callouts?.length).toBeGreaterThan(0);
    expect(sectionBlock.subsections?.[0]?.callouts?.length).toBeGreaterThan(0);
    expect(template.blocks.some((block) => block.type === 'cta-card')).toBe(false);
  });

  it('should ship examples that reflect callout-preserving section blocks', () => {
    const sourceFirst = getAiLayoutSkillById('source-first');
    const tutorialCards = getAiLayoutSkillById('tutorial-cards');
    const editorialLite = getAiLayoutSkillById('editorial-lite');

    const sourceFirstSection = sourceFirst.examples[0].value.blocks.find((block) => block.type === 'section-block');
    const tutorialSection = tutorialCards.examples[0].value.blocks.find((block) => block.type === 'section-block');
    const editorialSection = editorialLite.examples[0].value.blocks.find((block) => block.type === 'section-block');

    expect(sourceFirstSection.callouts?.length).toBeGreaterThan(0);
    expect(tutorialSection.callouts?.length).toBeGreaterThan(0);
    expect(tutorialSection.subsections?.[0]?.callouts?.length).toBeGreaterThan(0);
    expect(editorialSection.callouts?.length).toBeGreaterThan(0);
  });

  it('should validate layout payload schema issues', () => {
    const result = validateAiLayoutPayload({
      articleType: 'tutorial',
      selection: {
        layoutFamily: 'auto',
        colorPalette: 'auto',
      },
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'tech-green',
      },
      title: '文章标题',
      summary: '一句摘要',
      blocks: [
        { type: 'hero', subtitle: '缺少 title' },
        { type: 'unknown-block' },
      ],
    });

    expect(result.isValid).toBe(false);
    expect(result.issueCount).toBeGreaterThan(0);
    expect(result.fatal).toBe(true);
    expect(result.issues.some((issue) => issue.path.includes('unknown-block') || issue.message.includes('不支持的 block type'))).toBe(true);
  });
});
