/**
 * ## 核心功能

小红书卡片选图工作台之「笔记插图与本地上传」Tab 内容构建与交互。
自动提取当前笔记内所有图片大图平铺，并提供本地图片文件选择与拖拽上传。

## 设计原则

- 严格遵守无 emoji 规范；
- 遵守单文件软线 800 行约束；
- 使用 Obsidian DOM 操作 API（无 innerHTML）。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: view and plugin settings untyped in pure JS */

import { Notice } from '../apple-style-view-shared.js';
import {
  extractNoteImageReferences,
  readLocalFileAsDataUrl,
  bufferToBase64,
  downloadAsBase64,
} from '../../services/card-cover-source.js';
import { getObsidianRequestUrl } from '../../services/obsidian-compat.js';

/**
 * 构建笔记插图与本地上传 Tab
 * @param {object} options
 * @param {HTMLElement} options.container 宿主内容容器
 * @param {any} options.view AppleStyleView 实例
 * @param {(result: { dataUrl: string, source: string }) => void} options.onSelect 选中图片回调
 */
export function renderNoteMediaPickerTab({ container, view, onSelect }) {
  container.empty();

  // 1. 本地图片拖拽/选择上传区
  container.createDiv({ cls: 'card-media-picker-section-title', text: '本地图片上传' });
  const dropzone = container.createDiv({ cls: 'card-media-picker-dropzone' });
  dropzone.createDiv({ cls: 'card-media-picker-dropzone-text', text: '拖拽本地图片至此处，或点击浏览文件' });
  dropzone.createDiv({ cls: 'card-media-picker-dropzone-sub', text: '支持 PNG、JPG、JPEG、WebP 格式' });

  const fileInput = /** @type {HTMLInputElement} */ (
    /** @type {unknown} */ (container.createEl('input', {
      attr: { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' },
      cls: 'hidden',
    }))
  );

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.addClass('is-dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.removeClass('is-dragover');
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.removeClass('is-dragover');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleLocalFile(files[0]);
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) {
      await handleLocalFile(file);
    }
  });

  const handleLocalFile = async (file) => {
    try {
      new Notice('正在读取本地图片...');
      const dataUrl = await readLocalFileAsDataUrl(file);
      onSelect({ dataUrl, source: 'local' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`本地图片读取失败: ${msg}`);
    }
  };

  // 2. 当前笔记已插入图片区
  container.createDiv({ cls: 'card-media-picker-section-title', text: '当前笔记中的插图' });

  const activeDoc = typeof view.getCurrentDocContent === 'function' ? view.getCurrentDocContent() : '';
  const noteImages = extractNoteImageReferences(activeDoc);

  if (noteImages.length === 0) {
    const emptyBox = container.createDiv({ cls: 'card-media-picker-empty' });
    emptyBox.createDiv({ cls: 'card-media-picker-empty-title', text: '当前笔记暂无插图' });
    emptyBox.createDiv({ cls: 'card-media-picker-empty-desc', text: '若笔记中插入了图片，将在此处平铺展示，点击即可一键设为封面。' });
    return;
  }

  const gridContainer = container.createDiv({ cls: 'card-media-picker-grid' });
  const app = view.app;

  noteImages.forEach((imgRef) => {
    const item = gridContainer.createDiv({ cls: 'card-media-picker-item' });
    const imgEl = item.createEl('img', {
      cls: 'card-media-picker-item-img',
      attr: { alt: imgRef.name },
    });

    item.createDiv({
      cls: 'card-media-picker-item-author',
      text: imgRef.name,
    });

    // 异步加载该插图的缩略图
    let loadedDataUrl = '';
    (async () => {
      try {
        if (imgRef.isWiki) {
          const file = app?.metadataCache?.getFirstLinkpathDest(imgRef.path, '');
          if (file) {
            const buf = await app.vault.readBinary(file);
            const ext = file.extension?.toLowerCase() || 'png';
            const mime = ext === 'jpg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
            loadedDataUrl = `data:${mime};base64,${bufferToBase64(buf)}`;
            imgEl.src = loadedDataUrl;
          }
        } else if (/^https?:\/\//i.test(imgRef.path)) {
          imgEl.src = imgRef.path;
          loadedDataUrl = await downloadAsBase64(imgRef.path, getObsidianRequestUrl(), 'image/jpeg');
        }
      } catch {
        // 读取失败静默忽略
      }
    })();

    item.addEventListener('click', async () => {
      if (!loadedDataUrl) {
        new Notice('正在加载笔记图片...');
        try {
          if (imgRef.isWiki) {
            const file = app?.metadataCache?.getFirstLinkpathDest(imgRef.path, '');
            if (!file) throw new Error('无法在当前 Vault 中找到对应图片文件');
            const buf = await app.vault.readBinary(file);
            const ext = file.extension?.toLowerCase() || 'png';
            const mime = ext === 'jpg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
            loadedDataUrl = `data:${mime};base64,${bufferToBase64(buf)}`;
          } else if (/^https?:\/\//i.test(imgRef.path)) {
            loadedDataUrl = await downloadAsBase64(imgRef.path, getObsidianRequestUrl(), 'image/jpeg');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          new Notice(`读取笔记图片失败: ${msg}`);
          return;
        }
      }

      if (loadedDataUrl) {
        onSelect({ dataUrl: loadedDataUrl, source: 'note' });
      }
    });
  });
}
