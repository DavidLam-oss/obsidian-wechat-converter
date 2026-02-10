function getAvatarSrc(settings = {}) {
  if (!settings.enableWatermark) return '';
  return settings.avatarBase64 || settings.avatarUrl || '';
}

function toThemeOptions(settings = {}) {
  return {
    theme: settings.theme,
    themeColor: settings.themeColor,
    customColor: settings.customColor,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    macCodeBlock: settings.macCodeBlock,
    codeLineNumber: settings.codeLineNumber,
    sidePadding: settings.sidePadding,
    coloredHeader: settings.coloredHeader,
  };
}

async function ensureGlobalLibrary({ adapter, path, isReady, execute }) {
  if (isReady()) return;
  const content = await adapter.read(path);
  execute(content);
}

async function loadConverterDependencies({ adapter, basePath, execute, logger = console }) {
  await ensureGlobalLibrary({
    adapter,
    path: `${basePath}/lib/markdown-it.min.js`,
    isReady: () => typeof markdownit !== 'undefined',
    execute,
  });

  await ensureGlobalLibrary({
    adapter,
    path: `${basePath}/lib/highlight.min.js`,
    isReady: () => typeof hljs !== 'undefined',
    execute,
  });

  try {
    const mathPath = `${basePath}/lib/mathjax-plugin.js`;
    if (await adapter.exists(mathPath)) {
      const mathContent = await adapter.read(mathPath);
      execute(mathContent);
    }
  } catch (error) {
    logger.error('MathJax plugin load failed:', error);
  }

  const themeContent = await adapter.read(`${basePath}/themes/apple-theme.js`);
  execute(themeContent);

  const converterContent = await adapter.read(`${basePath}/converter.js`);
  execute(converterContent);

  if (!window.AppleTheme) throw new Error('AppleTheme failed to load');
  if (!window.AppleStyleConverter) throw new Error('AppleStyleConverter failed to load');
}

async function buildRenderRuntime({
  settings,
  app,
  adapter,
  basePath,
  execute = (code) => (0, eval)(code),
  logger = console,
}) {
  await loadConverterDependencies({ adapter, basePath, execute, logger });

  const theme = new window.AppleTheme(toThemeOptions(settings));
  const converter = new window.AppleStyleConverter(
    theme,
    getAvatarSrc(settings),
    settings.showImageCaption,
    app
  );
  await converter.initMarkdownIt();

  return { theme, converter };
}

module.exports = {
  getAvatarSrc,
  toThemeOptions,
  loadConverterDependencies,
  buildRenderRuntime,
};
