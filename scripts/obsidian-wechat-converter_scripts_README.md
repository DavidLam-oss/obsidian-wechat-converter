# 文件夹说明书

## 核心功能

承载仓库构建、生成、扫描、发布校验和性能测量脚本。

## 输入

接收 npm scripts、命令行参数、源码文件、生成物和发布包状态。

## 输出

输出构建产物、校验结果、失败退出码、报告或发布前诊断。

## 定位

位于 scripts/，属于工程化层；不被 Obsidian 运行时直接加载。

## 依赖

Node.js、esbuild、package.json scripts、OpenPRD/Obsidian scan 规则。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
