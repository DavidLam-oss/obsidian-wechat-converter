<!-- OPENPRD:GENERATED
adapter=cursor
source=command:doctor
version=0.1.19
checksum=a1e5f45fa4d94d36
-->

# OpenPrd Doctor

Run `openprd doctor .` and repair missing AGENTS, skills, commands, hooks, standards, validation gates, or Codex CLI runtime health.
For Codex CLI optional dependency failures, first inspect `openprd doctor . --tools codex`; only run `openprd doctor . --tools codex --fix` when the user explicitly wants OpenPrd to execute the global npm repair command.

Always follow the OpenPrd managed rules in `.cursor/rules/openprd.mdc` and project `AGENTS.md`.
