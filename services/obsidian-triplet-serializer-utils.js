/*
## 核心功能

提供 Obsidian triplet serializer 共享的内联样式与主题样式读取工具。

## 输入

接收 DOM 元素、样式字符串、converter 运行时和目标标签名。

## 输出

输出 `appendInlineStyle`、`setInlineStyleIfMissing`、`getTagStyle`，供 serializer 主流程和子模块复用。

## 定位

位于 services/，是 triplet serializer 的低层工具模块；不承载具体节点转换规则。

## 依赖

关键依赖：DOM Element API 和 converter.getInlineStyle 约定。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 只放跨 serializer 子模块复用的小工具，具体图片、表格、数学或清洗逻辑应放到对应模块。
*/

/**
 * @param {Element | null | undefined} el
 * @param {string} styleText
 */
function appendInlineStyle(el, styleText) {
  if (!el || !styleText) return;
  const existing = el.getAttribute('style') || '';
  if (!existing) {
    el.setAttribute('style', styleText);
    return;
  }
  const normalized = existing.trim().endsWith(';') ? existing.trim() : `${existing.trim()};`;
  el.setAttribute('style', `${normalized} ${styleText}`);
}

/**
 * @param {Element | null | undefined} el
 * @param {string} styleText
 */
function setInlineStyleIfMissing(el, styleText) {
  if (!el || !styleText) return;
  const existing = el.getAttribute('style');
  if (existing && existing.trim()) return;
  el.setAttribute('style', styleText);
}

/**
 * @param {ConverterLike | null | undefined} converter
 * @param {string} tagName
 * @returns {string}
 */
function getTagStyle(converter, tagName) {
  if (!converter || typeof converter.getInlineStyle !== 'function') return '';
  try {
    return converter.getInlineStyle(tagName) || '';
  } catch {
    return '';
  }
}

export {
  appendInlineStyle,
  setInlineStyleIfMissing,
  getTagStyle,
};
