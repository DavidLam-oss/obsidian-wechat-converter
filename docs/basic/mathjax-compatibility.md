# MathJax 宿主兼容性修复

## 根因与执行路径

基于上游提交 `3fef6122d07f405cc4459102d0545551c7bc50bb`，锁定依赖为
`markdown-it-mathjax3@4.3.2` → `mathjax-full@3.2.1`。

启动模块依赖路径为 `input.js` → `views/apple-style-view.js` →
`views/converter/core.js` → `services/dependency-loader.js` →
静态导入 `lib/mathjax-plugin.js`。后者由 `lib/math-entry.js` 构建，
导入 `markdown-it-mathjax3/index.js`，进而导入
`mathjax-full/js/input/tex/AllPackages.js`。

`AllPackages.js:37–39` 的模块级副作用读取自由变量 `MathJax`，
只检查 `MathJax.loader` 是否存在，随后调用 `MathJax.loader.preLoad(...)`。
Obsidian 1.14.4 提供 MathJax 4.1.3，其 loader 只有 `preLoaded`，
所以插件在模块求值阶段抛错，尚未进入插件 `onload()` 或数学注册函数的
`try/catch`。旧 MathJax 3 宿主虽然不抛错，也会被这个副作用注册组件。

## 最小修复

`scripts/math-bundle-options.mjs` 为数学 bundle 增加外层函数作用域：
`const MathJax = undefined` 阻止 `AllPackages` 访问宿主，
`const global = {}` 隔离依赖中 `components/global.js` 的 Node 全局引用。
两条构建入口（独立 `esbuild.math.mjs` 与嵌入生成脚本）共用这份配置。
外层作用域也在主 bundle 二次打包时保留隔离关系。

保留现有独立 TeX/SVG 渲染实例、markdown-it 规则、已打包的 TeX 扩展与
SVG 字形路径，`fontCache: 'none'` 继续生成可单独导出的 SVG。
没有替换、临时覆盖或扩展宿主 `window.MathJax`，没有引入 CDN 或新增依赖。
`main.js` 和嵌入快照全部从源码重新生成。

宿主 MathJax 4 可以在后台异步渲染或加载字体分片。插件不调用宿主的
同步/异步渲染 API、不等待或改写宿主 startup promise，继续使用已打包的
MathJax 3 SVG 数据，因此保持现有同步 markdown-it 接口和离线导出能力。
参考：[MathJax 4 异步渲染与字体加载](https://docs.mathjax.org/en/latest/web/typeset.html)。

## 验证证据

- 修复前，新回归测试重现 `TypeError: MathJax.loader.preLoad is not a function`；
  MathJax 3 用例同时捕获了意外调用宿主 loader 的行为。
- 全量 Vitest：108 个测试文件，1176 项通过，0 项失败。
- 新增 7 项集成回归覆盖无 MathJax、MathJax 3.2.2、MathJax 4.1.3、
  尚未完成的宿主异步渲染、独立 Electron global、重复加载、实际生成的
  数学 bundle 与生产主 bundle。宿主 API 为冻结对象和调用 spy；并非旧版
  Obsidian 客户端端到端测试。
- 真实 Obsidian 1.14.4 客户端在独立 profile/vault 中执行插件生命周期。
  在宿主 MathJax 4.1.3 已加载后卸载/重载插件、打开转换面板、转换公式：
  插件启动成功，2 个 SVG、15 条字形路径；宿主 MathJax、loader、config、
  startup promise 保持不变。未修改用户原有 Obsidian 仓库或插件安装。
- `npm run lint` 通过；数学独立构建与嵌入构建结果一致，生产构建重现哈希一致。
- `npm run check:styles` 通过；安装 ZIP 的官方三件套校验通过，
  `main.js` 为 3,940,147 字节，低于项目 5 MB 限制。

Windows 测试前将检出文件统一为 LF，解决既有 CSS/源码文本断言的 CRLF
差异；没有提交批量换行修改。既有 scan guard 对生成文件的排除路径使用
斜杠，Windows 返回反斜杠；直接命令报生成文件误报。仅在内存中规范化
路径分隔符后执行原规则，153 个源码文件扫描通过，没有修改扫描规则。
构建重现检查以文件 SHA-256 比较执行，避开既有脚本在 Windows 上直接
`execFileSync('npm')` 的可执行文件解析限制。OpenPrd CLI 未安装，其独立
治理检查未执行。未验证微信服务端发布或旧客户端的实际视觉效果。
