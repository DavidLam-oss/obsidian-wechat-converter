/*
## 核心功能

从微信草稿清洗管线的渲染产物中探测列表缩进，复用主题层共享的 LIST_INDENT 数据。

## 输入

接收一个已解析的 DOM 容器（通常是 createHtmlContainer 产出的根元素）。

## 输出

输出列表缩进像素值（number），供 wechat-html-cleaner.js 构建抗改写段落时使用。

## 定位

位于 services/，是清洗层的缩进解析辅助；不生成标签样式或修改 DOM。

## 依赖

关键依赖：`../themes/apple-theme-config.js`。

## 维护规则

- 缩进数值的唯一来源是 themes/apple-theme-config.js 的 LIST_INDENT；
  本模块只负责从 HTML 中把字体信息提取出来再交给 resolveListIndent，不得再定义任何阈值。
- 修改逻辑后同步更新本文件说明书。
*/

import { resolveListIndent } from '../themes/apple-theme-config.js';

/**
 * 从渲染产物中解析列表缩进。
 * 渲染管线已在 <section> 上写入 font-family，据此探测字体族，
 * 与主题层 resolveListIndent 共用同一份 LIST_INDENT 数据，保证预览与发布一致。
 * @param {ParentNode | null | undefined} container
 * @returns {number}
 */
export function resolveDraftListIndent(container) {
  if (!container || typeof (/** @type {Element} */ (container)).querySelector !== 'function') {
    return resolveListIndent('');
  }
  const section = /** @type {Element} */ (container).querySelector('section');
  const fontFamily = section?.getAttribute('style')?.match(/font-family\s*:\s*([^;]+)/i)?.[1] || '';
  return resolveListIndent(fontFamily);
}
