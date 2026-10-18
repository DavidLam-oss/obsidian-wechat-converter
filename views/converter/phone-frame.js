/*
## 核心功能

构建转换器中仿真手机外壳（iOS 状态栏、灵动岛、微信导航栏、胶囊按钮、正文视口及底部 Home 指示条）。

## 输入

接收预览外层容器 `previewWrapper`。

## 输出

返回供渲染正文挂载的 `previewContainer`（`.apple-converter-preview`）。

## 定位

位于 views/converter/，专职处理仿真手机外壳的 DOM 结构装配。

## 依赖

关键依赖：Obsidian 元素 `createEl` 与 `createSvg` API。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * 挂载仿真手机外壳至预览容器
 * @param {HTMLElement & { createEl: Function, createSvg?: Function }} previewWrapper
 * @returns {HTMLElement} 供正文挂载的预览容器
 */
export function mountPhoneFrame(previewWrapper) {
  const phoneFrame = previewWrapper.createEl('div', { cls: 'apple-phone-frame' });

  // 1. 顶部 iOS 状态栏 (时间、灵动岛、网络与电量)
  const statusBar = phoneFrame.createEl('div', { cls: 'apple-phone-status-bar' });
  statusBar.createEl('span', { cls: 'apple-status-time', text: '9:41' });
  statusBar.createEl('div', { cls: 'apple-status-island' });
  const statusIcons = statusBar.createEl('div', { cls: 'apple-status-icons' });

  // 信号图标 (4格阶梯)
  const signal = statusIcons.createEl('span', { cls: 'apple-status-signal' });
  signal.createEl('span');
  signal.createEl('span');
  signal.createEl('span');
  signal.createEl('span');

  // Wi-Fi 图标 (安全创建 SVG，环境兼容回退)
  if (typeof statusIcons.createSvg === 'function') {
    const wifiSvg = statusIcons.createSvg('svg', {
      cls: 'apple-status-wifi',
      attr: { viewBox: '0 0 16 12', width: '12', height: '9', fill: 'currentColor' }
    });
    wifiSvg.createSvg('path', {
      attr: {
        d: 'M8 9.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm4.24-4.24a6 6 0 0 0-8.48 0 .75.75 0 0 1-1.06-1.06 7.5 7.5 0 0 1 10.6 0 .75.75 0 0 1-1.06 1.06zm-2.12 2.12a3 3 0 0 0-4.24 0 .75.75 0 1 1-1.06-1.06 4.5 4.5 0 0 1 6.36 0 .75.75 0 1 1-1.06 1.06z'
      }
    });
  }

  // 电池图标 (带电量格与电极)
  const battery = statusIcons.createEl('div', { cls: 'apple-status-battery' });
  battery.createEl('div', { cls: 'apple-status-battery-level' });

  // 2. 顶部微信导航栏与胶囊
  const header = phoneFrame.createEl('div', { cls: 'apple-phone-header' });
  header.createEl('span', { cls: 'title', text: '公众号预览' });
  const capsule = header.createEl('div', { cls: 'apple-phone-capsule' });
  capsule.createEl('span', { cls: 'dots', text: '•••' });
  capsule.createEl('span', { cls: 'divider' });
  capsule.createEl('span', { cls: 'circle' });

  // 3. 内容区域 (挂载到手机框内)
  const previewContainer = phoneFrame.createEl('div', {
    cls: 'apple-converter-preview',
  });

  // 4. 底部 Home Indicator
  phoneFrame.createEl('div', { cls: 'apple-home-indicator' });

  return previewContainer;
}
