<!-- OPENPRD:GENERATED
adapter=cursor
source=command:verify
version=0.1.19
checksum=2a6012f8c176e9aa
-->

# OpenPrd Verify

Run `openprd run . --verify`. It verifies standards, workspace validation, the currently focused change structure (not just the global active change), and active discovery state, then reports `taskReady` separately from `workspaceReady`. When `taskReady=true` and `workspaceReady=false`, final reporting must preserve that split; if the only attention gate is `feature-coverage`, describe it as task-ledger or evidence debt rather than a failed implementation.

Always follow the OpenPrd managed rules in `.cursor/rules/openprd.mdc` and project `AGENTS.md`.
