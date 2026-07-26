/*
## 核心功能

将 Markdown 清洗为微信贴图（newspic）所需的纯文本文案。

## 输入

接收原始 Markdown 字符串，以及是否插入配图序号、贴图最终图片顺序等选项。

## 输出

输出 `normalizeImageKey`、`cleanMarkdownToPlainText`，供贴图提取与预览复用。

## 定位

位于 services/，是共享服务模块；只做纯文本转换，不依赖 Obsidian API 或 DOM。

## 依赖

关键依赖：无直接模块导入；依赖同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * 把图片地址归一化成可比较的 key。
 *
 * 正文里写的是 `![[a.png]]` 或 `![](attachments/a.png)`，而贴图顺序列表里可能是
 * 带目录、带 URL 编码的写法。统一取「解码后的文件名（小写）」作为 key，避免用
 * 子串互相包含来匹配（`1.png` 会误配 `11.png`）。
 *
 * @param {unknown} src
 * @returns {string}
 */
function normalizeImageKey(src) {
  if (typeof src !== 'string') return '';
  let value = src.trim();
  if (!value) return '';

  // 去掉 markdown 尺寸/标题后缀与锚点参数
  value = value.split('#')[0].split('?')[0].trim();

  try {
    value = decodeURIComponent(value);
  } catch {
    // 非法编码时保留原值
  }

  const segments = value.split(/[\\/]/);
  const fileName = segments[segments.length - 1] || value;
  return fileName.trim().toLowerCase();
}

/**
 * 在贴图顺序列表中查找某个正文图片地址的序号（从 1 开始）。
 *
 * @param {string} src - 正文中书写的图片地址
 * @param {string[]} imageOrder - 贴图九宫格的最终顺序
 * @returns {number} 命中返回 1-based 序号，未命中返回 0
 */
function findImageOrderIndex(src, imageOrder) {
  if (!Array.isArray(imageOrder) || imageOrder.length === 0) return 0;

  const exactIndex = imageOrder.indexOf(src);
  if (exactIndex !== -1) return exactIndex + 1;

  const key = normalizeImageKey(src);
  if (!key) return 0;

  const keyIndex = imageOrder.findIndex((item) => normalizeImageKey(item) === key);
  return keyIndex === -1 ? 0 : keyIndex + 1;
}

/**
 * 将 Markdown 文本转换为适合微信贴图（newspic）的纯文本 content
 *
 * @param {string} markdown - 原始 Markdown 字符串
 * @param {object} [options]
 * @param {boolean} [options.insertImageIndex=false] - 是否在原图片位置插入 [配图 N] 指引
 * @param {string[]} [options.imageOrder] - 贴图九宫格最终顺序，用于把序号映射到拖拽后的位置
 * @returns {{ text: string, hasCodeBlocks: boolean, hasTables: boolean, imageCount: number }}
 */
function cleanMarkdownToPlainText(markdown, options = {}) {
  if (typeof markdown !== 'string') {
    return { text: '', hasCodeBlocks: false, hasTables: false, imageCount: 0 };
  }

  const insertImageIndex = Boolean(options.insertImageIndex);
  /** @type {string[]} */
  const imageOrder = Array.isArray(options.imageOrder)
    ? options.imageOrder.filter((item) => typeof item === 'string')
    : [];

  // 0. 彻底剥离 Frontmatter (YAML 元数据 --- title: ... ---)
  let text = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

  // 1. 检测代码块与表格
  const codeBlockRegex = /```[\s\S]*?```/g;
  const tableRegex = /\|[^\n]+\|\n\|[\s:|-]+\|\n(\|[^\n]+\|\n?)*/g;

  const hasCodeBlocks = codeBlockRegex.test(text);
  const hasTables = tableRegex.test(text);

  // 2. 彻底移除代码块
  text = text.replace(/```[\s\S]*?```/g, '');

  // 3. 彻底移除 Markdown 表格
  text = text.replace(/\|[^\n]+\|\n\|[\s:|-]+\|\n(\|[^\n]+\|\n?)*/g, '');

  // 4. 彻底移除删除线内容 (~~被删除的内容~~)
  text = text.replace(/~~[\s\S]*?~~/g, '');

  // 5. 处理图片标签并计数 (![[...]] 与 ![...](...))
  let imageCounter = 0;
  const imageTagRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]|!\[([^\]]*)\]\(([^)]+)\)/g;

  text = text.replace(imageTagRegex, (match, wikiSrc, altText, stdSrc) => {
    imageCounter++;
    if (!insertImageIndex) {
      return '';
    }
    const src = String(wikiSrc || stdSrc || '').trim();

    if (imageOrder.length > 0) {
      const mappedIndex = findImageOrderIndex(src, imageOrder);
      // 用户在侧边栏删掉了这张图：正文里不再保留它的序号占位。
      return mappedIndex === 0 ? '' : `[配图 ${mappedIndex}]`;
    }

    return `[配图 ${imageCounter}]`;
  });

  // 6. 清理 HTML 标签
  text = text.replace(/<[^>]+>/g, '');

  // 7. 清理标题 (# 标题)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');

  // 8. 清理粗体与斜体
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');

  // 9. 清理内联代码 (`code`)
  text = text.replace(/`([^`]+)`/g, '$1');

  // 10. 清理 Markdown 链接 ([text](url))
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

  // 11. 清理 Wiki 链接 ([[target|alias]] 或 [[target]])
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => String(alias || target));

  // 12. 清理引用块标记 (> text)
  text = text.replace(/^>\s?/gm, '');

  // 13. 标准化无序列表符号 (- item, * item, + item -> • item)
  text = text.replace(/^[\s]*[-*+]\s+/gm, '• ');

  // 14. 整理每行的尾随空格与空行
  const cleanedLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => {
      // 过滤连续的空行，最多保留 1 个连续空行
      if (line === '' && idx > 0 && arr[idx - 1] === '') {
        return false;
      }
      return true;
    });

  return {
    text: cleanedLines.join('\n').trim(),
    hasCodeBlocks,
    hasTables,
    imageCount: imageCounter
  };
}

export {
  normalizeImageKey,
  cleanMarkdownToPlainText
};
