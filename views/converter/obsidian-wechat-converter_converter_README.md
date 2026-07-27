# 文件夹说明书

## 核心功能

承载主转换器面板的预览、设置表单、面板壳层、贴图预览、AI layout 和剪贴板交互。

## 输入

接收 AppleStyleView 状态、活动笔记、渲染管线结果、用户点击和面板控件事件。

## 输出

输出预览刷新、复制 HTML、样式切换、AI layout 控制和调试面板行为。

## 模块边界

- `settings-panel.js`：创建顶部工具栏及文章/贴图设置控件。
- `panel-shell.js`：管理悬浮面板、滚动边界和预览模式切换。
- `sticker-preview.js`：管理贴图临时状态、数据构建和侧边栏预览。
- `core.js`：承载转换器视图生命周期和文章预览入口。
- `ai-layout-panel.js` / `ai-layout-debug.js`：承载 AI 编排面板与调试交互。
- `clipboard.js`：承载复制到公众号的剪贴板流程。

## 定位

位于 views/converter/，只处理主面板 UI；渲染与同步规则不在这里重复实现。

## 依赖

views/apple-style-view.js、services/render-pipeline.js、services/sticker-*、converter.js 和 styles/。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
