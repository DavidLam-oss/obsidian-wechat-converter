import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as appleStyleViewShared from '../views/apple-style-view-shared.js';
import { showCustomThemeModal } from '../views/converter/custom-theme-modal.js';
import * as clipboardModule from '../views/shared/clipboard.js';
import * as aiGeneratorModule from '../services/ai-theme-generator.js';

describe('Custom Theme Modal View', () => {
  let mockApp;
  let mockPlugin;
  let modalInstance;

  beforeEach(() => {
    vi.restoreAllMocks();

    const createMockElement = (tag, options = {}) => {
      const children = [];
      const classList = new Set();
      if (options.cls) {
        options.cls.split(' ').filter(Boolean).forEach((c) => classList.add(c));
      }

      const el = {
        tagName: tag.toUpperCase(),
        className: options.cls || '',
        textContent: options.text || '',
        value: options.value || '',
        placeholder: options.placeholder || '',
        disabled: false,
        title: '',
        children,
        classList,
        style: {},
        addClass(cls) {
          cls.split(' ').filter(Boolean).forEach((c) => classList.add(c));
          this.className = Array.from(classList).join(' ');
        },
        removeClass(cls) {
          cls.split(' ').filter(Boolean).forEach((c) => classList.delete(c));
          this.className = Array.from(classList).join(' ');
        },
        hasClass(cls) {
          return classList.has(cls);
        },
        setText(text) {
          this.textContent = String(text);
        },
        setCssStyles(styles) {
          Object.assign(this.style, styles);
        },
        empty() {
          children.length = 0;
        },
        createDiv(opts = {}) {
          const div = createMockElement('div', opts);
          children.push(div);
          return div;
        },
        createEl(tagName, opts = {}) {
          const child = createMockElement(tagName, opts);
          children.push(child);
          return child;
        },
        addEventListener(event, handler) {
          this[`on${event}`] = handler;
        },
        focus() {},
      };
      return el;
    };

    const modalEl = createMockElement('div', { cls: 'modal' });
    const contentEl = createMockElement('div', { cls: 'modal-content' });

    modalInstance = {
      modalEl,
      contentEl,
      open: vi.fn(),
      close: vi.fn(),
    };

    vi.spyOn(appleStyleViewShared, 'createObsidianModal').mockReturnValue(modalInstance);

    mockApp = {};

    mockPlugin = {
      settings: {
        customThemes: [],
        theme: 'github',
        ai: {
          providers: [
            {
              id: 'p1',
              kind: 'openai-compatible',
              enabled: true,
              baseUrl: 'https://api.openai.com/v1',
              apiKey: 'sk-test',
              supportsText: true,
              textModel: 'gpt-4o',
            },
          ],
        },
      },
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should initialize modal and render header with tabs', () => {
    showCustomThemeModal({ app: mockApp, plugin: mockPlugin });
    expect(modalInstance.open).toHaveBeenCalledTimes(1);

    const titleEl = modalInstance.contentEl.children[0].children[0];
    expect(titleEl.textContent).toBe('自定义排版主题');
  });

  it('should render import tab with inspiration pills and copy prompt functionality', async () => {
    const copySpy = vi.spyOn(clipboardModule, 'writeClipboardText').mockResolvedValue(true);

    showCustomThemeModal({ app: mockApp, plugin: mockPlugin });

    // Header -> tabsContainer -> [listTabBtn, importTabBtn]
    const header = modalInstance.contentEl.children[0];
    const tabsContainer = header.children[1];
    const importTabBtn = tabsContainer.children[1];

    // Click Import Tab
    importTabBtn.onclick();

    // Body container
    const body = modalInstance.contentEl.children[1];
    const step1 = body.children[0];

    // Check requirement textarea
    const reqTextarea = step1.children[1];
    expect(reqTextarea.placeholder).toContain('偏暖的秋日森林系');

    // Check inspiration pills
    const pillsRow = step1.children[2];
    expect(pillsRow.children.length).toBeGreaterThanOrEqual(5);

    // Click first pill (🍂 秋日森系)
    const firstPillBtn = pillsRow.children[1];
    firstPillBtn.onclick();
    expect(reqTextarea.value).toContain('秋日森林系');

    // Test Copy Prompt Button
    const btnRow = step1.children[3];
    const copyPromptBtn = btnRow.children[1];
    await copyPromptBtn.onclick();

    expect(copySpy).toHaveBeenCalledTimes(1);
    const copiedText = copySpy.mock.calls[0][0];
    expect(copiedText).toContain('秋日森林系');
    expect(copiedText).toContain('schemaVersion');
  });

  it('should support in-app AI direct generation when AI is configured', async () => {
    const mockTheme = {
      schemaVersion: 1,
      id: 'custom-autumn-forest',
      name: '秋日森林',
      headingStyle: 'badge',
      colors: {
        accent: '#d97706',
      },
    };

    vi.spyOn(aiGeneratorModule, 'generateCustomThemeWithAi').mockResolvedValue({
      success: true,
      token: mockTheme,
      json: JSON.stringify(mockTheme, null, 2),
    });

    showCustomThemeModal({ app: mockApp, plugin: mockPlugin });

    const header = modalInstance.contentEl.children[0];
    const tabsContainer = header.children[1];
    const importTabBtn = tabsContainer.children[1];
    importTabBtn.onclick();

    const body = modalInstance.contentEl.children[1];
    const step1 = body.children[0];
    const reqTextarea = step1.children[1];
    reqTextarea.value = '想要秋日温暖系';

    const btnRow = step1.children[3];
    const aiGenBtn = btnRow.children[0];

    await aiGenBtn.onclick();

    // Step 2 textarea should be populated with generated JSON
    const step2 = body.children[1];
    const textarea = step2.children[2];
    expect(textarea.value).toContain('"name": "秋日森林"');

    // Preview card should be updated
    const previewCard = step2.children[1];
    expect(previewCard.hasClass('is-hidden')).toBe(false);
  });
});
