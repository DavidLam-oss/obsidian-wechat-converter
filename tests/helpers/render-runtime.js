const fs = require('fs');
const path = require('path');

function ensureDomGlobals() {
  if (typeof window === 'undefined') {
    global.window = global;
  }
}

function bootstrapLegacyRuntime() {
  ensureDomGlobals();

  if (typeof global.markdownit === 'undefined') {
    global.markdownit = require('../../lib/markdown-it.min.js');
  }
  if (typeof global.hljs === 'undefined') {
    global.hljs = require('../../lib/highlight.min.js');
  }
  if (typeof window.markdownit === 'undefined') {
    window.markdownit = global.markdownit;
  }
  if (typeof window.hljs === 'undefined') {
    window.hljs = global.hljs;
  }

  require('../../lib/mathjax-plugin.js');

  if (!window.AppleTheme) {
    const themeCode = fs.readFileSync(path.resolve(__dirname, '../../themes/apple-theme.js'), 'utf8');
    (0, eval)(themeCode);
  }
  if (!window.AppleStyleConverter) {
    const converterCode = fs.readFileSync(path.resolve(__dirname, '../../converter.js'), 'utf8');
    (0, eval)(converterCode);
  }
}

async function createLegacyConverter({
  sourcePath = '',
  themeOptions = {},
} = {}) {
  bootstrapLegacyRuntime();

  const theme = new window.AppleTheme({
    theme: 'wechat',
    themeColor: 'blue',
    fontSize: 3,
    macCodeBlock: true,
    codeLineNumber: true,
    sidePadding: 16,
    coloredHeader: false,
    ...themeOptions,
  });

  const converter = new window.AppleStyleConverter(theme, '', true, null, sourcePath);
  await converter.initMarkdownIt();
  return converter;
}

module.exports = {
  bootstrapLegacyRuntime,
  createLegacyConverter,
};
