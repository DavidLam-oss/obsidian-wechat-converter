<!-- OPENPRD:GENERATED
adapter=claude
source=command:run
version=0.1.19
checksum=c4e37994ea61a2eb
-->

# OpenPrd Run

Use the hook-stable OpenPrd execution loop for interactive OpenPrd work. In unattended automation (Codex automation, Claude Code headless, cron, scheduled, unattended task), skip OpenPrd context and gates unless the task explicitly opts into OpenPrd.
For interactive work, start with `openprd run . --context`, inspect the recommended `executionMode` / `parallelPlan`, execute the recommended task/discovery/workflow action, keep per-task verification task-scoped, and reserve `openprd run . --verify` for phase/final readiness or high-risk actions.
`run --context` includes `runtimeEnvironment` so the agent can see the active client, evidence, and platform capability packs before choosing Codex-, Claude Code-, or Cursor-specific paths.
When the user gives a historical session ID, task handle, work unit, or a clear requirement/task description, pass `--message <user-prompt>` so `run --context` resolves that explicit target before considering the global active change. Treat session IDs as tool-neutral; do not require or invent tool-specific ID syntax.

Intent gate: `openprd run . --context` is advisory. Execute mutating recommendations only when the current user message explicitly asks for development, implementation, task continuation, deep research/benchmarking, replication, or commit. Stay read-only for planning, analysis, review, explanation, and file-impact questions.

For interactive OpenPrd work, rebuild state from `.openprd/` before acting. In unattended automation, skip OpenPrd context/gates unless the task explicitly opts into OpenPrd.
