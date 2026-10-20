/*
## 核心功能

覆盖 render flags 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 render flags 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
const inputModule = loadInputModule();
const AppleStylePlugin = inputModule.default;
const { AppleStyleView } = inputModule;

describe('Render Pipeline Wiring (Native-only)', () => {
  it('should always route preview rendering to native pipeline', async () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = {};
    const view = new AppleStyleView({}, plugin);
    const renderForPreview = vi.fn().mockResolvedValue('<section>ok</section>');
    view.nativeRenderPipeline = { renderForPreview };

    const html = await view.renderMarkdownForPreview('# title', 'notes/a.md');

    expect(view.getActiveRenderPipeline()).toBe(view.nativeRenderPipeline);
    expect(renderForPreview).toHaveBeenCalledWith('# title', {
      sourcePath: 'notes/a.md',
      settings: view.plugin.settings,
    });
    expect(html).toBe('<section>ok</section>');
  });

  it('should throw when native pipeline is not initialized', async () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = {};
    const view = new AppleStyleView({}, plugin);

    await expect(view.renderMarkdownForPreview('# title', 'notes/a.md')).rejects.toThrow('渲染管线未初始化');
  });

  it('互动三连卡：默认关闭时不附加，开启时自动附加并继承主题色', async () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = { enableEngagementCard: false, themeColor: 'green' };
    const view = new AppleStyleView({}, plugin);
    const renderForPreview = vi.fn().mockResolvedValue('<section class="owc-article-root"><p>正文</p></section>');
    view.nativeRenderPipeline = { renderForPreview };

    // 默认关闭
    const htmlOff = await view.renderMarkdownForPreview('# title', 'notes/a.md');
    expect(htmlOff).not.toContain('class="owc-engagement-card"');

    // 开启
    plugin.settings.enableEngagementCard = true;
    const htmlOn = await view.renderMarkdownForPreview('# title', 'notes/a.md');
    expect(htmlOn).toContain('class="owc-engagement-card"');
    expect(htmlOn).toContain('#28a745'); // 绿色
    expect(htmlOn).toContain('点赞');
  });

  it('互动三连卡：frontmatter 单篇覆盖（opt-in / opt-out）生效', async () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = { enableEngagementCard: false, themeColor: 'blue' };
    const fakeFile = { path: 'notes/special.md' };
    const app = {
      metadataCache: {
        getFileCache: vi.fn(() => ({
          frontmatter: { engagement_card: true },
        })),
      },
    };
    const view = new AppleStyleView({}, plugin);
    view.app = app;
    view.getPublishContextFile = vi.fn(() => fakeFile);
    view.nativeRenderPipeline = {
      renderForPreview: vi.fn().mockResolvedValue('<section class="owc-article-root"><p>内容</p></section>'),
    };

    // 全局关，单篇 frontmatter 开启 -> 附加
    const htmlFmOn = await view.renderMarkdownForPreview('# title', 'notes/special.md');
    expect(htmlFmOn).toContain('class="owc-engagement-card"');

    // 全局开，单篇 frontmatter 关闭 -> 不附加
    plugin.settings.enableEngagementCard = true;
    app.metadataCache.getFileCache.mockReturnValue({
      frontmatter: { engagement_card: false },
    });
    const htmlFmOff = await view.renderMarkdownForPreview('# title', 'notes/special.md');
    expect(htmlFmOff).not.toContain('class="owc-engagement-card"');
  });
});
