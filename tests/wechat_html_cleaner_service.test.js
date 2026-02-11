import { describe, it, expect } from 'vitest';
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');

describe('Wechat HTML Cleaner Service', () => {
  it('should keep list label and body on one line in a simple case', () => {
    const input = '<ol><li><strong>清理时机</strong>：<br>正文</li></ol>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('清理时机');
    expect(output).toContain('正文');
    expect(output).not.toContain('<br>');
  });
});
