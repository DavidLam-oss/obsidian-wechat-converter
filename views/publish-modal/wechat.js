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
