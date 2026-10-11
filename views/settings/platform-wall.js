/*
## 核心功能

实现多平台发布 Tab 的“支持平台清单墙与发布控制矩阵 (Platform Wall & Selection Matrix)”一体化组件。

## 输入

接收 DOM 容器元素、可选自定义平台列表与配置项（支持只读展示态与可交互勾选态）。

## 输出

输出 `renderPlatformWall` 函数与 `renderSectionHeader` 规范标题函数。

## 定位

位于 views/settings/，负责多平台设置面板的可视化矩阵与勾选交互层。

## 依赖

关键依赖：`../../services/wechatsync-results.js`。

## 维护规则

- 严格排除微信 (weixin) 与飞书 (feishu)，这两个平台拥有独立 Tab。
- 遵循无 emoji 规范，全量使用 Obsidian 原生 Lucide 图标。
*/

// views/settings/platform-wall.js
import { getFallbackWechatsyncPlatforms } from '../../services/wechatsync-results.js';
import { attachIcon } from '../apple-style-view-shared.js';
import { EMBEDDED_PLATFORM_ICONS } from './platform-icons.js';

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

/**
 * 官方高精度 Logo 映射表（同步自 xiaoweibox-mono/apps/home/src/app/obsidian-publisher/_config.ts）
 * @type {Record<string, string>}
 */
export const OFFICIAL_PLATFORM_ICONS = {
  xiaohongshu: 'xiaohongshu.ico',
  douyin: 'douyin.ico',
  toutiao: 'toutiao.webp',
  zhihu: 'zhihu.ico',
  weibo: 'weibo.ico',
  juejin: 'juejin.webp',
  bilibili: 'bilibili.ico',
  baijiahao: 'baijiahao.ico',
  jianshu: 'jianshu.ico',
  yuque: 'yuque.webp',
  douban: 'douban.ico',
  x: 'x.ico',
  csdn: 'csdn.ico',
  segmentfault: 'segmentfault.webp',
  oschina: 'oschina.ico',
  cnblogs: 'cnblogs.ico',
  '51cto': '51cto.webp',
  imooc: 'imooc.webp',
  netease: 'netease.webp',
  sohu: 'sohu.ico',
  sohufocus: 'sohufocus.ico',
  dayu: 'dayu.ico',
  yidian: 'yidian.ico',
  woshipm: 'woshipm.ico',
  xueqiu: 'xueqiu.ico',
  eastmoney: 'eastmoney.ico',
  smzdm: 'smzdm.ico',
};

const OFFICIAL_ICON_BASE_URL = 'https://xiaoweibox.top/obsidian-publisher/platforms';

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
export function resolvePlatformHostname(platform) {
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
export function renderLetterFallback(wrap, platform) {
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
 * 渲染平台图标，具备三级容灾能力：
 * Stage 0: 内置离线高清 Base64 数据（27 个内置平台 0 网络请求 / 0 IP 泄露 / 离线立现 / 滚动不重载）
 * Stage 1: 未内置的自定义平台回退至 Xiaoweibox 官方高清静态资源
 * Stage 2: DuckDuckGo Favicon 镜像服务
 * Stage 3: 品牌色首字符方形徽标
 * @param {HTMLElement} iconWrap
 * @param {{ id: string, name: string, homepage?: string }} platform
 */
export function renderPlatformIcon(iconWrap, platform) {
  const embeddedSrc = EMBEDDED_PLATFORM_ICONS[platform.id];
  if (embeddedSrc) {
    iconWrap.createEl('img', {
      cls: 'wechat-platform-wall-icon',
      attr: {
        src: embeddedSrc,
        alt: platform.name,
        width: '16',
        height: '16',
      },
    });
    return;
  }

  const officialFile = OFFICIAL_PLATFORM_ICONS[platform.id];
  const hostname = resolvePlatformHostname(platform);
  const primarySrc = officialFile
    ? `${OFFICIAL_ICON_BASE_URL}/${officialFile}`
    : (hostname ? `https://icons.duckduckgo.com/ip3/${hostname}.ico` : '');

  if (primarySrc) {
    const img = iconWrap.createEl('img', {
      cls: 'wechat-platform-wall-icon',
      attr: {
        src: primarySrc,
        alt: platform.name,
        width: '16',
        height: '16',
      },
    });
    img.onerror = () => {
      // 若官方静态源失败且有备用域名，尝试 DuckDuckGo Favicon
      if (officialFile && hostname) {
        const ddgSrc = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
        if (img.getAttribute('src') !== ddgSrc) {
          img.setAttribute('src', ddgSrc);
          return;
        }
      }
      // 最终降级：移除裂图并渲染首字符微标
      img.remove();
      renderLetterFallback(iconWrap, platform);
    };
  } else {
    renderLetterFallback(iconWrap, platform);
  }
}

/**
 * 获取适用于多平台发布 Tab 的有效平台列表（严格剔除微信与飞书，含变体）
 * @param {Array<{ id: string, name: string }> | undefined} [customPlatforms]
 * @returns {Array<{ id: string, name: string, homepage?: string }>}
 */
export function getMultiPlatformWallList(customPlatforms) {
  const rawList = Array.isArray(customPlatforms) && customPlatforms.length > 0
    ? customPlatforms
    : getFallbackWechatsyncPlatforms();

  // 严格过滤掉微信（已有微信 Tab）与飞书（已有飞书 Tab），包含变体（如 wechatmp, weixin-mp 等）
  return rawList.filter((platform) => {
    const id = String(platform?.id || '').toLowerCase().replace(/[-_\s]/g, '');
    return !/^(weixin|wechat|feishu)/.test(id);
  });
}

/**
 * 渲染平台照片墙/发布控制矩阵卡片
 * @param {HTMLElement} containerEl
 * @param {object} [options]
 * @param {Array<{ id: string, name: string }>} [options.platforms]
 * @param {boolean} [options.selectable] 是否处于可交互勾选模式（开启插件时）
 * @param {Set<string>} [options.selectedSet] 已勾选的平台 ID 集合
 * @param {(platform: any) => { text: string, cls: string, status?: string }} [options.getAuthBadge]
 * @param {(platform: any, selected: boolean, selectedSet: Set<string>, badge: any) => Promise<void> | void} [options.onToggle]
 * @param {(() => Promise<void> | void)} [options.onRefreshAuth] 刷新各平台授权状态回调
 * @param {string} [options.title]
 * @param {string} [options.desc]
 * @returns {HTMLDivElement}
 */
export function renderPlatformWall(containerEl, options = {}) {
  const platforms = getMultiPlatformWallList(options.platforms);
  const isSelectable = options.selectable === true;
  /** @type {Set<string>} */
  const selectedSet = options.selectedSet instanceof Set ? options.selectedSet : new Set();

  const card = containerEl.createDiv({
    cls: `wechat-platform-wall-card${isSelectable ? ' wechat-platform-picker is-selectable' : ''}`,
  });

  // 头部统计栏
  const header = card.createDiv({ cls: 'wechat-platform-wall-header' });
  const titleRow = header.createDiv({ cls: 'wechat-platform-wall-title-row' });
  const titleWrap = titleRow.createSpan({ cls: 'wechat-platform-wall-title-wrap' });
  const iconSpan = titleWrap.createSpan({ cls: 'apple-settings-about-section-icon' });
  attachIcon(iconSpan, 'share-2');
  titleWrap.createSpan({
    text: options.title || (isSelectable ? '支持发布平台矩阵' : `已打通全网 ${platforms.length} 个主流平台`),
    cls: 'wechat-platform-wall-title',
  });

  const actionsEl = titleRow.createDiv({ cls: 'wechat-platform-wall-actions' });
  const badgeEl = actionsEl.createSpan({
    text: isSelectable
      ? `已选择 ${selectedSet.size} 个`
      : `${platforms.length} 平台矩阵`,
    cls: 'wechat-platform-wall-badge',
  });

  if (isSelectable && typeof options.onRefreshAuth === 'function') {
    const refreshBtn = actionsEl.createEl('button', {
      cls: 'wechat-platform-wall-refresh-btn',
    });
    const updateRefreshBtnContent = (isLoading) => {
      refreshBtn.empty?.();
      const iconSpan = refreshBtn.createSpan({ cls: 'wechat-platform-wall-refresh-icon' });
      attachIcon(iconSpan, 'refresh-cw');
      refreshBtn.createSpan({ text: isLoading ? '刷新中...' : '刷新已选状态' });
    };
    updateRefreshBtnContent(false);

    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      refreshBtn.addClass?.('is-loading');
      updateRefreshBtnContent(true);
      try {
        const refreshHandler = /** @type {() => Promise<void> | void} */ (options.onRefreshAuth);
        await refreshHandler();
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.removeClass?.('is-loading');
        updateRefreshBtnContent(false);
      }
    };
  }

  const subtitle = options.desc || (isSelectable
    ? '已勾选平台会显示上次状态；本次发布仍以浏览器插件实际结果为准。'
    : '涵盖主流自媒体、技术社区与财经资讯平台。笔记写完后，通过浏览器扩展登录态一键分发至草稿箱。');
  header.createEl('p', {
    text: subtitle,
    cls: 'wechat-platform-wall-desc',
  });

  // 栅格列表容器
  const grid = card.createEl('div', {
    cls: `wechat-platform-wall-grid${isSelectable ? ' is-selectable' : ''}`,
  });

  const DEFAULT_VISIBLE_COUNT = 9;
  let isExpanded = false;
  /** @type {Array<{ el: HTMLElement, platform: { id: string }, index: number }>} */
  const tileEntries = [];

  // 只读展示态
  if (!isSelectable) {
    platforms.forEach((platform, index) => {
      const tile = grid.createEl('div', { cls: 'wechat-platform-wall-tile is-readonly' });
      tile.setAttribute('title', platform.name);
      const iconWrap = tile.createSpan({ cls: 'wechat-platform-wall-icon-wrap' });
      renderPlatformIcon(iconWrap, platform);
      tile.createSpan({ text: platform.name, cls: 'wechat-platform-wall-name' });
      tileEntries.push({ el: tile, platform, index });
    });
  } else {
    // 交互勾选态 (合并契约保持对 .wechat-platform-chip 的全兼容)
    const updateSummary = () => {
      badgeEl.setText(`已选择 ${selectedSet.size} 个`);
    };

    platforms.forEach((platform, index) => {
      const isSelected = selectedSet.has(platform.id);
      const authBadge = typeof options.getAuthBadge === 'function'
        ? options.getAuthBadge(platform)
        : { text: '', cls: '', status: '' };

      const chip = grid.createEl('label', {
        cls: `wechat-platform-wall-tile wechat-platform-chip${isSelected ? ` ${authBadge.cls} is-selected` : ''}`,
      });
      chip.setAttribute('title', isSelected && authBadge.text ? `${platform.name} · ${authBadge.text}` : platform.name);

      const checkbox = chip.createEl('input', { attr: { type: 'checkbox' } });
      checkbox.checked = isSelected;
      checkbox.value = platform.id;

      const iconWrap = chip.createSpan({ cls: 'wechat-platform-wall-icon-wrap' });
      renderPlatformIcon(iconWrap, platform);

      const chipBody = chip.createEl('span', { cls: 'wechat-platform-chip-body' });
      chipBody.createEl('span', { text: platform.name, cls: 'wechat-platform-chip-name' });
      const statusEl = chipBody.createEl('span', {
        text: authBadge.text,
        cls: `wechat-platform-chip-status ${authBadge.cls}`,
      });
      statusEl.setAttribute('title', authBadge.text);

      const setStatusVisible = (visible, currentBadge = authBadge) => {
        for (const cls of ['is-ok', 'is-error', 'is-unknown', 'is-bridge']) {
          chip.removeClass?.(cls);
          statusEl.removeClass?.(cls);
        }
        statusEl.textContent = currentBadge.text;
        if (visible) {
          if (currentBadge.cls) {
            chip.addClass?.(currentBadge.cls);
            statusEl.addClass?.(currentBadge.cls);
          }
        }
        chip.setAttribute('title', visible && currentBadge.text ? `${platform.name} · ${currentBadge.text}` : platform.name);
      };

      checkbox.onchange = async () => {
        const latestBadge = typeof options.getAuthBadge === 'function'
          ? options.getAuthBadge(platform)
          : authBadge;
        if (checkbox.checked) {
          selectedSet.add(platform.id);
          chip.addClass?.('is-selected');
          setStatusVisible(true, latestBadge);
        } else {
          selectedSet.delete(platform.id);
          chip.removeClass?.('is-selected');
          setStatusVisible(false, latestBadge);
        }
        updateSummary();
        updateVisibility();
        if (typeof options.onToggle === 'function') {
          const toggleHandler = /** @type {(platform: any, selected: boolean, selectedSet: Set<string>, badge: any) => Promise<void> | void} */ (options.onToggle);
          await toggleHandler(platform, checkbox.checked, selectedSet, latestBadge);
        }
      };

      tileEntries.push({ el: chip, platform, index });
    });
  }

  /** @type {HTMLButtonElement | null} */
  let expandBtn = null;

  const updateExpandBtnContent = () => {
    if (!expandBtn) return;
    expandBtn.empty?.();
    const label = isExpanded ? '收起' : `展开更多平台 (共 ${platforms.length} 个)`;
    expandBtn.createSpan({ text: label });
    const iconSpan = expandBtn.createSpan({ cls: 'wechat-platform-wall-expand-icon' });
    attachIcon(iconSpan, isExpanded ? 'chevron-up' : 'chevron-down');
  };

  const updateVisibility = () => {
    let hiddenCount = 0;
    tileEntries.forEach(({ el, platform, index }) => {
      const isSelected = selectedSet.has(platform.id);
      const shouldHide = !isExpanded && index >= DEFAULT_VISIBLE_COUNT && !isSelected;
      if (shouldHide) {
        el.addClass?.('is-collapsed-hidden');
        hiddenCount++;
      } else {
        el.removeClass?.('is-collapsed-hidden');
      }
    });

    if (expandBtn) {
      if (isExpanded || hiddenCount > 0) {
        updateExpandBtnContent();
        expandBtn.setCssStyles?.({ display: '' });
      } else {
        expandBtn.setCssStyles?.({ display: 'none' });
      }
    }
  };

  if (platforms.length > DEFAULT_VISIBLE_COUNT) {
    const footer = card.createDiv({ cls: 'wechat-platform-wall-footer' });
    expandBtn = footer.createEl('button', {
      cls: 'wechat-platform-wall-expand-btn',
    });
    expandBtn.onclick = () => {
      isExpanded = !isExpanded;
      updateVisibility();
    };
  }

  updateVisibility();

  return card;
}
