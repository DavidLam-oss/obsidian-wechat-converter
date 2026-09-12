<!-- OPENPRD:GENERATED
adapter=codex
source=command:ui-context
version=0.1.19
checksum=a751da41c00f03dc
-->

# OpenPrd UI Context

For new UI, structural interface changes, design systems, or Impeccable handoff, read `$openprd-ui-context` and run `openprd ui-context . --mode auto` before implementation.
Greenfield compiles a planned UI topology from confirmed PRD/review. Brownfield always starts with a deterministic local UI scan; when a current-session CodeGraph runtime is truly connected and the current project is indexed, run `openprd ui-context . --codegraph-plan`, query the plan, then import only the agent-attested, schema-validated structured summary with `--codegraph-evidence <file>`. Never present planned topology, a static marker, or another project's graph as existing-code facts.
After the user confirms one of three professional directions, run `openprd ui-context . --direction <1|2|3> --source user-confirmed`. The UI Context skill compiles PRODUCT.md/DESIGN.md and active design artifacts; the Host API owns evidence, confirmation, lint, and handoff state. Run `openprd ui-context . --check` before Impeccable.
Existing contract conflicts require `--contract-decision preserve|merge|refresh`; preserve remains blocked, while merge/refresh authorize Agent compilation without silent Host API overwrite. Lightweight local fixes use `--mode local-fix` only when frozen context already validates.

For interactive OpenPrd work, rebuild state from `.openprd/` before acting. In unattended automation, skip OpenPrd context/gates unless the task explicitly opts into OpenPrd.
