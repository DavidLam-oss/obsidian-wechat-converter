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

/**
 * @typedef {{
 *   align?: 'left' | 'center',
 *   style?: string,
 *   prefix?: string, // 序号或前缀文本（支持 %n、{number} 或 01 占位符自动替换为当前二级标题序号；纯文本无占位符则原样呈现）
 *   border?: string,
 *   borderLeft?: string,
 *   borderBottom?: string,
 *   background?: string,
 *   borderRadius?: string,
 *   customStyle?: string,
 *   h3Style?: 'bottom-line' | 'left-border' | 'classic' | 'simple',
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
 *   h3Style?: 'bottom-line' | 'left-border' | 'classic' | 'simple',
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
 *   rawCssOverrides?: string, // 预留前向兼容字段；由于微信富文本编辑器强制剥离所有 <style> 块与外部类名，该字段在文章排版转译中保持惰性，样式定制统一走 Token/heading 内联
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
export const VALID_H3_STYLES = /** @type {const} */ (['bottom-line', 'left-border', 'classic', 'simple']);

/**
 * 开箱即用的 AI 主题设计提示词模板
 */
export const AI_THEME_PROMPT_TEMPLATE = `你是一个专业的公众号视觉排版大师与配置生成器。请根据用户的风格诉求，为用户设计一套优雅、克制、耐看且在微信生态内具有极高排版兼容性的 Theme Token JSON。

【微信排版能力边界与规范 (Do's & Don'ts)】
- 🚫 严禁做（微信编辑器会剥离或排版崩溃）：
  * 严禁依赖外部 CSS 类名或 <style> 标签（微信富文本完全剥离 <style> 块）；
  * 严禁使用伪元素（::before、::after 无法内联）；
  * 严禁使用 CSS 动画（@keyframes）及 JS 交互事件；
  * 严禁使用负 margin 溢出、大宽度绝对定位或浮动（会导致手机端产生水平滚动条或文字截断）；
  * 严禁在 JSON 外部附带任何额外 Markdown 代码围栏（例如 \`\`\`json）、前导问候或解释说明，必须是合法的纯 JSON 字符串。
- ✅ 允许并鼓励做（微信富文本完美兼容的标准内联样式）：
  * 标准内联盒模型：padding、margin、border、border-left、border-bottom、border-radius；
  * 背景与层次：background（单色、浅底色或 linear-gradient 线性渐变）；
  * 文本修饰：color、font-size、line-height、font-weight、letter-spacing、text-align；
  * 标题自由组合：利用 prefix（大序号 01.、徽标 ◆、双斜杠 //、直角引号 「）、边框条与背景色块组合出极具美感的标题样式；
  * 正文字色保障：正文 text 建议使用 #222222~#333333 保证阅读对比度，辅助色 muted 使用 #666666~#888888。

【严格输出规范】
1. 只输出合法标准的 JSON 字符串，严禁包含任何 Markdown 代码围栏（例如 \`\`\`json）、前后缀解说或注释。
2. 颜色值必须严格符合 6 位十六进制格式（#RRGGBB）。
3. 遵循克制配色要素：
   - accent（主色）：醒目品牌色，用于重点引导、徽标、分节与强调；
   - canvas（可选整篇底色）：如 "#FAF8F5"（护眼暖白）、"#FDFBF7"（复古纸张米黄）或纯白 "#FFFFFF"；
   - light（浅底色）：主色极浅淡化版本（通常为 90%~95% 浅度混白），用于引用块与卡片底色；
   - highlight（点睛色）：辅助提亮点缀色，用于重点短语标注；
   - title / text / muted：用于标题、正文与次要说明的灰阶；
   - border：分割线与卡片边框色；
   - codeBackground：代码块背景底色。
4. 【二级标题装饰 (heading) —— 拥有充分设计自由】：
   你既可以直接使用常用风格："left-border"（左侧装饰条） | "bottom-line"（底边线） | "serial-number"（现代科技大数字） | "badge"（胶囊徽标） | "bubble"（浅色背景卡片） | "zen"（留白禅意） | "default"（经典条），
   也可以在 "heading" 对象中自由定制专属版式：
   - "align": "left" | "center"
   - "prefix": 自定义前缀修饰或序号（如 "01."、"01 /"、"PART 01"、"◆ "、"// "、"「 "，或空 ""）
   - "border": 自定义边框（如 "4px solid #2563EB" 或 "2px dashed #93C5FD"）
   - "background": 背景色或线性渐变（如 "rgba(37, 99, 235, 0.08)"）
   - "borderRadius": 圆角（如 "4px"）
   - "customStyle": 可直接给出针对二级标题的微信内联 CSS 声明（例如 "border-left: 4px solid #2563EB; padding: 6px 12px; background: #EFF6FF; border-radius: 0 4px 4px 0;"）
   - "h3Style": 三级标题联动风格，可选 "bottom-line"（默认短底线） | "left-border"（左侧竖条） | "classic"（浅底色小条） | "simple"（纯加粗小标）
5. 【引用块与正文强调】：
   - blockquote.style: 可选 "soft"（默认：左侧色条 + 浅底） | "center"（名言金句：居中 + 上下细线） | "paper"（纸张复古：细边条无背景） | "minimal"（极简：浅灰细边无底色）
   - typography.strongStyle: 可选 "color"（默认：主题色加粗） | "neutral"（传统纯深黑加粗） | "highlight"（加粗且带淡色荧光笔底衬）
   - 注意：代码块（code blocks）请保持默认黑色高亮，无需自定义。
6. typography 排版建议：baseFontSize 通常在 14~17 之间，lineHeight 在 1.6~2.0 之间。

【标准 JSON 输出格式示范】
{
  "schemaVersion": 1,
  "id": "custom-tech-blue",
  "name": "科技沉稳蓝",
  "description": "适合硬核评测与技术解析的理性沉稳排版",
  "author": "设计师",
  "heading": {
    "style": "left-border",
    "align": "left",
    "prefix": "01.",
    "borderLeft": "4px solid #2563EB",
    "background": "rgba(37, 99, 235, 0.08)",
    "borderRadius": "0 4px 4px 0",
    "customStyle": "padding: 6px 12px; margin: 32px 0 16px;",
    "h3Style": "bottom-line"
  },
  "blockquote": {
    "style": "soft"
  },
  "colors": {
    "accent": "#2563EB",
    "canvas": "#FFFFFF",
    "light": "#EFF6FF",
    "highlight": "#F59E0B",
    "title": "#1E293B",
    "text": "#334155",
    "muted": "#64748B",
    "border": "#E2E8F0",
    "codeBackground": "#F8FAFC"
  },
  "typography": {
    "fontPreset": "sans-serif",
    "baseFontSize": 15,
    "lineHeight": 1.75,
    "paragraphGap": 16,
    "letterSpacing": 0,
    "strongStyle": "color"
  },
  "footer": {
    "showEngagementCard": false,
    "ctaText": "如果对你有启发，欢迎点赞、在看、转发"
  }
}

【设计建议与调试提示】：
AI 生成主题如同定制 CSS，排版效果往往需要结合具体文章反复调试 1~2 轮。首次生成若未完全契合预期，可继续针对标题修饰、色相饱和度或边框粗细与 AI 追问微调。

【我的风格诉求（请在此处输入您的具体要求）】：
[例如：“我想要一个日系清新笔记风，主色用森林墨绿，标题左侧有细竖条并带有浅浅的米黄底衬，正文行距调大一些，注重轻松通透的阅读感。”]
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

  // 三级标题风格校验
  const h3Candidate = raw.heading?.h3Style || raw.h3Style;
  if (h3Candidate && !VALID_H3_STYLES.includes(h3Candidate)) {
    errors.push(`三级标题风格 (h3Style) 仅支持 ${VALID_H3_STYLES.join(' / ')}`);
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

  // 5. rawCssOverrides 安全审查
  if (raw.rawCssOverrides) {
    const cssCheck = sanitizeRawCssOverrides(String(raw.rawCssOverrides));
    if (!cssCheck.safe) {
      errors.push(`自定义 CSS 包含危险规则: ${cssCheck.error}`);
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

  let heading = undefined;
  if (raw.heading && typeof raw.heading === 'object' && !Array.isArray(raw.heading)) {
    const h = raw.heading;
    heading = {
      align: /** @type {'left' | 'center'} */ (h.align === 'center' ? 'center' : 'left'),
      style: typeof h.style === 'string' ? h.style.trim() : (headingStyle !== 'default' ? headingStyle : ''),
      prefix: typeof h.prefix === 'string' ? h.prefix.slice(0, 30) : '',
      border: typeof h.border === 'string' ? sanitizeRawCssOverrides(h.border).sanitized : undefined,
      borderLeft: typeof h.borderLeft === 'string' ? sanitizeRawCssOverrides(h.borderLeft).sanitized : undefined,
      borderBottom: typeof h.borderBottom === 'string' ? sanitizeRawCssOverrides(h.borderBottom).sanitized : undefined,
      background: typeof h.background === 'string' ? sanitizeRawCssOverrides(h.background).sanitized : undefined,
      borderRadius: typeof h.borderRadius === 'string' ? sanitizeRawCssOverrides(h.borderRadius).sanitized : undefined,
      customStyle: typeof h.customStyle === 'string' ? sanitizeRawCssOverrides(h.customStyle).sanitized : undefined,
      ...(h3Style ? { h3Style } : {}),
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
    showEngagementCard: Boolean(raw.footer?.showEngagementCard),
    ctaText: typeof raw.footer?.ctaText === 'string' ? raw.footer.ctaText.trim() : '如果对你有启发，欢迎点赞、在看、转发',
  };

  const cssCheck = sanitizeRawCssOverrides(String(raw.rawCssOverrides || ''));
  const rawCssOverrides = cssCheck.safe ? cssCheck.sanitized : '';

  // 严格前向兼容：保留未知外部字段
  const extraFields = { ...raw };
  delete extraFields.id;
  delete extraFields.name;
  delete extraFields.description;
  delete extraFields.author;
  delete extraFields.headingStyle;
  delete extraFields.heading;
  delete extraFields.h3Style;
  delete extraFields.blockquote;
  delete extraFields.blockquoteStyle;
  delete extraFields.strongStyle;
  delete extraFields.colors;
  delete extraFields.typography;
  delete extraFields.footer;
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
    colors,
    typography,
    footer,
    rawCssOverrides,
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
