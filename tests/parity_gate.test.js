import { describe, it, expect } from 'vitest';
const {
  isStrictHtmlParity,
  findFirstDiffIndex,
  buildParityMismatchDetails,
} = require('../services/parity-gate');

describe('Parity Gate', () => {
  it('should require byte-level equality', () => {
    expect(isStrictHtmlParity('<p>a</p>', '<p>a</p>')).toBe(true);
    expect(isStrictHtmlParity('<p>a</p>', '<p>a</p>\n')).toBe(false);
    expect(isStrictHtmlParity('<p>a</p>', '<p>A</p>')).toBe(false);
  });

  it('should return first mismatch index', () => {
    expect(findFirstDiffIndex('abc', 'abc')).toBe(-1);
    expect(findFirstDiffIndex('abc', 'axc')).toBe(1);
    expect(findFirstDiffIndex('abc', 'ab')).toBe(2);
  });

  it('should provide mismatch snippets', () => {
    const details = buildParityMismatchDetails('<section>legacy</section>', '<section>native</section>', 12);
    expect(details.index).toBeGreaterThanOrEqual(9);
    expect(details.legacySnippet).toContain('legacy');
    expect(details.candidateSnippet).toContain('native');
    expect(details.segmentCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(details.segments)).toBe(true);
    expect(details.segments[0].index).toBe(details.index);
  });

  it('should collect multiple mismatch segments instead of fail-fast first index only', () => {
    const legacy = '<p>A</p><p>B</p><p>C</p>';
    const candidate = '<p>X</p><p>B</p><p>Y</p>';
    const details = buildParityMismatchDetails(legacy, candidate, 10);
    expect(details.index).toBeGreaterThanOrEqual(0);
    expect(details.segmentCount).toBeGreaterThanOrEqual(2);
    expect(details.segments.length).toBeGreaterThanOrEqual(2);
    expect(details.segments[0].legacySnippet).toContain('<p>A</p>');
    expect(details.segments[1].candidateSnippet).toContain('<p>Y</p>');
  });

  it('should keep full segment details for high-segment mismatches (>12)', () => {
    const legacy = Array.from({ length: 20 }, (_, i) => `<p>L${i}</p>`).join('');
    const candidate = Array.from({ length: 20 }, (_, i) => `<p>C${i}</p>`).join('');
    const details = buildParityMismatchDetails(legacy, candidate, 10);

    expect(details.segmentCount).toBeGreaterThan(12);
    expect(details.segments.length).toBe(details.segmentCount);
    expect(details.truncated).toBe(false);
  });
});
