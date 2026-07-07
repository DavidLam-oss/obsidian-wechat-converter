<!-- OPENPRD:GENERATED
adapter=cursor
source=command:fleet
version=0.1.19
checksum=b939020db456260f
-->

# OpenPrd Fleet

Audit or update historical projects. Start with `openprd fleet <root> --dry-run`; use `--sync-registry` to backfill the global workspace registry, `--backfill-work-units` for historical PRD identity binding, `--update-openprd` for projects that already have `.openprd/` or legacy root `openprd/changes|specs|archive/changes` artifacts, and reserve `--setup-missing` for explicitly selected projects.

Always follow the OpenPrd managed rules in `.cursor/rules/openprd.mdc` and project `AGENTS.md`.
