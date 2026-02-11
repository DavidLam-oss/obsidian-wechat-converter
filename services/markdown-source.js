async function resolveMarkdownSource({ app, lastActiveFile, MarkdownViewType }) {
  const activeView = app.workspace.getActiveViewOfType(MarkdownViewType);

  if (!activeView && lastActiveFile) {
    try {
      const markdown = await app.vault.read(lastActiveFile);
      return {
        ok: true,
        markdown,
        sourcePath: lastActiveFile.path || '',
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'NO_ACTIVE_FILE',
        error,
      };
    }
  }

  if (activeView) {
    return {
      ok: true,
      markdown: activeView.editor.getValue(),
      sourcePath: activeView.file ? activeView.file.path : '',
    };
  }

  return {
    ok: false,
    reason: 'NO_ACTIVE_FILE',
  };
}

module.exports = {
  resolveMarkdownSource,
};
