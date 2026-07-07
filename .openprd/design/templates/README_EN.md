# Frontend Starter Templates

These templates are not final deliverables. They are the first runnable skeleton for blank frontend workspaces.

## Order

1. Fill the task-specific contracts under `active/`
2. Write the page purpose, audience, aesthetic tone, constraints, and one memorable point
3. Pick the closest starter template here
4. Run `openprd design-starter . --starter <starter-id> --out index.html`
5. Then adapt it using the selected `lens + theme + layout + component set + aesthetic intent`

## Included Starters

- `content-home.html`
- `product-launch.html`
- `ops-dashboard.html`

## Starter Defaults

- `content-home.html`: `editorial-contrast` + `warm-editorial` + `story-map`
- `product-launch.html`: `product-launch` + `deep-launch` + `product-spec-runway`
- `ops-dashboard.html`: `operational-density` + `tool-neutral` + `ops-density-grid`

## Defaults

- Prefer `openprd design-starter` over rebuilding the first skeleton from an empty page
- If the page theme and module scope are already clear, prefer `openprd design-starter ... --brief ... --sections ...` so the first page and the active contracts are created together
- If the page does not depend on external product facts, branded assets, or real images, write those contracts as explicit no-dependency decisions instead of leaving them in `pending`
- After `design-starter`, replace the generated placeholder copy and title in the entry file before rereading the whole template
- After `design-starter`, the default next move is one patch that updates both the entry file and the active design contracts; edit the generated entry file in place instead of deleting and recreating it
- Start with structure and copy before decoration
- Before styling, check `anti-slop.md`: avoid default purple gradients, generic font stacks, white-card grids, and one-size-fits-all templates
- Starter typography, color, and motion are starting points; change them in Patch Mode when they do not serve the selected aesthetic intent
