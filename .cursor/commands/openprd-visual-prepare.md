<!-- OPENPRD:GENERATED
adapter=cursor
source=command:visual-prepare
version=0.1.19
checksum=6ba47bf172cc4e88
-->

# OpenPrd Visual Prepare

When one confirmed reference image contains multiple sub-images, grid cells, or objects, run `openprd visual-prepare . --reference <effect-image> --grid <columns>x<rows>` or `--boxes <plan.json>` before implementation comparison.
Treat newly generated images as candidate references until the user confirms they match expectations, should be used for later effect-image vs implementation comparison, and should drive implementation.
The command writes a deterministic reference-set under `.openprd/harness/visual-reviews/reference-sets/<id>/`, including `reference-set.json`, `crops/`, `contact-sheet.jpg`, `focus-board.template.json`, `parallel-board.template.json`, and `compare-plan.json`.
Use `--include <csv>` when the user only wants part of a grid or board to enter later acceptance, instead of blindly carrying the whole image forward.
Always open the generated contact sheet before proceeding, and reject any run where the numbering, crop boundaries, or object completeness look wrong.
After preparation, use `compare-plan.json` for per-item `openprd visual-compare --reference/--actual` commands, or edit the generated board templates when one whole screen needs local-region acceptance.

Always follow the OpenPrd managed rules in `.cursor/rules/openprd.mdc` and project `AGENTS.md`.
