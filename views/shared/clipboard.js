/*
## 核心功能

提供「写入系统剪贴板」的唯一入口（纯文本），供设置页、卡片导出弹窗、AI 调试面板、
飞书发布弹窗等视图共用。

## 输入

接收要复制的纯文本字符串。

## 输出

输出 `writeClipboardText(text)` → `Promise<boolean>`：写入成功返回 `true`；
运行环境不支持（无 `navigator.clipboard.writeText`）或权限被拒返回 `false`。

## 定位

位于 views/shared/，是跨视图共享的浏览器能力封装：不持有视图状态、不弹提示、
不决定「复制成功」的文案——那些由调用方按自身语境决定。

## 依赖

关键依赖：运行时提供的 `navigator.clipboard.writeText`（Obsidian / Electron）。

## 维护规则

- **只写不读**：本文件与全仓库都不得出现 `clipboard.read` / `clipboard.readText`。
  读取系统剪贴板属隐私敏感能力，Obsidian 市场扫描会给出 `Clipboard Access` 提示
  （见 OBSIDIAN_SCAN_CHECKLIST.md「Known accepted residual」）。两道守卫强制该约束：
  `scripts/check-scan-risk-patterns.mjs` 的 `no-clipboard-read`（全部源码）与
  `scripts/release-validate.mjs` 的 `CLIPBOARD_READ_PATTERN`（构建产物）。
- 所有「复制纯文本」功能一律调用本模块，不要在视图里各写一份
  `navigator.clipboard` 可用性判断（历史上曾有 5 处重复实现）。
- 富文本复制（`text/html` + `ClipboardItem`）走 `views/converter/clipboard.js`，
  与纯文本不是同一套 API，故未并入本模块。
- 修改逻辑后同步更新本文件说明书、views/shared 的文件夹 README（若列出模块），
  以及 tests/clipboard_shared.test.js。
*/

/**
 * 写入纯文本到系统剪贴板。调用方必须由用户操作触发（点击按钮等）。
 * 不支持或失败时返回 false，不抛异常——由调用方决定如何提示，避免谎报成功。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function writeClipboardText(text) {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    if (clipboard && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限或运行环境不支持：交给调用方保持原样
  }
  return false;
}
