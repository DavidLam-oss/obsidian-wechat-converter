/*
## 核心功能

覆盖 image swipe commands 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 image swipe commands 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
const { loadInputModule } = require('./helpers/input-module.cjs');

const {
  default: AppleStylePlugin,
  createImageSwipeCalloutMarkdown,
  getImageSwipeCommandCopy,
} = loadInputModule();

describe('Image swipe editor commands', () => {
  it('should wrap selected images in an image-swipe callout', () => {
    const selected = [
      '![[png1.png]]',
      '![[png2.png]]',
    ].join('\n');

    const markdown = createImageSwipeCalloutMarkdown('image-swipe', selected, {
      vault: { getConfig: () => 'zh-CN' },
    });

    expect(markdown).toBe([
      '> [!image-swipe] 左右滑动查看图片',
      '> ![[png1.png]]',
      '> ![[png2.png]]',
    ].join('\n'));
  });

  it('should insert an image-sensitive template when nothing is selected', () => {
    const markdown = createImageSwipeCalloutMarkdown('image-sensitive', '', {
      vault: { getConfig: () => 'zh-CN' },
    });

    expect(markdown).toContain('> [!image-sensitive] 此类图片可能引发不适，向左滑动查看');
    expect(markdown).toContain('> ![[图片1.png]]');
    expect(markdown).toContain('> ![[图片2.png]]');
  });

  it('should expose Chinese command names so the command palette can find image swipe actions', () => {
    const imageCopy = getImageSwipeCommandCopy({
      vault: { getConfig: () => 'en' },
    }, 'image-swipe');
    const sensitiveCopy = getImageSwipeCommandCopy({
      vault: { getConfig: () => 'en' },
    }, 'image-sensitive');

    expect(imageCopy.name).toBe('插入横滑图片块');
    expect(sensitiveCopy.name).toBe('插入横滑敏感图片块');
  });

  it('should keep inserted callout titles in Chinese for non-Chinese Obsidian locales', () => {
    const markdown = createImageSwipeCalloutMarkdown('image-swipe', '', {
      vault: { getConfig: () => 'en' },
    });

    expect(markdown).toContain('> [!image-swipe] 左右滑动查看图片');
    expect(markdown).toContain('> ![[image-1.png]]');
    expect(markdown).toContain('> ![[image-2.png]]');
  });

  it('should register image swipe commands as always-visible command palette actions', async () => {
    const commands = [];
    const editor = {
      getSelection: () => '![[a.png]]\n![[b.png]]',
      replaceSelection: (value) => {
        editor.inserted = value;
      },
    };
    const plugin = new AppleStylePlugin();
    plugin.app = {
      vault: { getConfig: () => 'zh-CN' },
      workspace: {
        getActiveViewOfType: () => ({ editor }),
        getLeavesOfType: () => [],
        onLayoutReady: () => {},
      },
    };
    plugin.loadData = async () => ({});
    plugin.saveData = async () => {};
    plugin.registerView = () => {};
    plugin.addRibbonIcon = () => {};
    plugin.addCommand = (command) => commands.push(command);
    plugin.addSettingTab = () => {};
    plugin.startWechatSyncBridgeInBackground = () => {};

    await plugin.onload();

    const imageCommand = commands.find((command) => command.id === 'insert-image-swipe-block');
    const sensitiveCommand = commands.find((command) => command.id === 'insert-image-sensitive-block');

    expect(imageCommand?.name).toBe('插入横滑图片块');
    expect(sensitiveCommand?.name).toBe('插入横滑敏感图片块');
    expect(typeof imageCommand?.callback).toBe('function');
    expect(imageCommand?.editorCallback).toBeUndefined();

    imageCommand.callback();

    expect(editor.inserted).toContain('> [!image-swipe] 左右滑动查看图片');
    expect(editor.inserted).toContain('> ![[a.png]]');
  });
});
