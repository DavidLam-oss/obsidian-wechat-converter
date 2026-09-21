/*
## 核心功能

封面字段模型（C01③）：从笔记 Markdown 解析 frontmatter 语义字段，派生文字封面初值，
归一化用户编辑。纯字符串/日期逻辑，无 DOM / Obsidian 依赖，node 下可独立测试。

## 输入

- `parseCardFrontmatter(markdown)`：笔记原文（可含 `---` YAML frontmatter）。
- `deriveCoverFields({ markdown, sourcePath })`：封面初值来源。
- `normalizeCoverFields(partial, base)`：用户在设置浮层的编辑输入。
- `isCoverUsable(fields)`：封面有效性（标题非空）。

## 输出

- `parseCardFrontmatter` → `Record<string, string>`（仅顶层标量键；列表/嵌套/多行块忽略）。
- `deriveCoverFields` → `{ title, author, date, excerpt }`：title 取 frontmatter `title`，
  否则用文件名（去扩展名）；author 取 `author`；excerpt 取 `description`/`excerpt`；
  date 取 `date` 并归一化为 `YYYY-MM-DD`——**解析失败留空，绝不补今天**（规划 §3.2）。
- `normalizeCoverFields` → trim 后的四字段；**不按长度截断**（长标题/摘要不静默裁切，
  超限由渲染核验显式诊断）。
- `isCoverUsable` → title 非空即有效；全空封面按「未启用有效封面」处理。

## 定位

位于 services/，封面字段纯逻辑层；封面页装配在 card-render-assembly.js（DOM 层），
会话持有与脏标记在 card-session.js。三者边界：本模块算出「该是什么」，会话记住
「用户改成了什么」，装配层负责「画出来 + 溢出核验」。

## 依赖

无运行时依赖。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- frontmatter 解析只做「够用的一期」：顶层 `key: value`，支持单双引号与行内注释；
  不实现完整 YAML（嵌套、多行、锚点一律忽略），复杂笔记回落文件名标题即可接受。
- 日期语义是硬规矩：解析失败 → 空字符串，禁止回填当前日期伪装有效。
*/

/** 封面字段（C01③ 文字封面 + C06 AI 封面配图） */
/** @typedef {{ title: string, author: string, date: string, excerpt: string, coverImage?: string, coverMode?: 'adaptive' | 'mixed' | 'full-bleed', coverImageStyle?: string, coverPrompt?: string }} CardCoverFields */

/** 呈现版式展示标签 */
export const COVER_MODE_LABELS = /** @type {const} */ ({
  adaptive: '主题自适应版式',
  mixed: '全屏意境大图',
  'full-bleed': '纯海报整页铺满',
});

/** 空字段基准 */
export const EMPTY_COVER_FIELDS = /** @type {CardCoverFields} */ ({
  title: "",
  author: "",
  date: "",
  excerpt: "",
  coverImage: "",
  coverMode: "adaptive",
  coverImageStyle: "3d-clay",
  coverPrompt: "",
});

/**
 * 从字符串首个值剥离包裹引号与行内注释。
 * @param {string} raw
 * @returns {string}
 */
function unquoteValue(raw) {
  let value = raw.trim();
  // 行内注释：仅当不在引号内时截断（简单实现：先记引号状态再处理）
  const quote = value.startsWith('"') || value.startsWith("'") ? value[0] : "";
  if (quote) {
    const end = value.indexOf(quote, 1);
    if (end > 0) return value.slice(1, end);
    return value.slice(1).trim();
  }
  const hashIndex = value.indexOf(" #");
  if (hashIndex >= 0) value = value.slice(0, hashIndex);
  return value.trim();
}

/**
 * 解析 Markdown 头部的 YAML frontmatter（仅顶层标量 `key: value`）。
 * 无 frontmatter、围栏代码块内的 `---`、或列表/嵌套值一律不进入结果。
 * @param {string} markdown
 * @returns {Record<string, string>}
 */
export function parseCardFrontmatter(markdown) {
  const text = String(markdown || "");
  if (!text.startsWith("---")) return {};
  const lines = text.split(/\r?\n/);
  // 首行必须是独立的 `---`
  if (lines[0].trim() !== "---") return {};
  /** @type {Record<string, string>} */
  const result = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "---" || line.trim() === "...") break;
    const match = /^([A-Za-z0-9_\-\u4e00-\u9fff]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue; // 嵌套/列表/续行一律忽略
    const key = match[1];
    const value = unquoteValue(match[2]);
    if (!value) continue; // 空值键（`tags:` 后跟嵌套列表）不记为空标量
    if (!(key in result)) result[key] = value;
  }
  return result;
}

/**
 * 归一化日期显示：`YYYY-MM-DD` / `YYYY/M/D` / ISO 串 → `YYYY-MM-DD`；
 * 其余（含无法解析的文案）→ 空字符串。**绝不回填今天**（§3.2「日期不补今天」）。
 * @param {string} raw
 * @returns {string}
 */
export function normalizeCoverDate(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const match = /^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?/.exec(text);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
  }
  const time = Date.parse(text);
  if (Number.isFinite(time)) {
    const date = new Date(time);
    const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return "";
}

/**
 * 从笔记内容派生封面初值：title 取 frontmatter `title` 否则文件名；
 * excerpt 取 `description` 或 `excerpt`；date 解析失败留空。
 * @param {{ markdown?: string, sourcePath?: string }} input
 * @returns {CardCoverFields}
 */
export function deriveCoverFields(input = {}) {
  const meta = parseCardFrontmatter(String(input.markdown || ""));
  const sourcePath = String(input.sourcePath || "");
  const fileName = sourcePath.includes("/")
    ? sourcePath.slice(sourcePath.lastIndexOf("/") + 1)
    : sourcePath;
  const baseTitle = fileName.replace(/\.(md|markdown|mdx|txt)$/i, "").trim();
  const title = String(meta.title || "").trim() || baseTitle;
  const excerpt = String(meta.description || meta.excerpt || "").trim();
  return {
    title,
    author: String(meta.author || "").trim(),
    date: normalizeCoverDate(meta.date),
    excerpt,
    coverImage: String(meta.cover || meta.banner || meta.image || "").trim(),
    coverMode: meta.coverMode === 'full-bleed' || meta.coverMode === 'mixed' || meta.coverMode === 'adaptive'
      ? meta.coverMode
      : 'adaptive',
    coverImageStyle: String(meta.coverStyle || '3d-clay').trim(),
    coverPrompt: String(meta.coverPrompt || '').trim(),
  };
}

/**
 * 归一化封面字段：四字段 trim；不按长度截断（超限由渲染核验诊断）。
 * 非字符串回落 base。
 * @param {Partial<CardCoverFields> | Record<string, unknown>} [partial]
 * @param {CardCoverFields} [base]
 * @returns {CardCoverFields}
 */
export function normalizeCoverFields(partial = {}, base = EMPTY_COVER_FIELDS) {
  const src = partial && typeof partial === "object" ? partial : {};
  /** @param {'title'|'author'|'date'|'excerpt'} key @returns {string} */
  const pick = (key) => (typeof src[key] === "string" ? /** @type {string} */ (src[key]).trim() : base[key]);
  const resolveMode = () => {
    if (src.coverMode === 'full-bleed' || src.coverMode === 'mixed' || src.coverMode === 'adaptive') {
      return src.coverMode;
    }
    return base.coverMode || 'adaptive';
  };
  return {
    title: pick("title"),
    author: pick("author"),
    date: pick("date"),
    excerpt: pick("excerpt"),
    coverImage: typeof src.coverImage === 'string' ? src.coverImage.trim() : (base.coverImage || ''),
    coverMode: resolveMode(),
    coverImageStyle: typeof src.coverImageStyle === 'string' && src.coverImageStyle.trim() ? src.coverImageStyle.trim() : (base.coverImageStyle || '3d-clay'),
    coverPrompt: typeof src.coverPrompt === 'string' ? src.coverPrompt.trim() : (base.coverPrompt || ''),
  };
}

/**
 * 封面是否有效（规划：标题非空才有有效封面；全空按未启用处理，不生成空白封面卡）。
 * @param {CardCoverFields | null | undefined} fields
 * @returns {boolean}
 */
export function isCoverUsable(fields) {
  return Boolean(fields && String(fields.title || "").trim());
}
