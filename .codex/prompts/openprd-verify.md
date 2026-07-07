<!-- OPENPRD:GENERATED
adapter=codex
source=command:verify
version=0.1.19
checksum=283ab302333a6af2
-->

# OpenPrd Verify

Run `openprd run . --verify`. It verifies standards, workspace validation, the currently focused change structure (not just the global active change), and active discovery state, then reports `taskReady` separately from `workspaceReady`. When `taskReady=true` and `workspaceReady=false`, final reporting must preserve that split; if the only attention gate is `feature-coverage`, describe it as task-ledger or evidence debt rather than a failed implementation.

For interactive OpenPrd work, rebuild state from `.openprd/` before acting. In unattended automation, skip OpenPrd context/gates unless the task explicitly opts into OpenPrd.
