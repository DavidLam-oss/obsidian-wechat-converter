# 文件夹说明书

## 核心功能

承载视图层共享常量、DOM helper、状态工具和跨入口复用的贴图图片顺序组件。

## 输入

接收视图实例、DOM 容器、轻量状态对象和共享常量请求。

## 输出

输出可复用 helper、常量、状态读写工具和可访问的贴图九宫格，供 converter、publish modal 和 settings 使用。

## 定位

位于 views/shared/，只放视图层小工具；业务服务能力应放入 services/。

## 依赖

views/ 各子模块、Obsidian DOM helper 和项目 UI 状态约定。

## 主要模块

- `sticker-image-list.js`：侧栏与发布弹窗共用的贴图网格，统一拖拽、键盘、触屏排序和移除入口。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
