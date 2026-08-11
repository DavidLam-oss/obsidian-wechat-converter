/*
## 核心功能

实现插件设置页中的 ai section 配置界面能力。

## 输入

接收插件设置、SettingTab 生命周期、用户表单输入和账号/平台配置状态。

## 输出

输出 `aiSettingsMethods`，用于渲染设置项、保存配置或打开辅助 modal。

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
  AI_LAYOUT_SELECTION_AUTO,
  AI_PROVIDER_KINDS,
  getLayoutFamilyList,
  getColorPaletteList,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  getAiProviderIssues,
  normalizeArticleLayoutCacheEntry,
  setDestructiveButtonCompat,
  refreshSettingTabCompat,
  testAiProviderConnection,
  createObsidianFetchAdapter,
  getObsidianRequestUrl,
  getObsidianRequest,
  toReadableError,
  normalizeAiProvider,
  createObsidianModal,
} from '../apple-style-view-shared.js';

/** @type {AiSettingsMethodsContract & ThisType<AppleStyleSettingTabContract>} */
const aiSettingsMethods = {
  /**
   * @param {ObsidianElementLike} containerEl
   */
  renderAiSettingsSection(containerEl) {
    new Setting(containerEl)
      .setName('AI 编排')
      .setDesc('管理模型、默认布局、默认颜色和缓存策略。实际生成与应用入口在转换器顶部工具栏的「AI 编排」按钮中。')
      .setHeading();

    new Setting(containerEl)
      .setName('启用 AI 编排')
      .setDesc('关闭后会隐藏右侧工具栏中的 AI 编排入口，但不会删除已经为文章和布局/颜色组合生成过的缓存结果。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.ai.enabled === true)
        .onChange(async (value) => {
          this.plugin.settings.ai.enabled = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        }));

    const layoutFamilyOptions = getLayoutFamilyList({ includeAuto: true, includeReserved: false });
    new Setting(containerEl)
      .setName('默认布局')
      .setDesc('打开 AI 编排面板时默认选中的布局。保持“自动推荐”时，AI 会根据文章内容推荐布局风格。')
      .addDropdown((dropdown) => {
        layoutFamilyOptions.forEach((option) => dropdown.addOption(option.value, option.label));
        dropdown.setValue(this.plugin.settings.ai.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO);
        dropdown.onChange(async (value) => {
          this.plugin.settings.ai.defaultLayoutFamily = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        });
      });

    const colorPaletteOptions = getColorPaletteList({ includeAuto: true });
    new Setting(containerEl)
      .setName('默认颜色')
      .setDesc('打开 AI 编排面板时默认选中的颜色。保持“自动推荐”时，AI 会在内置配色方案中推荐一个结果；生成后也可以手动切换颜色复用当前布局。')
      .addDropdown((dropdown) => {
        colorPaletteOptions.forEach((option) => dropdown.addOption(option.value, option.label));
        dropdown.setValue(this.plugin.settings.ai.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO);
        dropdown.onChange(async (value) => {
          this.plugin.settings.ai.defaultColorPalette = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        });
      });

    /** @type {AiProviderLike[]} */
    const providers = this.plugin.settings.ai.providers || [];
    const defaultProviderId = this.plugin.settings.ai.defaultProviderId;
    const runnableProviders = providers.filter((provider) => isAiProviderRunnable(provider) && provider.enabled !== false);

    new Setting(containerEl)
      .setName('默认 AI Provider')
      .setDesc(runnableProviders.length > 0
        ? '生成 AI 编排时会优先使用这里选中的 Provider。'
        : '还没有可直接用于 AI 编排的 Provider，请先补全 Base URL、API Key 和模型。')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '自动选择');
        providers.forEach((provider) => {
          const statusText = summarizeAiProviderIssues(provider);
          dropdown.addOption(provider.id, `${provider.name} (${statusText})`);
        });
        dropdown.setValue(defaultProviderId || '');
        dropdown.onChange(async (value) => {
          this.plugin.settings.ai.defaultProviderId = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        });
      });

    if (providers.length === 0) {
      containerEl.createEl('p', {
        text: '暂无 AI Provider，请点击下方按钮添加',
        cls: 'setting-item-description',
        attr: { style: 'color: var(--text-muted); font-style: italic;' }
      });
    } else {
      const providerList = containerEl.createDiv({ cls: 'wechat-account-list' });
      for (const provider of providers) {
        const isDefault = provider.id === defaultProviderId;
        const providerIssues = getAiProviderIssues(provider);
        const isRunnable = isAiProviderRunnable(provider) && provider.enabled !== false;
        const providerCard = providerList.createDiv({ cls: 'wechat-account-card' });
        const info = providerCard.createDiv({ cls: 'wechat-account-info' });
        const nameRow = info.createDiv({ cls: 'wechat-account-name-row' });
        nameRow.createEl('span', { text: provider.name, cls: 'wechat-account-name' });
        if (isDefault) {
          nameRow.createEl('span', { text: '默认', cls: 'wechat-account-badge' });
        }
        if (provider.enabled === false) {
          nameRow.createEl('span', { text: '已停用', cls: 'wechat-account-badge', attr: { style: 'background: var(--text-faint);' } });
        } else if (isRunnable) {
          nameRow.createEl('span', { text: '可用', cls: 'wechat-account-badge', attr: { style: 'background: #0f8f64;' } });
        } else {
          nameRow.createEl('span', { text: '待补全', cls: 'wechat-account-badge', attr: { style: 'background: #d97706;' } });
        }
        info.createDiv({
          text: `${provider.kind} · ${provider.model || '未设置模型'}`,
          cls: 'wechat-account-appid'
        });
        info.createDiv({
          text: summarizeAiProviderIssues(provider),
          cls: 'wechat-account-appid'
        });

        const actions = providerCard.createDiv({ cls: 'wechat-account-actions' });
        if (!isDefault) {
          const defaultBtn = actions.createEl('button', { text: '设为默认', cls: 'wechat-btn-small' });
          defaultBtn.onclick = async () => {
            this.plugin.settings.ai.defaultProviderId = provider.id;
            await this.plugin.saveSettings();
            this.refreshOpenConverterAiState();
            refreshSettingTabCompat(this);
          };
        }

        const editBtn = actions.createEl('button', { text: '编辑', cls: 'wechat-btn-small' });
        editBtn.onclick = () => this.showEditAiProviderModal(provider);

        const testBtn = actions.createEl('button', { text: '测试', cls: 'wechat-btn-small wechat-btn-test' });
        if (!isRunnable) {
          testBtn.disabled = true;
          testBtn.title = providerIssues.includes('disabled')
            ? '请先启用该 Provider'
            : `当前无法测试：${summarizeAiProviderIssues(provider)}`;
        }
        testBtn.onclick = async () => {
          if (!isRunnable) return;
          testBtn.disabled = true;
          testBtn.textContent = '测试中...';
          try {
            await testAiProviderConnection(provider, createObsidianFetchAdapter({ requestUrl: getObsidianRequestUrl(), request: getObsidianRequest() }));
            new Notice(`✅ ${provider.name} 模型可用！`);
          } catch (error) {
            new Notice(`❌ ${provider.name} 连接失败: ${toReadableError(error).message}`);
          }
          testBtn.disabled = false;
          testBtn.textContent = '测试';
        };

        const deleteBtn = actions.createEl('button', { text: '删除', cls: 'wechat-btn-small wechat-btn-danger' });
        deleteBtn.onclick = async () => {
          const confirmed = await this.confirmDestructiveAction({
            title: '删除 AI Provider',
            message: `确定要删除 AI Provider "${provider.name}" 吗？`,
            confirmText: '删除',
          });
          if (!confirmed) return;
          this.plugin.settings.ai.providers = providers.filter((item) => item.id !== provider.id);
          if (provider.id === defaultProviderId) {
            const nextRunnableProvider = this.plugin.settings.ai.providers.find((item) => item.enabled !== false && isAiProviderRunnable(item));
            this.plugin.settings.ai.defaultProviderId = nextRunnableProvider?.id || '';
          }
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
          refreshSettingTabCompat(this);
        };
      }
    }

    const addProviderContainer = containerEl.createDiv({ cls: 'wechat-add-account-container' });
    const addProviderBtn = addProviderContainer.createEl('button', {
      text: '+ 添加 AI Provider',
      cls: 'wechat-btn-add'
    });
    addProviderBtn.onclick = () => this.showEditAiProviderModal(null);

    const advancedOptions = containerEl.createEl('details', { cls: 'apple-settings-details' });
    advancedOptions.createEl('summary', {
      cls: 'apple-settings-summary',
      text: 'AI 编排高级选项'
    });
    const advancedArea = advancedOptions.createDiv({ cls: 'apple-settings-area apple-settings-advanced-area' });

    new Setting(advancedArea)
      .setName('编排时参考图片')
      .setDesc('开启后，AI 会把文中的配图和截图作为排版素材参考，但不会直接改写你的正文。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.ai.includeImagesInLayout !== false)
        .onChange(async (value) => {
          this.plugin.settings.ai.includeImagesInLayout = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        }));

    new Setting(advancedArea)
      .setName('AI 请求超时（秒）')
      .setDesc('默认 120 秒；较快模型可设 15 到 45 秒，较慢或本地模型建议保持 60 到 120 秒。')
      .addText(text => text
        .setPlaceholder('120')
        .setValue(String(Math.round((this.plugin.settings.ai.requestTimeoutMs || 120000) / 1000)))
        .onChange(async (value) => {
          const seconds = Math.min(180, Math.max(5, parseInt(value || '120', 10) || 120));
          this.plugin.settings.ai.requestTimeoutMs = seconds * 1000;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        }));

    const layoutCacheEntries = Object.values(this.plugin.settings.ai.articleLayoutsByPath || {});
    const cachedDocCount = layoutCacheEntries.length;
    const cachedLayoutCount = layoutCacheEntries.reduce((count, entry) => {
      const normalizedEntry = normalizeArticleLayoutCacheEntry(entry);
      if (!normalizedEntry) return count;
      return count + Object.keys(normalizedEntry.familyStates || {}).length;
    }, 0);
    const cacheSetting = new Setting(advancedArea)
      .setName('AI 编排缓存')
      .setDesc(cachedLayoutCount > 0
        ? `当前已缓存 ${cachedDocCount} 篇文章、共 ${cachedLayoutCount} 份编排风格结果。`
        : '当前还没有缓存的 AI 编排结果。');

    if (cachedLayoutCount > 0) {
      cacheSetting.addButton((button) => {
        const clearCacheButton = setDestructiveButtonCompat(button.setButtonText('清空缓存'));
        clearCacheButton.onClick(async () => {
            const confirmed = await this.confirmDestructiveAction({
              title: '清空 AI 编排缓存',
              message: `确定要清空 ${cachedDocCount} 篇文章、共 ${cachedLayoutCount} 份 AI 编排缓存吗？`,
              confirmText: '清空',
            });
            if (!confirmed) return;
            this.plugin.settings.ai.articleLayoutsByPath = {};
            await this.plugin.saveSettings();
            this.refreshOpenConverterAiState();
            new Notice('已清空 AI 编排缓存');
            refreshSettingTabCompat(this);
          });
      });
    }
  },

  /**
   * 显示添加/编辑账号的模态框
   */
  /**
   * @param {AiProviderLike | null} provider
   */
  showEditAiProviderModal(provider) {
    const modal = createObsidianModal(this.app);
    modal.titleEl.setText(provider ? '编辑 AI Provider' : '添加 AI Provider');

    const form = modal.contentEl.createDiv();

    const nameGroup = form.createDiv({ cls: 'wechat-form-group' });
    nameGroup.createEl('label', { text: '名称' });
    const nameInput = /** @type {ObsidianInputLike} */ (nameGroup.createEl('input', {
      type: 'text',
      placeholder: '例如：OpenAI / OpenRouter / 自建网关',
      value: provider?.name || ''
    }));

    const kindGroup = form.createDiv({ cls: 'wechat-form-group' });
    kindGroup.createEl('label', { text: '类型' });
    const kindSelectWrap = kindGroup.createDiv({ cls: 'wechat-form-select-wrap' });
    const kindSelect = /** @type {ObsidianInputLike} */ (kindSelectWrap.createEl('select', { cls: 'wechat-form-select' }));
    const providerKinds = [
      { value: AI_PROVIDER_KINDS.OPENAI_COMPATIBLE, label: 'OpenAI 兼容接口' },
      { value: AI_PROVIDER_KINDS.GEMINI, label: 'Gemini 兼容格式' },
      { value: AI_PROVIDER_KINDS.ANTHROPIC, label: 'Anthropic 兼容格式' },
    ];
    providerKinds.forEach((kind) => {
      const option = /** @type {ObsidianInputLike} */ (kindSelect.createEl('option', { value: kind.value, text: kind.label }));
      if ((provider?.kind || AI_PROVIDER_KINDS.OPENAI_COMPATIBLE) === kind.value) {
        option.selected = true;
      }
    });

    const baseUrlGroup = form.createDiv({ cls: 'wechat-form-group' });
    baseUrlGroup.createEl('label', { text: 'Base URL' });
    const baseUrlInput = /** @type {ObsidianInputLike} */ (baseUrlGroup.createEl('input', {
      type: 'text',
      placeholder: 'https://api.openai.com/v1 或 http://localhost:11434/v1',
      value: provider?.baseUrl || 'https://api.openai.com/v1'
    }));

    const apiKeyGroup = form.createDiv({ cls: 'wechat-form-group' });
    apiKeyGroup.createEl('label', { text: 'API Key' });
    const apiKeyInput = /** @type {ObsidianInputLike} */ (apiKeyGroup.createEl('input', {
      type: 'password',
      placeholder: 'sk-...',
      value: provider?.apiKey || ''
    }));

    const modelGroup = form.createDiv({ cls: 'wechat-form-group' });
    modelGroup.createEl('label', { text: '模型' });
    const modelInput = /** @type {ObsidianInputLike} */ (modelGroup.createEl('input', {
      type: 'text',
      placeholder: 'gpt-4.1-mini',
      value: provider?.model || 'gpt-4.1-mini'
    }));

    const applyKindDefaults = () => {
      const kind = kindSelect.value || AI_PROVIDER_KINDS.OPENAI_COMPATIBLE;
      if (kind === AI_PROVIDER_KINDS.GEMINI) {
        baseUrlInput.placeholder = 'https://generativelanguage.googleapis.com/v1beta';
        modelInput.placeholder = 'gemini-2.5-flash';
        if (!provider || provider.kind !== kind) {
          if (!baseUrlInput.value.trim()) baseUrlInput.value = 'https://generativelanguage.googleapis.com/v1beta';
          if (!modelInput.value.trim()) modelInput.value = 'gemini-2.5-flash';
        }
        return;
      }
      if (kind === AI_PROVIDER_KINDS.ANTHROPIC) {
        baseUrlInput.placeholder = 'https://api.anthropic.com/v1';
        modelInput.placeholder = 'claude-3-5-haiku-latest';
        if (!provider || provider.kind !== kind) {
          if (!baseUrlInput.value.trim()) baseUrlInput.value = 'https://api.anthropic.com/v1';
          if (!modelInput.value.trim()) modelInput.value = 'claude-3-5-haiku-latest';
        }
        return;
      }
      baseUrlInput.placeholder = 'https://api.openai.com/v1 或 http://localhost:11434/v1';
      modelInput.placeholder = 'gpt-4.1-mini';
      if (!provider || provider.kind !== kind) {
        if (!baseUrlInput.value.trim()) baseUrlInput.value = 'https://api.openai.com/v1';
        if (!modelInput.value.trim()) modelInput.value = 'gpt-4.1-mini';
      }
    };
    kindSelect.addEventListener('change', applyKindDefaults);
    applyKindDefaults();

    const enabledGroup = form.createDiv({ cls: 'wechat-form-group' });
    enabledGroup.createEl('label', { text: '启用' });
    const enabledWrap = enabledGroup.createDiv({ cls: 'wechat-provider-enabled' });
    const enabledToggle = /** @type {ObsidianInputLike} */ (enabledWrap.createEl('label', { cls: 'apple-toggle' }).createEl('input', {
      type: 'checkbox',
      cls: 'apple-toggle-input',
      checked: provider?.enabled !== false ? true : undefined,
    }));
    enabledToggle.checked = provider?.enabled !== false;
    enabledToggle.parentElement.createEl('span', { cls: 'apple-toggle-slider' });
    enabledWrap.createEl('span', {
      cls: 'wechat-provider-enabled-text',
      text: '保存后可用于 AI 编排和连接测试',
    });

    const btnRow = form.createDiv({ cls: 'wechat-modal-buttons' });
    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => modal.close();

    const testBtn = btnRow.createEl('button', { text: '测试连接', cls: 'wechat-btn-test' });
    testBtn.onclick = async () => {
      const candidate = normalizeAiProvider({
        id: provider?.id,
        name: nameInput.value.trim() || '未命名 Provider',
        kind: kindSelect.value,
        baseUrl: baseUrlInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
        enabled: enabledToggle.checked,
      });
      const issueSummary = summarizeAiProviderIssues(candidate);
      if (!isAiProviderRunnable(candidate)) {
        new Notice(`请先补全 Provider 配置：${issueSummary}`);
        return;
      }
      testBtn.disabled = true;
      testBtn.textContent = '测试中...';
      try {
        await testAiProviderConnection(candidate, createObsidianFetchAdapter({ requestUrl: getObsidianRequestUrl(), request: getObsidianRequest() }));
        new Notice('✅ AI Provider 模型可用！');
      } catch (error) {
        new Notice(`❌ 连接失败: ${toReadableError(error).message}`);
      }
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    };

    const saveBtn = btnRow.createEl('button', { text: '保存', cls: 'mod-cta' });
    saveBtn.onclick = async () => {
      const nextProvider = normalizeAiProvider({
        id: provider?.id,
        name: nameInput.value.trim() || '未命名 Provider',
        kind: kindSelect.value,
        baseUrl: baseUrlInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
        enabled: enabledToggle.checked,
      });

      const issues = getAiProviderIssues(nextProvider).filter((issue) => issue !== 'disabled');
      if (issues.length > 0) {
        new Notice(`请补全 Provider 配置：${summarizeAiProviderIssues(nextProvider)}`);
        return;
      }

      const providers = this.plugin.settings.ai.providers || [];
      if (provider) {
        this.plugin.settings.ai.providers = providers.map((item) => item.id === provider.id ? nextProvider : item);
      } else {
        this.plugin.settings.ai.providers.push(nextProvider);
        if (!this.plugin.settings.ai.defaultProviderId) {
          this.plugin.settings.ai.defaultProviderId = nextProvider.id;
        }
      }

      if (!this.plugin.settings.ai.defaultProviderId && nextProvider.enabled !== false && isAiProviderRunnable(nextProvider)) {
        this.plugin.settings.ai.defaultProviderId = nextProvider.id;
      }

      await this.plugin.saveSettings();
      this.refreshOpenConverterAiState();
      modal.close();
      refreshSettingTabCompat(this);
      new Notice(provider ? '✅ AI Provider 已更新' : '✅ AI Provider 已添加');
    };

    modal.open();
  }
};

export { aiSettingsMethods };
