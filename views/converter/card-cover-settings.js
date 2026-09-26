/*
## 核心功能

小红书卡片侧边栏「封面设置」子面板构建与值同步模块。
提供封面总开关、呈现版式、配图预览卡（更换与移除）以及封面文案编辑（标题、作者、日期、摘要、重置）。
所有关于封面配图的丰富选图、搜图、本地上传与 AI 生图操作均已全面收归至独立选图工作台（Media Picker Modal）中，侧边栏保持极简轻量。

## 设计原则

- 视觉第一性：封面画面排在上方，封面文案排在下方；
- 职责单一：侧边栏仅展示当前配图状态并提供更换/移除入口，所有挑图与生成交互在弹窗工作台完成；
- 保持轻巧：严格遵守单文件软线 800 行约束与无 emoji 规范。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: AppleStyleView 方法组与会话合同字段以 unknown 持有 */

import { AI_CARD_COVER_STYLES } from '../../services/card-ai-image.js';
import { COVER_MODE_LABELS } from '../../services/card-cover-model.js';
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
    // 2.1 呈现形态选择（版式）：纯文字排版（无需配图） / 主题自适应版式（融入主题） / 底图+遮罩 / 全幅大图
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

    // 2.2 唤起独立选图工作台
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

    // 2.3 「添加封面配图」快速唤起入口（无配图或纯文字模式下展示）
    const addImageBtn = content.createEl('button', {
      cls: 'icard-settings-cover-add-btn',
      text: '+ 添加封面配图',
      attr: { type: 'button', title: '打开独立选图工作台为封面添加配图' },
    });
    addImageBtn.addEventListener('click', () => {
      openMediaPicker('unsplash');
    });
    refs.coverAddImageBtn = addImageBtn;

    // 2.4 封面配图卡（已有配图时展示）
    const toolsWrap = content.createDiv({ cls: 'icard-settings-cover-tools-wrap hidden' });
    refs.coverImageToolsWrap = toolsWrap;

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
  });

  refs.coverFieldsHidden.push(coverImageSection);

  // ========== 3. 封面文案（排在画面下方） ==========
  const coverCopySection = view.createSection(coverSection, '封面文案', (content) => {
    refs.coverInputs = {};
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

    // 仅在非纯文字模式且存在有效配图时展示当前配图卡
    const hasImage = Boolean(fields.coverImage) && !isPureText;

    // 渐进披露：若已有配图则展示配图卡（含更换、移除）；若无配图或纯文字模式则展示快速唤起「+ 添加封面配图」按钮
    if (refs.coverAddImageBtn) {
      refs.coverAddImageBtn.classList.toggle('hidden', hasImage);
    }
    if (refs.coverImageToolsWrap) {
      refs.coverImageToolsWrap.classList.toggle('hidden', !hasImage);
    }
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
    refs.coverAiDetails.open = false;
  }
}
