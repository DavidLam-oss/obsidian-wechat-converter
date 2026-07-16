/*
## 核心功能

实现转换器主面板的 core 交互能力。

## 输入

接收 AppleStyleView 实例状态、活动笔记、渲染结果、用户点击和面板控件事件。

## 输出

输出 `coreMethods`，驱动预览刷新、样式选择、剪贴板或 AI layout 面板行为。

## 定位

位于 views/converter/，只处理转换器视图交互；底层转换和同步逻辑调用 services/。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  createRenderPipelines,
  buildRenderRuntime,
  resolveMarkdownSource,
  renderObsidianTripletMarkdown,
  renderMermaidCodeBlocks,
  canUseNativePreviewFastPath,
  renderNativeMarkdown,
  setElementHtml,
  obsidianApi,
  MarkdownView,
  Notice,
  toReadableError,
  isRecord,
  toRecord,
  toOptionalText,
  APPLE_STYLE_VIEW,
  APPLE_STYLE_VIEW_TITLE,
  PLACEHOLDER_ICON_DATA_URL,
  AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS,
  isMobileClient,
} from '../apple-style-view-shared.js';
import { inlineCustomCss, resolveCustomCssFromSettings } from '../../services/custom-css-inliner.js';

/** @type {CoreMethodsContract & ThisType<AppleStyleViewContract>} */
export const coreMethods = {
getViewType() {
  return APPLE_STYLE_VIEW;
}
,

getDisplayText() {
  return APPLE_STYLE_VIEW_TITLE;
}
,

getIcon() {
  return 'wand';
}
,

async onOpen() {
  console.log('🍎 发布助手面板打开');
  const container = /** @type {ObsidianElementLike} */ (this.containerEl.children[1]);
  container.empty();
  container.addClass('apple-converter-container');
  if (isMobileClient(this.app)) {
    container.addClass('apple-converter-mobile');
  }

  // 加载依赖
  await this.loadDependencies();

  // 创建设置面板
  this.createSettingsPanel(container);

  // 创建预览区 - 根据设置决定是否使用手机框
  const usePhoneFrame = this.plugin.settings.usePhoneFrame && !isMobileClient(this.app);
  const previewWrapper = container.createEl('div', {
    cls: `apple-preview-wrapper ${usePhoneFrame ? 'mode-phone' : 'mode-classic'}`
  });

  // Light Dismiss: 点击预览区域(手机框外)收起设置面板
  previewWrapper.addEventListener('click', () => {
    this.closeTransientPanels();
  });

  if (usePhoneFrame) {
    // === 手机仿真模式 ===
    const phoneFrame = previewWrapper.createEl('div', { cls: 'apple-phone-frame' });

    // 1. 顶部导航栏 (模拟微信)
    const header = phoneFrame.createEl('div', { cls: 'apple-phone-header' });
    header.createEl('span', { cls: 'title', text: '公众号预览' });
    header.createEl('span', { cls: 'dots', text: '•••' });

    // 2. 内容区域 (挂载到手机框内)
    this.previewContainer = phoneFrame.createEl('div', {
      cls: 'apple-converter-preview',
    });

    // 3. 底部 Home Indicator
    phoneFrame.createEl('div', { cls: 'apple-home-indicator' });
  } else {
    // === 经典无框模式 ===
    // 直接挂载到 wrapper，且 wrapper 样式会变为填满父容器
    this.previewContainer = previewWrapper.createEl('div', {
      cls: 'apple-converter-preview',
    });
  }

  this.setPlaceholder();

  // 监听文件切换
  this.registerActiveFileChange();

  // 初始化同步滚动
  const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView) this.registerScrollSync(activeView);

  // 自动转换当前文档
  window.setTimeout(async () => {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && this.converter) {
      await this.convertCurrent(true);
    }
  }, 500);
}
,

registerActiveFileChange() {
  // 监听文件切换
  this.registerEvent(
    this.app.workspace.on('active-leaf-change', async () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file) {
        this.lastActiveFile = activeView.file;
        const nextSourcePath = activeView.file.path || '';
        if (nextSourcePath && nextSourcePath !== this.lastResolvedSourcePath) {
          this.markAiLayoutSourceSwitch(nextSourcePath);
        }
      }
      if (activeView && this.converter) {
        this.scheduleActiveLeafRender(activeView);
      }
      this.updateCurrentDoc();

      // 更新滚动同步绑定
      if (activeView) {
        this.registerScrollSync(activeView);
      }

    })
  );

  // 监听编辑器内容变化 (实时预览)
  /**
   * @param {(...args: unknown[]) => unknown} func
   * @param {number} wait
   * @returns {(...args: unknown[]) => void}
   */
  const debounce = (func, wait) => {
    /** @type {number | undefined} */
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => func(...args), wait);
    };
  };

  const debouncedConvert = debounce(async () => {
    // 1. 真正的可见性检查 (True Visibility Check)
    // 如果插件被折叠、隐藏或从未打开，offsetParent 为 null
    if (!this.containerEl.offsetParent) return;

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    // 仅当当前编辑的文件是最后激活的文件时才更新
    if (activeView && activeView.file && this.lastActiveFile && activeView.file.path === this.lastActiveFile.path) {
      await this.convertCurrent(true, {
        sourceOverride: {
          markdown: activeView.editor.getValue(),
          sourcePath: activeView.file.path || '',
        },
      });
    }
  }, 500); // 500ms 延迟

  this.registerEvent(
    this.app.workspace.on('editor-change', debouncedConvert)
  );
}
,

scheduleActiveLeafRender(activeViewOverride = null) {
  if (this.activeLeafRenderTimer) {
    window.clearTimeout(this.activeLeafRenderTimer);
    this.activeLeafRenderTimer = null;
  }

  // 让出当前 active-leaf 事件栈，但不额外等待一帧，避免切文档时可见卡顿。
  this.activeLeafRenderTimer = window.setTimeout(() => {
    this.activeLeafRenderTimer = null;
    const activeView = activeViewOverride || this.app.workspace.getActiveViewOfType(MarkdownView);
    const sourceOverride = activeView && activeView.file
      ? {
        markdown: activeView.editor.getValue(),
        sourcePath: activeView.file.path || '',
      }
      : null;
    this.convertCurrent(true, {
      showLoading: true,
      loadingText: '正在切换文章预览...',
      loadingDelay: 120,
      sourceOverride,
    });
  }, 0);
}
,

scheduleSidePaddingPreview(delay = 120) {
  if (this.sidePaddingPreviewTimer) {
    window.clearTimeout(this.sidePaddingPreviewTimer);
    this.sidePaddingPreviewTimer = null;
  }
  this.sidePaddingPreviewTimer = window.setTimeout(() => {
    this.sidePaddingPreviewTimer = null;
    this.convertCurrent(true);
  }, delay);
}
,

setPreviewLoading(active, text = '正在渲染预览...') {
  if (!this.previewContainer) return;
  if (active) {
    this.previewContainer.addClass('apple-preview-loading');
    this.previewContainer.dataset.loadingText = text;
    return;
  }
  this.previewContainer.removeClass('apple-preview-loading');
  delete this.previewContainer.dataset.loadingText;
}
,

markAiLayoutSourceSwitch(sourcePath = '') {
  if (!sourcePath) return;
  this.aiLayoutSourceSwitchPath = sourcePath;
  this.aiLayoutStaleSuppressPath = sourcePath;
  this.aiLayoutStaleSuppressUntil = Date.now() + AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS;
  if (this.aiLayoutStaleSuppressTimer) {
    window.clearTimeout(this.aiLayoutStaleSuppressTimer);
  }
  this.aiLayoutStaleSuppressTimer = window.setTimeout(() => {
    this.aiLayoutStaleSuppressTimer = null;
    if (
      this.aiLayoutStaleSuppressPath === sourcePath
      && Date.now() >= this.aiLayoutStaleSuppressUntil
    ) {
      this.aiLayoutStaleSuppressPath = '';
      this.aiLayoutStaleSuppressUntil = 0;
    }
    if (this.shouldSyncAiLayoutUi()) {
      this.refreshAiLayoutPanel();
    }
  }, AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS + 40);
}
,

completeAiLayoutSourceSwitch(sourcePath = '') {
  if (sourcePath && this.aiLayoutSourceSwitchPath === sourcePath) {
    this.aiLayoutSourceSwitchPath = '';
  }
}
,

isAiLayoutStaleSuppressedForPath(sourcePath = '') {
  if (!sourcePath || this.aiLayoutStaleSuppressPath !== sourcePath) return false;
  if (Date.now() < this.aiLayoutStaleSuppressUntil) return true;
  this.aiLayoutStaleSuppressPath = '';
  this.aiLayoutStaleSuppressUntil = 0;
  return false;
}
,

registerScrollSync(activeView) {
  // 1. 清理旧的监听器
  if (this.activeEditorScroller && this.editorScrollListener) {
    this.activeEditorScroller.removeEventListener('scroll', this.editorScrollListener);
  }
  if (this.previewContainer && this.previewScrollListener) {
    this.previewContainer.removeEventListener('scroll', this.previewScrollListener);
  }
  if (this.cancelScrollSyncFrame) {
    this.cancelScrollSyncFrame();
  }

  this.activeEditorScroller = null;
  this.editorScrollListener = null;
  this.previewScrollListener = null;
  this.scrollSyncFrame = null;
  this.cancelScrollSyncFrame = null;
  this.pendingScrollSyncSource = '';
  this.expectedEditorScrollTop = null;
  this.expectedPreviewScrollTop = null;

  if (!activeView) return;

  // 2. 获取 Editor Scroller
  const editorScroller = /** @type {ObsidianElementLike | null} */ (activeView.contentEl.querySelector('.cm-scroller'));
  if (!editorScroller) return;
  this.activeEditorScroller = editorScroller;

  /**
   * @param {ObsidianElementLike} element
   * @param {'expectedEditorScrollTop' | 'expectedPreviewScrollTop'} fieldName
   * @returns {boolean}
   */
  const consumeExpectedScroll = (element, fieldName) => {
    const expected = this[fieldName];
    if (!Number.isFinite(expected)) return false;
    if (Math.abs(element.scrollTop - expected) <= 1) return true;
    this[fieldName] = null;
    return false;
  };

  /**
   * @param {'editor' | 'preview'} source
   */
  const syncScrollPosition = (source) => {
    if (!this.containerEl.offsetParent || !this.previewContainer) return;
    const editorHeight = editorScroller.scrollHeight - editorScroller.clientHeight;
    const previewHeight = this.previewContainer.scrollHeight - this.previewContainer.clientHeight;
    if (editorHeight <= 0 || previewHeight <= 0) return;

    if (source === 'editor') {
      let targetScrollTop;
      if (editorScroller.scrollTop === 0) {
        targetScrollTop = 0;
      } else if (Math.abs(editorScroller.scrollTop - editorHeight) < 2) {
        targetScrollTop = previewHeight;
      } else {
        targetScrollTop = (editorScroller.scrollTop / editorHeight) * previewHeight;
      }

      if (Math.abs(this.previewContainer.scrollTop - targetScrollTop) <= 1) return;
      this.expectedPreviewScrollTop = targetScrollTop;
      this.previewContainer.scrollTop = targetScrollTop;
      return;
    }

    let targetScrollTop;
    if (this.previewContainer.scrollTop === 0) {
      targetScrollTop = 0;
    } else if (Math.abs(this.previewContainer.scrollTop - previewHeight) < 2) {
      targetScrollTop = editorHeight;
    } else {
      const ratio = this.previewContainer.scrollTop / previewHeight;
      targetScrollTop = ratio * editorHeight;
    }

    if (Math.abs(editorScroller.scrollTop - targetScrollTop) <= 1) return;
    this.expectedEditorScrollTop = targetScrollTop;
    editorScroller.scrollTop = targetScrollTop;
  };

  /**
   * @param {'editor' | 'preview'} source
   */
  const scheduleScrollSync = (source) => {
    this.pendingScrollSyncSource = source;
    if (this.scrollSyncFrame !== null) return;

    const run = () => {
      this.scrollSyncFrame = null;
      this.cancelScrollSyncFrame = null;
      const pendingSource = this.pendingScrollSyncSource;
      this.pendingScrollSyncSource = '';
      if (pendingSource) {
        syncScrollPosition(pendingSource);
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      const frameId = window.requestAnimationFrame(run);
      this.scrollSyncFrame = frameId;
      this.cancelScrollSyncFrame = () => {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(frameId);
        }
      };
    } else {
      const timeoutId = window.setTimeout(run, 16);
      this.scrollSyncFrame = timeoutId;
      this.cancelScrollSyncFrame = () => window.clearTimeout(timeoutId);
    }
  };

  // === Listener A: Editor -> Preview ===
  this.editorScrollListener = () => {
    if (!this.containerEl.offsetParent) return;
    if (consumeExpectedScroll(editorScroller, 'expectedEditorScrollTop')) return;
    scheduleScrollSync('editor');
  };

  // === Listener B: Preview -> Editor ===
  this.previewScrollListener = () => {
    if (!this.containerEl.offsetParent || !this.previewContainer) return;
    if (consumeExpectedScroll(this.previewContainer, 'expectedPreviewScrollTop')) return;
    scheduleScrollSync('preview');
  };

  // 4. 绑定监听 (使用 passive 提升性能)
  editorScroller.addEventListener('scroll', this.editorScrollListener, { passive: true });
  this.previewContainer.addEventListener('scroll', this.previewScrollListener, { passive: true });
}
,

async loadDependencies() {
  const adapter = this.app.vault.adapter;
  // Use dynamic path from manifest to allow folder renaming
  const basePath = this.plugin.manifest?.dir || '';

  try {
    const runtime = /** @type {{ theme: ThemeRuntimeLike, converter: ConverterRuntimeLike }} */ (await buildRenderRuntime({
      settings: this.plugin.settings,
      app: this.app,
      adapter,
      basePath,
    }));
    this.theme = runtime.theme;
    this.converter = runtime.converter;
    const pipelines = /** @type {{ nativePipeline: RenderPipelineLike }} */ (createRenderPipelines({
      candidateRenderer: async (markdown, context = {}) => {
        const renderContext = /** @type {RenderCandidateContextLike} */ (toRecord(context));
        const contextSettings = isRecord(renderContext.settings)
          ? /** @type {PluginSettingsLike} */ (renderContext.settings)
          : this.plugin.settings;
        if (canUseNativePreviewFastPath(markdown)) {
          const nativeHtml = /** @type {unknown} */ (await renderNativeMarkdown({
            converter: this.converter,
            markdown: String(markdown || ''),
            sourcePath: toOptionalText(renderContext.sourcePath),
          }));
          return String(nativeHtml || '');
        }
        return /** @type {Promise<string>} */ (renderObsidianTripletMarkdown({
          app: this.app,
          converter: this.converter,
          markdown: String(markdown || ''),
          sourcePath: toOptionalText(renderContext.sourcePath),
          settings: contextSettings,
          component: this,
          markdownRenderer: obsidianApi.MarkdownRenderer,
          mermaidCodeRenderer: renderMermaidCodeBlocks,
          rasterizeMermaid: false,
          preserveSvgStyleTags: true,
        }));
      },
    }));
    this.nativeRenderPipeline = pipelines.nativePipeline;

    console.log('✅ 依赖加载完成');
  } catch (error) {
    console.error('❌ 依赖加载失败:', error);
    new Notice('依赖加载失败: ' + toReadableError(error).message);
  }
}
,

async onThemeChange(value, grid) {
  this.plugin.settings.theme = value;
  // 切换主题时重置间距微调为「跟随主题」(null)：
  // 每个主题展示各自默认间距，不跨主题持久化手动微调，避免回不到默认值。
  this.plugin.settings.lineHeight = null;
  this.plugin.settings.paragraphGap = null;
  this.plugin.settings.letterSpacing = null;
  await this.plugin.saveSettings();
  this.updateButtonActive(grid, value);
  this.theme?.update({ theme: value, lineHeight: null, paragraphGap: null, letterSpacing: null });
  this.refreshSpacingSliders?.();
  await this.convertCurrent(true);
}
,

async onFontFamilyChange(value) {
  this.plugin.settings.fontFamily = value;
  await this.plugin.saveSettings();
  this.theme?.update({ fontFamily: value });
  await this.convertCurrent(true);
}
,

async onFontSizeChange(value, grid) {
  this.plugin.settings.fontSize = value;
  await this.plugin.saveSettings();
  this.updateButtonActive(grid, value);
  this.theme?.update({ fontSize: value });
  await this.convertCurrent(true);
}
,

async onColorChange(value, grid) {
  this.plugin.settings.themeColor = value;
  await this.plugin.saveSettings();
  this.updateButtonActive(grid, value);
  this.theme?.update({ themeColor: value });

  // 移除：不再更改全局 CSS 变量，保持设置面板 UI 为默认蓝色 (#0071e3)
  // const colorHex = this.theme.getThemeColorValue();
  // this.containerEl.style.setProperty('--apple-accent', colorHex);

  await this.convertCurrent(true);
}
,

async onQuoteCalloutStyleModeChange(value) {
  const nextValue = value === 'neutral' ? 'neutral' : 'theme';
  this.plugin.settings.quoteCalloutStyleMode = nextValue;
  await this.plugin.saveSettings();
  this.theme?.update({ quoteCalloutStyleMode: nextValue });
  await this.convertCurrent(true);
}
,

async onMacCodeBlockChange(checked) {
  this.plugin.settings.macCodeBlock = checked;
  await this.plugin.saveSettings();
  this.theme?.update({ macCodeBlock: checked });
  // 重建 converter
  if (this.converter) {
    this.converter.reinit();
    await this.converter.initMarkdownIt();
  }
  await this.convertCurrent(true);
}
,

async onCodeLineNumberChange(checked) {
  this.plugin.settings.codeLineNumber = checked;
  await this.plugin.saveSettings();
  this.theme?.update({ codeLineNumber: checked });
  // 重建 converter
  if (this.converter) {
    this.converter.reinit();
    await this.converter.initMarkdownIt();
  }
  await this.convertCurrent(true);
}
,

updateButtonActive(grid, value) {
  const buttons = Array.from(grid.querySelectorAll('button'));
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value == value);
  });
}
,

getActiveRenderPipeline() {
  return /** @type {RenderPipelineLike | null} */ (this.nativeRenderPipeline);
}
,

async renderMarkdownForPreview(markdown, sourcePath) {
  const pipeline = this.getActiveRenderPipeline();
  if (!pipeline) {
    throw new Error('渲染管线未初始化');
  }
  const html = await pipeline.renderForPreview(markdown, {
    sourcePath,
    settings: this.plugin.settings,
  });

  return this.applyCustomCss(html);
}
,

/**
 * 应用用户自定义 CSS（仅非 AI 编排模式）。
 * 自定义 CSS 与 AI 编排是两套独立系统：AI 模式下不套用，避免互相干扰。
 * @param {string} html
 * @returns {Promise<string>}
 */
async applyCustomCss(html) {
  if (!html) return html;
  if (this.aiPreviewApplied) return html;
  const customCss = await resolveCustomCssFromSettings(this.plugin);
  if (!customCss) return html;
  return inlineCustomCss(html, customCss);
}
,

updateCurrentDoc() {
  const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView && this.docTitleText) {
    this.docTitleText.setText(activeView.file.basename);
    this.docTitleText.setCssStyles({ color: 'var(--apple-primary)' }); // 恢复激活色
  } else if (this.lastActiveFile && this.docTitleText) {
    this.docTitleText.setText(this.lastActiveFile.basename);
    this.docTitleText.setCssStyles({ color: 'var(--apple-primary)' });
  } else if (this.docTitleText) {
    this.docTitleText.setText('未选择文档');
    this.docTitleText.setCssStyles({ color: 'var(--apple-tertiary)' }); // 灰色提示
  }
  this.updateAiToolbarState();
}
,

setPlaceholder() {
  this.previewContainer.empty();
  this.previewContainer.removeClass('apple-has-content'); // 移除内容状态类
  const placeholder = this.previewContainer.createEl('div', { cls: 'apple-placeholder' });
  const iconDiv = placeholder.createEl('div', { cls: 'apple-placeholder-icon' });
  this.renderPlaceholderIcon(iconDiv);
  placeholder.createEl('h2', { text: 'Obsidian 发布助手' });
  const content = placeholder.createDiv({ cls: 'apple-placeholder-content' });
  content.createEl('p', {
    text: '当前面板用于预览微信公众号排版。请在左侧编辑器中打开或激活任意 Markdown 笔记以自动加载预览。',
    cls: 'apple-placeholder-desc'
  });
  const steps = content.createEl('div', { cls: 'apple-steps' });
  steps.createEl('div', { text: '1. 打开或点击任意 Markdown 笔记' });
  steps.createEl('div', { text: '2. 预览微信公众号排版' });
  steps.createEl('div', { text: '3. 一键复制或同步到微信、飞书、小红书等平台' });

  content.createEl('p', {
    text: '注：此面板仅预览微信排版。同步至飞书、小红书等平台直接以源 Markdown 笔记为准。',
    cls: 'apple-placeholder-note'
  });
}
,

renderPlaceholderIcon(iconDiv) {
  iconDiv.empty();
  const img = /** @type {ObsidianElementLike & HTMLImageElement} */ (iconDiv.createEl('img', { attr: { alt: 'Obsidian 发布助手' } }));
  img.src = PLACEHOLDER_ICON_DATA_URL;
  img.setCssStyles({
    width: '64px',
    height: '64px',
    display: 'block',
  });
}
,

showRenderFailurePlaceholder(message = '') {
  if (!this.previewContainer || typeof this.previewContainer.createEl !== 'function') return;
  this.previewContainer.empty();
  this.previewContainer.removeClass('apple-has-content');
  const placeholder = this.previewContainer.createEl('div', { cls: 'apple-placeholder' });
  placeholder.createEl('div', { cls: 'apple-placeholder-icon', text: '⚠️' });
  placeholder.createEl('h2', { text: '渲染失败' });
  placeholder.createEl('p', {
    text: '当前文档尚未成功渲染，复制/同步已禁用。请修复后重试。'
  });
  if (message) {
    placeholder.createEl('p', { cls: 'apple-placeholder-note', text: `错误信息：${message}` });
  }
}
,

getMissingRenderNotice() {
  if (this.lastRenderError) {
    return '❌ 当前文档渲染失败，请修复后重试';
  }
  return '⚠️ 请先打开一个文章进行转换';
}
,

async convertCurrent(silent = false, options = {}) {
  const {
    showLoading = false,
    loadingText = '正在渲染预览...',
    loadingDelay = 0,
    sourceOverride = null,
  } = options;
  const generation = ++this.renderGeneration;
  if (showLoading) {
    this.loadingGeneration = generation;
    if (this.loadingVisibilityTimer) {
      window.clearTimeout(this.loadingVisibilityTimer);
      this.loadingVisibilityTimer = null;
    }
    if (loadingDelay > 0) {
      this.loadingVisibilityTimer = window.setTimeout(() => {
        if (this.loadingGeneration === generation) {
          this.setPreviewLoading(true, loadingText);
        }
        this.loadingVisibilityTimer = null;
      }, loadingDelay);
    } else {
      this.setPreviewLoading(true, loadingText);
    }
  }
  /** @type {MarkdownSourceResultLike} */
  const source = sourceOverride && typeof sourceOverride === 'object'
    ? {
      ok: true,
      markdown: typeof sourceOverride.markdown === 'string' ? sourceOverride.markdown : '',
      sourcePath: typeof sourceOverride.sourcePath === 'string' ? sourceOverride.sourcePath : '',
    }
    : /** @type {MarkdownSourceResultLike} */ (await resolveMarkdownSource({
      app: this.app,
      lastActiveFile: this.lastActiveFile,
      MarkdownViewType: MarkdownView,
    }));

  let markdown = '';
  let sourcePath = '';
  if (source.ok) {
    markdown = source.markdown || '';
    sourcePath = source.sourcePath || '';
  } else if (this.lastResolvedMarkdown.trim()) {
    markdown = this.lastResolvedMarkdown;
    sourcePath = this.lastResolvedSourcePath || '';
  } else {
    if (!silent) new Notice('请先打开一个 Markdown 文件');
    if (showLoading && this.loadingGeneration === generation) {
      if (this.loadingVisibilityTimer) {
        window.clearTimeout(this.loadingVisibilityTimer);
        this.loadingVisibilityTimer = null;
      }
      this.setPreviewLoading(false);
    }
    return;
  }

  if (!markdown.trim()) {
    if (!silent) new Notice('当前文件内容为空');
    this.completeAiLayoutSourceSwitch(sourcePath);
    if (showLoading && this.loadingGeneration === generation) {
      if (this.loadingVisibilityTimer) {
        window.clearTimeout(this.loadingVisibilityTimer);
        this.loadingVisibilityTimer = null;
      }
      this.setPreviewLoading(false);
    }
    return;
  }

  try {
    if (!silent) new Notice('⚡ 正在转换...');
    const html = await this.renderMarkdownForPreview(markdown, sourcePath);

    if (generation !== this.renderGeneration) return;

    // 只有渲染成功并且仍是最新一轮渲染时，才提交当前文章源。
    // 这样切换文章时 AI 面板不会在渲染中途用临时 hash 误判缓存状态。
    this.lastResolvedMarkdown = markdown;
    this.lastResolvedSourcePath = sourcePath;
    this.lastResolvedSourceHash = String(this.simpleHash(markdown));
    this.completeAiLayoutSourceSwitch(sourcePath);

    this.baseRenderedHtml = html;
    this.currentHtml = html;
    this.lastRenderError = '';
    this.lastRenderFailureNoticeKey = '';
    // 重置手动上传的封面，确保切换文章时不会残留上一篇的封面
    this.sessionCoverBase64 = null;

    // 滚动位置保持 (Scroll Preservation)
    const scrollTop = this.previewContainer.scrollTop;
    setElementHtml(this.previewContainer, html);
    this.previewContainer.scrollTop = scrollTop;

    this.previewContainer.addClass('apple-has-content'); // 添加内容状态类
    this.syncPreviewPresentationMode();
    this.updateCurrentDoc();
    if (this.shouldSyncAiLayoutUi()) {
      const activeSelection = this.getCurrentAiLayoutSelection();
      let layoutState = null;
      if (sourcePath && typeof this.plugin?.getArticleLayoutState === 'function') {
        layoutState = this.plugin.getArticleLayoutState(sourcePath, activeSelection);
      }
      const canReuseAiLayout = !!(
        this.aiPreviewApplied
        && layoutState?.layoutJson?.blocks?.length
        && this.lastResolvedSourceHash
        && layoutState.sourceHash === this.lastResolvedSourceHash
      );
      if (canReuseAiLayout) {
        this.applyAiLayoutToPreview();
      } else if (this.aiPreviewApplied) {
        this.aiPreviewApplied = false;
        this.syncPreviewPresentationMode();
      }
      this.refreshAiLayoutPanel();
    }
    if (!silent) new Notice('✅ 转换成功！');

  } catch (error) {
    console.error('转换失败:', error);
    if (generation !== this.renderGeneration) return;

    this.currentHtml = null;
    this.baseRenderedHtml = null;
    this.aiPreviewApplied = false;
    this.completeAiLayoutSourceSwitch(sourcePath);
    this.syncPreviewPresentationMode();
    this.lastRenderError = toReadableError(error).message || '未知渲染错误';
    this.showRenderFailurePlaceholder(this.lastRenderError);
    this.updateCurrentDoc();
    if (this.shouldSyncAiLayoutUi()) {
      this.refreshAiLayoutPanel();
    }

    const noticeKey = `${sourcePath || ''}:${this.lastRenderError}`;
    if (!silent || this.lastRenderFailureNoticeKey !== noticeKey) {
      new Notice('❌ 转换失败: ' + this.lastRenderError);
      this.lastRenderFailureNoticeKey = noticeKey;
    }
  } finally {
    if (showLoading && this.loadingGeneration === generation) {
      if (this.loadingVisibilityTimer) {
        window.clearTimeout(this.loadingVisibilityTimer);
        this.loadingVisibilityTimer = null;
      }
      this.setPreviewLoading(false);
    }
  }
}
,

onResize() {
  // ItemView does not provide resize behavior this view relies on; keep handling local.
  // 使用防抖，避免拖动侧边栏时频繁渲染
  if (this.resizeTimeout) window.clearTimeout(this.resizeTimeout);

  // 检查是否可见 (以防万一)
  if (!this.containerEl.offsetParent) return;

  this.resizeTimeout = window.setTimeout(() => {
    this.convertCurrent(true);
  }, 300);
}
,

async onClose() {
  if (this.activeLeafRenderTimer) {
    window.clearTimeout(this.activeLeafRenderTimer);
    this.activeLeafRenderTimer = null;
  }
  if (this.loadingVisibilityTimer) {
    window.clearTimeout(this.loadingVisibilityTimer);
    this.loadingVisibilityTimer = null;
  }
  if (this.sidePaddingPreviewTimer) {
    window.clearTimeout(this.sidePaddingPreviewTimer);
    this.sidePaddingPreviewTimer = null;
  }
  if (this.aiLayoutStaleSuppressTimer) {
    window.clearTimeout(this.aiLayoutStaleSuppressTimer);
    this.aiLayoutStaleSuppressTimer = null;
  }
  this.setPreviewLoading(false);

  // 清理滚动监听 (Critical: Fix memory leak)
  if (this.activeEditorScroller && this.editorScrollListener) {
    this.activeEditorScroller.removeEventListener('scroll', this.editorScrollListener);
  }
  if (this.previewContainer && this.previewScrollListener) {
    this.previewContainer.removeEventListener('scroll', this.previewScrollListener);
  }
  if (this.cancelScrollSyncFrame) {
    this.cancelScrollSyncFrame();
    this.cancelScrollSyncFrame = null;
    this.scrollSyncFrame = null;
    this.pendingScrollSyncSource = '';
  }
  this.expectedEditorScrollTop = null;
  this.expectedPreviewScrollTop = null;
  this.previewContainer?.empty();
  this.closeTransientPanels();
  this.aiLayoutBtn = null;
  this.settingsBtn = null;

  // 清理文章状态缓存
  if (this.articleStates) {
    this.articleStates.clear();
  }
  if (this.svgUploadCache) {
    this.svgUploadCache.clear();
  }
  if (this.imageUploadCache) {
    this.imageUploadCache.clear();
  }
  if (this.coverUploadCache) {
    this.coverUploadCache.clear();
  }
  if (this.mermaidImageCache) {
    this.mermaidImageCache.clear();
  }

  console.log('🍎 发布助手面板已关闭');
}
,

simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Ensure unsigned 32-bit integer
}
,
};
