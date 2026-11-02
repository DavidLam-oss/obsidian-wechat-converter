/*
## 核心功能

实现侧边栏转换器面板内的轻量限时特惠横幅 (Promo Banner)。

## 输入

接收容器元素、插件实例与参考插入节点。

## 输出

输出 `mountPromoBanner`，在满足活动条件时静默挂载轻量可关闭横幅。

## 定位

位于 views/converter/，属于视图展示层。

## 依赖

关键依赖：`../apple-style-view-shared.js`、`../../services/announcement-service.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的文件夹 README 是否仍准确。
- 用户点击关闭后永久不再提示该活动，且支持平滑移除 DOM。
*/

import { attachIcon, Notice } from '../apple-style-view-shared.js';
import {
  fetchActiveAnnouncement,
  isAnnouncementEligible,
  dismissAnnouncement,
} from '../../services/announcement-service.js';

/**
 * @typedef {import('../../services/announcement-service.js').AnnouncementPayload} AnnouncementPayload
 */

/**
 * 挂载轻量特惠横幅（仅在符合条件时异步挂载）
 * @param {HTMLElement} container
 * @param {Record<string, unknown>} plugin
 * @param {HTMLElement} [beforeEl]
 * @returns {Promise<HTMLElement | null>}
 */
export async function mountPromoBanner(container, plugin, beforeEl) {
  if (!container || !plugin) return null;

  try {
    const pluginSettings = /** @type {Record<string, unknown> | undefined} */ (plugin.settings);
    const announcement = await fetchActiveAnnouncement();
    if (!announcement || !isAnnouncementEligible(announcement, pluginSettings)) {
      return null;
    }

    // 检查是否已经挂载过
    const existing = container.querySelector('.apple-converter-promo-banner');
    if (existing) return /** @type {HTMLElement} */ (existing);

    /** @type {HTMLElement} */
    const banner = container.createDiv({ cls: 'apple-converter-promo-banner' });
    if (beforeEl && beforeEl.parentElement === container) {
      container.insertBefore(banner, beforeEl);
    }

    // 1. 左侧图标与标签
    const leftWrap = banner.createDiv({ cls: 'apple-converter-promo-left' });
    const iconEl = leftWrap.createSpan({ cls: 'apple-converter-promo-icon' });
    attachIcon(iconEl, 'sparkles');

    leftWrap.createSpan({
      cls: 'apple-converter-promo-badge',
      text: announcement.tag || '🎉 11.11 特惠',
    });

    // 2. 中间文案
    const textEl = banner.createDiv({ cls: 'apple-converter-promo-text' });
    const shortText = announcement.shortText || '多平台发布 Pro 终身买断仅 ¥99（支持在线直接开通）';
    textEl.createSpan({ text: shortText });

    // 3. 右侧操作区：[去开通] 按钮 + [✕] 关闭按钮
    const rightWrap = banner.createDiv({ cls: 'apple-converter-promo-right' });
    const actionBtn = rightWrap.createEl('button', {
      cls: 'apple-converter-promo-btn mod-cta',
      text: announcement.actionText || '去开通',
    });
    actionBtn.onclick = (e) => {
      e.stopPropagation();
      const url = announcement.actionUrl || 'https://xiaoweibox.top/obsidian-publisher/pro?from=obsidian-plugin&promo=double11';
      const openFn = plugin.openExternalUrl;
      if (typeof openFn === 'function') {
        /** @type {(u: string) => void} */ (openFn).call(plugin, url);
      } else {
        window.open(url, '_blank');
      }
    };

    const closeBtn = rightWrap.createEl('button', {
      cls: 'apple-converter-promo-close',
      attr: { 'aria-label': '不再提示' },
    });
    attachIcon(closeBtn, 'x');
    closeBtn.onclick = async (e) => {
      e.stopPropagation();
      banner.addClass('is-hiding');
      window.setTimeout(() => {
        banner.remove();
      }, 200);
      await dismissAnnouncement(plugin, announcement.id);
      new Notice('特惠通知已关闭，本期活动将不再提示');
    };

    return banner;
  } catch (e) {
    console.debug('[PromoBanner] 挂载特惠横幅跳过', e);
    return null;
  }
}
