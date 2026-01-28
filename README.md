
# 📝 微信公众号排版转换器 (WeChat Converter)

**让技术写作回归优雅与纯粹。**

一款专为 Obsidian 打造的微信公众号排版增强插件。它不仅仅是一个转换工具，更是您内容创作流中的"数字化妆师"。我们解决了 Obsidian 到微信公众号排版的"最后一公里"问题，让您专注于内容创作，无需为繁琐的格式调整而分心。

只需一键，即可将您的 Markdown 笔记转换为符合微信生态美学、阅读体验极佳的 HTML，无论是代码块、引用、列表还是本地图片，都能完美呈现。

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.0.0+-purple)
![License](https://img.shields.io/badge/license-MIT-green)


> 本项目基于开源项目 [ai-writing-plugins](https://github.com/Ceeon/ai-writing-plugins) 进行深度重构与迭代开发。我们致力于打造 Obsidian 生态中体验最好的公众号排版工具。

## 💡 核心升级点 (Key Highlights)

相较于原版，我们**重写了核心渲染逻辑**并新增了大量实用功能，旨在实现真正的**"所见即所得"**：

1.  **🎛 全新可视化设置面板 (Settings Panel)**
    - 告别繁琐的代码修改！我们内置了直观的设置面板，让您可以实时调整字体、字号、主题色等参数，一切尽在掌握。

2.  **🎨 三大专家级主题 (Premade Themes)**
    - 内置 **简约 (Simple)**、**经典 (Classic)**、**优雅 (Elegant)** 三款精心设计的主题，覆盖从技术博客到人文随笔的各种场景。

3.  **🖼️ 强大的本地图片支持 (Local Image Support)**
    - **打破图床限制**：完美支持 Obsidian 的本地图片引用（包括 `![[Wiki Link]]` 和 `![]()`）。

    - **头像上传**：支持直接上传本地图片作为作者头像，插件会自动转码为 Base64。
    - **智能压缩**：复制时自动压缩图片并转为 Base64嵌入，无需任何第三方图床配置，粘贴即用。
    - **GIF 动图支持**：针对 GIF 格式特别优化，**自动绕过压缩流程**，完美保留完整动画帧。

4.  **⚡️ 实时渲染预览 (Live Preview)**
    - 右侧预览区实现了**毫秒级响应**的实时渲染。您在左侧 Markdown 编辑的每一个字符，都会即时反馈在右侧的公众号预览视图中。

5.  **💻 Mac 风格代码块与样式还原**
    - 重新设计了代码块样式，支持 macOS 窗口风格及行号显示。
    - **1:1 完美还原**：我们在 Obsidian 预览区看到的样式（包括间距、颜色、边框、阴影），复制到微信后台后将**分毫不差**。

## ✨ 核心特性

- 🖼️ **本地图片无感处理** - 复制时自动将图片高保真压缩并转换为 Base64 编码嵌入 HTML。
- 🌗 **深色模式支持** - 完美适配 Obsidian 深色主题，预览区保持白纸黑字效果。
- 📱 **移动端阅读优化** - 针对微信环境优化的字号体系与段间距。

## 🚀 安装

### 方法 1: 手动安装（推荐）

1. 下载插件的完整文件夹 (包含 `main.js`, `manifest.json`, `styles.css` 以及 `lib/`, `themes/` 等资源)。
2. 将文件夹放入 Obsidian vault 的 `.obsidian/plugins/` 目录中。
3. 文件夹名称建议为 `wechat-converter`。
4. 重启 Obsidian 或在设置中刷新插件列表，并启用插件。

### 方法 2: 从源码构建

```bash
git clone https://github.com/DavidLam-oss/obsidian-wechat-converter
cd obsidian-wechat-converter
npm install
npm run build
```

## 📖 使用方法

1. **唤起插件**
   - 点击 Obsidian 左侧边栏的 🪄 图标 (WeChat Converter)。
   - 或使用命令面板 (`Cmd/Ctrl + P`) 搜索并执行 "Open Wechat Converter"。

2. **预览与调整**
   - 插件会自动加载当前激活的笔记内容。
   - 在右侧面板中，您可以实时预览排版效果。
   - 通过顶部和底部的控制栏，您可以自由切换主题、调整字号、设置主题色，甚至上传头像生成作者卡片。

3. **一键复制**
   - 确认预览效果满意后，点击底部的 **[📋 复制到公众号]** 按钮。
   - **智能处理提示**：如果您的文章包含本地图片，插件会自动进行压缩和转码，此时会有"正在处理"的友好提示，请稍候片刻（通常仅需秒级等待）。
   - 提示"已复制"后，直接在微信公众号后台编辑器中 `Ctrl/Cmd + V` 粘贴即可。

## 📄 许可证

MIT License

## 👨‍💻 作者

**林小卫很行**

一名热衷于提升生产力的开发者与内容创作者。
如果您在使用过程中有任何问题、建议或发现了 Bug，欢迎随时在 GitHub Issue 区留言反馈，或与我也联系。相信工具的力量，让创作更自由。
