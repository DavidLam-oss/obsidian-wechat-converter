/*
## 核心功能

维护插件的赞助鸣谢名单数据。

## 输入

静态维护的赞助者记录列表。

## 输出

输出 `SPONSORS` 列表与相关辅助配置。

## 定位

位于 services/，作为赞助者名单的事实来源，供关于设置页渲染。

## 依赖

无外部依赖。

## 维护规则

- 有新增赞助者时追加至列表。
- 保证信息真实且不泄露敏感个人隐私。
*/

/**
 * @typedef {{
 *   name: string,
 *   tag?: string,
 *   message?: string,
 *   date: string
 * }} SponsorRecord
 */

/** @type {SponsorRecord[]} */
export const SPONSORS = [
  {
    name: '*哥',
    tag: '首位支持者',
    message: '公众号排版助手真不错',
    date: '2026-09',
  },
];
