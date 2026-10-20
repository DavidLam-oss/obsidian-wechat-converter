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
import { showCustomThemeModal } from './views/converter/custom-theme-modal.js';
import {
  getArticleLayoutStateFromSettings,
  saveArticleLayoutStateToSettings,
} from './services/ai-layout-cache.js';
import { normalizeLoadedSettings } from './services/plugin-settings.js';
import { normalizeCustomCssNotePath } from './services/custom-css-source.js';
import {
  createWechatSyncBridgeService,
  stripMarkdownFrontmatter,
  normalizeMultiPlatformSyncSettings,
  applyClientRegistryToMultiPlatformSettings,
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
} from './views/apple-style-view-shared.js';
import { drainCaptureQueue } from './services/card-render-capture.js';
import { normalizeVaultPath } from './services/path-utils.js';
import { checkCredentialDowngrade, isRecord, canonicalJsonEqual } from './services/settings-guard.js';

const CUSTOM_CSS_PREVIEW_REFRESH_DELAY_MS = 650;

/**
 * 📝 Obsidian 发布助手主插件
 */
class AppleStylePlugin extends Plugin {
  /* eslint-disable @typescript-eslint/no-unsafe-argument -- reason: constructor forwards dynamic Obsidian app and manifest arguments to base Plugin */
  constructor(app, manifest) {
    super(app, manifest);
    /** @type {ObsidianApiLike} */
    this.obsidianApi = obsidianApi;
    /** @type {number} */
    this._customCssPreviewNoticeTimer = 0;
    this._saveQueue = Promise.resolve();
    this._storageState = 'unknown';
    this._settingsSafeMode = false;
    this._committedSettings = null;
    this._lastSaveSettingsErrorAt = 0;
  }
  /* eslint-enable @typescript-eslint/no-unsafe-argument -- reason: close the scoped disable block above */

  async onload() {
    console.debug('📝 正在加载 Obsidian 发布助手...');

    await this.loadSettings();

    // 热重载兼容：清除上次加载缓存在 window 上的运行时类。
    // 否则「重载插件」会复用旧 AppleTheme/AppleStyleConverter 类，
    // 导致本次构建的主题改动（如间距微调）不生效——预览拖滑块无变化。
    if (typeof window !== 'undefined') {
      delete window.AppleTheme;
      delete window.AppleStyleConverter;
    }

    this.registerView(APPLE_STYLE_VIEW, (leaf) => new AppleStyleView(leaf, this));

    this.addRibbonIcon('wand', APPLE_STYLE_VIEW_TITLE, () => this.openConverter());

    this.addCommand({
      id: 'open-apple-converter',
      name: `打开${APPLE_STYLE_VIEW_TITLE}`,
      callback: () => this.openConverter(),
    });

    this.addCommand({
      id: 'insert-image-swipe-block',
      name: getImageSwipeCommandCopy(this.app, 'image-swipe').name,
      callback: () => this.insertImageSwipeCalloutFromActiveEditor('image-swipe'),
    });

    this.addCommand({
      id: 'insert-image-sensitive-block',
      name: getImageSwipeCommandCopy(this.app, 'image-sensitive').name,
      callback: () => this.insertImageSwipeCalloutFromActiveEditor('image-sensitive'),
    });

    this.addCommand({
      id: 'open-custom-theme-modal',
      name: '自定义排版主题管理',
      callback: () => {
        showCustomThemeModal({
          app: this.app,
          plugin: this,
          onThemeApplied: () => {
            const view = /** @type {{ convertCurrent?: (force?: boolean) => Promise<unknown> } | null} */ (this.getConverterView());
            view?.convertCurrent?.(true);
          },
        });
      },
    });

    this.addSettingTab(new AppleStyleSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.migrateLegacyConverterLeafTitles().catch((error) => console.warn('同步转换器标题失败:', error));
    });

    if (typeof this.app.vault.on === 'function') {
      this.registerEvent(
        this.app.vault.on('rename', (file, oldPath) => {
          const pluginSettings = /** @type {PluginSettingsLike} */ (getPluginSettings(this));
          if (pluginSettings.feishuSync) {
            const changed = updateFeishuHistoryPath(pluginSettings.feishuSync, oldPath, file.path);
            if (changed) {
              this.saveSettings().catch((err) => {
                console.error('保存重命名设置失败:', err);
              });
            }
          }
          this.handleCustomCssNoteModified({ path: oldPath });
          this.handleCustomCssNoteModified(file);
        })
      );
      this.registerEvent(
        this.app.vault.on('modify', (file) => {
          this.handleCustomCssNoteModified(file);
        })
      );
      this.registerEvent(
        this.app.vault.on('create', (file) => {
          this.handleCustomCssNoteModified(file);
        })
      );
      this.registerEvent(
        this.app.vault.on('delete', (file) => {
          this.handleCustomCssNoteModified(file);
        })
      );
    }

    this.startWechatSyncBridgeInBackground('plugin-load');

    console.debug('✅ Obsidian 发布助手加载完成');
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

  /**
   * 合并连续 CSS 变化，只重新派生普通预览，不重新解析 Markdown。
   * @returns {boolean} 是否已安排刷新
   */
  scheduleCustomCssPreviewNotice() {
    if (!this.getConverterView() || typeof window === 'undefined') return false;

    if (this._customCssPreviewNoticeTimer) {
      window.clearTimeout(this._customCssPreviewNoticeTimer);
    }
    this._customCssPreviewNoticeTimer = window.setTimeout(() => {
      this._customCssPreviewNoticeTimer = 0;
      const view = /** @type {{ refreshCustomCssPreview?: () => Promise<boolean> } | null} */ (
        this.getConverterView()
      );
      if (typeof view?.refreshCustomCssPreview === 'function') {
        const refreshPromise = view.refreshCustomCssPreview();
        refreshPromise.catch((error) => {
          console.warn('刷新自定义 CSS 预览失败:', error);
        });
      }
    }, CUSTOM_CSS_PREVIEW_REFRESH_DELAY_MS);
    return true;
  }

  /**
   * @param {{ path?: string } | null | undefined} file
   * @returns {boolean} Whether the modified file matched the configured CSS note
   */
  handleCustomCssNoteModified(file) {
    const configuredPath = normalizeCustomCssNotePath(getPluginSettings(this).customCssNote || '');
    const filePath = normalizeCustomCssNotePath(file?.path || '');
    const configuredCandidates = configuredPath.toLowerCase().endsWith('.md')
      ? [configuredPath]
      : [configuredPath, `${configuredPath}.md`];
    if (!configuredPath || !configuredCandidates.includes(filePath)) return false;
    this.scheduleCustomCssPreviewNotice();
    return true;
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

  /**
   * @template T
   * @param {string} label
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  _queueWechatSyncBridgeLifecycle(label, operation) {
    const previous = /** @type {Promise<unknown>} */ (
      this._wechatSyncBridgeLifecycle || Promise.resolve()
    );
    const queued = previous.catch(() => undefined).then(() => operation());
    this._wechatSyncBridgeLifecycle = queued.catch((error) => {
      console.warn(`[Wechatsync] bridge ${label} failed:`, error);
    });
    return queued;
  }

  getWechatSyncBridgeService() {
    const pluginSettings = getPluginSettings(this);
    const settings = normalizeMultiPlatformSyncSettings(pluginSettings['multiPlatformSync']);
    const cacheKey = `${settings.port}:${settings.token}:${settings.allowRemote ? 1 : 0}`;
    if (this._wechatSyncBridgeService && this._wechatSyncBridgeCacheKey === cacheKey) {
      return this._wechatSyncBridgeService;
    }

    if (this._wechatSyncBridgeService?.stop) {
      void this._wechatSyncBridgeService.stop().catch((error) => {
        console.warn('停止旧浏览器插件连接失败:', error);
      });
    }

    this._wechatSyncBridgeCacheKey = cacheKey;
    const bridge = createWechatSyncBridgeService({
        port: settings.port,
        token: settings.token,
        allowRemote: settings.allowRemote,
        serverVersion: this.manifest?.version || '',
        initialConnectedClients: settings.connectedClients || [],
        initialPairedClients: settings.pairedClients || [],
        initialPendingClients: settings.pendingClients || [],
        onClientRegistryChange: async (clients) => {
          const currentSettings = getPluginSettings(this);
          // A live hello also promotes connection.status to 'connected' so
          // platform badges / publish modal recover after a plugin reload
          // without requiring a manual 「测试连接」 (see service JSDoc).
          currentSettings['multiPlatformSync'] = applyClientRegistryToMultiPlatformSettings(
            toRecord(currentSettings['multiPlatformSync']),
            Array.isArray(clients) ? clients : []
          );
          await this.saveSettings();
          refreshSettingTabCompat(/** @type {SettingTabCompatLike | null | undefined} */ ((/** @type {AppLike} */ (this.app)).setting?.activeTab));
        },
        onPairingRegistryChange: async (registry) => {
          const currentSettings = getPluginSettings(this);
          currentSettings['multiPlatformSync'] = normalizeMultiPlatformSyncSettings({
            ...toRecord(currentSettings['multiPlatformSync']),
            pairedClients: Array.isArray(registry?.pairedClients) ? registry.pairedClients : [],
            pendingClients: Array.isArray(registry?.pendingClients) ? registry.pendingClients : [],
          });
          await this.saveSettings();
          refreshSettingTabCompat(/** @type {SettingTabCompatLike | null | undefined} */ ((/** @type {AppLike} */ (this.app)).setting?.activeTab));
        },
    });
    /** @type {{ start: () => Promise<unknown>, stop: () => Promise<unknown> }} */
    const lifecycleBridge = bridge;
    const startBridge = lifecycleBridge.start;
    const stopBridge = lifecycleBridge.stop;
    lifecycleBridge.start = () => this._queueWechatSyncBridgeLifecycle('start', startBridge);
    lifecycleBridge.stop = () => this._queueWechatSyncBridgeLifecycle('stop', stopBridge);
    this._wechatSyncBridgeService = bridge;
    return this._wechatSyncBridgeService;
  }

  startWechatSyncBridgeInBackground(reason = 'manual') {
    const pluginSettings = getPluginSettings(this);
    const settings = normalizeMultiPlatformSyncSettings(pluginSettings['multiPlatformSync']);
    if (!settings.enabled) return;

    const bridge = this.getWechatSyncBridgeService();
    bridge.start()
      .then((status) => {
        console.debug('[Wechatsync] bridge warm start', {
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

  getPluginDataPath() {
    let raw = '';
    if (this.manifest?.dir && typeof this.manifest.dir === 'string') {
      raw = `${this.manifest.dir}/data.json`;
    } else {
      const configDir = this.app?.vault?.configDir;
      const pluginId = this.manifest?.id || 'obsidian-wechat-converter';
      if (configDir && typeof configDir === 'string') {
        raw = `${configDir}/plugins/${pluginId}/data.json`;
      }
    }
    return raw ? normalizeVaultPath(raw) : null;
  }

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- reason: loadSettings handles raw disk JSON and dynamic Obsidian adapter without TypeScript types */
  async loadSettings() {
    const adapter = this.app?.vault?.adapter;
    const dataPath = this.getPluginDataPath();

    if (!adapter || !dataPath) {
      this._storageState = 'unknown';
      this._settingsSafeMode = true;
      let rawFallback = null;
      try {
        rawFallback = await this.loadData();
      } catch (err) {
        console.error('[Settings] loadData 读取抛错:', err);
      }
      const { settings } = normalizeLoadedSettings(isRecord(rawFallback) ? rawFallback : null, { isVirginInstall: false });
      this._committedSettings = JSON.parse(JSON.stringify(settings));
      setPluginSettings(this, settings);
      new Notice('微信发布助手：存储适配器不可用，已进入安全保护模式');
      return;
    }

    let loadedRaw = null;
    try {
      loadedRaw = await this.loadData();
    } catch (err) {
      console.error('[Settings] loadData 读取抛错:', err);
    }

    let exists = null;
    try {
      if (typeof adapter.exists === 'function') {
        const res = await adapter.exists(dataPath);
        if (typeof res === 'boolean') {
          exists = res;
        }
      }
    } catch {
      exists = null;
    }

    // 纯净首装确认：仅在 adapter 严格确认文件不存在且读出空时进入
    if (exists === false && (loadedRaw === null || (isRecord(loadedRaw) && Object.keys(loadedRaw).length === 0))) {
      this._storageState = 'virgin';
      const { settings } = normalizeLoadedSettings(null, { isVirginInstall: true });
      this._committedSettings = JSON.parse(JSON.stringify(settings));
      setPluginSettings(this, settings);
      return; // 0 次写盘 Clean Load
    }

    // 存量正常状态 (分离 rawDiskBaseline 与 migrationDraft)
    if (exists === true && isRecord(loadedRaw) && Object.keys(loadedRaw).length > 0) {
      this._storageState = 'known-existing';
      const rawDiskBaseline = JSON.parse(JSON.stringify(loadedRaw));
      const { settings: migratedSettings, didMigrate } = normalizeLoadedSettings(loadedRaw, { isVirginInstall: false });

      // 重置内存中的运行态连接状态
      const bridgeSettings = normalizeMultiPlatformSyncSettings(migratedSettings.multiPlatformSync);
      const stableCapabilities = { ...(bridgeSettings.connection.capabilities || {}) };
      delete stableCapabilities.proLicensed;
      migratedSettings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
        ...bridgeSettings,
        connectedClients: bridgeSettings.connectedClients.map((client) => ({
          ...client,
          status: 'disconnected',
        })),
        connection: {
          ...bridgeSettings.connection,
          status: 'untested',
          capabilities: stableCapabilities,
        },
      });

      if (didMigrate) {
        this._committedSettings = JSON.parse(JSON.stringify(rawDiskBaseline));
        setPluginSettings(this, migratedSettings);
        const res = await this.saveSettings(migratedSettings, { isMigration: true });
        if (!res || !res.success) {
          console.error('[Settings] 存量迁移写盘失败，回滚内存并锁定安全模式');
          const fallback = JSON.parse(JSON.stringify(rawDiskBaseline));
          this._committedSettings = fallback;
          setPluginSettings(this, fallback);
          this._settingsSafeMode = true;
        }
      } else {
        this._committedSettings = JSON.parse(JSON.stringify(migratedSettings));
        setPluginSettings(this, migratedSettings);
      }
      return;
    }

    // 其它所有异常场景一律 Fail-Closed
    this._storageState = exists === true ? 'known-existing' : 'unknown';
    this._settingsSafeMode = true;
    const { settings } = normalizeLoadedSettings(isRecord(loadedRaw) ? loadedRaw : null, { isVirginInstall: false });
    this._committedSettings = JSON.parse(JSON.stringify(settings));
    setPluginSettings(this, settings);
    new Notice('微信发布助手：检测到配置文件读取异常，已进入安全保护模式，原文件已受保护');
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- reason: close the scoped disable block above */

  getArticleLayoutState(sourcePath = '', selection = {}) {
    return getArticleLayoutStateFromSettings(getPluginSettings(this), sourcePath, selection);
  }

  async saveArticleLayoutState(sourcePath = '', nextState = null, selection = {}) {
    const saved = saveArticleLayoutStateToSettings(getPluginSettings(this), sourcePath, nextState, selection);
    if (!saved) return false;
    const res = await this.saveSettings();
    return Boolean(res && res.success !== false);
  }

  async saveSettings(draftSettings = null, options = {}) {
    const next = (this._saveQueue || Promise.resolve()).then(async () => {
      return await this._executeSaveSettings(draftSettings, options);
    });
    this._saveQueue = next.catch(() => {});
    return await next;
  }

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: dynamic configuration mutations, credential guards, and serialization safely handle raw settings objects */
  async _executeSaveSettings(draftSettings, options) {
    const candidate = JSON.parse(JSON.stringify(draftSettings || getPluginSettings(this)));

    if (this._settingsSafeMode && !options.isSafeModeOverride) {
      new Notice('当前处于安全保护模式，已阻止写入以防历史配置受损');
      if (this._committedSettings) {
        setPluginSettings(this, JSON.parse(JSON.stringify(this._committedSettings)));
      }
      return { success: false, reason: 'SAFE_MODE_LOCKED' };
    }

    const adapter = this.app?.vault?.adapter;
    const dataPath = this.getPluginDataPath();

    if (!adapter || !dataPath || (this._storageState === 'unknown' && !options.isSafeModeOverride)) {
      new Notice('存储状态未知，已阻止保存以防覆盖数据');
      if (this._committedSettings) {
        setPluginSettings(this, JSON.parse(JSON.stringify(this._committedSettings)));
      }
      return { success: false, reason: 'STORAGE_UNKNOWN' };
    }

    // 存量配置必须通过磁盘预检
    let diskSettings = null;
    if (this._storageState === 'known-existing' && !options.isSafeModeOverride) {
      try {
        if (typeof adapter.exists === 'function' && (await adapter.exists(dataPath)) === true) {
          const parsed = JSON.parse(await adapter.read(dataPath));
          if (!isRecord(parsed) || Object.keys(parsed).length === 0) {
            throw new Error('磁盘文件内容为空或非有效配置对象');
          }
          diskSettings = parsed;
        } else {
          throw new Error('文件不存在或状态冲突');
        }
      } catch (err) {
        console.error('[Settings] 保存预检失败:', err);
        new Notice('磁盘文件无法读取或损坏，已拦截保存以防旧配置被覆盖');
        if (this._committedSettings) {
          setPluginSettings(this, JSON.parse(JSON.stringify(this._committedSettings)));
        }
        return { success: false, reason: 'PRE_CHECK_FAILED' };
      }
    }

    // 敏感凭据防清空检查
    if (diskSettings) {
      const downgrade = checkCredentialDowngrade(diskSettings, candidate, options.intent);
      if (downgrade.isDowngrade) {
        new Notice(`已阻止保存：${downgrade.reason}`);
        if (this._committedSettings) {
          setPluginSettings(this, JSON.parse(JSON.stringify(this._committedSettings)));
        }
        return { success: false, reason: 'CREDENTIAL_DOWNGRADE' };
      }

      // 受控快照：仅在内容发生实质结构变更时写入 .bak (ADR-5)
      if (!canonicalJsonEqual(diskSettings, candidate)) {
        const bakPath = `${dataPath}.bak`;
        try {
          if (typeof adapter.write === 'function') {
            const diskRaw = JSON.stringify(diskSettings, null, 2);
            await adapter.write(bakPath, diskRaw);
          }
        } catch (bakErr) {
          // ADR-5: 快照写入异常仅 Warn 记录，Fail-Safe 不阻断正本提交
          console.warn('[Settings] 写入 .bak 快照失败 (Fail-Safe 允许继续写入正本):', bakErr);
        }
      }
    }

    try {
      await this.saveData(candidate);
      if (this._storageState === 'virgin' || options.isSafeModeOverride) {
        this._storageState = 'known-existing';
        this._settingsSafeMode = false;
      }
      this._committedSettings = JSON.parse(JSON.stringify(candidate));
      setPluginSettings(this, candidate);
      return { success: true };
    } catch (err) {
      console.error('保存插件设置失败:', err);
      if (this._committedSettings) {
        setPluginSettings(this, JSON.parse(JSON.stringify(this._committedSettings)));
      }
      const now = Date.now();
      if (!this._lastSaveSettingsErrorAt || now - this._lastSaveSettingsErrorAt > 3000) {
        this._lastSaveSettingsErrorAt = now;
        new Notice('设置保存失败，本次修改仅在当前会话生效');
      }
      return { success: false, reason: 'SAVE_FAILED' };
    }
  }

  async deleteAiProvider(providerId) {
    const draft = JSON.parse(JSON.stringify(getPluginSettings(this)));
    if (draft.ai?.providers) {
      draft.ai.providers = draft.ai.providers.filter((p) => p.id !== providerId);
      if (draft.ai.defaultProviderId === providerId) draft.ai.defaultProviderId = draft.ai.providers[0]?.id || '';
      if (draft.ai.defaultImageProviderId === providerId) draft.ai.defaultImageProviderId = draft.ai.providers.find((p) => p.supportsImage)?.id || '';
    }
    return await this.saveSettings(draft, { intent: { action: 'delete_ai_provider', entityType: 'ai_provider', targetId: providerId } });
  }

  async deleteWechatAccount(accountId) {
    const draft = JSON.parse(JSON.stringify(getPluginSettings(this)));
    if (Array.isArray(draft.wechatAccounts)) {
      draft.wechatAccounts = draft.wechatAccounts.filter((a) => a.id !== accountId);
      if (draft.defaultAccountId === accountId) draft.defaultAccountId = draft.wechatAccounts[0]?.id || '';
    }
    return await this.saveSettings(draft, { intent: { action: 'delete_wechat_account', entityType: 'wechat_account', targetId: accountId } });
  }

  async clearCredential(entityType, targetId, fieldPath) {
    const draft = JSON.parse(JSON.stringify(getPluginSettings(this)));
    if (entityType === 'ai_provider') {
      const p = draft.ai?.providers?.find((item) => item.id === targetId);
      if (p && fieldPath === 'apiKey') p.apiKey = '';
    } else if (entityType === 'wechat_account') {
      const acc = draft.wechatAccounts?.find((item) => item.id === targetId);
      if (acc && fieldPath === 'appSecret') acc.appSecret = '';
    } else if (entityType === 'feishu' && fieldPath === 'appSecret') {
      if (draft.feishuSync) draft.feishuSync.appSecret = '';
    } else if (entityType === 'bridge' && fieldPath === 'token') {
      if (draft.multiPlatformSync) draft.multiPlatformSync.token = '';
    }
    return await this.saveSettings(draft, { intent: { action: 'clear_credential', entityType, targetId, fieldPath } });
  }

  async restoreFromBackup() {
    const adapter = this.app?.vault?.adapter;
    const dataPath = this.getPluginDataPath();
    if (!adapter || !dataPath) {
      new Notice('存储适配器不可用，无法恢复备份');
      return { success: false, reason: 'STORAGE_UNAVAILABLE' };
    }
    const bakPath = `${dataPath}.bak`;
    try {
      if (typeof adapter.exists !== 'function' || !(await adapter.exists(bakPath))) {
        new Notice('未找到配置备份文件 (.bak)');
        return { success: false, reason: 'BACKUP_NOT_FOUND' };
      }
      const backupJson = JSON.parse(await adapter.read(bakPath));
      if (!isRecord(backupJson) || Object.keys(backupJson).length === 0) {
        new Notice('备份文件内容损坏或为空，无法恢复');
        return { success: false, reason: 'BACKUP_CORRUPTED' };
      }
      const saveRes = await this.saveSettings(backupJson, { isSafeModeOverride: true });
      if (saveRes?.success) {
        new Notice('已成功从备份文件恢复配置并解除保护模式！');
        return { success: true };
      }
      return { success: false, reason: saveRes?.reason || 'RESTORE_SAVE_FAILED' };
    } catch (err) {
      console.error('[Settings] 从备份恢复配置失败:', err);
      new Notice('恢复备份失败：' + (err instanceof Error ? err.message : String(err)));
      return { success: false, reason: 'RESTORE_ERROR' };
    }
  }

  async onExternalSettingsChange() {
    console.debug('[Settings] 检测到外部同步修改 (Obsidian Sync / 云端同步)，重新载入配置...');
    await this.loadSettings();
    const view = this.getConverterView?.();
    if (view && typeof view.requestRender === 'function') {
      view.requestRender();
    }
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: close the scoped disable block above */

  async onunload() {
    if (this._customCssPreviewNoticeTimer && typeof window !== 'undefined') {
      window.clearTimeout(this._customCssPreviewNoticeTimer);
      this._customCssPreviewNoticeTimer = 0;
    }
    if (this._wechatSyncBridgeService?.stop) {
      await this._wechatSyncBridgeService.stop().catch((error) => {
        console.warn('停止浏览器插件连接失败:', error);
      });
    }
    // 释放卡片捕获排队与视图生命周期资源（§5.4「关闭视图/卸载插件时取消未完成工作」）
    drainCaptureQueue('plugin-unloaded');
    try {
      const leaves = this.app?.workspace?.getLeavesOfType?.(APPLE_STYLE_VIEW) || [];
      /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- 视图动态解构与卡片资源释放 */
      for (const leaf of leaves) {
        const view = /** @type {any} */ (leaf?.view);
        if (view && typeof view.disposeCardPreview === 'function') {
          view.disposeCardPreview();
        }
        if (view && typeof view.disposeCardExportModal === 'function') {
          view.disposeCardExportModal();
        }
      }
      /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- reason: close the scoped disable block above */
    } catch {
      // 容错：工作区可能正在卸载或已清理
    }
    console.debug('📝 Obsidian 发布助手已卸载');
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
