<!-- OPENPRD:GENERATED
adapter=codex
source=command:loop
version=0.1.19
checksum=5d91b5eb4bf9de14
-->

# OpenPrd Loop

使用长程 agent harness 做开发落地。

1. Run `openprd loop . --init` once for the workspace.
2. Run `openprd loop . --plan --change <id>` to build the feature list from structured change tasks.
3. Run `openprd loop . --next` to inspect the next dependency-ready task.
4. Run `openprd loop . --run --agent codex --dry-run` or `openprd loop . --run --agent claude --dry-run` to prepare one fresh single-task session.
5. For real Codex runs, OpenPrd preflights `codex --version` before launching the child session. If a Codex optional dependency is missing, diagnose it with `openprd doctor . --tools codex`; only use `openprd loop . --run --agent codex --repair-agent` when the user explicitly approves the global npm repair.
6. Only run `openprd loop . --run` when the current user message explicitly asks to execute development, continue a task, or perform deep research/benchmarking.
7. 每个任务都必须先自测；前端界面任务在 Codex 桌面优先用 Computer Use，在 CLI/Claude Code 优先用 Playwright 或 MCP 自动化。
8. After the session completes, run `openprd loop . --finish --item <task-id> --commit` only when commit is explicitly part of the requested execution.

Do not continue into the next task inside the same agent session.

For interactive OpenPrd work, rebuild state from `.openprd/` before acting. In unattended automation, skip OpenPrd context/gates unless the task explicitly opts into OpenPrd.
