/*
## 核心功能

实现 Obsidian 插件视图层的 connection status bar 能力。

## 输入

接收 Obsidian ItemView/PluginSettingTab 生命周期、插件实例、用户事件和服务层结果。

## 输出

输出 `formatWechatsyncCheckedAt`、`describeWechatsyncConnectionState`、`renderWechatsyncConnectionStatusBar`，用于组装主视图、状态栏或共享视图方法。

## 定位

位于 views/，是 UI 编排层；复杂业务规则应委托 converter.js 或 services/。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// views/connection-status-bar.js
//
// Shared bridge connection status bar used by:
//   - 「其他平台」settings tab (variant: 'settings')
//   - 多平台发布弹窗     (variant: 'modal')
//
// Pure DOM rendering — no `this.*` / no plugin / no Obsidian Setting API.
// Caller is responsible for building the connection object (status,
// checkedAt, message) from `multiPlatformSync.connection`.
//
// Contract is locked by tests/connection_status_bar.test.js.

/**
 * @typedef {{ status?: string, checkedAt?: number | string | null, message?: string }} WechatsyncConnectionLike
 * @typedef {{ variant?: 'modal' | 'settings' }} WechatsyncStatusContext
 * @typedef {{ label?: string, disabled?: boolean, onClick?: (event: MouseEvent, button: HTMLButtonElement) => void }} WechatsyncActionLike
 * @typedef {HTMLElement & { createDiv: (options?: { cls?: string }) => HTMLElement & { createEl: WechatsyncCreateEl }, createEl: WechatsyncCreateEl }} WechatsyncParentElement
 * @typedef {(tagName: string, options?: { text?: string, cls?: string }) => HTMLElement} WechatsyncCreateEl
 */

/**
 * @param {unknown} timestamp
 * @returns {string | number | Date | null}
 */
function normalizeDateInput(timestamp) {
  if (typeof timestamp === 'string' || typeof timestamp === 'number' || timestamp instanceof Date) return timestamp;
  return null;
}

/**
 * @param {unknown} timestamp
 * @returns {string}
 */
export function formatWechatsyncCheckedAt(timestamp) {
  const normalizedTimestamp = normalizeDateInput(timestamp);
  if (!normalizedTimestamp) return '';
  try {
    return new Date(normalizedTimestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// Resolve `{ dotLabel, dotClass, text }` for a given bridge connection
// state. Centralized so both surfaces render identical wording for
// identical states. The two variants only differ in user-facing wording —
// they should never diverge on the dot color or class.
/**
 * @param {WechatsyncConnectionLike} [connection={}]
 * @param {WechatsyncStatusContext} [context={}]
 */
export function describeWechatsyncConnectionState(connection = {}, context = {}) {
  const { variant = 'modal' } = context;
  const checkedAtText = formatWechatsyncCheckedAt(connection.checkedAt);
  if (connection.status === 'connected') {
    if (variant === 'settings') {
      return {
        dotLabel: '已连接',
        dotClass: 'is-ok',
        text: connection.message
          || (checkedAtText
            ? `已连接浏览器插件。上次检查 ${checkedAtText}。`
            : '已连接浏览器插件。'),
      };
    }
    return {
      dotLabel: '已连接',
      dotClass: 'is-ok',
      text: checkedAtText
        ? `已连接。使用设置中 ${checkedAtText} 的所选平台配置，微信不会出现在这里。`
        : '已连接。勾选本次要发送的平台，微信不会出现在这里。',
    };
  }
  if (connection.status === 'failed') {
    return {
      dotLabel: '未连接',
      dotClass: 'is-error',
      text: variant === 'settings'
        ? `上次连接失败${connection.message ? `：${connection.message}` : ''}。请检查端口、令牌后点击「测试连接」。`
        : `上次连接失败${connection.message ? `：${connection.message}` : ''}。请先连接浏览器插件后再发布。`,
    };
  }
  return {
    dotLabel: '未测试',
    dotClass: '',
    text: variant === 'settings'
      ? '尚未测试与浏览器插件的连接。点击下方「测试连接」开始诊断。'
      : '尚未连接浏览器插件。平台列表先显示本地备用清单，连接后会读取插件实际支持的平台。',
  };
}

// Pure renderer for the bridge connection status bar. Returns the bar
// element and (optional) action button so the caller can flip disabled
// state during async work.
/**
 * @param {WechatsyncParentElement} parentEl
 * @param {{ dotLabel?: string, dotClass?: string, text?: string, action?: WechatsyncActionLike | null }} [options={}]
 */
export function renderWechatsyncConnectionStatusBar(parentEl, options = {}) {
  const {
    dotLabel = '',
    dotClass = '',
    text = '',
    action = null,
  } = options;
  const bar = parentEl.createDiv({ cls: 'wechat-multiplatform-status' });
  if (dotLabel) {
    bar.createEl('span', {
      text: dotLabel,
      cls: `wechat-multiplatform-status-dot ${dotClass}`.trim(),
    });
  }
  if (text) {
    bar.createEl('span', { text, cls: 'wechat-multiplatform-status-text' });
  }
  let actionButton = null;
  if (action && typeof action === 'object') {
    const clickTarget = action.onClick;
    /** @type {HTMLButtonElement} */
    const buttonEl = /** @type {HTMLButtonElement} */ (bar.createEl('button', {
      text: typeof action.label === 'string' && action.label ? action.label : '重试',
      cls: 'wechat-multiplatform-status-action',
    }));
    actionButton = buttonEl;
    if (action.disabled) actionButton.disabled = true;
    if (typeof clickTarget === 'function') {
      actionButton.addEventListener('click', (event) => {
        clickTarget(event, buttonEl);
      });
    }
  }
  return { bar, actionButton };
}
