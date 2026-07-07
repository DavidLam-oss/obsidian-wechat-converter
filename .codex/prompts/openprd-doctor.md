<!-- OPENPRD:GENERATED
adapter=codex
source=command:doctor
version=0.1.19
checksum=5990bc01d5b4ab7d
-->

# OpenPrd Doctor

Run `openprd doctor .` and repair missing AGENTS, skills, commands, hooks, standards, validation gates, or Codex CLI runtime health.
For Codex CLI optional dependency failures, first inspect `openprd doctor . --tools codex`; only run `openprd doctor . --tools codex --fix` when the user explicitly wants OpenPrd to execute the global npm repair command.

For interactive OpenPrd work, rebuild state from `.openprd/` before acting. In unattended automation, skip OpenPrd context/gates unless the task explicitly opts into OpenPrd.
