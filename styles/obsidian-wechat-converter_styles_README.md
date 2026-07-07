# 文件夹说明书

## 核心功能

承载插件样式源文件，包括主视图、设置页、发布弹窗和文章预览样式。

## 输入

接收 views/ 输出的 DOM class、Obsidian 主题变量、交互状态和响应式约束。

## 输出

输出 CSS 源规则，经 build-styles 脚本汇总为 styles.css。

## 定位

位于 styles/，是样式源边界；不要直接把长期修改写入生成的 styles.css。

## 依赖

views/ DOM 结构、Obsidian CSS 变量、scripts/build-styles.mjs。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
