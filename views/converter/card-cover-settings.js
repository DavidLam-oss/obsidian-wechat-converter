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
} from '../../services/card-cover-source.js';
import {
  resolveImageAiProvider,
  isAiProviderRunnable,
} from '../../services/ai-layout/providers.js';
import { Notice } from '../apple-style-view-shared.js';
import { obsidianApi, getObsidianRequestUrl } from '../../services/obsidian-compat.js';

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
    // 2.1 搜图关键词输入框
    const kwRow = content.createEl('label', { cls: 'icard-settings-cover-row' });
    kwRow.createEl('span', { cls: 'icard-settings-cover-label', text: '关键词' });
    const kwInput = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (kwRow.createEl('input', {
        type: 'text',
        cls: 'icard-settings-text',
        attr: { placeholder: '搜图关键词 (如: 极简 建筑 办公)', title: '用于 Unsplash 或摄影图搜索' },
      }))
    );
    refs.coverKeywordsInput = kwInput;

    // 2.2 隐藏的原生本地图片文件选择器
    const hiddenFileInput = /** @type {HTMLInputElement} */ (
      /** @type {unknown} */ (content.createEl('input', {
        type: 'file',
        attr: { accept: 'image/*', style: 'display: none;' },
      }))
    );
    hiddenFileInput.addEventListener('change', async () => {
      const file = hiddenFileInput.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readLocalFileAsDataUrl(file);
        view.applyCardCoverField('coverImage', dataUrl);
        new Notice(`已应用本地图片: ${file.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`加载本地图片失败: ${msg}`);
      } finally {
        hiddenFileInput.value = '';
      }
    });

    // 2.3 平铺直觉操作工具条（无胶囊套娃）
    const toolsRow = content.createDiv({ cls: 'icard-settings-cover-tools' });

    // 按钮 1：🎲 随机摄影（Picsum 零配置）
    const btnPicsum = toolsRow.createEl('button', {
      cls: 'icard-settings-cover-btn',
      text: '🎲 随机摄影',
      attr: { type: 'button', title: '免费免配置：从 Picsum 摄影库随机换一张高清背景' },
    });
    btnPicsum.addEventListener('click', async () => {
      const currentLayout = view.getCurrentCardLayoutSettings();
      const ratioId = currentLayout.ratioId || '3:4';
      const originalText = btnPicsum.textContent;
      btnPicsum.disabled = true;
      btnPicsum.textContent = '🎲 获取中...';
      try {
        const dataUrl = await fetchPicsumCoverImage({
          ratioId,
          requestUrl: getObsidianRequestUrl(),
        });
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

    // 按钮 2：🔍 Unsplash 搜索
    const btnUnsplash = toolsRow.createEl('button', {
      cls: 'icard-settings-cover-btn',
      text: '🔍 搜 Unsplash',
      attr: { type: 'button', title: '根据关键词精准搜索 Unsplash 摄影大片' },
    });
    btnUnsplash.addEventListener('click', async () => {
      const currentLayout = view.getCurrentCardLayoutSettings();
      const ratioId = currentLayout.ratioId || '3:4';
      const query = (kwInput.value || '').trim();
      const unsplashKey = (view.plugin?.settings?.unsplashAccessKey || '').trim();

      if (!unsplashKey) {
        new Notice('未配置 Unsplash Key，先为您随机获取精美摄影图；如需按词搜索请在设置中配置 Key');
        btnPicsum.click();
        return;
      }

      const originalText = btnUnsplash.textContent;
      btnUnsplash.disabled = true;
      btnUnsplash.textContent = '🔍 搜索中...';
      try {
        const dataUrl = await fetchUnsplashCoverImage({
          apiKey: unsplashKey,
          query,
          ratioId,
          requestUrl: getObsidianRequestUrl(),
        });
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

    // 按钮 3：🖼️ 笔记/本地 ▾
    const btnPickImage = toolsRow.createEl('button', {
      cls: 'icard-settings-cover-btn',
      text: '🖼️ 笔记/本地 ▾',
      attr: { type: 'button', title: '选用当前笔记已插入的图片，或从电脑本地上传' },
    });
    btnPickImage.addEventListener('click', (e) => {
      const MenuClass = obsidianApi?.Menu;
      if (!MenuClass) {
        hiddenFileInput.click();
        return;
      }
      const menu = new MenuClass();

      const session = view.getCardSettingsSession();
      const sourcePath = session?.file?.path || view.currentFile?.path || '';
      const markdown = session?.markdown || '';
      const noteImages = extractNoteImageReferences(markdown);

      if (noteImages.length > 0) {
        for (const img of noteImages) {
          menu.addItem((item) => {
            item.setTitle(`📸 笔记: ${img.name}`)
              .setIcon('image')
              .onClick(async () => {
                try {
                  const file = view.app?.metadataCache?.getFirstLinkpathDest(img.path, sourcePath);
                  if (file && view.app?.vault?.readBinary) {
                    const arrayBuffer = await view.app.vault.readBinary(file);
                    const ext = img.name.split('.').pop()?.toLowerCase();
                    const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
                    const b64 = bufferToBase64(arrayBuffer);
                    view.applyCardCoverField('coverImage', `data:${mime};base64,${b64}`);
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
        item.setTitle('📁 从电脑选择本地图片...')
          .setIcon('upload')
          .onClick(() => {
            hiddenFileInput.click();
          });
      });

      menu.showAtMouseEvent(e);
    });

    // 2.4 呈现形态选择
    const modeRow = content.createEl('label', { cls: 'icard-settings-cover-row' });
    modeRow.createEl('span', { cls: 'icard-settings-cover-label', text: '版式' });
    const modeSelect = /** @type {HTMLSelectElement} */ (
      /** @type {unknown} */ (modeRow.createEl('select', { cls: 'icard-settings-select' }))
    );
    modeSelect.createEl('option', { value: 'adaptive', text: `${COVER_MODE_LABELS.adaptive}（融入主题）` });
    modeSelect.createEl('option', { value: 'mixed', text: `${COVER_MODE_LABELS.mixed}（底图+遮罩）` });
    modeSelect.createEl('option', { value: 'full-bleed', text: `${COVER_MODE_LABELS['full-bleed']}（纯图海报）` });
    modeSelect.addEventListener('change', () => {
      view.applyCardCoverField('coverMode', modeSelect.value);
    });
    refs.coverModeSelect = modeSelect;

    // 2.5 配图卡（已有配图时展示）
    const previewBox = content.createDiv({ cls: 'icard-settings-cover-preview-box hidden' });
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

    const removeImgBtn = previewBox.createEl('button', {
      cls: 'icard-settings-cover-remove',
      text: '移除',
      attr: { type: 'button', title: '移除封面配图，恢复主题默认纯文字排版' },
    });
    refs.coverImageRemoveBtn = removeImgBtn;
    removeImgBtn.addEventListener('click', () => {
      view.applyCardCoverField('coverImage', '');
    });

    // 2.6 进阶 AI 生图折叠组（低频进阶，默认收起）
    const aiDetails = /** @type {HTMLDetailsElement} */ (
      /** @type {unknown} */ (content.createEl('details', {
        cls: 'apple-settings-details icard-settings-cover-ai',
      }))
    );
    refs.coverAiDetails = aiDetails;
    const aiSummary = aiDetails.createEl('summary', { cls: 'apple-settings-summary' });
    aiSummary.createEl('span', { text: '🎨 AI 生图进阶设置' });
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
      text: '🎨 AI 生成封面图',
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
      const originalText = genBtn.textContent || '🎨 AI 生成封面图';
      genBtn.textContent = '🎨 正在生图中...';

      try {
        const dataUrl = await generateCardCoverImage({
          provider,
          prompt: promptText,
          aspectRatio: ratio,
          requestUrl: getObsidianRequestUrl(),
        });
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
      : { title: '', author: '', date: '', excerpt: '', coverMode: 'adaptive', coverImageStyle: '3d-clay' };

    for (const [key, input] of Object.entries(refs.coverInputs || {})) {
      if (document.activeElement === input) continue;
      input.value = String(fields[key] || '');
    }

    if (refs.coverModeSelect) {
      refs.coverModeSelect.value = fields.coverMode || 'adaptive';
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

    if (refs.coverKeywordsInput && document.activeElement !== refs.coverKeywordsInput && !refs.coverKeywordsInput.value) {
      refs.coverKeywordsInput.value = (fields.title || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ').trim().slice(0, 20);
    }

    const hasImage = Boolean(fields.coverImage);
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
 * @param {boolean} hasImage
 */
export function renderCardCoverGroupEcho(refs, fields, hasImage) {
  if (!refs) return;
  const styleId = String(fields.coverImageStyle || '3d-clay');
  const style = AI_CARD_COVER_STYLES.find((item) => item.id === styleId);
  const styleName = style ? style.name : styleId;
  const modeKey = String(fields.coverMode || 'adaptive');
  const modeName = COVER_MODE_LABELS[modeKey] || COVER_MODE_LABELS.adaptive;

  if (refs.coverGroupEcho) {
    refs.coverGroupEcho.textContent = `${styleName} · ${modeName} · ${hasImage ? '已有配图' : '无配图'}`;
  }
  if (refs.coverImagePreviewName) {
    refs.coverImagePreviewName.textContent = styleName;
  }
  if (refs.coverAiDetails && refs.coverAiUserToggled !== true) {
    refs.coverAiDetails.open = false; // AI 生图进阶默认收起
  }
}
