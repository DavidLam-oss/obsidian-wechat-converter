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
