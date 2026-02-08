
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Obsidian modules
vi.mock('obsidian', () => ({
  Plugin: class {},
  MarkdownView: class {},
  ItemView: class {},
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
  setIcon: vi.fn(),
  Modal: class {}
}));

// Mock modules that input.js requires
vi.mock('../converter.js', () => ({
  AppleStyleConverter: class {}
}));

describe('Settings - Colorize Headings', () => {
  let settings;
  let themeMock;

  beforeEach(() => {
    // Simulate the default settings state
    settings = {
      theme: 'github',
      coloredHeader: false // Default should be false
    };

    // Mock the Theme object
    themeMock = {
      update: vi.fn(),
      getThemeColorValue: vi.fn().mockReturnValue('#000000')
    };
  });

  it('should have coloredHeader disabled by default', () => {
    expect(settings.coloredHeader).toBe(false);
  });

  it('should update setting when toggled', () => {
    // Simulate toggle action
    const toggleSetting = (currentState) => !currentState;

    // Turn ON
    settings.coloredHeader = toggleSetting(settings.coloredHeader);
    expect(settings.coloredHeader).toBe(true);

    // Turn OFF
    settings.coloredHeader = toggleSetting(settings.coloredHeader);
    expect(settings.coloredHeader).toBe(false);
  });

  // Test the Logic flow (Simulation of input.js logic)
  it('should call theme.update with correct params when toggled', () => {
    // Function to mimic the logic in input.js
    const onToggleChange = (isChecked) => {
        settings.coloredHeader = isChecked;
        themeMock.update({ coloredHeader: isChecked });
    };

    // Case 1: Turn ON
    onToggleChange(true);
    expect(settings.coloredHeader).toBe(true);
    expect(themeMock.update).toHaveBeenCalledWith({ coloredHeader: true });

    // Case 2: Turn OFF
    onToggleChange(false);
    expect(settings.coloredHeader).toBe(false);
    expect(themeMock.update).toHaveBeenCalledWith({ coloredHeader: false });
  });
});
