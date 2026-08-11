# 贡献指南

感谢你愿意帮助改进 WeChat Converter。

## 开发准备

```bash
npm install
npm run build
npm test -- --run
```

## 提交变更前

请尽量保持变更范围清晰，并在提交前运行：

```bash
npm run build
npm test -- --run
npm run release:dryrun
```

如果只修改文档，可以说明未运行完整测试的原因。

## Issue 与 Pull Request

- 报告问题时，请附上 Obsidian 版本、插件版本、操作系统、复现步骤和必要截图。
- 涉及微信公众号 API 的问题，请不要公开提交 AppID、AppSecret、access token 或草稿内容。
- 涉及多平台发布的问题，请说明浏览器插件版本、目标平台、连接状态和错误提示。
- Pull Request 应尽量小步提交，避免同时修改无关功能。

## 兼容性原则

- 不破坏现有公众号排版、复制、同步草稿箱流程。
- 不破坏多平台发布的「选择平台 → 发送到浏览器插件」流程。
- 涉及样式修改时，需要手动检查设置页、预览区、发布弹窗和多平台设置页。
- 涉及网络、剪贴板或文件访问时，需要同步更新 README 的权限说明。
