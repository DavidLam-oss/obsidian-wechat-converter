/*
## 核心功能

自定义排版主题 Token（Theme Token）Schema 定义、Hex 色值与字段合法性校验器。
集成高阶 rawCssOverrides 的安全审查（危险模式**黑名单拦截**，非白名单枚举），以及开箱即用的 AI 提示词模板。

## 输入

- 用户粘贴或外部导入的 JSON 字符串或原始 JS 对象。

## 输出

- `validateCustomThemeToken(input)`: 结构化校验结果 `{ valid: boolean, errors: string[], token?: CustomThemeToken }`
- `normalizeCustomThemeToken(input, fallbackId?)`: 归一化后的合法 CustomThemeToken 对象
- `normalizeCustomThemesList(input)`: 归一化主题 Token 数组
- `AI_THEME_PROMPT_TEMPLATE`: 一键复制给大模型（DeepSeek/ChatGPT/Claude/Kimi）的 Prompt 模板常量

## 定位

位于 services/，纯逻辑与契约层，无 DOM 与 Obsidian API 依赖，可在 Node 环境下独立单测。

## 版本与迁移策略

`schemaVersion` 当前固定为 1，字段已多轮增量扩展（heading / h3Style / blockquote / blockquoteStyle / strongStyle / colors.canvas …）。
- 新增字段一律 optional，旧 Token 缺字段时由 adapter / 引擎给默认值，**不升版本、不改写用户已存数据**；
- 未知外部字段在 normalize 时按 `extraFields` 原样保留（无损导入导出），已知字段先从 extraFields 删除再写回校验后的值，
  因此不会出现「未校验原值经展开符覆盖已校验值」；
- 仅当发生**语义不兼容变更**（字段重命名、枚举收窄致旧值失效、单位口径变化）时才升 `schemaVersion`，
  届时必须同时补 `migrateTokenVxToVy()` 与旧数据迁移测试，并同步 AI 提示词模板里的版本号。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: Theme token validation and normalization process untrusted and heterogeneous JSON payloads */

import { VALID_HEADING_ORNAMENTS, CURATED_AI_HEADING_ORNAMENTS } from './heading-ornaments.js';
import { compileCustomCss } from './custom-css-compiler.js';

/**
 * @typedef {{
 *   align?: 'left' | 'center',
 *   style?: string,
 *   prefix?: string, // 序号或前缀文本（支持 %n、{number} 或 01 占位符自动替换为当前二级标题序号；纯文本无占位符则原样呈现）
 *   ornament?: string, // 二级标题内置几何/微矢量装饰枚举名
 *   customPath?: string, // 二级标题自定义 24x24 SVG 路径 d 坐标数据
 *   border?: string,
 *   borderLeft?: string,
 *   borderBottom?: string,
 *   background?: string,
 *   borderRadius?: string,
 *   customStyle?: string,
 *   h3Style?: 'bottom-line' | 'left-border' | 'classic' | 'simple' | 'badge',
 *   h3Prefix?: string,
 *   h3Ornament?: string,
 *   h3CustomPath?: string,
 *   h4Style?: 'simple' | 'left-border' | 'light-bg' | 'bottom-line' | 'classic-minor',
 *   h4Prefix?: string,
 *   h4Ornament?: string,
 *   h4CustomPath?: string,
 * }} HeadingDecorationToken
 *
 * @typedef {{
 *   schemaVersion: 1,
 *   id: string,
 *   name: string,
 *   description?: string,
 *   author?: string,
 *   headingStyle?: string,
 *   heading?: HeadingDecorationToken,
 *   h3Style?: 'bottom-line' | 'left-border' | 'classic' | 'simple' | 'badge',
 *   h4Style?: 'simple' | 'left-border' | 'light-bg' | 'bottom-line' | 'classic-minor',
 *   blockquoteStyle?: 'soft' | 'center' | 'paper' | 'minimal',
 *   blockquote?: {
 *     style?: 'soft' | 'center' | 'paper' | 'minimal',
 *   },
 *   colors: {
 *     accent: string,
 *     canvas?: string,
 *     light?: string,
 *     highlight?: string,
 *     title?: string,
 *     text?: string,
 *     muted?: string,
 *     border?: string,
 *     codeBackground?: string,
 *   },
 *   typography?: {
 *     fontPreset?: 'sans-serif' | 'serif' | 'monospace',
 *     baseFontSize?: number,
 *     lineHeight?: number,
 *     paragraphGap?: number,
 *     letterSpacing?: number,
 *     strongStyle?: 'color' | 'neutral' | 'highlight',
 *   },
 *   strongStyle?: 'color' | 'neutral' | 'highlight',
 *   footer?: {
 *     showEngagementCard?: boolean,
 *     ctaText?: string,
 *   },
 *   css?: string, // 微信安全自定义排版 CSS（支持标准选择器与 ::before/::after/counter()，由 AST 编译器校验并内联）
 *   rawCssOverrides?: string, // 历史兼容别名，与 css 同源，编译管线统一经由 custom-css-compiler 处理
 * }} CustomThemeToken
 */

export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const VALID_HEADING_STYLES = /** @type {const} */ ([
  'default',
  'serial-number',
  'badge',
  'zen',
  'left-border',
  'bottom-line',
  'bubble',
  'card',
  'double-line',
]);
export const VALID_FONT_PRESETS = /** @type {const} */ (['sans-serif', 'serif', 'monospace']);
export const VALID_BLOCKQUOTE_STYLES = /** @type {const} */ (['soft', 'center', 'paper', 'minimal']);
export const VALID_STRONG_STYLES = /** @type {const} */ (['color', 'neutral', 'highlight']);
export const VALID_H3_STYLES = /** @type {const} */ (['bottom-line', 'left-border', 'classic', 'simple', 'badge']);
export const VALID_H4_STYLES = /** @type {const} */ (['simple', 'left-border', 'light-bg', 'bottom-line', 'classic-minor']);
export { VALID_HEADING_ORNAMENTS, CURATED_AI_HEADING_ORNAMENTS };

/**
 * 开箱即用的 AI 主题设计提示词模板（供复制给外部大模型）
 */
export const AI_THEME_PROMPT_TEMPLATE = `你是一个专业的微信公众号视觉排版设计师。请根据用户的风格诉求，设计一套优雅、克制、耐看且在微信生态内高度兼容的主题配置 JSON（含标准 CSS）。

【核心设计原则（重要）】
1. **CSS 优先，告别堆砌**：通过字体气质、字号对比、行高留白、克制的边框/浅底、以及标准 \`::before\` / \`::after\`（支持 \`counter-reset\` / \`counter()\`）来打造独特的版式风格。插件会自动将安全 CSS 与伪元素编译内联为微信兼容的 HTML，因此你**无需**手写 \`!important\`，也**无需**手写 \`<style>\` 标签。
2. **克制与一致性**：
   - 正文文字 \`p, li\` 保持高可读性（浅底上推荐 #222222 ~ #3A3A3A），主色调 \`colors.accent\` 用于重点引导、边框、强调词与微装饰；
   - 严禁在正文和标题中堆砌 Emoji 或手写 SVG 路径（不要输出 \`customPath\`）；
   - 如用户明确要求小图标装饰，仅可在 \`heading.ornament\` 选用极克制的微件（建议仅用于 H2，H3/H4 保持简洁）。
3. **微信兼容边界**：
   - ✅ 支持：\`section, h1, h2, h3, h4, p, blockquote, blockquote p, .owc-callout, strong, em, code, hr, ul, ol, li, table, th, td, a\` 等标签选择器（修改正文样式请同时作用于 \`p, li\`，引用内段落建议重置 \`blockquote p { margin: 0; color: inherit; }\`），以及 \`::before\` / \`::after\`、\`counter-reset\` / \`counter()\`、\`linear-gradient\`、\`border\`、\`border-radius\`、\`padding\`、\`margin\`、\`letter-spacing\`；
   - 🚫 严禁：\`@import\`、\`@font-face\`、外部 \`url(...)\`、\`position: fixed/absolute\`、\`@keyframes\` 动画、JS 脚本或导致横向溢出的负 \`margin\`。

【输出 JSON 结构要求】
只输出一个合法的纯 JSON 对象（不要带 \`\`\`json 代码围栏、前导问候或解释）：
- \`"schemaVersion"\`: 1
- \`"id"\`: 英文小写连字符（如 \`"editorial-ink"\`）
- \`"name"\`: 主题中文名称（2~6 个字）
- \`"description"\`: 适用场景与设计简述（15~40 字）
- \`"colors"\`:
  - \`"accent"\`: 必填，6 位 Hex 主色（如 \`"#1E40AF"\`）
  - 可选：\`"canvas"\`（整篇底色，默认 \`"#FFFFFF"\`）、\`"light"\`（主色极浅底色）、\`"title"\`、\`"text"\`、\`"muted"\`、\`"border"\`
- \`"css"\`: 核心排版 CSS 字符串（直接写干净的标准 CSS，插件会自动限定作用域并内联覆盖，无需写 \`.owc-article-root\` 前缀或 \`!important\`）
- \`"heading"\`: 可选；仅当用户明确要求微件图标时才附带 \`{ "ornament": "..." }\`（可选枚举：\`"double-diamond"\` | \`"slash-bar"\` | \`"dot-matrix"\` | \`"corner-bracket"\` | \`"square-pip"\` | \`"ring-dot"\` | \`"leaf"\` | \`"feather"\` | \`"sparkles"\` | \`"compass"\` | \`"book-open"\` | \`"terminal"\` | \`"lightbulb"\` | \`"bookmark"\` | \`"none"\`）
- \`"footer"\`: \`{ "showEngagementCard": true, "ctaText": "贴合文风的引导语" }\`

【风格参考示范（请根据用户诉求自由发挥，不要照搬固定套路）】
示例 A（杂志人文风，利用 counter() 章节号与衬线居中金线）：
{
  "schemaVersion": 1,
  "id": "editorial-paper",
  "name": "刊物人文",
  "description": "米白纸感底色配合衬线标题与克制章节号，适合深度长文与人物随笔",
  "colors": { "accent": "#8C5A3C", "canvas": "#FCF9F2", "light": "#F4EDE2", "title": "#2C241E", "text": "#3A332D", "muted": "#7C7065", "border": "#E5DDD0" },
  "css": "section { background: #FCF9F2; counter-reset: h2sec; } p, li { color: #3A332D; font-size: 15.5px; line-height: 1.9; } h1 { font-family: Georgia, 'Songti SC', serif; font-size: 24px; color: #2C241E; text-align: center; padding-bottom: 14px; border-bottom: 1px solid #D9CEBE; letter-spacing: 1px; } h2 { counter-increment: h2sec; font-family: Georgia, 'Songti SC', serif; font-size: 20px; color: #2C241E; text-align: center; margin: 38px 0 18px; padding-bottom: 10px; border-bottom: 1px solid #8C5A3C; } h2::before { content: counter(h2sec, decimal-leading-zero) ' · '; color: #8C5A3C; font-size: 13px; letter-spacing: 2px; font-weight: 600; } h3 { font-size: 17px; color: #2C241E; border-left: 3px solid #8C5A3C; padding-left: 10px; margin: 26px 0 12px; } blockquote { background: #F4EDE2; border-left: 2px solid #8C5A3C; color: #5C5046; padding: 14px 18px; margin: 20px 0; border-radius: 4px; } blockquote p { margin: 0; color: inherit; } strong { color: #8C5A3C; font-weight: 700; } hr { border: none; border-top: 1px solid #E5DDD0; margin: 36px auto; width: 48%; }",
  "footer": { "showEngagementCard": true, "ctaText": "若这篇长文让你有所触动，欢迎点赞、在看或分享给朋友" }
}

示例 B（现代编辑部科技风，干净左对齐与渐变分隔）：
{
  "schemaVersion": 1,
  "id": "modern-briefing",
  "name": "简报蓝调",
  "description": "冷灰与克制深蓝的现代商业简报风格，适合行业分析与产品拆解",
  "colors": { "accent": "#1D4ED8", "canvas": "#FFFFFF", "light": "#EFF6FF", "title": "#0F172A", "text": "#334155", "muted": "#64748B", "border": "#E2E8F0" },
  "css": "section { background: #FFFFFF; } p, li { color: #334155; font-size: 15px; line-height: 1.82; } h1 { font-size: 23px; font-weight: 800; color: #0F172A; text-align: left; padding-bottom: 12px; border-bottom: 2px solid #0F172A; } h2 { font-size: 19px; font-weight: 700; color: #0F172A; text-align: left; margin: 34px 0 16px; padding: 8px 14px; background: linear-gradient(90deg, rgba(29, 78, 216, 0.08), rgba(29, 78, 216, 0.01)); border-left: 4px solid #1D4ED8; border-radius: 0 6px 6px 0; } h3 { font-size: 16.5px; font-weight: 700; color: #1E3A8A; margin: 22px 0 10px; } h3::before { content: '// '; color: #1D4ED8; font-weight: 700; } blockquote { background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 3px solid #1D4ED8; padding: 12px 16px; border-radius: 6px; color: #475569; } blockquote p { margin: 0; color: inherit; } strong { color: #0F172A; background: rgba(29, 78, 216, 0.1); padding: 1px 4px; border-radius: 3px; } th { background: #EFF6FF; color: #1E3A8A; }",
  "footer": { "showEngagementCard": true, "ctaText": "觉得分析有参考价值？欢迎点赞、在看支持" }
}

【我的风格诉求（请在此处输入您的具体要求）】：
[例如：“我想要一个偏暖的秋日森林系，主色用焦糖琥珀与深松绿，适合户外手记与慢生活随笔，标题干净克制、阅读通透。”]
`;


/**
 * 校验十六进制色值格式
 * @param {unknown} val
 * @returns {boolean}
 */
export function isValidHexColor(val) {
  return typeof val === 'string' && HEX_COLOR_REGEX.test(val.trim());
}

/**
 * 混色辅助：将 Hex 色值与白色混合生成柔和的浅底色（默认 92% 白）
 * @param {string} hex
 * @param {number} [whiteRatio=0.92]
 * @returns {string}
 */
export function tintColorWithWhite(hex, whiteRatio = 0.92) {
  if (!isValidHexColor(hex)) return '#F8FAFC';
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);

  const mixedR = Math.round(r * (1 - whiteRatio) + 255 * whiteRatio);
  const mixedG = Math.round(g * (1 - whiteRatio) + 255 * whiteRatio);
  const mixedB = Math.round(b * (1 - whiteRatio) + 255 * whiteRatio);

  /** @param {number} n */
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(mixedR)}${toHex(mixedG)}${toHex(mixedB)}`.toUpperCase();
}

/**
 * 转义 HTML 关键字符，防止 XSS 或恶意 HTML 标签注入
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 清洗并审查 rawCssOverrides 中的高危字符（黑名单特征拦截）
 * @param {string} rawCss
 * @returns {{ safe: boolean, error?: string, sanitized: string }}
 */
export function sanitizeRawCssOverrides(rawCss) {
  if (!rawCss || typeof rawCss !== 'string') {
    return { safe: true, sanitized: '' };
  }
  const str = rawCss.trim();
  if (!str) return { safe: true, sanitized: '' };

  const dangerousPatterns = [
    { pattern: /<script\b/i, reason: '禁止包含 <script> 标签' },
    { pattern: /@import\b/i, reason: '禁止外部 @import 规则' },
    { pattern: /url\s*\(/i, reason: '禁止外部 url() 引用' },
    { pattern: /expression\s*\(/i, reason: '禁止 IE expression 动态表达式' },
    { pattern: /-moz-binding\b/i, reason: '禁止 XBL -moz-binding 绑定' },
    { pattern: /javascript\s*:/i, reason: '禁止 javascript: 伪协议' },
    { pattern: /vbscript\s*:/i, reason: '禁止 vbscript: 伪协议' },
    { pattern: /behavior\s*:/i, reason: '禁止 HTC behavior 行为属性' },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(str)) {
      return { safe: false, error: reason, sanitized: '' };
    }
  }

  return { safe: true, sanitized: str };
}

/**
 * 校验自定义主题 Token
 * @param {unknown} input JSON 字符串或已解析对象
 * @returns {{ valid: boolean, errors: string[], token?: CustomThemeToken }}
 */
export function validateCustomThemeToken(input) {
  const errors = [];

  let obj = input;
  if (typeof input === 'string') {
    try {
      // 容错：去除首尾可能由大模型包裹的 Markdown 代码围栏
      let cleaned = input.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }
      obj = JSON.parse(cleaned);
    } catch (e) {
      return {
        valid: false,
        errors: [`JSON 语法解析失败: ${e instanceof Error ? e.message : String(e)}`],
      };
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['配置根节点必须为标准的 JSON 键值对对象'] };
  }

  const raw = /** @type {Record<string, any>} */ (obj);

  // 1. name 校验
  if (!raw.name || typeof raw.name !== 'string' || !raw.name.trim()) {
    errors.push('缺少主题名称 (name)');
  }

  // 2. colors 校验
  if (!raw.colors || typeof raw.colors !== 'object' || Array.isArray(raw.colors)) {
    errors.push('缺少颜色配置对象 (colors)');
  } else {
    if (!isValidHexColor(raw.colors.accent)) {
      errors.push(`主色 (colors.accent) 必须是合法的 16 进制颜色（如 #2563EB），当前值为: "${raw.colors.accent}"`);
    }

    const optionalColorKeys = ['canvas', 'light', 'highlight', 'title', 'text', 'muted', 'border', 'codeBackground'];
    for (const key of optionalColorKeys) {
      if (raw.colors[key] !== undefined && raw.colors[key] !== null && !isValidHexColor(raw.colors[key])) {
        errors.push(`颜色 colors.${key} 格式无效，必须是 16 进制颜色（如 #FFFFFF），当前值为: "${raw.colors[key]}"`);
      }
    }
  }

  // 3. typography 校验（如果提供）
  if (raw.typography && typeof raw.typography === 'object') {
    if (raw.typography.fontPreset && !VALID_FONT_PRESETS.includes(raw.typography.fontPreset)) {
      errors.push(`字体预设 (typography.fontPreset) 仅支持 ${VALID_FONT_PRESETS.join(' / ')}`);
    }
  }

  // 加粗强调风格校验
  const strongCandidate = raw.typography?.strongStyle || raw.strongStyle;
  if (strongCandidate && !VALID_STRONG_STYLES.includes(strongCandidate)) {
    errors.push(`加粗强调风格 (strongStyle) 仅支持 ${VALID_STRONG_STYLES.join(' / ')}`);
  }

  // 引用块风格校验
  const blockquoteCandidate = raw.blockquote?.style || raw.blockquoteStyle;
  if (blockquoteCandidate && !VALID_BLOCKQUOTE_STYLES.includes(blockquoteCandidate)) {
    errors.push(`引用块风格 (blockquoteStyle) 仅支持 ${VALID_BLOCKQUOTE_STYLES.join(' / ')}`);
  }

  // 三级与四级标题风格校验
  const h3Candidate = raw.heading?.h3Style || raw.h3Style;
  if (h3Candidate && !VALID_H3_STYLES.includes(h3Candidate)) {
    errors.push(`三级标题风格 (h3Style) 仅支持 ${VALID_H3_STYLES.join(' / ')}`);
  }

  const h4Candidate = raw.heading?.h4Style || raw.h4Style;
  if (h4Candidate && !VALID_H4_STYLES.includes(h4Candidate)) {
    errors.push(`四级标题风格 (h4Style) 仅支持 ${VALID_H4_STYLES.join(' / ')}`);
  }

  // 4. headingStyle 与 heading 装饰配置校验
  if (raw.headingStyle !== undefined && raw.headingStyle !== null) {
    if (typeof raw.headingStyle !== 'string' || !raw.headingStyle.trim()) {
      errors.push('标题风格 (headingStyle) 必须是非空字符串');
    }
  }

  if (raw.heading !== undefined && raw.heading !== null) {
    if (typeof raw.heading !== 'object' || Array.isArray(raw.heading)) {
      errors.push('标题装饰配置 (heading) 必须是对象');
    } else {
      const h = raw.heading;
      if (h.align && !['left', 'center', 'right'].includes(h.align)) {
        errors.push('标题对齐 (heading.align) 仅支持 left / center / right');
      }
      const ornamentFields = ['ornament', 'h3Ornament', 'h4Ornament'];
      for (const field of ornamentFields) {
        if (h[field] !== undefined && h[field] !== null && h[field] !== '') {
          if (typeof h[field] !== 'string' || !VALID_HEADING_ORNAMENTS.includes(/** @type {any} */ (h[field].trim().toLowerCase()))) {
            errors.push(`标题装饰微件 (heading.${field}) 仅支持内置枚举: ${VALID_HEADING_ORNAMENTS.join(' / ')}`);
          }
        }
      }
      const customPathFields = ['customPath', 'h3CustomPath', 'h4CustomPath'];
      const svgPathRegex = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;
      for (const field of customPathFields) {
        if (h[field] !== undefined && h[field] !== null && h[field] !== '') {
          if (typeof h[field] !== 'string') {
            errors.push(`自定义矢量路径 (heading.${field}) 必须是字符串`);
          } else if (h[field].trim().length > 400) {
            errors.push(`自定义矢量路径 (heading.${field}) 长度不得超过 400 字符`);
          } else if (!svgPathRegex.test(h[field].trim())) {
            errors.push(`自定义矢量路径 (heading.${field}) 仅支持标准的 SVG path d 坐标数据`);
          }
        }
      }
      if (h.customStyle) {
        const check = sanitizeRawCssOverrides(String(h.customStyle));
        if (!check.safe) {
          errors.push(`标题自定义样式 (heading.customStyle) 包含危险规则: ${check.error}`);
        }
      }
      const propsToCheck = ['background', 'border', 'borderLeft', 'borderBottom'];
      for (const prop of propsToCheck) {
        if (h[prop]) {
          const check = sanitizeRawCssOverrides(String(h[prop]));
          if (!check.safe) {
            errors.push(`标题属性 (heading.${prop}) 包含危险规则: ${check.error}`);
          }
        }
      }
    }
  }

  // 5. css / rawCssOverrides AST 级与黑名单安全审查
  const cssFields = [
    { key: 'css', label: '主题 CSS (css)' },
    { key: 'rawCssOverrides', label: '自定义 CSS (rawCssOverrides)' },
  ];
  for (const { key, label } of cssFields) {
    const rawVal = raw[key];
    if (rawVal === undefined || rawVal === null || rawVal === '') continue;
    if (typeof rawVal !== 'string') {
      errors.push(`${label} 必须是字符串`);
      continue;
    }
    const cssCheck = sanitizeRawCssOverrides(rawVal);
    if (!cssCheck.safe) {
      errors.push(`${label} 包含危险规则: ${cssCheck.error}`);
      continue;
    }
    const compiled = compileCustomCss(rawVal, { sourceIdentity: `validate-${key}` });
    if (!compiled.usable) {
      const fatalMsg = compiled.diagnostics
        .filter((d) => d.severity === 'fatal')
        .map((d) => (d.line ? `第 ${d.line} 行: ${d.message}` : d.message))
        .join('；');
      errors.push(`${label} CSS 语法解析失败: ${fatalMsg || '存在无法解析的规则'}`);
      continue;
    }
    const blocked = compiled.diagnostics.filter((d) => d.severity === 'blocked');
    if (blocked.length > 0) {
      errors.push(`${label} 包含不支持或有网络风险的规则: ${blocked.map((d) => d.message).join('；')}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const normalized = normalizeCustomThemeToken(raw);
  return { valid: true, errors: [], token: normalized };
}

/**
 * 归一化自定义主题 Token（补全缺失值与默认派生）
 * @param {Record<string, any>} raw
 * @param {string} [fallbackId]
 * @returns {CustomThemeToken}
 */
export function normalizeCustomThemeToken(raw, fallbackId) {
  const accent = isValidHexColor(raw.colors?.accent) ? raw.colors.accent.trim() : '#2563EB';

  const defaultId = `custom-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().toLowerCase() : (fallbackId || defaultId);
  id = id.replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || defaultId;
  if (!id.startsWith('custom-')) {
    id = `custom-${id}`;
  }

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '自定义主题';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const author = typeof raw.author === 'string' ? raw.author.trim() : '';

  const headingStyle = typeof raw.headingStyle === 'string' && raw.headingStyle.trim()
    ? raw.headingStyle.trim()
    : 'default';

  const bCandidate = raw.blockquote?.style || raw.blockquoteStyle;
  const blockquoteStyle = VALID_BLOCKQUOTE_STYLES.includes(bCandidate) ? bCandidate : undefined;
  const blockquote = blockquoteStyle ? { style: blockquoteStyle } : undefined;

  const sCandidate = raw.typography?.strongStyle || raw.strongStyle;
  const strongStyle = VALID_STRONG_STYLES.includes(sCandidate) ? sCandidate : undefined;

  const h3Candidate = raw.heading?.h3Style || raw.h3Style;
  const h3Style = VALID_H3_STYLES.includes(h3Candidate) ? h3Candidate : undefined;

  const h4Candidate = raw.heading?.h4Style || raw.h4Style;
  const h4Style = VALID_H4_STYLES.includes(h4Candidate) ? h4Candidate : undefined;

  /** @param {unknown} val */
  const normalizeOrnament = (val) => {
    if (typeof val !== 'string' || !val.trim()) return undefined;
    const lower = val.trim().toLowerCase();
    return VALID_HEADING_ORNAMENTS.includes(/** @type {any} */ (lower)) && lower !== 'none' ? lower : undefined;
  };

  const svgPathRegex = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;
  /** @param {unknown} val */
  const normalizeCustomPath = (val) => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed || trimmed.length > 400 || !svgPathRegex.test(trimmed)) return undefined;
    return trimmed;
  };

  let heading = undefined;
  if (raw.heading && typeof raw.heading === 'object' && !Array.isArray(raw.heading)) {
    const h = raw.heading;
    const ornament = normalizeOrnament(h.ornament);
    const customPath = normalizeCustomPath(h.customPath);
    const h3Ornament = normalizeOrnament(h.h3Ornament);
    const h3CustomPath = normalizeCustomPath(h.h3CustomPath);
    const h4Ornament = normalizeOrnament(h.h4Ornament);
    const h4CustomPath = normalizeCustomPath(h.h4CustomPath);
    const h3Prefix = typeof h.h3Prefix === 'string' && h.h3Prefix ? h.h3Prefix.slice(0, 20) : undefined;
    const h4Prefix = typeof h.h4Prefix === 'string' && h.h4Prefix ? h.h4Prefix.slice(0, 20) : undefined;

    heading = {
      align: /** @type {'left' | 'center'} */ (h.align === 'center' ? 'center' : 'left'),
      style: typeof h.style === 'string' ? h.style.trim() : (headingStyle !== 'default' ? headingStyle : ''),
      prefix: typeof h.prefix === 'string' ? h.prefix.slice(0, 30) : '',
      ...(ornament ? { ornament } : {}),
      ...(customPath ? { customPath } : {}),
      border: typeof h.border === 'string' ? sanitizeRawCssOverrides(h.border).sanitized : undefined,
      borderLeft: typeof h.borderLeft === 'string' ? sanitizeRawCssOverrides(h.borderLeft).sanitized : undefined,
      borderBottom: typeof h.borderBottom === 'string' ? sanitizeRawCssOverrides(h.borderBottom).sanitized : undefined,
      background: typeof h.background === 'string' ? sanitizeRawCssOverrides(h.background).sanitized : undefined,
      borderRadius: typeof h.borderRadius === 'string' ? sanitizeRawCssOverrides(h.borderRadius).sanitized : undefined,
      customStyle: typeof h.customStyle === 'string' ? sanitizeRawCssOverrides(h.customStyle).sanitized : undefined,
      ...(h3Style ? { h3Style } : {}),
      ...(h3Prefix ? { h3Prefix } : {}),
      ...(h3Ornament ? { h3Ornament } : {}),
      ...(h3CustomPath ? { h3CustomPath } : {}),
      ...(h4Style ? { h4Style } : {}),
      ...(h4Prefix ? { h4Prefix } : {}),
      ...(h4Ornament ? { h4Ornament } : {}),
      ...(h4CustomPath ? { h4CustomPath } : {}),
    };
  }

  const canvas = isValidHexColor(raw.colors?.canvas) ? raw.colors.canvas.trim() : undefined;
  const colors = {
    accent,
    ...(canvas ? { canvas } : {}),
    light: isValidHexColor(raw.colors?.light) ? raw.colors.light.trim() : tintColorWithWhite(accent, 0.94),
    highlight: isValidHexColor(raw.colors?.highlight) ? raw.colors.highlight.trim() : accent,
    title: isValidHexColor(raw.colors?.title) ? raw.colors.title.trim() : '#1E293B',
    text: isValidHexColor(raw.colors?.text) ? raw.colors.text.trim() : '#334155',
    muted: isValidHexColor(raw.colors?.muted) ? raw.colors.muted.trim() : '#64748B',
    border: isValidHexColor(raw.colors?.border) ? raw.colors.border.trim() : '#E2E8F0',
    codeBackground: isValidHexColor(raw.colors?.codeBackground) ? raw.colors.codeBackground.trim() : '#F8FAFC',
  };

  const typo = raw.typography || {};
  const typography = {
    fontPreset: VALID_FONT_PRESETS.includes(typo.fontPreset) ? typo.fontPreset : 'sans-serif',
    baseFontSize: typeof typo.baseFontSize === 'number' && Number.isFinite(typo.baseFontSize)
      ? Math.min(22, Math.max(12, Math.round(typo.baseFontSize)))
      : 15,
    lineHeight: typeof typo.lineHeight === 'number' && Number.isFinite(typo.lineHeight)
      ? Math.min(2.4, Math.max(1.4, Number(typo.lineHeight.toFixed(2))))
      : 1.75,
    paragraphGap: typeof typo.paragraphGap === 'number' && Number.isFinite(typo.paragraphGap)
      ? Math.min(40, Math.max(8, Math.round(typo.paragraphGap)))
      : 16,
    letterSpacing: typeof typo.letterSpacing === 'number' && Number.isFinite(typo.letterSpacing)
      ? Math.min(2, Math.max(0, Number(typo.letterSpacing.toFixed(1))))
      : 0,
    ...(strongStyle ? { strongStyle } : {}),
  };

  const footer = {
    showEngagementCard: raw.footer?.showEngagementCard !== undefined
      ? Boolean(raw.footer.showEngagementCard)
      : true,
    ctaText: typeof raw.footer?.ctaText === 'string' && raw.footer.ctaText.trim()
      ? raw.footer.ctaText.trim()
      : '如果对你有启发，欢迎点赞、在看、转发',
  };

  const rawCssSource = typeof raw.css === 'string' && raw.css.trim()
    ? raw.css
    : (typeof raw.rawCssOverrides === 'string' ? raw.rawCssOverrides : '');
  const cssCheck = sanitizeRawCssOverrides(String(rawCssSource || ''));
  const sanitizedCss = cssCheck.safe ? cssCheck.sanitized : '';
  const compiledCheck = sanitizedCss
    ? compileCustomCss(sanitizedCss, { sourceIdentity: 'normalize-theme-css' })
    : null;
  const effectiveCss = compiledCheck?.usable ? sanitizedCss : '';

  // 严格前向兼容：保留未知外部字段
  const extraFields = { ...raw };
  delete extraFields.id;
  delete extraFields.name;
  delete extraFields.description;
  delete extraFields.author;
  delete extraFields.headingStyle;
  delete extraFields.heading;
  delete extraFields.h3Style;
  delete extraFields.h4Style;
  delete extraFields.blockquote;
  delete extraFields.blockquoteStyle;
  delete extraFields.strongStyle;
  delete extraFields.colors;
  delete extraFields.typography;
  delete extraFields.footer;
  delete extraFields.css;
  delete extraFields.rawCssOverrides;
  delete extraFields.schemaVersion;

  return {
    schemaVersion: 1,
    id,
    name,
    description,
    author,
    headingStyle,
    heading,
    ...(blockquote ? { blockquote } : {}),
    ...(strongStyle ? { strongStyle } : {}),
    ...(h3Style ? { h3Style } : {}),
    ...(h4Style ? { h4Style } : {}),
    colors,
    typography,
    footer,
    ...(effectiveCss ? { css: effectiveCss } : {}),
    rawCssOverrides: effectiveCss,
    ...extraFields,
  };
}

/**
 * 归一化自定义主题 Token 数组列表
 * @param {unknown} input
 * @returns {CustomThemeToken[]}
 */
export function normalizeCustomThemesList(input) {
  if (!Array.isArray(input)) return [];
  const result = [];
  const seenIds = new Set();

  for (const item of input) {
    if (item && typeof item === 'object') {
      const token = normalizeCustomThemeToken(item);
      let uniqueId = token.id;
      let counter = 1;
      while (seenIds.has(uniqueId)) {
        uniqueId = `${token.id}-${counter++}`;
      }
      token.id = uniqueId;
      seenIds.add(uniqueId);
      result.push(token);
    }
  }

  return result;
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: close the scoped disable block above */
