/*
## 核心功能

实现渲染管线相关的 markdown source 能力，服务预览、复制和发布一致性。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 同文件内副作用、配置对象、测试断言或样式规则，供视图层生成预览或发布 HTML。

## 定位

位于 services/，属于渲染服务层；避免把渲染细节堆回 input.js。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * @typedef {{ path?: string, extension?: string }} MarkdownFileLike
 * @typedef {{ getValue: () => string }} MarkdownEditorLike
 * @typedef {{ editor?: MarkdownEditorLike, file?: MarkdownFileLike | null, getViewType?: () => string }} MarkdownViewLike
 * @typedef {{ view?: unknown }} WorkspaceLeafLike
 * @typedef {{ getActiveViewOfType: (viewType: unknown) => MarkdownViewLike | null | undefined, getActiveFile?: () => MarkdownFileLike | null | undefined }} WorkspaceLike
 * @typedef {{ read: (file: MarkdownFileLike) => Promise<string> }} VaultLike
 * @typedef {{ workspace: WorkspaceLike, vault: VaultLike }} AppLike
 */

/**
 * @param {MarkdownFileLike | null | undefined} file
 * @returns {boolean}
 */
export function isMarkdownFile(file) {
  if (!file) return false;
  const extension = typeof file.extension === 'string' ? file.extension.trim().toLowerCase() : '';
  if (extension) return extension === 'md';
  return typeof file.path === 'string' && /\.md$/i.test(file.path);
}

/**
 * Prefer the view carried by `active-leaf-change`. Reading the event leaf
 * avoids querying workspace state again after another leaf (for example this
 * converter sidebar) has already become active.
 *
 * @param {WorkspaceLeafLike | null | undefined} leaf
 * @param {unknown} MarkdownViewType
 * @returns {MarkdownViewLike | null}
 */
export function getMarkdownViewFromLeaf(leaf, MarkdownViewType) {
  const view = leaf && typeof leaf === 'object' ? leaf.view : null;
  if (!view || typeof view !== 'object') return null;
  const candidateView = /** @type {MarkdownViewLike} */ (view);

  if (typeof MarkdownViewType === 'function' && view instanceof MarkdownViewType) {
    return candidateView;
  }

  const viewType = typeof candidateView.getViewType === 'function' ? candidateView.getViewType() : '';
  if (viewType === 'markdown' && candidateView.file) {
    return candidateView;
  }

  return null;
}

/**
 * Resolve the current Markdown view/file without assuming the active leaf is
 * itself a Markdown view. Obsidian documents `getActiveFile()` as returning
 * the most recently active file when a sidebar or another non-file view is
 * focused, which is the important first-open fallback for this plugin.
 *
 * @param {{ app: AppLike, lastActiveFile?: MarkdownFileLike | null, MarkdownViewType: unknown, activeViewOverride?: MarkdownViewLike | null }} params
 * @returns {{ view: MarkdownViewLike | null, file: MarkdownFileLike | null }}
 */
export function resolveMarkdownContext({
  app,
  lastActiveFile = null,
  MarkdownViewType,
  activeViewOverride,
}) {
  const activeView = activeViewOverride === undefined
    ? app.workspace.getActiveViewOfType(MarkdownViewType)
    : activeViewOverride;

  if (activeView?.file) {
    return {
      view: activeView,
      file: activeView.file,
    };
  }

  const workspaceFile = typeof app.workspace.getActiveFile === 'function'
    ? app.workspace.getActiveFile()
    : null;
  if (isMarkdownFile(workspaceFile)) {
    return {
      view: null,
      file: workspaceFile,
    };
  }

  if (isMarkdownFile(lastActiveFile)) {
    return {
      view: null,
      file: lastActiveFile,
    };
  }

  return {
    view: null,
    file: null,
  };
}

/**
 * Resolves the markdown source from the active editor first, then the
 * workspace's current/recent Markdown file, and finally the view cache.
 *
 * @param {{ app: AppLike, lastActiveFile?: MarkdownFileLike | null, MarkdownViewType: unknown, activeViewOverride?: MarkdownViewLike | null }} params
 */
export async function resolveMarkdownSource({
  app,
  lastActiveFile,
  MarkdownViewType,
  activeViewOverride,
}) {
  const context = resolveMarkdownContext({
    app,
    lastActiveFile,
    MarkdownViewType,
    activeViewOverride,
  });

  if (context.view?.editor && typeof context.view.editor.getValue === 'function') {
    return {
      ok: true,
      markdown: context.view.editor.getValue(),
      sourcePath: context.file?.path || '',
    };
  }

  if (context.file) {
    try {
      const markdown = await app.vault.read(context.file);
      return {
        ok: true,
        markdown,
        sourcePath: context.file.path || '',
      };
    } catch (error) {
      /** @type {unknown} */
      const readError = error;
      return {
        ok: false,
        reason: 'NO_ACTIVE_FILE',
        error: readError,
      };
    }
  }

  return {
    ok: false,
    reason: 'NO_ACTIVE_FILE',
  };
}
