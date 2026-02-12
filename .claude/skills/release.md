# Obsidian WeChat Converter Release Skill

发布新版本的完整流程。

## 版本号更新

发布新版本（如 v2.5.6 -> v2.6.0）时，确保以下文件都已更新：

1. **`package.json`**: 更新 `"version": "..."`
2. **`manifest.json`**: 更新 `"version": "..."`
3. **`versions.json`**: 添加新版本映射，如 `"2.6.0": "0.15.0"`
4. **`README.md`**: 更新 Badge 中的版本号 `![Version](https://img.shields.io/badge/version-X.X.X-blue)`

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
   - 确保所有测试通过：`npm test`

2. **合并 PR**
   - 将 feature 分支合并到 `main` 分支

3. **触发发布**
   ```bash
   git checkout main
   git pull
   git tag v{version}
   git push --tags
   ```

### 情况 B：当前已在 main 分支

1. **准备阶段**
   - 更新版本号文件
   - 创建 `RELEASE_NOTES/v{version}.md`
   - 确保所有测试通过：`npm test`

2. **提交并触发发布**
   ```bash
   git add .
   git commit -m "chore: bump version to {version}"
   git push
   git tag v{version}
   git push --tags
   ```

## 自动化流程

无论哪种情况，`git push --tags` 后 GitHub Actions 会自动执行：

- 运行测试
- 构建项目
- 打 zip 文件
- 创建 GitHub Release（从 release notes 文件读取内容）
- 上传 release 文件
