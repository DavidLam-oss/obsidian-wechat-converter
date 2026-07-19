/*
## 核心功能

渲染多平台发布弹窗的 UI，并维护弹窗内的平台选择状态。

## 输入

视图、弹窗容器、平台设置、连接状态和初始额度。

## 输出

保持既有 DOM 契约的弹窗 UI，以及选中平台集合和按钮状态更新函数。

## 定位

位于 views/publish-modal/，是多平台发布的 UI 适配层。

## 依赖

关键依赖：`../../services/wechatsync-settings.js`、`../../services/wechatsync-results.js`、`../connection-status-bar.js`。

## 边界

- 只负责 DOM、提示和选择状态，不调用 Bridge、不组装发布 payload。
- 通过返回值把按钮、选中平台集合和状态更新函数交给发布编排层。
- DOM class、文案和事件顺序保持现有契约不变。

## 维护规则

- 不在此处调用 Bridge、组装发布 payload 或保存设置。
- 修改 DOM class、文案或事件顺序时同步更新多平台 UI 测试。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: UI adapter consumes dynamic Obsidian modal and platform response objects */

import {
  getAvailableWechatsyncPlatforms,
  parseWechatsyncPlatformIds,
} from '../../services/wechatsync-settings.js';
import {
  getWechatsyncPlatformStatusBadge,
  normalizeWechatsyncPlatform,
  summarizeWechatsyncPlatformResponse,
} from '../../services/wechatsync-results.js';
import {
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
} from '../connection-status-bar.js';

const MODAL_SELECTED_PLATFORM_IDS = '__wechatMultiPlatformSelectedPlatformIds';

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value) {
  return isRecord(value) ? value : {};
}

function toRecordList(value) {
  return Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({ ...item }))
    : [];
}

function toText(value) {
  return typeof value === 'string' ? value : '';
}

function asModalElement(element) {
  return element;
}

function getPlatformId(platform) {
  const record = toRecord(platform);
  return toText(record.id || record.platform);
}

function toNormalizedPlatform(value) {
  const record = toRecord(value);
  const id = toText(record.id);
  const name = toText(record.name) || id;
  if (!id) return null;
  return { ...record, id, name };
}

function getModalSelectedPlatformIds(modal, defaultSelectedPlatforms) {
  if (!Array.isArray(modal[MODAL_SELECTED_PLATFORM_IDS])) {
    modal[MODAL_SELECTED_PLATFORM_IDS] = Array.from(defaultSelectedPlatforms);
  }
  return new Set(parseWechatsyncPlatformIds(modal[MODAL_SELECTED_PLATFORM_IDS]));
}

function saveModalSelectedPlatformIds(modal, selectedPlatforms) {
  modal[MODAL_SELECTED_PLATFORM_IDS] = Array.from(selectedPlatforms);
}

/**
 * @param {object} options
 * @returns {{ disabled: boolean, isBridgeReady?: boolean, syncButton?: HTMLElement, selectedPlatforms?: Set<string>, updateSyncButtonState?: () => void }}
 */
function renderMultiPlatformModalUI({
  view,
  modal,
  obsidian,
  shouldOpenModal,
  bridgeSettings,
  cachedConnectionRecord,
  publishModalCapabilities,
  initialFreeQuotaLimit,
  getQuotaHintText,
  openPublisherProPage,
  openPublisherGuidePage,
}) {
  const { Notice, setIcon } = obsidian;
  const asElement = asModalElement;

  if (!bridgeSettings.enabled) {
    const enablePanel = asElement(modal.contentEl.createDiv({ cls: 'wechat-multiplatform-enable-panel' }));
    const enableMessage = asElement(enablePanel.createDiv({ cls: 'wechat-multiplatform-enable-message' }));
    const enableIcon = asElement(enableMessage.createDiv({
      cls: 'wechat-multiplatform-enable-icon',
      attr: { 'aria-hidden': 'true' },
    }));
    if (typeof setIcon === 'function') setIcon(enableIcon, 'plug');
    const enableCopy = asElement(enableMessage.createDiv({ cls: 'wechat-multiplatform-enable-copy' }));
    enableCopy.createEl('h3', { text: '启用浏览器插件发布' });
    enableCopy.createEl('p', {
      text: '连接浏览器插件后，可将文章保存到小红书、知乎、头条等平台的草稿箱。',
    });
    const enableActions = asElement(enablePanel.createDiv({ cls: 'wechat-multiplatform-enable-actions' }));
    const settingsBtn = asElement(enableActions.createEl('button', { text: '去设置', cls: 'mod-cta' }));
    settingsBtn.onclick = () => {
      modal.close();
      if (!view.openPluginSettings()) {
        new Notice('请在设置中打开 Obsidian 发布助手并开启浏览器插件发布');
      }
    };
    const guideBtn = asElement(enableActions.createEl('button', { text: '查看安装教程' }));
    guideBtn.onclick = () => openPublisherGuidePage('install-extension');
    if (shouldOpenModal) modal.open();
    return { disabled: true };
  }

  const intro = asElement(modal.contentEl.createDiv({ cls: 'wechat-multiplatform-intro' }));
  const introText = asElement(intro.createDiv({ cls: 'wechat-multiplatform-intro-text' }));
  introText.createEl('p', { text: '选择平台后通过浏览器插件保存为草稿。' });
  introText.createEl('p', {
    text: '💡 提示：多平台发布能力依赖于浏览器插件，建议在电脑端使用。',
    cls: 'wechat-multiplatform-tip',
  });

  const isProLicensed = publishModalCapabilities.proLicensed === true;
  const quotaHint = asElement(modal.contentEl.createDiv({
    cls: `wechat-multiplatform-quota-hint ${isProLicensed ? 'is-pro' : 'is-free'}`,
  }));
  if (isProLicensed) {
    quotaHint.createEl('span', {
      text: 'Pro',
      cls: 'wechat-pro-identity-badge wechat-pro-identity-badge-quota',
    });
  } else {
    quotaHint.createEl('span', {
      text: '免费版',
      cls: 'wechat-multiplatform-quota-pill',
    });
  }
  const quotaText = quotaHint.createEl('span', {
    cls: 'wechat-multiplatform-quota-copy',
    text: getQuotaHintText(0, { proLicensed: isProLicensed, freeLimit: initialFreeQuotaLimit }),
  });
  if (!isProLicensed) {
    const quotaUpgradeBtn = asElement(quotaHint.createEl('button', {
      text: '升级 Pro',
      cls: 'wechat-multiplatform-quota-link',
    }));
    quotaUpgradeBtn.onclick = () => openPublisherProPage();
  }

  const availablePlatforms = toRecordList(getAvailableWechatsyncPlatforms(bridgeSettings));
  const defaultSelectedPlatforms = new Set(
    parseWechatsyncPlatformIds(bridgeSettings.selectedPlatforms || [])
  );
  const displayedPlatforms = availablePlatforms.filter((platform) => (
    defaultSelectedPlatforms.has(getPlatformId(platform))
  ));
  const isBridgeReady = cachedConnectionRecord.status === 'connected';
  const modalSelectedPlatforms = getModalSelectedPlatformIds(modal, defaultSelectedPlatforms);

  const description = describeWechatsyncConnectionState(cachedConnectionRecord, { variant: 'modal' });
  renderWechatsyncConnectionStatusBar(modal.contentEl, description);
  const platformListEl = asElement(modal.contentEl.createDiv({ cls: 'wechat-multiplatform-list' }));
  const selectedPlatforms = new Set();
  console.debug('[Wechatsync] render cached platform state', {
    status: cachedConnectionRecord.status,
    checkedAt: cachedConnectionRecord.checkedAt,
    message: cachedConnectionRecord.message,
    ...summarizeWechatsyncPlatformResponse(cachedConnectionRecord.platforms),
  });

  const btnRow = asElement(modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' }));
  const cancelBtn = asElement(btnRow.createEl('button', { text: '取消' }));
  const syncButton = asElement(btnRow.createEl('button', { text: '发送到浏览器插件', cls: 'mod-cta' }));
  syncButton.disabled = true;
  syncButton.addClass?.('apple-btn-disabled');
  cancelBtn.onclick = () => modal.close();

  const updateQuotaHintText = () => {
    quotaText.textContent = getQuotaHintText(selectedPlatforms.size, {
      proLicensed: isProLicensed,
      freeLimit: initialFreeQuotaLimit,
    });
  };

  const updateSyncButtonState = () => {
    syncButton.disabled = !isBridgeReady || selectedPlatforms.size === 0;
    if (syncButton.disabled) syncButton.addClass?.('apple-btn-disabled');
    else syncButton.removeClass?.('apple-btn-disabled');
    updateQuotaHintText();
  };

  const renderPlatforms = (platforms = []) => {
    platformListEl.empty();
    selectedPlatforms.clear();
    const normalizedPlatforms = platforms
      .map((platform) => normalizeWechatsyncPlatform(platform))
      .map(toNormalizedPlatform)
      .filter((platform) => platform !== null);

    if (normalizedPlatforms.length === 0) {
      const empty = asElement(platformListEl.createDiv({ cls: 'wechat-multiplatform-state' }));
      empty.createEl('div', { text: '还没有可分发的平台', cls: 'wechat-multiplatform-state-title' });
      empty.createEl('p', { text: '请先连接浏览器插件，或稍后重试读取平台清单。' });
      updateSyncButtonState();
      return;
    }

    for (const platform of normalizedPlatforms) {
      const authBadge = getWechatsyncPlatformStatusBadge(platform, { bridgeConnected: isBridgeReady });
      const isSelected = isBridgeReady && modalSelectedPlatforms.has(platform.id);
      const row = asElement(platformListEl.createDiv({
        cls: `wechat-multiplatform-platform ${isSelected ? `${authBadge.cls} is-selected` : ''} ${!isBridgeReady ? 'is-disabled' : ''}`.trim(),
      }));
      row.setAttribute('title', isSelected ? `${platform.name} · ${authBadge.text}` : platform.name);
      const checkbox = asElement(row.createEl('input'));
      checkbox.type = 'checkbox';
      checkbox.value = platform.id;
      checkbox.checked = isSelected;
      checkbox.disabled = !isBridgeReady;
      if (isSelected) selectedPlatforms.add(platform.id);
      const label = asElement(row.createEl('label', { cls: 'wechat-multiplatform-platform-label' }));
      label.createEl('span', { text: platform.name, cls: 'wechat-multiplatform-platform-name' });
      const statusEl = asElement(label.createEl('span', {
        text: authBadge.text,
        cls: `wechat-multiplatform-platform-status ${authBadge.cls}`,
      }));
      statusEl.setAttribute('title', authBadge.text);
      const setStatusVisible = (visible) => {
        for (const cls of ['is-ok', 'is-error', 'is-unknown', 'is-bridge']) {
          row.removeClass?.(cls);
          row.classList?.remove(cls);
          statusEl.removeClass?.(cls);
          statusEl.classList?.remove(cls);
        }
        statusEl.textContent = authBadge.text;
        if (visible) {
          row.addClass?.(authBadge.cls);
          row.classList?.add(authBadge.cls);
          statusEl.addClass?.(authBadge.cls);
          statusEl.classList?.add(authBadge.cls);
        }
        row.setAttribute('title', visible ? `${platform.name} · ${authBadge.text}` : platform.name);
      };
      label.onclick = () => {
        if (!checkbox.disabled) checkbox.click();
      };
      checkbox.onchange = () => {
        if (checkbox.checked) {
          selectedPlatforms.add(platform.id);
          row.addClass?.('is-selected');
          row.classList?.add('is-selected');
          setStatusVisible(true);
          if (authBadge.status === 'login_required') {
            new Notice(`${platform.name} 上次状态为需登录。请先在浏览器插件打开平台登录页，或继续尝试由插件返回实际结果。`, 8000);
          }
          if (authBadge.status === 'unknown') {
            new Notice(`${platform.name} 此前未检测，发布结果以浏览器插件实际执行为准。`, 6000);
          }
        } else {
          selectedPlatforms.delete(platform.id);
          row.removeClass?.('is-selected');
          row.classList?.remove('is-selected');
          setStatusVisible(false);
        }
        saveModalSelectedPlatformIds(modal, selectedPlatforms);
        updateSyncButtonState();
      };
    }
    updateSyncButtonState();
  };

  renderPlatforms(displayedPlatforms);
  return {
    disabled: false,
    isBridgeReady,
    syncButton,
    selectedPlatforms,
    updateSyncButtonState,
  };
}

export { renderMultiPlatformModalUI };
