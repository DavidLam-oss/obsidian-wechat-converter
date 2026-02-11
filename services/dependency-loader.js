const { embeddedDependencyScripts } = require('./generated-embedded-deps');

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

async function readEmbeddedOrFile({
  key,
  adapter,
  path,
  required = true,
  logger = console,
  embeddedScripts = embeddedDependencyScripts,
}) {
  const embedded = embeddedScripts && typeof embeddedScripts[key] === 'string'
    ? embeddedScripts[key]
    : '';
  if (embedded) return embedded;

  if (!adapter || typeof adapter.read !== 'function') {
    if (required) {
      throw new Error(`Missing embedded script and file adapter for dependency: ${key}`);
    }
    return '';
  }

  if (!required && adapter.exists && typeof adapter.exists === 'function') {
    try {
      if (!(await adapter.exists(path))) return '';
    } catch (error) {
      logger.error(`Dependency exists() check failed for ${path}:`, error);
      return '';
    }
  }

  return adapter.read(path);
}

async function loadConverterDependencies({
  adapter,
  basePath,
  execute,
  logger = console,
  embeddedScripts = embeddedDependencyScripts,
}) {
  if (typeof markdownit === 'undefined') {
    const markdownItSource = await readEmbeddedOrFile({
      key: 'markdownIt',
      adapter,
      path: `${basePath}/lib/markdown-it.min.js`,
      logger,
      embeddedScripts,
    });
    execute(markdownItSource);
  }

  if (typeof hljs === 'undefined') {
    const highlightSource = await readEmbeddedOrFile({
      key: 'highlight',
      adapter,
      path: `${basePath}/lib/highlight.min.js`,
      logger,
      embeddedScripts,
    });
    execute(highlightSource);
  }

  try {
    const mathContent = await readEmbeddedOrFile({
      key: 'mathjax',
      adapter,
      path: `${basePath}/lib/mathjax-plugin.js`,
      required: false,
      logger,
      embeddedScripts,
    });
    if (mathContent) {
      execute(mathContent);
    }
  } catch (error) {
    logger.error('MathJax plugin load failed:', error);
  }

  const themeContent = await readEmbeddedOrFile({
    key: 'theme',
    adapter,
    path: `${basePath}/themes/apple-theme.js`,
    logger,
    embeddedScripts,
  });
  execute(themeContent);

  const converterContent = await readEmbeddedOrFile({
    key: 'converter',
    adapter,
    path: `${basePath}/converter.js`,
    logger,
    embeddedScripts,
  });
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
  embeddedScripts = embeddedDependencyScripts,
}) {
  await loadConverterDependencies({ adapter, basePath, execute, logger, embeddedScripts });

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
  readEmbeddedOrFile,
};
