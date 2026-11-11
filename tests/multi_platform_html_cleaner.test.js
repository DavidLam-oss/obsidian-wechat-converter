/*
## 核心功能

验证多平台发布时按条件拦截“一键三连”互动卡片与图片说明文字（`<figcaption>`）的服务与视图集成。

## 输入

构造预览模式、插件开关、Frontmatter、自定义主题配置及含 `asset://` 的导出 HTML。

## 输出

作为 Vitest 自动化测试套件运行，确保仅在文章模式且对应开关生效时拦截，且不误伤其它平台元素与微信发布链路。

## 定位

位于 tests/，只服务自动化测试。

## 依赖

关键依赖：`../services/multi-platform-html-cleaner.js`、`../views/converter/clipboard.js`、`./helpers/multi-platform-modal-fixtures.js`。

## 维护规则

- 修改多平台导出清理口径或开关判定后同步更新对应断言。
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveMultiPlatformExportSanitizeOptions,
  stripMultiPlatformUnsupportedElements,
} from '../services/multi-platform-html-cleaner.js';
import { clipboardMethods } from '../views/converter/clipboard.js';
import {
  installModalCapture,
  makeView,
} from './helpers/multi-platform-modal-fixtures.js';

describe('services/multi-platform-html-cleaner & multi-platform export gating', () => {
  const modalCapture = installModalCapture();

  beforeEach(() => {
    modalCapture.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves sanitize options only when in article mode and respective features are active', () => {
    expect(resolveMultiPlatformExportSanitizeOptions({
      previewMode: 'article',
      plugin: { settings: { enableEngagementCard: true, showImageCaption: true } },
    })).toEqual({ stripEngagementCard: true, stripImageCaption: true });

    expect(resolveMultiPlatformExportSanitizeOptions({
      previewMode: 'article',
      plugin: { settings: { enableEngagementCard: false, showImageCaption: false } },
    })).toEqual({ stripEngagementCard: false, stripImageCaption: false });

    // Only one switch active
    expect(resolveMultiPlatformExportSanitizeOptions({
      previewMode: 'article',
      plugin: { settings: { enableEngagementCard: true, showImageCaption: false } },
    })).toEqual({ stripEngagementCard: true, stripImageCaption: false });

    // Per-note frontmatter opt-in & opt-out
    const file = { path: 'notes/fm.md' };
    const viewWithFm = (frontmatter, settings) => ({
      previewMode: 'article',
      getPublishContextFile: () => file,
      app: { metadataCache: { getFileCache: () => ({ frontmatter }) } },
      plugin: { settings },
    });
    expect(resolveMultiPlatformExportSanitizeOptions(
      viewWithFm({ engagement_card: true }, { enableEngagementCard: false, showImageCaption: false })
    )).toEqual({ stripEngagementCard: true, stripImageCaption: false });
    expect(resolveMultiPlatformExportSanitizeOptions(
      viewWithFm({ engagement_card: false }, { enableEngagementCard: true, showImageCaption: true })
    )).toEqual({ stripEngagementCard: false, stripImageCaption: true });

    // Custom theme footer opt-in
    expect(resolveMultiPlatformExportSanitizeOptions({
      previewMode: 'article',
      plugin: {
        settings: {
          theme: 'custom-1',
          enableEngagementCard: false,
          showImageCaption: false,
          customThemes: [{ id: 'custom-1', footer: { showEngagementCard: true } }],
        },
      },
    })).toEqual({ stripEngagementCard: true, stripImageCaption: false });

    // Non-article modes must never intercept
    expect(resolveMultiPlatformExportSanitizeOptions({
      previewMode: 'sticker',
      plugin: { settings: { enableEngagementCard: true, showImageCaption: true } },
    })).toEqual({ stripEngagementCard: false, stripImageCaption: false });
    expect(resolveMultiPlatformExportSanitizeOptions({
      previewMode: 'card',
      plugin: { settings: { enableEngagementCard: true, showImageCaption: true } },
    })).toEqual({ stripEngagementCard: false, stripImageCaption: false });
  });

  it('strips .owc-engagement-card and figure figcaption without touching alt, avatar row, or image-swipe hint', () => {
    const sampleHtml = [
      '<section id="nice">',
      '  <div class="owc-avatar-row"><img src="https://example.com/avatar.png"><span>Author</span></div>',
      '  <figure><img src="asset://image-1" alt="diagram.png"><figcaption>diagram.png</figcaption></figure>',
      '  <section style="text-align:center;">左滑查看更多</section>',
      '  <section class="owc-engagement-card"><p>如果对你有启发，欢迎点赞、在看、转发</p></section>',
      '</section>',
    ].join('');

    const container = document.createElement('div');
    container.innerHTML = sampleHtml;
    stripMultiPlatformUnsupportedElements(container, {
      stripEngagementCard: true,
      stripImageCaption: true,
    });

    expect(container.querySelector('.owc-engagement-card')).toBeNull();
    expect(container.querySelector('figure figcaption')).toBeNull();
    const img = container.querySelector('figure img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('alt')).toBe('diagram.png');
    expect(img.getAttribute('src')).toBe('asset://image-1');
    expect(container.querySelector('.owc-avatar-row span')?.textContent).toBe('Author');
    expect(container.innerHTML).toContain('左滑查看更多');

    // No-op when flags are false
    const untouched = document.createElement('div');
    untouched.innerHTML = sampleHtml;
    stripMultiPlatformUnsupportedElements(untouched, {
      stripEngagementCard: false,
      stripImageCaption: false,
    });
    expect(untouched.querySelector('.owc-engagement-card')).not.toBeNull();
    expect(untouched.querySelector('figure figcaption')?.textContent).toBe('diagram.png');
  });

  it('applies conditional stripping inside multi-platform bridge publish without affecting WeChat draft path', async () => {
    const articleHtml = [
      '<section id="nice">',
      '  <figure><img src="app://local/notes%2Fassets%2Fpic.png" alt="pic.png"><figcaption>pic.png</figcaption></figure>',
      '  <section class="owc-engagement-card"><p>如果对你有启发，欢迎点赞、在看、转发</p></section>',
      '</section>',
    ].join('');

    const imageFile = {
      path: 'notes/assets/pic.png',
      name: 'pic.png',
      extension: 'png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    };
    const app = {
      isMobile: false,
      metadataCache: {
        getFirstLinkpathDest: vi.fn((link) => (link === 'assets/pic.png' ? imageFile : null)),
        getFileCache: vi.fn(() => ({ frontmatter: {} })),
      },
      vault: {
        readBinary: vi.fn(async () => imageFile.bytes),
        getResourcePath: vi.fn(() => 'app://local/notes%2Fassets%2Fpic.png'),
        getAbstractFileByPath: vi.fn(() => null),
      },
    };
    const bridge = {
      health: vi.fn().mockResolvedValue({ ok: true, capabilities: { quotaPolicy: true } }),
      enqueueSyncArticle: vi.fn().mockResolvedValue({ accepted: true, syncId: 'sync-clean-1' }),
    };

    const view = makeView({ selectedPlatforms: ['zhihu'], bridge, app });
    view.previewMode = 'article';
    view.plugin.settings.enableEngagementCard = true;
    view.plugin.settings.showImageCaption = true;
    view.lastResolvedMarkdown = '![pic.png](assets/pic.png)';
    view.getCurrentExportHtml = vi.fn(() => articleHtml);
    view.prepareHtmlForWechatsyncArticleViaBridge = clipboardMethods.prepareHtmlForWechatsyncArticleViaBridge.bind(view);
    view.transformCodeBlocksForWechatsync = vi.fn();
    view.showWechatsyncEnqueueAcceptedModal = vi.fn();

    await view.showMultiPlatformSyncModal();
    const modal = modalCapture.getLastModal();
    await modal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    const payload = bridge.enqueueSyncArticle.mock.calls[0][0];
    expect(payload.content).toContain('asset://image-1');
    expect(payload.content).toContain('alt="pic.png"');
    expect(payload.content).not.toContain('<figcaption');
    expect(payload.content).not.toContain('owc-engagement-card');

    // Non-article mode skips interception even if switches stay enabled
    bridge.enqueueSyncArticle.mockClear();
    view.previewMode = 'sticker';
    await view.showMultiPlatformSyncModal();
    const stickerModal = modalCapture.getLastModal();
    await stickerModal.contentEl.querySelector('.wechat-modal-buttons .mod-cta').onclick();

    const stickerPayload = bridge.enqueueSyncArticle.mock.calls[0][0];
    expect(stickerPayload.content).toContain('<figcaption');
    expect(stickerPayload.content).toContain('owc-engagement-card');

    // WeChat draft preparation path remains completely untouched when article mode & switches are ON
    view.previewMode = 'article';
    view.enhanceHtmlForWechatPublishing = vi.fn(async () => {});
    view.applyCustomCss = vi.fn(async (html) => html);
    view.prepareHtmlForWechatDraft = clipboardMethods.prepareHtmlForWechatDraft.bind(view);
    const wechatDraftHtml = await view.prepareHtmlForWechatDraft(articleHtml);
    expect(wechatDraftHtml).toContain('<figcaption');
    expect(wechatDraftHtml).toContain('owc-engagement-card');
  });
});
