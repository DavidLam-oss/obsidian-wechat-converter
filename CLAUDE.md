# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
    - `lib/`: Helper libraries.
- **Build System**: `esbuild` via `esbuild.config.mjs`.
    - Bundles dependencies while externalizing Obsidian and CodeMirror packages.
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
