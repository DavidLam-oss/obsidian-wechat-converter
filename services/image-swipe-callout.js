/*
## 核心功能

处理图片、SVG 或 Mermaid 资源的 image swipe callout 能力。

## 输入

接收本地资源路径、DOM 节点、图片字节、渲染选项和上传上下文。

## 输出

输出 `IMAGE_SWIPE_COMMAND_COPY`、`getObsidianLocale`、`isChineseObsidianLocale`、`getImageSwipeCommandCopy`、`quoteLinesForImageSwipeCallout`、`createImageSwipeCalloutMarkdown`，用于资源解析、栅格化、缓存或同步前替换。

## 定位

位于 services/，属于资源处理层；调用方只消费归一化结果。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/** @type {Record<string, ImageSwipeCopyLike>} */
const IMAGE_SWIPE_COMMAND_COPY = {
  'image-swipe': {
    commandName: '插入横滑图片块',
    zhTitle: '左右滑动查看图片',
    enTitle: 'Swipe to view images',
    zhPlaceholder: ['![[图片1.png]]', '![[图片2.png]]'],
    enPlaceholder: ['![[image-1.png]]', '![[image-2.png]]'],
    zhNotice: '已插入图片块',
    enNotice: 'Image block inserted',
  },
  'image-sensitive': {
    commandName: '插入横滑敏感图片块',
    zhTitle: '此类图片可能引发不适，向左滑动查看',
    enTitle: 'Sensitive images. Swipe to view.',
    zhPlaceholder: ['![[图片1.png]]', '![[图片2.png]]'],
    enPlaceholder: ['![[image-1.png]]', '![[image-2.png]]'],
    zhNotice: '已插入敏感图片块',
    enNotice: 'Sensitive image block inserted',
  },
};

/**
 * @param {AppLike | null} [app=null]
 * @returns {string}
 */
function getObsidianLocale(app = null) {
  const candidates = [
    app?.vault?.getConfig?.('language'),
    app?.vault?.getConfig?.('locale'),
    typeof navigator !== 'undefined' ? navigator.language : '',
  ];

  return String(candidates.find((value) => typeof value === 'string' && value.trim()) || '').trim().toLowerCase();
}

/**
 * @param {AppLike | null} [app=null]
 * @returns {boolean}
 */
function isChineseObsidianLocale(app = null) {
  const locale = getObsidianLocale(app);
  return !locale || /^zh(?:-|_|$)/i.test(locale);
}

/**
 * @param {AppLike | null} [app=null]
 * @param {string} [type='image-swipe']
 * @returns {{ name: string, title: string, placeholder: string[], notice: string }}
 */
function getImageSwipeCommandCopy(app = null, type = 'image-swipe') {
  const copy = IMAGE_SWIPE_COMMAND_COPY[type] || IMAGE_SWIPE_COMMAND_COPY['image-swipe'];
  const useChinese = isChineseObsidianLocale(app);
  return {
    name: copy.commandName,
    title: useChinese ? copy.zhTitle : copy.enTitle,
    placeholder: useChinese ? copy.zhPlaceholder : copy.enPlaceholder,
    notice: useChinese ? copy.zhNotice : copy.enNotice,
  };
}

/**
 * @param {unknown} text
 * @returns {string}
 */
function quoteLinesForImageSwipeCallout(text) {
  const lines = String(text || '').split('\n');
  return lines.map((line) => (line ? `> ${line}` : '>')).join('\n');
}

/**
 * @param {string} [type]
 * @param {string} [selectedText]
 * @param {AppLike | null} [app]
 * @returns {string}
 */
function createImageSwipeCalloutMarkdown(type = 'image-swipe', selectedText = '', app = null) {
  const copy = getImageSwipeCommandCopy(app, type);
  const content = String(selectedText || '').trim()
    ? String(selectedText || '').replace(/\s+$/g, '')
    : copy.placeholder.join('\n');
  return `> [!${type}] ${copy.title}\n${quoteLinesForImageSwipeCallout(content)}`;
}

export {
  IMAGE_SWIPE_COMMAND_COPY,
  getObsidianLocale,
  isChineseObsidianLocale,
  getImageSwipeCommandCopy,
  quoteLinesForImageSwipeCallout,
  createImageSwipeCalloutMarkdown,
};
