# OpenPrd Frontend Design Assets

This folder gives agents a reusable design framework for frontend experience work.

It is not a gallery of references. It is the pre-build decision layer, aesthetic intent layer, and asset base.

## Structure

- `lenses/`: design decision lenses
- `themes/`: theme tokens and density rules
- `layouts/`: page skeletons
- `components/`: reusable structural components
- `recipes/`: task-type defaults
- `checklists/`: quality gates
- `anti-slop.md`: anti-template checks for generic AI-looking pages
- `assets/`: reusable surface and asset notes
- `templates/`: ready-to-adapt page starters
- `active/`: task-specific facts, assets, and selected direction files

## Blank Workspace Reminder

When the workspace is still empty, fill the active design contracts first, then pick the closest file in `templates/` and adapt it into the first runnable page entry such as `index.html`.

- Write the purpose, audience, aesthetic tone, constraints, and one memorable visual or interaction point before coding.
- If the page does not depend on external product facts, branded assets, or real images, write that down explicitly in the active design contracts instead of leaving them in `pending`.
- If the page theme and module scope are already clear, prefer passing them into `openprd design-starter` through `--brief` and `--sections` so the first real page and the active design contracts are created together.
- After the starter is created, the next move should be one patch that updates both the active design contracts and the entry file. Edit the generated entry file in place instead of deleting and recreating it, and do not keep circling through placeholder docs.
- Use `anti-slop.md` to avoid default purple gradients, generic font stacks, white-card grids, and decorative effects that do not serve the product context.
