/*
## 核心功能

作为数学公式独立 bundle 的源码入口，包装 markdown-it-mathjax3 运行时。

## 输入

接收 markdown-it 实例、公式配置和 MathJax 插件依赖。

## 输出

导出可被 esbuild.math.mjs 打包的数学插件入口。

## 定位

位于 lib/，是生成 mathjax-plugin.js 的源文件；不要在生成物里直接改逻辑。

## 依赖

关键依赖：`markdown-it-mathjax3`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 lib 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import markdownItMathjax3 from 'markdown-it-mathjax3';


// Safely get global object
const _global = (typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {});

// Expose the plugin to the window object
_global.ObsidianWechatMath = (md, options) => {
    try {
        md.use(markdownItMathjax3, {
            tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
            },
            svg: {
                fontCache: 'none', // Crucial for WeChat compatibility
                scale: 1,
                displayAlign: 'center',
                displayIndent: '0'
            },
            options: {
                enableMenu: false,
                assistiveMml: false
            }
        });
    } catch (e) {
        console.error('MathJax3 Plugin: Registration failed', e);
    }
};

