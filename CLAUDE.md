# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Preferences
- Detect the language of the user's prompt (English or Chinese). Always reply in the same language unless explicitly asked otherwise.
- When drafting replies or documentation intended for Chinese audiences, ensure natural, native-level phrasing.

## Commands

- **Install Dependencies**: `npm install`
- **Build for Production**: `npm run build` (Generates runtime bundles + styles, minifies code, no sourcemaps)
- **Start Development Watcher**: `npm run dev` (Builds `main.js` and watches for changes)
- **Run Tests**: `npm test` (Vitest unit tests)
- **Run Single Test File**: `npm test -- path/to/test.test.js`
- **Test Coverage**: `npm test:coverage`
- **Linting**: `npm run lint`
- **Pre-release Checks**: `npm run review:guard` (Linting + tests + size checks + release validation)
- **Generate Runtime Bundles**: `npm run generate:runtime` (Runs before build, generates embedded deps and AI layout runtime)
- **Check Build Artifacts**: `npm run check:build-artifacts` (Validates generated files)

## Architecture & Structure

### Project Type
Obsidian Plugin (Node.js environment within Electron).

### Entry Point & Build System
- **Entry**: `input.js` (source) → `main.js` (built artifact, loaded by Obsidian)
- **Build**: esbuild via `esbuild.config.mjs`, targets `es2018` / CommonJS
- **Runtime Generation**: `scripts/generate-embedded-deps.mjs` and `scripts/build-ai-layout-runtime.mjs` run before build to generate dynamic bundles
- **ANY change to `input.js` requires `npm run build` to take effect.** Restarting the plugin alone is not enough.

### Core Modules (88 services, 19 views)

**Services Layer** (`services/`):
- **Article Conversion**: `converter.js` (Markdown → WeChat HTML, legacy monolith)
- **WeChat Integration**: `wechat-api.js`, `wechat-draft-sync.js`, `wechat-html-cleaner.js`, `wechat-image-upload.js`
- **Feishu Integration**: `feishu-api.js`, `feishu-block-sync.js`, `feishu-docx-sync.js`
- **Card Rendering System**: `card-*.js` (20+ modules for image card generation, pagination, capture, AI cover, session management)
- **AI Layout**: `ai-layout/` (layout generation, providers, settings), `ai-layout-runtime/` (pre-built bundles)
- **Image Processing**: `image-*.js` (compression, upload, path resolution, base64 encoding)
- **CSS & Styling**: `custom-css-*.js`, `themes/apple-theme.js`
- **Settings & State**: `plugin-settings.js`, `draft-cache.js`, `card-session.js`

**Views Layer** (`views/`):
- **Main Panel**: `apple-style-view.js` (sidebar converter panel, mode switching, settings UI)
- **Converter UI**: `views/converter/` (preview rendering, card/article/sticker modes, export, media pickers)
- **Publish Modal**: `views/publish-modal/` (WeChat/Feishu/multi-platform publishing UI)
- **Settings Tabs**: `views/settings/` (configuration panels for WeChat, Feishu, AI, advanced settings)
- **Shared Utilities**: `views/shared/` (state management, DOM helpers, view contracts)

### Multi-Output Architecture

The plugin supports **three distinct rendering modes**, each with its own output pipeline:

1. **Article Mode** (普通文章排版):
   - Preview: `views/converter/core.js` → `converter.js`
   - Copy: Inline styles via `custom-css-inliner.js`
   - WeChat Sync: `wechat-html-cleaner.js` → `wechat-draft-sync.js`
   - Custom CSS applies here

2. **Card Mode** (卡片模式):
   - Preview: `views/converter/card-preview.js` → card rendering pipeline (document → pagination → layout → capture)
   - Export: `services/card-exporter.js` (batch PNG export with manifest)
   - WeChat Sync: Not supported (export to local files only)
   - Custom CSS does NOT apply (uses card themes instead)

3. **Sticker Mode** (微信贴图):
   - UI: `views/converter/sticker-*.js` (image collection, ordering, caption editing)
   - Sync: `wechat-image-post-sync.js` (up to 20 images with title and caption)
   - Custom CSS does NOT apply

4. **AI Layout** (实验功能):
   - Generation: `ai-layout-skill-bundle.js` + `services/ai-layout/`
   - Output: Structured layout JSON → article rendering
   - Independent from other modes

### Path Resolution Function Parity
- **Constraint**: `converter.js` contains 4 path processing functions that must stay synchronized with `services/path-utils.js` and `services/image-source-utils.js`:
  - `collapsePathSegments()`
  - `getFileUrlLocalPath()`
  - `getVaultAdapterBasePath()`
  - `getVaultRelativePathFromLocalPath()`
- **Rationale**: `converter.js` is the historical core of article conversion and importing shared modules would break its boundary. Duplication is intentional but must be managed carefully.
- **Test Guard**: `tests/converter_path_utils_parity.test.js` verifies implementation parity with 36 test cases covering edge cases.
- **Maintenance Rule**: When modifying any path resolution logic:
  1. Update both `converter.js` AND the corresponding functions in `services/`
  2. Run `npm test` to ensure the parity test passes
  3. Update function-level comments in both locations
- **Do NOT**: Attempt to extract these functions into a shared module. The test guard is sufficient.

### Card Rendering Pipeline (Phase 1 Feature)

Image card generation follows a multi-stage pipeline with session-based state management:

1. **Document Phase** (`card-document.js`): Parse markdown → structured document units (headings, paragraphs, images, code blocks)
2. **Pagination Phase** (`card-pagination.js`): Fit units into pages with height constraints, handle orphan rules and oversized atomics
3. **Layout Phase** (`card-render-assembly.js`): Arrange units within each page with spacing, alignment, and cover positioning
4. **Capture Phase** (`card-render-engine.js`): Render DOM → screenshot (modern-screenshot library), serialize slot to prevent overlapping captures
5. **Export Phase** (`card-exporter.js`): Batch export with manifest, retry logic, remote cover inlining, pause/resume on manifest write failures

**Session Management** (`card-session.js`):
- One session per note (keyed by `sourcePath`)
- Stores: cover fields, card defaults, layout outcome, preview runner state
- Registry shared across view instances
- `resolveActiveCardSourceKey()` (from `card-media-picker-note.js`) is the single source of truth for identifying active note across async operations

**Async Safety** (Batch 3 fix):
- AI image generation, Unsplash selection, and AI topic extraction capture `sourcePathKey` at start
- On completion, compare `resolveActiveCardSourceKey(view)` against captured key
- If mismatch (user switched notes), write to origin session instead of active view to prevent cross-contamination

## Development Notes

- **Language**: JavaScript/TypeScript (mixed)
- **External Dependencies**: `obsidian`, `electron`, and `@codemirror/*` packages are peer dependencies provided by the Obsidian app
- **UI/UX**: The plugin adds a ribbon icon and a command "Open Wechat Converter". It uses a side panel for live preview.
- **Image Handling**: Special attention is needed for local image paths (absolute/relative/WikiLink) and GIF handling (size limits)

## Best Practices & Lessons Learned

### 1. Bundling & Dependencies
- **Avoid Dynamic Requires**: Libraries that use `require(path.join(__dirname, 'package.json'))` will crash in Obsidian. Use `esbuild`'s `define` to inject static versions or mock the file system if possible.
- **ESM vs CJS**: When bundling CJS libraries (like `markdown-it` plugins), be wary of default exports. Always check `module.default || module`.
- **Rebuild Requirement**: `input.js` is the source for `main.js`. **ANY change to `input.js` requires `npm run build` to take effect.** Restarting the plugin is not enough if you haven't rebuilt.

### 2. WeChat Compatibility
- **Zero-CSS Strategy**: WeChat strips `<style>` and class-based styling. All visual elements must be inline styles or self-contained SVGs.
- **List Rendering Dual-Pipeline** (critical for v2.11.0+ list fixes):
    - **Preview path**: `views/converter/core.js` → `deriveNativePreviewHtml()` → theme styles (`themes/apple-theme.js`) apply `padding-left` via `resolveListIndent(fontFamily)` shared constant
    - **Copy/Publish path**: `views/converter/clipboard.js` → `enhanceHtmlForWechatPublishing` → `applyCustomCss({target:'wechat-copy'})` → `services/wechat-html-cleaner.js` `cleanHtmlForDraft(html)` → **ul/ol → hanging-indent pseudo-paragraphs** (WeChat editor rewrites `<ul>/<li>` and breaks alignment; fake paragraphs with `padding-left: Npx; text-indent: -14px/-18px/-20px` + `<span>• </span>` markers defeat this)
    - Top-level `<ol>` preserved (native numbering); all `<ul>` and nested `<ol>` become pseudo-paragraphs (`if (!isUl && depth < 2) return;` at `wechat-html-cleaner.js:767`)
    - `LIST_INDENT` in `themes/apple-theme-config.js` (sans/serif 20px, monospace 32px) is the **single source of truth** consumed by both theme (enum name) and cleaner (font-family string) via `resolveListIndent()` / `resolveDraftListIndent()`
    - Test guard: `tests/wechat_html_cleaner_service.test.js` "预览（主题）与发布（清洗）对等宽列表使用同一缩进值"
- **Math Formula Strategy**:
    - **Upload as Image**: WeChat API has strict content length limits. Complex SVGs (MathJax) must be converted to PNGs and uploaded to WeChat servers to bypass this limit.
    - **Smart Recoloring**: MathJax formulas should be recolored (e.g., `#333333`) for better readability, but non-formula SVGs (e.g., Mermaid) must retain their original colors.
    - **MathJax 3→4 Compatibility**: Obsidian 1.14.4 upgraded to MathJax 4.1.3, which renamed `Loader.preLoad()` → `Loader.preLoaded()`. `scripts/generate-embedded-deps.mjs:118-139` sanitizes the bundled MathJax to call both names safely via runtime fallback, preventing plugin load failures on either version.
- **Circuit Breaker**: Implement fail-fast logic for API rate limits (`45009`) and quota limits (`45001`) to prevent wasted retries and poor UX.

### 3. Architecture (Dynamic Loading)
- **Separate Bundles**: Heavy features (like MathJax) are bundled separately (`lib/mathjax-plugin.js`) and loaded via `eval()` in `input.js` only when needed.
- **Global Scope**: When `eval`-ing code, do not assume `window` is available or writable in the same way. Use a safe global resolver (`const _global = typeof window ...`) to export functions from the dynamic bundle.

### 4. UI/UX & Styling
- **Native Components First**: Always prefer Obsidian's native UI components and browser-default styles (e.g., standard range inputs) over custom CSS hacks.
- **Vertical Alignment**: Avoid manually calculating margins for vertical centering (e.g., `margin-top: -8px`). Use flexbox or grid layouts where possible, or rely on standard form controls which are already optimized for the platform.
- **State Persistence**: For multi-document workflows, use in-memory maps (e.g., `Map<Path, State>`) to temporarily cache UI state (like cover images or toggle positions) per file. Clear this cache on plugin unload or view close to prevent memory leaks.

### 5. Engineering & Quality
- **Unit Testing**: Use `Vitest` + `jsdom`.
    - Mock Obsidian API (`requestUrl`, `Notice`) robustly using `vi.mock` factory functions or file-system mocks in CI.
    - **Always** add unit tests for new core logic (especially regex, data transformation, and error handling).
    - Use the `universal-guardrails` skill to maintain test infrastructure.
- **CI/CD**: Ensure CI environments (Node version) match toolchain requirements (e.g., Node 20+ for Vitest), even if the runtime target is lower (Node 16).

### 6. Modular Architecture
- Adhere to the refactored modular architecture. Do not pile rendering rules or core logic inside the entry file `input.js`.
- Keep the entry file `input.js` lightweight, focused only on plugin lifecycle, view wiring, settings UI, and top-level sync actions.
- Place markdown-it rules and conversion core in `converter.js`.
- Place styling rules in `themes/apple-theme.js`.
- Place preprocessing, path resolution, and cleaner logic in their respective modules under `services/`.

### 7. Constants as Single Source of Truth
- When the same validation logic appears in multiple places (e.g., valid cover modes, block tag whitelists), export a constant from one canonical location and import it everywhere.
- Example: `VALID_DEFAULT_CARD_COVER_MODES` in `services/card-cover-model.js` is used by both `normalizeAiSettings` and `deriveCoverFields`.
- This prevents silent regressions where one site is updated but others are missed.

### 8. Settings Persistence & Safety (ADR-5)
- **Empty-Read Protection** (`input.js:452`): When `loadSettings()` reads an existing `data.json` but gets empty content, the plugin enters `SAFE_MODE_LOCKED` and refuses all writes (`saveSettings` returns `{success:false, reason:'SAFE_MODE_LOCKED'}`). This prevents accidental whitening of user settings/credentials due to transient file system errors or plugin conflicts (e.g., MathJax loader issues on Obsidian 1.14.x).
- **Controlled `.bak` Snapshots** (`input.js:627`): Before any **structural change** (adding/removing top-level keys, array elements, nested objects), `saveSettings` writes `${dataPath}.bak` (Fail-Safe ADR-5). The "配置安全与受控快照" section in `views/settings/about-tab.js:113-125` shows a "从 .bak 快照恢复配置" button that calls `restoreFromBackup()` with safe-mode override.
- **Obsidian Sync Conflict Handling**: `onExternalSettingsChange()` reloads settings when Obsidian's sync writes `data.json` externally. Never skip this hook — conflicting writes from other devices can otherwise corrupt in-memory state.
- **Reference Stability**: Use `syncInPlace()` (from `views/shared/view-state-utils.js`) to update settings objects without breaking UI component references. It recursively merges new values into existing objects and preserves array element identities where possible (via `id` field or semantic keys like `name`/`key`/`title`). Never replace the root `plugin.settings` object; always sync in place via `setPluginSettings(plugin, newSettings)`.

### 9. Lint Rules & Architecture Enforcement
- **Custom ESLint Rules** (`.eslintrc.js` + `eslint-local-rules.js`):
    - `no-this-alias`: Prevents detaching methods from their receiver (e.g., `const fn = obj.method; fn()` loses `this`). Enforces `.call(receiver, ...)` or arrow wrappers. Guards against bugs like #81 (`vault.getResourcePath` called without `vault` as receiver → `Cannot read properties of undefined (reading 'adapter')`).
    - `no-console-disable`: Forbids inline `// eslint-disable-next-line no-console` — console statements must be removed, not silenced.
    - `no-unbalanced-eslint-disable`: Ensures every `eslint-disable` has a matching `eslint-enable` within 20 lines. Prevents runaway suppression.
    - `no-css-has`: Bans `:has()` pseudo-class (unsupported in Obsidian's Chromium version at plugin inception).
- **Frozen File Size Guard** (`scripts/check-file-size-baseline.mjs`):
    - Enforces 800-line soft limit on files in `frozen_files_size_baseline.json` (e.g., `services/wechat-html-cleaner.js`, `converter.js`).
    - `npm run check:build-artifacts` fails if any frozen file exceeds its baseline.
    - `npm run check:build-artifacts -- --update` can **only LOWER** bounds, add newly-qualifying files, or prune missing files — it **cannot raise** bounds. This prevents accidental bloat and enforces refactoring discipline.
    - Rationale: Legacy monoliths like `converter.js` are deliberately kept frozen at their current size to signal "do not pile more logic here; extract to services instead."

## Release

发布新版本时，使用 `/project-release` skill 查看完整流程。
