/**
 * @param {Record<string, unknown>} data
 * @returns {string}
 */
function formatWechatApiError(data) {
  const errmsg = typeof data.errmsg === 'string' ? data.errmsg : JSON.stringify(data);
  const errcode = data.errcode ?? 'N/A';
  return `${errmsg} (${errcode})`;
}

/**
 * @param {Record<string, unknown>} data
 * @returns {boolean}
 */
function hasWechatUploadResult(data) {
  return typeof data.media_id === 'string' || typeof data.url === 'string';
}

export {
  formatWechatApiError,
  hasWechatUploadResult,
};
