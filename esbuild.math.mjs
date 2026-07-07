/*
## 核心功能

配置 MathJax 插件独立 bundle 构建流程，生成公式渲染运行时。

## 输入

接收 math-entry 源码、markdown-it-mathjax3 依赖和 esbuild 构建参数。

## 输出

输出 lib/mathjax-plugin.js 供插件动态加载。

## 定位

位于根目录，专注数学公式 bundle，不处理文章渲染主流程。

## 依赖

关键依赖：`esbuild`、`process`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 根目录 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import esbuild from "esbuild";
import process from "process";

const banner = `/* Obsidian WeChat MathJax Plugin (Bundled) */`;

console.log("Bundling MathJax...");

try {
  await esbuild.build({
    entryPoints: ["lib/math-entry.js"],
    bundle: true,
    outfile: "lib/mathjax-plugin.js",
    format: "iife",
    // globalName: "ObsidianWechatMath", // We assign to window inside the file
    minify: true,
    banner: { js: banner },
    platform: "browser",
    define: {
      'process.env.NODE_ENV': '"production"',
      'PACKAGE_VERSION': '"3.2.2"' // Force static version to prevent dynamic require
    },
    external: ['katex'],
    plugins: [
      {
        name: 'package-json-stub',
        setup(build) {
          // Stub any require/import of "package.json"
          build.onResolve({ filter: /package\.json$/ }, args => {
            return { path: args.path, namespace: 'package-json-stub' }
          })
          build.onLoad({ filter: /.*/, namespace: 'package-json-stub' }, () => {
            return {
              contents: JSON.stringify({ version: "0.0.0" }),
              loader: 'json',
            }
          })
        },
      }
    ]
  });
  console.log("✅ MathJax plugin bundled successfully to lib/mathjax-plugin.js");
} catch (e) {
  console.error("❌ Bundling failed:", e);
  process.exit(1);
}
