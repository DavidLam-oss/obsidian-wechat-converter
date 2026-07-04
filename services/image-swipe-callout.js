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
