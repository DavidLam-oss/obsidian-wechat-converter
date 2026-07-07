<!-- OPENPRD:GENERATED
adapter=codex
source=command:fleet
version=0.1.19
checksum=c5f60f240cd768ef
-->

# OpenPrd Fleet

Audit or update historical projects. Start with `openprd fleet <root> --dry-run`; use `--sync-registry` to backfill the global workspace registry, `--backfill-work-units` for historical PRD identity binding, `--update-openprd` for projects that already have `.openprd/` or legacy root `openprd/changes|specs|archive/changes` artifacts, and reserve `--setup-missing` for explicitly selected projects.

For interactive OpenPrd work, rebuild state from `.openprd/` before acting. In unattended automation, skip OpenPrd context/gates unless the task explicitly opts into OpenPrd.
