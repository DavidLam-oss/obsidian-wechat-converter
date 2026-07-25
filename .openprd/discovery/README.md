# OpenPrd 持续发现

本目录保存 OpenPrd 持续发现状态。

## 文件

- `control.json` 记录当前循环状态和迭代预算。
- `coverage-matrix.json` 记录仍需沉淀到 OpenPrd specs 和 tasks 的覆盖项。
- `claims.jsonl` 记录有证据支撑的需求声明。
- `open-questions.md` 保持用户或产品开放问题可见。
- `iterations.jsonl` 记录每一轮循环。

## 任务拆分

- `tasks.md` 保持为第一个任务入口。
- 长变更继续使用 `tasks-002.md`、`tasks-003.md` 等文件。
- 每个非最终任务文件的最后一个 checkbox 必须交接到下一个文件。
- 项目可以通过 `.openprd/discovery/config.json` 的 `taskSharding.maxItemsPerFile` 覆盖单文件任务上限。
- 结构化任务只使用稳定任务 id 下的 `deps`、`done` 和 `verify` 元数据。

```md
- [ ] T009.07 迁移历史数据库导入预览
  - deps: T001.14, T007.06
  - done: 预览展示数量、冲突、跳过项和警告
  - verify: npm run test -- migration
```

- 没有依赖时省略 `deps`。
