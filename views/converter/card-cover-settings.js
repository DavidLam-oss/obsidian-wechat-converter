/*
## 核心功能

小红书卡片侧边栏「封面设置」子面板构建与值同步模块。
提供封面总开关、封面画面设置（Picsum 随机摄影图、Unsplash 关键词搜索、笔记图片与本地上传、呈现版式、配图预览卡、进阶 AI 生图折叠组）与封面文案编辑（标题、作者、日期、摘要、重置）。

## 设计原则

- 视觉第一性：封面画面排在上方，封面文案排在下方；
- 拒绝套娃：平铺直觉工具条，不使用大 Tab 套小 Tab 的胶囊切换器；
- 保持轻巧：严格遵守单文件软线 800 行约束，所有网络与图源逻辑下沉到 services/。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: AppleStyleView 方法组与会话合同字段以 unknown 持有 */

import {
  AI_CARD_COVER_STYLES,
  resolveCardCoverPrompt,
  generateCardCoverImage,
} from '../../services/card-ai-image.js';
import { COVER_MODE_LABELS } from '../../services/card-cover-model.js';
import {
  fetchPicsumCoverImage,
  fetchUnsplashCoverImage,
  extractNoteImageReferences,
  readLocalFileAsDataUrl,
  bufferToBase64,
  downloadAsBase64,
} from '../../services/card-cover-source.js';
import {
  resolveImageAiProvider,
  isAiProviderRunnable,
} from '../../services/ai-layout/providers.js';
import { Notice } from '../apple-style-view-shared.js';
import { obsidianApi, getObsidianRequestUrl } from '../../services/obsidian-compat.js';
import { showCardMediaPickerModal } from './card-media-picker-modal.js';

/**
 * 构建卡片侧边栏「封面设置」子面板
 * @param {any} view AppleStyleView 实例
 * @param {HTMLElement} coverSection 封面子面板宿主容器
 * @param {any} refs 视图引用对象
 */
export function buildCardCoverSettingsSubpanel(view, coverSection, refs) {
  // ========== 1. 封面页开关 ==========
  view.createSection(coverSection, '封面页', (section) => {
    const row = section.createEl('div', { cls: 'icard-settings-toggle-row' });
    const copy = row.createEl('div', { cls: 'icard-settings-toggle-copy' });
    copy.createEl('span', { cls: 'icard-settings-toggle-label', text: '启用封面页' });

    const toggle = row.createEl('div', { cls: 'apple-toggle' });
    const checkbox = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' }))
    );
    toggle.createEl('span', { cls: 'apple-toggle-slider' });
    refs.coverToggleInput = checkbox;

    checkbox.addEventListener('change', () => {
      view.applyCardLayoutSetting('coverEnabled', checkbox.checked);
    });
    row.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      e.preventDefault();
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  refs.coverFieldsHidden = [];

  // ========== 2. 封面画面（视觉锚点在上方） ==========
  const coverImageSection = view.createSection(coverSection, '封面画面', (content) => {
    // 2.1 呈现形态选择（版式）：纯文字排版（无配图） / 主题自适应版式（融入主题） / 全屏底图遮罩 / 纯图海报
    const modeRow = content.createEl('label', { cls: 'icard-settings-cover-row' });
    modeRow.createEl('span', { cls: 'icard-settings-cover-label', text: '版式' });
    const modeSelect = /** @type {HTMLSelectElement} */ (
      /** @type {unknown} */ (modeRow.createEl('select', { cls: 'icard-settings-select' }))
    );
    modeSelect.createEl('option', { value: 'none', text: `${COVER_MODE_LABELS.none}（无需配图）` });
    modeSelect.createEl('option', { value: 'adaptive', text: `${COVER_MODE_LABELS.adaptive}（融入主题）` });
    modeSelect.createEl('option', { value: 'mixed', text: `${COVER_MODE_LABELS.mixed}（底图+遮罩）` });
    modeSelect.createEl('option', { value: 'full-bleed', text: `${COVER_MODE_LABELS['full-bleed']}（全幅大图）` });
    modeSelect.addEventListener('change', () => {
      view.applyCardCoverField('coverMode', modeSelect.value);
    });
    refs.coverModeSelect = modeSelect;

    // 2.2 「添加封面配图」快速唤起入口（唤起独立 Media Picker 选图工作台）
    const openMediaPicker = (initialTab = 'unsplash') => {
      showCardMediaPickerModal({
        view,
        initialTab,
        onSelect: ({ dataUrl, source }) => {
          const session = view.getCardSettingsSession();
          if (session?.getCoverFields?.()?.coverMode === 'none') {
            view.applyCardCoverField('coverMode', 'adaptive');
          }
          view.applyCardCoverField('coverImageSource', source);
          view.applyCardCoverField('coverImage', dataUrl);
        },
      });
    };

    const addImageBtn = content.createEl('button', {
      cls: 'icard-settings-cover-add-btn',
      text: '+ 添加封面配图',
      attr: { type: 'button', title: '打开独立选图工作台为封面添加配图' },
    });
    addImageBtn.addEventListener('click', () => {
      view.applyCardCoverField('coverMode', 'adaptive');
      openMediaPicker('unsplash');
    });
    refs.coverAddImageBtn = addImageBtn;

    // 2.3 封面配图工具组（非纯文字排版时渐进展开）
    const toolsWrap = content.createDiv({ cls: 'icard-settings-cover-tools-wrap hidden' });
    refs.coverImageToolsWrap = toolsWrap;

    // 2.3.1 配图卡（已有配图时展示）
    const previewBox = toolsWrap.createDiv({ cls: 'icard-settings-cover-preview-box hidden' });
    refs.coverImagePreviewWrap = previewBox;

    const thumbImg = /** @type {HTMLImageElement} */ (
      /** @type {unknown} */ (previewBox.createEl('img', { cls: 'icard-settings-cover-thumb' }))
    );
    refs.coverImageThumb = thumbImg;

    const infoCol = previewBox.createDiv({ cls: 'icard-settings-cover-info' });
    refs.coverImagePreviewName = infoCol.createEl('span', { cls: 'icard-settings-cover-preview-name' });
    refs.coverImagePreviewMeta = infoCol.createEl('span', { cls: 'icard-settings-note', text: '已启用' });
    thumbImg.addEventListener('load', () => {
      const w = thumbImg.naturalWidth;
      const h = thumbImg.naturalHeight;
      if (w && h && refs.coverImagePreviewMeta) {
        refs.coverImagePreviewMeta.textContent = `${w} × ${h} · 已启用`;
      }
    });

    const changeImgBtn = previewBox.createEl('button', {
      cls: 'icard-settings-cover-btn',
      text: '更换',
      attr: { type: 'button', title: '打开独立选图工作台更换封面配图' },
    });
    changeImgBtn.addEventListener('click', () => {
      openMediaPicker();
    });

    const removeImgBtn = previewBox.createEl('button', {
      cls: 'icard-settings-cover-remove',
      text: '移除',
      attr: { type: 'button', title: '移除封面配图并切回纯文字排版' },
    });
    refs.coverImageRemoveBtn = removeImgBtn;
    removeImgBtn.addEventListener('click', () => {
      view.applyCardCoverField('coverImage', '');
      view.applyCardCoverField('coverImageSource', '');
      view.applyCardCoverField('coverMode', 'none');
    });

    // 2.3.2 途径 1：搜图关键词输入框 + 搜 Unsplash 按钮（定向关键词搜索栏）
    const searchRow = toolsWrap.createDiv({ cls: 'icard-settings-cover-search-row' });
    const kwInput = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (searchRow.createEl('input', {
        type: 'text',
        cls: 'icard-settings-text',
        attr: { placeholder: '输入关键词搜摄影图 (如: 极简 建筑 科技)', title: '用于 Unsplash 摄影搜索' },
      }))
    );
    refs.coverKeywordsInput = kwInput;

    const btnUnsplash = searchRow.createEl('button', {
      cls: 'icard-settings-cover-btn icard-settings-cover-search-btn',
      text: '搜索',
      attr: { type: 'button', title: '根据关键词精准搜索 Unsplash 摄影大片' },
    });

    kwInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnUnsplash.click();
      }
    });

    // 2.3.3 快捷图源操作工具行（挑图工作台 / 随机摄影 / 笔记/本地，免输关键词）
    const toolsRow = toolsWrap.createDiv({ cls: 'icard-settings-cover-tools' });

    const btnMediaPicker = toolsRow.createEl('button', {
      cls: 'icard-settings-cover-btn',
      text: '挑图工作台',
      attr: { type: 'button', title: '打开独立选图工作台（Unsplash 大网格 / 笔记插图 / AI 生图）' },
    });
    btnMediaPicker.addEventListener('click', () => {
      openMediaPicker();
    });

    // 按钮 1：随机摄影（Picsum 零配置免关键词）
    const btnPicsum = toolsRow.createEl('button', {
      cls: 'icard-settings-cover-btn',
      text: '随机摄影',
      attr: { type: 'button', title: '免输关键词：从 Picsum 图库随机获取一张高清摄影大片' },
    });
    btnPicsum.addEventListener('click', async () => {
      const currentLayout = view.getCurrentCardLayoutSettings();
      const ratioId = currentLayout.ratioId || '3:4';
      const originalText = btnPicsum.textContent;
      btnPicsum.disabled = true;
      btnPicsum.textContent = '获取中...';
      try {
        const dataUrl = await fetchPicsumCoverImage({
          ratioId,
          requestUrl: getObsidianRequestUrl(),
        });
        const session = view.getCardSettingsSession();
        if (session?.getCoverFields?.()?.coverMode === 'none') {
          view.applyCardCoverField('coverMode', 'adaptive');
        }
        view.applyCardCoverField('coverImageSource', 'picsum');
        view.applyCardCoverField('coverImage', dataUrl);
        new Notice('已获取精美摄影图并应用到封面');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`获取摄影图失败: ${msg}`);
      } finally {
        btnPicsum.disabled = false;
        btnPicsum.textContent = originalText;
      }
    });

    // 隐藏的原生本地图片文件选择器
    const hiddenFileInput = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (toolsWrap.createEl('input', {
        type: 'file',
        attr: { accept: 'image/*', style: 'display: none;' },
      }))
    );
    hiddenFileInput.addEventListener('change', async () => {
      const file = hiddenFileInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readLocalFileAsDataUrl(file);
        const session = view.getCardSettingsSession();
        if (session?.getCoverFields?.()?.coverMode === 'none') {
          view.applyCardCoverField('coverMode', 'adaptive');
        }
        view.applyCardCoverField('coverImageSource', 'local');
        view.applyCardCoverField('coverImage', dataUrl);
        new Notice(`已应用本地图片: ${file.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`加载本地图片失败: ${msg}`);
      } finally {
        hiddenFileInput.value = '';
      }
    });

    // 按钮 2：笔记/本地 ▾
    const btnPickImage = toolsRow.createEl('button', {
      cls: 'icard-settings-cover-btn',
      text: '笔记/本地 ▾',
      attr: { type: 'button', title: '选用当前笔记已插入的图片，或从电脑本地上传' },
    });
    btnPickImage.addEventListener('click', async (e) => {
      const MenuClass = obsidianApi?.Menu;
      if (!MenuClass) {
        hiddenFileInput.click();
        return;
      }
      const menu = new MenuClass();

      const session = view.getCardSettingsSession();
      const sourcePath = view.cardPreviewPendingInput?.sourcePath || session?.getSourcePath?.() || view.lastActiveFile?.path || '';
      let markdown = view.cardPreviewPendingInput?.markdown || view.lastResolvedMarkdown || '';
      if (!markdown && sourcePath && view.app?.vault?.getAbstractFileByPath) {
        try {
          const file = view.app.vault.getAbstractFileByPath(sourcePath);
          if (file && view.app?.vault?.read) {
            markdown = await view.app.vault.read(file);
          }
        } catch {
          // 容错：路径读取失败时继续回退到活跃文件
        }
      }
      if (!markdown) {
        const activeFile = view.lastActiveFile || view.app?.workspace?.getActiveFile?.();
        if (activeFile && view.app?.vault?.read) {
          try {
            markdown = await view.app.vault.read(activeFile);
          } catch {
            // 容错：活跃文件读取失败时回退为空
          }
        }
      }
      const noteImages = extractNoteImageReferences(markdown);

      if (noteImages.length > 0) {
        for (const img of noteImages) {
          menu.addItem((item) => {
            const displayName = img.name.length > 36 ? img.name.slice(0, 33) + '...' : img.name;
            item.setTitle(`笔记: ${displayName}`)
              .setIcon('image')
              .onClick(async () => {
                try {
                  const isRemote = /^https?:\/\//i.test(img.path);
                  let finalDataUrl = '';

                  if (isRemote) {
                    try {
                      finalDataUrl = await downloadAsBase64(img.path, getObsidianRequestUrl());
                    } catch {
                      // 网络或跨域下载失败时降级为直接引用原始 URL
                      finalDataUrl = img.path;
                    }
                  } else {
                    const file = view.app?.metadataCache?.getFirstLinkpathDest(img.path, sourcePath);
                    if (file && view.app?.vault?.readBinary) {
                      const arrayBuffer = await view.app.vault.readBinary(file);
                      const ext = img.name.split('.').pop()?.toLowerCase();
                      const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
                      const b64 = bufferToBase64(arrayBuffer);
                      finalDataUrl = `data:${mime};base64,${b64}`;
                    }
                  }

                  if (finalDataUrl) {
                    const curSession = view.getCardSettingsSession();
                    if (curSession?.getCoverFields?.()?.coverMode === 'none') {
                      view.applyCardCoverField('coverMode', 'adaptive');
                    }
                    view.applyCardCoverField('coverImageSource', 'note');
                    view.applyCardCoverField('coverImage', finalDataUrl);
                    new Notice(`已应用笔记图片: ${img.name}`);
                  } else {
                    new Notice(`未能读取笔记图片: ${img.name}`);
                  }
                } catch (readErr) {
                  const msg = readErr instanceof Error ? readErr.message : String(readErr);
                  new Notice(`读取笔记图片异常: ${msg}`);
                }
              });
          });
        }
        menu.addSeparator();
      } else {
        menu.addItem((item) => {
          item.setTitle('(当前笔记无插入图片)').setDisabled(true);
        });
        menu.addSeparator();
      }

      menu.addItem((item) => {
        item.setTitle('从电脑选择本地图片...')
          .setIcon('upload')
          .onClick(() => {
            hiddenFileInput.click();
          });
      });

      menu.showAtMouseEvent(e);
    });

    // 搜索 Unsplash 点击处理
    btnUnsplash.addEventListener('click', async () => {
      const currentLayout = view.getCurrentCardLayoutSettings();
      const ratioId = currentLayout.ratioId || '3:4';
      const query = (kwInput.value || '').trim();
      const unsplashKey = (view.plugin?.settings?.unsplashAccessKey || '').trim();

      if (!unsplashKey) {
        new Notice('未配置 Unsplash Access Key，已自动获取 Picsum 精选摄影；如需按词精准搜索请前往插件设置「AI 服务」配置 Key');
        btnPicsum.click();
        return;
      }

      const originalText = btnUnsplash.textContent;
      btnUnsplash.disabled = true;
      btnUnsplash.textContent = '搜索中...';
      try {
        const dataUrl = await fetchUnsplashCoverImage({
          apiKey: unsplashKey,
          query,
          ratioId,
          requestUrl: getObsidianRequestUrl(),
        });
        const session = view.getCardSettingsSession();
        if (session?.getCoverFields?.()?.coverMode === 'none') {
          view.applyCardCoverField('coverMode', 'adaptive');
        }
        view.applyCardCoverField('coverImageSource', 'unsplash');
        view.applyCardCoverField('coverImage', dataUrl);
        new Notice('已应用 Unsplash 摄影封面');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Unsplash 检索失败: ${msg}`);
      } finally {
        btnUnsplash.disabled = false;
        btnUnsplash.textContent = originalText;
      }
    });

    // 2.3.4 途径 3：进阶 AI 生图折叠组（低频进阶，默认收起）
    const aiDetails = /** @type {HTMLDetailsElement} */ (
      /** @type {unknown} */ (toolsWrap.createEl('details', {
        cls: 'apple-settings-details icard-settings-cover-ai',
      }))
    );
    refs.coverAiDetails = aiDetails;
    const aiSummary = aiDetails.createEl('summary', { cls: 'apple-settings-summary' });
    aiSummary.createEl('span', { text: 'AI 生图进阶设置' });
    refs.coverGroupEcho = aiSummary.createEl('span', { cls: 'icard-settings-tune-values' });
    aiDetails.addEventListener('toggle', () => {
      refs.coverAiUserToggled = true;
    });

    const aiCoverGroup = aiDetails.createDiv({ cls: 'apple-settings-area icard-settings-cover-ai-area' });

    // 风格选择
    const styleRow = aiCoverGroup.createEl('label', { cls: 'icard-settings-cover-row' });
    styleRow.createEl('span', { cls: 'icard-settings-cover-label', text: '风格' });
    const styleSelect = /** @type {HTMLSelectElement} */ (
      /** @type {unknown} */ (styleRow.createEl('select', { cls: 'icard-settings-select' }))
    );
    for (const style of AI_CARD_COVER_STYLES) {
      styleSelect.createEl('option', { value: style.id, text: `${style.name} · ${style.description}` });
    }
    styleSelect.addEventListener('change', () => {
      view.applyCardCoverField('coverImageStyle', styleSelect.value);
      const session = view.getCardSettingsSession();
      const fields = session && typeof session.getCoverFields === 'function'
        ? session.getCoverFields()
        : { title: '', excerpt: '' };
      const autoPrompt = resolveCardCoverPrompt({
        styleId: styleSelect.value,
        title: fields.title,
        excerpt: fields.excerpt,
      });
      view.applyCardCoverField('coverPrompt', autoPrompt);
      if (refs.coverPromptInput) {
        refs.coverPromptInput.value = autoPrompt;
      }
    });
    refs.coverStyleSelect = styleSelect;

    // 画面描述 Prompt
    const promptRow = aiCoverGroup.createDiv({ cls: 'icard-settings-cover-prompt-row' });
    promptRow.createEl('span', { cls: 'icard-settings-cover-label', text: '画面描述' });
    const promptInput = /** @type {HTMLTextAreaElement} */ (
      /** @type {unknown} */ (promptRow.createEl('textarea', {
        cls: 'icard-settings-prompt-area',
        attr: { placeholder: '输入画面描述，或根据标题摘要自动填充...' },
      }))
    );
    promptInput.addEventListener('change', () => {
      view.applyCardCoverField('coverPrompt', promptInput.value);
    });
    refs.coverPromptInput = promptInput;

    // AI 生图按钮
    const genActionRow = aiCoverGroup.createDiv({ cls: 'icard-settings-cover-actions' });
    const genBtn = genActionRow.createEl('button', {
      cls: 'icard-settings-cover-primary',
      text: 'AI 生成封面图',
      attr: { type: 'button', title: '使用配置的生图模型根据 Prompt 生成封面图片' },
    });
    refs.coverGenerateBtn = genBtn;

    genBtn.addEventListener('click', async () => {
      const aiSettings = view.plugin?.settings?.ai;
      const provider = resolveImageAiProvider(aiSettings, aiSettings?.defaultImageProviderId);
      if (!provider || !isAiProviderRunnable(provider, 'image')) {
        new Notice('未配置可用的生图 AI Provider，请前往插件设置【AI 服务】进行配置');
        return;
      }

      const session = view.getCardSettingsSession();
      const fields = session && typeof session.getCoverFields === 'function'
        ? session.getCoverFields()
        : { title: '', excerpt: '', coverPrompt: '', coverImageStyle: '3d-clay' };

      const promptText = (fields.coverPrompt || promptInput.value || '').trim() || resolveCardCoverPrompt({
        styleId: fields.coverImageStyle || '3d-clay',
        title: fields.title,
        excerpt: fields.excerpt,
      });

      const currentLayout = view.getCurrentCardLayoutSettings();
      const ratio = currentLayout.ratioId || '3:4';

      genBtn.disabled = true;
      const originalText = genBtn.textContent || 'AI 生成封面图';
      genBtn.textContent = '正在生图中...';

      try {
        const dataUrl = await generateCardCoverImage({
          provider,
          prompt: promptText,
          aspectRatio: ratio,
          requestUrl: getObsidianRequestUrl(),
        });
        const session = view.getCardSettingsSession();
        if (session?.getCoverFields?.()?.coverMode === 'none') {
          view.applyCardCoverField('coverMode', 'adaptive');
        }
        view.applyCardCoverField('coverImageSource', 'ai');
        view.applyCardCoverField('coverImage', dataUrl);
        new Notice('封面图生成成功！已应用到卡片封面');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`生图失败: ${msg}`);
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = originalText;
      }
    });
  });

  refs.coverFieldsHidden.push(coverImageSection);

  // ========== 3. 封面文案（排在画面下方） ==========
  const coverCopySection = view.createSection(coverSection, '封面文案', (content) => {
    const addCoverInput = (parent, key, label, placeholder, hint) => {
      const row = parent.createEl('label', { cls: 'icard-settings-cover-row' });
      row.createEl('span', { cls: 'icard-settings-cover-label', text: label });
      const input = /** @type {HTMLInputElement} */ (
        /** @type {unknown} */ (row.createEl('input', {
          type: 'text',
          cls: 'icard-settings-text',
          attr: { placeholder, 'data-cover-key': key, title: hint || placeholder },
        }))
      );
      input.addEventListener('change', () => {
        view.applyCardCoverField(key, input.value);
      });
      refs.coverInputs[key] = input;
    };

    addCoverInput(content, 'title', '标题', '文章标题');
    addCoverInput(content, 'author', '作者', '作者名称');
    addCoverInput(content, 'date', '日期', 'YYYY-MM-DD');
    addCoverInput(content, 'excerpt', '摘要', '文章摘要');

    const refillBtn = content.createEl('button', {
      cls: 'icard-settings-cover-link',
      text: '按当前笔记重新填入',
      attr: { type: 'button', title: '丢弃手工修改，恢复为当前笔记初值' },
    });
    refillBtn.addEventListener('click', () => {
      view.resetCardCoverFields();
    });
  });

  refs.coverFieldsHidden.push(coverCopySection);
}

/**
 * 同步封面设置各项的值与显隐
 * @param {any} view AppleStyleView 实例
 * @param {any} refs 视图引用对象
 * @param {any} settings 当前排版设置
 */
export function renderCardCoverValues(view, refs, settings) {
  if (!refs?.coverToggleInput) return;

  const coverOn = settings.coverEnabled === true;
  refs.coverToggleInput.checked = coverOn;

  for (const el of refs.coverFieldsHidden || []) {
    el.classList.toggle('hidden', !coverOn);
  }

  if (coverOn) {
    const session = view.getCardSettingsSession();
    const fields = session && typeof session.getCoverFields === 'function'
      ? session.getCoverFields()
      : { title: '', author: '', date: '', excerpt: '', coverMode: 'none', coverImageStyle: '3d-clay' };

    for (const [key, input] of Object.entries(refs.coverInputs || {})) {
      if (document.activeElement === input) continue;
      input.value = String(fields[key] || '');
    }

    const currentMode = fields.coverMode || 'none';
    if (refs.coverModeSelect) {
      refs.coverModeSelect.value = currentMode;
    }

    const isPureText = currentMode === 'none';

    // 渐进披露：纯文字模式展示快速唤起入口并折叠配图工具组；配图模式展开工具组
    if (refs.coverAddImageBtn) {
      refs.coverAddImageBtn.classList.toggle('hidden', !isPureText);
    }
    if (refs.coverImageToolsWrap) {
      refs.coverImageToolsWrap.classList.toggle('hidden', isPureText);
    }

    if (refs.coverStyleSelect) {
      refs.coverStyleSelect.value = fields.coverImageStyle || '3d-clay';
    }

    if (refs.coverPromptInput && document.activeElement !== refs.coverPromptInput) {
      refs.coverPromptInput.value = fields.coverPrompt || resolveCardCoverPrompt({
        styleId: fields.coverImageStyle || '3d-clay',
        title: fields.title,
        excerpt: fields.excerpt,
      });
    }

    // 关键词输入框默认留空，由 placeholder 提供搜图指引

    // 仅在非纯文字模式且存在有效配图时展示当前配图卡
    const hasImage = Boolean(fields.coverImage) && !isPureText;
    if (refs.coverImagePreviewWrap) {
      refs.coverImagePreviewWrap.classList.toggle('hidden', !hasImage);
      if (hasImage && refs.coverImageThumb) {
        refs.coverImageThumb.src = fields.coverImage;
      }
    }

    renderCardCoverGroupEcho(refs, fields, hasImage);
  }
}

/**
 * 封面摘要回显与折叠默认态控制
 * @param {any} refs
 * @param {Record<string, unknown>} fields
 * @param {boolean} [_hasImage]
 */
export function renderCardCoverGroupEcho(refs, fields, _hasImage) {
  if (!refs) return;
  const styleId = String(fields.coverImageStyle || '3d-clay');
  const style = AI_CARD_COVER_STYLES.find((item) => item.id === styleId);
  const styleName = style ? style.name : styleId;

  const source = String(fields.coverImageSource || '');
  let sourceLabel = '封面配图';
  if (source === 'picsum') sourceLabel = 'Picsum 随机摄影';
  else if (source === 'unsplash') sourceLabel = 'Unsplash 摄影';
  else if (source === 'note') sourceLabel = '笔记插入图片';
  else if (source === 'local') sourceLabel = '本地上传图片';
  else if (source === 'ai') sourceLabel = `AI 生成配图 (${styleName})`;

  if (refs.coverImagePreviewName) {
    refs.coverImagePreviewName.textContent = sourceLabel;
  }
  if (refs.coverGroupEcho) {
    refs.coverGroupEcho.textContent = `预设风格: ${styleName}`;
  }
  if (refs.coverAiDetails && refs.coverAiUserToggled !== true) {
    refs.coverAiDetails.open = false; // AI 生图进阶默认收起
  }
}
