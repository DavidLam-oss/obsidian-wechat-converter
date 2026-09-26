/**
 * ## 核心功能

提供添加与编辑 AI Provider 凭据的独立模态弹窗（Modal）。
包含预设模板选取、基础服务地址与 Key 录入、能力区分（文本模型与生图模型）以及实时连通性测试。

## 设计原则

- 严格遵守无 emoji 规范；
- 遵守单文件软线 800 行约束；
- 使用 Obsidian 原生 Modal 与 DOM 操作 API。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS settings modal handles dynamic Obsidian UI and API responses */

import {
  Notice,
  AI_PROVIDER_KINDS,
  COMMON_AI_PRESETS,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  getAiProviderIssues,
  refreshSettingTabCompat,
  testAiProviderConnection,
  createObsidianFetchAdapter,
  getObsidianRequestUrl,
  getObsidianRequest,
  toReadableError,
  normalizeAiProvider,
  createObsidianModal,
} from "../apple-style-view-shared.js";

/**
 * 弹出添加 / 编辑 AI Provider 模态框
 * @param {any} tab
 * @param {any} provider
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
    text: "显示",
    cls: "wechat-btn-small",
    attr: { type: "button", style: "position: absolute; right: 4px; padding: 2px 8px;" },
  });
  toggleVisibilityBtn.onclick = () => {
    const isPassword = apiKeyInput.type === "password";
    apiKeyInput.type = isPassword ? "text" : "password";
    toggleVisibilityBtn.textContent = isPassword ? "隐藏" : "显示";
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
  textCapLabel.createSpan({ text: "文本模型（用于公众号 AI 编排与文章分析）" });

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
  imgCapLabel.createSpan({ text: "生图模型（用于小红书/图片卡片封面生图）" });

  const imgModelGroup = imgCapWrap.createDiv({ attr: { style: "margin: 6px 0 0 24px;" } });
  const imgModelInput = imgModelGroup.createEl("input", {
    type: "text",
    placeholder: "生图模型名称，如 black-forest-labs/FLUX.1-schnell 或 dall-e-3",
    value: provider?.imageModel || "",
    attr: { style: "width: 100%;" },
  });

  const syncCapDisplay = () => {
    textModelGroup.setCssStyles({ display: textCapCheckbox.checked ? "block" : "none" });
    imgModelGroup.setCssStyles({ display: imgCapCheckbox.checked ? "block" : "none" });
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
      new Notice("AI Provider 连通性测试通过！");
    } catch (error) {
      new Notice("连接失败: " + toReadableError(error).message);
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
    new Notice(provider ? "AI Provider 已更新" : "AI Provider 已添加");
  };

  modal.open();
}
