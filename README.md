# 📝 微信公众号排版转换器 (WeChat Converter)

将 Obsidian 笔记一键转换为完美的微信公众号 HTML 格式。提供简约、经典、优雅三种精选主题，让排版更专业。

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-0.15.0+-purple)
![License](https://img.shields.io/badge/license-MIT-green)

> 本项目基于开源项目 [ai-writing-plugins](https://github.com/Ceeon/ai-writing-plugins) 进行迭代开发。

## ✨ 核心特性

- � **精选排版主题** - 提供 **简约** (GitHub风/wechat-tool同款)、**经典** (商务风)、**优雅** (杂志风) 三大专家级设计主题
- 🎨 **专家级设计** - 针对微信阅读优化的字号体系与间距系统
- 🌗 **深色模式支持** - 完美适配 Obsidian 深色主题，预览区保持白纸黑字所见即所得

- 🖼️ **本地头像上传** - 支持直接上传本地图片作为头像，无需图床（自动转 Base64）
- 💻 **Mac 风格代码块** - 支持 macOS 窗口风格代码块，可选显示行号
- 📱 **实时预览** - 支持**所见即所得**的实时预览，智能防抖渲染，流畅无卡顿
- 📋 **一键复制** - 转换后的 HTML 可直接粘贴到微信公众号编辑器，格式完美保留

## 🚀 安装

### 方法 1: 手动安装（推荐）

1. 下载插件的完整文件夹 (包含 main.js, manifest.json, styles.css 以及 lib/, themes/ 等资源)
2. 将文件夹放入 Obsidian vault 的 `.obsidian/plugins/` 目录中
3. 文件夹名称建议为 `wechat-converter` (或保持原名)
4. 在 Obsidian 设置中启用插件

### 方法 2: 从源码构建

```bash
git clone https://github.com/DavidLam-oss/obsidian-wechat-converter
cd obsidian-wechat-converter
npm install
npm run build
```

## 📖 使用方法

1. **打开转换器**
   - 点击左侧边栏的 🪄 图标 (WeChat Converter)
   - 或使用命令面板: `Cmd/Ctrl + P` -> "Open Wechat Converter"

2. **自动转换**
   - 转换器会自动读取当前激活的 Markdown 文档
   - 在右侧预览区即可看到排版后的效果

3. **调整与复制**
   - 在顶部面板调整**字体**、**字号**、**主题色**等设置
   - 设置**头像**（支持网络 URL 或本地上传）
   - 点击底部的 **[📋 复制到公众号]** 按钮
   - 粘贴到微信公众号后台编辑器即可

## ⚙️ 功能设置

### 外观设置
### 外观主题
- **简约 (Simple)**：现代极简，灵感来自 GitHub，大字号与高呼吸感，使用灰色引用块。
- **经典 (Classic)**：商务专业，使用 CSS 渐变制作精致的居中下划线，适合职场/技术文章。
- **优雅 (Elegant)**：杂志排版 (Editorial)，全衬线体设计。
    - *特殊层级*：H1/H2 共享"金线居中"样式，H3 采用"左对齐斜体"，H4 采用"下划线"。营造流动的阅读节奏。

### 细节微调
- **字体**：衬线 / 无衬线 / 等宽 (注：优雅主题会强制标题使用衬线体)
- **字号**：提供 5 档字号选择（推荐使用默认 Level 3）
- **主题色**：自定义关键元素（如链接、按钮）的颜色

### 功能开关
- **Mac 风格代码块**：为代码块添加类似 macOS 窗口的红黄绿圆点
- **显示代码行号**：开启/关闭代码行号显示
- **显示图片说明**：开启/关闭图片下方的说明文字 (Caption)

### 个人信息
- **头像设置**：上传本地图片或输入网络图片链接，生成精美的作者卡片

## 🏗️ 开发计划

- [x] 重命名为 Wechat Converter
- [x] 支持本地头像上传 (Base64)
- [x] 适配深色模式 (Dark Mode)

- [x] Mac 风格代码块开关
- [x] 图片说明文字开关
- [x] 实时预览与智能防抖
- [ ] 更多预设主题
- [ ] 自定义 CSS 注入
- [ ] 导出长图功能

## 📄 许可证

MIT License
