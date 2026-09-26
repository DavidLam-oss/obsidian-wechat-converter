/**
 * ## 核心功能
 *
 * 小红书卡片选图工作台之「笔记插图与本地上传」Tab 内容构建与交互。
 * 健壮解析当前活跃笔记中包含的插图并平铺展示，支持本地文件选择与拖拽上传。
 *
 * ## 设计原则
 *
 * - 严格遵守无 emoji 规范；
 * - 遵守单文件软线 800 行约束；
 * - 使用 Obsidian DOM 操作 API（无 innerHTML）。
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
 * 同步优先解析当前笔记的 Markdown 文本与源路径
 * @param {any} view AppleStyleView 实例
 * @returns {{ markdown: string, sourcePath: string }}
 */
export function resolveNoteMarkdownAndPathSync(view) {
  let markdown = typeof view?.getCurrentDocContent === 'function' ? view.getCurrentDocContent() : '';
  let sourcePath = '';

  // 1. 卡片预览挂起状态（用户在卡片模式下最准确的内容与路径）
  if (!markdown) {
    markdown = view?.cardPreviewPendingInput?.markdown || '';
    sourcePath = view?.cardPreviewPendingInput?.sourcePath || '';
  }

  // 2. 最近一次解析成功的 Markdown 与源路径
  if (!markdown) {
    markdown = view?.lastResolvedMarkdown || '';
  }
  if (!sourcePath) {
    sourcePath = view?.lastResolvedSourcePath || '';
  }

  // 3. 从 Session 读取源路径
  if (!sourcePath && typeof view?.getCardSettingsSession === 'function') {
    const session = view.getCardSettingsSession();
    sourcePath = session?.getSourcePath?.() || '';
  }

  return { markdown, sourcePath };
}

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
  const noteListContainer = container.createDiv({ cls: 'card-media-picker-note-images' });

  // 同步优先解析，若未获取则触发异步回退
  const initial = resolveNoteMarkdownAndPathSync(view);
  let currentMarkdown = initial.markdown;
  let currentSourcePath = initial.sourcePath;

  const renderImages = (markdown, sourcePath) => {
    noteListContainer.empty();
    const noteImages = extractNoteImageReferences(markdown);

    if (noteImages.length === 0) {
      const emptyBox = noteListContainer.createDiv({ cls: 'card-media-picker-empty' });
      emptyBox.createDiv({ cls: 'card-media-picker-empty-title', text: '当前笔记暂无插图' });
      emptyBox.createDiv({ cls: 'card-media-picker-empty-desc', text: '若笔记中插入了图片，将在此处平铺展示，点击即可一键设为封面。' });
      return;
    }

    const gridContainer = noteListContainer.createDiv({ cls: 'card-media-picker-grid' });
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

      let loadedDataUrl = '';
      const loadImgData = async () => {
        if (loadedDataUrl) return loadedDataUrl;
        if (/^https?:\/\//i.test(imgRef.path)) {
          imgEl.src = imgRef.path;
          loadedDataUrl = await downloadAsBase64(imgRef.path, getObsidianRequestUrl(), 'image/jpeg');
        } else if (/^data:image\//i.test(imgRef.path)) {
          loadedDataUrl = imgRef.path;
          imgEl.src = loadedDataUrl;
        } else {
          let file = app?.metadataCache?.getFirstLinkpathDest(imgRef.path, sourcePath);
          if (!file && app?.vault?.getAbstractFileByPath) {
            file = app.vault.getAbstractFileByPath(imgRef.path);
          }
          if (file && app?.vault?.readBinary) {
            const buf = await app.vault.readBinary(file);
            const ext = file.extension?.toLowerCase() || 'png';
            const mime = ext === 'jpg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/png'));
            loadedDataUrl = `data:${mime};base64,${bufferToBase64(buf)}`;
            imgEl.src = loadedDataUrl;
          }
        }
        return loadedDataUrl;
      };

      loadImgData().catch(() => {});

      item.addEventListener('click', async () => {
        try {
          if (!loadedDataUrl) {
            new Notice('正在加载笔记图片...');
            await loadImgData();
          }
          if (!loadedDataUrl) {
            throw new Error('无法在当前 Vault 中找到对应图片文件');
          }
          onSelect({ dataUrl: loadedDataUrl, source: 'note' });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          new Notice(`读取笔记图片失败: ${msg}`);
        }
      });
    });
  };

  // 初始同步渲染
  renderImages(currentMarkdown, currentSourcePath);

  // 若同步未能获取到 Markdown，执行异步回退并静默补全渲染
  if (!currentMarkdown) {
    (async () => {
      try {
        if (typeof view?.resolveCardMarkdownSource === 'function') {
          const res = await view.resolveCardMarkdownSource();
          if (res?.markdown) {
            currentMarkdown = res.markdown;
            if (res.sourcePath) currentSourcePath = res.sourcePath;
            renderImages(currentMarkdown, currentSourcePath);
            return;
          }
        }
        if (view?.app?.vault?.read) {
          let targetFile = null;
          if (currentSourcePath && view.app.vault.getAbstractFileByPath) {
            targetFile = view.app.vault.getAbstractFileByPath(currentSourcePath);
          }
          if (!targetFile) {
            targetFile = view.lastActiveFile || view.app.workspace?.getActiveFile?.();
          }
          if (targetFile) {
            currentMarkdown = await view.app.vault.read(targetFile);
            currentSourcePath = targetFile.path || currentSourcePath;
            renderImages(currentMarkdown, currentSourcePath);
          }
        }
      } catch {
        // 容错静默
      }
    })();
  }
}
