
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

// Mock window
global.window = {};

describe('AppleTheme Color Logic', () => {
  let AppleTheme;

  beforeAll(() => {
    // Load the AppleTheme class directly from the file
    // Note: In a real module system we would import it, but since it's a non-exported browser script
    // we read and eval it.
    const themePath = path.join(__dirname, '../themes/apple-theme.js');
    const themeContent = fs.readFileSync(themePath, 'utf8');

    // Evaluate the file content to load the class into window.AppleTheme
    // using Function constructor to execute in global scope
    // Fix: The file has a line `window.AppleTheme = AppleTheme;` at the end which causes ReferenceError
    // because AppleTheme is a named class expression assigned to window.AppleTheme, not a var.
    // We strip that line for testing.
    // Use a regex to be robust against whitespace or changes in the exact string
    const safeContent = themeContent.replace(/window\.AppleTheme\s*=\s*AppleTheme\s*;?/, '');
    new Function(safeContent)();

    AppleTheme = global.window.AppleTheme;
  });

  describe('Tone-on-Tone Mapping', () => {
    it('should have a deep color mapping for every standard theme color', () => {
      const standardColors = Object.keys(AppleTheme.THEME_COLORS);
      const deepColors = Object.keys(AppleTheme.THEME_COLORS_DEEP);

      expect(standardColors.sort()).toEqual(deepColors.sort());
    });

    it('should return default dark grey when coloredHeader is false', () => {
      const theme = new AppleTheme({
        themeColor: 'purple',
        coloredHeader: false
      });
      expect(theme.getHeadingColorValue()).toBe('#3e3e3e');
    });

    it('should return deep purple when coloredHeader is true and theme is purple', () => {
      const theme = new AppleTheme({
        themeColor: 'purple',
        coloredHeader: true
      });
      // Standard Purple: #6f42c1 -> Deep Purple: #4a2b82
      expect(theme.getHeadingColorValue()).toBe('#4a2b82');
    });
  });

  describe('Custom Color Algorithm', () => {
    it('should darken custom color by ~20% when coloredHeader is true', () => {
      const customHex = '#FF0000'; // Pure Red
      const theme = new AppleTheme({
        themeColor: 'custom',
        customColor: customHex,
        coloredHeader: true
      });

      const result = theme.getHeadingColorValue();

      // We expect it to be darker.
      // R: 255 * 0.8 = 204 (CC) -> #cc0000
      expect(result.toLowerCase()).toBe('#cc0000');
    });

    it('should handle custom color black correctly (clamped)', () => {
        const theme = new AppleTheme({
            themeColor: 'custom',
            customColor: '#000000',
            coloredHeader: true
        });
        // 0 * 0.8 = 0
        expect(theme.getHeadingColorValue()).toBe('#000000');
    });

    it('should handle hex strings with or without hash', () => {
        const theme = new AppleTheme();
        expect(theme.adjustColorBrightness('FFFFFF', -20).toLowerCase()).toBe('#cccccc');
        expect(theme.adjustColorBrightness('#FFFFFF', -20).toLowerCase()).toBe('#cccccc');
    });
  });
});
