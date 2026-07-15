#!/usr/bin/env node
/*
## 核心功能

对 obsidian-wechat-converter 生成的 HTML 做静态扫描，标记微信公众号粘贴路径的样式风险点：
- A 类：带 inline style 的语义元素（微信通常保留）。
- B 类：带 style 但无 `leaf` 的 `<span>`（粘贴可能丢样式）。
- 清洗风险：`<style>` 标签 / `class=` 属性（微信会剥离）。

## 输入

一个生成的 HTML 文件路径；或 HTML 字符串（标准输入待扩展）。

## 输出

在终端打印分类报告，不修改任何文件；返回退出码 0（正常）或 1（发现风险点）。

## 定位

位于 scripts/，是辅助验证工具；不参与插件生产运行时，不处理渲染或同步逻辑。

## 依赖

仅依赖 Node.js 内置模块（`node:fs`、`node:path`），不引入第三方运行时依赖。

## 维护规则

- 修改后同步更新脚本头部的报告说明。
- 保持纯静态扫描，不写入文件、不发起网络请求。
*/

/**
 * 微信样式安全静态校验器（obsidian-wechat-converter）
 * ----------------------------------------------------
 * 纯静态扫描生成的 HTML，不修改任何东西。用于「实证验证」阶段，
 * 低成本判断粘贴到公众号编辑器时哪些样式可能被微信清洗。
 *
 * 用法：
 *   node scripts/check-wechat-style-safety.mjs <html-file>
 *
 * 检查三类：
 *   A 类 · 带 inline style 的语义元素（<p>/<strong>/<code>...）
 *        → 微信通常保留，安全。
 *   B 类 · 带 style 但无 leaf 的 <span>（裸 styled span 包文字）
 *        → 粘贴路径可能丢样式，需真机验证；丢了就 scoped 补 leaf。
 *   清洗风险 · <style> 标签 / class= 属性
 *        → 微信编辑器粘贴与草稿 API 都可能剥离，需警惕（自定义 CSS 阶段尤其注意）。
 *
 * 说明：同步草稿走 API 直传、不经编辑器重解析，inline style 原样落库，
 *      leaf 对该路径无关；本脚本只针对「粘贴路径」做风险标记。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('用法: node check-wechat-style-safety.mjs <html-file>');
  process.exit(1);
}

const htmlPath = resolve(process.cwd(), args[0]);
const html = readFileSync(htmlPath, 'utf8');

// 匹配所有标签：<tag attrs> 或 </tag> 或 <tag attrs/>
const tagRe = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
let m;

const styledElements = new Set();      // A 类：带 style 的元素
const spanRisk = [];                    // B 类：带 style 无 leaf 的 span
const styleTags = [];                   // <style> 标签
const classUsages = [];                 // class= 使用

while ((m = tagRe.exec(html)) !== null) {
  const closing = m[1] === '/';
  const tag = m[2].toLowerCase();
  const attrs = m[3] || '';
  if (closing) continue;

  if (tag === 'style') {
    styleTags.push(attrs.trim().slice(0, 50));
    continue;
  }

  const hasStyle = /\bstyle\s*=/.test(attrs);
  const hasLeaf = /\bleaf\b/.test(attrs);
  const hasClass = /\bclass\s*=/.test(attrs);

  if (hasClass) {
    const cls = (attrs.match(/\bclass\s*=\s*["']([^"']*)["']/) || [])[1] || '';
    classUsages.push({ tag, cls: cls.slice(0, 30) });
  }

  if (hasStyle) {
    styledElements.add(tag);
    if (tag === 'span' && !hasLeaf) {
      const start = tagRe.lastIndex;
      const end = html.indexOf('</span>', start);
      const inner = end > -1 ? html.slice(start, end) : '';
      spanRisk.push({
        attrs: attrs.replace(/\s+/g, ' ').slice(0, 90),
        inner: inner.replace(/\s+/g, ' ').slice(0, 40),
      });
    }
  }
}

// ---- 输出报告 ----
const line = (s = '') => console.log(s);
line('=== 微信样式安全静态校验 ===');
line(`文件: ${htmlPath}`);
line('');
line('[A 类] 带 inline style 的语义元素（微信通常保留，安全）:');
line('  ' + ([...styledElements].sort().join(', ') || '(无)'));
line('');
line(`[B 类] 带 style 但无 leaf 的 <span>（粘贴路径风险）: ${spanRisk.length}`);
spanRisk.slice(0, 25).forEach((s, i) => {
  line(`  ${i + 1}. <span ${s.attrs}>${s.inner}</span>`);
});
line('');
line(`[清洗风险] <style> 标签: ${styleTags.length}；class= 使用: ${classUsages.length}`);
classUsages.slice(0, 10).forEach((c, i) => {
  line(`  ${i + 1}. <${c.tag} class="${c.cls}">`);
});

line('');
line('=== 判定 ===');
if (styleTags.length || classUsages.length) {
  line('  ⚠ 含 <style>/class：微信编辑器粘贴与草稿 API 都可能剥离 → 会被洗掉，需改为内联 style。');
}
if (spanRisk.length) {
  line('  ⚠ 有 B 类 span：粘进公众号编辑器逐项验证样式是否保留；若丢失，仅对该 <span> 补 leaf（scoped，不全量包裹）。');
} else {
  line('  ✓ 无 B 类 span：元素级内联覆盖完整。');
}
line('  ℹ 同步草稿（API 路径）不经编辑器重解析，inline style 原样落库，leaf 无关。');
