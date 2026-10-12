/**
 * ## 核心功能
 *
 * 模式渲染看门狗与跨模式隔离测试（Batch 4.3）。
 * 覆盖：
 * 1. 模式一致时，Promise 拒绝能正常触发诊断报错面板；
 * 2. 模式切换后，先前模式的 Promise 拒绝被静默拦截，不污染当前预览；
 * 3. 模式一致时，超时看门狗触发超时报错；
 * 4. 模式切换后，先前模式的超时定时器被清除，不触发跨模式报错；
 * 5. 渲染正常完成后，看门狗定时器被立即清除。
 *
 * ## 约束
 *
 * - 严禁包含任何 emoji；
 * - 遵守单文件软线 800 行约束。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { panelShellMethods } from '../views/converter/panel-shell.js';

describe('模式渲染看门狗与跨模式隔离 (Batch 4.3)', () => {
  let context;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    context = {
      ...panelShellMethods,
      previewMode: 'card',
      previewContainer: {
        empty: vi.fn(),
        removeClass: vi.fn(),
        createEl: vi.fn(() => ({ createEl: vi.fn() })),
      },
      showModeRenderFailure: vi.fn(),
      _modeRenderTimer: null,
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('模式未切换且渲染抛错时，正常展示失败诊断面板', async () => {
    const error = new Error('卡片构建失败');
    const failingPromise = Promise.reject(error);

    context.runModeRenderWithDiagnostics('卡片', failingPromise, 5000, 'card');

    await Promise.resolve();
    await Promise.resolve();
    expect(context.showModeRenderFailure).toHaveBeenCalledWith('卡片', error);
  });

  it('模式已切换时，先前模式的渲染抛错被拦截，不展示失败面板', async () => {
    const failingPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('卡片迟到的错误')), 100);
    });

    context.runModeRenderWithDiagnostics('卡片', failingPromise, 5000, 'card');

    // 用户切换到文章模式
    context.previewMode = 'article';

    vi.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();

    expect(context.showModeRenderFailure).not.toHaveBeenCalled();
  });

  it('模式未切换且超时时，正常触发超时诊断', () => {
    const hangingPromise = new Promise(() => {}); // 永不 settle

    context.runModeRenderWithDiagnostics('卡片', hangingPromise, 5000, 'card');

    vi.advanceTimersByTime(4999);
    expect(context.showModeRenderFailure).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(context.showModeRenderFailure).toHaveBeenCalled();
    const [label, err] = context.showModeRenderFailure.mock.calls[0];
    expect(label).toBe('卡片');
    expect(err.message).toContain('超过 5 秒仍未完成');
  });

  it('模式切换到其他模式后，先前模式的超时看门狗不触发报错', () => {
    const hangingPromise = new Promise(() => {});

    context.runModeRenderWithDiagnostics('卡片', hangingPromise, 5000, 'card');

    // 用户在 2 秒后切到贴图模式
    context.previewMode = 'sticker';

    vi.advanceTimersByTime(6000);
    expect(context.showModeRenderFailure).not.toHaveBeenCalled();
  });

  it('渲染正常完成后，看门狗定时器被注销，超时不再触发', async () => {
    const quickPromise = Promise.resolve('ok');

    context.runModeRenderWithDiagnostics('卡片', quickPromise, 5000, 'card');

    await Promise.resolve();
    await Promise.resolve();
    expect(context._modeRenderTimer).toBeNull();

    vi.advanceTimersByTime(6000);
    expect(context.showModeRenderFailure).not.toHaveBeenCalled();
  });
});
