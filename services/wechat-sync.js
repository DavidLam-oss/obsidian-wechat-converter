function createWechatSyncService(deps) {
  const {
    createApi,
    srcToBlob,
    processAllImages,
    processMathFormulas,
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
      onStatus,
      onImageProgress,
      onMathProgress,
    }) {
      const api = createApi(account.appId, account.appSecret, proxyUrl);

      if (onStatus) onStatus('cover');
      const coverSrc = sessionCoverBase64 || publishMeta.coverSrc || getFirstImageFromArticle();
      if (!coverSrc) {
        throw new Error('未设置封面图，同步失败。请在弹窗中上传封面。');
      }

      const coverBlob = await srcToBlob(coverSrc);
      const coverRes = await api.uploadCover(coverBlob);
      const thumbMediaId = coverRes.media_id;

      if (onStatus) onStatus('images');
      let processedHtml = await processAllImages(currentHtml, api, (current, total) => {
        if (onImageProgress) onImageProgress(current, total);
      }, {
        accountId: account.id || '',
      });

      if (processedHtml.includes('mjx-container') || processedHtml.includes('<svg')) {
        if (onStatus) onStatus('math');
        processedHtml = await processMathFormulas(processedHtml, api, (current, total) => {
          if (onMathProgress) onMathProgress(current, total);
        });
      }

      const cleanedHtml = cleanHtmlForDraft(processedHtml);
      const base64Count = (cleanedHtml.match(/src=["']data:image/g) || []).length;
      if (base64Count > 0) {
        throw new Error(`检测到 ${base64Count} 张图片未成功上传（仍为 Base64 格式），这会导致同步失败。建议检查网络连接并重试。`);
      }

      const title = activeFile ? activeFile.basename : '无标题文章';
      const article = {
        title: title.substring(0, 64),
        content: cleanedHtml,
        thumb_media_id: thumbMediaId,
        author: account.author || '',
        digest: sessionDigest || '一键同步自 Obsidian',
      };

      if (onStatus) onStatus('draft');
      await api.createDraft(article);
      const cleanupResult = await cleanupConfiguredDirectory(activeFile);

      return {
        article,
        cleanupResult,
      };
    },
  };
}

module.exports = {
  createWechatSyncService,
};
