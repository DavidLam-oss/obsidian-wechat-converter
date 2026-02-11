function hashBytesFNV1a(bytes) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function computeBlobFingerprint(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return 'unknown';
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const contentHash = hashBytesFNV1a(bytes);
  const type = blob.type || 'application/octet-stream';
  return `${type}:${bytes.length}:${contentHash}`;
}

function getCachedEntry(cache, key) {
  if (!cache || !cache.has(key)) return null;
  const value = cache.get(key);
  if (typeof value === 'string') {
    // Backward compatibility with old cache format (url string only)
    return { url: value, fingerprint: '' };
  }
  if (value && typeof value === 'object' && typeof value.url === 'string') {
    return value;
  }
  return null;
}

async function processAllImages({
  html,
  api,
  progressCallback,
  pMap,
  srcToBlob,
  imageUploadCache,
  cacheNamespace = '',
}) {

    const div = document.createElement('div');
    div.innerHTML = html;
    const imgs = Array.from(div.querySelectorAll('img'));

    // 1. 提取唯一图片 URL
    const uniqueUrls = new Set();
    // 建立 src -> new_url 的映射
    const urlMap = new Map();

    for (const img of imgs) {
        if (img.src) uniqueUrls.add(img.src);
    }

    const total = uniqueUrls.size;
    let completed = 0;

    // 2. 定义并发上传任务
    const tasks = Array.from(uniqueUrls);

    await pMap(tasks, async (src) => {
        const cacheKey = `${cacheNamespace}::${src}`;
        const cached = getCachedEntry(imageUploadCache, cacheKey);
        try {
          const blob = await srcToBlob(src);
          const fingerprint = await computeBlobFingerprint(blob);

          if (
            cached &&
            cached.fingerprint &&
            cached.fingerprint === fingerprint &&
            cached.url
          ) {
            urlMap.set(src, cached.url);
            completed++;
            if (progressCallback) {
              progressCallback(completed, total);
            }
            return;
          }

          const res = await api.uploadImage(blob);
          urlMap.set(src, res.url);
          if (imageUploadCache) {
            imageUploadCache.set(cacheKey, {
              url: res.url,
              fingerprint,
            });
          }
        } catch (error) {
          // 熔断机制：如果是配额超限等致命错误，停止后续所有上传
          if (error.isFatal) throw error;

          if (cached && cached.url) {
            console.warn('图片读取失败，使用缓存链接兜底:', src);
            urlMap.set(src, cached.url);
          } else {
            console.error('图片处理失败，已跳过:', src, error);
          }
          // 仅在控制台记录，不中断流程，也不频繁弹窗打扰用户
          // 用户会在预览中看到该图片未被替换
        }

        completed++;
        if (progressCallback) {
            progressCallback(completed, total);
        }
    }, 3); // 并发数限制为 3

    // 3. 替换 DOM 中的图片链接
    for (const img of imgs) {
      if (urlMap.has(img.src)) {
        img.src = urlMap.get(img.src);
      }
    }

    return div.innerHTML;
  }

async function processMathFormulas({
  html,
  api,
  progressCallback,
  pMap,
  simpleHash,
  svgUploadCache,
  svgToPngBlob,
}) {

    // 创建临时容器并挂载到 DOM (为了正确计算 SVG 尺寸)
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px'; // 模拟常见的文章宽度
    container.innerHTML = html;
    document.body.appendChild(container);

    try {
      // 查找所有 SVG 容器 (MathJax 公式或其他矢量图)
      // 之前只查找 mjx-container svg，导致部分 MathJax 配置下(直接输出svg)无法识别
      // 现在改为通过 querySelectorAll('svg') 捕获所有 SVG，彻底解决内容过长问题
      const mathNodes = Array.from(container.querySelectorAll('svg'));
      if (mathNodes.length === 0) return html;

      const total = mathNodes.length;
      let completed = 0;

      // 并发处理
      await pMap(mathNodes, async (svg) => {
        try {
          // 0. 计算 SVG 指纹 (简单的 Hash)
          const svgStr = new XMLSerializer().serializeToString(svg);
          // 加上样式属性作为指纹一部分，因为同样的公式可能有不同的 style (color/align)
          const styleAttr = svg.getAttribute('style') || '';
          const fillAttr = svg.getAttribute('fill') || '';
          const fingerprint = simpleHash(svgStr + styleAttr + fillAttr);

          let wechatUrl = '';
          let logicalWidth, logicalHeight, rawStyle;

          // 1. 检查缓存
          if (svgUploadCache.has(fingerprint)) {
            // console.log('DEBUG: Hit SVG Cache!', fingerprint);
            const cachedData = svgUploadCache.get(fingerprint);
            wechatUrl = cachedData.url;
            logicalWidth = cachedData.width;
            logicalHeight = cachedData.height;
            rawStyle = cachedData.style;
          } else {
            // 2. 缓存未命中，执行转图和上传
            const result = await svgToPngBlob(svg); // { blob, width, height, style }
            const res = await api.uploadImage(result.blob);

            wechatUrl = res.url;
            logicalWidth = result.width;
            logicalHeight = result.height;
            rawStyle = result.style;

            // 写入缓存
            svgUploadCache.set(fingerprint, {
                url: wechatUrl,
                width: logicalWidth,
                height: logicalHeight,
                style: rawStyle
            });
          }

          // 3. 替换 DOM
          const img = document.createElement('img');
          img.src = wechatUrl;
          img.className = 'math-formula-image';

          // 4. 关键修复：设置显示尺寸为原始逻辑尺寸
          if (logicalWidth) img.setAttribute('width', logicalWidth);
          if (logicalHeight) img.setAttribute('height', logicalHeight);

          // 5. 样式继承
          let finalStyle = 'display: inline-block; margin: 0 2px;';
          const svgStyle = svg.getAttribute('style');
          if (svgStyle) finalStyle += svgStyle;

          const parent = svg.parentElement;
          if (parent && parent.tagName.toLowerCase().includes('mjx')) {
             const parentStyle = parent.getAttribute('style');
             if (parentStyle) finalStyle += parentStyle;
             img.setAttribute('style', finalStyle);
             parent.replaceWith(img);
          } else {
             if (rawStyle) finalStyle += rawStyle;
             img.setAttribute('style', finalStyle);
             svg.replaceWith(img);
          }

          completed++;
          if (progressCallback) progressCallback(completed, total);
        } catch (error) {
          // 熔断机制：如果是配额超限等致命错误，停止后续所有上传
          if (error.isFatal) throw error;

          console.error('公式转换失败，保留原SVG:', error);
        }
      }, 3); // 限制并发数

      return container.innerHTML;
    } finally {
      // 清理 DOM
      document.body.removeChild(container);
    }
  }

module.exports = {
  processAllImages,
  processMathFormulas,
};
