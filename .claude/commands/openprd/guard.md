<!-- OPENPRD:GENERATED
adapter=claude
source=command:guard
version=0.1.19
checksum=2a4eef733979989d
-->

# OpenPrd Guard

Before a high-risk action, verify the harness gates: `openprd standards . --verify`, `openprd validate .`, and when relevant `openprd change . --validate --change <id>`.

For interactive OpenPrd work, rebuild state from `.openprd/` before acting. In unattended automation, skip OpenPrd context/gates unless the task explicitly opts into OpenPrd.
