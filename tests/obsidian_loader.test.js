import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Obsidian runtime loader', () => {
  it('does not fall back to Node module.require for Obsidian APIs', () => {
    const source = readFileSync('services/obsidian-compat.js', 'utf8');
    const loaderStart = source.indexOf('const loadCommonJsDependency =');
    const loaderEnd = source.indexOf('export const obsidianApi =', loaderStart);
    const loaderSource = source.slice(loaderStart, loaderEnd);

    expect(loaderSource).toContain('typeof require ===');
    expect(loaderSource).not.toContain('module.require');
  });
});
