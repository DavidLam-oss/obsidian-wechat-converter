# 项目技术栈

## 运行环境

插件运行在 Obsidian 的 Electron / Node 风格 CommonJS 环境中，入口为 `main.js`。源码主要使用 JavaScript 和 `.mjs` 构建脚本，构建目标兼容 Obsidian 插件运行时。开发工具链依赖 Node.js、npm、esbuild、Vitest 和 ESLint。

## 核心依赖

- `obsidian`、`electron` 和 CodeMirror 相关 API 由 Obsidian 运行时提供。
- `markdown-it` 和相关插件负责 Markdown 解析与扩展渲染。
- `markdown-it-mathjax3` 与单独构建的 `lib/mathjax-plugin.js` 支撑数学公式。
- `highlight.js` 支撑代码高亮。
- `jsdom`、`vitest` 和测试 helper 支撑单元测试。
- 微信、飞书和浏览器扩展桥接依赖各自服务协议与本地配置，不作为 npm 运行时服务常驻。

## 工具链

- `npm run generate:embedded`: 生成嵌入式运行时依赖快照。
- `npm run generate:styles`: 生成 `styles.css`。
- `npm run dev`: 生成运行时并启动开发构建。
- `npm run build`: 生成生产构建。
- `npm test`: 运行 Vitest。
- `npm run scan:guard`: 运行 lint 与 Obsidian 扫描风险检查。
- `npm run review:guard`: 发布前综合门禁，包含扫描、样式、构建产物、测试、打包和发布校验。
- `openprd status/doctor/validate`: OpenPRD 工作区状态、接入诊断和结构校验。

## 维护规则

- 每次新增、移除或升级核心依赖、运行时和工具链后，必须检查并更新本文件。
