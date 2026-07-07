/*
## 核心功能

提供服务层通用能力：sync context。

## 输入

接收上游视图、转换器、同步服务或工具脚本传入的数据。

## 输出

输出 `resolveSyncAccount`、`toSyncFriendlyMessage`，供项目内其他模块复用。

## 定位

位于 services/，是共享服务模块；保持输入输出清晰，避免引入 UI 状态耦合。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * @typedef {{ id?: string, [key: string]: unknown }} SyncAccountLike
 */

/**
 * @param {{ accounts?: unknown, selectedAccountId?: string, defaultAccountId?: string }} options
 * @returns {SyncAccountLike | null}
 */
export function resolveSyncAccount({ accounts, selectedAccountId, defaultAccountId }) {
  const list = Array.isArray(accounts)
    ? /** @type {SyncAccountLike[]} */ (accounts.filter((account) => !!account && typeof account === 'object' && !Array.isArray(account)))
    : [];
  if (list.length === 0) return null;

  if (selectedAccountId) {
    const selected = list.find((account) => account.id === selectedAccountId);
    if (selected) return selected;
  }

  if (defaultAccountId) {
    const byDefault = list.find((account) => account.id === defaultAccountId);
    if (byDefault) return byDefault;
  }

  return list[0];
}

/**
 * @param {unknown} errorMessage
 * @returns {string}
 */
export function toSyncFriendlyMessage(errorMessage = '') {
  const message = String(errorMessage || '');
  if (message.includes('45002')) {
    return '文章太长，微信接口拒收。建议分篇发送，或使用插件顶部的「复制」按钮手动粘贴到公众号后台。';
  }
  if (/invalid content|invalld content|45166/i.test(message)) {
    return '微信接口拒收正文内容（invalid content）。常见原因是正文里仍有未上传图片、无效链接或微信不支持的 HTML。请根据上方同步提示检查正文图片和复杂粘贴内容后重试。';
  }
  if (message.includes('40007') || /invalid media_id|invalld media_id/i.test(message)) {
    return '微信接口返回媒体 ID 无效 (40007)。这通常是因为草稿在微信后台已被删除，或封面图已过期。建议在下方点击「取消关联并新建草稿」，然后重新同步。';
  }
  if (message.includes('status 403')) {
    return '访问中转代理服务器被拒绝 (HTTP 403)。请检查您的代理地址和 Token 是否正确。';
  }
  if (message.includes('status 401')) {
    return '访问中转代理服务器未授权 (HTTP 401)。请检查您的代理地址和 Token 是否正确。';
  }
  return message;
}
