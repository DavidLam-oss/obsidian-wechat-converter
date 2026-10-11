/*
## 核心功能

实现插件设置页中的 feishu tab 配置界面能力。

## 输入

接收插件设置、SettingTab 生命周期、用户表单输入和账号/平台配置状态。

## 输出

输出 `renderFeishuSettingsTab`，用于渲染设置项、保存配置或打开辅助 modal。

## 定位

位于 views/settings/，负责设置 UI 层；设置归一化交给 services/plugin-settings.js。

## 依赖

关键依赖：`../../services/dom-utils.js`、`../../services/feishu-api.js`、`../../services/feishu-settings.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/settings 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS file handles dynamic API responses without strict typescript type annotations */
// views/settings/feishu-tab.js
//
// Renders the「飞书」settings tab in the AppleStyleSettingTab.
// Extracted to keep input.js clean and maintain separation of concerns.
// Uses Obsidian APIs (Setting, Notice, etc.).

import { getActiveWindowValue } from '../../services/dom-utils.js';
import { FeishuApiClient } from '../../services/feishu-api.js';
import { renderSectionHeader } from './platform-wall.js';
import {
  FEISHU_FREE_MONTHLY_API_LIMIT,
  incrementFeishuApiUsage,
  normalizeFeishuSyncSettings,
  resetFeishuApiUsage,
} from '../../services/feishu-settings.js';

const FEISHU_SETUP_GUIDE_URL = 'https://xiaoweibox.top/chats/feishu-sync';

/**
 * @param {any} tab
 * @param {string} url
 */
function openExternalUrl(tab, url) {
  if (typeof tab?.plugin?.openExternalUrl === 'function') {
    return tab.plugin.openExternalUrl(url);
  }
  if (typeof tab?.plugin?.activeView?.openExternalUrl === 'function') {
    return tab.plugin.activeView.openExternalUrl(url);
  }
  const win = getActiveWindowValue('window') || (typeof window !== 'undefined' ? window : null);
  if (win && typeof win.open === 'function') {
    win.open(url, '_blank', 'noopener');
  }
}

/**
 * @param {{ descEl?: HTMLElement, setDesc?: (description: string) => unknown }} setting
 * @param {Document | null} activeDocument
 * @param {string} text
 * @param {string} linkText
 * @param {string} href
 * @param {() => void} openLink
 * @returns {void}
 */
function setMutedGuideDescription(setting, activeDocument, text, linkText, href, openLink) {
  const fallbackText = `${text} ${linkText}`;
  const description = setting?.descEl;
  if (!activeDocument || !description) {
    if (typeof setting?.setDesc === 'function') {
      setting.setDesc(fallbackText);
    }
    return;
  }

  description.replaceChildren(activeDocument.createTextNode(`${text} `));
  const link = activeDocument.createElement('a');
  link.textContent = linkText;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'apple-settings-guide-link';
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openLink();
  });
  description.append(link);
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatFeishuUsageNumber(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('zh-CN');
}

/**
 * @param {number} count
 * @param {number} limit
 * @returns {string}
 */
function formatFeishuUsagePercent(count, limit) {
  if (!limit) return '0%';
  return `${Math.min(100, Math.round((count / limit) * 100))}%`;
}

/**
 * @param {HTMLDivElement} containerEl
 * @param {any} tab
 * @param {object} plugin
 * @param {ReturnType<typeof normalizeFeishuSyncSettings>} settings
 * @param {Record<string, unknown>} obsidian
 * @param {any} Notice
 * @returns {void}
 */
function renderFeishuUsageStats(containerEl, tab, plugin, settings, obsidian, Notice) {
  const usage = settings.apiUsage;
  const used = Math.max(0, Number(usage.count) || 0);
  const limit = FEISHU_FREE_MONTHLY_API_LIMIT;
  const remaining = Math.max(0, limit - used);
  const percent = Math.min(100, limit ? (used / limit) * 100 : 0);

  const card = containerEl.createDiv({ cls: 'wechat-feishu-usage-card' });
  card.setCssStyles({
    margin: '18px 0 22px',
    padding: '18px 20px',
    border: '1px solid var(--background-modifier-border)',
    borderRadius: '12px',
    background: 'var(--background-secondary)',
  });

  const header = card.createDiv({ cls: 'wechat-feishu-usage-header' });
  header.setCssStyles({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  });

  const copy = header.createDiv();
  const sharedCount = Array.isArray(settings.uploadHistory) ? settings.uploadHistory.length : 0;
  const shareTitle = copy.createEl('div', { text: '分享文档数', cls: 'setting-item-name' });
  shareTitle.setCssStyles({ marginTop: '2px' });
  copy.createEl('div', {
    text: `您已成功分享 ${formatFeishuUsageNumber(sharedCount)} 个文档。`,
    cls: 'setting-item-description',
  });
  const title = copy.createEl('div', { text: '本月 API 调用次数', cls: 'setting-item-name' });
  title.setCssStyles({ marginTop: '16px' });
  copy.createEl('div', {
    text: `插件估算已调用 ${formatFeishuUsageNumber(used)} / ${formatFeishuUsageNumber(limit)} 次，剩余约 ${formatFeishuUsageNumber(remaining)} 次。`,
    cls: 'setting-item-description',
  });

  const resetBtn = header.createEl('button', { text: '重置计数' });
  resetBtn.addClass('mod-warning');
  resetBtn.onclick = async () => {
    resetFeishuApiUsage(settings);
    await plugin.saveSettings();
    if (Notice) new Notice('飞书 API 调用计数已重置');
    renderFeishuSettingsTab(tab, containerEl, { obsidianApi: obsidian });
  };

  const progressTrack = card.createDiv({ cls: 'wechat-feishu-usage-progress' });
  progressTrack.setCssStyles({
    height: '8px',
    marginTop: '14px',
    borderRadius: '999px',
    overflow: 'hidden',
    background: 'var(--background-modifier-border)',
  });
  const progressBar = progressTrack.createDiv();
  progressBar.setCssStyles({
    width: formatFeishuUsagePercent(used, limit),
    height: '100%',
    borderRadius: '999px',
    background: percent >= 90 ? 'var(--text-error)' : 'var(--interactive-accent)',
  });

  card.createEl('p', {
    text: `统计周期：${usage.month}。该数据仅统计本插件发起的飞书 OpenAPI 请求，实际额度请以飞书开放平台后台为准。`,
    cls: 'setting-item-description',
  }).setCssStyles({ marginTop: '10px' });
}

/**
 * Renders the Feishu Sync settings inside the settings tab.
 * @param {any} tab AppleStyleSettingTab instance
 * @param {HTMLDivElement} containerEl settings tab sub-container
 * @param {object} [options={}] Injected options
 */
function renderFeishuSettingsTab(tab, containerEl, options = {}) {
  const obsidian = options.obsidianApi || tab.plugin.obsidianApi || getActiveWindowValue('obsidian') || {};
  const Setting = obsidian.Setting;
  const Notice = obsidian.Notice;

  const { plugin } = tab;
  const rawFeishuSettings = plugin.settings.feishuSync || {};
  const settings = normalizeFeishuSyncSettings(rawFeishuSettings);
  if (rawFeishuSettings?.apiUsage && typeof rawFeishuSettings.apiUsage === 'object') {
    settings.apiUsage = {
      ...settings.apiUsage,
      ...rawFeishuSettings.apiUsage,
    };
  }
  plugin.settings.feishuSync = settings;

  containerEl.empty();

  if (typeof tab.renderSettingsTabIntro === 'function') {
    tab.renderSettingsTabIntro(
      containerEl,
      '一键将当前笔记转换为原生飞书云文档（docx），保留标题、表格与图片。'
    );
  }

  // 1. Enable Toggle
  renderSectionHeader(containerEl, 'cloud', '飞书同步服务');
  const enableSetting = new Setting(containerEl)
    .setName('启用飞书同步');
  setMutedGuideDescription(
    enableSetting,
    containerEl.ownerDocument || getActiveWindowValue('document') || null,
    '开启后，同步弹窗中将提供「飞书」选项，支持发布至指定的飞书云盘文件夹。',
    '查看详细图文指引 →',
    FEISHU_SETUP_GUIDE_URL,
    () => {
      openExternalUrl(tab, FEISHU_SETUP_GUIDE_URL);
    }
  );
  enableSetting.addToggle((toggle) => toggle
    .setValue(settings.enabled)
    .onChange(async (value) => {
      settings.enabled = value;
      await plugin.saveSettings();
      tab.display(); // re-render setting tab
    })
  );

  if (!settings.enabled) return;

  // 2. Usage Stats
  renderSectionHeader(containerEl, 'bar-chart-2', '数据统计与配额');
  renderFeishuUsageStats(containerEl, tab, plugin, settings, obsidian, Notice);

  // 3. Credentials & Folder Config
  renderSectionHeader(containerEl, 'key', '自建应用凭证与配置');

  // App ID
  new Setting(containerEl)
    .setName('App ID')
    .setDesc('飞书开放平台（open.feishu.cn）企业自建应用的 App ID。')
    .addText((text) => text
      .setPlaceholder('cli_a248xxxxxxxxxxxx')
      .setValue(settings.appId)
      .onChange(async (value) => {
        settings.appId = value.trim();
        await plugin.saveSettings();
      })
    );

  // App Secret
  new Setting(containerEl)
    .setName('App Secret')
    .setDesc('企业自建应用的 App Secret 凭证。')
    .addText((text) => {
      text.inputEl.type = 'password';
      text
        .setPlaceholder('粘贴 App Secret...')
        .setValue(settings.appSecret)
        .onChange(async (value) => {
          const nextSecret = value.trim();
          if (!nextSecret && settings.appSecret) {
            await plugin.clearCredential?.('feishu', 'primary', 'appSecret');
          } else {
            settings.appSecret = nextSecret;
            await plugin.saveSettings();
          }
        });
    });

  // Folder Token
  new Setting(containerEl)
    .setName('目标文件夹 Token')
    .setDesc('飞书云盘文件夹链接中的 Token（例如 folder/fldcnXXXXXXXXX）。')
    .addText((text) => text
      .setPlaceholder('fldcnxxxxxxxxxxxxxxxxxx')
      .setValue(settings.folderToken)
      .onChange(async (value) => {
        settings.folderToken = value.trim();
        await plugin.saveSettings();
      })
    );

  // User ID
  new Setting(containerEl)
    .setName('文档所有者 ID (User ID)')
    .setDesc('同步成功后将文档所有权自动转移给您本人（可选，建议 user_id 格式）。')
    .addText((text) => text
      .setPlaceholder('例如: abc1234')
      .setValue(settings.userId)
      .onChange(async (value) => {
        settings.userId = value.trim();
        await plugin.saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('测试连接')
    .setDesc('验证自建应用授权与目标文件夹访问权限。')
    .addButton((btn) => btn
      .setButtonText('测试连接')
      .onClick(async () => {
        if (!settings.appId || !settings.appSecret) {
          new Notice('请先填写 App ID 和 App Secret');
          return;
        }
        if (!settings.folderToken) {
          new Notice('请先填写同步目标文件夹 Token');
          return;
        }

        const notice = new Notice('正在测试飞书连接...', 0);
        try {
          let apiUsageChanged = false;
          const client = new FeishuApiClient(settings.appId, settings.appSecret, obsidian.requestUrl, {
            onApiCall: () => {
              incrementFeishuApiUsage(settings);
              apiUsageChanged = true;
            },
          });
          
          await client.getAccessToken();
          await client.listFolderItems(settings.folderToken);
          
          notice.hide();
          if (apiUsageChanged) await plugin.saveSettings();
          new Notice('飞书连接成功，目标文件夹访问正常');
        } catch (err) {
          notice.hide();
          await plugin.saveSettings();
          console.error('[飞书连接测试失败]:', err);
          new Notice(`飞书连接测试失败: ${err.message || String(err)}`, 7000);
        }
      })
    );
}

export {
  FEISHU_SETUP_GUIDE_URL,
  renderFeishuSettingsTab,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: resume typed linting after Feishu settings Obsidian UI boundary */
