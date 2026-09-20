/*
## 核心功能

实现插件设置页中独立的「AI 服务」Tab（ai-tab）配置界面能力。

## 输入

接收插件设置、SettingTab 生命周期、用户表单输入和账号/平台配置状态。

## 输出

输出 renderAiSettingsTab 与 aiSettingsMethods，用于渲染 AI 服务设置项、保存配置或打开辅助 modal。

## 定位

位于 views/settings/，负责 AI 服务的设置 UI 层；设置归一化交给 services/ai-layout/。

## 依赖

关键依赖：../apple-style-view-shared.js。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/settings 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
- 严格控制单文件行数软上限（800 行）。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS settings tab file handles dynamic Obsidian UI and API responses without strict typescript type annotations */

import {
  Setting,
  Notice,
  AI_LAYOUT_SELECTION_AUTO,
  AI_PROVIDER_KINDS,
  COMMON_AI_PRESETS,
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
  getActiveWindowValue,
} from "../apple-style-view-shared.js";

/**
 * 渲染独立「AI 服务」Tab 页面
 * @param {AppleStyleSettingTabContract} tab
 * @param {HTMLDivElement} containerEl
 * @param {object} [options={}]
 */
export function renderAiSettingsTab(tab, containerEl, options = {}) {
  const obsidian = options.obsidianApi || tab.plugin?.obsidianApi || getActiveWindowValue("obsidian") || {};
  const SettingCtor = obsidian.Setting || Setting;
  const NoticeCtor = obsidian.Notice || Notice;

  containerEl.empty();

  if (typeof tab.renderSettingsTabIntro === "function") {
    tab.renderSettingsTabIntro(
      containerEl,
      "集中管理用于公众号文章 AI 编排和小红书卡片封面生成的 AI 模型凭据，支持区分文本与生图用途。"
    );
  }

  // =========================================================================
  // 第一部分：AI Provider 凭据池
  // =========================================================================
  new SettingCtor(containerEl)
    .setName("AI Provider 模型凭据池")
    .setDesc("管理大模型 API 连接。支持同时或分别启用「文本模型」和「生图模型」能力，避免跨场景选错报错。")
    .setHeading();

  /** @type {AiProviderLike[]} */
  const providers = tab.plugin.settings.ai.providers || [];
  const defaultProviderId = tab.plugin.settings.ai.defaultProviderId || "";
  const defaultImageProviderId = tab.plugin.settings.ai.defaultImageProviderId || "";

  if (providers.length === 0) {
    containerEl.createEl("p", {
      text: "暂无配置任何 AI Provider，请点击下方「添加 AI Provider」按钮添加。",
      cls: "setting-item-description",
      attr: { style: "color: var(--text-muted); font-style: italic;" },
    });
  } else {
    const providerList = containerEl.createDiv({ cls: "wechat-account-list" });
    for (const provider of providers) {
      const isTextDefault = provider.id === defaultProviderId;
      const isImageDefault = provider.id === defaultImageProviderId;
      const isTextRunnable = isAiProviderRunnable(provider, "text") && provider.enabled !== false;
      const isImageRunnable = isAiProviderRunnable(provider, "image") && provider.enabled !== false;
      const isAnyRunnable = (isTextRunnable || isImageRunnable) && provider.enabled !== false;

      const providerCard = providerList.createDiv({ cls: "wechat-account-card" });
      const info = providerCard.createDiv({ cls: "wechat-account-info" });

      // 标题行：名称 + 默认标签 + 状态标签
      const nameRow = info.createDiv({ cls: "wechat-account-name-row" });
      nameRow.createEl("span", { text: provider.name, cls: "wechat-account-name" });

      if (isTextDefault) {
        nameRow.createEl("span", { text: "默认文本", cls: "wechat-account-badge", attr: { style: "background: #3b82f6;" } });
      }
      if (isImageDefault) {
        nameRow.createEl("span", { text: "默认生图", cls: "wechat-account-badge", attr: { style: "background: #8b5cf6;" } });
      }

      if (provider.enabled === false) {
        nameRow.createEl("span", { text: "已停用", cls: "wechat-account-badge", attr: { style: "background: var(--text-faint);" } });
      } else if (isAnyRunnable) {
        nameRow.createEl("span", { text: "可用", cls: "wechat-account-badge", attr: { style: "background: #0f8f64;" } });
      } else {
        nameRow.createEl("span", { text: "待补全", cls: "wechat-account-badge", attr: { style: "background: #d97706;" } });
      }

      // 能力徽标行
      const capRow = info.createDiv({ cls: "wechat-account-appid", attr: { style: "display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;" } });
      if (provider.supportsText !== false) {
        capRow.createEl("span", {
          text: "📝 文本: " + (provider.textModel || provider.model || "未设置"),
          attr: { style: "font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--background-modifier-border); color: var(--text-normal);" },
        });
      }
      if (provider.supportsImage === true) {
        capRow.createEl("span", {
          text: "🎨 生图: " + (provider.imageModel || "未设置"),
          attr: { style: "font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--background-modifier-border); color: var(--text-accent);" },
        });
      }
      if (provider.supportsText === false && !provider.supportsImage) {
        capRow.createEl("span", {
          text: "⚠️ 未启用任何能力",
          attr: { style: "font-size: 11px; color: var(--text-error);" },
        });
      }

      // 备注说明
      if (provider.notes) {
        info.createDiv({
          text: "备注: " + provider.notes,
          cls: "setting-item-description",
          attr: { style: "font-size: 11px; margin-top: 2px; color: var(--text-muted);" },
        });
      }

      // 状态摘要行
      info.createDiv({
        text: provider.kind + " · " + summarizeAiProviderIssues(provider, "any"),
        cls: "setting-item-description",
        attr: { style: "margin-top: 2px;" },
      });

      // 操作按钮区
      const actions = providerCard.createDiv({ cls: "wechat-account-actions" });

      // 设为默认文本
      if (provider.supportsText !== false && isTextRunnable && !isTextDefault) {
        const defaultTextBtn = actions.createEl("button", { text: "设为默认文本", cls: "wechat-btn-small" });
        defaultTextBtn.onclick = async () => {
          tab.plugin.settings.ai.defaultProviderId = provider.id;
          await tab.plugin.saveSettings();
          tab.refreshOpenConverterAiState?.();
          refreshSettingTabCompat(tab);
          new NoticeCtor("已将 " + provider.name + " 设为文章编排默认文本 Provider");
        };
      }

      // 设为默认生图
      if (provider.supportsImage === true && isImageRunnable && !isImageDefault) {
        const defaultImgBtn = actions.createEl("button", { text: "设为默认生图", cls: "wechat-btn-small" });
        defaultImgBtn.onclick = async () => {
          tab.plugin.settings.ai.defaultImageProviderId = provider.id;
          await tab.plugin.saveSettings();
          tab.refreshOpenConverterAiState?.();
          refreshSettingTabCompat(tab);
          new NoticeCtor("已将 " + provider.name + " 设为卡片封面默认生图 Provider");
        };
      }

      // 编辑按钮
      const editBtn = actions.createEl("button", { text: "编辑", cls: "wechat-btn-small" });
      editBtn.onclick = () => showEditAiProviderModal(tab, provider);

      // 测试连接
      const testBtn = actions.createEl("button", { text: "测试", cls: "wechat-btn-small wechat-btn-test" });
      if (!isAnyRunnable) {
        testBtn.disabled = true;
        testBtn.title = provider.enabled === false ? "请先启用该 Provider" : "当前配置未就绪，无法测试";
      }
      testBtn.onclick = async () => {
        if (!isAnyRunnable) return;
        testBtn.disabled = true;
        testBtn.textContent = "测试中...";
        try {
          await testAiProviderConnection(
            provider,
            createObsidianFetchAdapter({ requestUrl: getObsidianRequestUrl(), request: getObsidianRequest() })
          );
          new NoticeCtor("✅ " + provider.name + " 连通性测试通过！");
        } catch (error) {
          new NoticeCtor("❌ " + provider.name + " 连接失败: " + toReadableError(error).message);
        }
        testBtn.disabled = false;
        testBtn.textContent = "测试";
      };

      // 删除按钮
      const deleteBtn = actions.createEl("button", { text: "删除", cls: "wechat-btn-small wechat-btn-danger" });
      deleteBtn.onclick = async () => {
        const confirmed = typeof tab.confirmDestructiveAction === "function"
          ? await tab.confirmDestructiveAction({
              title: "删除 AI Provider",
              message: `确定要删除 AI Provider "${provider.name}" 吗？`,
              confirmText: "删除",
            })
          : true;
        if (!confirmed) return;
        tab.plugin.settings.ai.providers = providers.filter((item) => item.id !== provider.id);
        if (provider.id === defaultProviderId) {
          const nextRunnable = tab.plugin.settings.ai.providers.find((item) => item.enabled !== false && isAiProviderRunnable(item, "text"));
          tab.plugin.settings.ai.defaultProviderId = nextRunnable?.id || "";
        }
        if (provider.id === defaultImageProviderId) {
          const nextRunnableImg = tab.plugin.settings.ai.providers.find((item) => item.enabled !== false && isAiProviderRunnable(item, "image"));
          tab.plugin.settings.ai.defaultImageProviderId = nextRunnableImg?.id || "";
        }
        await tab.plugin.saveSettings();
        tab.refreshOpenConverterAiState?.();
        refreshSettingTabCompat(tab);
      };
    }
  }

  const addProviderContainer = containerEl.createDiv({ cls: "wechat-add-account-container" });
  const addProviderBtn = addProviderContainer.createEl("button", {
    text: "+ 添加 AI Provider",
    cls: "wechat-btn-add",
  });
  addProviderBtn.onclick = () => showEditAiProviderModal(tab, null);

  // =========================================================================
  // 第二部分：文章 AI 编排（公众号排版）
  // =========================================================================
  new SettingCtor(containerEl)
    .setName("文章 AI 编排")
    .setDesc("针对微信公众号长文排版。通过大语言模型分析文章结构，生成符合微信规范的版式。")
    .setHeading();

  new SettingCtor(containerEl)
    .setName("启用 AI 编排")
    .setDesc("关闭后隐藏右侧工具栏中的 AI 编排入口，保留既有排版缓存结果。")
    .addToggle((toggle) =>
      toggle.setValue(tab.plugin.settings.ai.enabled === true).onChange(async (value) => {
        tab.plugin.settings.ai.enabled = value;
        await tab.plugin.saveSettings();
        tab.refreshOpenConverterAiState?.();
      })
    );

  // 默认文本 Provider 下拉框：仅过滤具备文本能力的 Provider
  const textProviders = providers.filter((p) => p.supportsText !== false && p.enabled !== false);
  new SettingCtor(containerEl)
    .setName("默认文章编排 Provider")
    .setDesc(
      textProviders.length > 0
        ? "生成公众号 AI 编排时优先使用的模型（仅列出具备文本能力的 Provider）。"
        : "还没有具备文本能力的可用 Provider，请在上方添加或在已有 Provider 中开启「文本模型」能力。"
    )
    .addDropdown((dropdown) => {
      dropdown.addOption("", "自动选择");
      textProviders.forEach((p) => {
        dropdown.addOption(p.id, p.name + " (文本: " + (p.textModel || p.model || "默认") + ")");
      });
      dropdown.setValue(defaultProviderId || "");
      dropdown.onChange(async (value) => {
        tab.plugin.settings.ai.defaultProviderId = value;
        await tab.plugin.saveSettings();
        tab.refreshOpenConverterAiState?.();
      });
    });

  const layoutFamilyOptions = getLayoutFamilyList({ includeAuto: true, includeReserved: false });
  new SettingCtor(containerEl)
    .setName("默认布局")
    .setDesc("打开 AI 编排面板时默认选中的布局。")
    .addDropdown((dropdown) => {
      layoutFamilyOptions.forEach((option) => dropdown.addOption(option.value, option.label));
      dropdown.setValue(tab.plugin.settings.ai.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO);
      dropdown.onChange(async (value) => {
        tab.plugin.settings.ai.defaultLayoutFamily = value;
        await tab.plugin.saveSettings();
        tab.refreshOpenConverterAiState?.();
      });
    });

  const colorPaletteOptions = getColorPaletteList({ includeAuto: true });
  new SettingCtor(containerEl)
    .setName("默认颜色")
    .setDesc("打开 AI 编排面板时默认选中的配色方案。")
    .addDropdown((dropdown) => {
      colorPaletteOptions.forEach((option) => dropdown.addOption(option.value, option.label));
      dropdown.setValue(tab.plugin.settings.ai.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO);
      dropdown.onChange(async (value) => {
        tab.plugin.settings.ai.defaultColorPalette = value;
        await tab.plugin.saveSettings();
        tab.refreshOpenConverterAiState?.();
      });
    });

  // AI 编排高级选项
  const advancedOptions = containerEl.createEl("details", { cls: "apple-settings-details" });
  advancedOptions.createEl("summary", {
    cls: "apple-settings-summary",
    text: "AI 编排高级选项",
  });
  const advancedArea = advancedOptions.createDiv({ cls: "apple-settings-area apple-settings-advanced-area" });

  new SettingCtor(advancedArea)
    .setName("编排时参考图片")
    .setDesc("开启后，AI 会把文中的配图和截图作为排版素材参考，不修改正文。")
    .addToggle((toggle) =>
      toggle.setValue(tab.plugin.settings.ai.includeImagesInLayout !== false).onChange(async (value) => {
        tab.plugin.settings.ai.includeImagesInLayout = value;
        await tab.plugin.saveSettings();
        tab.refreshOpenConverterAiState?.();
      })
    );

  new SettingCtor(advancedArea)
    .setName("AI 请求超时（秒）")
    .setDesc("默认 120 秒；建议保持 60 到 120 秒。")
    .addText((text) =>
      text
        .setPlaceholder("120")
        .setValue(String(Math.round((tab.plugin.settings.ai.requestTimeoutMs || 120000) / 1000)))
        .onChange(async (value) => {
          const seconds = Math.min(180, Math.max(5, parseInt(value || "120", 10) || 120));
          tab.plugin.settings.ai.requestTimeoutMs = seconds * 1000;
          await tab.plugin.saveSettings();
          tab.refreshOpenConverterAiState?.();
        })
    );

  const layoutCacheEntries = Object.values(tab.plugin.settings.ai.articleLayoutsByPath || {});
  const cachedDocCount = layoutCacheEntries.length;
  const cachedLayoutCount = layoutCacheEntries.reduce((count, entry) => {
    const normalizedEntry = normalizeArticleLayoutCacheEntry(entry);
    if (!normalizedEntry) return count;
    return count + Object.keys(normalizedEntry.familyStates || {}).length;
  }, 0);
  const cacheSetting = new SettingCtor(advancedArea)
    .setName("AI 编排缓存")
    .setDesc(
      cachedLayoutCount > 0
        ? "当前已缓存 " + cachedDocCount + " 篇文章、共 " + cachedLayoutCount + " 份编排结果。"
        : "当前还没有缓存的 AI 编排结果。"
    );

  if (cachedLayoutCount > 0) {
    cacheSetting.addButton((button) => {
      const clearCacheButton = setDestructiveButtonCompat(button.setButtonText("清空缓存"));
      clearCacheButton.onClick(async () => {
        const confirmed = typeof tab.confirmDestructiveAction === "function"
          ? await tab.confirmDestructiveAction({
              title: "清空 AI 编排缓存",
              message: "确定要清空 " + cachedDocCount + " 篇文章、共 " + cachedLayoutCount + " 份 AI 编排缓存吗？",
              confirmText: "清空",
            })
          : true;
        if (!confirmed) return;
        tab.plugin.settings.ai.articleLayoutsByPath = {};
        await tab.plugin.saveSettings();
        tab.refreshOpenConverterAiState?.();
        new NoticeCtor("已清空 AI 编排缓存");
        refreshSettingTabCompat(tab);
      });
    });
  }

  // =========================================================================
  // 第三部分：卡片 AI 封面（小红书/图片卡片生图）
  // =========================================================================
  new SettingCtor(containerEl)
    .setName("卡片 AI 封面")
    .setDesc("针对小红书/图片卡片导出。支持基于文章内容和预制风格模板生成高质感封面背景。")
    .setHeading();

  // 默认生图 Provider 下拉框：仅过滤具备生图能力的 Provider
  const imageProviders = providers.filter((p) => p.supportsImage === true && p.enabled !== false);
  new SettingCtor(containerEl)
    .setName("默认生图 Provider")
    .setDesc(
      imageProviders.length > 0
        ? "在侧边栏封面面板点击生图时默认调用的服务商（仅列出具备生图能力的 Provider）。"
        : "还没有开启「生图模型」能力的 Provider，请在上方添加或在已有 Provider 中勾选生图模型。"
    )
    .addDropdown((dropdown) => {
      dropdown.addOption("", "未设置 (按侧栏所选)");
      imageProviders.forEach((p) => {
        dropdown.addOption(p.id, p.name + " (生图: " + (p.imageModel || "默认") + ")");
      });
      dropdown.setValue(defaultImageProviderId || "");
      dropdown.onChange(async (value) => {
        tab.plugin.settings.ai.defaultImageProviderId = value;
        await tab.plugin.saveSettings();
      });
    });

  new SettingCtor(containerEl)
    .setName("默认封面呈现模式")
    .setDesc("新建笔记卡片会话时的默认封面模式。在侧边栏「封面设置」中可针对单篇随时切换。")
    .addDropdown((dropdown) => {
      dropdown.addOption("mixed", "图文混排（AI 背景 + 插件精准中文排版，推荐）");
      dropdown.addOption("full-bleed", "纯全图封面（AI 生成纯海报，无文字层）");
      dropdown.setValue(tab.plugin.settings.ai.cardCoverMode || "mixed");
      dropdown.onChange(async (value) => {
        tab.plugin.settings.ai.cardCoverMode = value;
        await tab.plugin.saveSettings();
      });
    });

  new SettingCtor(containerEl)
    .setName("侧边栏操作提示")
    .setDesc("提示：在转换器视图切换到「卡片」模式，点击右上角设置图标打开「封面设置」Tab，即可选定风格模板并一键生成封面。");
}

/**
 * 弹出添加 / 编辑 AI Provider 模态框
 * @param {AppleStyleSettingTabContract} tab
 * @param {AiProviderLike | null} provider
 */
export function showEditAiProviderModal(tab, provider) {
  const modal = createObsidianModal(tab.app);
  modal.titleEl.setText(provider ? "编辑 AI Provider" : "添加 AI Provider");

  const form = modal.contentEl.createDiv();

  // 快捷预设选择（方便一键填充）
  const presetGroup = form.createDiv({ cls: "wechat-form-group" });
  presetGroup.createEl("label", { text: "常用服务商预设（可选）" });
  const presetSelectWrap = presetGroup.createDiv({ cls: "wechat-form-select-wrap" });
  const presetSelect = presetSelectWrap.createEl("select", { cls: "wechat-form-select" });
  presetSelect.createEl("option", { value: "", text: "选择预设快速填入..." });
  COMMON_AI_PRESETS.forEach((preset) => {
    presetSelect.createEl("option", { value: preset.id, text: preset.label });
  });

  // 名称输入
  const nameGroup = form.createDiv({ cls: "wechat-form-group" });
  nameGroup.createEl("label", { text: "Provider 名称" });
  const nameInput = nameGroup.createEl("input", {
    type: "text",
    placeholder: "例如：SiliconFlow / OpenAI 官方 / 自建网关",
    value: provider?.name || "",
  });

  // 备注输入
  const notesGroup = form.createDiv({ cls: "wechat-form-group" });
  notesGroup.createEl("label", { text: "备注说明 (可选)" });
  const notesInput = notesGroup.createEl("input", {
    type: "text",
    placeholder: "例如：免费额度 / 主力生图与排版 / 公司报销",
    value: provider?.notes || "",
  });

  // 类型选择
  const kindGroup = form.createDiv({ cls: "wechat-form-group" });
  kindGroup.createEl("label", { text: "接口协议类型" });
  const kindSelectWrap = kindGroup.createDiv({ cls: "wechat-form-select-wrap" });
  const kindSelect = kindSelectWrap.createEl("select", { cls: "wechat-form-select" });
  const providerKinds = [
    { value: AI_PROVIDER_KINDS.OPENAI_COMPATIBLE, label: "OpenAI 兼容接口 (推荐)" },
    { value: AI_PROVIDER_KINDS.GEMINI, label: "Gemini 格式" },
    { value: AI_PROVIDER_KINDS.ANTHROPIC, label: "Anthropic 格式" },
  ];
  providerKinds.forEach((kind) => {
    const option = kindSelect.createEl("option", { value: kind.value, text: kind.label });
    if ((provider?.kind || AI_PROVIDER_KINDS.OPENAI_COMPATIBLE) === kind.value) {
      option.selected = true;
    }
  });

  // Base URL 输入
  const baseUrlGroup = form.createDiv({ cls: "wechat-form-group" });
  baseUrlGroup.createEl("label", { text: "Base URL" });
  const baseUrlInput = baseUrlGroup.createEl("input", {
    type: "text",
    placeholder: "https://api.openai.com/v1 或 https://api.siliconflow.cn/v1",
    value: provider?.baseUrl || "https://api.openai.com/v1",
  });

  // API Key 输入（带明暗文切换）
  const apiKeyGroup = form.createDiv({ cls: "wechat-form-group" });
  apiKeyGroup.createEl("label", { text: "API Key" });
  const apiKeyWrap = apiKeyGroup.createDiv({ attr: { style: "position: relative; display: flex; align-items: center;" } });
  const apiKeyInput = apiKeyWrap.createEl("input", {
    type: "password",
    placeholder: "sk-...",
    value: provider?.apiKey || "",
    attr: { style: "width: 100%; padding-right: 40px;" },
  });
  const toggleVisibilityBtn = apiKeyWrap.createEl("button", {
    text: "👁️",
    cls: "wechat-btn-small",
    attr: { type: "button", style: "position: absolute; right: 4px; padding: 2px 8px;" },
  });
  toggleVisibilityBtn.onclick = () => {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
  };

  // =========================================================================
  // 能力区分：文本模型 & 生图模型
  // =========================================================================
  const capSection = form.createDiv({
    cls: "apple-settings-area",
    attr: { style: "margin: 12px 0; padding: 12px; background: var(--background-secondary); border-radius: 6px;" },
  });
  capSection.createEl("div", {
    text: "支持能力与用途（至少勾选一项）",
    attr: { style: "font-weight: 600; margin-bottom: 8px; font-size: 13px;" },
  });

  // 1. 文本模型能力
  const textCapWrap = capSection.createDiv({ attr: { style: "margin-bottom: 10px;" } });
  const textCapLabel = textCapWrap.createEl("label", { attr: { style: "display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer;" } });
  const textCapCheckbox = textCapLabel.createEl("input", {
    type: "checkbox",
  });
  textCapCheckbox.checked = provider ? provider.supportsText !== false : true;
  textCapLabel.createSpan({ text: "📝 文本模型（用于公众号 AI 编排与文章分析）" });

  const textModelGroup = textCapWrap.createDiv({ attr: { style: "margin: 6px 0 0 24px;" } });
  const textModelInput = textModelGroup.createEl("input", {
    type: "text",
    placeholder: "文本模型名称，如 deepseek-ai/DeepSeek-V3 或 gpt-4.1-mini",
    value: provider?.textModel || provider?.model || "gpt-4.1-mini",
    attr: { style: "width: 100%;" },
  });

  // 2. 生图模型能力
  const imgCapWrap = capSection.createDiv();
  const imgCapLabel = imgCapWrap.createEl("label", { attr: { style: "display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer;" } });
  const imgCapCheckbox = imgCapLabel.createEl("input", {
    type: "checkbox",
  });
  imgCapCheckbox.checked = provider ? provider.supportsImage === true : false;
  imgCapLabel.createSpan({ text: "🎨 生图模型（用于小红书/图片卡片封面生图）" });

  const imgModelGroup = imgCapWrap.createDiv({ attr: { style: "margin: 6px 0 0 24px;" } });
  const imgModelInput = imgModelGroup.createEl("input", {
    type: "text",
    placeholder: "生图模型名称，如 black-forest-labs/FLUX.1-schnell 或 dall-e-3",
    value: provider?.imageModel || "",
    attr: { style: "width: 100%;" },
  });

  const syncCapDisplay = () => {
    textModelGroup.setCssStyles({ display: textCapCheckbox.checked ? 'block' : 'none' });
    imgModelGroup.setCssStyles({ display: imgCapCheckbox.checked ? 'block' : 'none' });
  };
  textCapCheckbox.addEventListener("change", syncCapDisplay);
  imgCapCheckbox.addEventListener("change", syncCapDisplay);
  syncCapDisplay();

  // 预设选择联动
  presetSelect.addEventListener("change", () => {
    const selectedPreset = COMMON_AI_PRESETS.find((p) => p.id === presetSelect.value);
    if (!selectedPreset) return;
    if (!nameInput.value.trim() || nameInput.value === "未命名 Provider") {
      nameInput.value = selectedPreset.label.split(" ")[0];
    }
    kindSelect.value = selectedPreset.kind;
    baseUrlInput.value = selectedPreset.baseUrl;
    textCapCheckbox.checked = selectedPreset.supportsText;
    textModelInput.value = selectedPreset.textModel;
    imgCapCheckbox.checked = selectedPreset.supportsImage;
    imgModelInput.value = selectedPreset.imageModel;
    syncCapDisplay();
  });

  // 启用状态
  const enabledGroup = form.createDiv({ cls: "wechat-form-group" });
  enabledGroup.createEl("label", { text: "启用状态" });
  const enabledWrap = enabledGroup.createDiv({ cls: "wechat-provider-enabled" });
  const enabledToggle = enabledWrap.createEl("label", { cls: "apple-toggle" }).createEl("input", {
    type: "checkbox",
    cls: "apple-toggle-input",
  });
  enabledToggle.checked = provider?.enabled !== false;
  enabledToggle.parentElement.createEl("span", { cls: "apple-toggle-slider" });
  enabledWrap.createEl("span", {
    cls: "wechat-provider-enabled-text",
    text: "启用后方可在文章编排和卡片生图中调用",
  });

  // 底部按钮栏
  const btnRow = form.createDiv({ cls: "wechat-modal-buttons" });
  const cancelBtn = btnRow.createEl("button", { text: "取消" });
  cancelBtn.onclick = () => modal.close();

  const testBtn = btnRow.createEl("button", { text: "测试连接", cls: "wechat-btn-test" });
  testBtn.onclick = async () => {
    const candidate = normalizeAiProvider({
      id: provider?.id,
      name: nameInput.value.trim() || "未命名 Provider",
      kind: kindSelect.value,
      baseUrl: baseUrlInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      supportsText: textCapCheckbox.checked,
      textModel: textModelInput.value.trim(),
      supportsImage: imgCapCheckbox.checked,
      imageModel: imgModelInput.value.trim(),
      notes: notesInput.value.trim(),
      enabled: enabledToggle.checked,
    });
    const issueSummary = summarizeAiProviderIssues(candidate, "any");
    if (!isAiProviderRunnable(candidate, "any")) {
      new Notice("请先补全 Provider 配置：" + issueSummary);
      return;
    }
    testBtn.disabled = true;
    testBtn.textContent = "测试中...";
    try {
      await testAiProviderConnection(
        candidate,
        createObsidianFetchAdapter({ requestUrl: getObsidianRequestUrl(), request: getObsidianRequest() })
      );
      new Notice("✅ AI Provider 连通性测试通过！");
    } catch (error) {
      new Notice("❌ 连接失败: " + toReadableError(error).message);
    }
    testBtn.disabled = false;
    testBtn.textContent = "测试连接";
  };

  const saveBtn = btnRow.createEl("button", { text: "保存", cls: "mod-cta" });
  saveBtn.onclick = async () => {
    if (!textCapCheckbox.checked && !imgCapCheckbox.checked) {
      new Notice("请至少勾选一项能力（文本模型或生图模型）");
      return;
    }

    const nextProvider = normalizeAiProvider({
      id: provider?.id,
      name: nameInput.value.trim() || "未命名 Provider",
      kind: kindSelect.value,
      baseUrl: baseUrlInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      supportsText: textCapCheckbox.checked,
      textModel: textModelInput.value.trim(),
      supportsImage: imgCapCheckbox.checked,
      imageModel: imgModelInput.value.trim(),
      notes: notesInput.value.trim(),
      enabled: enabledToggle.checked,
    });

    const issues = getAiProviderIssues(nextProvider, "any").filter((issue) => issue !== "disabled");
    if (issues.length > 0) {
      new Notice("请补全 Provider 配置：" + summarizeAiProviderIssues(nextProvider, "any"));
      return;
    }

    const providers = tab.plugin.settings.ai.providers || [];
    if (provider) {
      tab.plugin.settings.ai.providers = providers.map((item) => (item.id === provider.id ? nextProvider : item));
    } else {
      tab.plugin.settings.ai.providers.push(nextProvider);
      if (!tab.plugin.settings.ai.defaultProviderId && nextProvider.supportsText) {
        tab.plugin.settings.ai.defaultProviderId = nextProvider.id;
      }
      if (!tab.plugin.settings.ai.defaultImageProviderId && nextProvider.supportsImage) {
        tab.plugin.settings.ai.defaultImageProviderId = nextProvider.id;
      }
    }

    await tab.plugin.saveSettings();
    tab.refreshOpenConverterAiState?.();
    modal.close();
    refreshSettingTabCompat(tab);
    new Notice(provider ? "✅ AI Provider 已更新" : "✅ AI Provider 已添加");
  };

  modal.open();
}

/**
 * 混入 AppleStyleSettingTab 原型的兼容方法对象
 * @type {AiSettingsMethodsContract & ThisType<AppleStyleSettingTabContract>}
 */
export const aiSettingsMethods = {
  renderAiSettingsSection(containerEl) {
    renderAiSettingsTab(this, containerEl);
  },
  renderAiSettingsTab(containerEl) {
    renderAiSettingsTab(this, containerEl);
  },
  showEditAiProviderModal(provider) {
    showEditAiProviderModal(this, provider);
  },
};
