import { describe, it, expect } from 'vitest';
const { normalizeVaultPath, isAbsolutePathLike } = require('../services/path-utils');

describe('Path Utils Service', () => {
  it('normalizeVaultPath should normalize separators, duplicate slashes and edges', () => {
    expect(normalizeVaultPath('  /a//b\\c/  ')).toBe('a/b/c');
    expect(normalizeVaultPath('published/{{note}}_img/')).toBe('published/{{note}}_img');
    expect(normalizeVaultPath('')).toBe('');
    expect(normalizeVaultPath(null)).toBe('');
  });

  it('isAbsolutePathLike should detect unix and windows absolute paths', () => {
    expect(isAbsolutePathLike('/Users/demo/vault')).toBe(true);
    expect(isAbsolutePathLike('C:\\Users\\demo')).toBe(true);
    expect(isAbsolutePathLike('relative/path')).toBe(false);
    expect(isAbsolutePathLike('')).toBe(false);
    expect(isAbsolutePathLike(null)).toBe(false);
  });
});
