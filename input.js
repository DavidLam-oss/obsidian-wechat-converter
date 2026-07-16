/*
## 核心功能

定义 Obsidian 插件入口，注册视图、命令、设置页和顶层发布动作。

## 输入

接收 Obsidian Plugin 生命周期、用户设置、活动笔记、命令事件和视图交互。

## 输出

导出 AppleStylePlugin，并在运行时创建转换器视图、设置页、状态栏和发布入口。

## 定位

位于根目录，是插件生命周期层；复杂渲染、同步和 UI 子逻辑应下沉到 services/ 与 views/。

## 依赖

关键依赖：`./views/apple-style-view.js`、`./views/settings/apple-style-setting-tab.js`、`./services/ai-layout-cache.js`、`./services/plugin-settings.js`、`./views/apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 根目录 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { AppleStyleView } from './views/apple-style-view.js';
import { AppleStyleSettingTab } from './views/settings/apple-style-setting-tab.js';
import {
  getArticleLayoutStateFromSettings,
  saveArticleLayoutStateToSettings,
} from './services/ai-layout-cache.js';
import { normalizeLoadedSettings } from './services/plugin-settings.js';
import {
  createWechatSyncBridgeService,
  stripMarkdownFrontmatter,
  normalizeMultiPlatformSyncSettings,
  formatWechatsyncCheckedAt,
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
  updateFeishuHistoryPath,
  WechatAPI,
  obsidianApi,
  Plugin,
  MarkdownView,
  Notice,
  getActiveDocumentCompat,
  revealLeafCompat,
  getPluginSettings,
  setPluginSettings,
  refreshSettingTabCompat,
  toReadableError,
  toRecord,
  APPLE_STYLE_VIEW,
  APPLE_STYLE_VIEW_TITLE,
  getImageSwipeCommandCopy,
  createImageSwipeCalloutMarkdown,
  isMobileClient,
  generateId,
} from './views/apple-style-view-shared.js';

/**
 * 📝 Obsidian 发布助手主插件
 */
class AppleStylePlugin extends Plugin {
  async onload() {
    console.log('📝 正在加载 Obsidian 发布助手...');
    /** @type {ObsidianApiLike} */
    this.obsidianApi = obsidianApi;

    await this.loadSettings();

    // 热重载兼容：清除上次加载缓存在 window 上的运行时类。
    // 否则「重载插件」会复用旧 AppleTheme/AppleStyleConverter 类，
    // 导致本次构建的主题改动（如间距微调）不生效——预览拖滑块无变化。
    if (typeof window !== 'undefined') {
      delete window.AppleTheme;
      delete window.AppleStyleConverter;
    }

    this.registerView(
      APPLE_STYLE_VIEW,
      (leaf) => new AppleStyleView(leaf, this)
    );

    this.addRibbonIcon('wand', APPLE_STYLE_VIEW_TITLE, async () => {
      await this.openConverter();
    });

    this.addCommand({
      id: 'open-apple-converter',
      name: `打开${APPLE_STYLE_VIEW_TITLE}`,
      callback: async () => {
        await this.openConverter();
      },
    });

    this.addCommand({
      id: 'insert-image-swipe-block',
      name: getImageSwipeCommandCopy(this.app, 'image-swipe').name,
      callback: () => {
        this.insertImageSwipeCalloutFromActiveEditor('image-swipe');
      },
    });

    this.addCommand({
      id: 'insert-image-sensitive-block',
      name: getImageSwipeCommandCopy(this.app, 'image-sensitive').name,
      callback: () => {
        this.insertImageSwipeCalloutFromActiveEditor('image-sensitive');
      },
    });

    // Command 'convert-to-apple-style' removed as per user request

    this.addSettingTab(new AppleStyleSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.migrateLegacyConverterLeafTitles().catch((error) => {
        console.warn('同步转换器标题失败:', error);
      });
    });

    if (typeof this.app.vault.on === 'function') {
      this.registerEvent(
        this.app.vault.on('rename', (file, oldPath) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- reason: dynamic plugin settings
          if (this.settings.feishuSync) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- reason: dynamic file rename variables
            const changed = updateFeishuHistoryPath(this.settings.feishuSync, oldPath, file.path);
            if (changed) {
              this.saveSettings().catch((err) => {
                console.error('保存重命名设置失败:', err);
              });
            }
          }
        })
      );
    }

    this.startWechatSyncBridgeInBackground('plugin-load');

    console.log('✅ Obsidian 发布助手加载完成');
  }

  /**
   * @param {string} [type]
   */
  insertImageSwipeCalloutFromActiveEditor(type = 'image-swipe') {
    const activeView = this.app?.workspace?.getActiveViewOfType?.(MarkdownView);
    this.insertImageSwipeCallout(activeView?.editor, type);
  }

  /**
   * @param {EditorLike | null | undefined} editor
   * @param {string} [type]
   */
  insertImageSwipeCallout(editor, type = 'image-swipe') {
    if (!editor || typeof editor.replaceSelection !== 'function') {
      new Notice('请先打开一篇 Markdown 文档');
      return;
    }

    const selectedText = typeof editor.getSelection === 'function' ? editor.getSelection() : '';
    const markdown = createImageSwipeCalloutMarkdown(type, selectedText, this.app);
    editor.replaceSelection(markdown);
    new Notice(getImageSwipeCommandCopy(this.app, type).notice);
  }

  /**
   * @param {ViewStateLike | Record<string, unknown>} [baseState]
   * @param {{ active?: boolean }} [options]
   * @returns {ViewStateLike}
   */
  toConverterViewState(baseState = {}, options = {}) {
    const safeState = (baseState && typeof baseState === 'object') ? baseState : {};
    const shouldActivate = options && typeof options === 'object' && options.active === true;
    return {
      ...safeState,
      type: APPLE_STYLE_VIEW,
      state: (safeState.state && typeof safeState.state === 'object') ? safeState.state : {},
      icon: 'wand',
      title: APPLE_STYLE_VIEW_TITLE,
      active: shouldActivate,
    };
  }

  async migrateLegacyConverterLeafTitles() {
    const leaves = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW);
    if (!Array.isArray(leaves) || leaves.length === 0) return;

    for (const leaf of leaves) {
      const currentViewState = (typeof leaf.getViewState === 'function') ? leaf.getViewState() : null;
      if (!currentViewState || currentViewState.title === APPLE_STYLE_VIEW_TITLE) continue;
      await leaf.setViewState(
        this.toConverterViewState(currentViewState, { active: currentViewState.active === true })
      );
    }
  }

  async openConverter() {
    let leaf = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW)[0];

    if (!leaf) {
      const targetLeaf = isMobileClient(this.app)
        ? (this.app.workspace.getLeaf?.('tab') || this.app.workspace.getLeaf?.(false))
        : this.app.workspace.getRightLeaf(false);

      if (!targetLeaf) return;

      await targetLeaf.setViewState(this.toConverterViewState({}, { active: true }));
      leaf = targetLeaf;
    } else {
      const currentViewState = (typeof leaf.getViewState === 'function') ? leaf.getViewState() : null;
      if (!currentViewState || currentViewState.title !== APPLE_STYLE_VIEW_TITLE) {
        await leaf.setViewState(this.toConverterViewState(currentViewState || {}, { active: true }));
      }
    }

    await revealLeafCompat(this.app.workspace, leaf);
  }

  getConverterView() {
    const leaves = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW);
    if (leaves.length > 0) {
      return leaves[0].view;
    }
    return null;
  }

  openExternalUrl(url) {
    const target = String(url || '').trim();
    if (!/^https?:\/\//i.test(target)) return false;
    const view = this.getConverterView?.();
    if (view && typeof view === 'object') {
      const externalLinkView = /** @type {{ openExternalUrl?: unknown }} */ (view);
      const openExternalUrl = externalLinkView.openExternalUrl;
      if (typeof openExternalUrl === 'function') {
        openExternalUrl.call(externalLinkView, target);
        return true;
      }
    }
    if (typeof window !== 'undefined') {
      try {
        const activeDoc = getActiveDocumentCompat();
        if (!activeDoc) return false;
        const a = activeDoc.createElement('a');
        a.href = target;
        a.target = '_blank';
        a.click();
        return true;
      } catch {
        if (typeof window.open === 'function') {
          window.open(target, '_blank', 'noopener');
          return true;
        }
      }
    }
    return false;
  }

  getWechatSyncBridgeService() {
    const pluginSettings = getPluginSettings(this);
    const settings = normalizeMultiPlatformSyncSettings(pluginSettings['multiPlatformSync']);
    const cacheKey = `${settings.port}:${settings.token}:${settings.allowRemote ? 1 : 0}`;
    if (this._wechatSyncBridgeService && this._wechatSyncBridgeCacheKey === cacheKey) {
      return this._wechatSyncBridgeService;
    }

    if (this._wechatSyncBridgeService?.stop) {
      this._wechatSyncBridgeService.stop().catch((error) => {
        console.warn('停止旧浏览器插件连接失败:', error);
      });
    }

    this._wechatSyncBridgeCacheKey = cacheKey;
    this._wechatSyncBridgeService = createWechatSyncBridgeService({
      port: settings.port,
      token: settings.token,
      allowRemote: settings.allowRemote,
      serverVersion: this.manifest?.version || '',
      initialConnectedClients: settings.connectedClients || [],
      onClientRegistryChange: async (clients) => {
        const currentSettings = getPluginSettings(this);
        currentSettings['multiPlatformSync'] = normalizeMultiPlatformSyncSettings({
          ...toRecord(currentSettings['multiPlatformSync']),
          connectedClients: Array.isArray(clients) ? clients : [],
        });
        await this.saveSettings();
        refreshSettingTabCompat(/** @type {SettingTabCompatLike | null | undefined} */ ((/** @type {AppLike} */ (this.app)).setting?.activeTab));
      },
    });
    return this._wechatSyncBridgeService;
  }

  startWechatSyncBridgeInBackground(reason = 'manual') {
    const pluginSettings = getPluginSettings(this);
    const settings = normalizeMultiPlatformSyncSettings(pluginSettings['multiPlatformSync']);
    if (!settings.enabled) return;

    const bridge = this.getWechatSyncBridgeService();
    bridge.start()
      .then((status) => {
        console.info('[Wechatsync] bridge warm start', {
          reason,
          port: settings.port,
          status,
        });
      })
      .catch((error) => {
        const errorRecord = toRecord(error);
        const readableError = toReadableError(error);
        console.warn('[Wechatsync] bridge warm start failed', {
          reason,
          port: settings.port,
          code: errorRecord.code,
          message: readableError.message,
        });
      });
  }

  async loadSettings() {
    const { settings, didMigrate } = normalizeLoadedSettings(await this.loadData(), { generateId });
    setPluginSettings(this, settings);
    if (didMigrate) {
      await this.saveSettings();
    }
  }

  getArticleLayoutState(sourcePath = '', selection = {}) {
    return getArticleLayoutStateFromSettings(getPluginSettings(this), sourcePath, selection);
  }

  async saveArticleLayoutState(sourcePath = '', nextState = null, selection = {}) {
    const saved = saveArticleLayoutStateToSettings(getPluginSettings(this), sourcePath, nextState, selection);
    if (!saved) return false;
    return this.saveSettings();
  }

  async saveSettings() {
    try {
      await this.saveData(getPluginSettings(this));
      return true;
    } catch (error) {
      console.error('保存插件设置失败:', error);
      const now = Date.now();
      if (!this._lastSaveSettingsErrorAt || now - this._lastSaveSettingsErrorAt > 3000) {
        this._lastSaveSettingsErrorAt = now;
        new Notice('⚠️ 设置保存失败，本次修改仅在当前会话生效');
      }
      return false;
    }
  }

  async onunload() {
    if (this._wechatSyncBridgeService?.stop) {
      await this._wechatSyncBridgeService.stop().catch((error) => {
        console.warn('停止浏览器插件连接失败:', error);
      });
    }
    console.log('📝 Obsidian 发布助手已卸载');
  }
}

AppleStylePlugin.default = AppleStylePlugin;
AppleStylePlugin.AppleStylePlugin = AppleStylePlugin;
AppleStylePlugin.AppleStyleView = AppleStyleView;
AppleStylePlugin.WechatAPI = WechatAPI;
AppleStylePlugin.AppleStyleSettingTab = AppleStyleSettingTab;
AppleStylePlugin.createImageSwipeCalloutMarkdown = createImageSwipeCalloutMarkdown;
AppleStylePlugin.getImageSwipeCommandCopy = getImageSwipeCommandCopy;
AppleStylePlugin.stripMarkdownFrontmatter = stripMarkdownFrontmatter;
AppleStylePlugin.describeWechatsyncConnectionState = describeWechatsyncConnectionState;
AppleStylePlugin.renderWechatsyncConnectionStatusBar = renderWechatsyncConnectionStatusBar;
AppleStylePlugin.formatWechatsyncCheckedAt = formatWechatsyncCheckedAt;

export default AppleStylePlugin;
export {
  AppleStylePlugin,
  AppleStyleView,
  WechatAPI,
  AppleStyleSettingTab,
  createImageSwipeCalloutMarkdown,
  getImageSwipeCommandCopy,
  stripMarkdownFrontmatter,
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
  formatWechatsyncCheckedAt,
};
