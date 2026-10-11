/*
## 核心功能

实现多平台发布 Tab 顶部的“支持平台清单墙 (Platform Wall)”组件。

## 输入

接收 DOM 容器元素、可选自定义平台列表与配置项。

## 输出

输出 `renderPlatformWall` 函数，在目标容器内渲染等宽栅格的平台照片墙。

## 定位

位于 views/settings/，属于多平台设置面板的可视化展示层。

## 依赖

关键依赖：`../../services/wechatsync-results.js`。
## 维护规则

- 严格排除微信 (weixin) 与飞书 (feishu)，这两个平台拥有独立 Tab。
- 遵循无 emoji 规范，图片加载失败时回退为品牌色首字符微标。
*/

import { getFallbackWechatsyncPlatforms } from '../../services/wechatsync-results.js';
import { attachIcon } from '../apple-style-view-shared.js';

/**
 * 渲染统一样式的带原生 Lucide 图标的 Section Header
 * @param {HTMLElement} containerEl
 * @param {string} iconName Lucide 图标名称
 * @param {string} title 标题文本
 * @returns {HTMLDivElement}
 */
export function renderSectionHeader(containerEl, iconName, title) {
  const header = containerEl.createDiv({ cls: 'apple-settings-about-section-header' });
  const iconSpan = header.createSpan({ cls: 'apple-settings-about-section-icon' });
  attachIcon(iconSpan, iconName);
  header.createSpan({ text: title });
  return header;
}

/** @type {Record<string, string>} */
const PLATFORM_HOSTNAMES = {
  xiaohongshu: 'xiaohongshu.com',
  zhihu: 'zhihu.com',
  weibo: 'weibo.com',
  douyin: 'douyin.com',
  toutiao: 'toutiao.com',
  bilibili: 'bilibili.com',
  csdn: 'csdn.net',
  yuque: 'yuque.com',
  jianshu: 'jianshu.com',
  smzdm: 'smzdm.com',
  juejin: 'juejin.cn',
  baijiahao: 'baidu.com',
  douban: 'douban.com',
  sohu: 'sohu.com',
  xueqiu: 'xueqiu.com',
  woshipm: 'woshipm.com',
  dayu: 'dayu.com',
  yidian: 'yidianzixun.com',
  '51cto': '51cto.com',
  imooc: 'imooc.com',
  oschina: 'oschina.net',
  segmentfault: 'segmentfault.com',
  cnblogs: 'cnblogs.com',
  sohufocus: 'focus.cn',
  x: 'x.com',
  eastmoney: 'eastmoney.com',
  netease: '163.com',
};

/** @type {Record<string, string>} */
const BRAND_COLORS = {
  xiaohongshu: '#ff2442',
  zhihu: '#0066ff',
  weibo: '#e6162d',
  douyin: '#1f1f1f',
  toutiao: '#f85959',
  bilibili: '#fb7299',
  csdn: '#fc5531',
  yuque: '#00b96b',
  jianshu: '#ea6f5a',
  smzdm: '#e02424',
  juejin: '#1e80ff',
  baijiahao: '#2932e1',
  douban: '#007722',
  x: '#111111',
  segmentfault: '#009a61',
  oschina: '#21b351',
  cnblogs: '#2b6695',
  '51cto': '#007bb6',
};

/**
 * @param {{ id: string, name: string, homepage?: string }} platform
 * @returns {string}
 */
function resolvePlatformHostname(platform) {
  const hostname = PLATFORM_HOSTNAMES[platform.id];
  if (typeof hostname === 'string') return hostname;
  if (platform.homepage) {
    try {
      const url = new URL(platform.homepage);
      return url.hostname.replace(/^www\./, '');
    } catch {
      // fallback
    }
  }
  return '';
}

/**
 * 渲染首字符品牌微标（离线/加载失败回退）
 * @param {HTMLElement} wrap
 * @param {{ id: string, name: string }} platform
 */
function renderLetterFallback(wrap, platform) {
  const fallback = wrap.createSpan({ cls: 'wechat-platform-wall-letter' });
  const rawName = platform.name || platform.id || '';
  const firstChar = rawName.replace(/[\s()]/g, '').charAt(0) || '平';
  fallback.setText(firstChar);
  const color = BRAND_COLORS[platform.id];
  if (typeof color === 'string' && typeof fallback.setCssStyles === 'function') {
    fallback.setCssStyles({
      backgroundColor: color,
      color: '#ffffff',
    });
  }
}

/**
 * 获取适用于多平台发布 Tab 的有效平台列表（严格剔除微信与飞书）
 * @param {Array<{ id: string, name: string }> | undefined} [customPlatforms]
 * @returns {Array<{ id: string, name: string, homepage?: string }>}
 */
export function getMultiPlatformWallList(customPlatforms) {
  const rawList = Array.isArray(customPlatforms) && customPlatforms.length > 0
    ? customPlatforms
    : getFallbackWechatsyncPlatforms();

  // 严格过滤掉微信（已有微信 Tab）与飞书（已有飞书 Tab）
  return rawList.filter((platform) => {
    const id = String(platform?.id || '').toLowerCase();
    return id !== 'weixin' && id !== 'wechat' && id !== 'feishu';
  });
}

/**
 * 渲染平台照片墙卡片
 * @param {HTMLElement} containerEl
 * @param {object} [options]
 * @param {Array<{ id: string, name: string }>} [options.platforms]
 * @param {string} [options.title]
 * @param {string} [options.desc]
 * @returns {HTMLDivElement}
 */
export function renderPlatformWall(containerEl, options = {}) {
  const platforms = getMultiPlatformWallList(options.platforms);

  const card = containerEl.createDiv({ cls: 'wechat-platform-wall-card' });

  // 头部统计栏
  const header = card.createDiv({ cls: 'wechat-platform-wall-header' });
  const titleRow = header.createDiv({ cls: 'wechat-platform-wall-title-row' });
  titleRow.createSpan({
    text: options.title || `已打通全网 ${platforms.length} 个主流平台`,
    cls: 'wechat-platform-wall-title',
  });
  titleRow.createSpan({
    text: `${platforms.length} 平台矩阵`,
    cls: 'wechat-platform-wall-badge',
  });

  const subtitle = options.desc || '涵盖主流自媒体、技术社区与财经资讯平台。笔记写完后，通过浏览器扩展登录态一键分发至草稿箱。';
  header.createEl('p', {
    text: subtitle,
    cls: 'wechat-platform-wall-desc',
  });

  // 等宽栅格 Tile 列表
  const grid = card.createEl('ul', { cls: 'wechat-platform-wall-grid' });

  platforms.forEach((platform) => {
    const tile = grid.createEl('li', { cls: 'wechat-platform-wall-tile' });
    tile.setAttribute('title', platform.name);

    const iconWrap = tile.createSpan({ cls: 'wechat-platform-wall-icon-wrap' });
    const hostname = resolvePlatformHostname(platform);

    if (hostname) {
      const img = iconWrap.createEl('img', {
        cls: 'wechat-platform-wall-icon',
        attr: {
          src: `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
          alt: platform.name,
          loading: 'lazy',
          width: '16',
          height: '16',
        },
      });
      img.onerror = () => {
        img.remove();
        renderLetterFallback(iconWrap, platform);
      };
    } else {
      renderLetterFallback(iconWrap, platform);
    }

    tile.createSpan({
      text: platform.name,
      cls: 'wechat-platform-wall-name',
    });
  });

  return card;
}
