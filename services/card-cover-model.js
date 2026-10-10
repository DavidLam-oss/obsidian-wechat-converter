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
  **date 恒为空串**——既不读 frontmatter `date`、也不补今天，由用户在侧边栏按需手填
  （2026-10-03 David 定：日期不默认显示）。
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
- 日期语义是硬规矩：**初值恒为空**——不读 frontmatter `date`、禁止回填当前日期伪装有效；
  只有用户在侧边栏显式填写，封面才会出现日期行。
*/

/** 封面字段（C01③ 文字封面 + C06 AI 封面配图） */
/** @typedef {{ title: string, author: string, date: string, excerpt: string, coverImage?: string, coverMode?: 'none' | 'adaptive' | 'mixed' | 'full-bleed', coverImageStyle?: string, coverPrompt?: string, coverImageSource?: string }} CardCoverFields */

/** 呈现版式展示标签 */
export const COVER_MODE_LABELS = /** @type {const} */ ({
  none: '纯文字排版',
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
  coverMode: "none",
  coverImageStyle: "3d-clay",
  coverPrompt: "",
  coverImageSource: "",
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

const IMAGE_EXT_REGEX = /\.(jpe?g|png|gif|webp|svg|bmp|avif)$/i;
const NON_IMAGE_EXT_REGEX = /\.(md|markdown|txt|pdf|docx?|xlsx?|pptx?|zip|rar|tar|gz|mp4|mov|avi|mp3|wav)$/i;

/**
 * 提取当前笔记中的图片引用（纯正则解析，无外部依赖）
 * 支持 Wikilink、Markdown 标准语法、HTML img 语法
 * @param {string} markdown
 * @returns {Array<{ name: string, path: string, isWiki: boolean }>}
 */
export function extractNoteImageReferences(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const rawMatches = [];

  // 1. 匹配 Wikilink 图片 ![[name.png|...]]
  const wikiRegex = /!\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g;
  let match;
  while ((match = wikiRegex.exec(markdown)) !== null) {
    const fullTarget = match[1].trim();
    const cleanTarget = fullTarget.split('#')[0].trim();
    if (!cleanTarget) continue;
    if (!IMAGE_EXT_REGEX.test(cleanTarget)) continue;

    const cleanPath = cleanTarget.split(/[?#]/)[0];
    const name = cleanPath.includes('/') ? cleanPath.slice(cleanPath.lastIndexOf('/') + 1) : cleanPath;
    rawMatches.push({
      index: match.index,
      name,
      path: cleanTarget,
      isWiki: true,
      dedupeKey: cleanTarget.toLowerCase(),
    });
  }

  // 2. 匹配 Markdown 格式图片 ![alt](url)
  const mdRegex = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
  while ((match = mdRegex.exec(markdown)) !== null) {
    const rawTarget = match[2].trim();
    let urlPart = '';
    if (rawTarget.startsWith('<')) {
      const endAngle = rawTarget.indexOf('>');
      urlPart = endAngle !== -1 ? rawTarget.slice(1, endAngle).trim() : rawTarget.slice(1).trim();
    } else {
      urlPart = rawTarget.split(/\s+["'(]/)[0].trim().split(/\s+/)[0].trim();
    }
    if (!urlPart) continue;

    const cleanPath = urlPart.split(/[?#]/)[0];
    if (NON_IMAGE_EXT_REGEX.test(cleanPath)) continue;

    const rawName = match[1].trim();
    const nameClean = rawName.split('|')[0].trim();
    const fallbackName = cleanPath.includes('/') ? cleanPath.slice(cleanPath.lastIndexOf('/') + 1) : cleanPath;
    const name = nameClean || fallbackName || '图片';
    rawMatches.push({
      index: match.index,
      name,
      path: urlPart,
      isWiki: false,
      dedupeKey: urlPart.toLowerCase(),
    });
  }

  // 3. 匹配 HTML 格式图片 <img ... src="..." ...>
  const imgTagRegex = /<img\b([\s\S]*?)\/?>/gi;
  let tagMatch;
  while ((tagMatch = imgTagRegex.exec(markdown)) !== null) {
    const attrs = tagMatch[1];
    const srcMatch = /\bsrc\s*=\s*(?:["']([^"']+)["']|([^"'\\s>]+))/i.exec(attrs);
    if (!srcMatch) continue;
    const src = (srcMatch[1] || srcMatch[2] || '').trim();
    if (!src) continue;

    const cleanPath = src.split(/[?#]/)[0];
    if (NON_IMAGE_EXT_REGEX.test(cleanPath)) continue;

    const altMatch = /\balt\s*=\s*(?:["']([^"']*)["']|([^"'\\s>]+))/i.exec(attrs);
    const alt = (altMatch?.[1] || altMatch?.[2] || '').trim();
    const fallbackName = cleanPath.includes('/') ? cleanPath.slice(cleanPath.lastIndexOf('/') + 1) : cleanPath;
    const name = alt || fallbackName || '图片';
    rawMatches.push({
      index: tagMatch.index,
      name,
      path: src,
      isWiki: false,
      dedupeKey: src.toLowerCase(),
    });
  }

  // 4. 按文档中的自然出现顺序排序，并去重
  rawMatches.sort((a, b) => a.index - b.index);
  const results = [];
  const seen = new Set();
  for (const item of rawMatches) {
    if (!seen.has(item.dedupeKey)) {
      seen.add(item.dedupeKey);
      results.push({ name: item.name, path: item.path, isWiki: item.isWiki });
    }
  }

  return results;
}

/**
 * 启发式判断图片引用是否适合作为封面首图候选
 * 过滤小图标、Badge、赞赏码等非正文内容大图
 * @param {{ name: string, path: string }} imgRef
 * @returns {boolean}
 */
export function isLikelyContentImage(imgRef) {
  if (!imgRef || typeof imgRef.path !== 'string') return false;
  const p = imgRef.path.toLowerCase();
  const n = (imgRef.name || '').toLowerCase();

  // 1. 过滤常见徽章与数据打标服务
  if (
    p.includes('shields.io') ||
    p.includes('badge.fury.io') ||
    p.includes('travis-ci') ||
    p.includes('visitor-badge') ||
    p.includes('github.com/workflows') ||
    p.includes('codecov.io') ||
    p.includes('badgen.net')
  ) {
    return false;
  }

  // 2. 过滤常见非正文小图标与功能性图片
  if (
    n.includes('avatar') ||
    n.includes('favicon') ||
    n.includes('icon') ||
    n.includes('logo') ||
    n.includes('qrcode') ||
    n.includes('赞赏') ||
    n.includes('打赏') ||
    n.includes('关注')
  ) {
    return false;
  }

  return true;
}

/**
 * 智能探查正文第一张有效图片作为封面候选
 * @param {string} markdown
 * @returns {{ name: string, path: string, isWiki: boolean } | null}
 */
export function findFirstContentImage(markdown) {
  const images = extractNoteImageReferences(markdown);
  if (!images || images.length === 0) return null;
  const contentImg = images.find(isLikelyContentImage);
  return contentImg || images[0];
}

/**
 * 从笔记内容派生封面初值：title 取 frontmatter `title` 否则文件名；
 * excerpt 取 `description` 或 `excerpt`；**date 恒为空**（不预填，由用户自己填）；
 * 封面配图若未在 Frontmatter 指定，则自动提取正文首张内容图并启用自适应排版。
 * @param {{ markdown?: string, sourcePath?: string }} input
 * @returns {CardCoverFields}
 */
export function deriveCoverFields(input = {}) {
  const markdown = String(input.markdown || "");
  const meta = parseCardFrontmatter(markdown);
  const sourcePath = String(input.sourcePath || "");
  const fileName = sourcePath.includes("/")
    ? sourcePath.slice(sourcePath.lastIndexOf("/") + 1)
    : sourcePath;
  const baseTitle = fileName.replace(/\.(md|markdown|mdx|txt)$/i, "").trim();
  const title = String(meta.title || "").trim() || baseTitle;
  const excerpt = String(meta.description || meta.excerpt || "").trim();

  // 1. 封面配图初值派生
  let coverImage = String(meta.cover || meta.banner || meta.image || "").trim();
  let coverImageSource = String(meta.coverImageSource || "").trim();

  if (!coverImage) {
    const firstImg = findFirstContentImage(markdown);
    if (firstImg && firstImg.path) {
      coverImage = firstImg.path;
      coverImageSource = 'note';
    }
  }

  // 2. 封面版式（coverMode）初值派生
  let coverMode = 'none';
  if (
    meta.coverMode === 'none' ||
    meta.coverMode === 'full-bleed' ||
    meta.coverMode === 'mixed' ||
    meta.coverMode === 'adaptive'
  ) {
    coverMode = meta.coverMode;
  } else {
    // Frontmatter 未指定时：有封面图则默认启用自适应版式，无图则保持极简纯文字
    coverMode = coverImage ? 'adaptive' : 'none';
  }

  return {
    title,
    author: String(meta.author || "").trim(),
    date: "",
    excerpt,
    coverImage,
    coverMode,
    coverImageStyle: String(meta.coverStyle || '3d-clay').trim(),
    coverPrompt: String(meta.coverPrompt || '').trim(),
    coverImageSource,
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
    if (src.coverMode === 'none' || src.coverMode === 'full-bleed' || src.coverMode === 'mixed' || src.coverMode === 'adaptive') {
      return src.coverMode;
    }
    return base.coverMode || 'none';
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
    coverImageSource: typeof src.coverImageSource === 'string' ? src.coverImageSource.trim() : (base.coverImageSource || ''),
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
