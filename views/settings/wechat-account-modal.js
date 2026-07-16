/*
## 核心功能

实现插件设置页中的 wechat account modal 配置界面能力。

## 输入

接收插件设置、SettingTab 生命周期、用户表单输入和账号/平台配置状态。

## 输出

输出 `wechatAccountModalMethods`，用于渲染设置项、保存配置或打开辅助 modal。

## 定位

位于 views/settings/，负责设置 UI 层；设置归一化交给 services/plugin-settings.js。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/settings 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  Notice,
  createObsidianModal,
  getWechatAccountPublishOptions,
  normalizeWechatAccountPublishOptions,
  WechatAPI,
  toReadableError,
  refreshSettingTabCompat,
  generateId,
} from '../apple-style-view-shared.js';

/** @type {WechatAccountModalMethodsContract & ThisType<AppleStyleSettingTabContract>} */
const wechatAccountModalMethods = {
  /**
   * 显示添加/编辑账号的模态框
   */
  /**
   * @param {WechatAccountLike | null} account
   */
  showEditAccountModal(account) {
    const modal = createObsidianModal(this.app);
    modal.titleEl.setText(account ? '编辑账号' : '添加账号');

    const form = modal.contentEl.createDiv();
    const publishDefaults = getWechatAccountPublishOptions(account);

    // 账号名称
    const nameGroup = form.createDiv({ cls: 'wechat-form-group' });
    nameGroup.createEl('label', { text: '账号名称' });
    const nameInput = /** @type {ObsidianInputLike} */ (nameGroup.createEl('input', {
      type: 'text',
      placeholder: '例如：我的公众号',
      value: account?.name || ''
    }));

    // AppID
    const appIdGroup = form.createDiv({ cls: 'wechat-form-group' });
    appIdGroup.createEl('label', { text: 'AppID' });
    const appIdInput = /** @type {ObsidianInputLike} */ (appIdGroup.createEl('input', {
      type: 'text',
      placeholder: 'wx...',
      value: account?.appId || ''
    }));

    // AppSecret
    const secretGroup = form.createDiv({ cls: 'wechat-form-group' });
    secretGroup.createEl('label', { text: 'AppSecret' });
    const secretInput = /** @type {ObsidianInputLike} */ (secretGroup.createEl('input', {
      type: 'password',
      placeholder: '开发者密钥',
      value: account?.appSecret || ''
    }));

    // 默认作者
    const authorGroup = form.createDiv({ cls: 'wechat-form-group' });
    authorGroup.createEl('label', { text: '默认作者（可选）' });
    const authorInput = /** @type {ObsidianInputLike} */ (authorGroup.createEl('input', {
      type: 'text',
      placeholder: '留空则不显示作者',
      value: account?.author || ''
    }));

    const publishOptions = form.createEl('details', { cls: 'wechat-sync-advanced wechat-account-publish-options' });
    publishOptions.createEl('summary', {
      text: '发布选项',
      cls: 'wechat-sync-advanced-summary',
    });
    const publishSection = publishOptions.createDiv({ cls: 'wechat-sync-advanced-body wechat-account-publish-body' });
    publishSection.createEl('div', {
      text: '可为当前公众号预设原文链接与留言相关的默认发布策略。',
      cls: 'wechat-form-help',
    });

    const sourceUrlGroup = publishSection.createDiv({ cls: 'wechat-form-group' });
    sourceUrlGroup.createEl('label', { text: '默认原文链接（可选）' });
    const sourceUrlInput = /** @type {ObsidianInputLike} */ (sourceUrlGroup.createEl('input', {
      type: 'url',
      placeholder: '留空则不同步原文链接',
      value: publishDefaults.contentSourceUrl,
    }));

    const commentGroup = publishSection.createDiv({ cls: 'wechat-form-checkbox-group' });
    const commentLabel = commentGroup.createEl('label', { cls: 'wechat-form-checkbox-label' });
    const commentInput = /** @type {ObsidianInputLike} */ (commentLabel.createEl('input', { type: 'checkbox' }));
    commentInput.checked = publishDefaults.openComment;
    commentLabel.appendText('默认开启留言');

    const fansCommentGroup = publishSection.createDiv({ cls: 'wechat-form-checkbox-group' });
    const fansCommentLabel = fansCommentGroup.createEl('label', { cls: 'wechat-form-checkbox-label' });
    const fansCommentInput = /** @type {ObsidianInputLike} */ (fansCommentLabel.createEl('input', { type: 'checkbox' }));
    fansCommentInput.checked = publishDefaults.openComment && publishDefaults.onlyFansCanComment;
    fansCommentLabel.appendText('默认仅粉丝可留言');
    fansCommentGroup.createEl('div', {
      text: '关闭留言时，此选项不会生效。',
      cls: 'wechat-form-help',
    });

    const syncCommentDependency = () => {
      const enabled = commentInput.checked;
      fansCommentInput.disabled = !enabled;
      fansCommentGroup.toggleClass('is-disabled', !enabled);
      if (!enabled) fansCommentInput.checked = false;
    };
    commentInput.addEventListener('change', syncCommentDependency);
    syncCommentDependency();

    // 按钮区
    const btnRow = form.createDiv({ cls: 'wechat-modal-buttons' });

    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => modal.close();

    const testBtn = btnRow.createEl('button', { text: '测试连接', cls: 'wechat-btn-test' });
    testBtn.onclick = async () => {
      if (!appIdInput.value || !secretInput.value) {
        new Notice('请填写 AppID 和 AppSecret');
        return;
      }
      testBtn.disabled = true;
      testBtn.textContent = '测试中...';
      try {
        const api = new WechatAPI(appIdInput.value.trim(), secretInput.value.trim(), this.plugin.settings.proxyUrl, this.plugin.settings.clientId);
        await api.getAccessToken();
        new Notice('✅ 连接成功！');
      } catch (err) {
        new Notice(`❌ 连接失败: ${toReadableError(err).message}`);
      }
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    };

    const saveBtn = btnRow.createEl('button', { text: '保存', cls: 'mod-cta' });
    saveBtn.onclick = async () => {
      const name = nameInput.value.trim() || '未命名账号';
      const appId = appIdInput.value.trim();
      const appSecret = secretInput.value.trim();

      if (!appId || !appSecret) {
        new Notice('请填写 AppID 和 AppSecret');
        return;
      }

      const publishOptions = normalizeWechatAccountPublishOptions({
        contentSourceUrl: sourceUrlInput.value,
        openComment: commentInput.checked,
        onlyFansCanComment: fansCommentInput.checked,
      });

      if (account) {
        // 编辑现有账号
        account.name = name;
        account.appId = appId;
        account.appSecret = appSecret;
        account.author = authorInput.value.trim();
        Object.assign(account, publishOptions);
      } else {
        // 添加新账号
        const newAccount = {
          id: generateId(),
          name,
          appId,
          appSecret,
          author: authorInput.value.trim(),
          ...publishOptions,
        };
        this.plugin.settings.wechatAccounts.push(newAccount);
        // 如果是第一个账号，自动设为默认
        if (this.plugin.settings.wechatAccounts.length === 1) {
          this.plugin.settings.defaultAccountId = newAccount.id;
        }
      }

      await this.plugin.saveSettings();
      modal.close();
      refreshSettingTabCompat(this);
      new Notice(account ? '✅ 账号已更新' : '✅ 账号已添加');
    };

    modal.open();
  }
};

export { wechatAccountModalMethods };
