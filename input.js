const { Plugin, MarkdownView, ItemView, Notice } = require('obsidian');
const { PluginSettingTab, Setting } = require('obsidian');
const { createRenderPipelines } = require('./services/render-pipeline');
const { buildRenderRuntime } = require('./services/dependency-loader');
const { resolveMarkdownSource } = require('./services/markdown-source');
const { normalizeVaultPath, isAbsolutePathLike } = require('./services/path-utils');
const { renderObsidianTripletMarkdown } = require('./services/obsidian-triplet-renderer');
const { createWechatSyncService } = require('./services/wechat-sync');
const { resolveSyncAccount, toSyncFriendlyMessage } = require('./services/sync-context');
const { processAllImages: processAllImagesService, processMathFormulas: processMathFormulasService } = require('./services/wechat-media');
const { cleanHtmlForDraft: cleanHtmlForDraftService } = require('./services/wechat-html-cleaner');

const TRIPLET_PARITY_DEBUG_REV = 'triplet-parity-r6';

// 视图类型标识
const APPLE_STYLE_VIEW = 'apple-style-converter';

// 默认设置
const DEFAULT_SETTINGS = {
  theme: 'github',
  themeColor: 'blue',
  customColor: '#0366d6',
  fontFamily: 'sans-serif',
  fontSize: 3,
  macCodeBlock: true,
  codeLineNumber: true,
  avatarUrl: '',
  avatarBase64: '',  // Base64 编码的本地头像，优先级高于 avatarUrl
  enableWatermark: false,
  showImageCaption: true,  // 关闭水印时是否显示图片说明文字
  // 多账号支持
  wechatAccounts: [],  // [{ id, name, appId, appSecret }]
  defaultAccountId: '',
  // 代理设置
  proxyUrl: '',  // Cloudflare Worker 等代理地址
  // 预览设置
  usePhoneFrame: true, // 是否使用手机框预览
  // 三件套渲染开关
  useTripletPipeline: false,
  tripletFallbackToPhase2: true,
  enforceTripletParity: true, // 严格零差异门禁
  tripletParityVerboseLog: false, // 输出完整差异 payload 到控制台（调试用）
  // 旧字段保留用于迁移检测
  useNativePipeline: false,
  enableLegacyFallback: true,
  enforceNativeParity: true,
  // 排版设置
  sidePadding: 16, // 页面两侧留白 (px)
  coloredHeader: false, // 标题是否使用主题色
  // 同步后清理资源（默认关闭，避免破坏性行为）
  cleanupAfterSync: false,
  cleanupUseSystemTrash: true,
  cleanupDirTemplate: '', // 发送成功后要清理的目录（支持 {{note}}）
  // 旧字段保留用于迁移检测
  wechatAppId: '',
  wechatAppSecret: '',

};

// 账号上限
const MAX_ACCOUNTS = 5;

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// 辅助函数：等待指定毫秒数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 辅助函数：并发控制 (p-limit 简化版)
async function pMap(array, mapper, concurrency = 3) {
  const results = [];
  const executing = [];
  let isFailed = false;
  for (const item of array) {
    if (isFailed) break;
    const p = Promise.resolve().then(() => mapper(item));
    results.push(p);
    // Fix: Ensure cleanup happens regardless of success or failure
    // If error occurs, mark as failed to stop scheduling new tasks
    const e = p.catch(() => { isFailed = true; }).then(() => executing.splice(executing.indexOf(e), 1));
    executing.push(e);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

/**
 * 🚀 微信公众号 API 对接模块
 */
class WechatAPI {
  constructor(appId, appSecret, proxyUrl = '') {
    this.appId = appId;
    this.appSecret = appSecret;
    this.proxyUrl = proxyUrl;
    this.accessToken = '';
    this.expireTime = 0;
  }

  /**
   * 通用重试机制 (仅处理网络层面的不稳定性)
   * 不再处理 Token 逻辑，专注于网络波动和配置错误
   */
  async requestWithRetry(operation, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // 0. 通用熔断：如果错误已被标记为致命，直接抛出
        if (error.isFatal) throw error;

        // 识别配置错误 (AppID/Secret 错误)，直接失败
        const isConfigError = error.message && (
            error.message.includes('(40013)') || // invalid appid
            error.message.includes('(40125)') || // invalid appsecret
            error.message.includes('invalid appid')
        );

        if (isConfigError) {
           console.warn(`[WechatAPI] Configuration error detected, aborting retry: ${error.message}`);
           throw error;
        }

        // 熔断机制：识别致命错误 (配额超限/素材满)，立即停止重试并向上抛出
        // 45009: 接口调用频次达到上限 (日限额)
        if (error.message && (error.message.includes('45009') || error.message.includes('reach max api daily quota limit'))) {
            const fatalError = new Error('微信接口今日额度已用完 (45009)，请明天再试或切换账号。');
            fatalError.isFatal = true;
            throw fatalError;
        }

        // 45001: 素材数量达到上限 (总限额)
        if (error.message && (error.message.includes('45001') || error.message.includes('media size out of limit'))) {
            const fatalError = new Error('微信后台素材库已满 (45001)。请登录微信公众平台 -> 素材管理，手动删除旧图片以释放空间。');
            fatalError.isFatal = true;
            throw fatalError;
        }

        // 识别 Token 过期错误，直接失败，交由上层 actionWithTokenRetry 处理刷新
        const isTokenError = error.message && (
            error.message.includes('40001') ||
            error.message.includes('42001') ||
            error.message.includes('40014')
        );

        if (isTokenError) {
            // console.warn(`[WechatAPI] Token error detected in retry layer, bubbling up: ${error.message}`);
            throw error;
        }

        // 识别业务层明确错误 (已收到微信响应但报错)，直接失败，避免无意义重试
        // 排除 -1 (系统繁忙) 这种情况可以重试
        const isBusinessError = error.message && error.message.includes('微信API报错') && !error.message.includes('(-1)');
        if (isBusinessError) {
             console.warn(`[WechatAPI] Business logic error detected, aborting retry: ${error.message}`);
             throw error;
        }

        console.warn(`[WechatAPI] Network request failed (attempt ${i + 1}/${maxRetries}): ${error.message}`);

        if (i < maxRetries - 1) {
          await sleep(1000 * (i + 1)); // 线性退避: 1s, 2s, 3s
        }
      }
    }
    throw lastError;
  }

  /**
   * 高阶函数：执行带 Token 生命周期管理的操作
   * 负责：获取 Token -> 执行操作 -> 捕获 Token 过期错误 -> 刷新 Token -> 重试
   * @param {Function} action - 接收 token 参数的异步函数
   */
  async actionWithTokenRetry(action) {
    let retryCount = 0;
    const maxRetries = 1; // Token 过期只重试一次

    while (true) {
      try {
        const token = await this.getAccessToken();
        return await action(token);
      } catch (error) {
        // 检查是否是 Token 过期 (40001, 42001, 40014)
        const isTokenExpired = error.message && (
          error.message.includes('40001') ||
          error.message.includes('42001') ||
          error.message.includes('40014')
        );

        if (isTokenExpired && retryCount < maxRetries) {
          console.warn(`[WechatAPI] Token expired (${error.message}), refreshing and retrying...`);
          this.accessToken = ''; // 1. 清除本地缓存
          retryCount++;
          continue; // 2. 重新循环：再次调用 getAccessToken (会触发新请求) -> 执行 action (使用新 Token 拼接 URL)
        }

        throw error; // 其他错误或重试次数耗尽，向上抛出
      }
    }
  }

  /**
   * 验证代理 URL 安全性 (必须使用 HTTPS)
   */
  validateProxyUrl(proxyUrl) {
    if (proxyUrl && !proxyUrl.toLowerCase().startsWith('https://')) {
      const error = new Error('Security Error: Insecure HTTP proxy blocked. Proxy URL must use HTTPS.');
      error.isFatal = true; // 禁止重试
      throw error;
    }
  }

  /**
   * 发送请求（如果配置了代理，通过代理发送）
   * 纯粹的 HTTP 请求封装，不包含重试逻辑
   */
  async sendRequest(url, options = {}) {
    const { requestUrl } = require('obsidian');

    if (this.proxyUrl) {
      this.validateProxyUrl(this.proxyUrl);

      // 通过代理发送
      const proxyResponse = await requestUrl({
        url: this.proxyUrl,
        method: 'POST',
        body: JSON.stringify({
          url: url,
          method: options.method || 'GET',
          data: options.body ? JSON.parse(options.body) : undefined
        }),
        contentType: 'application/json'
      });
      return proxyResponse.json;
    } else {
      // 直连
      const response = await requestUrl({ url, ...options });
      return response.json;
    }
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.expireTime - 300000) {
      return this.accessToken;
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;
    // 网络重试包裹
    const data = await this.requestWithRetry(() => this.sendRequest(url));

    if (data.access_token) {
      this.accessToken = data.access_token;
      this.expireTime = Date.now() + (data.expires_in * 1000);
      return this.accessToken;
    } else {
      throw new Error(`获取 Token 失败: ${data.errmsg || '未知错误'} (${data.errcode || '??'})`);
    }
  }


  async uploadCover(blob) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`;
      return await this.uploadMultipart(url, blob, 'media');
    });
  }

  async uploadImage(blob) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`;
      return await this.uploadMultipart(url, blob, 'media');
    });
  }

  async createDraft(article) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;

      // ⚠️ 关键修正: createDraft 非幂等，不使用 requestWithRetry 自动重试网络超时，
      // 避免在"请求成功但响应丢失"的情况下创建重复草稿。
      // 失败后由用户手动点击同步更安全。
      const data = await this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ articles: [article] })
      });

      if (data.media_id) {
        return data;
      }
      throw new Error(`创建草稿失败: ${data.errmsg || JSON.stringify(data)} (${data.errcode || 'N/A'})`);
    });
  }

  async uploadMultipart(url, blob, fieldName) {
    return this.requestWithRetry(async () => {
      const { requestUrl } = require('obsidian');

      // 获取真实的 MIME 类型和文件扩展名
      const mimeType = blob.type || 'image/jpeg';
      const ext = mimeType.includes('gif') ? 'gif' : mimeType.includes('png') ? 'png' : 'jpg';

      if (this.proxyUrl) {
        this.validateProxyUrl(this.proxyUrl);

        // 通过代理发送：将文件转为 base64 (使用 FileReader 提升性能)
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        const base64Data = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
        });

        const proxyResponse = await requestUrl({
          url: this.proxyUrl,
          method: 'POST',
          body: JSON.stringify({
            url: url,
            method: 'UPLOAD',  // 特殊标记，告诉代理这是文件上传
            fileData: base64Data,
            fileName: `image.${ext}`,
            mimeType: mimeType,
            fieldName: fieldName
          }),
          contentType: 'application/json'
        });

        const data = proxyResponse.json;
        if (data.media_id || data.url) {
          return data;
        } else {
          throw new Error(`微信API报错: ${data.errmsg} (${data.errcode})`);
        }
      } else {
        // 直连：原有逻辑
        const boundary = '----ObsidianWechatConverterBoundary' + Math.random().toString(36).substring(2);
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        let header = `--${boundary}\r\n`;
        header += `Content-Disposition: form-data; name="${fieldName}"; filename="image.${ext}"\r\n`;
        header += `Content-Type: ${mimeType}\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;

        const headerBytes = new TextEncoder().encode(header);
        const footerBytes = new TextEncoder().encode(footer);

        const bodyBytes = new Uint8Array(headerBytes.length + bytes.length + footerBytes.length);
        bodyBytes.set(headerBytes, 0);
        bodyBytes.set(bytes, headerBytes.length);
        bodyBytes.set(footerBytes, headerBytes.length + bytes.length);

        try {
          const response = await requestUrl({
            url: url,
            method: 'POST',
            body: bodyBytes.buffer,
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`
            }
          });

          const data = response.json;
          if (data.media_id || data.url) {
            return data;
          } else {
            throw new Error(`微信API报错: ${data.errmsg} (${data.errcode})`);
          }
        } catch (error) {
          console.error('Upload Error:', error);
          throw new Error(`网络请求失败: ${error.message}`);
        }
      }
    });
  }
}

/**
 * 📝 微信公众号转换视图
 */
class AppleStyleView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentHtml = null;
    this.converter = null;
    this.legacyRenderPipeline = null;
    this.nativeRenderPipeline = null;
    this.theme = null;
    this.lastActiveFile = null;
    this.sessionCoverBase64 = ''; // 本次文章的临时封面
    this.sessionDigest = ''; // 本次同步的摘要

    // 双向同步滚动互斥锁 (原子锁方案)
    // 用于区分"用户滚动"和"代码同步滚动"，彻底解决死循环和抖动问题
    // 状态缓存：Map<FilePath, { coverBase64, digest }>
    // 用于在不关闭插件面板的情况下，切换文章或关闭弹窗后保留封面和摘要
    this.articleStates = new Map();

    // 公式/SVG 上传缓存：Map<Hash, WechatURL>
    // 避免重复上传相同的公式，节省微信 API 调用额度 (Quota) 并提升速度
    this.svgUploadCache = new Map();
    // 普通图片上传缓存：Map<accountId::src, wechatUrl>
    // 用于同一视图生命周期内跨次同步复用，避免重复上传相同图片
    this.imageUploadCache = new Map();

    this.renderGeneration = 0;
    this.lastParityMismatchNoticeKey = '';
  }

  getViewType() {
    return APPLE_STYLE_VIEW;
  }

  getDisplayText() {
    return '📝 微信排版转换';
  }

  getIcon() {
    return 'wand';
  }

  async onOpen() {
    console.log('🍎 转换器面板打开');
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('apple-converter-container');

    // 加载依赖
    await this.loadDependencies();

    // 创建设置面板
    this.createSettingsPanel(container);

    // 创建预览区 - 根据设置决定是否使用手机框
    const previewWrapper = container.createEl('div', {
      cls: `apple-preview-wrapper ${this.plugin.settings.usePhoneFrame ? 'mode-phone' : 'mode-classic'}`
    });

    // Light Dismiss: 点击预览区域(手机框外)收起设置面板
    previewWrapper.addEventListener('click', (e) => {
      // 确保点击的不是设置面板本身（虽然设置面板是 overlay，但为了保险起见）
      // 且当前设置面板是可见的
      if (this.settingsOverlay && this.settingsOverlay.classList.contains('visible')) {
        // 如果点击的是 previewWrapper 本身（空白处），或者是 wrapper 内部非交互元素
        // 这里简化为：只要点击发生，就尝试关闭面板。
        // 由于 settingsOverlay 是 absolute 定位在 toolbar 下方，
        // 且 z-index 高于 previewWrapper，所以点击 settingsOverlay 不会冒泡到 previewWrapper
        // (前提是 settingsOverlay 不是 previewWrapper 的子元素，确实不是，它是兄弟元素)
        this.settingsOverlay.classList.remove('visible');
        // 同时移除按钮激活状态。需要获取 settingsBtn 引用？
        // 由于 settingsBtn 是在 createSettingsPanel 内部定义的局部变量，这里无法直接访问。
        // 我们需要一种方式来同步状态。
        // 方案：查找 DOM 中的按钮并移除类
        const btn = container.querySelector('.apple-icon-btn[aria-label="样式设置"]');
        if (btn) btn.classList.remove('active');
      }
    });

    if (this.plugin.settings.usePhoneFrame) {
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
    setTimeout(async () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && this.converter) {
        await this.convertCurrent(true);
      }
    }, 500);
  }


  /**
   * 监听活动文件切换
   */
  registerActiveFileChange() {
    // 监听文件切换
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', async () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file) {
          this.lastActiveFile = activeView.file;
        }
        this.updateCurrentDoc();

        // 更新滚动同步绑定
        if (activeView) {
          this.registerScrollSync(activeView);
        }

        if (activeView && this.converter) {
          setTimeout(async () => {
            await this.convertCurrent(true);
          }, 300);
        }
      })
    );

    // 监听编辑器内容变化 (实时预览)
    const debounce = (func, wait) => {
      let timeout;
      return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
      };
    };

    const debouncedConvert = debounce(async () => {
      // 1. 真正的可见性检查 (True Visibility Check)
      // 如果插件被折叠、隐藏或从未打开，offsetParent 为 null
      if (!this.containerEl.offsetParent) return;

      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      // 仅当当前编辑的文件是最后激活的文件时才更新
      if (activeView && activeView.file && this.lastActiveFile && activeView.file.path === this.lastActiveFile.path) {
        await this.convertCurrent(true);
      }
    }, 500); // 500ms 延迟

    this.registerEvent(
      this.app.workspace.on('editor-change', debouncedConvert)
    );
  }

  /**
   * 注册同步滚动 (双向: Editor <-> Preview)
   * 采用"原子锁"机制 + "差值检测"机制，彻底解决死循环和精度问题
   */
  registerScrollSync(activeView) {
    // 1. 清理旧的监听器
    if (this.activeEditorScroller && this.editorScrollListener) {
      this.activeEditorScroller.removeEventListener('scroll', this.editorScrollListener);
    }
    if (this.previewContainer && this.previewScrollListener) {
      this.previewContainer.removeEventListener('scroll', this.previewScrollListener);
    }

    this.activeEditorScroller = null;
    this.editorScrollListener = null;
    this.previewScrollListener = null;

    // 重置原子锁标志位
    this.ignoreNextPreviewScroll = false;
    this.ignoreNextEditorScroll = false;

    if (!activeView) return;

    // 2. 获取 Editor Scroller
    const editorScroller = activeView.contentEl.querySelector('.cm-scroller');
    if (!editorScroller) return;
    this.activeEditorScroller = editorScroller;

    // === Listener A: Editor -> Preview ===
    this.editorScrollListener = () => {
      // 可见性检查：使用原生 offsetParent 判断是否在 DOM 树中且可见
      if (!this.containerEl.offsetParent) return;

      // 锁检查：如果是 Preview 带来的滚动，本次忽略，并重置锁
      if (this.ignoreNextEditorScroll) {
        this.ignoreNextEditorScroll = false;
        return;
      }

      if (!this.previewContainer) return;

      const editorHeight = editorScroller.scrollHeight - editorScroller.clientHeight;
      const previewHeight = this.previewContainer.scrollHeight - this.previewContainer.clientHeight;

      if (editorHeight <= 0 || previewHeight <= 0) return;

      // 计算目标位置
      let targetScrollTop;

      // 端点严格对齐
      if (editorScroller.scrollTop === 0) {
        targetScrollTop = 0;
      } else if (Math.abs(editorScroller.scrollTop - editorHeight) < 2) { // 放宽到底部判定
        targetScrollTop = previewHeight;
      } else {
        const ratio = editorScroller.scrollTop / editorHeight;
        targetScrollTop = ratio * previewHeight;
      }

      // 差值检测：只有当变化足够大时才应用，避免微小抖动和死循环
      if (Math.abs(this.previewContainer.scrollTop - targetScrollTop) > 1) {
        this.ignoreNextPreviewScroll = true; // 上锁：告诉 Preview 下次滚动是代码触发的
        this.previewContainer.scrollTop = targetScrollTop;
      }
    };

    // === Listener B: Preview -> Editor ===
    this.previewScrollListener = () => {
      // 可见性检查
      if (!this.containerEl.offsetParent) return;

      // 锁检查
      if (this.ignoreNextPreviewScroll) {
        this.ignoreNextPreviewScroll = false;
        return;
      }

      const editorHeight = editorScroller.scrollHeight - editorScroller.clientHeight;
      const previewHeight = this.previewContainer.scrollHeight - this.previewContainer.clientHeight;

      if (editorHeight <= 0 || previewHeight <= 0) return;

      // 计算目标位置
      let targetScrollTop;

      // 端点严格对齐
      if (this.previewContainer.scrollTop === 0) {
        targetScrollTop = 0;
      } else if (Math.abs(this.previewContainer.scrollTop - previewHeight) < 2) {
        targetScrollTop = editorHeight;
      } else {
        const ratio = this.previewContainer.scrollTop / previewHeight;
        targetScrollTop = ratio * editorHeight;
      }

      // 差值检测
      if (Math.abs(editorScroller.scrollTop - targetScrollTop) > 1) {
        this.ignoreNextEditorScroll = true; // 上锁
        editorScroller.scrollTop = targetScrollTop;
      }
    };

    // 4. 绑定监听 (使用 passive 提升性能)
    editorScroller.addEventListener('scroll', this.editorScrollListener, { passive: true });
    this.previewContainer.addEventListener('scroll', this.previewScrollListener, { passive: true });
  }

  /**
   * 加载依赖库
   */
  async loadDependencies() {
    const adapter = this.app.vault.adapter;
    // Use dynamic path from manifest to allow folder renaming
    const basePath = this.plugin.manifest.dir;

    try {
      const runtime = await buildRenderRuntime({
        settings: this.plugin.settings,
        app: this.app,
        adapter,
        basePath,
      });
      this.theme = runtime.theme;
      this.converter = runtime.converter;
      const { legacyPipeline, nativePipeline } = createRenderPipelines({
        converter: this.converter,
        getFlags: () => this.getRenderPipelineFlags(),
        candidateRenderer: async (markdown, context = {}) => {
          return renderObsidianTripletMarkdown({
            app: this.app,
            converter: this.converter,
            markdown,
            sourcePath: context.sourcePath || '',
            component: this,
          });
        },
      });
      this.legacyRenderPipeline = legacyPipeline;
      this.nativeRenderPipeline = nativePipeline;

      console.log('✅ 依赖加载完成');
    } catch (error) {
      console.error('❌ 依赖加载失败:', error);
      new Notice('依赖加载失败: ' + error.message);
    }
  }


  /**
   * 创建设置面板（重构为：顶部工具栏 + 悬浮设置层）
   */
  createSettingsPanel(container) {
    const { setIcon } = require('obsidian'); // 引入图标工具

    // 1. 创建顶部工具栏
    const toolbar = container.createEl('div', { cls: 'apple-top-toolbar' });

    // 1.1 左侧：双层信息（插件名 + 文档名）
    this.currentDocLabel = toolbar.createEl('div', { cls: 'apple-toolbar-title' });
    this.currentDocLabel.createDiv({ text: '微信公众号转换器', cls: 'apple-toolbar-plugin-name' });
    this.docTitleText = this.currentDocLabel.createDiv({ text: '未选择文档', cls: 'apple-toolbar-doc-name' });

    // 1.2 右侧：操作按钮组
    const actions = toolbar.createEl('div', { cls: 'apple-toolbar-actions' });

    // 按钮工厂函数
    const createIconBtn = (icon, title, onClick) => {
      const btn = actions.createEl('div', {
        cls: 'apple-icon-btn',
        attr: { 'aria-label': title } // Tooltip
      });
      setIcon(btn, icon);
      btn.addEventListener('click', onClick);
      return btn;
    };

    // [设置] 按钮
    const settingsBtn = createIconBtn('sliders-horizontal', '样式设置', () => {
      this.settingsOverlay.classList.toggle('visible');
      settingsBtn.classList.toggle('active');
    });

    // [复制] 按钮
    this.copyBtn = createIconBtn('copy', '复制到公众号', () => this.copyHTML());

    // [同步] 按钮 (仅当有账号时显示)
    const accounts = this.plugin.settings.wechatAccounts || [];
    if (accounts.length > 0) {
      createIconBtn('send', '一键同步到草稿箱', () => this.showSyncModal());
    }

    // 2. 创建悬浮设置层 (初始隐藏)
    this.settingsOverlay = container.createEl('div', { cls: 'apple-settings-overlay' });
    const settingsArea = this.settingsOverlay.createEl('div', { cls: 'apple-settings-area' });

    // === 主题选择 ===
    this.createSection(settingsArea, '主题', (section) => {
      const grid = section.createEl('div', { cls: 'apple-btn-grid' });
      const themes = AppleTheme.getThemeList();
      themes.forEach(t => {
        const btn = grid.createEl('button', {
          cls: `apple-btn-theme ${this.plugin.settings.theme === t.value ? 'active' : ''}`,
          text: t.label,
        });
        btn.dataset.value = t.value;
        btn.addEventListener('click', () => this.onThemeChange(t.value, grid));
      });
    });

    // === 字体选择 ===
    this.createSection(settingsArea, '字体', (section) => {
      const select = section.createEl('select', { cls: 'apple-select' });
      [
        { value: 'sans-serif', label: '无衬线' },
        { value: 'serif', label: '衬线' },
        { value: 'monospace', label: '等宽' },
      ].forEach(opt => {
        const option = select.createEl('option', { value: opt.value, text: opt.label });
        if (this.plugin.settings.fontFamily === opt.value) option.selected = true;
      });
      select.addEventListener('change', (e) => this.onFontFamilyChange(e.target.value));
    });

    // === 字号选择 ===
    this.createSection(settingsArea, '字号', (section) => {
      const grid = section.createEl('div', { cls: 'apple-btn-row' });
      const sizeOpts = [
        { value: 1, label: '小' },
        { value: 2, label: '较小' },
        { value: 3, label: '推荐' },
        { value: 4, label: '较大' },
        { value: 5, label: '大' },
      ];

      sizeOpts.forEach(s => {
        const btn = grid.createEl('button', {
          cls: `apple-btn-size ${this.plugin.settings.fontSize === s.value ? 'active' : ''}`,
          text: s.label,
        });
        btn.dataset.value = s.value;
        btn.addEventListener('click', () => this.onFontSizeChange(s.value, grid));
      });
    });

    // === 主题色 (移到标题样式上方) ===
    this.createSection(settingsArea, '主题色', (section) => {
      const grid = section.createEl('div', { cls: 'apple-color-grid' });
      const colors = AppleTheme.getColorList();

      // 预设颜色
      colors.forEach(c => {
        const btn = grid.createEl('button', {
          cls: `apple-btn-color ${this.plugin.settings.themeColor === c.value ? 'active' : ''}`,
        });
        btn.dataset.value = c.value;
        btn.style.setProperty('--btn-color', c.color);
        btn.addEventListener('click', () => this.onColorChange(c.value, grid));
      });

      // 自定义颜色
      const customBtn = grid.createEl('button', {
        cls: `apple-btn-custom-text ${this.plugin.settings.themeColor === 'custom' ? 'active' : ''}`,
        text: '自定义',
        title: '自定义颜色'
      });
      customBtn.dataset.value = 'custom';

      // 隐藏的颜色选择器
      const colorInput = grid.createEl('input', {
        type: 'color',
        cls: 'apple-color-picker-hidden'
      });
      colorInput.value = this.plugin.settings.customColor || '#000000';
      colorInput.style.visibility = 'hidden';
      colorInput.style.width = '0';
      colorInput.style.height = '0';
      colorInput.style.position = 'absolute';

      // 点击按钮触发颜色选择
      customBtn.addEventListener('click', () => {
        colorInput.click();
      });

      // 颜色改变实时预览
      colorInput.addEventListener('input', (e) => {
        customBtn.style.setProperty('--btn-color', e.target.value);
      });

      // 颜色确认后保存
      colorInput.addEventListener('change', async (e) => {
        const newColor = e.target.value;
        customBtn.style.setProperty('--btn-color', newColor);

        // 更新设置
        this.plugin.settings.customColor = newColor;
        this.theme.update({ customColor: newColor });
        await this.onColorChange('custom', grid);
      });
    });

    // === 标题样式 (移到主题色下方) ===
    this.createSection(settingsArea, '标题样式', (section) => {
      // 1. 容器布局
      section.style.display = 'flex';
      section.style.alignItems = 'center';

      // 2. 开关控件 (标准大小 40x22)
      const toggle = section.createEl('label', { cls: 'apple-toggle' });
      const checkbox = toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' });
      checkbox.checked = this.plugin.settings.coloredHeader;
      toggle.createEl('span', { cls: 'apple-toggle-slider' });

      // 3. 描述文本 (优化布局：增加间距，缩小字号)
      section.createEl('span', {
        text: '标题使用加深主题色',
        attr: {
          style: 'font-size: 11px; color: var(--apple-secondary); margin-left: 12px; opacity: 0.8; font-weight: 500; transform: translateY(-1px);'
        }
      });

      checkbox.addEventListener('change', async () => {
        this.plugin.settings.coloredHeader = checkbox.checked;
        await this.plugin.saveSettings();

        // 关键修复：更新主题状态并重绘
        this.theme.update({ coloredHeader: checkbox.checked });
        // 强制刷新
        await this.convertCurrent(true);
      });
    });

    // === Mac 代码块开关 ===
    this.createSection(settingsArea, 'Mac 风格代码块', (section) => {
      const toggle = section.createEl('label', { cls: 'apple-toggle' });
      const checkbox = toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' });
      checkbox.checked = this.plugin.settings.macCodeBlock;
      toggle.createEl('span', { cls: 'apple-toggle-slider' });
      checkbox.addEventListener('change', () => this.onMacCodeBlockChange(checkbox.checked));
    });

    // === 代码块行号开关 ===
    this.createSection(settingsArea, '显示代码行号', (section) => {
      const toggle = section.createEl('label', { cls: 'apple-toggle' });
      const checkbox = toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' });
      checkbox.checked = this.plugin.settings.codeLineNumber;
      toggle.createEl('span', { cls: 'apple-toggle-slider' });
      checkbox.addEventListener('change', () => this.onCodeLineNumberChange(checkbox.checked));
    });

    // === 页面两侧留白 ===
    this.createSection(settingsArea, '页面两侧留白', (section) => {
      const container = section.createEl('div', {
        cls: 'apple-slider-container',
        style: 'width: 100%; display: flex; align-items: center; gap: 10px;'
      });

      const slider = container.createEl('input', {
        type: 'range',
        cls: 'apple-slider',
        attr: { min: 0, max: 40, step: 1 }
      });
      slider.value = this.plugin.settings.sidePadding;
      slider.style.flex = '1';

      const valueLabel = container.createEl('span', {
        text: `${this.plugin.settings.sidePadding}px`,
        style: 'font-size: 12px; color: var(--apple-secondary); min-width: 32px; text-align: right;'
      });

      slider.addEventListener('input', async (e) => {
        const val = parseInt(e.target.value);
        valueLabel.setText(`${val}px`);
        // 实时更新主题，触发预览
        this.plugin.settings.sidePadding = val;
        this.theme.update({ sidePadding: val });
        // 保存设置需要防抖，避免频繁写入
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
          await this.plugin.saveSettings();
        }, 500);
        await this.convertCurrent(true);
      });
    });

    // === 显示图片说明文字 ===
    const captionSetting = new Setting(settingsArea)
      .setName('显示图片说明文字')
      .setDesc('关闭水印时，在图片下方显示说明文字')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showImageCaption)
        .onChange(async (value) => {
          this.plugin.settings.showImageCaption = value;
          await this.plugin.saveSettings();

          // 实时更新转换器配置并刷新预览
          if (this.converter) {
            this.converter.updateConfig({ showImageCaption: value });
            await this.convertCurrent(true);
          }
        }));

    // 根据全局水印设置更新状态
    if (this.plugin.settings.enableWatermark) {
      captionSetting.setDesc('因全局设置中已开启水印，此选项默认开启');
      const toggleComp = captionSetting.components[0];
      toggleComp.setValue(true); // 视觉上设为开启
      toggleComp.setDisabled(true); // 禁用交互
      // 强制禁止任何鼠标事件，消除点击时的跳动感
      if (toggleComp.toggleEl) {
        toggleComp.toggleEl.style.pointerEvents = 'none';
        toggleComp.toggleEl.style.opacity = '0.6'; // 增加透明度以明确指示禁用
        toggleComp.toggleEl.style.filter = 'grayscale(100%)';
      }
    }
  }



  /**
   * 创建账号选择器
   */
  createAccountSelector(parent) {
    const accounts = this.plugin.settings.wechatAccounts || [];
    if (accounts.length === 0) return;

    const section = parent.createEl('div', { cls: 'apple-setting-section wechat-account-selector' });
    section.createEl('label', { cls: 'apple-setting-label', text: '同步账号' });

    const select = section.createEl('select', { cls: 'wechat-account-select' });

    const defaultId = this.plugin.settings.defaultAccountId;

    for (const account of accounts) {
      const option = select.createEl('option', {
        value: account.id,
        text: account.id === defaultId ? `${account.name} (默认)` : account.name
      });
      if (account.id === defaultId) {
        option.selected = true;
      }
    }

    // 保存选中的账号 ID 到实例属性
    this.selectedAccountId = defaultId;
    select.addEventListener('change', (e) => {
      this.selectedAccountId = e.target.value;
    });
  }

  /**
   * 从文章内容中提取第一张图片作为封面
   */
  getFirstImageFromArticle() {
    if (!this.currentHtml) return null;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.currentHtml;
    const imgs = Array.from(tempDiv.querySelectorAll('img'));

    // 遍历所有图片，跳过头像（alt="logo"）
    for (const img of imgs) {
      if (img.alt === 'logo') continue;
      if (img.src) return img.src;
    }
    return null;
  }

  /**
   * 获取当前发布上下文文件：
   * 1) 优先当前活动文件
   * 2) 回退到最近一次活动文件（侧边栏切换 tab 后常见）
   */
  getPublishContextFile() {
    const activeFile = this.app?.workspace?.getActiveFile?.();
    if (activeFile) return activeFile;
    if (this.lastActiveFile) return this.lastActiveFile;
    return null;
  }

  /**
   * 读取当前文档 frontmatter 中的发布元数据
   * @returns {{ excerpt: string, cover: string, cover_dir: string, coverSrc: string|null }}
   */
  getFrontmatterPublishMeta(activeFile) {
    if (!activeFile) {
      return { excerpt: '', cover: '', cover_dir: '', coverSrc: null };
    }

    const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
    const excerpt = this.getFrontmatterString(frontmatter, ['excerpt']);
    const cover = this.getFrontmatterString(frontmatter, ['cover']);
    const cover_dir = this.getFrontmatterString(frontmatter, ['cover_dir', 'coverDir', 'cover-dir', 'coverdir', 'CoverDIR']);

    // 解析失败时静默回退：返回 null，不中断流程
    const coverSrc = cover ? this.resolveVaultPathToResourceSrc(cover) : null;

    return { excerpt, cover, cover_dir, coverSrc };
  }

  getFrontmatterString(frontmatter, keys) {
    if (!frontmatter || typeof frontmatter !== 'object') return '';
    if (!Array.isArray(keys) || keys.length === 0) return '';

    const normalizedTargets = new Set(keys.map(key => this.normalizeFrontmatterKey(key)));
    for (const key of keys) {
      const value = frontmatter[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    for (const [key, value] of Object.entries(frontmatter)) {
      if (!normalizedTargets.has(this.normalizeFrontmatterKey(key))) continue;
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    return '';
  }

  normalizeFrontmatterKey(key) {
    return String(key || '').toLowerCase().replace(/[_-]/g, '');
  }

  getFrontmatterKeyMap(frontmatter, keys) {
    const result = {};
    if (!frontmatter || typeof frontmatter !== 'object') return result;
    if (!Array.isArray(keys) || keys.length === 0) return result;

    const normalizedTargets = new Set(keys.map(key => this.normalizeFrontmatterKey(key)));
    for (const [key, value] of Object.entries(frontmatter)) {
      if (!normalizedTargets.has(this.normalizeFrontmatterKey(key))) continue;
      if (typeof value !== 'string') continue;
      const normalizedValue = this.normalizeVaultPath(value);
      if (!normalizedValue) continue;
      result[key] = normalizedValue;
    }
    return result;
  }

  isPathInsideDirectory(filePath, dirPath) {
    const file = this.normalizeVaultPath(filePath);
    const dir = this.normalizeVaultPath(dirPath);
    if (!file || !dir) return false;
    if (file === dir) return true;
    return file.startsWith(`${dir}/`);
  }

  isPathInsideDirectoryByTail(filePath, dirPath) {
    const file = this.normalizeVaultPath(filePath);
    const dir = this.normalizeVaultPath(dirPath);
    if (!file || !dir) return false;

    const dirSegments = dir.split('/').filter(Boolean);
    if (dirSegments.length < 2) return false;

    // 允许清理目录与 frontmatter 路径存在“根前缀差异”
    // 例如 cleanedDir: Wechat/published/img
    //      cover:     published/img/post-cover.jpg
    for (let i = 1; i <= dirSegments.length - 2; i++) {
      const tailDir = dirSegments.slice(i).join('/');
      if (this.isPathInsideDirectory(file, tailDir)) {
        return true;
      }
    }
    return false;
  }

  shouldClearFrontmatterPathAfterCleanup(pathValue, cleanedDir) {
    const normalized = this.normalizeVaultPath(pathValue);
    if (!normalized) return false;
    if (this.isPathInsideDirectory(normalized, cleanedDir)) return true;
    return this.isPathInsideDirectoryByTail(normalized, cleanedDir);
  }

  async clearInvalidPublishMetaAfterCleanup(activeFile, cleanedDirPath) {
    if (!activeFile || !cleanedDirPath) return null;

    const cleanedDir = this.normalizeVaultPath(cleanedDirPath);
    if (!cleanedDir) return null;

    try {
      await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
        if (!frontmatter || typeof frontmatter !== 'object') return;

        const coverMap = this.getFrontmatterKeyMap(frontmatter, ['cover']);
        const coverDirMap = this.getFrontmatterKeyMap(frontmatter, ['cover_dir', 'coverDir', 'cover-dir', 'coverdir', 'CoverDIR']);

        for (const [key, value] of Object.entries(coverMap)) {
          if (this.shouldClearFrontmatterPathAfterCleanup(value, cleanedDir)) {
            frontmatter[key] = '';
          }
        }

        for (const [key, value] of Object.entries(coverDirMap)) {
          if (this.shouldClearFrontmatterPathAfterCleanup(value, cleanedDir)) {
            frontmatter[key] = '';
          }
        }
      });
    } catch (error) {
      return `资源已删除，但清理 frontmatter 中失效的 cover/cover_dir 失败: ${error.message}`;
    }

    return null;
  }

  /**
   * 将 vault 相对路径解析为可预览/上传的资源 src（通常是 app://）
   */
  resolveVaultPathToResourceSrc(vaultPath) {
    if (typeof vaultPath !== 'string') return null;
    const normalized = vaultPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized) return null;

    try {
      const file = this.app.vault.getAbstractFileByPath(normalized);
      if (!file) return null;
      if (typeof file.extension !== 'string') return null; // 仅接受文件，不接受目录
      return this.app.vault.getResourcePath(file);
    } catch (error) {
      // frontmatter 路径失效或不是文件时，静默回退
      return null;
    }
  }

  normalizeVaultPath(vaultPath) {
    return normalizeVaultPath(vaultPath);
  }

  getCleanupDirTemplate() {
    const raw = typeof this.plugin?.settings?.cleanupDirTemplate === 'string'
      ? this.plugin.settings.cleanupDirTemplate
      : '';
    return this.normalizeVaultPath(raw);
  }

  resolveCleanupDirPath(activeFile) {
    const template = this.getCleanupDirTemplate();
    if (!template) {
      return { path: '', warning: '未配置清理目录，请在插件设置中先填写目录后再启用自动清理' };
    }

    const hasNotePlaceholder = /\{\{\s*note\s*\}\}/i.test(template);
    if (hasNotePlaceholder && !activeFile) {
      return { path: '', warning: '当前没有活动文档，无法解析清理目录中的 {{note}}' };
    }

    const noteName = (activeFile?.basename || '').trim();
    const resolved = template.replace(/\{\{\s*note\s*\}\}/gi, noteName);
    const normalized = this.normalizeVaultPath(resolved);
    if (!normalized) {
      return { path: '', warning: '清理目录为空，请检查设置值' };
    }

    return { path: normalized };
  }

  /**
   * 清理目录安全校验：禁止空路径、上跳路径、系统配置目录等危险路径
   */
  isSafeCleanupDirPath(vaultPath) {
    const normalized = this.normalizeVaultPath(vaultPath);
    if (!normalized) return false;
    if (normalized === '.') return false;
    if (normalized.includes('..')) return false;
    if (normalized === '.obsidian' || normalized.startsWith('.obsidian/')) return false;
    return true;
  }

  /**
   * 在同步成功后按配置清理目录
   * 失败返回 warning，不抛错（避免影响同步成功状态）
   */
  async cleanupConfiguredDirectory(activeFile) {
    if (!this.plugin.settings.cleanupAfterSync) {
      return { attempted: false };
    }

    const useSystemTrash = this.plugin.settings.cleanupUseSystemTrash !== false;
    const resolved = this.resolveCleanupDirPath(activeFile);
    if (!resolved.path) {
      return { attempted: true, success: false, warning: resolved.warning || '未解析到清理目录' };
    }

    const normalized = resolved.path;
    if (!this.isSafeCleanupDirPath(normalized)) {
      return { attempted: true, success: false, warning: `清理目录不安全，已跳过: ${normalized}` };
    }

    const abstractFile = this.app.vault.getAbstractFileByPath(normalized);
    if (!abstractFile) {
      return { attempted: true, success: false, warning: `清理目录不存在: ${normalized}` };
    }

    const isFile = typeof abstractFile.extension === 'string';
    if (isFile) {
      return { attempted: true, success: false, warning: `清理路径不是目录，已跳过: ${normalized}` };
    }

    try {
      if (typeof this.app.vault.trash === 'function') {
        await this.app.vault.trash(abstractFile, useSystemTrash);
      } else if (typeof this.app.vault.delete === 'function') {
        await this.app.vault.delete(abstractFile, true);
      } else {
        throw new Error('当前 Obsidian 版本不支持删除接口');
      }
    } catch (error) {
      return { attempted: true, success: false, warning: `删除失败 (${normalized}): ${error.message}` };
    }

    const frontmatterWarning = await this.clearInvalidPublishMetaAfterCleanup(activeFile, normalized);
    if (frontmatterWarning) {
      return { attempted: true, success: true, cleanedPath: normalized, warning: frontmatterWarning };
    }

    return { attempted: true, success: true, cleanedPath: normalized };
  }

  /**
   * 创建设置区块
   */
  createSection(parent, label, builder) {
    const section = parent.createEl('div', { cls: 'apple-setting-section' });
    section.createEl('label', { cls: 'apple-setting-label', text: label });
    const content = section.createEl('div', { cls: 'apple-setting-content' });
    builder(content);
  }

  /**
   * 显示同步选项 Modal
   */
  showSyncModal() {
    if (!this.currentHtml) {
      new Notice('⚠️ 请先打开一个文章进行转换');
      return;
    }

    const { Modal } = require('obsidian');
    const modal = new Modal(this.app);
    modal.titleEl.setText('同步到微信草稿箱');
    modal.contentEl.addClass('wechat-sync-modal');

    // 获取当前活动文件的路径，用于状态缓存
    const activeFile = this.getPublishContextFile();
    const currentPath = activeFile ? activeFile.path : null;
    const frontmatterMeta = this.getFrontmatterPublishMeta(activeFile);

    // 尝试从缓存读取状态
    let cachedState = null;
    if (currentPath && this.articleStates.has(currentPath)) {
      cachedState = this.articleStates.get(currentPath);
    }

    const accounts = this.plugin.settings.wechatAccounts || [];
    const defaultId = this.plugin.settings.defaultAccountId;
    let selectedAccountId = defaultId;

    // 封面逻辑：优先使用缓存 -> frontmatter.cover -> 文章第一张图
    let coverBase64 = cachedState?.coverBase64 || frontmatterMeta.coverSrc || this.getFirstImageFromArticle();

    // 更新 sessionCoverBase64 以便 onSyncToWechat 使用
    this.sessionCoverBase64 = coverBase64;

    // 账号选择器
    const accountSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section' });
    accountSection.createEl('label', { text: '账号', cls: 'wechat-modal-label' });
    const accountSelect = accountSection.createEl('select', { cls: 'wechat-account-select' });

    for (const account of accounts) {
      const option = accountSelect.createEl('option', {
        value: account.id,
        text: account.id === defaultId ? `${account.name} (默认)` : account.name
      });
      if (account.id === defaultId) option.selected = true;
    }
    accountSelect.addEventListener('change', (e) => {
      selectedAccountId = e.target.value;
    });

    // 封面设置
    const coverSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section' });
    coverSection.createEl('label', { text: '封面图', cls: 'wechat-modal-label' });

    const coverContent = coverSection.createDiv({ cls: 'wechat-modal-cover-content' });
    const coverPreview = coverContent.createDiv({ cls: 'wechat-modal-cover-preview' });

    const updatePreview = () => {
      coverPreview.empty();
      if (coverBase64) {
        coverPreview.createEl('img', { attr: { src: coverBase64 } });
        // 有封面 -> 启用同步按钮
        syncBtn.disabled = false;
        syncBtn.setText('开始同步');
        syncBtn.removeClass('apple-btn-disabled');
      } else {
        // UI 优化：去除 emoji，使用纯净的提示样式 (样式在 CSS 中定义)
        coverPreview.createEl('div', {
          text: '暂无封面',
          cls: 'wechat-modal-no-cover'
        });
        // 无封面 -> 禁用同步按钮
        syncBtn.disabled = true;
        syncBtn.setText('请先设置封面');
        syncBtn.addClass('apple-btn-disabled');
      }
    };

    const coverBtns = coverContent.createDiv({ cls: 'wechat-modal-cover-btns' });
    const uploadBtn = coverBtns.createEl('button', { text: '上传' });

    // 摘要设置
    const digestSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section' });
    digestSection.createEl('label', { text: '文章摘要（可选）', cls: 'wechat-modal-label' });

    // 自动提取文章前 45 字作为默认摘要
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.currentHtml || '';
    // 使用 innerText 可以更好地处理换行，但为了安全起见，还是用 textContent 并清理空格
    const autoDigest = (tempDiv.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 45);

    // 摘要逻辑：优先使用缓存 -> frontmatter.excerpt -> 自动提取
    const initialDigest = cachedState?.digest !== undefined
      ? cachedState.digest
      : (frontmatterMeta.excerpt || autoDigest);

    const digestInput = digestSection.createEl('textarea', {
      cls: 'wechat-modal-digest-input',
      placeholder: '留空则自动提取文章前 45 字'
    });
    // Explicitly set the value to ensure it renders correctly in the textarea
    digestInput.value = initialDigest;

    digestInput.rows = 3;
    digestInput.style.width = '100%';
    digestInput.style.resize = 'vertical';
    digestInput.maxLength = 120; // 限制最大输入 120 字

    // 字数统计
    const charCount = digestSection.createEl('div', {
      cls: 'wechat-digest-count',
      text: `${digestInput.value.length}/120`,
      style: 'text-align: right; font-size: 11px; color: var(--text-muted); margin-top: 4px; opacity: 0.7;'
    });

    // 实时更新缓存（摘要）
    digestInput.addEventListener('input', () => {
      charCount.setText(`${digestInput.value.length}/120`);
      if (currentPath) {
        const state = this.articleStates.get(currentPath) || {};
        state.digest = digestInput.value.trim(); // 允许为空字符串（代表清空）
        // 如果用户清空了输入框，我们存空字符串，以便下次打开也是空的（还是说回退到 auto?）
        // 逻辑修正：如果用户清空，通常意味着想用默认或不发摘要。这里我们存用户输入的值。
        // 但如果原本逻辑是"空则自动提取"，那这里输入框空的时候，sessionDigest 会变成 autoDigest
        this.articleStates.set(currentPath, { ...state, digest: digestInput.value });
      }
    });

    // 操作按钮
    const btnRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });

    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => modal.close();

    const syncBtn = btnRow.createEl('button', { text: '开始同步', cls: 'mod-cta' });
    // 初始化时就检查状态
    updatePreview();

    syncBtn.onclick = async () => {
      if (!coverBase64) {
        new Notice('❌ 请先设置封面图');
        return;
      }
      modal.close();
      this.selectedAccountId = selectedAccountId;
      this.sessionCoverBase64 = coverBase64;
      // 传递用户输入的摘要，或使用自动提取的摘要
      this.sessionDigest = digestInput.value.trim() || autoDigest || '一键同步自 Obsidian';
      await this.onSyncToWechat();
    };

    // 实时更新缓存（封面图） - 需要修改 uploadBtn 的回调逻辑
    uploadBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          coverBase64 = event.target.result;
          this.sessionCoverBase64 = coverBase64;
          updatePreview();

          // 更新缓存
          if (currentPath) {
            const state = this.articleStates.get(currentPath) || {};
            this.articleStates.set(currentPath, { ...state, coverBase64: coverBase64 });
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    modal.open();
  }

  /**
   * 处理同步到微信逻辑
   */
  async onSyncToWechat() {
    const account = resolveSyncAccount({
      accounts: this.plugin.settings.wechatAccounts || [],
      selectedAccountId: this.selectedAccountId,
      defaultAccountId: this.plugin.settings.defaultAccountId,
    });

    if (!account) {
      new Notice('❌ 请先在插件设置中添加微信公众号账号');
      return;
    }

    if (!this.currentHtml) {
      new Notice('❌ 请先打开一个文章进行转换');
      return;
    }

    const notice = new Notice(`🚀 正在使用 ${account.name} 同步...`, 0);
    const activeFile = this.getPublishContextFile();
    const publishMeta = this.getFrontmatterPublishMeta(activeFile);

    try {
      const syncService = createWechatSyncService({
        createApi: (appId, appSecret, proxyUrl) => new WechatAPI(appId, appSecret, proxyUrl),
        srcToBlob: this.srcToBlob.bind(this),
        processAllImages: this.processAllImages.bind(this),
        processMathFormulas: this.processMathFormulas.bind(this),
        cleanHtmlForDraft: this.cleanHtmlForDraft.bind(this),
        cleanupConfiguredDirectory: this.cleanupConfiguredDirectory.bind(this),
        getFirstImageFromArticle: this.getFirstImageFromArticle.bind(this),
      });

      const { cleanupResult } = await syncService.syncToDraft({
        account,
        proxyUrl: this.plugin.settings.proxyUrl,
        currentHtml: this.currentHtml,
        activeFile,
        publishMeta,
        sessionCoverBase64: this.sessionCoverBase64,
        sessionDigest: this.sessionDigest,
        onStatus: (stage) => {
          if (stage === 'cover') notice.setMessage('🖼️ 正在处理封面图...');
          if (stage === 'images') notice.setMessage('📸 正在同步正文图片...');
          if (stage === 'math') notice.setMessage('🧮 正在转换矢量图/数学公式...');
          if (stage === 'draft') notice.setMessage('📝 正在发送到微信草稿箱...');
        },
        onImageProgress: (current, total) => {
          notice.setMessage(`📸 正在同步正文图片 (${current}/${total})...`);
        },
        onMathProgress: (current, total) => {
          notice.setMessage(`🧮 正在转换矢量图/数学公式 (${current}/${total})...`);
        },
      });

      notice.hide();
      new Notice('✅ 同步成功！请前往微信公众号后台草稿箱查看');
      if (cleanupResult?.warning) {
        new Notice(`⚠️ 资源清理失败：${cleanupResult.warning}`, 7000);
      }
    } catch (error) {
      notice.hide();
      console.error('Wechat Sync Error:', error);
      const friendlyMsg = toSyncFriendlyMessage(error.message);
      new Notice(`❌ 同步失败: ${friendlyMsg}`);
    }
  }

  /**
   * 将各种形式的 src (Base64, URL, 路径) 转为 Blob
   */
  async srcToBlob(src) {
    // Base64 可以直接用 fetch 转换
    if (src.startsWith('data:')) {
      const resp = await fetch(src);
      return await resp.blob();
    }

    // Obsidian 本地资源 (app:// 或 capacitor://) 可以直接 fetch
    if (src.startsWith('app://') || src.startsWith('capacitor://')) {
      const resp = await fetch(src);
      return await resp.blob();
    }

    // HTTP/HTTPS 图床链接需要使用 requestUrl 绕过 CORS
    if (src.startsWith('http')) {
      const { requestUrl } = require('obsidian');
      const response = await requestUrl({ url: src });
      // requestUrl 返回 ArrayBuffer，需要转换为 Blob
      const contentType = response.headers['content-type'] || response.headers['Content-Type'] || 'image/jpeg';
      return new Blob([response.arrayBuffer], { type: contentType });
    }

    throw new Error('不支持的图片来源，请尝试重新上传封面');
  }

  /**
   * 处理 HTML 中的所有图片，上传到微信并替换链接
   * 支持并发上传 (Limit 3) 和进度回调
   */
  async processAllImages(html, api, progressCallback, cacheContext = {}) {
    const accountId = cacheContext?.accountId || '';
    return processAllImagesService({
      html,
      api,
      progressCallback,
      pMap,
      srcToBlob: this.srcToBlob.bind(this),
      imageUploadCache: this.imageUploadCache,
      cacheNamespace: accountId,
    });
  }

  /**
   * 处理 HTML 中的数学公式 (MathJax SVG -> Wechat Image)
   * 解决微信接口内容长度限制问题
   */
  async processMathFormulas(html, api, progressCallback) {
    return processMathFormulasService({
      html,
      api,
      progressCallback,
      pMap,
      simpleHash: this.simpleHash.bind(this),
      svgUploadCache: this.svgUploadCache,
      svgToPngBlob: this.svgToPngBlob.bind(this),
    });
  }

  /**
   * 将 SVG 元素转换为高分辨率 PNG Blob
   * 返回: { blob, width, height, style }
   */
  async svgToPngBlob(svgElement, scale = 3) {
    return new Promise((resolve, reject) => {
      try {
        // 0. 克隆节点 (防止修改影响原 DOM)
        // 解决 "Medium Risk": 失败回退时颜色污染问题
        const clonedSvg = svgElement.cloneNode(true);

        // 1. 获取 SVG 原始逻辑尺寸 (需用原节点获取尺寸，因为克隆节点未挂载)
        const rect = svgElement.getBoundingClientRect();
        let logicalWidth = rect.width;
        let logicalHeight = rect.height;

        // 尝试从属性获取更精确的值 (ex/em 单位)
        const rawWidth = svgElement.getAttribute('width');
        const rawHeight = svgElement.getAttribute('height');
        const rawStyle = svgElement.getAttribute('style');

        // 如果尺寸获取失败(0)，尝试读取属性
        if (logicalWidth === 0 || logicalHeight === 0) {
           logicalWidth = parseFloat(rawWidth) || 100;
           logicalHeight = parseFloat(rawHeight) || 20;
        }

        // 2. 序列化 SVG (操作克隆节点)
        // 智能改色策略：仅针对 MathJax 公式进行改色 (#333333)，保护 Mermaid 等其他 SVG 的原色
        const isMathJax = svgElement.getAttribute('role') === 'img' ||
                          svgElement.getAttribute('focusable') === 'false' ||
                          svgElement.classList.contains('MathJax');

        if (isMathJax) {
            clonedSvg.setAttribute('fill', '#333333');
            clonedSvg.style.color = '#333333';

            clonedSvg.querySelectorAll('*').forEach(el => {
                if (el.getAttribute('fill') === 'currentColor' || !el.getAttribute('fill')) {
                    el.setAttribute('fill', '#333333');
                }
                if (el.getAttribute('stroke') === 'currentColor') {
                    el.setAttribute('stroke', '#333333');
                }
            });
        }

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);
        const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            // Canvas 使用高倍率 (Retina 适配, 物理像素)
            canvas.width = logicalWidth * scale;
            canvas.height = logicalHeight * scale;

            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, logicalWidth, logicalHeight);

            URL.revokeObjectURL(url);

            canvas.toBlob((blob) => {
              if (blob) {
                  resolve({
                      blob,
                      width: logicalWidth, // 返回逻辑宽度 (例如 20.5)
                      height: logicalHeight,
                      style: rawStyle
                  });
              }
              else reject(new Error('Canvas conversion failed'));
            }, 'image/png');
          } catch (e) {
            reject(e);
          }
        };

        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(new Error('SVG Image load failed'));
        };

        img.src = url;
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 清理 HTML 以适配微信编辑器
   * 微信编辑器对嵌套列表支持不佳，需要：
   * 1. 处理嵌套列表父级 li 内的段落与行内内容（避免嵌套层级被打散）
   * 2. 将深层嵌套列表转为伪列表（避免微信扁平化）
   * 3. 移除嵌套 ul/ol 的 margin（避免被当成独立块）
   * 4. 移除空的 li 元素和空白文本节点
   */
  cleanHtmlForDraft(html) {
    return cleanHtmlForDraftService(html);
  }

  // === 设置变更处理 ===
  async onThemeChange(value, grid) {
    this.plugin.settings.theme = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme.update({ theme: value });
    await this.convertCurrent(true);
  }

  async onFontFamilyChange(value) {
    this.plugin.settings.fontFamily = value;
    await this.plugin.saveSettings();
    this.theme.update({ fontFamily: value });
    await this.convertCurrent(true);
  }

  async onFontSizeChange(value, grid) {
    this.plugin.settings.fontSize = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme.update({ fontSize: value });
    await this.convertCurrent(true);
  }

  async onColorChange(value, grid) {
    this.plugin.settings.themeColor = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme.update({ themeColor: value });

    // 移除：不再更改全局 CSS 变量，保持设置面板 UI 为默认蓝色 (#0071e3)
    // const colorHex = this.theme.getThemeColorValue();
    // this.containerEl.style.setProperty('--apple-accent', colorHex);

    await this.convertCurrent(true);
  }

  async onMacCodeBlockChange(checked) {
    this.plugin.settings.macCodeBlock = checked;
    await this.plugin.saveSettings();
    this.theme.update({ macCodeBlock: checked });
    // 重建 converter
    if (this.converter) {
      this.converter.reinit();
      await this.converter.initMarkdownIt();
    }
    await this.convertCurrent(true);
  }

  async onCodeLineNumberChange(checked) {
    this.plugin.settings.codeLineNumber = checked;
    await this.plugin.saveSettings();
    this.theme.update({ codeLineNumber: checked });
    // 重建 converter
    if (this.converter) {
      this.converter.reinit();
      await this.converter.initMarkdownIt();
    }
    await this.convertCurrent(true);
  }

  updateButtonActive(grid, value) {
    grid.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value == value);
    });
  }

  getRenderPipelineFlags() {
    const useTripletPipeline = this.plugin?.settings?.useTripletPipeline === true;
    const tripletFallbackToPhase2 = this.plugin?.settings?.tripletFallbackToPhase2 !== false;
    const enforceTripletParity = this.plugin?.settings?.enforceTripletParity !== false;
    return {
      useTripletPipeline,
      tripletFallbackToPhase2,
      enforceTripletParity,
      // Backward-compatible aliases for existing tests and fallback paths.
      useNativePipeline: useTripletPipeline,
      enableLegacyFallback: tripletFallbackToPhase2,
      enforceNativeParity: enforceTripletParity,
      parityErrorCode: 'TRIPLET_PARITY_MISMATCH',
      parityTransform: (html) => {
        const cleaned = this.cleanHtmlForDraft(html);
        // Normalize newline-only gaps between tags to avoid false-positive byte diffs.
        return cleaned
          .replace(/>\r?\n\s*</g, '><')
          .replace(/\r?\n/g, '');
      },
      onParityMismatch: ({ context, mismatch }) => {
        this.logParityMismatchDetails(context?.sourcePath || '', mismatch || {});
      },
    };
  }

  getActiveRenderPipeline() {
    const flags = this.getRenderPipelineFlags();
    if (flags.useTripletPipeline && this.nativeRenderPipeline) {
      return this.nativeRenderPipeline;
    }
    return this.legacyRenderPipeline;
  }

  async renderMarkdownForPreview(markdown, sourcePath) {
    const pipeline = this.getActiveRenderPipeline();
    if (!pipeline) {
      throw new Error('渲染管线未初始化');
    }
    return pipeline.renderForPreview(markdown, { sourcePath });
  }

  /**
   * 更新当前文档显示
   */
  updateCurrentDoc() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && this.docTitleText) {
      this.docTitleText.setText(activeView.file.basename);
      this.docTitleText.style.color = 'var(--apple-primary)'; // 恢复激活色
    } else if (this.lastActiveFile && this.docTitleText) {
      this.docTitleText.setText(this.lastActiveFile.basename);
      this.docTitleText.style.color = 'var(--apple-primary)';
    } else if (this.docTitleText) {
      this.docTitleText.setText('未选择文档');
      this.docTitleText.style.color = 'var(--apple-tertiary)'; // 灰色提示
    }
  }

  /**
   * 设置占位符
   */
  setPlaceholder() {
    this.previewContainer.empty();
    this.previewContainer.removeClass('apple-has-content'); // 移除内容状态类
    const placeholder = this.previewContainer.createEl('div', { cls: 'apple-placeholder' });
    placeholder.createEl('div', { cls: 'apple-placeholder-icon', text: '📝' });
    placeholder.createEl('h2', { text: '微信公众号排版转换器' });
    placeholder.createEl('p', { text: '将 Markdown 转换为精美的 HTML，一键同步到草稿箱' });
    const steps = placeholder.createEl('div', { cls: 'apple-steps' });
    steps.createEl('div', { text: '1️⃣ 打开需要转换的 Markdown 文件' });
    steps.createEl('div', { text: '2️⃣ 预览区会自动显示转换效果' });
    steps.createEl('div', { text: '3️⃣ 点击「一键同步到草稿箱」即可发送' });

    // 添加提示
    const note = placeholder.createEl('p', {
      text: '注意：如当前已打开文档但未显示，请重新点击一下文档即可触发',
      cls: 'apple-placeholder-note'
    });
  }

  showParityMismatchPlaceholder(sourcePath, mismatch = {}) {
    this.currentHtml = null;
    this.previewContainer.empty();
    this.previewContainer.removeClass('apple-has-content');

    const index = Number.isInteger(mismatch.index) ? mismatch.index : -1;
    const segmentCount = Number.isInteger(mismatch.segmentCount) ? mismatch.segmentCount : 0;
    const name = sourcePath ? String(sourcePath).split('/').pop() : '当前文档';
    const box = this.previewContainer.createEl('div', { cls: 'apple-placeholder' });
    box.createEl('div', { cls: 'apple-placeholder-icon', text: '⚠️' });
    box.createEl('h2', { text: '三件套渲染未通过零差异门禁' });
    box.createEl('p', {
      text: `${name} 与 Phase2 基线输出存在差异（首个 index ${index}，共 ${segmentCount} 段差异）。`,
    });
    if (Array.isArray(mismatch.segments) && mismatch.segments.length > 0) {
      const list = box.createEl('ul', { cls: 'apple-parity-list' });
      mismatch.segments.slice(0, 3).forEach((seg, idx) => {
        const segIndex = Number.isInteger(seg.index) ? seg.index : -1;
        const lLine = Number.isInteger(seg.legacyLine) ? seg.legacyLine : -1;
        const lCol = Number.isInteger(seg.legacyColumn) ? seg.legacyColumn : -1;
        list.createEl('li', {
          text: `#${idx + 1}: index ${segIndex}（legacy ${lLine}:${lCol}）`,
        });
      });
    }
    box.createEl('p', {
      cls: 'apple-placeholder-note',
      text: '建议开启“三件套失败时回退 Phase2”，或继续在当前模式下定位差异。'
    });
    this.updateCurrentDoc();
  }

  logParityMismatchDetails(sourcePath, mismatch = {}) {
    const fileName = sourcePath ? String(sourcePath).split('/').pop() : '当前文档';
    const index = Number.isInteger(mismatch.index) ? mismatch.index : -1;
    const segmentCount = Number.isInteger(mismatch.segmentCount) ? mismatch.segmentCount : 0;
    const lengthDelta = Number.isInteger(mismatch.lengthDelta) ? mismatch.lengthDelta : 0;
    const legacyLength = Number.isInteger(mismatch.legacyLength) ? mismatch.legacyLength : -1;
    const candidateLength = Number.isInteger(mismatch.candidateLength) ? mismatch.candidateLength : -1;
    const verboseLog = this.plugin?.settings?.tripletParityVerboseLog === true;

    console.groupCollapsed(
      `[Triplet Parity] ${fileName} mismatch: index=${index}, segments=${segmentCount}, delta=${lengthDelta}`
    );
    console.warn('[Triplet Parity] summary', {
      sourcePath,
      index,
      segmentCount,
      lengthDelta,
      legacyLength,
      candidateLength,
      truncated: mismatch.truncated === true,
    });

    if (Array.isArray(mismatch.segments) && mismatch.segments.length > 0) {
      const maxPreview = 5;
      mismatch.segments.slice(0, maxPreview).forEach((seg, idx) => {
        const segIndex = Number.isInteger(seg.index) ? seg.index : -1;
        const legacyLine = Number.isInteger(seg.legacyLine) ? seg.legacyLine : -1;
        const legacyColumn = Number.isInteger(seg.legacyColumn) ? seg.legacyColumn : -1;
        const candidateLine = Number.isInteger(seg.candidateLine) ? seg.candidateLine : -1;
        const candidateColumn = Number.isInteger(seg.candidateColumn) ? seg.candidateColumn : -1;
        console.warn(`[Triplet Parity] segment #${idx + 1}`, {
          index: segIndex,
          legacy: `${legacyLine}:${legacyColumn}`,
          candidate: `${candidateLine}:${candidateColumn}`,
          legacySnippet: seg.legacySnippet,
          candidateSnippet: seg.candidateSnippet,
        });
      });
      if (mismatch.segments.length > maxPreview) {
        console.warn(`[Triplet Parity] ${mismatch.segments.length - maxPreview} more segments omitted from log preview`);
      }
    }
    // Machine-consumable full payload for one-shot debugging and offline analysis.
    const fullDetails = {
      revision: TRIPLET_PARITY_DEBUG_REV,
      sourcePath,
      index,
      segmentCount,
      lengthDelta,
      legacyLength,
      candidateLength,
      truncated: mismatch.truncated === true,
      segments: Array.isArray(mismatch.segments) ? mismatch.segments : [],
    };
    if (typeof window !== 'undefined') {
      window.__OWC_LAST_PARITY_DETAILS = fullDetails;
      window.__OWC_TRIPLET_PARITY_REV = TRIPLET_PARITY_DEBUG_REV;
    }
    if (verboseLog) {
      console.log('[Triplet Parity] full-details', fullDetails);
    }
    console.groupEnd();
    // Emit once outside collapsed group so terminal-style log collectors can capture it.
    if (verboseLog) {
      console.error('[Triplet Parity] full-details-json', JSON.stringify(fullDetails));
    }
  }


  /**
   * 转换当前文档
   */
  async convertCurrent(silent = false) {
    const generation = ++this.renderGeneration;
    const source = await resolveMarkdownSource({
      app: this.app,
      lastActiveFile: this.lastActiveFile,
      MarkdownViewType: MarkdownView,
    });

    if (!source.ok) {
      if (!silent) new Notice('请先打开一个 Markdown 文件');
      return;
    }
    const markdown = source.markdown;
    const sourcePath = source.sourcePath;

    if (!markdown.trim()) {
      if (!silent) new Notice('当前文件内容为空');
      return;
    }

    try {
      if (!silent) new Notice('⚡ 正在转换...');
      const html = await this.renderMarkdownForPreview(markdown, sourcePath);

      if (generation !== this.renderGeneration) return;

      this.currentHtml = html;
      // 重置手动上传的封面，确保切换文章时不会残留上一篇的封面
      this.sessionCoverBase64 = null;

      // 滚动位置保持 (Scroll Preservation)
      const scrollTop = this.previewContainer.scrollTop;
      this.previewContainer.innerHTML = html;
      this.previewContainer.scrollTop = scrollTop;

      this.previewContainer.addClass('apple-has-content'); // 添加内容状态类
      this.updateCurrentDoc();
      if (!silent) new Notice('✅ 转换成功！');

    } catch (error) {
      console.error('转换失败:', error);
      if (error && (error.code === 'TRIPLET_PARITY_MISMATCH' || error.code === 'PARITY_MISMATCH')) {
        const index = Number.isInteger(error?.parity?.index) ? error.parity.index : -1;
        const segmentCount = Number.isInteger(error?.parity?.segmentCount) ? error.parity.segmentCount : 0;
        this.showParityMismatchPlaceholder(sourcePath, error.parity || {});

        const noticeKey = `${sourcePath || ''}:${index}:${segmentCount}`;
        if (!silent || this.lastParityMismatchNoticeKey !== noticeKey) {
          new Notice(`⚠️ 三件套渲染与 Phase2 基线不一致（首个 index ${index}，共 ${segmentCount} 段）`);
          this.lastParityMismatchNoticeKey = noticeKey;
        }
        return;
      }
      if (!silent) new Notice('❌ 转换失败: ' + error.message);
    }
  }

  /**
   * 视图改变大小时触发 (包括侧边栏展开、Tab切换等导致的大小变化)
   */
  onResize() {
    super.onResize();
    // 使用防抖，避免拖动侧边栏时频繁渲染
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);

    // 检查是否可见 (以防万一)
    if (!this.containerEl.offsetParent) return;

    this.resizeTimeout = setTimeout(() => {
      this.convertCurrent(true);
    }, 300);
  }

  /**
   * 渲染 HTML
   */
  renderHTML(html) {
    this.previewContainer.empty();
    this.previewContainer.innerHTML = html;
  }


  /**
   * 复制 HTML
   */
  async copyHTML() {
    if (this.isCopying) return;

    if (!this.currentHtml) {
      new Notice('⚠️ 请先打开一个文章进行转换');
      return;
    }

    this.isCopying = true;
    if (this.copyBtn) {
      this.copyBtn.classList.add('active'); // 可选：保持高亮状态
    }

    try {
      // 创建临时的 DOM 容器来解析和处理图片
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.currentHtml;

      // 优化提示逻辑：只有确实需要处理图片时才显示 "正在处理..."
      const images = Array.from(tempDiv.querySelectorAll('img'));
      const localImages = images.filter(img => img.src.startsWith('app://'));

      if (localImages.length > 0) {
        new Notice('⏳ 正在处理图片...');
      }

      // 处理本地图片：转换为 JPEG Base64
      // 返回 true 表示有图片被处理了
      const processed = await this.processImagesToDataURL(tempDiv);

      // 清理 HTML 以适配微信编辑器（处理嵌套列表等）
      const cleanedHtml = this.cleanHtmlForDraft(tempDiv.innerHTML);

      // 注意：微信有时会优先读取 text/plain。必须使用清理后的 HTML 生成纯文本，
      // 否则会出现“HTML 修复生效但粘贴结果仍异常”的情况。
      const plainDiv = document.createElement('div');
      plainDiv.innerHTML = cleanedHtml;
      const text = plainDiv.textContent || '';
      const htmlContent = cleanedHtml;
      window.__OWC_LAST_CLIPBOARD_HTML = htmlContent;
      window.__OWC_LAST_CLIPBOARD_TEXT = text;

      if (navigator.clipboard && navigator.clipboard.write) {
        // 先尝试仅写入 HTML，避免某些编辑器优先读取 text/plain 导致样式/结构修复失效。
        // 如果环境不支持，再降级为 HTML + plain text 双格式。
        try {
          const htmlOnlyItem = new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
          });
          await navigator.clipboard.write([htmlOnlyItem]);
        } catch (htmlOnlyError) {
          const clipboardItem = new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          });
          await navigator.clipboard.write([clipboardItem]);
        }

        // Success Feedback
        new Notice('✅ 已复制到剪贴板！');
        if (this.copyBtn) {
           const { setIcon } = require('obsidian');
           setIcon(this.copyBtn, 'check'); // 变成对勾图标
           setTimeout(() => {
             if (this.copyBtn) {
               setIcon(this.copyBtn, 'copy'); // 恢复复制图标
               this.copyBtn.classList.remove('active');
             }
           }, 2000);
        }
        return;
      }

      // Fallback
      throw new Error('Clipboard API unavailable');

    } catch (error) {
      console.error('复制失败:', error);
      new Notice(`❌ 复制失败: ${error.message}`);
      if (this.copyBtn) {
        this.copyBtn.classList.remove('active');
      }
    } finally {
      this.isCopying = false;
    }
  }

  /**
   * 将 HTML 中的本地图片转换为 Base64 (Canvas Compressed)
   */
  async processImagesToDataURL(container) {
    const images = Array.from(container.querySelectorAll('img'));
    const localImages = images.filter(img => img.src.startsWith('app://') || img.src.startsWith('capacitor://'));

    if (localImages.length === 0) return false;

    // Start time for minimum duration check (prevents UX flicker)
    const startTime = Date.now();

    // 并发控制：3个一组
    const concurrency = 3;
    for (let i = 0; i < localImages.length; i += concurrency) {
      const chunk = localImages.slice(i, i + concurrency);
      await Promise.all(chunk.map(img => this.convertImageToLocally(img)));
    }

    // Calculate elapsed time and wait if needed
    const elapsed = Date.now() - startTime;
    const minDuration = 800; // 800ms minimum duration
    if (elapsed < minDuration) {
      await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
    }

    return true;
  }


  async convertImageToLocally(img) {
    try {
      // CRITICAL FIX: app:// 资源在 Electron 中可以直接 fetch！
      // 我们不需要反向查找 TFile，直接 fetch(img.src) 拿 blob 即可！
      const response = await fetch(img.src);
      const blob = await response.blob();

      // 检查大小警告
      if (blob.size > 10 * 1024 * 1024) {
        new Notice(`⚠️ 发现大图 (${(blob.size / 1024 / 1024).toFixed(1)}MB)，处理可能较慢`, 5000);
      }

      let dataUrl;
      // GIF Protection: Bypass compression for GIFs to preserve animation
      if (blob.type === 'image/gif') {
        // Direct read for GIF
        dataUrl = await this.blobToDataUrl(blob);
      } else {
        // Compress others (JPG/PNG) to JPEG 80%
        dataUrl = await this.blobToJpegDataUrl(blob);
      }

      img.src = dataUrl;
      // 清除 Obsidian 特有的 dataset 属性，避免干扰
      delete img.dataset.src;
    } catch (error) {
      console.error('Image processing failed:', error);
      // 保持原样，至少不破图（虽然微信会看不到）
    }
  }

  // Helper: Direct Blob to Base64 (for GIFs)
  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  blobToJpegDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        let width = image.width;
        let height = image.height;

        // Resize slightly if too massive (e.g. > 1920)
        if (width > 1920) {
          height = Math.round(height * (1920 / width));
          width = 1920;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);

        // Compress to JPEG 80%
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load failed'));
      };
      image.src = url;
    });
  }


  async onClose() {
    // 清理滚动监听 (Critical: Fix memory leak)
    if (this.activeEditorScroller && this.editorScrollListener) {
      this.activeEditorScroller.removeEventListener('scroll', this.editorScrollListener);
    }
    if (this.previewContainer && this.previewScrollListener) {
      this.previewContainer.removeEventListener('scroll', this.previewScrollListener);
    }
    this.previewContainer?.empty();

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

    console.log('🍎 转换器面板已关闭');
  }

  /**
   * 简单的字符串哈希函数 (DJB2算法)
   */
  simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0; // Ensure unsigned 32-bit integer
  }
}

/**
 * 📝 微信公众号转换器设置面板
 */
class AppleStyleSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  normalizeVaultPath(vaultPath) {
    return normalizeVaultPath(vaultPath);
  }

  isAbsolutePathLike(vaultPath) {
    return isAbsolutePathLike(vaultPath);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    // 提示信息
    new Setting(containerEl)
      .setDesc('更多排版样式选项（主题、字号、代码块等）请在插件侧边栏面板中进行设置。');

    // 预览模式设置
    new Setting(containerEl)
      .setName('预览模式')
      .setHeading();

    new Setting(containerEl)
      .setName('使用手机仿真框')
      .setDesc('开启后，预览区域将显示为 iPhone X 手机框样式；关闭则恢复为经典全宽预览模式（需重启插件面板生效）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.usePhoneFrame)
        .onChange(async (value) => {
          this.plugin.settings.usePhoneFrame = value;
          await this.plugin.saveSettings();
          // 提示用户重启面板
          new Notice('设置已保存，请关闭并重新打开转换器面板以生效');
        }));

    // 图片水印设置
    new Setting(containerEl)
      .setName('图片水印')
      .setHeading();

    new Setting(containerEl)
      .setName('启用图片水印')
      .setDesc('在每张图片上方显示头像')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableWatermark)
        .onChange(async (value) => {
          this.plugin.settings.enableWatermark = value;
          await this.plugin.saveSettings();
        }));

    // 本地头像上传
    const uploadSetting = new Setting(containerEl)
      .setName('上传本地头像')
      .setDesc(this.plugin.settings.avatarBase64 ? '✅ 已上传本地头像（优先使用）' : '选择本地图片，转换为 Base64 存储，无需网络请求');

    uploadSetting.addButton(button => button
      .setButtonText(this.plugin.settings.avatarBase64 ? '重新上传' : '选择图片')
      .onClick(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          // 限制文件大小 (100KB)
          if (file.size > 100 * 1024) {
            new Notice('❌ 图片太大，请选择小于 100KB 的图片');
            return;
          }

          const reader = new FileReader();
          reader.onload = async (event) => {
            this.plugin.settings.avatarBase64 = event.target.result;
            await this.plugin.saveSettings();
            new Notice('✅ 头像已上传');
            this.display(); // 刷新设置页面
          };
          reader.readAsDataURL(file);
        };
        input.click();
      }));

    // 清除本地头像按钮
    if (this.plugin.settings.avatarBase64) {
      uploadSetting.addButton(button => button
        .setButtonText('清除')
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.avatarBase64 = '';
          await this.plugin.saveSettings();
          new Notice('已清除本地头像');
          this.display();
        }));
    }

    new Setting(containerEl)
      .setName('头像 URL（备用）')
      .setDesc('如未上传本地头像，将使用此 URL')
      .addText(text => text
        .setPlaceholder('https://example.com/avatar.jpg')
        .setValue(this.plugin.settings.avatarUrl)
        .onChange(async (value) => {
          this.plugin.settings.avatarUrl = value;
          await this.plugin.saveSettings();
        }));

    // 微信公众号账号管理
    new Setting(containerEl)
      .setName('微信公众号账号')
      .setDesc('请在微信公众号后台 [设置与开发] -> [基本配置] 中获取 AppID 和 AppSecret，并确保已将当前 IP 加入白名单。')
      .setHeading();

    // 账号列表
    const accounts = this.plugin.settings.wechatAccounts || [];
    const defaultId = this.plugin.settings.defaultAccountId;

    if (accounts.length === 0) {
      containerEl.createEl('p', {
        text: '暂无账号，请点击下方按钮添加',
        cls: 'setting-item-description',
        attr: { style: 'color: var(--text-muted); font-style: italic;' }
      });
    } else {
      const listContainer = containerEl.createDiv({ cls: 'wechat-account-list' });

      for (const account of accounts) {
        const isDefault = account.id === defaultId;
        const card = listContainer.createDiv({ cls: 'wechat-account-card' });

        // 账号信息
        const info = card.createDiv({ cls: 'wechat-account-info' });
        const nameRow = info.createDiv({ cls: 'wechat-account-name-row' });
        nameRow.createSpan({ text: account.name, cls: 'wechat-account-name' });
        if (isDefault) {
          nameRow.createSpan({ text: '默认', cls: 'wechat-account-badge' });
        }
        info.createDiv({
          text: `AppID: ${account.appId.substring(0, 8)}...`,
          cls: 'wechat-account-appid'
        });

        // 操作按钮
        const actions = card.createDiv({ cls: 'wechat-account-actions' });

        if (!isDefault) {
          const defaultBtn = actions.createEl('button', { text: '设为默认', cls: 'wechat-btn-small' });
          defaultBtn.onclick = async () => {
            this.plugin.settings.defaultAccountId = account.id;
            await this.plugin.saveSettings();
            this.display();
          };
        }

        const editBtn = actions.createEl('button', { text: '编辑', cls: 'wechat-btn-small' });
        editBtn.onclick = () => this.showEditAccountModal(account);

        const testBtn = actions.createEl('button', { text: '测试', cls: 'wechat-btn-small wechat-btn-test' });
        testBtn.onclick = async () => {
          testBtn.disabled = true;
          testBtn.textContent = '测试中...';
          try {
            const api = new WechatAPI(account.appId, account.appSecret, this.plugin.settings.proxyUrl);
            await api.getAccessToken();
            new Notice(`✅ ${account.name} 连接成功！`);
          } catch (err) {
            new Notice(`❌ ${account.name} 连接失败: ${err.message}`);
          }
          testBtn.disabled = false;
          testBtn.textContent = '测试';
        };

        const deleteBtn = actions.createEl('button', { text: '删除', cls: 'wechat-btn-small wechat-btn-danger' });
        deleteBtn.onclick = async () => {
          if (confirm(`确定要删除账号 "${account.name}" 吗？`)) {
            this.plugin.settings.wechatAccounts = accounts.filter(a => a.id !== account.id);
            // 如果删除的是默认账号，自动选择第一个
            if (account.id === defaultId && this.plugin.settings.wechatAccounts.length > 0) {
              this.plugin.settings.defaultAccountId = this.plugin.settings.wechatAccounts[0].id;
            } else if (this.plugin.settings.wechatAccounts.length === 0) {
              this.plugin.settings.defaultAccountId = '';
            }
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
    }

    // 添加账号按钮
    const addBtnContainer = containerEl.createDiv({ cls: 'wechat-add-account-container' });
    if (accounts.length < MAX_ACCOUNTS) {
      const addBtn = addBtnContainer.createEl('button', {
        text: '+ 添加账号',
        cls: 'wechat-btn-add'
      });
      addBtn.onclick = () => this.showEditAccountModal(null);
    } else {
      addBtnContainer.createEl('p', {
        text: `已达到最大账号数量 (${MAX_ACCOUNTS})`,
        cls: 'setting-item-description',
        attr: { style: 'color: var(--text-muted);' }
      });
    }



    // 高级设置
    new Setting(containerEl)
      .setName('高级设置')
      .setHeading();

    new Setting(containerEl)
      .setName('启用 Obsidian 原生三件套渲染')
      .setDesc('一次性启用 Source + Render + Export 三件套链路。关闭时使用当前稳定 Phase2 基线渲染。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useTripletPipeline === true)
        .onChange(async (value) => {
          this.plugin.settings.useTripletPipeline = value;
          await this.plugin.saveSettings();
          new Notice(value ? '已启用 Obsidian 原生三件套渲染' : '已切回 Phase2 基线渲染');
          const converterView = this.plugin.getConverterView();
          if (converterView) {
            await converterView.convertCurrent(true);
          }
        }));

    new Setting(containerEl)
      .setName('三件套失败时回退 Phase2')
      .setDesc('建议保持开启。三件套渲染失败或未通过门禁时自动回退，确保日常可用性。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.tripletFallbackToPhase2 !== false)
        .onChange(async (value) => {
          this.plugin.settings.tripletFallbackToPhase2 = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('三件套零差异门禁')
      .setDesc('开启后会将三件套输出与 Phase2 基线做字节级对比；不一致时按回退策略处理。建议保持开启。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enforceTripletParity !== false)
        .onChange(async (value) => {
          this.plugin.settings.enforceTripletParity = value;
          await this.plugin.saveSettings();
          const converterView = this.plugin.getConverterView();
          if (converterView) {
            await converterView.convertCurrent(true);
          }
        }));

    new Setting(containerEl)
      .setName('输出三件套完整差异日志（调试）')
      .setDesc('默认关闭。开启后会把完整差异 payload 输出到控制台，日志体积会明显增大。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.tripletParityVerboseLog === true)
        .onChange(async (value) => {
          this.plugin.settings.tripletParityVerboseLog = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('发送成功后自动清理资源')
      .setDesc('默认关闭。开启后会在创建草稿成功后，删除你在下方配置的目录。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.cleanupAfterSync)
        .onChange(async (value) => {
          this.plugin.settings.cleanupAfterSync = value;
          await this.plugin.saveSettings();
        }));

    let hasWarnedAbsoluteCleanupPath = false;
    new Setting(containerEl)
      .setName('清理目录')
      .setDesc('填写 vault 内相对路径（不要填 /Users/... 这类绝对路径），支持 {{note}} 占位符，例如 published/{{note}}_img。')
      .addText(text => text
        .setPlaceholder('published/{{note}}_img')
        .setValue(this.plugin.settings.cleanupDirTemplate || '')
        .onChange(async (value) => {
          if (this.isAbsolutePathLike(value)) {
            if (!hasWarnedAbsoluteCleanupPath) {
              new Notice('⚠️ 清理目录请填写 vault 内相对路径，不要使用绝对路径（如 /Users/... 或 C:\\...）');
              hasWarnedAbsoluteCleanupPath = true;
            }
          } else {
            hasWarnedAbsoluteCleanupPath = false;
          }

          const normalized = this.normalizeVaultPath(value);
          if (normalized.includes('..')) {
            new Notice('❌ 清理目录不能包含 ..');
            return;
          }
          this.plugin.settings.cleanupDirTemplate = normalized;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('使用系统回收站')
      .setDesc('开启时优先移动到系统回收站；关闭时直接从 vault 删除。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.cleanupUseSystemTrash !== false)
        .onChange(async (value) => {
          this.plugin.settings.cleanupUseSystemTrash = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('API 代理地址')
      .setDesc(createFragment(frag => {
        const descDiv = frag.createDiv();
        descDiv.appendText('如果你的网络 IP 经常变化，可配置代理服务。');
        descDiv.createEl('a', {
          text: '查看部署指南',
          href: 'https://xiaoweibox.top/chats/wechat-proxy',
          style: 'margin-left: 5px;'
        });

        frag.createDiv({
            cls: 'wechat-proxy-note',
            style: 'margin-top: 6px; font-size: 12px; color: var(--text-muted); background: var(--background-secondary); padding: 8px; border-radius: 4px;'
        }, el => {
           el.createSpan({ text: '🔒 安全提示：代理服务将中转您的请求。请确保使用受信任的代理（自建或可靠第三方），以保护 AppSecret 安全。' });
        });
      }))
      .addText(text => text
        .setPlaceholder('https://your-proxy.workers.dev')
        .setValue(this.plugin.settings.proxyUrl)
        .onChange(async (value) => {
          const trimmedValue = value.trim();
          if (trimmedValue && !trimmedValue.startsWith('https://')) {
            new Notice('⚠️ 安全风险：代理地址必须使用 HTTPS 以保护您的 AppSecret。');
          }
          this.plugin.settings.proxyUrl = trimmedValue;
          await this.plugin.saveSettings();
        }));
  }

  /**
   * 显示添加/编辑账号的模态框
   */
  showEditAccountModal(account) {
    const { Modal } = require('obsidian');
    const modal = new Modal(this.app);
    modal.titleEl.setText(account ? '编辑账号' : '添加账号');

    const form = modal.contentEl.createDiv();

    // 账号名称
    const nameGroup = form.createDiv({ cls: 'wechat-form-group' });
    nameGroup.createEl('label', { text: '账号名称' });
    const nameInput = nameGroup.createEl('input', {
      type: 'text',
      placeholder: '例如：我的公众号',
      value: account?.name || ''
    });

    // AppID
    const appIdGroup = form.createDiv({ cls: 'wechat-form-group' });
    appIdGroup.createEl('label', { text: 'AppID' });
    const appIdInput = appIdGroup.createEl('input', {
      type: 'text',
      placeholder: 'wx...',
      value: account?.appId || ''
    });

    // AppSecret
    const secretGroup = form.createDiv({ cls: 'wechat-form-group' });
    secretGroup.createEl('label', { text: 'AppSecret' });
    const secretInput = secretGroup.createEl('input', {
      type: 'password',
      placeholder: '开发者密钥',
      value: account?.appSecret || ''
    });

    // 默认作者
    const authorGroup = form.createDiv({ cls: 'wechat-form-group' });
    authorGroup.createEl('label', { text: '默认作者（可选）' });
    const authorInput = authorGroup.createEl('input', {
      type: 'text',
      placeholder: '留空则不显示作者',
      value: account?.author || ''
    });

    // 按钮区
    const btnRow = form.createDiv({ cls: 'wechat-modal-buttons' });

    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => modal.close();

    const testBtn = btnRow.createEl('button', { text: '测试连接', cls: 'wechat-btn-test' });
    testBtn.onclick = async () => {
      if (!appIdInput.value || !secretInput.value) {
        new Notice('请填写 AppID 和 AppSecret');
        return;
      }
      testBtn.disabled = true;
      testBtn.textContent = '测试中...';
      try {
        const api = new WechatAPI(appIdInput.value.trim(), secretInput.value.trim(), this.plugin.settings.proxyUrl);
        await api.getAccessToken();
        new Notice('✅ 连接成功！');
      } catch (err) {
        new Notice(`❌ 连接失败: ${err.message}`);
      }
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    };

    const saveBtn = btnRow.createEl('button', { text: '保存', cls: 'mod-cta' });
    saveBtn.onclick = async () => {
      const name = nameInput.value.trim() || '未命名账号';
      const appId = appIdInput.value.trim();
      const appSecret = secretInput.value.trim();

      if (!appId || !appSecret) {
        new Notice('请填写 AppID 和 AppSecret');
        return;
      }

      if (account) {
        // 编辑现有账号
        account.name = name;
        account.appId = appId;
        account.appSecret = appSecret;
        account.author = authorInput.value.trim();
      } else {
        // 添加新账号
        const newAccount = {
          id: generateId(),
          name,
          appId,
          appSecret,
          author: authorInput.value.trim()
        };
        this.plugin.settings.wechatAccounts.push(newAccount);
        // 如果是第一个账号，自动设为默认
        if (this.plugin.settings.wechatAccounts.length === 1) {
          this.plugin.settings.defaultAccountId = newAccount.id;
        }
      }

      await this.plugin.saveSettings();
      modal.close();
      this.display();
      new Notice(account ? '✅ 账号已更新' : '✅ 账号已添加');
    };

    modal.open();
  }
}

/**
 * 📝 微信公众号转换器主插件
 */
class AppleStylePlugin extends Plugin {
  async onload() {
    console.log('📝 正在加载微信公众号转换器...');

    await this.loadSettings();

    this.registerView(
      APPLE_STYLE_VIEW,
      (leaf) => new AppleStyleView(leaf, this)
    );

    this.addRibbonIcon('wand', '📝 微信公众号转换器', async () => {
      await this.openConverter();
    });

    this.addCommand({
      id: 'open-apple-converter',
      name: '打开微信公众号转换器',
      callback: async () => {
        await this.openConverter();
      },
    });


    // Command 'convert-to-apple-style' removed as per user request

    this.addSettingTab(new AppleStyleSettingTab(this.app, this));

    console.log('✅ 微信公众号转换器加载完成');
  }

  async openConverter() {
    let leaf = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW)[0];

    if (!leaf) {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      await rightLeaf.setViewState({
        type: APPLE_STYLE_VIEW,
        active: true,
      });
      leaf = rightLeaf;
    }

    this.app.workspace.revealLeaf(leaf);
  }

  getConverterView() {
    const leaves = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW);
    if (leaves.length > 0) {
      return leaves[0].view;
    }
    return null;
  }

  async loadSettings() {
    const loadedData = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    let didMigrate = false;

    // 数据迁移：将旧的单账号格式迁移到新的多账号格式
    if (this.settings.wechatAppId && this.settings.wechatAccounts.length === 0) {
      const migratedAccount = {
        id: generateId(),
        name: '我的公众号',
        appId: this.settings.wechatAppId,
        appSecret: this.settings.wechatAppSecret,
      };
      this.settings.wechatAccounts.push(migratedAccount);
      this.settings.defaultAccountId = migratedAccount.id;
      // 清除旧字段
      this.settings.wechatAppId = '';
      this.settings.wechatAppSecret = '';
      didMigrate = true;
      console.log('✅ 已将旧账号配置迁移到新格式');
    }

    // 数据迁移：旧清理配置 -> cleanupDirTemplate
    const currentTemplate = normalizeVaultPath(this.settings.cleanupDirTemplate || '');
    const legacyRootDir = normalizeVaultPath(this.settings.cleanupRootDir || '');
    const legacyTarget = this.settings.cleanupTarget;

    // 仅迁移旧的 folder 模式，避免把 file 模式误迁移成“删目录”
    if (!currentTemplate && legacyRootDir && legacyTarget === 'folder') {
      this.settings.cleanupDirTemplate = `${legacyRootDir}/{{note}}_img`;
      didMigrate = true;
      console.log('✅ 已将旧清理配置迁移为目录模板 cleanupDirTemplate');
    }

    // 清理弃用字段，避免后续歧义
    if (Object.prototype.hasOwnProperty.call(this.settings, 'cleanupRootDir')) {
      delete this.settings.cleanupRootDir;
      didMigrate = true;
    }
    if (Object.prototype.hasOwnProperty.call(this.settings, 'cleanupTarget')) {
      delete this.settings.cleanupTarget;
      didMigrate = true;
    }

    // 渲染开关迁移：旧 Native/Legacy 命名 -> Triplet/Phase2 命名
    if (
      !Object.prototype.hasOwnProperty.call(loadedData, 'useTripletPipeline') &&
      Object.prototype.hasOwnProperty.call(loadedData, 'useNativePipeline')
    ) {
      this.settings.useTripletPipeline = loadedData.useNativePipeline === true;
      didMigrate = true;
    }

    if (
      !Object.prototype.hasOwnProperty.call(loadedData, 'tripletFallbackToPhase2') &&
      Object.prototype.hasOwnProperty.call(loadedData, 'enableLegacyFallback')
    ) {
      this.settings.tripletFallbackToPhase2 = loadedData.enableLegacyFallback !== false;
      didMigrate = true;
    }

    if (
      !Object.prototype.hasOwnProperty.call(loadedData, 'enforceTripletParity') &&
      Object.prototype.hasOwnProperty.call(loadedData, 'enforceNativeParity')
    ) {
      this.settings.enforceTripletParity = loadedData.enforceNativeParity !== false;
      didMigrate = true;
    }

    // 维护双向兼容：新配置写回旧字段，保证老逻辑/测试在迁移期可继续工作
    this.settings.useNativePipeline = this.settings.useTripletPipeline === true;
    this.settings.enableLegacyFallback = this.settings.tripletFallbackToPhase2 !== false;
    this.settings.enforceNativeParity = this.settings.enforceTripletParity !== false;

    if (didMigrate) {
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    console.log('📝 微信公众号转换器已卸载');
  }
}

module.exports = AppleStylePlugin;
module.exports.AppleStyleView = AppleStyleView;
module.exports.WechatAPI = WechatAPI;
module.exports.AppleStyleSettingTab = AppleStyleSettingTab;
