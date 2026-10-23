---
name: project-release
description: Release workflow for obsidian-wechat-converter (version bump, release notes, tag and publish).
---

# Obsidian WeChat Converter Release Skill

发布新版本的完整流程。

## 版本号更新

发布新版本（如 `2.5.6` -> `2.6.0`）时，确保以下文件都已更新：

1. **`package.json`**: 更新 `"version": "..."`
2. **`manifest.json`**: 更新 `"version": "..."`
3. **`versions.json`**: 添加新版本映射，如 `"2.6.0": "0.15.0"`
4. **`README.md`**: 更新 Badge 中的版本号 `![Version](https://img.shields.io/badge/version-X.X.X-blue)`

> **提示**：插件设置面板的「关于」页面（`views/settings/about-tab.js`）会自动读取 `manifest.json` 中的 `version` 动态呈现标题版本号，无需手动修改代码。若本次发版包含新增赞助者，可顺带在 `services/sponsors-data.js` 中追加赞助鸣谢记录。

## 开发期门禁

在做 feature / enhancement 时，先跑快速自检：

```bash
npm run scan:guard
```

它用于尽早发现新的 Obsidian scan 风险模式，但不替代最终发布前检查。

## Release Notes

在 `RELEASE_NOTES/` 目录下创建对应版本的文件：

```
RELEASE_NOTES/v{version}.md
```

文件格式：
```markdown
---
title: 简短标题（会显示为 "v{version} - 标题"）
---

## 更新内容

### 🚀 重大更新
- ...

### 🐛 问题修复
- ...

### ✨ 功能优化
- ...
```

## 发布流程

### 情况 A：当前在 feature 分支

1. **准备阶段**（在 feature 分支完成）
   - 更新版本号文件
   - 创建 `RELEASE_NOTES/v{version}.md`
   - 先运行 `npm run scan:guard` 做快速自检
   - 确保 Obsidian scan readiness guard 通过：`npm run review:guard`

2. **合并 PR**
   - 将 feature 分支合并到 `main` 分支

3. **触发发布**
   ```bash
   git checkout main
   git pull
   git tag {version}
   git push origin {version}
   ```

### 情况 B：当前已在 main 分支

1. **准备阶段**
   - 更新版本号文件
   - 创建 `RELEASE_NOTES/v{version}.md`
   - 先运行 `npm run scan:guard` 做快速自检
   - 确保 Obsidian scan readiness guard 通过：`npm run review:guard`

2. **提交并触发发布**
   ```bash
   git add .
   git commit -m "chore: bump version to {version}"
   git push
   git tag {version}
   git push origin {version}
   ```

## 自动化流程

无论哪种情况，推送无前缀版本 tag 后 GitHub Actions 会自动执行：

- 校验 `versions.json` 与 `manifest.json.minAppVersion` 映射
- 校验 tag 与 `manifest.json.version` 一致，且不使用 `v` 前缀
- 运行 `npm run review:guard`，其中包含：
  - scan-risk guard
  - ESLint
  - 生产构建
  - generated build artifact 一致性检查
  - Vitest 全量测试
  - release zip 打包
  - release artifact 校验
- 创建 GitHub Release（从 release notes 文件读取内容）
- 上传 release 文件
- **同步安装资产到 Gitee Release**（`main.js` / `manifest.json` / `styles.css`，供国内无法访问 GitHub 的用户下载）

## 发版后验证 Gitee 镜像

GitHub Release 创建后，CI 会调用 Gitee OpenAPI 创建同名发行版并上传三个安装资产。
推送 tag 后约 1-2 分钟，用以下命令确认镜像侧产物齐全：

```bash
npm run release:verify-gitee <version>
# 例：npm run release:verify-gitee 2.12.1
```

预期输出：

```
tag      : 2.12.1
assets   : styles.css, main.js, manifest.json, 2.12.1.zip, 2.12.1.tar.gz
✅ 三个安装资产齐全
```

说明：

- Gitee 会自动为每个发行版生成 `<tag>.zip` / `<tag>.tar.gz` 源码包，它们**不算**安装资产，无需理会。
- 校验失败（exit 1）时，先去 GitHub Actions 的 `Sync release assets to Gitee` 步骤看日志；
  该步骤配置了 `continue-on-error: true`，即使失败也不会阻塞 GitHub 主发布流程。
- 若确认同步失败，可手动到 Gitee 发行版页补齐三个文件（从 GitHub Release 下载，SHA256 应与 GitHub 报告一致）。
- 未配置 `GITEE_TOKEN` secret 时，该同步步骤会打印 warning 并跳过，属预期行为。

## Obsidian 社区插件注意事项

- Git tag 必须与 `manifest.json.version` 完全一致，例如 `2.6.6`
- 不要使用 `v2.6.6` 这样的前缀 tag
- `RELEASE_NOTES` 文件仍然沿用 `RELEASE_NOTES/v{version}.md`
- GitHub Release assets 需要至少包含：
  - `main.js`
  - `manifest.json`
  - `styles.css`
- Gitee 镜像 Release 需包含**完全相同**的三个资产（同一份发布产物的副本）
- 如果 `scan:guard` 失败，不要直接进入 release 流程
