<!-- OPENPRD:GENERATED
adapter=cursor
source=command:repair
version=0.1.19
checksum=875ff2e627fd22b1
-->

# OpenPrd Repair

Use `openprd doctor .` to identify drift or missing generated files. Run `openprd update .` for generated guidance drift, repair standards/docs manually, then re-run verification.
Codex CLI runtime repair is explicit: use `openprd doctor . --tools codex --fix` or `openprd loop . --run --agent codex --repair-agent` only after the user accepts that OpenPrd will run `npm install -g @openai/codex@latest`.

Always follow the OpenPrd managed rules in `.cursor/rules/openprd.mdc` and project `AGENTS.md`.
