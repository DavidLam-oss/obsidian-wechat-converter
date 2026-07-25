<!-- OPENPRD:GENERATED
adapter=cursor
source=command:ui-context
version=0.1.19
checksum=a65e538e099307e8
-->

# OpenPrd UI Context

For new UI, structural interface changes, design systems, or Impeccable handoff, read `$openprd-ui-context` and run `openprd ui-context . --mode auto` before implementation.
Greenfield compiles a planned UI topology from confirmed PRD/review. Brownfield consumes optional CodeGraph facts plus deterministic local UI scans. Never present planned topology as CodeGraph or existing-code facts.
After the user confirms one of three professional directions, run `openprd ui-context . --direction <1|2|3> --source user-confirmed`. The UI Context skill compiles PRODUCT.md/DESIGN.md and active design artifacts; the Host API owns evidence, confirmation, lint, and handoff state. Run `openprd ui-context . --check` before Impeccable.
Existing contract conflicts require `--contract-decision preserve|merge|refresh`; preserve remains blocked, while merge/refresh authorize Agent compilation without silent Host API overwrite. Lightweight local fixes use `--mode local-fix` only when frozen context already validates.

Always follow the OpenPrd managed rules in `.cursor/rules/openprd.mdc` and project `AGENTS.md`.
