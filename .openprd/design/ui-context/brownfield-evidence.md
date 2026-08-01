# Brownfield UI Evidence

- source: project-derived
- CodeGraph: unavailable-or-unverified（可选输入）
- UI implementation files: 39
- style files: 17
- asset files: 24

## CodeGraph Query Checklist

- routes and entry points
- component ownership and reuse
- state and data dependencies
- call/dependency paths and blast radius
- unresolved or dynamically discovered edges

## Deterministic Local Scan

- UI: server/app.js
- UI: views/apple-style-view-shared.js
- UI: views/apple-style-view.js
- UI: views/connection-status-bar.js
- UI: views/converter/ai-layout-debug.js
- UI: views/converter/ai-layout-panel.js
- UI: views/converter/clipboard.js
- UI: views/converter/core.js
- UI: views/converter/panel-shell.js
- UI: views/converter/settings-panel.js
- UI: views/converter/sticker-preview.js
- UI: views/publish-modal/feishu.js
- UI: views/publish-modal/material-picker.js
- UI: views/publish-modal/multi-platform-cover-assets.js
- UI: views/publish-modal/multi-platform-data.js
- UI: views/publish-modal/multi-platform-modal-ui.js
- UI: views/publish-modal/multi-platform-policy.js
- UI: views/publish-modal/multi-platform.js
- UI: views/publish-modal/publish-context.js
- UI: views/publish-modal/sticker-publish-content.js
- UI: views/publish-modal/wechat-account-state.js
- UI: views/publish-modal/wechat-modal-shell.js
- UI: views/publish-modal/wechat-multiplatform-actions.js
- UI: views/publish-modal/wechat-preview-export.js
- UI: views/publish-modal/wechat-sync-action.js
- UI: views/publish-modal/wechat-sync-modal.js
- UI: views/publish-modal/wechat.js
- UI: views/settings/ai-section.js
- UI: views/settings/apple-style-setting-tab.js
- UI: views/settings/confirm-modal.js
- UI: views/settings/feishu-tab.js
- UI: views/settings/multi-platform-tab.js
- UI: views/settings/settings-tab-shell.js
- UI: views/settings/wechat-account-modal.js
- UI: views/settings/wechat-tab.js
- UI: views/shared/sticker-image-list.js
- UI: views/shared/view-constants.js
- UI: views/shared/view-dom-helpers.js
- UI: views/shared/view-state-utils.js
- style: styles/ai-layout.css
- style: styles/base.css
- style: styles/feishu.css
- style: styles/material-picker.css
- style: styles/multi-platform.css
- style: styles/preview.css
- style: styles/settings-base.css
- style: styles/settings-tabs.css
- style: styles/sticker-preview.css
- style: styles/sticker-publish.css
- style: styles/sticker-settings.css
- style: styles/style-controls.css
- style: styles/style-panel.css
- style: styles/toolbar.css
- style: styles/wechat-publish.css
- style: styles/wechat-settings.css
- style: styles.css
- asset: images/AI.png
- asset: images/AI_completed.png
- asset: images/AI_render.png
- asset: images/AI_setup.png
- asset: images/code_render.png
- asset: images/feishu_doc_result.png
- asset: images/feishu_publish_modal.png
- asset: images/feishu_settings_tab.png
- asset: images/icon-source.png
- asset: images/icon.png
- asset: images/math_render.png
- asset: images/mermaid_render.png
- asset: images/multiplatform_extension_setup.png
- asset: images/multiplatform_platform_list.png
- asset: images/multiplatform_publish_modal.png
- asset: images/multiplatform_task_center.png
- asset: images/origion_style.png
- asset: images/phone_style.png
- asset: images/plugin_setup.png
- asset: images/setting_panel_dark.png
- asset: images/setting_panel_light.png
- asset: images/support-alipay.jpg
- asset: images/support-wechat.png
- asset: images/wechat_sync_popup.png

CodeGraph 未发现或未验证；继续使用本地扫描，并把图关系缺口保留为 evidence-gap。

## 图文志本地调用图

以下链路来自当前源码的确定性本地扫描，不冒充 CodeGraph 查询结果：

```text
views/converter/settings-panel.js:getThemeList()
  -> views/converter/core.js:onThemeChange() / onColorChange()
  -> services/dependency-loader.js:buildRenderRuntime()
  -> themes/apple-theme.js:AppleTheme
  -> services/obsidian-triplet-serializer.js:serializeObsidianRenderedHtml()
  -> services/obsidian-triplet-serializer-images.js:convertStandaloneImages()
  -> applyThemeInlineStyles()
  -> 图文志图片后处理
  -> final prune / preview / copy / draft sync
```

- 调整范围：主题注册、动态颜色角色、标签级内联样式与普通 figure 的后处理。
- 不调整范围：Markdown 源文件、主题选择器交互模型、图片轮播、敏感图片、数学、Mermaid、Callout 与自定义 CSS 的后置覆盖顺序。
- evidence-gap: codegraph-unavailable。
