/*
## 核心功能

实现发布弹窗中的 wechat 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `wechatPublishMethods`，用于微信、飞书或多平台发布流程的 UI 编排。

## 定位

位于 views/publish-modal/，负责发布弹窗 UI 层；API 调用委托 services/。

## 依赖

关键依赖：`./wechat-preview-export.js`、`./wechat-account-state.js`、`./wechat-modal-shell.js`、`./wechat-sync-modal.js`、`./wechat-multiplatform-actions.js`、`./wechat-sync-action.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { wechatPreviewExportMethods } from './wechat-preview-export.js';
import { wechatAccountStateMethods } from './wechat-account-state.js';
import { wechatModalShellMethods } from './wechat-modal-shell.js';
import { wechatSyncModalMethods } from './wechat-sync-modal.js';
import { wechatMultiPlatformActionMethods } from './wechat-multiplatform-actions.js';
import { wechatSyncActionMethods } from './wechat-sync-action.js';

const wechatPublishMethods = {
  ...wechatPreviewExportMethods,
  ...wechatAccountStateMethods,
  ...wechatModalShellMethods,
  ...wechatSyncModalMethods,
  ...wechatMultiPlatformActionMethods,
  ...wechatSyncActionMethods,
};

export { wechatPublishMethods };
