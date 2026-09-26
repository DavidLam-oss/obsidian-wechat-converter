# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## Language Preferences
- Detect the language of the user's prompt (English or Chinese). Always reply in the same language unless explicitly asked otherwise.
- When drafting replies or documentation intended for Chinese audiences, ensure natural, native-level phrasing.

## Project Summary
- This is an Obsidian plugin that converts Markdown notes into WeChat Official Account article HTML.
- The core user workflow is: open the converter panel, preview the rendered article live, copy rich HTML into the WeChat editor, and optionally sync directly to the WeChat draft box.
- The plugin is aimed at creators who publish from Obsidian to WeChat and care about fidelity for headings, code blocks, math, callouts, tables, local images, and article metadata.

## Commands
- **Install dependencies**: `npm install`
- **Generate embedded runtime bundles**: `npm run generate:embedded`
- **Check embedded runtime bundles are up to date**: `npm run check:embedded`
- **Build for production**: `npm run build`
- **Start development watcher**: `npm run dev`
- **Run unit tests**: `npm test`
- **Run coverage**: `npm run test:coverage`
- **Run fast Obsidian scan-risk guard**: `npm run scan:guard`
- **Run Obsidian scan readiness guard**: `npm run review:guard`
- **Check generated build artifacts**: `npm run check:build-artifacts`
- **Release dry run**: `npm run release:dryrun`
- **Release validation**: `npm run release:validate`

## Testing Expectations
- This project still relies on manual visual testing for end-to-end rendering quality and WeChat paste/sync behavior.
- Use [TEST.md](/Users/davidlin/Documents/Obsidian/MyVault/.obsidian/plugins/obsidian-wechat-converter/TEST.md) for general rendering checks.
- Use [TEST_MATH.md](/Users/davidlin/Documents/Obsidian/MyVault/.obsidian/plugins/obsidian-wechat-converter/TEST_MATH.md) when touching formula rendering or math upload behavior.
- Use [OBSIDIAN_SCAN_CHECKLIST.md](/Users/davidlin/Documents/Obsidian/MyVault/.obsidian/plugins/obsidian-wechat-converter/OBSIDIAN_SCAN_CHECKLIST.md) before merging feature branches or preparing a release candidate.
- The repository also has a substantial Vitest suite under [tests](/Users/davidlin/Documents/Obsidian/MyVault/.obsidian/plugins/obsidian-wechat-converter/tests). For logic changes, especially around rendering, sanitization, path resolution, sync flow, or error handling, add or update unit tests unless the change is purely cosmetic.

## Architecture & Structure
- **Entry source**: `input.js`
  It contains plugin lifecycle, view wiring, settings UI, preview panel logic, and top-level sync actions.
- **Generated runtime artifact**: `main.js`
  Do not hand-edit `main.js`; rebuild from source instead.
- **Markdown conversion core**: `converter.js`
  Handles markdown-it based conversion, HTML sanitization, callouts, image rendering, code block rendering, and WeChat-friendly output shaping.
- **Theme system**: `themes/apple-theme.js`
  There is one theme module with three built-in presets exposed in the UI:
  - `github` -> `简约`
  - `wechat` -> `经典`
  - `serif` -> `优雅`
- **Service layer**: `services/`
  The codebase has evolved beyond a single converter file. Important modules include:
  - `render-pipeline.js`: creates the render pipeline used by the view.
  - `dependency-loader.js`: loads embedded runtime dependencies.
  - `native-renderer.js`: native rendering path.
  - `obsidian-triplet-renderer.js` and `obsidian-triplet-serializer.js`: renderer/serializer helpers used by the newer pipeline.
  - `markdown-source.js`: resolves the active markdown source.
  - `path-utils.js`: vault/path helpers.
  - `wechat-media.js`: image and math asset processing for WeChat.
  - `wechat-html-cleaner.js`: HTML cleanup for draft sync.
  - `wechat-sync.js` and `sync-context.js`: draft sync orchestration and user-facing sync messaging.
- **Generated embedded dependency snapshot**: `services/generated-embedded-deps.js`
  This is generated. If you change embedded runtime sources such as `converter.js` or `themes/apple-theme.js`, regenerate it before building or testing.
- **Math bundle**: `lib/mathjax-plugin.js`
  Built separately via `esbuild.math.mjs` and loaded dynamically.

## Current Product Behavior To Keep In Mind
- Live preview is a first-class feature; the plugin is expected to feel close to WYSIWYG for WeChat publishing.
- The plugin supports copy-to-editor and direct sync to WeChat drafts.
- WeChat draft sync supports multiple accounts, frontmatter-aware cover/excerpt defaults, optional cleanup of a configured output directory after successful sync, and optional proxying through a Cloudflare Worker.
- Local image handling is important: wiki links, relative paths, absolute paths, GIF handling, avatar uploads, and cover selection all matter.
- Chinese punctuation normalization only affects rendered output, copy output, and sync output. It must not mutate the source Markdown note.
- The codebase has moved to a `native-only` rendering direction; be careful around old legacy/parity switches and prefer current pipeline behavior.

## Development Notes
- **Runtime environment**: Obsidian plugin running in Electron / Node-style CommonJS.
- **Languages in repo**: mostly JavaScript plus `.mjs` build scripts and test helpers.
- **External dependencies**: `obsidian`, `electron`, and CodeMirror-related APIs are provided by the Obsidian app/runtime.
- **Security-sensitive areas**:
  - HTML sanitization
  - link validation
  - proxy URL validation
  - file/path cleanup after sync
- **Performance-sensitive areas**:
  - preview refresh
  - image processing
  - math conversion
  - WeChat upload concurrency and retry behavior

## Best Practices & Lessons Learned

### 1. Build Artifacts
- `input.js` is the source of truth for the plugin entry; rebuild after changing it.
- `main.js` and `services/generated-embedded-deps.js` are generated artifacts and should stay in sync with source edits.
- If you touch runtime code that is embedded or eval-loaded, always consider whether `npm run generate:embedded` is required before testing.
- Do not run file-writing build/generate/release commands in parallel with `git status`, `git diff`, or staging. Wait for the writer to finish, then inspect the final tree; otherwise generated artifacts such as `main.js` can appear as transient mid-build changes.

### 2. WeChat Compatibility
- WeChat strips `<style>` tags and most class-based styling. Rendered article output must remain robust with inline styles and self-contained markup.
- Math support is compatibility-sensitive. Complex formulas may need SVG/PNG processing paths depending on the sync target.
- Non-math SVG content such as diagrams should not be accidentally recolored or mangled by math-specific cleanup.
- Keep an eye on WeChat API quota and media-limit errors. The circuit-breaker behavior is intentional and user-protective.

### 3. Dynamic Loading
- Heavy or embedded features are loaded indirectly. Avoid assumptions that typical browser globals behave exactly like a normal webpage environment.
- When editing eval-loaded/global-exported code, preserve safe global export patterns and re-entrancy protections.

### 4. UX Consistency
- Preserve the fast live-preview workflow.
- Prefer Obsidian-native controls and simple layout techniques over brittle CSS tricks.
- Keep copy/sync behavior aligned with preview behavior as much as possible.
- For multi-document or multi-account workflows, preserve existing state management patterns unless there is a clear bug.

### 5. Quality Bar
- Add tests for core logic changes, especially regex-heavy transformations, sanitizer changes, sync failure handling, path cleanup rules, or rendering edge cases.
- When changing output HTML, consider both automated tests and manual visual verification because small markup changes can regress WeChat compatibility.
- Before merging feature work that could affect Obsidian review results, run `npm run review:guard`.
- CI/CD must use the same `npm run review:guard` gatekeeper so local, PR, and release checks stay aligned.
- Avoid introducing new scan-triggering APIs: prefer DOM helpers over `innerHTML`, `setCssStyles(...)` over static `element.style.*`, Obsidian `Modal` over `confirm()`, and local parsing over `fetch(data:)`.
- Avoid production `globalThis`; use `window` or `services/dom-utils.js` active-window helpers. Timers should use `window.setTimeout()` / `window.clearTimeout()`, and dynamic browser APIs should not be returned as `.call()` / `.bind()` wrappers.
- Avoid adding stylesheet `!important`; prefer stronger selectors, CSS variables, or narrow rendered-output compatibility styles covered by tests.
- If a scan-sensitive API is intentionally required for compatibility, keep the usage narrow, document the reason inline, and add regression tests around the behavior.
- During feature development, use `npm run scan:guard` for quick feedback before running the full `npm run review:guard`.

### 6. Modular Architecture
- Adhere to the refactored modular architecture. Do not pile rendering rules or core logic inside the entry file `input.js`.
- Keep the entry file `input.js` lightweight, focused only on plugin lifecycle, view wiring, settings UI, and top-level sync actions.
- Place markdown-it rules and conversion core in `converter.js`.
- Place styling rules in `themes/apple-theme.js`.
- Place preprocessing, path resolution, and cleaner logic in their respective modules under `services/`.

## Release
发布新版本时，使用 `/project-release` skill 查看完整流程。
