# 文件夹说明书

## 核心功能

承载微信公众号文章主题、动态颜色角色与内联样式预设。

## 输入

接收转换后的文章结构、主题设置和微信编辑器兼容约束。

## 输出

输出 AppleTheme、图文志颜色角色和标签级内联样式规则，供 converter 应用于文章 HTML。

## 定位

位于 themes/，是文章主题层；不处理 Markdown 解析、资源上传或发布同步。

## 依赖

- `apple-theme-config.js`：主题登记、字体和基础配置。
- `apple-theme-colors.js`：动态颜色角色、对比度保护和透明强调色派生。
- `apple-theme-pictorial.js`：图文志的微信公众号兼容标签样式。
- `apple-theme.js`：主题运行时接线和既有通用主题样式。

图文志的图片角色解析不在本目录处理，而由 `services/obsidian-triplet-serializer-pictorial.js` 在普通 figure 已生成后接入。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
- 主题色与插件操作 UI 的成功、警告、错误色必须分离；新主题不得把固定外部配色当作文章身份。
- 微信输出只能依赖标签级内联样式，不能以 class、`<style>`、伪元素或复杂布局作为必要合同。
