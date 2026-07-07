# 文件夹说明书

## 核心功能

承载主转换器面板的预览、样式面板、AI layout 面板和剪贴板交互。

## 输入

接收 AppleStyleView 状态、活动笔记、渲染管线结果、用户点击和面板控件事件。

## 输出

输出预览刷新、复制 HTML、样式切换、AI layout 控制和调试面板行为。

## 定位

位于 views/converter/，只处理主面板 UI；渲染与同步规则不在这里重复实现。

## 依赖

views/apple-style-view.js、services/render-pipeline.js、converter.js 和 styles/。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
