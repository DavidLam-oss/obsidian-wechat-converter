import { describe, it, expect } from 'vitest';

const { AppleStyleSettingTab } = require('../input.js');

describe('AppleStyleSettingTab - Cleanup Path Normalize', () => {
  it('should normalize vault-relative cleanup path safely', () => {
    const tab = new AppleStyleSettingTab({}, { settings: {} });

    expect(tab.normalizeVaultPath('  /published\\\\post_img/  ')).toBe('published/post_img');
    expect(tab.normalizeVaultPath('')).toBe('');
    expect(tab.normalizeVaultPath(null)).toBe('');
  });
});

