import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENGAGEMENT_CTA_TEXT,
  resolveEngagementCardColor,
  shouldShowEngagementCard,
  renderEngagementCard,
  appendEngagementCardToHtml,
} from '../services/engagement-card.js';

describe('services/engagement-card', () => {
  describe('resolveEngagementCardColor', () => {
    it('预设主题色正确解析对应 Hex', () => {
      expect(resolveEngagementCardColor('blue')).toBe('#0366d6');
      expect(resolveEngagementCardColor('green')).toBe('#28a745');
      expect(resolveEngagementCardColor('purple')).toBe('#6f42c1');
      expect(resolveEngagementCardColor('orange')).toBe('#fd7e14');
    });

    it('自定义颜色正确提取', () => {
      expect(resolveEngagementCardColor('custom', '#e60012')).toBe('#e60012');
      expect(resolveEngagementCardColor('custom', 'invalid')).toBe('#0366d6');
    });

    it('未知颜色回退默认蓝色', () => {
      expect(resolveEngagementCardColor('non-existent')).toBe('#0366d6');
      expect(resolveEngagementCardColor(undefined)).toBe('#0366d6');
    });
  });

  describe('shouldShowEngagementCard', () => {
    it('全局设置默认关闭时返回 false', () => {
      expect(shouldShowEngagementCard({ enableEngagementCard: false })).toBe(false);
      expect(shouldShowEngagementCard({})).toBe(false);
      expect(shouldShowEngagementCard(null)).toBe(false);
    });

    it('全局设置开启时返回 true', () => {
      expect(shouldShowEngagementCard({ enableEngagementCard: true })).toBe(true);
    });

    it('frontmatter 具备最高优先级覆盖（单篇 opt-in 或 opt-out）', () => {
      // 全局关，单篇开启
      expect(shouldShowEngagementCard({ enableEngagementCard: false }, { engagement_card: true })).toBe(true);
      expect(shouldShowEngagementCard({ enableEngagementCard: false }, { three_links: true })).toBe(true);

      // 全局开，单篇关闭
      expect(shouldShowEngagementCard({ enableEngagementCard: true }, { engagement_card: false })).toBe(false);
      expect(shouldShowEngagementCard({ enableEngagementCard: true }, { interactive_card: false })).toBe(false);
    });
  });

  describe('renderEngagementCard', () => {
    it('输出包含安全内联 SVG、微卡片与默认文案', () => {
      const html = renderEngagementCard({ themeColor: 'blue' });
      expect(html).toContain('class="owc-engagement-card"');
      expect(html).toContain(DEFAULT_ENGAGEMENT_CTA_TEXT);
      expect(html).toContain('点赞');
      expect(html).toContain('在看');
      expect(html).toContain('转发');
      expect(html).toContain('<svg viewBox="0 0 24 24" width="15" height="15"');
      expect(html).toContain('stroke="currentColor"');
    });

    it('支持自定义引导文案且做 HTML 转义防注入', () => {
      const customCta = '感谢阅读，点击三连支持作者！';
      const html = renderEngagementCard({ ctaText: customCta });
      expect(html).toContain(customCta);

      const injectedCta = '<script>alert(1)</script>';
      const safeHtml = renderEngagementCard({ ctaText: injectedCta });
      expect(safeHtml).not.toContain('<script>');
      expect(safeHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('颜色生态动态派生（主色/背景色阶/边框透明度）', () => {
      const greenHtml = renderEngagementCard({ themeColor: 'green' });
      expect(greenHtml).toContain('#28a745');
      // 绿色的 RGB 是 40, 167, 69
      expect(greenHtml).toContain('rgba(40, 167, 69, 0.03)');
      expect(greenHtml).toContain('rgba(40, 167, 69, 0.12)');

      const customHtml = renderEngagementCard({ themeColor: 'custom', customColor: '#ff0000' });
      expect(customHtml).toContain('#ff0000');
      // 红色的 RGB 是 255, 0, 0
      expect(customHtml).toContain('rgba(255, 0, 0, 0.03)');
    });
  });

  describe('appendEngagementCardToHtml', () => {
    it('正确插入到文章末尾的 </section> 闭合之前', () => {
      const baseHtml = '<section class="owc-article-root"><p>正文内容</p></section>';
      const result = appendEngagementCardToHtml(baseHtml, { themeColor: 'blue' });

      expect(result).toContain('<p>正文内容</p>');
      expect(result).toContain('class="owc-engagement-card"');
      expect(result.trim().endsWith('</section>')).toBe(true);
      // 互动卡应在闭合标签内部
      const cardIdx = result.indexOf('class="owc-engagement-card"');
      const closeIdx = result.lastIndexOf('</section>');
      expect(cardIdx).toBeLessThan(closeIdx);
    });

    it('若无 </section> 闭合标签则直接追加在末尾', () => {
      const baseHtml = '<div><p>纯文本</p></div>';
      const result = appendEngagementCardToHtml(baseHtml, { themeColor: 'purple' });
      expect(result).toContain('<div><p>纯文本</p></div>');
      expect(result).toContain('class="owc-engagement-card"');
    });

    it('不重复附加互动卡（防重入）', () => {
      const baseHtml = '<section class="owc-article-root"><p>正文</p></section>';
      const first = appendEngagementCardToHtml(baseHtml, { themeColor: 'blue' });
      const second = appendEngagementCardToHtml(first, { themeColor: 'blue' });
      expect(second).toBe(first);
      expect((second.match(/class="owc-engagement-card"/g) || []).length).toBe(1);
    });
  });
});
