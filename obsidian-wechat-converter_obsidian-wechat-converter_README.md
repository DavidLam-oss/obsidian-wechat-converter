# 文件夹说明书

## 核心功能

承载项目根目录源码入口、构建配置和顶层运行文件。

## 输入

接收 Obsidian 插件生命周期、构建命令、测试命令和项目级配置。

## 输出

输出插件入口类、转换核心、构建配置、测试配置和 OpenPRD 标准配置。

## 定位

位于仓库根目录，是项目总入口；业务细节应下沉到 services/、views/、themes/ 或 scripts/。

## 依赖

Obsidian 插件 API、esbuild、Vitest、ESLint、OpenPRD 和 npm scripts。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
