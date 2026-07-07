# 文件夹说明书

## 核心功能

承载 AI layout skill runtime 的 registry 与查询包装。

## 输入

接收生成的 skill 数据、skill id、layout family 和调用方查询请求。

## 输出

输出 skill 元数据、共享约束和按 id/family 过滤后的运行时注册信息。

## 定位

位于 services/ai-layout-runtime/，只管理运行时数据访问；生成数据由脚本产出。

## 依赖

scripts/build-ai-layout-runtime.mjs、services/ai-layout/ 和生成 registry。

## 维护规则

- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
