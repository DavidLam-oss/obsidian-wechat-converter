/*
## 核心功能

为多平台发布导出提供纯 HTML 净化规则与视图上下文判定（不影响微信预览、复制或微信草稿同步）。

## 输入

接收视图状态（预览模式、插件设置、当前活动笔记 frontmatter）与待导出的多平台 DOM 容器。

## 输出

输出 `resolveMultiPlatformExportSanitizeOptions` 和 `stripMultiPlatformUnsupportedElements`，
在「文章模式且对应开关开启」时，按条件剥离 `.owc-engagement-card` 一键三连卡片与 `figure figcaption` 图片说明文字。

## 定位

位于 services/，承接多平台导出内容的纯规则过滤，供 `views/publish-modal/multi-platform.js` 与 `views/converter/clipboard.js` 协作调用。

## 依赖

关键依赖：`./engagement-card.js`（复用 `shouldShowEngagementCard` 判定口径）。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 仅拦截多平台发布不支持的特定元素，不改动图片 `<img alt>` 属性、头像水印行与滑动图组提示块。
*/

import { shouldShowEngagementCard } from './engagement-card.js';

/**
 * @typedef {{
 *   stripEngagementCard?: boolean,
 *   stripImageCaption?: boolean,
 * }} MultiPlatformSanitizeOptionsLike
 */

/**
 * Resolve frontmatter metadata from the active publish file when available.
 * @param {unknown} view
 * @returns {Record<string, unknown> | null}
 */
function resolveViewFrontmatter(view) {
  if (!view || typeof view !== 'object') return null;
  const viewRecord = /** @type {{
   *   getPublishContextFile?: (() => unknown),
   *   lastActiveFile?: unknown,
   *   app?: { metadataCache?: { getFileCache?: (file: unknown) => { frontmatter?: unknown } | null } },
   * }} */ (view);
  const activeFile = typeof viewRecord.getPublishContextFile === 'function'
    ? viewRecord.getPublishContextFile()
    : (viewRecord.lastActiveFile ?? null);
  if (!activeFile) return null;
  const metadataCache = viewRecord.app?.metadataCache;
  if (!metadataCache || typeof metadataCache.getFileCache !== 'function') return null;
  const frontmatter = metadataCache.getFileCache(activeFile)?.frontmatter;
  return frontmatter && typeof frontmatter === 'object'
    ? /** @type {Record<string, unknown>} */ (frontmatter)
    : null;
}

/**
 * Determine which unsupported elements should be intercepted for multi-platform publishing.
 * Only applies in article mode (`previewMode === 'article'`) when the corresponding switch is active.
 *
 * @param {unknown} view
 * @returns {{ stripEngagementCard: boolean, stripImageCaption: boolean }}
 */
export function resolveMultiPlatformExportSanitizeOptions(view) {
  if (!view || typeof view !== 'object') {
    return { stripEngagementCard: false, stripImageCaption: false };
  }
  const viewRecord = /** @type {{
   *   previewMode?: unknown,
   *   plugin?: { settings?: Record<string, unknown> },
   * }} */ (view);
  const mode = typeof viewRecord.previewMode === 'string' && viewRecord.previewMode
    ? viewRecord.previewMode
    : 'article';
  if (mode !== 'article') {
    return { stripEngagementCard: false, stripImageCaption: false };
  }

  const settings = viewRecord.plugin?.settings;
  if (!settings || typeof settings !== 'object') {
    return { stripEngagementCard: false, stripImageCaption: false };
  }

  const frontmatter = resolveViewFrontmatter(view);
  const stripEngagementCard = Boolean(
    shouldShowEngagementCard(
      /** @type {Parameters<typeof shouldShowEngagementCard>[0]} */ (settings),
      frontmatter
    )
  );
  const stripImageCaption = settings.showImageCaption === true;

  return {
    stripEngagementCard,
    stripImageCaption,
  };
}

/**
 * Remove elements unsupported by multi-platform editors from a parsed DOM container.
 * Mutates `root` in place.
 *
 * @param {Element | Document | null | undefined} root
 * @param {MultiPlatformSanitizeOptionsLike | null | undefined} [options]
 */
export function stripMultiPlatformUnsupportedElements(root, options = undefined) {
  if (!root || typeof root.querySelectorAll !== 'function' || !options || typeof options !== 'object') {
    return;
  }
  if (options.stripEngagementCard) {
    root.querySelectorAll('.owc-engagement-card').forEach((el) => {
      if (typeof el.remove === 'function') el.remove();
    });
  }
  if (options.stripImageCaption) {
    root.querySelectorAll('figure figcaption').forEach((el) => {
      if (typeof el.remove === 'function') el.remove();
    });
  }
}
