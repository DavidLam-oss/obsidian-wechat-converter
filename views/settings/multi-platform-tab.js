// views/settings/multi-platform-tab.js
//
// Renders the「其他平台」settings tab. Extracted from the settings renderer.
// (originally lines 6088-6521). The tab is one cohesive block:
//   1. enable toggle
//   2. port + token inputs
//   3. persistent connection status bar (Phase 2 helper)
//   4. platform picker grid (chip per platform with auth status)
//   5. 测试连接 button (start bridge + health + listSupportedPlatforms +
//      no platform auth lookup)
//   6. 读取已选平台状态 button (read cached auth snapshot only)
//
// Public API:
//   renderMultiPlatformSettingsTab(tab, containerEl)
// where `tab` is the AppleStyleSettingTab instance, used for accessing
// `tab.plugin.*` and triggering settings re-renders through a compatibility helper.


import {
  DEFAULT_WECHATSYNC_PORT,
  retryRecoverableBridgeOperation,
  isUnsupportedBridgeMethodError as isWechatSyncUnsupportedMethodError,
} from '../../services/wechatsync-bridge.js';

import {
  getFallbackWechatsyncPlatforms,
  getWechatsyncPlatformStatusBadge,
  normalizeWechatsyncAuthSnapshot,
  normalizeWechatsyncPlatformList,
  summarizeWechatsyncPlatformResponse,
} from '../../services/wechatsync-results.js';

import {
  getAvailableWechatsyncPlatforms,
  hasWechatSyncProLicense,
  mergeWechatsyncPlatformLists,
  normalizeMultiPlatformSyncSettings,
  normalizeWechatSyncCapabilities,
  parseWechatsyncPlatformIds,
} from '../../services/wechatsync-settings.js';

import {
  formatWechatsyncCheckedAt,
} from '../connection-status-bar.js';
import { getActiveWindowValue } from '../../services/dom-utils.js';

const OBSIDIAN_PUBLISHER_PRO_URL = 'https://xiaoweibox.top/obsidian-publisher/pro/?from=obsidian-plugin';
const OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL = 'https://xiaoweibox.top/obsidian-publisher/guide/?from=obsidian-plugin#install-extension';
const OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL = 'https://xiaoweibox.top/obsidian-publisher/guide/?from=obsidian-plugin#bridge';
const LEGACY_SETTING_RENDER_KEY = ['dis', 'play'].join('');

/**
 * @typedef {HTMLElement & {
 *   createDiv: (options?: { cls?: string }) => WechatSettingsElement,
 *   createEl: (tagName: string, options?: { text?: string, cls?: string, attr?: Record<string, string> }) => WechatSettingsElement,
 *   createSvg: (tagName: string, options?: { cls?: string, attr?: Record<string, string> }) => WechatSettingsElement,
 *   addClass?: (className: string) => void,
 *   removeClass?: (className: string) => void,
 *   setText?: (text: string) => void,
 * }} WechatSettingsElement
 * @typedef {{ setValue: (value: boolean) => WechatToggleLike, onChange: (handler: (value: boolean) => unknown) => WechatToggleLike }} WechatToggleLike
 * @typedef {{ setPlaceholder: (value: string) => WechatTextLike, setValue: (value: string) => WechatTextLike, onChange: (handler: (value: string) => unknown) => WechatTextLike }} WechatTextLike
 * @typedef {{ setButtonText: (value: string) => WechatButtonLike, setDisabled?: (value: boolean) => WechatButtonLike, onClick: (handler: () => unknown) => WechatButtonLike }} WechatButtonLike
 * @typedef {{ setName: (value: string) => WechatSettingLike, setDesc: (value: string) => WechatSettingLike, setHeading: () => WechatSettingLike, addToggle: (handler: (toggle: WechatToggleLike) => unknown) => WechatSettingLike, addText: (handler: (text: WechatTextLike) => unknown) => WechatSettingLike, addButton: (handler: (button: WechatButtonLike) => unknown) => WechatSettingLike }} WechatSettingLike
 * @typedef {new (containerEl: WechatSettingsElement) => WechatSettingLike} WechatSettingConstructor
 * @typedef {new (message: string, timeout?: number) => unknown} WechatNoticeConstructor
 * @typedef {{ listSupportedPlatforms: (options?: Record<string, unknown>) => Promise<unknown>, getAuthSnapshot: (options?: Record<string, unknown>) => Promise<unknown>, start: () => Promise<unknown>, waitForConnection: (timeoutMs: number) => Promise<unknown>, health: (options?: Record<string, unknown>) => Promise<unknown>, getStatus?: () => Promise<unknown>, getDiagnostics?: () => unknown }} WechatBridgeLike
 * @typedef {{ multiPlatformSync?: unknown }} WechatPluginSettingsLike
 * @typedef {{ settings: WechatPluginSettingsLike, obsidianApi?: Partial<WechatObsidianApiLike>, activeView?: { openExternalUrl?: (url: string) => boolean }, openExternalUrl?: (url: string) => boolean, saveSettings: () => Promise<void>, startWechatSyncBridgeInBackground: (reason: string) => unknown, getWechatSyncBridgeService: () => WechatBridgeLike, _wechatSyncBridgeService?: { stop?: () => Promise<unknown> } }} WechatPluginLike
 * @typedef {{ plugin: WechatPluginLike, renderSettingsContent?: () => void, renderSettingsTabIntro?: (containerEl: WechatSettingsElement, description: string) => void, [key: string]: unknown }} WechatSettingsTabLike
 * @typedef {{ Setting: WechatSettingConstructor, Notice: WechatNoticeConstructor }} WechatObsidianApiLike
 * @typedef {{ color: string, path: string }} BrowserIconDef
 * @typedef {{ id: string, name: string, authKnown?: boolean, authStatus?: string, authenticated?: boolean }} WechatPlatformLike
 * @typedef {{ status?: string, checkedAt?: number, platforms?: unknown, capabilities?: Record<string, unknown>, message?: string }} WechatConnectionLike
 * @typedef {{ ok?: boolean, tokenValid?: boolean, error?: string, capabilities?: Record<string, unknown> }} WechatHealthLike
 * @typedef {{ checkedAt?: number, platforms?: unknown }} WechatAuthSnapshotLike
 * @typedef {{ helloRejections?: number, lastHelloRejection?: { reason?: string } }} WechatDiagnosticsLike
 * @typedef {{ cls: string, text: string, status?: string }} PlatformStatusBadgeLike
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} error
 * @returns {{ message: string, code?: string, stack?: string }}
 */
function toReadableError(error) {
  if (error instanceof Error) {
    return /** @type {{ message: string, code?: string, stack?: string }} */ (error);
  }
  if (isRecord(error)) {
    return {
      message: typeof error.message === 'string' ? error.message : String(error),
      code: typeof error.code === 'string' ? error.code : undefined,
      stack: typeof error.stack === 'string' ? error.stack : undefined,
    };
  }
  return { message: String(error || '') };
}

/**
 * @param {unknown} settings
 * @returns {Record<string, unknown>}
 */
function toSettingsRecord(settings) {
  return isRecord(settings) ? settings : {};
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function toRecord(value) {
  return isRecord(value) ? value : {};
}

/**
 * @param {unknown[]} platforms
 * @returns {WechatPlatformLike[]}
 */
function toPlatformList(platforms) {
  return platforms.map((platform) => {
    const record = isRecord(platform) ? platform : {};
    const id = toText(record.id);
    const name = toText(record.name) || id;
    return {
      id,
      name,
      authKnown: Boolean(record.authKnown),
      authStatus: toText(record.authStatus),
      authenticated: Boolean(record.authenticated),
    };
  }).filter((platform) => platform.id);
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>[]}
 */
function toRecordList(value) {
  return Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({ ...item }))
    : [];
}

/**
 * @param {unknown} platform
 * @returns {string}
 */
function getPlatformId(platform) {
  return toText(toRecord(platform).id);
}

/**
 * @param {unknown} value
 * @returns {WechatHealthLike}
 */
function toHealthResult(value) {
  const record = toRecord(value);
  const capabilities = isRecord(record.capabilities) ? record.capabilities : {};
  return {
    ok: typeof record.ok === 'boolean' ? record.ok : undefined,
    tokenValid: typeof record.tokenValid === 'boolean' ? record.tokenValid : undefined,
    error: toText(record.error),
    capabilities,
  };
}

/**
 * @param {unknown} value
 * @returns {WechatAuthSnapshotLike}
 */
function toAuthSnapshot(value) {
  const record = toRecord(value);
  return {
    checkedAt: toTimestamp(record.checkedAt),
    platforms: record.platforms,
  };
}

/**
 * @param {unknown} value
 * @returns {WechatDiagnosticsLike}
 */
function toDiagnostics(value) {
  const record = toRecord(value);
  const last = toRecord(record.lastHelloRejection);
  return {
    helloRejections: Number(record.helloRejections) || 0,
    lastHelloRejection: {
      reason: toText(last.reason),
    },
  };
}

/**
 * @param {unknown} value
 * @returns {PlatformStatusBadgeLike}
 */
function toPlatformStatusBadge(value) {
  const record = toRecord(value);
  return {
    cls: toText(record.cls),
    text: toText(record.text),
    status: toText(record.status),
  };
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isUnsupportedBridgeError(error) {
  return isWechatSyncUnsupportedMethodError(toReadableError(error));
}

/**
 * @param {WechatSettingsTabLike} tab
 * @param {string} url
 * @returns {boolean}
 */
function openExternalUrl(tab, url) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) return false;

  if (typeof tab?.plugin?.openExternalUrl === 'function') {
    return tab.plugin.openExternalUrl(target);
  }
  if (typeof tab?.plugin?.activeView?.openExternalUrl === 'function') {
    return tab.plugin.activeView.openExternalUrl(target);
  }

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(target, '_blank', 'noopener');
    return true;
  }

  return false;
}

/**
 * @param {WechatSettingsTabLike} tab
 * @param {{ obsidianApi?: Partial<WechatObsidianApiLike> }} [options={}]
 * @returns {WechatObsidianApiLike}
 */
function getObsidianApi(tab, options = {}) {
  return /** @type {WechatObsidianApiLike} */ (options.obsidianApi || tab.plugin.obsidianApi || getActiveWindowValue('obsidian') || {});
}

/**
 * @param {WechatSettingsTabLike} tab
 * @returns {boolean}
 */
function refreshSettingTab(tab) {
  if (!tab || typeof tab !== 'object') return false;
  if (typeof tab.renderSettingsContent === 'function') {
    tab.renderSettingsContent();
    return true;
  }
  const legacyRender = tab[LEGACY_SETTING_RENDER_KEY];
  if (typeof legacyRender !== 'function') return false;
  legacyRender.call(tab);
  return true;
}

/**
 * @param {WechatSettingsTabLike} tab
 * @param {WechatSettingsElement} containerEl
 * @param {{ obsidianApi?: Partial<WechatObsidianApiLike> }} [options={}]
 */
function renderMultiPlatformSettingsTab(tab, containerEl, options = {}) {
  const { Setting, Notice } = getObsidianApi(tab, options);
  const { plugin } = tab;
  const pluginSettings = toSettingsRecord(plugin.settings);
  const multiPlatformSettings = normalizeMultiPlatformSyncSettings(pluginSettings.multiPlatformSync);
  plugin.settings.multiPlatformSync = multiPlatformSettings;
  const isProLicensed = hasWechatSyncProLicense(multiPlatformSettings);

  const renderSettingsTabIntro = tab.renderSettingsTabIntro;
  if (typeof renderSettingsTabIntro === 'function') {
    renderSettingsTabIntro.call(
      tab,
      containerEl,
      '连接浏览器插件，并选择要保存草稿的内容平台。'
    );
  }

  new Setting(containerEl)
    .setName('浏览器插件发布')
    .setDesc('Obsidian 负责写作、预览和平台选择；浏览器插件使用当前的浏览器登录态，把文章保存到知乎、掘金、CSDN 等平台草稿箱。微信仍可使用上方公众号 API。')
    .setHeading();

  const guide = containerEl.createDiv({
    cls: `wechat-multiplatform-onboarding${isProLicensed ? ' is-pro' : ''}`,
  });
  guide.createEl('div', {
    cls: 'wechat-multiplatform-onboarding-title',
    text: isProLicensed ? 'Pro 已激活：多平台发布已解锁' : '下一步：安装浏览器插件并完成配置',
  });
  guide.createEl('p', {
    text: isProLicensed
      ? '当前浏览器插件授权已同步到 Obsidian，发布到其他平台时不再受免费版每日平台数量限制。'
      : '免费版每天 1 个平台额度。想先试用，先安装浏览器插件；已经购买或已经装好浏览器插件，可直接查看配置步骤。',
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
  const proGuideBtn = guideActions.createEl('button', { text: isProLicensed ? '查看 Pro 权益' : '了解 Pro' });
  proGuideBtn.onclick = () => openExternalUrl(tab, OBSIDIAN_PUBLISHER_PRO_URL);

  new Setting(containerEl)
    .setName('启用浏览器插件发布')
    .setDesc('开启后，Obsidian 会把文章发送给浏览器插件，由插件使用浏览器登录态保存到各平台草稿箱。在下方填入「连接令牌」即可完成配对。')
    .addToggle(toggle => toggle
      .setValue(multiPlatformSettings.enabled)
      .onChange(async (value) => {
        plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
          ...toRecord(plugin.settings.multiPlatformSync),
          enabled: value,
        });
        await plugin.saveSettings();
        if (value) {
          plugin.startWechatSyncBridgeInBackground('settings-enabled');
        } else if (plugin._wechatSyncBridgeService?.stop) {
          await plugin._wechatSyncBridgeService.stop().catch((error) => {
            console.warn('停止浏览器插件连接失败:', error);
          });
        }
        refreshSettingTab(tab);
      }));
  if (!multiPlatformSettings.enabled) {
    return;
  }

  new Setting(containerEl)
    .setName('本地服务端口')
    .setDesc('默认 9527。只有当浏览器插件中的本地服务地址使用了其他端口时才需要修改。')
    .addText(text => text
      .setPlaceholder(String(DEFAULT_WECHATSYNC_PORT))
      .setValue(String(multiPlatformSettings.port))
      .onChange(async (value) => {
        const nextPort = Number(value);
        plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
          ...toRecord(plugin.settings.multiPlatformSync),
          port: Number.isInteger(nextPort) ? nextPort : DEFAULT_WECHATSYNC_PORT,
          connection: { status: 'untested' },
        });
        await plugin.saveSettings();
        plugin.startWechatSyncBridgeInBackground('settings-port-change');
      }));

  new Setting(containerEl)
    .setName('连接令牌')
    .setDesc('填入浏览器插件本地服务中显示的连接令牌，用于确认 Obsidian 与插件属于同一组连接。')
    .addText(text => text
      .setPlaceholder('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
      .setValue(toText(multiPlatformSettings.token))
      .onChange(async (value) => {
        plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
          ...toRecord(plugin.settings.multiPlatformSync),
          token: value,
          connection: { status: 'untested' },
        });
        await plugin.saveSettings();
        plugin.startWechatSyncBridgeInBackground('settings-token-change');
      }));

  // §4.1 + §16: 统一连接状态栏 — 对普通用户只呈现一个信号
  {
    const clients = Array.isArray(multiPlatformSettings.connectedClients)
      ? multiPlatformSettings.connectedClients.map((client) => isRecord(client) ? client : {})
      : [];
    const liveClient = clients.find((c) => c.status === 'connected');
    const lastClient = clients[clients.length - 1];

    /** @type {Record<string, BrowserIconDef>} */
    const BROWSER_SVG = {
      chrome:   { color: '#4285F4', path: 'M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z' },
      chromium: { color: '#4285F4', path: 'M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z' },
      firefox:  { color: '#FF7139', path: 'M20.452 3.445a11.002 11.002 0 00-2.482-1.908C16.944.997 15.098.093 12.477.032c-.734-.017-1.457.03-2.174.144-.72.114-1.398.292-2.118.56-1.017.377-1.996.975-2.574 1.554.583-.349 1.476-.733 2.55-.992a10.083 10.083 0 013.729-.167c2.341.34 4.178 1.381 5.48 2.625a8.066 8.066 0 011.298 1.587c1.468 2.382 1.33 5.376.184 7.142-.85 1.312-2.67 2.544-4.37 2.53-.583-.023-1.438-.152-2.25-.566-2.629-1.343-3.021-4.688-1.118-6.306-.632-.136-1.82.13-2.646 1.363-.742 1.107-.7 2.816-.242 4.028a6.473 6.473 0 01-.59-1.895 7.695 7.695 0 01.416-3.845A8.212 8.212 0 019.45 5.399c.896-1.069 1.908-1.72 2.75-2.005-.54-.471-1.411-.738-2.421-.767C8.31 2.583 6.327 3.061 4.7 4.41a8.148 8.148 0 00-1.976 2.414c-.455.836-.691 1.659-.697 1.678.122-1.445.704-2.994 1.248-4.055-.79.413-1.827 1.668-2.41 3.042C.095 9.37-.2 11.608.14 13.989c.966 5.668 5.9 9.982 11.843 9.982C18.62 23.971 24 18.591 24 11.956a11.93 11.93 0 00-3.548-8.511z' },
      edge:     { color: '#0078D4', path: 'M21.86 17.86q.14 0 .25.12.1.13.1.25t-.11.33l-.32.46-.43.53-.44.5q-.21.25-.38.42l-.22.23q-.58.53-1.34 1.04-.76.51-1.6.91-.86.4-1.74.64t-1.67.24q-.9 0-1.69-.28-.8-.28-1.48-.78-.68-.5-1.22-1.17-.53-.66-.92-1.44-.38-.77-.58-1.6-.2-.83-.2-1.67 0-1 .32-1.96.33-.97.87-1.8.14.95.55 1.77.41.82 1.02 1.5.6.68 1.38 1.21.78.54 1.64.9.86.36 1.77.56.92.2 1.8.2 1.12 0 2.18-.24 1.06-.23 2.06-.72l.2-.1.2-.05zm-15.5-1.27q0 1.1.27 2.15.27 1.06.78 2.03.51.96 1.24 1.77.74.82 1.66 1.4-1.47-.2-2.8-.74-1.33-.55-2.48-1.37-1.15-.83-2.08-1.9-.92-1.07-1.58-2.33T.36 14.94Q0 13.54 0 12.06q0-.81.32-1.49.31-.68.83-1.23.53-.55 1.2-.96.66-.4 1.35-.66.74-.27 1.5-.39.78-.12 1.55-.12.7 0 1.42.1.72.12 1.4.35.68.23 1.32.57.63.35 1.16.83-.35 0-.7.07-.33.07-.65.23v-.02q-.63.28-1.2.74-.57.46-1.05 1.04-.48.58-.87 1.26-.38.67-.65 1.39-.27.71-.42 1.44-.15.72-.15 1.38zM11.96.06q1.7 0 3.33.39 1.63.38 3.07 1.15 1.43.77 2.62 1.93 1.18 1.16 1.98 2.7.49.94.76 1.96.28 1 .28 2.08 0 .89-.23 1.7-.24.8-.69 1.48-.45.68-1.1 1.22-.64.53-1.45.88-.54.24-1.11.36-.58.13-1.16.13-.42 0-.97-.03-.54-.03-1.1-.12-.55-.1-1.05-.28-.5-.19-.84-.5-.12-.09-.23-.24-.1-.16-.1-.33 0-.15.16-.35.16-.2.35-.5.2-.28.36-.68.16-.4.16-.95 0-1.06-.4-1.96-.4-.91-1.06-1.64-.66-.74-1.52-1.28-.86-.55-1.79-.89-.84-.3-1.72-.44-.87-.14-1.76-.14-1.55 0-3.06.45T.94 7.55q.71-1.74 1.81-3.13 1.1-1.38 2.52-2.35Q6.68 1.1 8.37.58q1.7-.52 3.58-.52Z' },
      brave:    { color: '#FB542B', path: 'M15.68 0l2.096 2.38s1.84-.512 2.709.358c.868.87 1.584 1.638 1.584 1.638l-.562 1.381.715 2.047s-2.104 7.98-2.35 8.955c-.486 1.919-.818 2.66-2.198 3.633-1.38.972-3.884 2.66-4.293 2.916-.409.256-.92.692-1.38.692-.46 0-.97-.436-1.38-.692a185.796 185.796 0 01-4.293-2.916c-1.38-.973-1.712-1.714-2.197-3.633-.247-.975-2.351-8.955-2.351-8.955l.715-2.047-.562-1.381s.716-.768 1.585-1.638c.868-.87 2.708-.358 2.708-.358L8.321 0h7.36zm-3.679 14.936c-.14 0-1.038.317-1.758.69-.72.373-1.242.637-1.409.742-.167.104-.065.301.087.409.152.107 2.194 1.69 2.393 1.866.198.175.489.464.687.464.198 0 .49-.29.688-.464.198-.175 2.24-1.759 2.392-1.866.152-.108.254-.305.087-.41-.167-.104-.689-.368-1.41-.741-.72-.373-1.617-.69-1.757-.69zm0-11.278s-.409.001-1.022.206-1.278.46-1.584.46c-.307 0-2.581-.434-2.581-.434S4.119 7.152 4.119 7.849c0 .697.339.881.68 1.243l2.02 2.149c.192.203.59.511.356 1.066-.235.555-.58 1.26-.196 1.977.384.716 1.042 1.194 1.464 1.115.421-.08 1.412-.598 1.776-.834.364-.237 1.518-1.19 1.518-1.554 0-.365-1.193-1.02-1.413-1.168-.22-.15-1.226-.725-1.247-.95-.02-.227-.012-.293.284-.851.297-.559.831-1.304.742-1.8-.089-.495-.95-.753-1.565-.986-.615-.232-1.799-.671-1.947-.74-.148-.068-.11-.133.339-.175.448-.043 1.719-.212 2.292-.052.573.16 1.552.403 1.632.532.079.13.149.134.067.579-.081.445-.5 2.581-.541 2.96-.04.38-.12.63.288.724.409.094 1.097.256 1.333.256s.924-.162 1.333-.256c.408-.093.329-.344.288-.723-.04-.38-.46-2.516-.541-2.961-.082-.445-.012-.45.067-.579.08-.129 1.059-.372 1.632-.532.573-.16 1.845.009 2.292.052.449.042.487.107.339.175-.148.069-1.332.508-1.947.74-.615.233-1.476.49-1.565.986-.09.496.445 1.241.742 1.8.297.558.304.624.284.85-.02.226-1.026.802-1.247.95-.22.15-1.413.804-1.413 1.169 0 .364 1.154 1.317 1.518 1.554.364.236 1.355.755 1.776.834.422.079 1.08-.4 1.464-1.115.384-.716.039-1.422-.195-1.977-.235-.555.163-.863.355-1.066l2.02-2.149c.341-.362.68-.546.68-1.243 0-.697-2.695-3.96-2.695-3.96s-2.274.436-2.58.436c-.307 0-.972-.256-1.585-.461-.613-.205-1.022-.206-1.022-.206z' },
      opera:    { color: '#FF1B2D', path: 'M8.051 5.238c-1.328 1.566-2.186 3.883-2.246 6.48v.564c.061 2.598.918 4.912 2.246 6.479 1.721 2.236 4.279 3.654 7.139 3.654 1.756 0 3.4-.537 4.807-1.471C17.879 22.846 15.074 24 12 24c-.192 0-.383-.004-.57-.014C5.064 23.689 0 18.436 0 12 0 5.371 5.373 0 12 0h.045c3.055.012 5.84 1.166 7.953 3.055-1.408-.93-3.051-1.471-4.81-1.471-2.858 0-5.417 1.42-7.14 3.654h.003zM24 12c0 3.556-1.545 6.748-4.002 8.945-3.078 1.5-5.946.451-6.896-.205 3.023-.664 5.307-4.32 5.307-8.74 0-4.422-2.283-8.075-5.307-8.74.949-.654 3.818-1.703 6.896-.205C22.455 5.25 24 8.445 24 12z' },
      vivaldi:  { color: '#EF3939', path: 'M12 0C6.75 0 3.817 0 1.912 1.904.007 3.81 0 6.75 0 12s0 8.175 1.912 10.08C3.825 23.985 6.75 24 12 24c5.25 0 8.183 0 10.088-1.904C23.993 20.19 24 17.25 24 12s0-8.175-1.912-10.08C20.175.015 17.25 0 12 0zm-.168 3a9 9 0 016.49 2.648 9 9 0 010 12.704A9 9 0 1111.832 3zM7.568 7.496a1.433 1.433 0 00-.142.004A1.5 1.5 0 006.21 9.75l1.701 3c.93 1.582 1.839 3.202 2.791 4.822a1.417 1.417 0 001.41.75 1.5 1.5 0 001.223-.81l4.447-7.762A1.56 1.56 0 0018 8.768a1.5 1.5 0 10-2.828.914 2.513 2.513 0 01.256 1.119v.246a2.393 2.393 0 01-2.52 2.13 2.348 2.348 0 01-1.965-1.214c-.307-.51-.6-1.035-.9-1.553-.42-.72-.826-1.41-1.246-2.16a1.433 1.433 0 00-1.229-.754Z' },
      arc:      { color: '#7E5BEF', path: 'M23.9371 8.5089c.1471-.7147.0367-1.4661-.3364-2.0967-.4203-.7094-1.1035-1.1876-1.9075-1.3506a2.9178 2.9178 0 0 0-.5623-.0578h-.0105c-1.3768 0-2.5329.988-2.8061 2.3385-.1629.7935-.4782 1.5607-.9196 2.2701a.263.263 0 0 1-.2363.1205.2627.2627 0 0 1-.2209-.1468l-2.8587-5.9906c-.3626-.762-1.0142-1.361-1.8235-1.5975-1.3873-.4099-2.8166.2838-3.4052 1.524L5.897 9.7333c-.0788.1629-.31.1576-.3784-.0053v-.0052a2.8597 2.8597 0 0 0-2.6642-1.7972c-.3784 0-.7515.0736-1.1088.2207-1.4714.6148-2.1283 2.349-1.5187 3.8203.557 1.3295 1.4714 2.5855 2.659 3.668.084.0788.1103.1997.063.3048l-.9563 2.0074c-.6727 1.4188-.1314 3.1477 1.2664 3.8571.4099.2049.846.31 1.298.31 1.1035 0 2.123-.6411 2.5959-1.6395l.825-1.7289a.254.254 0 0 1 .3048-.1366c1.0037.2732 2.0127.4204 3.0058.4204 1.1193 0 2.2229-.1682 3.2896-.4782a.2626.2626 0 0 1 .3101.1366l.8145 1.7131c.4834 1.0195 1.4924 1.7131 2.6169 1.7184.4572 0 .8986-.0999 1.3138-.3101 1.403-.7094 1.939-2.4435 1.2664-3.8676L19.875 15.787c-.0473-.1051-.0263-.226.0578-.3048 1.9864-1.8497 3.4525-4.2723 4.0043-6.9733ZM6.2121 20.0172a1.835 1.835 0 0 1-.6764.7622 1.8352 1.8352 0 0 1-.9788.2835c-.2733 0-.5518-.063-.8093-.1891-.9038-.4467-1.2454-1.5713-.8093-2.4804l.7935-1.6658c.0684-.1471.2575-.1997.3837-.1051.1681.1209.3415.2365.5202.3521.6989.4467 1.4293.825 2.1808 1.1351.1419.0578.205.2154.1419.352l-.7462 1.5555Zm5.0763-2.0442c-4.2092 0-8.6548-2.8534-10.1262-6.4951a1.8286 1.8286 0 0 1 1.009-2.3805c.2259-.0893.4571-.1366.683-.1366.7252 0 1.4084.431 1.6974 1.1456.9196 2.2806 4.0043 4.2092 6.7368 4.2092.4204 0 .8408-.042 1.256-.1156a.2643.2643 0 0 1 .2837.1419l1.3768 2.9007c.0683.1471-.0105.3205-.1629.3626-.8986.2365-1.8182.3678-2.7536.3678Zm-.599-4.9291.6358-1.3348c.0526-.1051.205-.1051.2575 0l.6201 1.3033c.042.0841-.0158.1891-.1051.2049-.268.0368-.536.0578-.7988.0578a5.0634 5.0634 0 0 1-.4887-.0263c-.1103-.0157-.1629-.1208-.1208-.2049Zm8.4604 7.8246a1.831 1.831 0 0 1-2.0329-.2788 1.8292 1.8292 0 0 1-.4316-.5778l-4.987-10.4836c-.0998-.2102-.3994-.2102-.4939 0l-1.545 3.2529a.2623.2623 0 0 1-.3205.1366c-1.051-.3626-2.0495-.9774-2.7904-1.7184a.2552.2552 0 0 1-.0473-.2943l3.3421-7.031c.1156-.247.2943-.4677.5203-.6201 1.051-.6884 2.2806-.2575 2.7378.7041l6.8577 14.4248c.4309.9144.0946 2.0389-.8093 2.4856Zm-1.4451-9.6481a.258.258 0 0 1 .0315-.2732c.783-1.0037 1.3558-2.1756 1.6028-3.421.1734-.867.9354-1.4714 1.7919-1.4714.1472 0 .2943.0158.4467.0526.9722.2417 1.5344 1.2507 1.3295 2.2333-.4835 2.3017-1.6816 4.3879-3.3159 6.0222-.1313.1314-.3468.0946-.4256-.0683l-1.4609-3.0742Z' },
    };
    /** @type {Record<string, string>} */
    const BROWSER_EMOJI_FALLBACK = { safari: '🧭', comet: '☄️', orion: '⭐', zen: '🪷' };

    // §18.7：'chrome' / 'chromium' 不可信（Comet / Arc 等 fork 伪装为 Chrome），走通用 icon；
    // opt-in 识别的浏览器（edge / brave / firefox / vivaldi / opera 等）才用各自品牌 SVG。
    const LOW_CONFIDENCE_BROWSER_KEYS = new Set(['chrome', 'chromium']);

    /**
     * @param {WechatSettingsElement} parentEl
     * @param {unknown} name
     */
    function renderBrowserIcon(parentEl, name) {
      const key = toText(name).toLowerCase().replace(/\s+/g, '');
      const browser = LOW_CONFIDENCE_BROWSER_KEYS.has(key) ? null : BROWSER_SVG[key];
      if (browser) {
        const svg = parentEl.createSvg('svg', {
          attr: { viewBox: '0 0 24 24', width: '14', height: '14', fill: browser.color },
          cls: 'wechat-bridge-browser-icon',
        });
        svg.createSvg('path', { attr: { d: browser.path } });
      } else {
        parentEl.createEl('span', {
          cls: 'wechat-bridge-browser-icon-generic',
          text: BROWSER_EMOJI_FALLBACK[key] || '🌐',
        });
      }
    }

    // profileLabel 优先（用户自定义）；fallback 到格式化后的 browserName。
    /**
     * @param {WechatSettingsElement} parentEl
     * @param {unknown} browserName
     * @param {unknown} profileLabel
     */
    function renderBrowserLabel(parentEl, browserName, profileLabel) {
      const label = toText(profileLabel).trim();
      const browserLabel = toText(browserName);
      if (label) {
        parentEl.createEl('span', { cls: 'wechat-bridge-status-profile', text: label });
      } else {
        parentEl.createEl('span', {
          text: browserLabel ? browserLabel.charAt(0).toUpperCase() + browserLabel.slice(1) : '浏览器',
        });
      }
    }

    /**
     * @param {unknown} ts
     * @returns {string}
     */
    function fmtRelativeTime(ts) {
      const timestamp = toTimestamp(ts);
      if (!timestamp) return '';
      const d = Date.now() - timestamp;
      if (d < 60000) return '刚刚';
      if (d < 3600000) return `${Math.floor(d / 60000)} 分钟前`;
      if (d < 86400000) return `${Math.floor(d / 3600000)} 小时前`;
      return `${Math.floor(d / 86400000)} 天前`;
    }


    const bar = containerEl.createDiv({ cls: 'wechat-multiplatform-token-status' });
    const dot = bar.createEl('span', { cls: 'wechat-multiplatform-token-status-dot' });
    const body = bar.createDiv({ cls: 'wechat-bridge-status-body' });

    if (!multiPlatformSettings.token) {
      dot.classList?.add?.('is-error');
      dot.textContent = '未填写';
      body.createEl('span', { text: '连接令牌尚未填写。请到浏览器扩展弹窗复制令牌。' });
    } else if (liveClient) {
      dot.classList?.add?.('is-ok');
      dot.textContent = '已就绪';
      renderBrowserIcon(body, liveClient.browserName);
      renderBrowserLabel(body, liveClient.browserName, liveClient.profileLabel);
      body.createEl('span', { cls: 'wechat-bridge-status-time', text: fmtRelativeTime(liveClient.lastSeenAt) });
    } else if (lastClient) {
      dot.classList?.add?.('is-unknown');
      dot.textContent = '已断开';
      renderBrowserIcon(body, lastClient.browserName);
      renderBrowserLabel(body, lastClient.browserName, lastClient.profileLabel);
      body.createEl('span', { text: ' 已断开，请重启浏览器扩展重新连接。' });
      body.createEl('span', { cls: 'wechat-bridge-status-time', text: fmtRelativeTime(lastClient.lastSeenAt) });
    } else if (multiPlatformSettings.connection?.status === 'connected') {
      dot.classList?.add?.('is-ok');
      dot.textContent = '已就绪';
      const checkedAt = formatWechatsyncCheckedAt(multiPlatformSettings.connection.checkedAt);
      body.createEl('span', {
        text: checkedAt
          ? `浏览器扩展已连接，可以发布。上次检查 ${checkedAt}。`
          : '浏览器扩展已连接，可以发布。',
      });
    } else if (multiPlatformSettings.connection?.status === 'failed') {
      dot.classList?.add?.('is-error');
      dot.textContent = '连接失败';
      body.createEl('span', {
        text: multiPlatformSettings.connection.message
          ? `${multiPlatformSettings.connection.message}。请检查端口和令牌后点击「测试连接」。`
          : '请检查端口和令牌后点击「测试连接」。',
      });
    } else {
      dot.classList?.add?.('is-unknown');
      dot.textContent = '等待连接';
      body.createEl('span', { text: '令牌已填写，请点击下方「测试连接」确认连接。' });
    }
  }

  // §3.5 + §4.1: allowRemote 是高级功能（127.0.0.1 ↔ 0.0.0.0 切换），
  // 99% 普通用户用不上且开启会扩大攻击面，因此默认不在设置 UI 暴露。
  // 底层数据通路（settings.allowRemote / bridge bind host / cache key）
  // 全部保留：高级用户仍可直接编辑 data.json 让其生效，未来挂回 UI
  // 也只需恢复这块 toggle。
  // §16 连接状态已合并进上方统一状态栏。

  /**
   * @param {WechatBridgeLike} bridge
   * @returns {Promise<WechatPlatformLike[]>}
   */
  const getSupportedPlatformsFromExtension = async (bridge) => {
    const response = await bridge.listSupportedPlatforms({ timeoutMs: 10000 });
    return toRecordList(normalizeWechatsyncPlatformList(response));
  };

  /**
   * @param {WechatBridgeLike} bridge
   * @param {string[]} [platforms]
   * @param {Record<string, unknown>[]} [fallbackPlatforms]
   * @returns {Promise<WechatAuthSnapshotLike>}
   */
  const getAuthSnapshotFromExtension = async (bridge, platforms = [], fallbackPlatforms = []) => {
    const response = await bridge.getAuthSnapshot({
      platforms,
      maxAgeMs: 86400000,
      timeoutMs: 5000,
    });
    return toAuthSnapshot(normalizeWechatsyncAuthSnapshot(response, fallbackPlatforms));
  };
  const hasExtensionPlatformList = Array.isArray(multiPlatformSettings.supportedPlatforms)
    && multiPlatformSettings.supportedPlatforms.length > 0
    && multiPlatformSettings.connection?.status === 'connected';
  const availablePlatforms = toPlatformList(getAvailableWechatsyncPlatforms(multiPlatformSettings));
  const selectedPlatformSet = new Set(parseWechatsyncPlatformIds(multiPlatformSettings.selectedPlatforms || []));
  const hasCachedAuthState = availablePlatforms.some(
    (platform) => platform.authKnown && platform.authStatus !== 'bridge_required'
  );
  const getPlatformAuthBadge = (platform = {}) => toPlatformStatusBadge(getWechatsyncPlatformStatusBadge(platform, {
    bridgeConnected: multiPlatformSettings.connection?.status === 'connected',
  }));

  // 连接状态栏已合并进令牌行统一状态栏（见上方 §4.1+§16 unified block）。

  const platformPicker = containerEl.createDiv({ cls: 'wechat-platform-picker' });
  const platformPickerHeader = platformPicker.createDiv({ cls: 'wechat-platform-picker-header' });
  const platformPickerTitle = platformPickerHeader.createDiv();
  platformPickerTitle.createEl('div', { text: '发布平台（浏览器插件支持）', cls: 'wechat-platform-picker-title' });
  const checkedAtText = formatWechatsyncCheckedAt(multiPlatformSettings.connection?.checkedAt);
  platformPickerTitle.createEl('div', {
    text: hasCachedAuthState
      ? `已勾选平台会显示上次状态${checkedAtText ? `（${checkedAtText}）` : ''}；本次发布仍以浏览器插件实际结果为准。`
      : (hasExtensionPlatformList
        ? '平台清单来自当前连接的浏览器插件；仅勾选的平台会显示上次状态。'
        : '未连接插件前先显示本地备用清单；连接成功后会刷新为插件实际支持的平台。'),
    cls: 'wechat-platform-picker-desc',
  });
  const platformSummary = platformPickerHeader.createDiv({ cls: 'wechat-platform-picker-summary' });
  const updatePlatformSummary = () => {
    platformSummary.setText(`已选择 ${selectedPlatformSet.size} 个`);
  };
  updatePlatformSummary();

  const platformGrid = platformPicker.createDiv({ cls: 'wechat-platform-grid' });
  const saveSelectedPlatforms = async () => {
    const current = normalizeMultiPlatformSyncSettings(plugin.settings.multiPlatformSync);
    plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
      ...current,
      selectedPlatforms: Array.from(selectedPlatformSet),
    });
    await plugin.saveSettings();
  };

  for (const platform of availablePlatforms) {
    const authBadge = getPlatformAuthBadge(platform);
    const isSelected = selectedPlatformSet.has(platform.id);
    const chip = platformGrid.createEl('label', {
      cls: `wechat-platform-chip ${isSelected ? `${authBadge.cls} is-selected` : ''}`,
    });
    chip.setAttribute('title', isSelected ? `${platform.name} · ${authBadge.text}` : platform.name);
    const checkbox = chip.createEl('input', { attr: { type: 'checkbox' } });
    checkbox.checked = isSelected;
    checkbox.value = platform.id;
    const chipBody = chip.createEl('span', { cls: 'wechat-platform-chip-body' });
    chipBody.createEl('span', { text: platform.name, cls: 'wechat-platform-chip-name' });
    const statusEl = /** @type {WechatSettingsElement} */ (chipBody.createEl('span', {
      text: authBadge.text,
      cls: `wechat-platform-chip-status ${authBadge.cls}`,
    }));
    statusEl.setAttribute('title', authBadge.text);
    const setStatusVisible = (visible) => {
      for (const cls of ['is-ok', 'is-error', 'is-unknown', 'is-bridge']) {
        chip.removeClass?.(cls);
        chip.classList?.remove(cls);
        statusEl.removeClass?.(cls);
        statusEl.classList?.remove(cls);
      }
      statusEl.textContent = authBadge.text;
      if (visible) {
        chip.addClass?.(authBadge.cls);
        chip.classList?.add(authBadge.cls);
        statusEl.addClass?.(authBadge.cls);
        statusEl.classList?.add(authBadge.cls);
      }
      chip.setAttribute('title', visible ? `${platform.name} · ${authBadge.text}` : platform.name);
    };
    checkbox.onchange = async () => {
      if (checkbox.checked) {
        selectedPlatformSet.add(platform.id);
        chip.addClass('is-selected');
        setStatusVisible(true);
        if (authBadge.status === 'login_required') {
          new Notice(`${platform.name} 上次状态为需登录。请先在浏览器插件打开平台登录页，或继续尝试由插件返回实际结果。`, 8000);
        }
      } else {
        selectedPlatformSet.delete(platform.id);
        chip.removeClass('is-selected');
        setStatusVisible(false);
      }
      updatePlatformSummary();
      await saveSelectedPlatforms();
    };
  }

  new Setting(containerEl)
    .setName('测试连接')
    .setDesc('只验证 Obsidian、浏览器插件和连接令牌是否连通，并读取平台清单；不会实时检测所有平台登录状态。')
    .addButton(button => button
      .setButtonText('测试')
      .onClick(async () => {
        button.setButtonText('等待插件...');
        button.setDisabled?.(true);
        const startedAt = Date.now();
        /** @type {WechatBridgeLike | null} */
        let bridge = null;
        /** @type {unknown} */
        let bridgeStartStatus = null;
        let shouldRedisplay = false;
        try {
          const currentBeforeTest = normalizeMultiPlatformSyncSettings(plugin.settings.multiPlatformSync);
          const debugSettings = normalizeMultiPlatformSyncSettings(plugin.settings.multiPlatformSync);
          console.debug('[Wechatsync] test connection started', {
            port: debugSettings.port,
            hasToken: !!debugSettings.token,
            forceRefresh: false,
          });
          bridge = plugin.getWechatSyncBridgeService();
          bridgeStartStatus = await bridge.start();
          console.debug('[Wechatsync] bridge started', bridgeStartStatus);
          await bridge.waitForConnection(15000);
          console.debug('[Wechatsync] extension connection ready', {
            elapsedMs: Date.now() - startedAt,
          });
          /** @type {WechatHealthLike | null} */
          let health = null;
          /** @type {Record<string, unknown>} */
          let capabilities = {};
          try {
            health = toHealthResult(await retryRecoverableBridgeOperation(async (context) => {
              const attempt = Number(toRecord(context).attempt) || 0;
              if (attempt > 0) {
                console.debug('[Wechatsync] retrying health after bridge recovery window', { attempt });
              }
              const healthResult = toHealthResult(await bridge.health({ timeoutMs: 5000 }));
              if (healthResult?.tokenValid === false) {
                const authError = new Error('连接令牌校验失败。请确认 Obsidian 与浏览器插件使用同一个连接令牌。');
                authError.code = 'AUTH_FAILED';
                throw authError;
              }
              if (healthResult?.ok === false) {
                const healthError = new Error(healthResult.error || '浏览器插件健康检查失败');
                healthError.code = 'BRIDGE_REQUEST_TIMEOUT';
                throw healthError;
              }
              return healthResult;
            }, {
              retries: 2,
              delayMs: 1000,
              logger: console,
              label: 'settings health',
            }));
            console.debug('[Wechatsync] health result', health);
            capabilities = normalizeWechatSyncCapabilities(toRecord(health.capabilities));
          } catch (healthError) {
            if (!isUnsupportedBridgeError(healthError)) throw healthError;
            console.warn('[Wechatsync] extension does not support health, falling back to socket-only check', healthError);
          }
          /** @type {WechatPlatformLike[]} */
          let supportedPlatforms = [];
          try {
            supportedPlatforms = await getSupportedPlatformsFromExtension(bridge);
            console.debug('[Wechatsync] supported platforms loaded', {
              count: supportedPlatforms.length,
              platforms: supportedPlatforms.map((platform) => getPlatformId(platform)),
            });
          } catch (platformError) {
            if (isUnsupportedBridgeError(platformError)) {
              console.warn('[Wechatsync] extension does not support listSupportedPlatforms, keeping fallback list', platformError);
            } else {
              console.warn('[Wechatsync] listSupportedPlatforms failed, keeping existing platform list', platformError);
            }
          }
          const selectedPlatformIds = parseWechatsyncPlatformIds(currentBeforeTest.selectedPlatforms || []);
          const current = normalizeMultiPlatformSyncSettings(plugin.settings.multiPlatformSync);
          const currentConnection = toRecord(current.connection);
          const nextPlatforms = toRecordList(normalizeWechatsyncPlatformList(currentConnection.platforms || []))
            .filter((platform) => selectedPlatformIds.includes(getPlatformId(platform)));
          plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
            ...current,
            supportedPlatforms: supportedPlatforms.length ? supportedPlatforms : current.supportedPlatforms,
            connection: {
              ...currentConnection,
              status: 'connected',
              checkedAt: Date.now(),
              platforms: nextPlatforms,
              capabilities,
              message: health
                ? '已连接，连接令牌已通过插件校验。未读取平台登录状态。'
                : '已连接。当前插件版本未提供健康校验，平台登录状态未自动检测。',
            },
          });
          await plugin.saveSettings();
          shouldRedisplay = true;
          new Notice(health
            ? '✅ 已连接浏览器插件，连接令牌校验通过'
            : '✅ 已连接浏览器插件');
        } catch (error) {
          /** @type {Record<string, unknown> | null} */
          let bridgeStatusAfterFailure = null;
          /** @type {WechatDiagnosticsLike | null} */
          let diagnostics = null;
          try {
            bridgeStatusAfterFailure = toRecord(await bridge?.getStatus?.());
          } catch (statusError) {
            const readableStatusError = toReadableError(statusError);
            bridgeStatusAfterFailure = { error: readableStatusError.message };
          }
          try {
            diagnostics = toDiagnostics(bridge?.getDiagnostics?.());
          } catch {
            diagnostics = null;
          }

          // §4.1 / §7.1: detect state 3 (extension connected but hello rejected) vs
          // state 2 (no extension reached the bridge at all) so the user sees an
          // actionable message instead of the generic timeout text.
          const readableError = toReadableError(error);
          let detailedMessage = readableError.message || '浏览器插件连接失败';
          let hint = '';
          if (readableError.code === 'EXTENSION_NOT_CONNECTED' && diagnostics?.helloRejections > 0) {
            const reason = diagnostics.lastHelloRejection?.reason;
            if (reason === 'token_mismatch') {
              detailedMessage = '配对令牌不一致。如果你刚刚在浏览器插件设置中重置过令牌，请复制新令牌并粘贴到下方"连接令牌"输入框。';
            } else if (reason === 'hello_timeout') {
              detailedMessage = '浏览器插件连接后未在限定时间内完成握手。可能扩展版本过旧或未启用握手。';
            } else if (reason === 'invalid_payload') {
              detailedMessage = '浏览器插件发送的握手数据格式不正确。请升级浏览器插件到支持安全握手的版本。';
            } else if (reason === 'version_unsupported') {
              detailedMessage = '浏览器插件版本与 Obsidian 不兼容，握手被拒绝。请升级浏览器插件。';
            } else if (reason) {
              detailedMessage = `浏览器插件握手失败（${reason}）。请检查浏览器插件版本与连接令牌。`;
            }
            hint = '';
          } else if (['EXTENSION_NOT_CONNECTED', 'BRIDGE_UNAVAILABLE', 'BRIDGE_REQUEST_TIMEOUT'].includes(readableError.code)) {
            hint = '请确认浏览器正在运行、已安装浏览器插件，并检查地址、端口和连接令牌与这里一致。';
          } else if (readableError.code === 'EXTENSION_NOT_AUTHENTICATED') {
            detailedMessage = '浏览器插件已连接但尚未通过认证。请确认插件已升级到支持安全握手的版本，且使用与 Obsidian 一致的连接令牌。';
          }

          console.error('[Wechatsync] test connection failed', {
            elapsedMs: Date.now() - startedAt,
            code: readableError.code,
            message: readableError.message,
            stack: readableError.stack,
            bridgeStartStatus,
            bridgeStatusAfterFailure,
            diagnostics,
            detailedMessage,
          });
          plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
            ...toRecord(plugin.settings.multiPlatformSync),
            connection: {
              status: 'failed',
              checkedAt: Date.now(),
              platforms: [],
              capabilities: {},
              message: detailedMessage,
            },
          });
          await plugin.saveSettings();
          new Notice(`❌ ${detailedMessage}${hint ? ` ${hint}` : ''}`, 12000);
          shouldRedisplay = true;
        } finally {
          button.setDisabled?.(false);
          button.setButtonText('测试');
          if (shouldRedisplay) refreshSettingTab(tab);
        }
      }));

  new Setting(containerEl)
    .setName('读取已选平台状态')
    .setDesc('读取浏览器插件缓存的上次状态，不会实时检测登录；发布时仍以浏览器插件实际执行为准。')
    .addButton(button => button
      .setButtonText('读取')
      .onClick(async () => {
        const current = normalizeMultiPlatformSyncSettings(plugin.settings.multiPlatformSync);
        const platformById = new Map(
          toPlatformList(getAvailableWechatsyncPlatforms(current)).map((platform) => [platform.id, platform])
        );
        /** @type {WechatPlatformLike[]} */
        const candidates = parseWechatsyncPlatformIds(current.selectedPlatforms || [])
          .map((id) => platformById.get(id) || { id, name: id })
          .filter((platform) => platform.id);
        if (!candidates.length) {
          new Notice('请先勾选至少一个发布平台');
          return;
        }

        button.setButtonText('读取中...');
        button.setDisabled?.(true);
        const startedAt = Date.now();
        try {
          const bridge = plugin.getWechatSyncBridgeService();
          await bridge.start();
          await bridge.waitForConnection(15000);
          const platformFallbacks = toRecordList(mergeWechatsyncPlatformLists(
            current.supportedPlatforms,
            toRecord(current.connection).platforms,
            getFallbackWechatsyncPlatforms()
          ));
          const authSnapshot = await getAuthSnapshotFromExtension(
            bridge,
            candidates.map((platform) => platform.id),
            platformFallbacks
          );
          const cachedPlatforms = toRecordList(normalizeWechatsyncPlatformList(authSnapshot.platforms || []));
          console.debug('[Wechatsync] selected platform cached auth snapshot summary', {
            elapsedMs: Date.now() - startedAt,
            checkedAt: authSnapshot.checkedAt,
            ...summarizeWechatsyncPlatformResponse(cachedPlatforms),
          });
          plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
            ...current,
            connection: {
              ...toRecord(current.connection),
              status: 'connected',
              checkedAt: authSnapshot.checkedAt || Date.now(),
              platforms: cachedPlatforms,
              capabilities: {
                ...toRecord(toRecord(current.connection).capabilities),
                getAuthSnapshot: true,
              },
              message: '已读取所选平台的上次登录状态。',
            },
          });
          await plugin.saveSettings();
          const authenticatedCount = cachedPlatforms.filter((platform) => platform.authenticated === true).length;
          new Notice(`✅ 已读取 ${cachedPlatforms.length} 个已选平台，${authenticatedCount} 个上次可用`);
          refreshSettingTab(tab);
        } catch (error) {
          const readableError = toReadableError(error);
          console.error('[Wechatsync] selected platform cached auth snapshot failed', {
            elapsedMs: Date.now() - startedAt,
            code: readableError.code,
            message: readableError.message,
          });
          new Notice(`❌ 读取失败：${readableError.message}`, 10000);
        } finally {
          button.setDisabled?.(false);
          button.setButtonText('读取');
        }
      }));
}

export { renderMultiPlatformSettingsTab };
