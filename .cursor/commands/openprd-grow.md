<!-- OPENPRD:GENERATED
adapter=cursor
source=command:grow
version=0.1.19
checksum=7960df76b5c81e7d
-->

# OpenPrd Grow

Treat grow as an end-of-task review layer, not an in-task interruption. Auto-apply whitelisted tool-recognition fixes such as detected code extensions; queue user preferences, project governance rules, and OpenPrd default behavior as candidates, then run `openprd grow . --review` at wrap-up for user confirmation.

Always follow the OpenPrd managed rules in `.cursor/rules/openprd.mdc` and project `AGENTS.md`.
