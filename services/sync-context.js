function resolveSyncAccount({ accounts, selectedAccountId, defaultAccountId }) {
  const list = Array.isArray(accounts) ? accounts : [];
  const accountId = selectedAccountId || defaultAccountId;
  return list.find((account) => account.id === accountId) || null;
}

function toSyncFriendlyMessage(errorMessage = '') {
  if (errorMessage.includes('45002')) {
    return '文章太长，微信接口拒收。建议分篇发送，或使用插件顶部的「复制」按钮手动粘贴到公众号后台。';
  }
  return errorMessage;
}

module.exports = {
  resolveSyncAccount,
  toSyncFriendlyMessage,
};
