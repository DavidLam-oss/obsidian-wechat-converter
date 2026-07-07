# 文件夹说明书

## 核心功能

承载独立运行时库、第三方前端库和数学公式 bundle 源入口。

## 输入

接收 markdown-it、mathjax 插件配置、上游第三方库和动态加载请求。

## 输出

输出公式渲染入口、压缩第三方库或构建产物供 converter/dependency-loader 使用。

## 定位

位于 lib/，是运行时库边界；第三方压缩包和生成 bundle 不手工修改。

## 依赖

markdown-it-mathjax3、highlight.js、markdown-it、esbuild.math.mjs。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
