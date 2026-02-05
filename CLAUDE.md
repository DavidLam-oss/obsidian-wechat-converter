# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Preferences
- Detect the language of the user's prompt (English or Chinese). Always reply in the same language unless explicitly asked otherwise.
- When drafting replies or documentation intended for Chinese audiences, ensure natural, native-level phrasing.

## Commands

- **Install Dependencies**: `npm install`
- **Build for Production**: `npm run build` (Minifies code, no sourcemaps)
- **Start Development Watcher**: `npm run dev` (Builds `main.js` and watches for changes)
- **Testing**: This project relies on manual visual testing.
    - Use `TEST.md` to verify rendering logic, style conversion, and WeChat compatibility.
    - Check the "Live Preview" pane in Obsidian to ensure "What You See Is What You Get".

## Architecture & Structure

- **Project Type**: Obsidian Plugin (Node.js environment within Electron).
- **Entry Point**: `input.js` is the source entry point, which bundles into `main.js`.
- **Core Components**:
    - `input.js`: Main plugin logic and lifecycle management.
    - `converter.js`: Handles Markdown to WeChat-compatible HTML conversion.
    - `styles.css`: Base plugin styles.
    - `themes/`: Contains specific visual themes (Simple, Classic, Elegant).
    - `lib/`: Helper libraries (including the dynamically loaded `mathjax-plugin.js`).
- **Build System**:
    - **Main Bundle**: `esbuild` via `esbuild.config.mjs` (Targets `main.js`).
    - **Math Bundle**: `esbuild` via `esbuild.math.mjs` (Targets `lib/mathjax-plugin.js`).
    - Targets `es2018` / CommonJS.
- **WeChat Integration**:
    - Supports syncing to WeChat Drafts.
    - Uses a proxy (e.g., Cloudflare Worker) to handle CORS and IP whitelisting for WeChat API calls (logic likely in `input.js` or `converter.js`).
    - Handles image processing: Local images are converted/uploaded; supports avatars and covers.

## Development Notes

- **Language**: JavaScript/TypeScript (mixed).
- **External Dependencies**: `obsidian`, `electron`, and `@codemirror/*` packages are peer dependencies provided by the Obsidian app.
- **UI/UX**: The plugin adds a ribbon icon and a command "Open Wechat Converter". It uses a side panel for live preview.
- **Image Handling**: Special attention is needed for local image paths (absolute/relative/WikiLink) and GIF handling (size limits).

## Best Practices & Lessons Learned (v2.1 Math Update)

### 1. Bundling & Dependencies
- **Avoid Dynamic Requires**: Libraries that use `require(path.join(__dirname, 'package.json'))` will crash in Obsidian. Use `esbuild`'s `define` to inject static versions or mock the file system if possible.
- **ESM vs CJS**: When bundling CJS libraries (like `markdown-it` plugins), be wary of default exports. Always check `module.default || module`.
- **Rebuild Requirement**: `input.js` is the source for `main.js`. **ANY change to `input.js` requires `npm run build` to take effect.** Restarting the plugin is not enough if you haven't rebuilt.

### 2. WeChat Compatibility
- **Zero-CSS Strategy**: WeChat strips `<style>` and class-based styling. All visual elements must be inline styles or self-contained SVGs.
- **MathJax Config**: For math formulas to work in WeChat, **MUST** use `svg: { fontCache: 'none' }`. This forces paths to be embedded in the SVG, preventing reliance on external font definitions which get stripped.
- **Assistive Text**: MathJax generates hidden `<mjx-assistive-mml>` for screen readers. WeChat strips the "hidden" CSS, making this text visible. **MUST** explicitly strip these tags before syncing.

### 3. Architecture (Dynamic Loading)
- **Separate Bundles**: Heavy features (like MathJax) are bundled separately (`lib/mathjax-plugin.js`) and loaded via `eval()` in `input.js` only when needed.
- **Global Scope**: When `eval`-ing code, do not assume `window` is available or writable in the same way. Use a safe global resolver (`const _global = typeof window ...`) to export functions from the dynamic bundle.
