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
  getLayoutFamilyList,
  getColorPaletteList,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  normalizeArticleLayoutCacheEntry,
  setDestructiveButtonCompat,
  refreshSettingTabCompat,
  testAiProviderConnection,
  createObsidianFetchAdapter,
  getObsidianRequestUrl,
  getObsidianRequest,
  toReadableError,
  getActiveWindowValue,
} from "../apple-style-view-shared.js";
import { showEditAiProviderModal } from "./ai-provider-modal.js";

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
      cls: "setting-item-description ai-settings-empty-tip",
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
        nameRow.createEl("span", { text: "默认文本", cls: "wechat-account-badge" });
      }
      if (isImageDefault) {
        nameRow.createEl("span", { text: "默认生图", cls: "wechat-account-badge is-default-image" });
      }

      if (provider.enabled === false) {
        nameRow.createEl("span", { text: "已停用", cls: "wechat-account-badge is-disabled" });
      } else if (isAnyRunnable) {
        nameRow.createEl("span", { text: "可用", cls: "wechat-account-badge is-runnable" });
      } else {
        nameRow.createEl("span", { text: "待补全", cls: "wechat-account-badge is-pending" });
      }

      // 能力徽标行
      const capRow = info.createDiv({ cls: "wechat-account-appid ai-capability-row" });
      if (provider.supportsText !== false) {
        capRow.createEl("span", {
          text: "文本: " + (provider.textModel || provider.model || "未设置"),
          cls: "ai-cap-tag",
        });
      }
      if (provider.supportsImage === true) {
        capRow.createEl("span", {
          text: "生图: " + (provider.imageModel || "未设置"),
          cls: "ai-cap-tag is-accent",
        });
      }
      if (provider.supportsText === false && !provider.supportsImage) {
        capRow.createEl("span", {
          text: "未启用任何能力",
          cls: "ai-cap-tag is-error",
        });
      }

      // 备注说明
      if (provider.notes) {
        info.createDiv({
          text: "备注: " + provider.notes,
          cls: "setting-item-description ai-provider-notes",
        });
      }

      // 状态摘要行
      info.createDiv({
        text: provider.kind + " · " + summarizeAiProviderIssues(provider, "any"),
        cls: "setting-item-description ai-provider-status",
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
          new NoticeCtor(provider.name + " 连通性测试通过！");
        } catch (error) {
          new NoticeCtor(provider.name + " 连接失败: " + toReadableError(error).message);
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

  // =========================================================================
  // 第四部分：摄影图库与搜索服务（Unsplash）
  // =========================================================================
  new SettingCtor(containerEl)
    .setName("摄影图库与搜索服务")
    .setDesc("配置摄影图库 API 凭据。配合小红书/图片卡片封面，支持按关键词精准搜索高质量摄影大片。")
    .setHeading();

  const unsplashSetting = new SettingCtor(containerEl)
    .setName("Unsplash Access Key")
    .setDesc("用于卡片封面精准关键词搜索。个人免费开发者账号每小时可享有 50 次搜索额度。");

  /** @type {HTMLInputElement | null} */
  let unsplashKeyInputEl = null;

  unsplashSetting.addText((text) => {
    unsplashKeyInputEl = text.inputEl;
    text.inputEl.type = "password";
    text
      .setPlaceholder("例如: d8f3a9e...")
      .setValue(tab.plugin.settings.unsplashAccessKey || "")
      .onChange(async (value) => {
        tab.plugin.settings.unsplashAccessKey = (value || "").trim();
        await tab.plugin.saveSettings();
      });
  });

  unsplashSetting.addButton((button) => {
    button
      .setButtonText("显示")
      .setTooltip("切换明文与密文显示")
      .onClick(() => {
        if (!unsplashKeyInputEl) return;
        const isPassword = unsplashKeyInputEl.type === "password";
        unsplashKeyInputEl.type = isPassword ? "text" : "password";
        button.setButtonText(isPassword ? "隐藏" : "显示");
      });
  });

  unsplashSetting.addButton((button) => {
    button
      .setButtonText("测试连接")
      .setTooltip("验证 Access Key 有效性")
      .onClick(async () => {
        const key = (tab.plugin.settings.unsplashAccessKey || "").trim();
        if (!key) {
          new NoticeCtor("请先输入 Unsplash Access Key");
          return;
        }
        button.setButtonText("测试中...");
        button.setDisabled(true);
        try {
          const requestUrlFn = obsidian.requestUrl || getObsidianRequestUrl();
          const response = await requestUrlFn({
            url: "https://api.unsplash.com/photos/random?count=1",
            method: "GET",
            headers: {
              Authorization: `Client-ID ${key}`,
            },
          });
          if (response.status === 200) {
            new NoticeCtor("Unsplash 连接成功，凭据有效");
          } else {
            new NoticeCtor(`连接失败 (HTTP ${response.status})，请检查 Access Key 是否正确`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          new NoticeCtor(`连接测试失败: ${msg}`);
        } finally {
          button.setButtonText("测试连接");
          button.setDisabled(false);
        }
      });
  });

  unsplashSetting.addButton((button) => {
    button
      .setButtonText("清空")
      .setTooltip("清空已保存的 Access Key")
      .onClick(async () => {
        tab.plugin.settings.unsplashAccessKey = "";
        if (unsplashKeyInputEl) {
          unsplashKeyInputEl.value = "";
        }
        await tab.plugin.saveSettings();
        new NoticeCtor("已清空 Unsplash Access Key");
      });
  });

  new SettingCtor(containerEl)
    .setName("申请免费 Access Key 指引")
}

export { showEditAiProviderModal };

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

