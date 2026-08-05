/*
## 核心功能

实现插件设置页中的 wechat tab 配置界面能力。

## 输入

接收插件设置、SettingTab 生命周期、用户表单输入和账号/平台配置状态。

## 输出

输出 `wechatSettingsMethods`，用于渲染设置项、保存配置或打开辅助 modal。

## 定位

位于 views/settings/，负责设置 UI 层；设置归一化交给 services/plugin-settings.js。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/settings 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  Setting,
  Notice,
  getActiveDocumentCompat,
  refreshSettingTabCompat,
  setDestructiveButtonCompat,
  MAX_ACCOUNTS,
  WechatAPI,
  toReadableError,
} from '../apple-style-view-shared.js';
import { resolveCustomCssSource } from '../../services/custom-css-source.js';
import { compileCustomCss } from '../../services/custom-css-compiler.js';

const WECHAT_ACCOUNT_SETUP_GUIDE_URL =
  'https://xiaoweibox.top/obsidian-publisher/guide#wechat-api';
const CUSTOM_CSS_GUIDE_URL =
  'https://xiaoweibox.top/obsidian-publisher/guide/custom-css';

/**
 * Obsidian 1.13.4 may stringify a DocumentFragment passed to Setting.setDesc()
 * as "[object DocumentFragment]". Build rich descriptions directly inside the
 * public descEl instead, while keeping a plain-text fallback for older mocks or
 * incomplete runtimes.
 *
 * @param {{ descEl?: HTMLElement, setDesc: (description: string) => unknown }} setting
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
    setting.setDesc(fallbackText);
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
 * @param {AppleStylePluginLike} plugin
 * @returns {Promise<string>}
 */
async function describeCustomCssStatus(plugin) {
  const source = await resolveCustomCssSource(plugin);
  const sourceFatal = source.diagnostics.find((item) => item.severity === 'fatal');
  const compiled = sourceFatal
    ? null
    : compileCustomCss(source.cssText, { sourceIdentity: source.identity });
  const fatal = sourceFatal || compiled?.diagnostics.find((item) => item.severity === 'fatal');
  const converterView = /** @type {{ customCssStatus?: AppleStyleViewContract['customCssStatus'] } | null} */ (
    plugin.getConverterView?.() || null
  );
  const viewStatus = converterView?.customCssStatus;

  if (fatal) {
    const location = fatal.line ? `第 ${fatal.line} 行附近` : '当前 CSS';
    const fallback = viewStatus?.usingLastValid ? '，当前继续使用上一次有效样式' : '，当前继续使用基础主题';
    return `${location}存在语法问题${fallback}`;
  }

  const sourceWarning = source.diagnostics.find((item) => item.severity === 'warning');
  if (sourceWarning) return sourceWarning.message;
  if (!source.cssText.trim()) return '尚未填写 CSS';
  if (viewStatus?.state === 'ai-skipped') return '当前为 AI 编排，自定义 CSS 不会应用';

  const sourceLabel = source.kind === 'note'
    ? `当前使用 ${source.path}`
    : '当前使用设置中的 CSS';
  if (viewStatus?.sourceIdentity === source.identity && viewStatus.state === 'unmatched') {
    return `${sourceLabel}；CSS 有效，但当前文章没有匹配到对应内容`;
  }

  const blockedCount = compiled?.diagnostics.filter((item) => item.severity === 'blocked').length || 0;
  if (blockedCount > 0) return `${sourceLabel}；已忽略 ${blockedCount} 项不支持或不安全的规则`;
  return `${sourceLabel}，预览会自动更新`;
}

/** @type {WechatSettingsMethodsContract & ThisType<AppleStyleSettingTabContract>} */
const wechatSettingsMethods = {
  /**
   * @param {ObsidianElementLike} containerEl
   */
  renderWechatSettingsTab(containerEl) {
    this.renderSettingsTabIntro(
      containerEl,
      '配置公众号账号、封面摘要和微信预览相关选项。'
    );

    // 预览模式设置
    new Setting(containerEl)
      .setName('预览模式')
      .setHeading();

    new Setting(containerEl)
      .setName('使用手机仿真框')
      .setDesc('开启后，预览区域将显示为 iPhone X 手机框样式；关闭则恢复为经典全宽预览模式（需重启插件面板生效）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.usePhoneFrame)
        .onChange(async (value) => {
          this.plugin.settings.usePhoneFrame = value;
          await this.plugin.saveSettings();
          new Notice('设置已保存，请关闭并重新打开发布助手面板以生效');
        }));

    // 图片水印设置
    new Setting(containerEl)
      .setName('图片水印')
      .setHeading();

    new Setting(containerEl)
      .setName('启用图片水印')
      .setDesc('在每张图片上方显示头像（需重启插件面板生效）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableWatermark)
        .onChange(async (value) => {
          this.plugin.settings.enableWatermark = value;
          await this.plugin.saveSettings();
          new Notice('设置已保存，请关闭并重新打开发布助手面板以生效');
        }));

    // 本地头像上传
    const uploadSetting = new Setting(containerEl)
      .setName('上传本地头像')
      .setDesc(this.plugin.settings.avatarBase64 ? '✅ 已上传本地头像（优先使用）' : '选择本地图片，转换为 Base64 存储，无需网络请求');

    uploadSetting.addButton(button => button
      .setButtonText(this.plugin.settings.avatarBase64 ? '重新上传' : '选择图片')
      .onClick(() => {
        const activeDocument = getActiveDocumentCompat();
        if (!activeDocument) return;
        const input = activeDocument.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const target = e.target instanceof HTMLInputElement ? e.target : null;
          const file = target?.files?.[0] || null;
          if (!file) return;

          if (file.size > 100 * 1024) {
            new Notice('❌ 图片太大，请选择小于 100KB 的图片');
            return;
          }

          const reader = new FileReader();
          reader.onload = async (event) => {
            const result = event.target?.result;
            this.plugin.settings.avatarBase64 = typeof result === 'string' ? result : '';
            await this.plugin.saveSettings();
            new Notice('✅ 头像已上传');
            refreshSettingTabCompat(this);
          };
          reader.readAsDataURL(file);
        };
        input.click();
      }));

    if (this.plugin.settings.avatarBase64) {
      uploadSetting.addButton((button) => {
        const clearButton = setDestructiveButtonCompat(button.setButtonText('清除'));
        clearButton.onClick(async () => {
            this.plugin.settings.avatarBase64 = '';
            await this.plugin.saveSettings();
            new Notice('已清除本地头像');
            refreshSettingTabCompat(this);
          });
      });
    }

    new Setting(containerEl)
      .setName('头像 URL（备用）')
      .setDesc('如未上传本地头像，将使用此 URL')
      .addText(text => text
        .setPlaceholder('https://example.com/avatar.jpg')
        .setValue(this.plugin.settings.avatarUrl)
        .onChange(async (value) => {
          this.plugin.settings.avatarUrl = value;
          await this.plugin.saveSettings();
        }));

    const accountHeadingSetting = new Setting(containerEl)
      .setName('微信公众号账号');
    setMutedGuideDescription(
      accountHeadingSetting,
      containerEl.ownerDocument || getActiveDocumentCompat(),
      '添加用于同步草稿的公众号 AppID 和 AppSecret。首次配置请先完成 IP 白名单设置。',
      '查看图文指南 →',
      WECHAT_ACCOUNT_SETUP_GUIDE_URL,
      () => {
        this.plugin.openExternalUrl(WECHAT_ACCOUNT_SETUP_GUIDE_URL);
      }
    );
    accountHeadingSetting.setHeading();

    // 账号列表
    const accounts = this.plugin.settings.wechatAccounts || [];
    const defaultId = this.plugin.settings.defaultAccountId;

    if (accounts.length === 0) {
      containerEl.createEl('p', {
        text: '暂无账号，请点击下方按钮添加',
        cls: 'setting-item-description',
        attr: { style: 'color: var(--text-muted); font-style: italic;' }
      });
    } else {
      const listContainer = containerEl.createDiv({ cls: 'wechat-account-list' });

      for (const account of accounts) {
        const isDefault = account.id === defaultId;
        const card = listContainer.createDiv({ cls: 'wechat-account-card' });

        // 账号信息
        const info = card.createDiv({ cls: 'wechat-account-info' });
        const nameRow = info.createDiv({ cls: 'wechat-account-name-row' });
        nameRow.createSpan({ text: account.name, cls: 'wechat-account-name' });
        if (isDefault) {
          nameRow.createSpan({ text: '默认', cls: 'wechat-account-badge' });
        }
        info.createDiv({
          text: `AppID: ${account.appId.substring(0, 8)}...`,
          cls: 'wechat-account-appid'
        });

        // 操作按钮
        const actions = card.createDiv({ cls: 'wechat-account-actions' });

        if (!isDefault) {
          const defaultBtn = actions.createEl('button', { text: '设为默认', cls: 'wechat-btn-small' });
          defaultBtn.onclick = async () => {
            this.plugin.settings.defaultAccountId = account.id;
            await this.plugin.saveSettings();
            refreshSettingTabCompat(this);
          };
        }

        const editBtn = actions.createEl('button', { text: '编辑', cls: 'wechat-btn-small' });
        editBtn.onclick = () => this.showEditAccountModal(account);

        const testBtn = actions.createEl('button', { text: '测试', cls: 'wechat-btn-small wechat-btn-test' });
        testBtn.onclick = async () => {
          testBtn.disabled = true;
          testBtn.textContent = '测试中...';
          try {
            const api = new WechatAPI(account.appId, account.appSecret, this.plugin.settings.proxyUrl, this.plugin.settings.clientId);
            await api.getAccessToken();
            new Notice(`✅ ${account.name} 连接成功！`);
          } catch (err) {
            new Notice(`❌ ${account.name} 连接失败: ${toReadableError(err).message}`);
          }
          testBtn.disabled = false;
          testBtn.textContent = '测试';
        };

        const deleteBtn = actions.createEl('button', { text: '删除', cls: 'wechat-btn-small wechat-btn-danger' });
        deleteBtn.onclick = async () => {
          const confirmed = await this.confirmDestructiveAction({
            title: '删除公众号账号',
            message: `确定要删除账号 "${account.name}" 吗？`,
            confirmText: '删除',
          });
          if (!confirmed) return;
          this.plugin.settings.wechatAccounts = accounts.filter(a => a.id !== account.id);
          // 如果删除的是默认账号，自动选择第一个
          if (account.id === defaultId && this.plugin.settings.wechatAccounts.length > 0) {
            this.plugin.settings.defaultAccountId = this.plugin.settings.wechatAccounts[0].id;
          } else if (this.plugin.settings.wechatAccounts.length === 0) {
            this.plugin.settings.defaultAccountId = '';
          }
          await this.plugin.saveSettings();
          refreshSettingTabCompat(this);
        };
      }
    }

    // 添加账号按钮
    const addBtnContainer = containerEl.createDiv({ cls: 'wechat-add-account-container' });
    if (accounts.length < MAX_ACCOUNTS) {
      const addBtn = addBtnContainer.createEl('button', {
        text: '+ 添加账号',
        cls: 'wechat-btn-add'
      });
      addBtn.onclick = () => this.showEditAccountModal(null);
    } else {
      addBtnContainer.createEl('p', {
        text: `已达到最大账号数量 (${MAX_ACCOUNTS})`,
        cls: 'setting-item-description',
        attr: { style: 'color: var(--text-muted);' }
      });
    }

    this.renderAiSettingsSection(containerEl);

    // 高级设置
    new Setting(containerEl)
      .setName('高级设置')
      .setHeading();

    new Setting(containerEl)
      .setName('发送成功后自动清理资源')
      .setDesc('默认关闭。开启后会在创建草稿成功后，删除你在下方配置的目录。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.cleanupAfterSync)
        .onChange(async (value) => {
          this.plugin.settings.cleanupAfterSync = value;
          await this.plugin.saveSettings();
        }));

    let hasWarnedAbsoluteCleanupPath = false;
    new Setting(containerEl)
      .setName('清理目录')
      .setDesc('填写 vault 内相对路径（不要填 /Users/... 这类绝对路径），支持 {{note}} 占位符，例如 published/{{note}}_img。')
      .addText(text => text
        .setPlaceholder('published/{{note}}_img')
        .setValue(this.plugin.settings.cleanupDirTemplate || '')
        .onChange(async (value) => {
          if (this.isAbsolutePathLike(value)) {
            if (!hasWarnedAbsoluteCleanupPath) {
              new Notice('⚠️ 清理目录请填写 vault 内相对路径，不要使用绝对路径（如 /Users/... 或 C:\\...）');
              hasWarnedAbsoluteCleanupPath = true;
            }
          } else {
            hasWarnedAbsoluteCleanupPath = false;
          }

          const normalized = this.normalizeVaultPath(value);
          this.plugin.settings.cleanupDirTemplate = normalized;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('使用系统回收站')
      .setDesc('开启时优先移动到系统回收站；关闭时直接从 vault 删除。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.cleanupUseSystemTrash !== false)
        .onChange(async (value) => {
          this.plugin.settings.cleanupUseSystemTrash = value;
          await this.plugin.saveSettings();
        }));

    let hasWarnedInsecureProxy = false;
    new Setting(containerEl)
      .setName('API 代理地址')
      .setDesc('如果您的网络 IP 经常变化（如多地办公或使用移动热点），可配置代理服务以解决微信 IP 白名单漂移导致的同步失败问题。')
      .addText(text => {
        text
          .setPlaceholder('https://your-proxy.workers.dev')
          .setValue(this.plugin.settings.proxyUrl || '')
          .onChange(async (value) => {
            const trimmedValue = value.trim();
            if (trimmedValue && !trimmedValue.toLowerCase().startsWith('https://')) {
              if (!hasWarnedInsecureProxy) {
                new Notice('⚠️ 安全风险：代理地址必须使用 HTTPS 以保护您的 AppSecret。');
                hasWarnedInsecureProxy = true;
              }
            } else {
              hasWarnedInsecureProxy = false;
            }
            this.plugin.settings.proxyUrl = trimmedValue;
            await this.plugin.saveSettings();
          });
        // 拓宽输入框宽度以完美容纳带 Token 的长 URL，并作安全判定兼容 Mock 环境
        if (text.inputEl && typeof text.inputEl.setAttribute === 'function') {
          text.inputEl.setCssStyles?.({ width: '320px', maxWidth: '100%' });
        }
      });

    // 独立于 Setting 结构之外的说明卡片，自动独占一行并横跨 100% 宽度
    const card = containerEl.createDiv({
      cls: 'wechat-proxy-info-card',
      attr: {
        style: 'margin-top: 8px; margin-bottom: 16px; padding: 12px; border: 1px solid var(--background-modifier-border); border-radius: 6px; background-color: var(--background-primary-alt); font-size: 12px; line-height: 1.6; display: flex; flex-direction: column; gap: 8px;'
      }
    });

    // 1. 官方免自建服务行
    const officialRow = card.createDiv({ attr: { style: 'display: flex; gap: 6px; align-items: flex-start;' } });
    officialRow.createSpan({ text: '💡', attr: { style: 'flex-shrink: 0; line-height: 1.6;' } });
    const officialText = officialRow.createDiv();
    officialText.createEl('strong', {
      text: '官方中转',
      attr: { style: 'color: var(--text-normal); font-weight: 600;' }
    });
    officialText.createSpan({
      text: '：已上线稳定中转代理，彻底解决微信 IP 白名单频繁漂移问题。',
      attr: { style: 'color: var(--text-muted);' }
    });
    officialText.createEl('a', {
      text: '获取官方中转 Token ➔',
      href: 'https://xiaoweibox.top/chats/wechat-proxy-service',
      attr: { style: 'margin-left: 6px; color: var(--text-muted); text-decoration: underline;' }
    });

    // 2. 自建指南行
    const selfHostedRow = card.createDiv({ attr: { style: 'display: flex; gap: 6px; align-items: flex-start;' } });
    selfHostedRow.createSpan({ text: '🛠️', attr: { style: 'flex-shrink: 0; line-height: 1.6;' } });
    const selfHostedText = selfHostedRow.createDiv();
    selfHostedText.createEl('strong', {
      text: '手工自建',
      attr: { style: 'color: var(--text-normal); font-weight: 600;' }
    });
    selfHostedText.createSpan({
      text: '：如果您想拥有完全自主的控制权，也可以基于 Cloudflare Worker 或个人 VPS 自建。',
      attr: { style: 'color: var(--text-muted);' }
    });
    selfHostedText.createEl('a', {
      text: '查看自建部署指南 ➔',
      href: 'https://xiaoweibox.top/chats/wechat-proxy',
      attr: { style: 'margin-left: 6px; color: var(--text-muted); text-decoration: underline;' }
    });

    // 3. 安全与隐私提示
    const securityRow = card.createDiv({ attr: { style: 'display: flex; gap: 6px; align-items: flex-start;' } });
    securityRow.createSpan({ text: '🔒', attr: { style: 'flex-shrink: 0; line-height: 1.6;' } });
    const securityText = securityRow.createDiv();
    securityText.createEl('strong', {
      text: '安全声明',
      attr: { style: 'color: var(--text-warning); font-weight: 600;' }
    });
    securityText.createSpan({
      text: '：代理服务将中转您的请求。请确保使用受信任的代理（自建或官方），以保护 AppSecret 安全。中转服务仅在内存中转发，不存储您的任何敏感凭证。',
      attr: { style: 'color: var(--text-muted);' }
    });

    this.renderCustomCssSection(containerEl);

  },

  /**
   * 渲染「自定义 CSS」折叠设置区块（Phase 1）。
   * @param {ObsidianElementLike} containerEl
   */
  renderCustomCssSection(containerEl) {
    new Setting(containerEl)
      .setName('自定义 CSS')
      .setHeading();

    const warningCard = containerEl.createDiv({
      cls: 'owc-custom-css-warning',
      attr: {
        style: 'margin-bottom: 12px; padding: 10px 12px; border-left: 3px solid var(--text-warning); border-radius: 4px; background-color: var(--background-primary-alt); font-size: 13px; line-height: 1.6; color: var(--text-muted);'
      }
    });
    warningCard.createEl('strong', { text: '⚠️ 高阶功能', attr: { style: 'color: var(--text-warning);' } });
    warningCard.createSpan({
      text: '：需要您自己编写 CSS。插件会自动把选择器样式内联到元素上，但微信仍可能清洗部分复杂样式；当文章已使用 AI 编排结果时，自定义 CSS 不生效（两者为独立的样式系统）。启用前建议先用「复制到公众号」小范围测试。'
    });

    // 使用指南外链
    const customCssGuideSetting = new Setting(containerEl)
      .setName('使用指南');
    setMutedGuideDescription(
      customCssGuideSetting,
      containerEl.ownerDocument || getActiveDocumentCompat(),
      '自定义 CSS 的作用域原理、可用选择器清单、可直接复制的示例与禁忌坑位。',
      '查看使用指南 →',
      CUSTOM_CSS_GUIDE_URL,
      () => {
        this.plugin.openExternalUrl(CUSTOM_CSS_GUIDE_URL);
      }
    );

    // 启用开关
    let customCssEnabled = !!this.plugin.settings.enableCustomCss;
    new Setting(containerEl)
      .setName('启用自定义 CSS')
      .setDesc('开启后，下方输入的 CSS 将覆盖当前主题的部分样式。')
      .addToggle(toggle => toggle
        .setValue(customCssEnabled)
        .onChange(async (value) => {
          customCssEnabled = value;
          this.plugin.settings.enableCustomCss = value;
          const saved = await this.plugin.saveSettings();
          if (saved) this.plugin.scheduleCustomCssPreviewNotice?.();
          refreshSettingTabCompat(this);
        }));

    if (!customCssEnabled) {
      return;
    }

    const statusRow = containerEl.createDiv({ cls: 'owc-custom-css-status' });
    statusRow.setCssStyles?.({
      display: 'flex',
      gap: '8px',
      alignItems: 'baseline',
      margin: '-2px 0 12px',
      padding: '0 2px',
      fontSize: '12px',
      lineHeight: '1.5',
      color: 'var(--text-muted)',
    });
    const statusLabel = statusRow.createSpan({ text: '当前状态' });
    statusLabel.setCssStyles?.({
      flex: '0 0 auto',
      color: 'var(--text-normal)',
      fontWeight: '500',
    });
    const statusText = statusRow.createSpan({ text: '正在检查自定义 CSS…' });
    let statusRefreshGeneration = 0;
    const refreshCustomCssStatus = async (delayMs = 0) => {
      const generation = ++statusRefreshGeneration;
      if (delayMs > 0 && typeof window !== 'undefined') {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
      if (generation !== statusRefreshGeneration || !statusRow.parentElement) return;
      const description = await describeCustomCssStatus(this.plugin);
      if (generation !== statusRefreshGeneration || !statusRow.parentElement) return;
      statusText.textContent = description;
    };
    refreshCustomCssStatus();

    // CSS textarea
    const textareaSetting = new Setting(containerEl)
      .setName('自定义 CSS 内容')
      .setDesc('直接粘贴 CSS，例如 p { color: #333; }。无需写 .owc-article-root 前缀，插件会自动限定作用域。');

    textareaSetting.settingEl?.setCssStyles?.({ flexWrap: 'wrap' });
    textareaSetting.addTextArea(text => {
      text
        .setPlaceholder('/* 在此输入你的自定义 CSS */\np { color: #333; }')
        .setValue(this.plugin.settings.customCss || '')
        .onChange(async (value) => {
          this.plugin.settings.customCss = value;
          const saved = await this.plugin.saveSettings();
          if (saved) {
            this.plugin.scheduleCustomCssPreviewNotice?.();
            refreshCustomCssStatus(800);
          }
        });

      if (text.inputEl) {
        text.inputEl.setCssStyles?.({
          width: '100%',
          minHeight: '160px',
          fontFamily: 'monospace',
          fontSize: '13px',
        });
      }
    });

    // Vault 笔记名输入框
    new Setting(containerEl)
      .setName('或从笔记读取 CSS')
      .setDesc('填写 vault 内笔记路径（如 Meta/custom.css.md），插件会优先读取该笔记内容作为 CSS。读取失败时回退到上方 textarea。')
      .addText(text => text
        .setPlaceholder('Meta/custom-css.md')
        .setValue(this.plugin.settings.customCssNote || '')
        .onChange(async (value) => {
          this.plugin.settings.customCssNote = value.trim();
          const saved = await this.plugin.saveSettings();
          if (saved) {
            this.plugin.scheduleCustomCssPreviewNotice?.();
            refreshCustomCssStatus(800);
          }
        }));
  }
};

export { wechatSettingsMethods };
