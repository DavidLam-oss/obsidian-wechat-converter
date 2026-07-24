/*
## 核心功能

实现浏览器发布助手桥接的 wechatsync constants 能力。

## 输入

接收多平台发布任务、浏览器扩展回传、平台设置和同步结果。

## 输出

输出 `DEFAULT_WECHATSYNC_PORT`、`DEFAULT_REQUEST_TIMEOUT_MS`、`DEFAULT_CONNECT_TIMEOUT_MS`、`DEFAULT_PLATFORM_REQUEST_TIMEOUT_MS`、`DEFAULT_SYNC_REQUEST_TIMEOUT_MS`、`DEFAULT_HELLO_TIMEOUT_MS`、`LOCAL_BIND_HOST`、`REMOTE_BIND_HOST`、`HELLO_ERROR_TOKEN_MISMATCH`、`HELLO_ERROR_INVALID_PAYLOAD`，用于桥接调用、结果归一化和平台状态展示。

## 定位

位于 services/，属于多平台桥接服务层；保持与发布弹窗 UI 解耦。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

export const DEFAULT_WECHATSYNC_PORT = 9527;
export const DEFAULT_REQUEST_TIMEOUT_MS = 360000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 60000;
export const DEFAULT_PLATFORM_REQUEST_TIMEOUT_MS = 60000;
export const DEFAULT_SYNC_REQUEST_TIMEOUT_MS = 180000;
export const DEFAULT_HELLO_TIMEOUT_MS = 30000;
export const LOCAL_BIND_HOST = '127.0.0.1';
export const REMOTE_BIND_HOST = '0.0.0.0';
export const HELLO_ERROR_TOKEN_MISMATCH = 'token_mismatch';
export const HELLO_ERROR_PAIRING_REQUIRED = 'pairing_required';
export const HELLO_ERROR_CREDENTIAL_MISMATCH = 'credential_mismatch';
export const HELLO_ERROR_INVALID_PAYLOAD = 'invalid_payload';
export const HELLO_ERROR_TIMEOUT = 'hello_timeout';
export const HELLO_ERROR_VERSION_UNSUPPORTED = 'version_unsupported';
export const HELLO_ERROR_DUPLICATE_SESSION = 'duplicate_session';
export const HELLO_ERROR_TOO_MANY_CLIENTS = 'too_many_clients';
export const DEFAULT_MAX_CLIENTS = 4;
// Pro license offline cache window. When the browser extension is not
// running, the Obsidian side keeps treating the user as Pro based on the
// persisted connectedClients[].license snapshot for this long since the
// last observedAt. Chosen as the extension's offline ceiling (7d validUntil
// + 1d grace = 8d) plus a 2d buffer, so the plugin cache never expires
// before a reconnect can self-correct the state. Disconnected Pro display
// gates no real capability (publishing requires a live bridge), so a
// generous window is safe.
export const PRO_LICENSE_STALENESS_MS = 10 * 24 * 60 * 60 * 1000;
