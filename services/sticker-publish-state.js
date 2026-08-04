/*
## 核心功能

统一计算微信贴图发布所需的数量状态、阻断原因、按钮文案与纯文本转换摘要。

## 输入

接收贴图标题、纯文本文案、图片数量、跨账号素材数量和转换记录。

## 输出

输出不依赖 DOM 的发布状态对象，以及面向用户的转换摘要片段。

## 定位

位于 services/，是侧栏预览与发布弹窗共享的纯状态模型；不负责渲染或网络请求。

## 依赖

仅依赖 `sticker-constants.js` 中的平台限制。

## 维护规则

- 平台限制只从公共常量读取，不在视图中重复数字。
- 阻断原因按用户修复路径排序，新增原因时同步更新测试。
- 面向用户的转换标签集中维护，不暴露内部字段名。
*/

import {
  STICKER_MAX_CONTENT_LENGTH,
  STICKER_MAX_IMAGES,
  STICKER_MAX_TITLE_LENGTH,
} from './sticker-constants.js';

const STICKER_TRANSFORM_LABELS = {
  codeBlocks: '代码块',
  mermaid: '流程图',
  pluginBlocks: '查询块',
  tables: '表格',
  math: '公式',
  footnotes: '脚注',
};

const TITLE_WARNING_LENGTH = 18;
const CONTENT_WARNING_LENGTH = 900;

/**
 * @param {number} value
 * @param {number} max
 * @param {number} warningAt
 * @param {number} [min]
 * @returns {{value:number,max:number,status:'normal'|'warning'|'error'}}
 */
function getStickerCounterState(value, max, warningAt, min = 0) {
  const normalizedValue = Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
  let status = 'normal';
  if (normalizedValue < min || normalizedValue > max) status = 'error';
  else if (normalizedValue >= warningAt) status = 'warning';
  return { value: normalizedValue, max, status };
}

/**
 * @param {object} input
 * @param {string} [input.title]
 * @param {string} [input.content]
 * @param {number} [input.imageCount]
 * @param {number} [input.foreignMaterialCount]
 * @returns {{
 * canSync:boolean,
 * issueCode:string,
 * issueMessage:string,
 * buttonText:string,
 * counters:{
 * title:{value:number,max:number,status:'normal'|'warning'|'error'},
 * content:{value:number,max:number,status:'normal'|'warning'|'error'},
 * images:{value:number,max:number,status:'normal'|'warning'|'error'}
 * }
 * }}
 */
function getStickerPublishState({
  title = '',
  content = '',
  imageCount = 0,
  foreignMaterialCount = 0,
} = {}) {
  const titleValue = String(title);
  const contentValue = String(content);
  const normalizedImageCount = Number.isFinite(imageCount) ? Math.max(0, Number(imageCount)) : 0;
  const titleCounter = getStickerCounterState(
    titleValue.length,
    STICKER_MAX_TITLE_LENGTH,
    TITLE_WARNING_LENGTH
  );
  if (titleValue.trim().length === 0) titleCounter.status = 'error';
  const counters = {
    title: titleCounter,
    content: getStickerCounterState(
      contentValue.length,
      STICKER_MAX_CONTENT_LENGTH,
      CONTENT_WARNING_LENGTH
    ),
    images: getStickerCounterState(
      normalizedImageCount,
      STICKER_MAX_IMAGES,
      STICKER_MAX_IMAGES,
      1
    ),
  };

  let issueCode = '';
  let issueMessage = '';
  let buttonText = '同步到贴图草稿';
  if (normalizedImageCount === 0) {
    issueCode = 'images-required';
    issueMessage = '微信贴图至少需要 1 张图片';
    buttonText = '图片不足，无法同步';
  } else if (normalizedImageCount > STICKER_MAX_IMAGES) {
    issueCode = 'images-exceeded';
    issueMessage = `当前有 ${normalizedImageCount} 张图片，超过 ${STICKER_MAX_IMAGES} 张上限`;
    buttonText = '图片超限，无法同步';
  } else if (titleValue.trim().length === 0) {
    issueCode = 'title-required';
    issueMessage = '请输入贴图标题';
    buttonText = '请输入贴图标题';
  } else if (titleValue.length > STICKER_MAX_TITLE_LENGTH) {
    issueCode = 'title-exceeded';
    issueMessage = `当前标题 ${titleValue.length} 字，超过 ${STICKER_MAX_TITLE_LENGTH} 字上限`;
    buttonText = '标题超长，无法同步';
  } else if (contentValue.length > STICKER_MAX_CONTENT_LENGTH) {
    issueCode = 'content-exceeded';
    issueMessage = `当前文案 ${contentValue.length} 字，超过 ${STICKER_MAX_CONTENT_LENGTH} 字上限`;
    buttonText = '文案超长，无法同步';
  } else if (foreignMaterialCount > 0) {
    issueCode = 'foreign-material';
    issueMessage = '当前账号不能使用其他公众号的素材';
    buttonText = '素材账号不符';
  }

  return {
    canSync: !issueCode,
    issueCode,
    issueMessage,
    buttonText,
    counters,
  };
}

/**
 * @param {Array<{kind?:string,count?:number}>|null|undefined} entries
 * @returns {string[]}
 */
function getStickerTransformParts(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => Number(entry?.count) > 0)
    .map((entry) => `${STICKER_TRANSFORM_LABELS[entry.kind] || '内容'} ${Number(entry.count)} 处`);
}

export {
  CONTENT_WARNING_LENGTH,
  STICKER_TRANSFORM_LABELS,
  TITLE_WARNING_LENGTH,
  getStickerCounterState,
  getStickerPublishState,
  getStickerTransformParts,
};
