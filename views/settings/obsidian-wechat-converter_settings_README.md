# 文件夹说明书

## 核心功能

承载插件设置页、账号 modal、平台 tab 和确认弹窗。

## 输入

接收插件设置、用户表单输入、账号配置、平台开关和 SettingTab 生命周期。

## 输出

输出设置页面、配置保存动作、账号管理 modal 和平台设置 UI。

## 定位

位于 views/settings/，负责设置 UI；设置默认值和归一化由 services/ 维护。

## 依赖

Obsidian PluginSettingTab/Setting/Modal API、services/plugin-settings.js 和平台设置服务。

## 维护规则

- 图片卡片的设置不在此目录：全部配置收敛在转换器侧栏面板（`views/converter/card-settings.js`，
  「排版 Token / 封面设置」双子 Tab），设置页只保留「微信 / 多平台 / 飞书 / AI 服务 / 关于」。
  历史上曾存在 `views/settings/card-tab.js`（卡片全局默认页签），2026-09-19 按 David 要求摘除：
  侧栏「调完即存为默认」，导出目录改由导出弹窗记忆——避免两处入口与写入路径分叉。
- 每次新增、删除、移动文件或调整目录职责后，必须更新本 README。
- 目录职责影响项目结构、流程、架构或技术栈时，同步更新 docs/basic/ 对应文档。
