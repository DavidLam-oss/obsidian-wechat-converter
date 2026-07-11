/*
## 核心功能

实现插件设置页中的 settings tab shell 配置界面能力。

## 输入

接收插件设置、SettingTab 生命周期、用户表单输入和账号/平台配置状态。

## 输出

输出 `settingsTabShellMethods`，用于渲染设置项、保存配置或打开辅助 modal。

## 定位

位于 views/settings/，负责设置 UI 层；设置归一化交给 services/plugin-settings.js。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/settings 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  GITHUB_REPOSITORY_URL,
  MULTI_PLATFORM_TAB_LABEL,
  getObsidianSetIcon,
  obsidianApi,
  renderFeishuSettingsTab,
  renderMultiPlatformSettingsTab,
} from '../apple-style-view-shared.js';

const settingsTabShellMethods = {
  /** @returns {SettingDefinitionRenderLike[]} */
  getSettingDefinitions() {
    return [{
      name: 'Wechat Converter',
      desc: '微信发布助手设置',
      searchable: false,
      render: () => {
        this.renderSettingsContent();
      },
    }];
  },

  /**
   * @param {ObsidianElementLike} containerEl
   */
  renderGitHubStarBanner(containerEl) {
    const banner = containerEl.createDiv({ cls: 'apple-settings-github-banner' });
    const iconWrap = banner.createDiv({ cls: 'apple-settings-github-icon' });
    const setIcon = getObsidianSetIcon();
    if (typeof setIcon === 'function') {
      setIcon(iconWrap, 'star');
    } else {
      iconWrap.setText('Star');
    }

    const copy = banner.createDiv({ cls: 'apple-settings-github-copy' });
    copy.createEl('div', { text: '喜欢这个插件？', cls: 'apple-settings-github-kicker' });
    copy.createEl('p', {
      text: '在 GitHub 上点个 Star，可以帮更多 Obsidian 创作者发现它。',
      cls: 'apple-settings-github-desc',
    });

    const starButton = banner.createEl('button', {
      text: 'Star on GitHub',
      cls: 'apple-settings-github-button',
    });
    starButton.onclick = () => {
      const openExternalUrl = this.plugin.openExternalUrl;
      if (typeof openExternalUrl === 'function') {
        openExternalUrl.call(this.plugin, GITHUB_REPOSITORY_URL);
      }
    };
  },

  /**
   * @param {ObsidianElementLike} containerEl
   * @param {string} description
   */
  renderSettingsTabIntro(containerEl, description) {
    const intro = containerEl.createDiv({ cls: 'apple-settings-tab-intro' });
    intro.createEl('p', { text: description, cls: 'apple-settings-tab-intro-desc' });
  },

  renderSettingsContent() {
    const { containerEl } = this;
    containerEl.empty();

    this.renderGitHubStarBanner(containerEl);

    const tabBar = containerEl.createDiv({ cls: 'apple-settings-tabs' });
    const wechatTab = tabBar.createDiv({ cls: 'apple-settings-tab active', text: '微信' });
    const multiTab = tabBar.createDiv({ cls: 'apple-settings-tab apple-settings-tab-multi' });
    multiTab.createSpan({ text: MULTI_PLATFORM_TAB_LABEL, cls: 'apple-settings-tab-label' });
    const feishuTab = tabBar.createDiv({ cls: 'apple-settings-tab', text: '飞书' });

    const wechatContent = containerEl.createDiv({ cls: 'apple-settings-tab-content' });
    const multiContent = containerEl.createDiv({ cls: 'apple-settings-tab-content' });
    multiContent.setCssStyles({ display: 'none' });
    const feishuContent = containerEl.createDiv({ cls: 'apple-settings-tab-content' });
    feishuContent.setCssStyles({ display: 'none' });

    wechatTab.onclick = () => {
      this._activeSettingsTab = 'wechat';
      wechatTab.addClass('active');
      feishuTab.removeClass('active');
      multiTab.removeClass('active');
      wechatContent.setCssStyles({ display: '' });
      feishuContent.setCssStyles({ display: 'none' });
      multiContent.setCssStyles({ display: 'none' });
    };
    feishuTab.onclick = () => {
      this._activeSettingsTab = 'feishu';
      feishuTab.addClass('active');
      wechatTab.removeClass('active');
      multiTab.removeClass('active');
      wechatContent.setCssStyles({ display: 'none' });
      feishuContent.setCssStyles({ display: '' });
      multiContent.setCssStyles({ display: 'none' });
      renderFeishuSettingsTab(this, feishuContent, { obsidianApi });
    };
    multiTab.onclick = () => {
      this._activeSettingsTab = 'multi';
      multiTab.addClass('active');
      wechatTab.removeClass('active');
      feishuTab.removeClass('active');
      wechatContent.setCssStyles({ display: 'none' });
      feishuContent.setCssStyles({ display: 'none' });
      multiContent.setCssStyles({ display: '' });
    };

    if (this._activeSettingsTab === 'feishu') {
      feishuTab.onclick();
    } else if (this._activeSettingsTab === 'multi') {
      multiTab.onclick();
    }

    this.renderWechatSettingsTab(wechatContent);
    renderMultiPlatformSettingsTab(this, multiContent, { obsidianApi });
  },
};

export { settingsTabShellMethods };
