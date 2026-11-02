/*
## 核心功能

渲染多平台设置页的浏览器配套引导卡片 (Onboarding Guide) 与双十一特惠卡片。

## 输入

接收容器元素、授权状态、回调和 Tab 实例。

## 输出

输出 `renderMultiPlatformOnboardingGuide`。

## 定位

位于 views/settings/，负责引导卡片与特惠交互层；从 multi-platform-tab.js 拆出以控制单文件行数。

## 依赖

关键依赖：`../../services/dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 保持职责边界清晰，行数不超过 800 行。
*/

import { getActiveWindowValue } from '../../services/dom-utils.js';

const OBSIDIAN_PUBLISHER_PRO_URL = 'https://xiaoweibox.top/obsidian-publisher/pro/?from=obsidian-plugin';
const OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL = 'https://xiaoweibox.top/obsidian-publisher/guide/?from=obsidian-plugin#install-extension';
const OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL = 'https://xiaoweibox.top/obsidian-publisher/guide/?from=obsidian-plugin#bridge';
const OBSIDIAN_PUBLISHER_PRO_D11_URL = 'https://xiaoweibox.top/obsidian-publisher/pro/?from=obsidian-plugin&promo=double11';

/**
 * @typedef {{ observedAt?: number | null }} ProLicenseLike
 * @typedef {{ cls?: string, text?: string, attr?: Record<string, string> }} ElementCreateOptions
 * @typedef {HTMLElement & {
 *   createDiv: (options?: ElementCreateOptions) => TargetElement,
 *   createSpan: (options?: ElementCreateOptions) => TargetElement,
 *   createEl: (tag: string, options?: ElementCreateOptions) => TargetElement,
 * }} TargetElement
 * @typedef {{
 *   isProLicensed: boolean,
 *   isProCached: boolean,
 *   isPublishingEnabled: boolean,
 *   hasEverConnected: boolean,
 *   proLicense: ProLicenseLike,
 *   formatProLicenseObservedAgo: (ts: number) => string,
 *   openExternalUrl: (tab: unknown, url: string) => void,
 *   Notice: new (msg: string) => unknown,
 * }} OnboardingOptions
 */

/**
 * @param {unknown} tab
 * @param {TargetElement} containerEl
 * @param {OnboardingOptions} options
 */
export function renderMultiPlatformOnboardingGuide(tab, containerEl, options) {
  const {
    isProLicensed,
    isProCached,
    isPublishingEnabled,
    hasEverConnected,
    proLicense,
    formatProLicenseObservedAgo,
    openExternalUrl,
    Notice,
  } = options;

  // 1. 未开通用户优先展示独立的 11.11 双十一专属特惠卡片（非嵌套，视觉独立通透）
  if (!isProLicensed) {
    const promoCard = containerEl.createDiv({ cls: 'wechat-multiplatform-promo-card' });

    // 1.1 顶部标签行
    const promoHeader = promoCard.createDiv({ cls: 'wechat-multiplatform-promo-header' });
    promoHeader.createSpan({
      cls: 'wechat-multiplatform-promo-badge',
      text: '🎉 11.11 限时特惠',
    });
    promoHeader.createSpan({
      cls: 'wechat-multiplatform-promo-discount',
      text: '原价 ¥299 · 限时立减 ¥200',
    });

    // 1.2 核心卖点与价格行
    const promoBody = promoCard.createDiv({ cls: 'wechat-multiplatform-promo-body' });
    const titleRow = promoBody.createDiv({ cls: 'wechat-multiplatform-promo-title-row' });
    titleRow.createSpan({
      cls: 'wechat-multiplatform-promo-title',
      text: '多平台发布 Pro 终身买断',
    });
    const priceGroup = titleRow.createSpan({ cls: 'wechat-multiplatform-promo-price-group' });
    priceGroup.createEl('strong', {
      cls: 'wechat-multiplatform-promo-price-current',
      text: '¥99',
    });
    priceGroup.createEl('span', {
      cls: 'wechat-multiplatform-promo-price-original',
      text: '¥299',
    });

    promoBody.createDiv({
      cls: 'wechat-multiplatform-promo-desc',
      text: '支持微信/银行卡直接在线支付，结算输入优惠码即可立减 ¥200。一次购买，终身授权。',
    });

    // 1.3 操作与优惠码复制行
    const promoFooter = promoCard.createDiv({ cls: 'wechat-multiplatform-promo-footer' });
    const couponWrap = promoFooter.createDiv({ cls: 'wechat-multiplatform-promo-coupon-wrap' });
    couponWrap.createSpan({
      cls: 'wechat-multiplatform-promo-coupon-label',
      text: '优惠码',
    });
    const codeBtn = couponWrap.createEl('button', {
      cls: 'wechat-multiplatform-coupon-btn',
      attr: { 'aria-label': '点击一键复制优惠码' },
    });
    codeBtn.createSpan({ text: 'OBPUB11' });
    codeBtn.createSpan({
      cls: 'wechat-multiplatform-coupon-copy-hint',
      text: ' 📋 点击复制',
    });

    codeBtn.onclick = (e) => {
      e.stopPropagation();
      const nav = /** @type {{ clipboard?: { writeText?: (text: string) => Promise<void> } } | undefined} */ (
        getActiveWindowValue('navigator')
      );
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        nav.clipboard.writeText('OBPUB11').catch(() => {});
      }
      new Notice('优惠码 OBPUB11 已复制，结算时粘贴即可');
    };

    const promoCtaBtn = promoFooter.createEl('button', {
      cls: 'wechat-multiplatform-pro-cta mod-cta',
      text: '🚀 立即特惠开通 (¥99) →',
    });
    promoCtaBtn.onclick = () => openExternalUrl(tab, OBSIDIAN_PUBLISHER_PRO_D11_URL);
  }

  // 2. 浏览器配套安装与配置引导卡片（纯净、专业，不嵌套促销框）
  const guide = containerEl.createDiv({
    cls: `wechat-multiplatform-onboarding${isProLicensed ? ' is-pro' : ''}`,
  });
  const cachedLastSeenText = isProCached && proLicense?.observedAt
    ? formatProLicenseObservedAgo(proLicense.observedAt)
    : '';

  guide.createEl('div', {
    cls: 'wechat-multiplatform-onboarding-title',
    text: isProLicensed
      ? (isProCached
        ? `Pro 身份已保留（上次识别：${cachedLastSeenText}）`
        : (isPublishingEnabled ? 'Pro 已激活' : '上次连接时识别为 Pro'))
      : '安装浏览器插件并完成配置',
  });

  guide.createEl('p', {
    text: isProLicensed
      ? (isProCached
        ? '浏览器插件当前未连接，Obsidian 正在使用上次识别到的 Pro 身份。重新连接浏览器即可刷新状态。'
        : (isPublishingEnabled
          ? '当前浏览器插件授权已同步到 Obsidian，发布到其他平台时不再受免费版每日平台数量限制。'
          : '浏览器插件发布当前已关闭。重新启用并连接后，Obsidian 会再次确认授权状态。'))
      : (hasEverConnected
        ? '免费版每天 3 个平台额度。连接浏览器插件即可开启多平台草稿同步。'
        : '免费版每天 3 个平台额度。已购买 Pro？连接一次浏览器插件即可解锁离线保留，之后浏览器未启动也会保留 Pro 身份。'),
  });

  if (isProLicensed) {
    guide.createEl('span', {
      text: 'Pro',
      cls: 'wechat-pro-identity-badge wechat-pro-identity-badge-panel',
    });
  }

  const guideActions = guide.createDiv({ cls: 'wechat-multiplatform-onboarding-actions' });
  const installGuideBtn = guideActions.createEl('button', { text: '安装浏览器插件', cls: 'mod-cta' });
  installGuideBtn.onclick = () => openExternalUrl(tab, OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL);
  const bridgeGuideBtn = guideActions.createEl('button', { text: '查看配置步骤' });
  bridgeGuideBtn.onclick = () => openExternalUrl(tab, OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL);

  if (isProLicensed) {
    const proGuideBtn = guideActions.createEl('button', { text: '查看 Pro 权益' });
    proGuideBtn.onclick = () => openExternalUrl(tab, OBSIDIAN_PUBLISHER_PRO_URL);
  }
}
