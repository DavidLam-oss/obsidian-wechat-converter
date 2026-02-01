
# 📝 微信公众号排版转换器 (WeChat Converter)

**让技术写作回归优雅与纯粹。**

一款专为 Obsidian 打造的微信公众号排版增强插件。它不仅仅是一个转换工具，更是您内容创作流中的"数字化妆师"。我们解决了 Obsidian 到微信公众号排版的"最后一公里"问题，让您专注于内容创作，无需为繁琐的格式调整而分心。

只需一键，即可将您的 Markdown 笔记转换为符合微信生态美学、阅读体验极佳的 HTML，无论是代码块、引用、列表还是本地图片，都能完美呈现。

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.0.0+-purple)
![License](https://img.shields.io/badge/license-MIT-green)


> 本项目基于开源项目 [ai-writing-plugins](https://github.com/Ceeon/ai-writing-plugins) 进行深度重构与迭代开发。我们致力于打造 Obsidian 生态中体验最好的公众号排版工具。

## 💡 核心升级点 (Key Highlights)

相较于原版，我们**重写了核心渲染逻辑**并新增了大量实用功能，旨在实现真正的**"所见即所得"**：

1.  **🚀 一键同步到微信草稿箱 (v2.0 新增)**
    - **告别复制粘贴**：直接将文章同步到微信公众号后台草稿箱，图片自动上传。
    - **多账号管理**：支持最多 5 个公众号账号配置，快速切换同步。
    - **自定义作者 & 摘要**：每个账号可设置默认作者，同步时可自定义文章摘要。
    - **Cloudflare 代理支持**：解决 IP 白名单频繁变化问题，[查看部署指南](#-cloudflare-worker-代理可选)。

2.  **🎛 全新可视化设置面板 (Settings Panel)**
    - 告别繁琐的代码修改！我们内置了直观的设置面板，让您可以实时调整字体、字号、主题色等参数，一切尽在掌握。

3.  **🎨 三大专家级主题 (Premade Themes)**
    - 内置 **简约 (Simple)**、**经典 (Classic)**、**优雅 (Elegant)** 三款精心设计的主题，覆盖从技术博客到人文随笔的各种场景。

4.  **🖼️ 强大的本地图片支持 (Local Image Support)**
    - **打破图床限制**：完美支持 Obsidian 的本地图片引用（包括 `![[Wiki Link]]` 和 `![]()`）。
    - **头像上传**：支持直接上传本地图片作为作者头像，插件会自动转码为 Base64。
    - **强大的本地图片支持**：无论是相对路径、绝对路径还是 WikiLink，都能自动识别并压缩。
    - **GIF 动图支持**：针对 GIF 格式特别优化，自动绕过压缩流程，完美保留完整动画帧。
    - **温馨提示**：建议图片（尤其是 GIF）保持在 10MB 以内，以获得最佳的处理速度和公众号兼容性。超过 10MB 时插件会弹出提醒。

5.  **⚡️ 实时渲染预览 (Live Preview)**
    - 右侧预览区实现了**毫秒级响应**的实时渲染。您在左侧 Markdown 编辑的每一个字符，都会即时反馈在右侧的公众号预览视图中。

6.  **💻 Mac 风格代码块与样式还原**
    - 重新设计了代码块样式，支持 macOS 窗口风格及行号显示。
    - **1:1 完美还原**：我们在 Obsidian 预览区看到的样式（包括间距、颜色、边框、阴影），复制到微信后台后将**分毫不差**。

## ✨ 核心特性

- 🖼️ **本地图片无感处理** - 复制时自动将图片高保真压缩并转换为 Base64 编码嵌入 HTML。
- 🧩 **深层列表兼容** - 复制到公众号编辑器时，深层嵌套列表保持层级不乱、项目符号不丢。
- 🌗 **深色模式支持** - 完美适配 Obsidian 深色主题，预览区保持白纸黑字效果。
- 📱 **移动端阅读优化** - 针对微信环境优化的字号体系与段间距。

## 🚀 安装

### 方法 1: 手动安装（推荐）

1. 从 [GitHub Releases](https://github.com/DavidLam-oss/obsidian-wechat-converter/releases) 下载最新的插件包。
2. 解压并将其中的文件夹放入 Obsidian vault 的 `.obsidian/plugins/wechat-converter/` 目录中。
3. 确保文件夹内包含 `main.js`, `manifest.json`, `styles.css`, `converter.js`, `themes/` 以及 `lib/`。
4. 重启 Obsidian 或在设置中刷新插件列表，并启用插件。

### 方法 2: 使用 BRAT

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件。
2. 添加 Beta 仓库: `DavidLam-oss/obsidian-wechat-converter`。

## 📖 使用方法

1. **唤起插件**
   - 点击 Obsidian 左侧边栏的 🪄 图标 (WeChat Converter)。
   - 或使用命令面板 (`Cmd/Ctrl + P`) 搜索并执行 "Open Wechat Converter"。

2. **预览与调整**
   - 插件会自动加载当前激活的笔记内容。
   - 在右侧面板中，您可以实时预览排版效果。

3. **一键复制**
   - 确认预览效果满意后，点击底部的 **[📋 复制到公众号]** 按钮。
   - 提示"已复制"后，直接在微信公众号后台编辑器中 `Ctrl/Cmd + V` 粘贴即可。

4. **一键同步到微信草稿箱** ⭐ 新功能
   - 在插件设置中配置微信公众号账号（AppID 和 AppSecret）
   - 点击 **[🚀 一键同步]** 按钮，选择账号和封面图
   - 文章将自动同步到微信公众号草稿箱

## 🔧 代理设置（解决 IP 白名单问题）

微信公众号 API 需要 IP 白名单验证。如果你使用 VPN 或动态 IP，可以通过 Cloudflare Worker 代理解决。

### 部署步骤

1. **创建 Cloudflare Worker**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 左侧菜单选择 **Workers & Pages** → **Create Application** → **Create Worker**
   - 命名（如 `wechat-proxy`）并点击 **Deploy**

2. **编辑 Worker 代码**

   点击 **Edit code**，替换为以下代码：

   ```javascript
   export default {
     async fetch(request, env) {
       if (request.method !== 'POST') {
         return new Response('Method Not Allowed', { status: 405 });
       }
       try {
         const body = await request.json();
         const { url, method = 'GET', data, fileData, fileName, mimeType, fieldName } = body;
         
         if (!url || !url.startsWith('https://api.weixin.qq.com/')) {
           return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400 });
         }

         let response;
         if (method === 'UPLOAD' && fileData) {
           // 文件上传：将 base64 转为二进制并构建 multipart
           const binary = atob(fileData);
           const bytes = new Uint8Array(binary.length);
           for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
           
           const formData = new FormData();
           formData.append(fieldName || 'media', new Blob([bytes], { type: mimeType }), fileName);
           response = await fetch(url, { method: 'POST', body: formData });
         } else {
           // 普通请求
           const opts = { method, headers: { 'Content-Type': 'application/json' } };
           if (method !== 'GET' && data) opts.body = JSON.stringify(data);
           response = await fetch(url, opts);
         }

         const result = await response.json();
         return new Response(JSON.stringify(result), {
           headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
         });
       } catch (error) {
         return new Response(JSON.stringify({ error: error.message }), { status: 500 });
       }
     }
   };
   ```


3. **配置微信 IP 白名单**

   将 Cloudflare 出口 IP 添加到微信公众号白名单（[官方 IP 列表](https://www.cloudflare.com/ips/)）：

   ```
   173.245.48.0/20, 103.21.244.0/22, 103.22.200.0/22, 103.31.4.0/22
   141.101.64.0/18, 108.162.192.0/18, 190.93.240.0/20, 188.114.96.0/20
   197.234.240.0/22, 198.41.128.0/17, 162.158.0.0/15, 104.16.0.0/13
   104.24.0.0/14, 172.64.0.0/13, 131.0.72.0/22
   ```

4. **插件配置**

   在插件设置 → **高级设置** → **API 代理地址** 中填入你的 Worker URL：
   ```
   https://wechat-proxy.your-account.workers.dev
   ```


## 🤝 贡献 (Contributing)

欢迎提交 Issue 或 Pull Request！

1. Fork 本仓库。
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)。
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4. 推送到分支 (`git push origin feature/AmazingFeature`)。
5. 开启一个 Pull Request。

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。

## 👨‍💻 作者

**林小卫很行 (DavidLam)**

一名热衷于提升生产力的开发者与内容创作者。
如果您在使用过程中有任何问题、建议或发现了 Bug，欢迎随时在 GitHub Issue 区留言反馈。相信工具的力量，让创作更自由。
