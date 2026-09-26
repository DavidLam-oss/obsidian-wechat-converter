/**
 * ## 核心功能

小红书卡片选图工作台之「Unsplash 摄影图库」Tab 内容构建与交互。
提供关键词搜索、热门推荐标签芯片、3 列摄影候选网格展示、分页与高清 Base64 转码下载。

## 设计原则

- 严格遵守无 emoji 规范；
- 遵守单文件软线 800 行约束；
- 使用 Obsidian DOM 操作 API（无 innerHTML）。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- reason: view and plugin settings untyped in pure JS */

import { Notice } from '../apple-style-view-shared.js';
import { getObsidianRequestUrl } from '../../services/obsidian-compat.js';
import {
  fetchUnsplashPhotos,
  downloadAsBase64,
  fetchPicsumCoverImage,
} from '../../services/card-cover-source.js';

const POPULAR_TAGS = ['极简', '建筑', '科技', '自然', '生活', '质感', '暗黑', '城市'];

/**
 * 构建 Unsplash 摄影选择器 Tab
 * @param {object} options
 * @param {HTMLElement} options.container 宿主内容容器
 * @param {any} options.view AppleStyleView 实例
 * @param {string} options.ratioId 当前卡片比例 ID
 * @param {(result: { dataUrl: string, source: string }) => void} options.onSelect 选中图片回调
 * @param {() => void} options.onOpenSettings 打开设置回调
 */
export function renderUnsplashMediaPickerTab({ container, view, ratioId, onSelect, onOpenSettings }) {
  container.empty();

  const unsplashKey = (view.plugin?.settings?.unsplashAccessKey || '').trim();

  // 若未配置 Key，渲染友好引导卡片
  if (!unsplashKey) {
    renderMissingKeyView(container, view, ratioId, onSelect, onOpenSettings);
    return;
  }

  // 1. 顶部搜索栏
  const searchBar = container.createDiv({ cls: 'card-media-picker-search-bar' });
  const searchInput = /** @type {HTMLInputElement} */ (
    /** @type {unknown} */ (searchBar.createEl('input', {
      cls: 'card-media-picker-search-input',
      attr: { type: 'text', placeholder: '输入英文或中文关键词搜索摄影作品...' },
    }))
  );
  const searchBtn = searchBar.createEl('button', {
    cls: 'card-media-picker-search-btn mod-cta',
    text: '搜索',
  });

  // 2. 热门推荐标签芯片
  const chipContainer = container.createDiv({ cls: 'card-media-picker-chips' });
  chipContainer.createSpan({ cls: 'card-media-picker-chip-label', text: '推荐：' });
  POPULAR_TAGS.forEach((tag) => {
    const chip = chipContainer.createEl('button', {
      cls: 'card-media-picker-chip',
      text: tag,
      attr: { type: 'button' },
    });
    chip.addEventListener('click', () => {
      searchInput.value = tag;
      doSearch(tag);
    });
  });

  // 3. 候选网格容器
  const gridContainer = container.createDiv({ cls: 'card-media-picker-grid' });

  // 4. 状态提示容器
  const statusEl = container.createDiv({ cls: 'card-media-picker-empty hidden' });

  let isSearching = false;

  const doSearch = async (query = '') => {
    if (isSearching) return;
    isSearching = true;
    gridContainer.empty();
    statusEl.empty();
    statusEl.removeClass('hidden');
    statusEl.createEl('span', { text: '正在检索高质量摄影图片...' });
    searchBtn.disabled = true;

    try {
      const resp = await fetchUnsplashPhotos({
        apiKey: unsplashKey,
        query: query.trim(),
        ratioId: ratioId || '3:4',
        perPage: 12,
        requestUrl: getObsidianRequestUrl(),
      });

      statusEl.empty();
      statusEl.addClass('hidden');

      if (!resp.results || resp.results.length === 0) {
        statusEl.removeClass('hidden');
        statusEl.createDiv({ cls: 'card-media-picker-empty-title', text: '未找到匹配的摄影作品' });
        statusEl.createDiv({ cls: 'card-media-picker-empty-desc', text: '建议尝试更换关键词，或点击上方推荐标签。' });
        return;
      }

      renderPhotoGrid(resp.results);
    } catch (err) {
      statusEl.empty();
      statusEl.removeClass('hidden');
      const msg = err instanceof Error ? err.message : String(err);
      statusEl.createDiv({ cls: 'card-media-picker-empty-title', text: 'Unsplash 检索失败' });
      statusEl.createDiv({ cls: 'card-media-picker-empty-desc', text: msg });
    } finally {
      isSearching = false;
      searchBtn.disabled = false;
    }
  };

  const renderPhotoGrid = (photos) => {
    gridContainer.empty();
    photos.forEach((photo) => {
      const item = gridContainer.createDiv({ cls: 'card-media-picker-item' });
      item.createEl('img', {
        cls: 'card-media-picker-item-img',
        attr: {
          src: photo.thumbUrl,
          alt: photo.altDescription || '摄影图片',
          loading: 'lazy',
        },
      });

      // 摄影师署名
      item.createDiv({
        cls: 'card-media-picker-item-author',
        text: photo.authorName ? `@${photo.authorName}` : 'Unsplash',
      });

      item.addEventListener('click', async () => {
        item.addClass('is-loading');
        new Notice('正在下载高清摄影图并转码...');
        try {
          const downloadUrl = photo.rawUrl.includes('?')
            ? `${photo.rawUrl}&w=1600&q=85&auto=format`
            : `${photo.rawUrl}?w=1600&q=85&auto=format`;
          const base64Data = await downloadAsBase64(downloadUrl, getObsidianRequestUrl(), 'image/jpeg');
          onSelect({ dataUrl: base64Data, source: 'unsplash' });
        } catch (err) {
          item.removeClass('is-loading');
          const msg = err instanceof Error ? err.message : String(err);
          new Notice(`图片下载失败: ${msg}`);
        }
      });
    });
  };

  searchBtn.addEventListener('click', () => doSearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch(searchInput.value);
    }
  });

  // 初始加载一组精选摄影图
  doSearch('');
}

/**
 * 未配置 Key 时的引导空态
 */
function renderMissingKeyView(container, view, ratioId, onSelect, onOpenSettings) {
  const emptyBox = container.createDiv({ cls: 'card-media-picker-empty' });
  emptyBox.createDiv({ cls: 'card-media-picker-empty-title', text: '尚未配置 Unsplash Access Key' });
  emptyBox.createDiv({
    cls: 'card-media-picker-empty-desc',
    text: '配置官方免费 Access Key 后，即可在此直接按关键词检索世界级摄影作品，每小时享有 50 次免费搜索额度。您也可以先使用免配置的精选随机摄影。',
  });

  const btnRow = emptyBox.createDiv({ cls: 'card-media-picker-empty-actions' });
  const randomBtn = btnRow.createEl('button', {
    cls: 'mod-cta',
    text: '获取 Picsum 随机摄影',
  });
  randomBtn.addEventListener('click', async () => {
    randomBtn.disabled = true;
    randomBtn.textContent = '获取中...';
    try {
      const dataUrl = await fetchPicsumCoverImage({
        ratioId: ratioId || '3:4',
        requestUrl: getObsidianRequestUrl(),
      });
      onSelect({ dataUrl, source: 'picsum' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`获取随机图失败: ${msg}`);
      randomBtn.disabled = false;
      randomBtn.textContent = '获取 Picsum 随机摄影';
    }
  });

  const settingsBtn = btnRow.createEl('button', {
    text: '前往设置配置 Key',
  });
  settingsBtn.addEventListener('click', () => {
    if (typeof onOpenSettings === 'function') {
      onOpenSettings();
    }
  });
}
