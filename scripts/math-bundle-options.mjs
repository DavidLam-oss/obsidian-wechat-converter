/*
 * Shared build options for the standalone and embedded math runtimes.
 * The source dependency uses a free MathJax in AllPackages.js and
 * global.MathJax in components/global.js. Both must be private BEFORE any
 * dependency is evaluated; a guard in math-entry.js runs too late.
 */
export function mathBundleOptions() {
  return {
    bundle: true,
    format: 'iife',
    minify: true,
    platform: 'browser',
    // Keep these bindings inside an outer closure. The main build rebundles
    // this IIFE, so a top-level banner variable would leak or be renamed away
    // from the dependency. Never temporarily replace window.MathJax: the host
    // may be typesetting asynchronously or loading MathJax 4 font data.
    banner: { js: `/* Obsidian WeChat MathJax Plugin (Bundled) */
(function () {
  const MathJax = undefined;
  const global = {};` },
    footer: { js: '})();' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'PACKAGE_VERSION': '"3.2.2"',
    },
    external: ['katex'],
    plugins: [{
      name: 'package-json-stub',
      setup(build) {
        build.onResolve({ filter: /package\.json$/ }, args => ({
          path: args.path,
          namespace: 'package-json-stub',
        }));
        build.onLoad({ filter: /.*/, namespace: 'package-json-stub' }, () => ({
          contents: JSON.stringify({ version: '0.0.0' }),
          loader: 'json',
        }));
      },
    }],
  };
}
