# Math Rendering Test

## Inline Math
Here is an inline equation: $E = mc^2$.
And another one: $e^{i\pi} + 1 = 0$.

## Block Math
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

## Matrices
$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
$$

## Obsidian / MathJax compatibility regression

- On Obsidian 1.14.4, ensure the host reports MathJax 4.1.3,
  `typeof MathJax.loader.preLoad === 'undefined'` and
  `typeof MathJax.loader.preLoaded === 'function'` before reloading the plugin.
- Enable/reload Wechat Converter, open its preview and render this note.
  Inline math, display math and matrices must produce self-contained SVG paths.
- Copy/export the article and confirm formulas remain visible with networking
  disabled. No external fonts, CDN scripts or references to another SVG's glyph
  cache should be needed for these formulas.
- Verify the host MathJax object, loader, configuration and startup promise are
  unchanged. Repeat on an older Obsidian release using MathJax 3 when available.
- Automated coverage: `npm test -- --run tests/math_runtime_isolation.test.js`.
  This evaluates the generated math bundle and production `main.js` in fresh
  MathJax 3/4 contexts, including a host with pending asynchronous font loading.
  Run `npm run build` first; these tests deliberately inspect actual artifacts.
