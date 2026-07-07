/*
## 核心功能

实现微信公众号同步链路的 wechat api utils 服务能力。

## 输入

接收插件设置、账号凭证、文章 HTML、图片资源、frontmatter 元数据和微信 API 响应。

## 输出

输出 `formatWechatApiError`、`hasWechatUploadResult`，用于草稿创建/更新、素材上传、清洗、缓存或错误呈现。

## 定位

位于 services/，属于微信发布服务层；不直接操作设置页 DOM。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

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
