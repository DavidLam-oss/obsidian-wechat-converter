/*
## 核心功能

实现插件设置页中的“关于”配置界面能力，包含插件名片、支持与赞助、赞助鸣谢榜与作者信息。

## 输入

接收 AppleStyleSettingTab 实例、DOM 容器元素与插件上下文。

## 输出

输出 `renderAboutSettingsTab`，用于在关于 Tab 中渲染图文界面与赞助者鸣谢卡片。

## 定位

位于 views/settings/，负责设置 UI 层。

## 依赖

关键依赖：`../../services/sponsors-data.js`、`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 遵循无 emoji 规范，统一采用 Obsidian 原生 Lucide 图标。
- 版本号动态读取 manifest.json，严禁硬编码。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- reason: JS file handles dynamic Obsidian app and plugin manifest structures without strict typescript annotations */

import {
  GITHUB_REPOSITORY_URL,
  OBSIDIAN_PUBLISHER_GUIDE_URL,
  getObsidianSetIcon,
} from '../apple-style-view-shared.js';
import { SPONSORS } from '../../services/sponsors-data.js';

const DOCS_URL = 'https://github.com/DavidLam-oss/obsidian-wechat-converter/blob/main/README.md';
const ISSUES_URL = 'https://github.com/DavidLam-oss/obsidian-wechat-converter/issues';

/**
 * 解析插件内部图片的本地安全 URL，若失败则降级至 GitHub Raw URL
 * @param {AppLike} app
 * @param {PluginManifestLike | undefined} manifest
 * @param {string} relativePath
 * @returns {string}
 */
function resolvePluginAssetUrl(app, manifest, relativePath) {
  const fallbackUrl = `https://raw.githubusercontent.com/DavidLam-oss/obsidian-wechat-converter/main/${relativePath}`;
  try {
    const configDir = app.vault?.configDir;
    const pluginDir = /** @type {string | undefined} */ (manifest?.dir)
      || (typeof configDir === 'string' && configDir
        ? `${configDir}/plugins/${manifest?.id || 'obsidian-wechat-converter'}`
        : undefined);
    if (!pluginDir) return fallbackUrl;
    const fullPath = `${pluginDir}/${relativePath}`.replace(/\\/g, '/');
    const adapter = /** @type {{ getResourcePath?: (path: string) => string } | undefined} */ (app.vault?.adapter);
    if (typeof adapter?.getResourcePath === 'function') {
      return adapter.getResourcePath(fullPath);
    }
  } catch {
    // 降级使用网络资源
  }
  return fallbackUrl;
}

/**
 * 安全打开外部链接
 * @param {AppleStylePluginLike | undefined} plugin
 * @param {string} url
 */
function openUrl(plugin, url) {
  if (typeof plugin?.openExternalUrl === 'function') {
    plugin.openExternalUrl(url);
    return;
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank');
  }
}

/**
 * 辅助添加 Lucide 图标
 * @param {HTMLElement} element
 * @param {string} iconName
 */
function attachIcon(element, iconName) {
  const setIcon = getObsidianSetIcon();
  if (typeof setIcon === 'function') {
    setIcon(element, iconName);
  }
}

/**
 * 渲染“关于”设置页
 * @param {AppleStyleSettingTabContract} tabInstance
 * @param {HTMLElement} containerEl
 */
export function renderAboutSettingsTab(tabInstance, containerEl) {
  containerEl.empty();

  const manifest = /** @type {PluginManifestLike | undefined} */ (tabInstance.plugin?.manifest);
  const version = manifest?.version || '2.10.6';
  const app = /** @type {AppLike} */ (tabInstance.app);

  // 1. 插件名片区 (About Header - 极简原生排版，层级分明，不抢视觉焦点)
  const headerEl = containerEl.createDiv({ cls: 'apple-settings-about-header' });

  const titleRow = headerEl.createDiv({ cls: 'apple-settings-about-title-row' });
  titleRow.createEl('span', {
    text: 'Obsidian 发布助手',
    cls: 'apple-settings-about-title',
  });
  titleRow.createSpan({
    text: `v${version}`,
    cls: 'apple-settings-about-version-badge',
  });

  headerEl.createEl('div', {
    text: '让技术写作回归优雅与纯粹 · 连接 Obsidian 与全网发布 (Wechat Converter)',
    cls: 'apple-settings-about-tagline',
  });

  const linksContainer = headerEl.createDiv({ cls: 'apple-settings-about-links' });

  const linkItems = [
    { label: 'GitHub 仓库', icon: 'star', url: GITHUB_REPOSITORY_URL },
    { label: '使用文档', icon: 'book-open', url: DOCS_URL },
    { label: '问题反馈', icon: 'message-square', url: ISSUES_URL },
    { label: '浏览器扩展', icon: 'external-link', url: OBSIDIAN_PUBLISHER_GUIDE_URL },
  ];

  linkItems.forEach(({ label, icon, url }, idx) => {
    if (idx > 0) {
      linksContainer.createSpan({ text: '·', cls: 'apple-settings-about-link-sep' });
    }
    const link = linksContainer.createEl('a', { cls: 'apple-settings-about-link' });
    const iconSpan = link.createSpan({ cls: 'apple-settings-about-link-icon' });
    attachIcon(iconSpan, icon);
    link.createSpan({ text: label });
    link.onclick = (e) => {
      e.preventDefault();
      openUrl(tabInstance.plugin, url);
    };
  });

  // 2. 支持与赞助 (Support & Sponsor)
  const sponsorSection = containerEl.createDiv({ cls: 'apple-settings-about-section' });

  const sponsorHeader = sponsorSection.createDiv({ cls: 'apple-settings-about-section-header' });
  const sponsorIcon = sponsorHeader.createSpan({ cls: 'apple-settings-about-section-icon' });
  attachIcon(sponsorIcon, 'heart');
  sponsorHeader.createSpan({ text: '支持与赞助' });

  sponsorSection.createEl('p', {
    text: '本项目始终保持免费与开源。如果它在您的日常写作与多平台发布中节省了宝贵时间，欢迎请作者喝杯咖啡，支持项目持续维护与体验打磨！',
    cls: 'apple-settings-about-section-desc',
  });

  const planList = sponsorSection.createEl('ul', { cls: 'apple-settings-about-list' });
  planList.createEl('li', { text: '持续适配微信公众号编辑器与官方草稿箱 API 规则变动' });
  planList.createEl('li', { text: '优化支持飞书云文档、小红书、知乎、B 站、今日头条等多平台的分发体验' });
  planList.createEl('li', { text: '打磨代码块高亮、LaTeX 数学公式与 Mermaid 图表的高清渲染细节' });

  // 二维码并排卡片
  const cardsContainer = sponsorSection.createDiv({ cls: 'apple-settings-sponsor-cards' });

  // 微信赞赏卡片
  const wechatCard = cardsContainer.createDiv({ cls: 'apple-settings-sponsor-card' });
  const wechatQrWrap = wechatCard.createDiv({ cls: 'apple-settings-sponsor-qr-wrapper' });
  const wechatImg = wechatQrWrap.createEl('img', { cls: 'apple-settings-sponsor-qr-img' });
  wechatImg.src = resolvePluginAssetUrl(app, manifest, 'images/support-wechat.png');
  wechatImg.alt = '微信赞赏码';
  wechatCard.createDiv({ text: '微信赞赏', cls: 'apple-settings-sponsor-label' });

  // 支付宝收款卡片
  const alipayCard = cardsContainer.createDiv({ cls: 'apple-settings-sponsor-card' });
  const alipayQrWrap = alipayCard.createDiv({ cls: 'apple-settings-sponsor-qr-wrapper' });
  const alipayImg = alipayQrWrap.createEl('img', { cls: 'apple-settings-sponsor-qr-img' });
  alipayImg.src = resolvePluginAssetUrl(app, manifest, 'images/support-alipay.jpg');
  alipayImg.alt = '支付宝收款码';
  alipayCard.createDiv({ text: '支付宝', cls: 'apple-settings-sponsor-label' });

  // 提示信息
  const hintEl = sponsorSection.createDiv({ cls: 'apple-settings-sponsor-hint' });
  hintEl.createSpan({
    text: '提示：扫码赞助时请在转账备注中填写您的【昵称】与【留言寄语】。作者将在下一版本更新时，将您的名字永久收录至下方的赞助鸣谢榜！',
  });

  // 3. 赞助鸣谢榜 (Hall of Fame)
  const fameSection = containerEl.createDiv({ cls: 'apple-settings-about-section' });

  const fameHeader = fameSection.createDiv({ cls: 'apple-settings-about-section-header' });
  const fameIcon = fameHeader.createSpan({ cls: 'apple-settings-about-section-icon' });
  attachIcon(fameIcon, 'award');
  fameHeader.createSpan({ text: '赞助鸣谢榜' });

  fameSection.createEl('p', {
    text: '衷心感谢以下创作者对本项目的支持与鼓励（按赞助时间排列）：',
    cls: 'apple-settings-about-section-desc',
  });

  const wallEl = fameSection.createDiv({ cls: 'apple-settings-fame-wall' });

  SPONSORS.forEach((sponsor) => {
    const item = wallEl.createDiv({ cls: 'apple-settings-fame-item' });

    const left = item.createDiv({ cls: 'apple-settings-fame-item-left' });
    const userIcon = left.createSpan({ cls: 'apple-settings-fame-item-icon' });
    attachIcon(userIcon, 'user-check');

    const content = left.createDiv({ cls: 'apple-settings-fame-item-content' });
    const nameRow = content.createDiv({ cls: 'apple-settings-fame-item-header' });
    nameRow.createSpan({ text: sponsor.name, cls: 'apple-settings-fame-item-name' });
    if (sponsor.tag) {
      const tagEl = nameRow.createSpan({ cls: 'apple-settings-fame-item-tag' });
      const tagIcon = tagEl.createSpan({ cls: 'apple-settings-fame-item-tag-icon' });
      attachIcon(tagIcon, 'award');
      tagEl.createSpan({ text: sponsor.tag });
    }

    if (sponsor.message) {
      content.createSpan({ text: `“${sponsor.message}”`, cls: 'apple-settings-fame-item-message' });
    }

    item.createSpan({ text: sponsor.date, cls: 'apple-settings-fame-item-date' });
  });

  // 4. 关于作者
  const authorSection = containerEl.createDiv({ cls: 'apple-settings-about-section' });

  const authorHeader = authorSection.createDiv({ cls: 'apple-settings-about-section-header' });
  const authorIcon = authorHeader.createSpan({ cls: 'apple-settings-about-section-icon' });
  attachIcon(authorIcon, 'user');
  authorHeader.createSpan({ text: '关于作者' });

  const authorCard = authorSection.createDiv({ cls: 'apple-settings-author-card' });
  authorCard.createEl('p', {
    text: '作者：林小卫很行 (DavidLam)。一名热衷于提升生产力工具体验的开发者与创作者。相信工具的力量，让写作更优雅，让创作更自由。',
  });
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- reason: resume typed linting after the dynamic Obsidian settings UI boundary */
