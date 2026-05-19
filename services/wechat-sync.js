function replaceUnuploadedDraftImagesWithPlaceholders(html) {
  if (typeof document === 'undefined') {
    return { html, imageSources: [] };
  }

  const div = document.createElement('div');
  div.innerHTML = html || '';
  const imageSources = [];

  Array.from(div.querySelectorAll('img')).forEach((img) => {
    const src = String(img.getAttribute('src') || '').trim();
    const isWechatImage = /^https?:\/\/mmbiz\.qpic\.cn\//i.test(src)
        || /^https?:\/\/mmbiz\.qlogo\.cn\//i.test(src);
    if (src && isWechatImage) return;

    imageSources.push(src);
    const placeholder = document.createElement('p');
    placeholder.setAttribute('style', 'margin:12px 0;padding:10px 12px;border:1px dashed #d0d7de;border-radius:6px;color:#8c6d1f;background:#fff8e5;font-size:13px;line-height:1.7;');
    placeholder.textContent = src
      ? `图片未同步，请在微信后台手动补传：${src}`
      : '图片未同步，请在微信后台手动补传。';
    img.replaceWith(placeholder);
  });

  return {
    html: div.innerHTML,
    imageSources,
  };
}

/**
 * 通过标题在草稿列表中匹配已有草稿
 * 使用 no_content=1 不拉取正文，节省流量
 * @param {object} api - WechatAPI 实例
 * @param {string} title - 要匹配的文章标题
 * @returns {Promise<{mediaId: string, index: number}|null>} 匹配结果，null 表示未找到
 */
async function findDraftByTitle(api, title) {
  const countRes = await api.getDraftCount();
  const totalCount = countRes.total_count || 0;
  if (totalCount === 0) return null;

  const PAGE_SIZE = 20;
  const matches = [];

  // 分页遍历所有草稿（不含正文）
  for (let offset = 0; offset < totalCount; offset += PAGE_SIZE) {
    const batch = await api.batchGetDrafts(offset, PAGE_SIZE, 1);
    const items = batch.item || [];

    for (const item of items) {
      const articles = item.content?.news_item || [];
      for (let idx = 0; idx < articles.length; idx++) {
        if (articles[idx].title === title) {
          matches.push({ mediaId: item.media_id, index: idx, updateTime: item.update_time });
        }
      }
    }
    // 如果拉到的数量少于 PAGE_SIZE，说明到底了
    if (items.length < PAGE_SIZE) break;
  }

  if (matches.length === 0) return null;
  // 唯一匹配直接返回；多个匹配取最新的一条
  matches.sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0));
  return { mediaId: matches[0].mediaId, index: matches[0].index, matchCount: matches.length };
}

function createWechatSyncService(deps) {
  const {
    createApi,
    srcToBlob,
    processAllImages,
    processMathFormulas,
    prepareHtmlForDraft = async (html) => html,
    cleanHtmlForDraft,
    cleanupConfiguredDirectory,
    getFirstImageFromArticle,
  } = deps;

  return {
    async syncToDraft({
      account,
      proxyUrl,
      currentHtml,
      activeFile,
      publishMeta,
      sessionCoverBase64,
      sessionDigest,
      sessionThumbMediaId,
      draftMediaId,
      onStatus,
      onImageProgress,
      onMathProgress,
    }) {
      const api = createApi(account.appId, account.appSecret, proxyUrl);
      const imageUploadFailures = [];

      // 封面处理：如果已有 media_id（从素材库选择），直接使用；否则上传
      let thumbMediaId = sessionThumbMediaId || '';
      if (!thumbMediaId) {
        if (onStatus) onStatus('cover');
        const coverSrc = sessionCoverBase64 || publishMeta.coverSrc || getFirstImageFromArticle();
        if (!coverSrc) {
          throw new Error('未设置封面图，同步失败。请在弹窗中上传封面。');
        }

        const coverBlob = await srcToBlob(coverSrc);
        const coverRes = await api.uploadCover(coverBlob);
        thumbMediaId = coverRes.media_id;
      }

      let draftHtml = await prepareHtmlForDraft(currentHtml);

      if (onStatus) onStatus('images');
      let processedHtml = await processAllImages(draftHtml, api, (current, total) => {
        if (onImageProgress) onImageProgress(current, total);
      }, {
        accountId: account.id || '',
        onImageFailure: (failures) => {
          if (Array.isArray(failures)) imageUploadFailures.push(...failures);
        },
      });

      if (processedHtml.includes('mjx-container') || processedHtml.includes('<svg')) {
        if (onStatus) onStatus('math');
        processedHtml = await processMathFormulas(processedHtml, api, (current, total) => {
          if (onMathProgress) onMathProgress(current, total);
        });
      }

      const cleanedResult = replaceUnuploadedDraftImagesWithPlaceholders(cleanHtmlForDraft(processedHtml));
      const cleanedHtml = cleanedResult.html;

      const title = activeFile ? activeFile.basename : '无标题文章';
      const article = {
        title: title.substring(0, 64),
        content: cleanedHtml,
        thumb_media_id: thumbMediaId,
        author: account.author || '',
        digest: sessionDigest || '一键同步自 Obsidian',
      };
      const contentSourceUrl = String(account.contentSourceUrl || '').trim();
      if (contentSourceUrl) {
        article.content_source_url = contentSourceUrl;
      }
      if (typeof account.openComment === 'boolean') {
        article.need_open_comment = account.openComment ? 1 : 0;
      }
      if (typeof account.onlyFansCanComment === 'boolean') {
        article.only_fans_can_comment = account.onlyFansCanComment ? 1 : 0;
      }

      // 草稿提交：有 draftMediaId 时更新，否则新建
      let resultMediaId = '';
      const isUpdate = !!draftMediaId;

      if (onStatus) onStatus('draft');

      if (isUpdate) {
        // 更新已有草稿（index=0 表示单图文的第一篇）
        await api.updateDraft(draftMediaId, 0, article);
        resultMediaId = draftMediaId;
      } else {
        const draftRes = await api.createDraft(article);
        resultMediaId = draftRes.media_id;
      }

      const cleanupResult = await cleanupConfiguredDirectory(activeFile);

      return {
        article,
        mediaId: resultMediaId,
        isUpdate,
        cleanupResult,
        imageUploadFailures,
        placeholderImageSources: cleanedResult.imageSources,
      };
    },
  };
}

module.exports = {
  replaceUnuploadedDraftImagesWithPlaceholders,
  createWechatSyncService,
  findDraftByTitle,
};
