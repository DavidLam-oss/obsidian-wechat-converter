# pictorial-theme-v1 quality evidence

## Scope

This evidence covers the OpenPrd change `pictorial-theme-v1` for the `图文志` article-output theme. It is a local Obsidian plugin rendering change: no remote service, production deployment, account-side data migration, or new telemetry sink was added.

## Traceability

- trace verified through OpenPrd work-unit `wu-20260801082036-8c0b7a6d`, review `v0002`, digest `b0ee0e4cb6a95cf7dd9631514aaae48c2e26ef7a2f4b11d048e5c99f3a332406`, change `pictorial-theme-v1`, and the task ledger `.openprd/changes/pictorial-theme-v1/tasks.md`.
- Local diagnostic chain uses git diff, OpenPrd task state, `.openprd/state/events.jsonl`, `.openprd/growth/events.jsonl`, and the task report `.openprd/harness/test-reports/pictorial-theme-v1.md`.
- The runtime traceability field contract for future production diagnostics is documented in `PRODUCT.md`: `trace_id`, `span_id`, `request_id`, `task_id`, `user_session_id`, and `error_id`.

## Redaction

- redaction boundary: this change records no WeChat token, cookie, account secret, credential, private user article body, production media id, or remote account log.
- Screenshots use deterministic local fixture media under `.openprd/harness/visual-reviews/pictorial-theme-v1/`; the fixture is not user content and is not a plugin asset.
- Test and quality evidence uses local paths, command names, theme IDs, generated HTML contracts, and timing summaries only; sensitive fields must be masked or omitted if future account-side diagnostics are added.

## Smoke and guard evidence

The following main flow / smoke and guard checks were executed for this change before commit preparation:

- `npm run generate:embedded`
- `npm test -- --run tests/theme_pictorial.test.js tests/obsidian_triplet_serializer_pictorial.test.js tests/custom_css_compiler.test.js tests/dependency_loader.test.js tests/view_settings_panel.test.js`
- `npm run build`
- `npm run check:build-artifacts`
- `npm run scan:guard`
- `VITEST_MAX_WORKERS=1 npm run review:guard`
- `git diff --check`
- `openprd dev-check . themes/apple-theme.js themes/apple-theme-colors.js themes/apple-theme-pictorial.js services/obsidian-triplet-serializer.js services/obsidian-triplet-serializer-pictorial.js tests/theme_pictorial.test.js tests/obsidian_triplet_serializer_pictorial.test.js tests/custom_css_compiler.test.js --change-scope structural`
- `openprd change . --validate --change pictorial-theme-v1`
- `openprd standards . --verify`

## Visual review

- visual-compare reference/actual artifact: `.openprd/harness/visual-reviews/pictorial-theme-v1/pictorial-reference-actual.jpg`
- visual-verification-board artifact: `.openprd/harness/visual-reviews/pictorial-theme-v1/pictorial-verification-board.jpg`
- visual-alignment-board artifact: `.openprd/harness/visual-reviews/pictorial-theme-v1/pictorial-alignment-board.jpg`
- The visual evidence verifies the Image Essay reference direction, current serializer output, three dynamic color cases, H1 centered opening, hero / regular image roles, and caption behavior.

## Normal performance

- performance evidence uses the existing native preview latency benchmark script `npm run measure:latency`.
- This theme adds a small deterministic serializer post-processing pass over simple `figure` nodes and dynamic color-role calculation; it does not add network calls, image uploads, timers, polling, or layout measurement loops.
- Dedicated local timing evidence is stored in `.openprd/quality/evidence/pictorial-theme-v1-performance.json` when the benchmark is rerun during commit preparation.

## Extreme performance

- extreme / large-data boundary: unmarked images remain regular; special media such as Mermaid, math images, image swipe, sensitive images, avatar figures, and complex multi-image figures are skipped instead of deeply rewritten.
- Existing large-data and parity fixtures remain part of the project evidence surface under `tests/fixtures/` and `tests/fixtures/parity/`.
- No production stress or WeChat account-side load test was run for this local theme change; real WeChat paste and draft sync validation remains a manual account-side acceptance item.
