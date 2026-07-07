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
 * @typedef {{ path?: string }} MarkdownFileLike
 * @typedef {{ getValue: () => string }} MarkdownEditorLike
 * @typedef {{ editor?: MarkdownEditorLike, file?: MarkdownFileLike | null }} MarkdownViewLike
 * @typedef {{ getActiveViewOfType: (viewType: unknown) => MarkdownViewLike | null | undefined }} WorkspaceLike
 * @typedef {{ read: (file: MarkdownFileLike) => Promise<string> }} VaultLike
 * @typedef {{ workspace: WorkspaceLike, vault: VaultLike }} AppLike
 */

/**
 * Resolves the markdown source from the active editor first, then falls back
 * to the last active file. The structural typedefs keep this dynamic Obsidian
 * boundary narrow without changing runtime behavior.
 *
 * @param {{ app: AppLike, lastActiveFile?: MarkdownFileLike | null, MarkdownViewType: unknown }} params
 */
export async function resolveMarkdownSource({ app, lastActiveFile, MarkdownViewType }) {
  /** @type {MarkdownViewLike | null | undefined} */
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
      /** @type {unknown} */
      const readError = error;
      return {
        ok: false,
        reason: 'NO_ACTIVE_FILE',
        error: readError,
      };
    }
  }

  if (activeView) {
    return {
      ok: true,
      markdown: activeView.editor ? activeView.editor.getValue() : '',
      sourcePath: activeView.file ? activeView.file.path : '',
    };
  }

  return {
    ok: false,
    reason: 'NO_ACTIVE_FILE',
  };
}
