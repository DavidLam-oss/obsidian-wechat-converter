<!-- OPENPRD:GENERATED
adapter=claude
source=command:grow
version=0.1.19
checksum=1d37f70dd0831b45
-->

# OpenPrd Grow

Treat grow as an end-of-task review layer, not an in-task interruption. Auto-apply whitelisted tool-recognition fixes such as detected code extensions; queue user preferences, project governance rules, and OpenPrd default behavior as candidates, then run `openprd grow . --review` at wrap-up for user confirmation.

For interactive OpenPrd work, rebuild state from `.openprd/` before acting. In unattended automation, skip OpenPrd context/gates unless the task explicitly opts into OpenPrd.
