/*
## 核心功能

保留历史 ai section 导入兼容层，将调用委托到 views/settings/ai-tab.js。

## 输入

接收历史模块对 aiSettingsMethods 的导入。

## 输出

重新导出 `aiSettingsMethods`、`renderAiSettingsTab`、`showEditAiProviderModal`。

## 定位

位于 views/settings/，兼容旧接口。

## 维护规则

- 业务实现维护在 views/settings/ai-tab.js。
*/

export * from './ai-tab.js';
