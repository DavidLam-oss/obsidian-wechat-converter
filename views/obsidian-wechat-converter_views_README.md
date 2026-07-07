# 文件夹说明书

## 核心功能

承载 Obsidian 插件视图层，包括主转换器视图、状态栏、发布弹窗和设置页。

## 输入

接收 Obsidian 视图生命周期、插件实例、用户事件、服务层结果和当前文章状态。

## 输出

输出可交互 UI、视图方法集合、弹窗和设置页组件。

## 定位

位于 views/，是 UI 编排层；业务服务和转换规则委托 services/ 与 converter.js。

## 依赖

Obsidian ItemView/Setting/Modal API、services/、themes/ 和 styles/。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
