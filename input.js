const { Plugin, MarkdownView, ItemView, Notice } = require('obsidian');
const { PluginSettingTab, Setting } = require('obsidian');

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
  pagePadding: 20,
  codeBlockTheme: 'dark',
  customCss: '',
  avatarUrl: '',
  avatarBase64: '',  // Base64 编码的本地头像，优先级高于 avatarUrl
  enableWatermark: false,
  showImageCaption: true,  // 关闭水印时是否显示图片说明文字
  // 多账号支持
  wechatAccounts: [],  // [{ id, name, appId, appSecret }]
  defaultAccountId: '',
  // 代理设置
  proxyUrl: '',  // Cloudflare Worker 等代理地址
  // 旧字段保留用于迁移检测
  wechatAppId: '',
  wechatAppSecret: '',

};

// 账号上限
const MAX_ACCOUNTS = 5;

const CLASSIC_CSS = `/* 基础文本 */
section { 
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.8;
  color: #3e3e3e;
  text-align: justify;
}
p {
  margin: 0 0 20px 0;
}
/* 标题 */
h1 {
  display: block;
  font-size: 30px;
  font-weight: bold;
  margin: 30px auto 20px;
  color: #333;
  text-align: center;
}
h2 {
  display: block;
  font-size: 24px;
  font-weight: bold;
  margin: 40px auto 20px;
  color: #333;
  text-align: center;
}
h3 {
  display: block;
  font-size: 18px;
  font-weight: bold;
  margin: 24px 0 16px;
  color: #333;
  text-align: left;
}
/* 引用 */
blockquote {
  font-size: 16px;
  color: #595959;
  background: #f5f5f5;
  margin: 16px 0;
  padding: 16px;
  border-left: 4px solid #333;
  border-radius: 3px;
}
/* 列表 */
ul, ol {
  margin: 12px 0;
  padding-left: 20px;
  color: #3e3e3e;
}
li {
  margin: 4px 0;
}
/* 图片 */
figure {
  margin: 20px 0;
  text-align: center;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  padding: 10px;
}
figcaption {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
  text-align: center;
}
a {
  color: #0366d6;
  text-decoration: none;
  border-bottom: 1px dashed #0366d6;
}
strong {
  font-weight: bold;
  color: #333;
}`;

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
  for (const item of array) {
    const p = Promise.resolve().then(() => mapper(item));
    results.push(p);
    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
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
   * 发送请求（如果配置了代理，通过代理发送）
   * 纯粹的 HTTP 请求封装，不包含重试逻辑
   */
  async sendRequest(url, options = {}) {
    const { requestUrl } = require('obsidian');

    if (this.proxyUrl) {
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
        // 通过代理发送：将文件转为 base64
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

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
    this.theme = null;
    this.lastActiveFile = null;
    this.sessionCoverBase64 = ''; // 本次文章的临时封面
    this.sessionDigest = ''; // 本次同步的摘要
    this.isProgrammaticScroll = false;
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

    // 1. 创建顶部操作栏
    this.createTopActions(container);

    // 2. 创建预览区 (占据中间剩余空间)
    this.previewContainer = container.createEl('div', {
      cls: 'apple-converter-preview',
    });

    // 3. 创建底部悬浮设置面板
    this.createFloatingSettingsPanel(container);

    this.setPlaceholder();

    // 监听文件切换
    this.registerActiveFileChange();

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
      // 可见性检查：插件未显示时，完全停止计算
      if (!this.containerEl.isShown()) return;

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
      if (!this.containerEl.isShown()) return;

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
      // 加载 markdown-it
      if (typeof markdownit === 'undefined') {
        const mdContent = await adapter.read(`${basePath}/lib/markdown-it.min.js`);
        (0, eval)(mdContent);
      }

      // 加载 highlight.js
      if (typeof hljs === 'undefined') {
        const hljsContent = await adapter.read(`${basePath}/lib/highlight.min.js`);
        (0, eval)(hljsContent);
      }

      // 加载 MathJax 插件 (如果存在)
      try {
        const mathPath = `${basePath}/lib/mathjax-plugin.js`;
        if (await adapter.exists(mathPath)) {
          const mathContent = await adapter.read(mathPath);
          (0, eval)(mathContent);
        } else {
        }
      } catch (e) {
        console.error('MathJax plugin load failed:', e);
      }

      // 加载主题
      const themeContent = await adapter.read(`${basePath}/themes/apple-theme.js`);
      (0, eval)(themeContent);

      // 加载转换器
      const converterContent = await adapter.read(`${basePath}/converter.js`);
      (0, eval)(converterContent);

      // 初始化主题实例
      if (!window.AppleTheme) throw new Error('AppleTheme failed to load');
      this.theme = new window.AppleTheme({
        theme: this.plugin.settings.theme,
        themeColor: this.plugin.settings.themeColor,
        customColor: this.plugin.settings.customColor,
        fontFamily: this.plugin.settings.fontFamily,
        fontSize: this.plugin.settings.fontSize,
        macCodeBlock: this.plugin.settings.macCodeBlock,
        codeLineNumber: this.plugin.settings.codeLineNumber,
        pagePadding: this.plugin.settings.pagePadding,
        codeBlockTheme: this.plugin.settings.codeBlockTheme,
        customCss: this.plugin.settings.customCss,
      });

      // 初始化转换器

      // 初始化转换器
      if (!window.AppleStyleConverter) throw new Error('AppleStyleConverter failed to load');
      // 优先使用 Base64 头像，否则使用 URL
      let avatarSrc = '';
      if (this.plugin.settings.enableWatermark) {
        avatarSrc = this.plugin.settings.avatarBase64 || this.plugin.settings.avatarUrl || '';
      }
      const showCaption = this.plugin.settings.showImageCaption;
      // 传递 App 实例，用于解析本地图片
      this.converter = new window.AppleStyleConverter(this.theme, avatarSrc, showCaption, this.app);
      await this.converter.initMarkdownIt();

      console.log('✅ 依赖加载完成');
    } catch (error) {
      console.error('❌ 依赖加载失败:', error);
      new Notice('依赖加载失败: ' + error.message);
    }
  }


  /**
   * 创建设置面板
   */
  /**
   * 1. 顶部操作栏
   */
  createTopActions(container) {
    const actions = container.createEl('div', { cls: 'apple-top-actions' });

    // Sync Button
    const accounts = this.plugin.settings.wechatAccounts || [];
    if (accounts.length > 0) {
      const syncBtn = actions.createEl('button', {
        cls: 'apple-btn-secondary apple-btn-top',
        text: '一键同步'
      });
      syncBtn.innerHTML = '<span class="apple-icon">☁️</span> 一键同步';
      syncBtn.addEventListener('click', () => this.showSyncModal());
    }

    // Copy Button
    const copyBtn = actions.createEl('button', {
      cls: 'apple-btn-primary apple-btn-top',
      text: '复制到公众号',
    });
    this.copyBtn = copyBtn;
    copyBtn.innerHTML = '<span class="apple-icon">📋</span> 复制到公众号';
    copyBtn.addEventListener('click', () => this.copyHTML());
  }

  /**
   * 3. 底部悬浮设置面板
   */
  createFloatingSettingsPanel(container) {
    const panel = container.createEl('div', { cls: 'apple-settings-floating-panel collapsed' });

    // Toggle Handle (Head)
    const handle = panel.createEl('div', { cls: 'apple-settings-handle' });
    const handleContent = handle.createEl('div', { cls: 'apple-handle-content' });
    const icon = handleContent.createEl('span', { cls: 'apple-settings-icon' });
    icon.textContent = '⚙️';
    const title = handleContent.createEl('span', { text: '样式设置 (点击展开)', cls: 'apple-settings-handle-title' });

    handle.addEventListener('click', () => {
      panel.toggleClass('collapsed', !panel.hasClass('collapsed'));
      const isCollapsed = panel.hasClass('collapsed');
      title.textContent = isCollapsed ? '样式设置 (点击展开)' : '点击收起设置';
      icon.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    // Content Area
    const settingsContent = panel.createEl('div', { cls: 'apple-settings-content' });

    // Header Info
    const header = settingsContent.createEl('div', { cls: 'apple-settings-header-info' });
    header.createEl('div', { cls: 'apple-settings-title', text: '📝 微信公众号转换器' });
    this.currentDocLabel = header.createEl('div', { cls: 'apple-current-doc', text: '未选择文档' });

    const settingsArea = settingsContent.createEl('div', { cls: 'apple-settings-area' });

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
        btn.addEventListener('click', async () => {
          this.plugin.settings.theme = t.value;
          // Update active state
          grid.querySelectorAll('.apple-btn-theme').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          await this.plugin.saveSettings();
          this.theme.update({ theme: t.value });
          await this.convertCurrent(true);
        });
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
      const sizes = [
        { value: 1, label: '小' },
        { value: 2, label: '较小' },
        { value: 3, label: '推荐' },
        { value: 4, label: '较大' },
        { value: 5, label: '大' },
      ];
      sizes.forEach(s => {
        const btn = grid.createEl('button', {
          cls: `apple-btn-size ${this.plugin.settings.fontSize === s.value ? 'active' : ''}`,
          text: s.label,
        });
        btn.dataset.value = s.value;
        btn.addEventListener('click', () => this.onFontSizeChange(s.value, grid));
      });
    });

    // === 主题色 ===
    this.createSection(settingsArea, '主题色', (section) => {
      const grid = section.createEl('div', { cls: 'apple-color-grid' });
      const colors = AppleTheme.getColorList();
      colors.forEach(c => {
        const btn = grid.createEl('button', {
          cls: `apple-btn-color ${this.plugin.settings.themeColor === c.value ? 'active' : ''}`,
        });
        btn.dataset.value = c.value;
        btn.style.setProperty('--btn-color', c.color);
        btn.addEventListener('click', () => this.onColorChange(c.value, grid));
      });
      // Custom Color
      const customBtn = grid.createEl('button', {
        cls: `apple-btn-custom-text ${this.plugin.settings.themeColor === 'custom' ? 'active' : ''}`,
        text: '自定义',
        title: '自定义颜色'
      });
      customBtn.dataset.value = 'custom';
      const colorInput = grid.createEl('input', { type: 'color', cls: 'apple-color-picker-hidden' });
      colorInput.value = this.plugin.settings.customColor || '#000000';
      colorInput.style.visibility = 'hidden';
      colorInput.style.width = '0'; colorInput.style.height = '0'; colorInput.style.position = 'absolute';
      customBtn.addEventListener('click', () => { colorInput.click(); });
      colorInput.addEventListener('input', (e) => { customBtn.style.setProperty('--btn-color', e.target.value); });
      colorInput.addEventListener('change', async (e) => {
        const newColor = e.target.value;
        customBtn.style.setProperty('--btn-color', newColor);
        this.plugin.settings.customColor = newColor;
        this.theme.update({ customColor: newColor });
        await this.onColorChange('custom', grid);
      });
    });

    // === 页面内边距 ===
    this.createSection(settingsArea, '页面内边距', (section) => {
      const container = section.createEl('div', { cls: 'apple-padding-control' });
      const slider = container.createEl('input', { type: 'range', cls: 'apple-padding-slider' });
      slider.min = '0'; slider.max = '30'; slider.step = '0.5';
      slider.value = String(this.plugin.settings.pagePadding);
      const valueDisplay = container.createEl('span', { cls: 'apple-padding-value', text: `${this.plugin.settings.pagePadding}px` });
      slider.addEventListener('input', (e) => { valueDisplay.innerText = `${e.target.value}px`; });
      slider.addEventListener('change', async (e) => {
        const padding = parseInt(e.target.value);
        this.plugin.settings.pagePadding = padding;
        await this.plugin.saveSettings();
        this.theme.update({ pagePadding: padding });
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

    // === 代码块主题 ===
    this.createSection(settingsArea, '代码块主题', (section) => {
      const select = section.createEl('select', { cls: 'apple-select' });
      [{ value: 'dark', label: '暗黑 (默认)' }, { value: 'light', label: '明亮' }].forEach(opt => {
        const option = select.createEl('option', { value: opt.value, text: opt.label });
        if (this.plugin.settings.codeBlockTheme === opt.value) option.selected = true;
      });
      select.addEventListener('change', async (e) => {
        const theme = e.target.value;
        this.plugin.settings.codeBlockTheme = theme;
        await this.plugin.saveSettings();
        this.theme.update({ codeBlockTheme: theme });
        await this.convertCurrent(true);
      });
    });

    // === 代码块行号开关 ===
    this.createSection(settingsArea, '显示代码行号', (section) => {
      const toggle = section.createEl('label', { cls: 'apple-toggle' });
      const checkbox = toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' });
      checkbox.checked = this.plugin.settings.codeLineNumber;
      toggle.createEl('span', { cls: 'apple-toggle-slider' });
      checkbox.addEventListener('change', () => this.onCodeLineNumberChange(checkbox.checked));
    });
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
      new Notice('❌ 请先打开一个文章进行转换');
      return;
    }

    const { Modal } = require('obsidian');
    const modal = new Modal(this.app);
    modal.titleEl.setText('同步到微信草稿箱');
    modal.contentEl.addClass('wechat-sync-modal');

    const accounts = this.plugin.settings.wechatAccounts || [];
    const defaultId = this.plugin.settings.defaultAccountId;
    let selectedAccountId = defaultId;
    // 逻辑变更: 默认只提取文章第一张图，无全局默认，无 frontmatter
    let coverBase64 = this.sessionCoverBase64 || this.getFirstImageFromArticle();

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
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    // 摘要设置
    const digestSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section' });
    digestSection.createEl('label', { text: '文章摘要（可选）', cls: 'wechat-modal-label' });

    // 自动提取文章前 45 字作为默认摘要
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this.currentHtml || '';
    // 使用 innerText 可以更好地处理换行，但为了安全起见，还是用 textContent 并清理空格
    const autoDigest = (tempDiv.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 45);

    const digestInput = digestSection.createEl('textarea', {
      cls: 'wechat-modal-digest-input',
      placeholder: '留空则自动提取文章前 45 字'
    });
    // Explicitly set the value to ensure it renders correctly in the textarea
    digestInput.value = autoDigest;

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

    digestInput.addEventListener('input', () => {
      charCount.setText(`${digestInput.value.length}/120`);
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

    modal.open();
  }

  /**
   * 处理同步到微信逻辑
   */
  async onSyncToWechat() {

    // 获取选中的账号（优先使用下拉选择，否则用默认账号）
    const accounts = this.plugin.settings.wechatAccounts || [];
    const accountId = this.selectedAccountId || this.plugin.settings.defaultAccountId;
    const account = accounts.find(a => a.id === accountId);

    if (!account) {
      new Notice('❌ 请先在插件设置中添加微信公众号账号');
      return;
    }

    if (!this.currentHtml) {
      new Notice('❌ 请先打开一个文章进行转换');
      return;
    }

    const notice = new Notice(`🚀 正在使用 ${account.name} 同步...`, 0);

    try {
      const api = new WechatAPI(account.appId, account.appSecret, this.plugin.settings.proxyUrl);

      // 1. 获取封面图
      notice.setMessage('🖼️ 正在处理封面图...');
      // 严格校验: 必须有 sessionCoverBase64 或者能从文章提取到图片
      const coverSrc = this.sessionCoverBase64 || this.getFirstImageFromArticle();
      if (!coverSrc) {
        throw new Error('未设置封面图，同步失败。请在弹窗中上传封面。');
      }

      const coverBlob = await this.srcToBlob(coverSrc);
      const coverRes = await api.uploadCover(coverBlob);
      const thumb_media_id = coverRes.media_id;

      // 2. 处理文章图片
      notice.setMessage('📸 正在同步正文图片...');
      const processedHtml = await this.processAllImages(this.currentHtml, api, (current, total) => {
        notice.setMessage(`📸 正在同步正文图片 (${current}/${total})...`);
      });

      // 2.5 清理 HTML 以适配微信编辑器
      const cleanedHtml = this.cleanHtmlForDraft(processedHtml);

      // 3. 获取文章标题
      const activeFile = this.app.workspace.getActiveFile();
      const title = activeFile ? activeFile.basename : '无标题文章';

      // 4. 创建草稿
      notice.setMessage('📝 正在发送到微信草稿箱...');
      const article = {
        title: title.substring(0, 64),
        content: cleanedHtml,
        thumb_media_id: thumb_media_id,
        author: account.author || '',
        digest: this.sessionDigest || '一键同步自 Obsidian'
      };

      await api.createDraft(article);

      notice.hide();
      new Notice('✅ 同步成功！请前往微信公众号后台草稿箱查看');
    } catch (error) {
      notice.hide();
      console.error('Wechat Sync Error:', error);
      new Notice(`❌ 同步失败: ${error.message}`);
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
      return new Blob([response.arrayBuffer], { type: 'image/png' });
    }

    throw new Error('不支持的图片来源，请尝试重新上传封面');
  }

  /**
   * 处理 HTML 中的所有图片，上传到微信并替换链接
   * 支持并发上传 (Limit 3) 和进度回调
   */
  async processAllImages(html, api, progressCallback) {
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
      // 如果已经处理过（比如重复的URL在并发中被其他任务处理了？不，pMap的任务是唯一的src）
      // 这里不需要 try-catch，因为我们希望出错时直接抛出，中断整个流程
      const blob = await this.srcToBlob(src);
      const res = await api.uploadImage(blob);
      urlMap.set(src, res.url);

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

  /**
   * 清理 HTML 以适配微信编辑器
   * 微信编辑器对嵌套列表支持不佳，需要：
   * 1. 处理嵌套列表父级 li 内的段落与行内内容（避免嵌套层级被打散）
   * 2. 将深层嵌套列表转为伪列表（避免微信扁平化）
   * 3. 移除嵌套 ul/ol 的 margin（避免被当成独立块）
   * 4. 移除空的 li 元素和空白文本节点
   */
  cleanHtmlForDraft(html) {
    const div = document.createElement('div');
    div.innerHTML = html;

    // 1. 处理包含嵌套列表的 li：移除直接子 p，并把前置行内内容包成块级 span
    div.querySelectorAll('li').forEach(li => {
      const hasNestedList = li.querySelector('ul, ol');
      if (!hasNestedList) return;

      // 1.1 解包直接子 p（避免微信将 p 与嵌套列表当成同级）
      Array.from(li.children).forEach(child => {
        if (child.tagName === 'P') {
          while (child.firstChild) {
            li.insertBefore(child.firstChild, child);
          }
          child.remove();
        }
      });

      // 1.2 将嵌套列表前的行内节点包裹为块级 span，稳定层级结构
      const firstList = Array.from(li.children).find(child => child.tagName === 'UL' || child.tagName === 'OL');
      if (!firstList) return;

      const nodesBeforeList = [];
      for (let node = li.firstChild; node && node !== firstList; node = node.nextSibling) {
        nodesBeforeList.push(node);
      }

      const meaningfulNodes = nodesBeforeList.filter(node =>
        !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      );

      if (meaningfulNodes.length === 0) return;

      const blockTags = new Set(['UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE', 'SECTION', 'FIGURE', 'DIV']);
      const hasBlock = meaningfulNodes.some(node =>
        node.nodeType === Node.ELEMENT_NODE && blockTags.has(node.tagName)
      );

      if (hasBlock) return;

      const wrapper = document.createElement('span');
      const liStyle = li.getAttribute('style') || '';
      const lineHeightMatch = liStyle.match(/line-height:\s*[^;]+/i);
      const lineHeight = lineHeightMatch ? `${lineHeightMatch[0]};` : '';
      wrapper.setAttribute('style', `display:block;margin:0;padding:0;${lineHeight}`);

      meaningfulNodes.forEach(node => wrapper.appendChild(node));
      li.insertBefore(wrapper, firstList);
    });

    // 2. 将深层嵌套列表转为伪列表（仅处理 depth >= 2）
    const getListDepth = list => {
      let depth = 0;
      let current = list.parentElement;
      while (current) {
        if (current.tagName === 'UL' || current.tagName === 'OL') depth += 1;
        current = current.parentElement;
      }
      return depth;
    };

    const buildPseudoItems = (list, depth) => {
      const fragment = document.createDocumentFragment();
      const isOrdered = list.tagName === 'OL';
      let index = 1;

      Array.from(list.children).forEach(li => {
        if (li.tagName !== 'LI') return;

        const nestedLists = Array.from(li.children).filter(
          child => child.tagName === 'UL' || child.tagName === 'OL'
        );

        const liStyle = li.getAttribute('style') || '';
        const indent = Math.max(0, depth - 1) * 20;
        const wrapper = document.createElement('p');
        wrapper.setAttribute(
          'style',
          `${liStyle} margin:0 0 4px ${indent}px; padding:0;`
        );

        const contentNodes = [];
        Array.from(li.childNodes).forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'UL' || node.tagName === 'OL')) return;
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'P') {
            const children = Array.from(node.childNodes);
            if (children.length && contentNodes.length) {
              contentNodes.push(document.createTextNode(' '));
            }
            children.forEach(child => contentNodes.push(child));
            return;
          }
          contentNodes.push(node);
        });

        // Trim leading whitespace-only text nodes to avoid bullets on separate lines.
        while (
          contentNodes.length > 0 &&
          contentNodes[0].nodeType === Node.TEXT_NODE &&
          !contentNodes[0].textContent.trim()
        ) {
          contentNodes.shift();
        }
        // If the first text node starts with a newline/indent, trim it to keep marker + text on one line.
        if (contentNodes.length > 0 && contentNodes[0].nodeType === Node.TEXT_NODE) {
          contentNodes[0].textContent = contentNodes[0].textContent.replace(/^\s+/, '');
          if (!contentNodes[0].textContent) {
            contentNodes.shift();
          }
        }

        const hasContent = contentNodes.some(node => {
          if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
          return true;
        });

        if (hasContent) {
          contentNodes.forEach(node => {
            if (node.nodeType !== Node.TEXT_NODE) return;
            node.textContent = node.textContent.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ');
            if (!node.textContent.trim()) {
              node.remove();
            }
          });

          const markerText = isOrdered ? `${index}. ` : '• ';
          const firstText = contentNodes.find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
          if (firstText) {
            firstText.textContent = markerText + firstText.textContent;
          } else {
            contentNodes.unshift(document.createTextNode(markerText));
          }

          contentNodes.forEach(node => wrapper.appendChild(node));
          fragment.appendChild(wrapper);
        }

        nestedLists.forEach(nested => {
          fragment.appendChild(buildPseudoItems(nested, depth + 1));
        });

        index += 1;
      });

      return fragment;
    };

    Array.from(div.querySelectorAll('ul, ol')).forEach(list => {
      if (!div.contains(list)) return;
      const depth = getListDepth(list);
      if (depth < 2) return;
      const fragment = buildPseudoItems(list, depth);
      list.parentNode.insertBefore(fragment, list);
      list.remove();
    });

    // 3. 处理嵌套的 ul/ol（在 li 内的列表）：移除 margin，调整缩进
    div.querySelectorAll('li > ul, li > ol').forEach(nestedList => {
      // 获取原有样式
      let style = nestedList.getAttribute('style') || '';
      // 移除 margin，保留其他样式
      style = style.replace(/margin:\s*[^;]+;?/gi, '');
      // 添加 margin: 0 确保紧贴父元素
      style = 'margin: 0; ' + style;
      nestedList.setAttribute('style', style);
    });

    // 4. 移除空的 li 元素
    div.querySelectorAll('li').forEach(li => {
      if (!li.textContent.trim() && li.querySelectorAll('img, ul, ol').length === 0) {
        li.remove();
      }
    });

    // 5. 移除 ul/ol 内的纯空白文本节点
    div.querySelectorAll('ul, ol').forEach(list => {
      Array.from(list.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
          node.remove();
        }
      });
    });

    // 6. 移除 li 内的多余换行/空白文本节点
    div.querySelectorAll('li').forEach(li => {
      Array.from(li.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
          node.remove();
        }
      });
    });

    return div.innerHTML;
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

  /**
   * 更新当前文档显示
   */
  updateCurrentDoc() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && this.currentDocLabel) {
      this.currentDocLabel.setText(`📄 ${activeView.file.basename}`);
      this.currentDocLabel.style.color = '#0071e3';
    } else if (this.lastActiveFile && this.currentDocLabel) {
      this.currentDocLabel.setText(`📄 ${this.lastActiveFile.basename}`);
      this.currentDocLabel.style.color = '#0071e3';
    } else if (this.currentDocLabel) {
      this.currentDocLabel.setText('未选择文档');
      this.currentDocLabel.style.color = '#86868b';
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
    placeholder.createEl('p', { text: '将 Markdown 转换为精美的 HTML，一键复制到公众号' });
    const steps = placeholder.createEl('div', { cls: 'apple-steps' });
    steps.createEl('div', { text: '1️⃣ 打开需要转换的 Markdown 文件' });
    steps.createEl('div', { text: '2️⃣ 预览区会自动显示转换效果' });
    steps.createEl('div', { text: '3️⃣ 点击「复制到公众号」粘贴即可' });

    // 添加提示
    const note = placeholder.createEl('p', {
      text: '注意：如当前已打开文档但未显示，请重新点击一下文档即可触发',
      cls: 'apple-placeholder-note'
    });
  }


  /**
   * 转换当前文档
   */
  async convertCurrent(silent = false) {
    // Force update custom CSS from settings before conversion to ensure it's always up to date
    if (this.theme) {
      this.theme.update({ customCss: this.plugin.settings.customCss });
    }

    let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    let markdown = '';
    let sourcePath = '';

    if (!activeView && this.lastActiveFile) {
      try {
        markdown = await this.app.vault.read(this.lastActiveFile);
        sourcePath = this.lastActiveFile.path;
      } catch (error) {
        if (!silent) new Notice('请先打开一个 Markdown 文件');
        return;
      }
    } else if (activeView) {
      markdown = activeView.editor.getValue();
      if (activeView.file) sourcePath = activeView.file.path;
    } else {
      if (!silent) new Notice('请先打开一个 Markdown 文件');
      return;
    }

    if (!markdown.trim()) {
      if (!silent) new Notice('当前文件内容为空');
      return;
    }

    try {
      if (!silent) new Notice('⚡ 正在转换...');
      // 更新当前文件路径，用于解析相对路径图片
      if (this.converter) this.converter.updateSourcePath(sourcePath);

      const html = await this.converter.convert(markdown);
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
      if (this.copyBtn) {
        const originalText = this.copyBtn.innerHTML;
        this.copyBtn.setText('⚠️ 请先转换文档');
        setTimeout(() => { if (this.copyBtn) this.copyBtn.innerHTML = originalText; }, 2000);
      }
      return;
    }

    const originalText = this.copyBtn.innerHTML;

    this.isCopying = true;
    if (this.copyBtn) {
      this.copyBtn.disabled = true;
      this.copyBtn.setText('⏳ 正在压缩图片...');
    }

    try {
      // 创建临时的 DOM 容器来解析和处理图片
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.currentHtml;

      // 处理本地图片：转换为 JPEG Base64
      // 返回 true 表示有图片被处理了
      const processed = await this.processImagesToDataURL(tempDiv);

      // 清理 HTML 以适配微信编辑器（处理嵌套列表等）
      const cleanedHtml = this.cleanHtmlForDraft(tempDiv.innerHTML);

      const text = tempDiv.textContent || '';
      const htmlContent = cleanedHtml;

      if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([clipboardItem]);

        if (this.copyBtn) {
          this.copyBtn.setText('✅ 已复制！');
          // Revert button after 2 seconds
          setTimeout(() => {
            if (this.copyBtn) {
              this.copyBtn.disabled = false;
              this.copyBtn.innerHTML = originalText;
            }
          }, 2000);
        }
        return;
      }

      // Fallback
      throw new Error('Clipboard API unavailable');

    } catch (error) {
      console.error('复制失败:', error);
      if (this.copyBtn) {
        this.copyBtn.setText('❌ 复制失败');
        setTimeout(() => {
          this.copyBtn.disabled = false;
          this.copyBtn.innerHTML = originalText;
        }, 2000);
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
    const localImages = images.filter(img => img.src.startsWith('app://'));

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
    // 清理滚动监听
    if (this.activeEditorScroller && this.scrollListener) {
      this.activeEditorScroller.removeEventListener('scroll', this.scrollListener);
    }
    this.previewContainer?.empty();
    console.log('🍎 转换器面板已关闭');
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

  display() {
    const { containerEl } = this;
    containerEl.empty();

    // 提示信息
    new Setting(containerEl)
      .setDesc('更多排版样式选项（主题、字号、代码块等）请在插件侧边栏面板中进行设置。');

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

    new Setting(containerEl)
      .setName('显示图片说明文字')
      .setDesc('关闭水印时，在图片下方显示说明文字（图片名称）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showImageCaption)
        .onChange(async (value) => {
          this.plugin.settings.showImageCaption = value;
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
      .setName('API 代理地址')
      .setDesc(createFragment(frag => {
        frag.appendText('如果你的网络 IP 经常变化，可配置代理服务。');
        frag.createEl('a', {
          text: '查看部署指南',
          href: 'https://xiaoweibox.top/chats/wechat-proxy'
        });
      }))
      .addText(text => text
        .setPlaceholder('https://your-proxy.workers.dev')
        .setValue(this.plugin.settings.proxyUrl)
        .onChange(async (value) => {
          this.plugin.settings.proxyUrl = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('样式设置')
      .setHeading();

    new Setting(containerEl)
      .setName('自定义 CSS')
      .setDesc('在此处编写自定义 CSS 样式，当主题选择“自定义”时生效。如果做了修改，需要切换一下主题才能生效。当选择自定义时，样式设置中的字体大小等设置将失效。')
      .addTextArea(text => text
        .setPlaceholder('/* Put your custom CSS here */')
        .setValue(this.plugin.settings.customCss || CLASSIC_CSS)
        .onChange(async (value) => {
          this.plugin.settings.customCss = value;
          await this.plugin.saveSettings();
        }));

    // Apply styling to textarea after creation
    const textAreas = containerEl.querySelectorAll('textarea');
    if (textAreas.length > 0) {
      const lastTextArea = textAreas[textAreas.length - 1];
      lastTextArea.rows = 10;
      lastTextArea.style.width = '100%';
      lastTextArea.style.fontFamily = 'monospace';
      lastTextArea.style.fontSize = '12px';
    }
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

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
      await this.saveSettings();
      console.log('✅ 已将旧账号配置迁移到新格式');
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
