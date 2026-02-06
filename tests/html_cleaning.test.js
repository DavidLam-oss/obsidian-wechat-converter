import { describe, it, expect, beforeEach, vi } from 'vitest';

// Alias configured in vitest.config.mjs handles the mock
const { AppleStyleView } = require('../input.js');

describe('AppleStyleView - HTML Cleaning', () => {
  let view;

  beforeEach(() => {
    view = new AppleStyleView(null, null);
  });

  it('should remove margins from nested lists', () => {
    const inputHtml = `
      <ul>
        <li>
          Parent
          <ul style="margin-left: 20px;">
            <li>Child</li>
          </ul>
        </li>
      </ul>
    `;
    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    expect(outputHtml).not.toContain('margin-left: 20px');
    expect(outputHtml).toContain('margin: 0');
  });

  it('should remove empty list items', () => {
    const inputHtml = `
      <ul>
        <li>Valid</li>
        <li>   </li>
        <li></li>
      </ul>
    `;
    const outputHtml = view.cleanHtmlForDraft(inputHtml);

    // Use jsdom to parse output
    const div = document.createElement('div');
    div.innerHTML = outputHtml;
    const lis = div.querySelectorAll('li');

    expect(lis.length).toBe(1);
    expect(lis[0].textContent).toBe('Valid');
  });

  it('should unwrap paragraphs inside list items (when nested list exists)', () => {
    const inputHtml = `
      <ul>
        <li>
          <p>Content</p>
          <ul><li>Nested</li></ul>
        </li>
      </ul>
    `;
    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    expect(outputHtml).not.toContain('<p>');
    expect(outputHtml).toContain('Content');
  });
});
