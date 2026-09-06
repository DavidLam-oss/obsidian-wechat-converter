[简体中文](https://github.com/DavidLam-oss/obsidian-wechat-converter/blob/main/README.md) | English

# Wechat Converter for Obsidian

Convert Obsidian Markdown into polished WeChat articles, WeChat image posts, Feishu cloud documents, and multi-platform publishing drafts from the same workflow. Wechat Converter now supports live preview, custom CSS, copy-to-editor, WeChat draft sync, Feishu cloud document sync, and beta multi-platform distribution through the Obsidian Publisher browser extension.

![Version](https://img.shields.io/badge/version-2.10.6-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.4.0+-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Chrome Companion](https://img.shields.io/badge/Chrome%20Companion-Obsidian%20Publisher%20%E2%80%A2%20Available-7c3aed)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Project-ff69b4?logo=github-sponsors)](#support)

This plugin is built for writers who publish from Obsidian to WeChat Official Accounts, Feishu cloud documents, and other Chinese content platforms. It focuses on the last mile of publishing: preserving layout, code blocks, math, images, and article metadata while keeping the workflow fast inside Obsidian.

> This project is deeply refactored from [ai-writing-plugins](https://github.com/Ceeon/ai-writing-plugins). Proper attribution is retained in this repository.

> ☕ **If this plugin saves you time formatting or publishing notes, consider [👉 buying the author a coffee](#support) to support ongoing development!**


## Big Update: Feishu Cloud Documents and Multi-platform Publishing

Wechat Converter is no longer limited to WeChat Official Accounts. From the same `Publish & Distribute` window, you can sync the current note to Feishu cloud documents or send it to platforms such as Zhihu, Juejin, CSDN, Yuque, Xiaohongshu, and other targets supported by Obsidian Publisher.

- **WeChat articles use the official API path**: Article draft sync keeps the plugin's AppID / AppSecret flow, including cover, excerpt, multi-account support, and account-level defaults.
- **WeChat image posts are a separate official content type**: Switch the converter to Image Post mode to collect up to 20 images from the note, frontmatter, local files, or the current Official Account material library, then arrange them and create an image-post draft.
- **Feishu uses the built-in OpenAPI path**: Feishu cloud document sync creates docx documents in your configured folder, then keeps the note linked for smart overwrite updates when possible.
- **Other platforms use the browser extension path**: Obsidian Publisher handles real browser sessions and saves drafts through the user's logged-in browser state, so Obsidian does not need to embed every platform login.
- **Choose the publishing target before sending**: Open the publishing modal, switch to `Feishu Cloud Docs` for Feishu sync, or switch to `Other platforms` to select browser-extension targets.
- **Lightweight status inside Obsidian**: Settings and publishing views show bridge connectivity, selected platforms, and last-known login hints. Final draft links, failures, and retries remain in the Obsidian Publisher task window.
- **Built for multi-channel creators**: Write once in Obsidian, sync to WeChat, archive or collaborate in Feishu, then push the same article into multiple platform draft boxes for final review and manual publishing.

> Multi-platform publishing is currently beta. Platform login state, draft creation, anti-abuse checks, result links, and retry behavior are handled by Obsidian Publisher. Obsidian focuses on writing, rendering, platform selection, and task delivery.
## Highlights

- Beta multi-platform publishing through the Obsidian Publisher browser extension.
- Live article preview with fast side-by-side rendering.
- Copy rich HTML directly into the WeChat editor.
- Sync articles to the WeChat draft box with multi-account support.
- Create WeChat image-post drafts with up to 20 ordered images, a title, and plain-text copy without rewriting the source Markdown.
- Add custom CSS directly in settings or load it from a Markdown / CSS note in the vault.
- Sync notes to Feishu cloud documents with smart overwrite updates, document rebinding, images, GIFs, callouts, math, and Mermaid handling.
- Account-level draft defaults for source URL and comment settings.
- Math rendering with SVG output for better WeChat compatibility.
- Mermaid diagrams rendered by Obsidian preview, then rasterized to PNG on export for WeChat-safe copy and sync.
- Local image handling for wiki links, relative paths, absolute paths, and GIFs.
- Swipeable image blocks for step screenshots, comparisons, split long images, and sensitive-image gates.
- Wide tables stay horizontally scrollable instead of being squeezed or clipped on mobile.
- Visual settings panel with theme, typography, preview, code block controls, and quote style options.
- Experimental AI layout planning with provider profiles, built-in layout families, schema checks, and debug snapshots.
- Chinese punctuation normalization for rendered output, with protection for code and technical tokens.

<p align="center">
  <img src="images/setting_panel_light.png" alt="Settings panel (light)" height="460" />
  <img src="images/setting_panel_dark.png" alt="Settings panel (dark)" height="460" />
</p>

## Recent Updates

- WeChat Image Post mode can collect images from article content, frontmatter, local uploads, and the Official Account material library. Reorder, remove, or restore up to 20 images, review the generated plain text, and sync the result as a separate WeChat image-post draft without changing the source note.
- Custom CSS can now be entered directly or loaded from a Markdown / CSS note in the vault. It applies to the standard preview, Copy to WeChat, and WeChat article drafts, while AI layout, image posts, and other-platform delivery remain isolated from it.
- Feishu cloud document publishing is now available from the publishing modal, with create/update flows, document rebinding, OpenAPI usage statistics, local/remote image upload, GIF support, and optional Kroki rendering for Mermaid diagrams.
- WeChat draft sync can now keep a note linked to the draft it created, so later syncs update the existing draft instead of creating a duplicate. The publishing modal also lets you unlink when you want to start fresh.
- Covers can now be selected from the WeChat permanent image material library, with cached material lists, a clearer picker loading state, and cover handoff to Obsidian Publisher for consistent multi-platform drafts.
- Markdown task list markers now render as WeChat-safe checkbox glyphs, including task markers that pass through cached AI layout output.
- Multi-platform publishing now lives in the publishing modal. Switch to `Other platforms` to send the rendered article to Obsidian Publisher, then let the browser extension save drafts on supported platforms such as Zhihu, Juejin, and CSDN.
- Obsidian Publisher bridge settings now include enablement, token verification, platform selection, connection testing, and optional login-status checks for selected platforms.
- AI layout planning now lives inside the converter workflow, with provider management, connection testing, built-in layout families, color palette switching, schema validation, and reusable debug snapshots.
- AI layout results can be reused per layout family, applied from cache, recolored without regenerating, and recovered after failed regeneration when a previous successful result exists.
- Mermaid diagrams keep the Obsidian preview experience, then switch to PNG automatically during copy and draft sync so WeChat does not strip or choke on large SVG payloads.
- Draft sync gained account-level publish defaults for supported WeChat fields, so each Official Account profile can keep its own source URL and comment preferences.
- Quote and callout styling now includes a neutral gray mode for calmer reading, plus semantic accents for common callout types such as `note`, `tip`, `warning`, and `danger`.

<span id="support"></span>
## ☕ Support & Sponsor

Wechat Converter will remain free and open source. If it streamlines your publishing workflow, you are welcome to buy the author a coffee to support continued maintenance!

Your support helps with:
- **WeChat ecosystem compatibility**: adapting to WeChat Official Account editor and draft API changes
- **Cross-platform distribution**: enhancing publishing to Feishu, Xiaohongshu, Zhihu, Bilibili, Toutiao, and more
- **Rendering perfection**: refining syntax highlighting, LaTeX math, Mermaid diagrams, and media formatting

<div align="center">
  <table>
    <tr>
      <td align="center" width="240">
        <img src="images/support-wechat.png" alt="WeChat Pay QR Code" width="180" /><br />
        <sub><b>WeChat Pay</b></sub>
      </td>
      <td align="center" width="240">
        <img src="images/support-alipay.jpg" alt="Alipay QR Code" width="180" /><br />
        <sub><b>Alipay</b></sub>
      </td>
    </tr>
  </table>
  <p><i>❤️ Thank you to every creator and supporter helping keep this project moving forward!</i></p>
</div>

## Usage

1. Open the plugin from the left ribbon icon or the command palette with `Open Wechat Converter`.
2. Edit your Markdown note as usual. The right panel updates the article preview in real time.
3. Click `Copy to WeChat` to paste rich HTML into the WeChat editor.
4. Optionally click `Sync to Draft` after configuring your WeChat AppID and AppSecret in plugin settings.
5. To create a WeChat image post, switch the converter from Article Layout mode to Image Post mode, arrange up to 20 images, review the title and plain-text copy, then sync it to the selected Official Account draft box.
6. To use custom CSS, open plugin settings -> `WeChat Official Account` -> `Custom CSS`, then enter CSS directly or select a Markdown / CSS note from the vault.
7. To publish to Feishu, enable Feishu sync in plugin settings, configure your Feishu app credentials and target folder token, then use `Publish & Distribute` -> `Feishu Cloud Docs`.
8. For beta multi-platform distribution, enable Obsidian Publisher distribution in plugin settings, connect the browser extension, then use `Publish & Distribute` -> `Other platforms` to send the article to selected platform draft boxes.

### WeChat image posts

- Switch the converter toolbar from Article Layout mode to Image Post mode. Image posts are kept separate from normal WeChat article drafts.
- Collect images from the current note, frontmatter, local uploads, or the current Official Account material library. A single image post supports up to 20 images.
- Reorder, remove, or restore images before publishing. These actions change only the image-post draft and never rewrite the source Markdown.
- Review the plain-text version of the note, title, copy-length hints, and selected account before syncing the image-post draft.

<table>
  <tr>
    <th align="center">Arrange images and publishing copy</th>
    <th align="center">Confirm the title, images, and account</th>
  </tr>
  <tr>
    <td align="center"><img src="images/wechat_image_post_editor.png" alt="WeChat Image Post mode for arranging images and publishing copy" height="440" /></td>
    <td align="center"><img src="images/wechat_image_post_publish.png" alt="WeChat Image Post publishing dialog" height="440" /></td>
  </tr>
</table>

### Custom CSS

- Open plugin settings -> `WeChat Official Account` -> `Custom CSS`.
- Enter CSS directly, or load a Markdown / CSS note from the vault. A Markdown style note may contain YAML frontmatter, plain CSS, or one or more fenced `css` blocks.
- Custom CSS applies to the standard preview, Copy to WeChat, and WeChat article draft sync.
- It intentionally does not apply to AI layout results, WeChat image posts, or other-platform publishing, which keep their own output rules.

### Feishu cloud document sync

- Configure Feishu sync from plugin settings with your Feishu app ID, app secret, target folder token, and optional user ID.
- Recommended permissions: grant the app identity all cloud document / cloud drive related permissions, and grant the user identity all permissions to avoid edge-case 403 errors during import, overwrite updates, image handling, and ownership transfer.
- First sync creates a docx document in the configured folder. Later syncs prefer updating the linked document so the Feishu URL can stay stable.
- If the Feishu-side document was moved, recreated, or your local cache points to an old token, paste the new docx URL in the Feishu tab to rebind the current note.
- Local paths, relative paths, WikiLinks, remote image URLs, and GIF files are supported. Mermaid diagrams can stay as source or be rendered through Kroki when you explicitly choose remote rendering.

<table>
  <tr>
    <th align="center">Feishu settings and API usage</th>
    <th align="center">Publish modal: Feishu Cloud Docs</th>
    <th align="center">Synced Feishu document</th>
  </tr>
  <tr>
    <td align="center"><img src="images/feishu_settings_tab.png" alt="Feishu sync settings tab" height="420" /></td>
    <td align="center"><img src="images/feishu_publish_modal.png" alt="Feishu publish modal" height="420" /></td>
    <td align="center"><img src="images/feishu_doc_result.png" alt="Synced Feishu cloud document" height="420" /></td>
  </tr>
</table>

### Horizontally scrollable content

#### Wide tables

Write normal Markdown tables. When a table has many columns or long cell content, the converter automatically wraps it in a horizontal scroll container for preview, copy, and draft sync:

```markdown
| Metric | Q1 | Q2 | Q3 | Q4 | Notes |
| --- | --- | --- | --- | --- | --- |
| Conversion rate | 12.4% | 15.8% | 18.1% | 21.6% | Keep the full table width |
```

#### Swipeable image blocks

Use Obsidian callout syntax to group multiple images into a swipeable horizontal block:

```markdown
> [!image-swipe] Swipe to view images
> ![[step-1.png]]
> ![[step-2.png]]
> ![Step 3](attachments/step-3.png)
```

For sensitive images, use `image-sensitive`. The first panel shows the warning, then readers can swipe to view the images:

```markdown
> [!image-sensitive] Sensitive images. Swipe to view.
> ![[image-1.png]]
> ![[image-2.png]]
```

You can also select multiple image lines, open the command palette (`Cmd/Ctrl + P`), and run `Insert image block` or `Insert sensitive image block`.

### Experimental AI layout planning

- Configure AI providers from the plugin settings page. The current UI supports OpenAI-compatible, Gemini-compatible, and Anthropic-compatible endpoints.
- Open `AI 编排` from the converter toolbar to generate layout suggestions for the current article.
- Choose from three built-in layout families: `Source-first`, `Tutorial cards`, and `Editorial lite`.
- Choose an automatic color recommendation or pick a specific palette before generation.
- Switch color palettes after generation to reuse the current layout structure without rerunning the full layout plan.
- Reopen cached results by layout family and apply them directly when the current article still matches the cached source.
- Review schema warnings, inspect layout JSON, or copy an AI debugging prompt before applying the result to preview.
- If regeneration fails, the last successful layout can still remain available instead of forcing you back to the plain preview immediately.

<table>
  <tr>
    <td align="center"><img src="images/AI.png" alt="AI layout panel before generation" height="400" /><br/><sub>1. Configure & Plan</sub></td>
    <td align="center"><img src="images/AI_completed.png" alt="AI layout panel with cached result" height="400" /><br/><sub>2. Generate & Cache</sub></td>
    <td align="center"><img src="images/AI_render.png" alt="AI layout applied to article preview" height="400" /><br/><sub>3. Apply to Preview</sub></td>
  </tr>
</table>

<p align="center">
  <img src="images/AI_setup.png" alt="AI layout settings" width="760" /><br/>
  <sub>Global AI layout settings (Providers & Cache management)</sub>
</p>

### Draft sync

- Supports up to 5 WeChat Official Account profiles.
- Each account can store draft defaults for `content_source_url`, comments, and fans-only comments.
- These defaults are intentionally limited to fields supported by the current WeChat draft flow.
- Uses `cover` and `excerpt` from frontmatter when available.
- Falls back to the first body image and auto-generated excerpt when not provided.
- Can optionally clean up a configured output directory after a successful sync.

### Mermaid export

- Mermaid diagrams rendered by Obsidian can stay visible in live preview.
- During copy and draft sync, Mermaid diagrams are rasterized to PNG so WeChat receives a safer export format.
- The export path tries to preserve the original Mermaid colors instead of applying math-specific SVG cleanup.

<p align="center">
  <img src="images/mermaid_render.png" alt="Mermaid diagram rendered in the converter preview" height="460" />
</p>

### Quote and callout styles

- Built-in themes now support a lighter quote style workflow, including a neutral gray mode for blockquotes.
- Callouts use semantic accent colors for common types such as `note`, `tip`, `warning`, and `danger`.
- Unknown callout types fall back to an info-style treatment instead of reusing the current theme color.

### Chinese punctuation normalization

The right-side settings panel includes `正文标点标准化`.

- Scope: preview, copy result, and draft sync output only.
- Does not modify the original Markdown file.
- Converts common ASCII punctuation into Chinese punctuation in Chinese writing context.
- Protects inline code, fenced code blocks, URLs, emails, file paths, CLI tokens, environment variables, math-like expressions, and other technical tokens.

### Cloudflare proxy

If WeChat API IP allowlisting is a problem in your network, you can use a Cloudflare Worker proxy. Detailed deployment steps and worker code are available in the Chinese guide:

- [Proxy setup in Chinese](./README.md#-代理设置解决-ip-白名单问题)

## Screenshots

<p align="center">
  <img src="images/phone_style.png" alt="Phone preview" height="420" />
  <img src="images/code_render.png" alt="Mac-style code block" height="420" />
</p>

## Who this is for

- Obsidian users publishing to WeChat Official Accounts
- Technical writers who need code, math, and image fidelity
- Chinese-language creators who want a faster publishing workflow

## Privacy and permissions

Wechat Converter does not include client-side telemetry and does not automatically upload your notes. Network access, local filesystem reads, and clipboard writes are used only when you explicitly run the related feature.

- **Network access and `fetch()` calls**: WeChat draft sync calls the official WeChat API, Feishu cloud document sync calls the Feishu Open Platform API, custom API proxy settings call the proxy URL you configure, AI layout calls the AI Provider you configure, and multi-platform delivery connects to the local companion browser extension service.
- **Local filesystem access**: The plugin reads local vault files only when processing images, covers, Mermaid exports, LaTeX exports, and other assets referenced by the current note.
- **Clipboard access**: Only an explicit copy action writes the current rendered article or debug information to the system clipboard. The plugin never reads the system clipboard or uploads clipboard contents. The copy button is not shown on mobile.
- **Third-party accounts**: WeChat sync requires your own AppID and AppSecret. Feishu sync requires your own Feishu app ID, app secret, target folder token, and optional user ID. Other platforms are handled by the companion browser extension using the login state already present in your browser.
- **Paid and companion features**: Core conversion, preview, copy, WeChat publishing, and Feishu cloud document publishing features are available in the plugin. Some optional Pro and companion-extension capabilities may require a paid license. Multi-platform publishing and Pro licensing are coordinated with Obsidian Publisher.

## Installation

### Method 1: Community Plugin Market (Recommended ⭐)

This is the easiest and safest way to install the plugin:
1. Open Obsidian **Settings** -> **Community plugins**.
2. Turn off **Safe mode** to enable community plugins.
3. Click **Browse** next to Community plugins.
4. Search for `Wechat converter`.
5. Click **Install**, and once completed, click **Enable**.

### Method 2: BRAT (Beta / Early Access)

If you want to experience the latest features and updates before they are officially released:
1. Install and enable the BRAT plugin.
2. Add the Beta repository in BRAT: `DavidLam-oss/obsidian-wechat-converter`.
3. Perform a quick smoke test after installation:
   - Open the converter panel
   - Check preview rendering
   - Copy once to WeChat
   - (Optional) Test draft sync

### Method 3: Manual Installation (GitHub Release)

If you cannot access the community plugin market:
1. Download the latest `obsidian-wechat-converter.zip` release bundle from [GitHub Releases](https://github.com/DavidLam-oss/obsidian-wechat-converter/releases).
2. Extract the archive into your vault under `.obsidian/plugins/obsidian-wechat-converter/`.
   > The final path must be: `.../.obsidian/plugins/obsidian-wechat-converter/`
3. Verify that the folder contains at least:
   - `main.js`
   - `manifest.json`
   - `styles.css`
4. Reload Obsidian and enable the plugin in settings.


## More docs

- Chinese documentation: [README.md](./README.md)
- Release notes: [RELEASE_NOTES](./RELEASE_NOTES/)

## License

MIT
