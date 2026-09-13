/*
 * C01② 尺寸与倍率取整验证：
 * - 三比例逻辑尺寸（RATIO_PRESETS）
 * - computeCardPixelSize 统一取整口径（§4.3：逻辑 × 倍率后 Math.round）
 * - 会话设置状态机接受三比例、非法比例回落
 */
import { describe, it, expect } from 'vitest';
import { RATIO_PRESETS, computeCardPixelSize } from '../services/card-render-engine.js';
import { createCardLayoutSettingsState } from '../services/card-settings-model.js';

describe('三比例逻辑尺寸（C01②）', () => {
  it('3:4 / 3:5 / 9:16 三档齐备，宽度统一 375，高度按比例取整', () => {
    expect(RATIO_PRESETS['3:4']).toEqual({ width: 375, height: 500 });
    expect(RATIO_PRESETS['3:5']).toEqual({ width: 375, height: 625 });
    expect(RATIO_PRESETS['9:16']).toEqual({ width: 375, height: 667 });
  });
});

describe('computeCardPixelSize（§4.3 唯一取整口径）', () => {
  it('3:4 三档倍率：375×500 → 375/750/1125 × 500/1000/1500', () => {
    const size = RATIO_PRESETS['3:4'];
    expect(computeCardPixelSize(size, 1)).toEqual({ width: 375, height: 500 });
    expect(computeCardPixelSize(size, 2)).toEqual({ width: 750, height: 1000 });
    expect(computeCardPixelSize(size, 3)).toEqual({ width: 1125, height: 1500 });
  });

  it('3:5 与 9:16 的倍率结果', () => {
    expect(computeCardPixelSize(RATIO_PRESETS['3:5'], 2)).toEqual({ width: 750, height: 1250 });
    expect(computeCardPixelSize(RATIO_PRESETS['9:16'], 2)).toEqual({ width: 750, height: 1334 });
    expect(computeCardPixelSize(RATIO_PRESETS['9:16'], 3)).toEqual({ width: 1125, height: 2001 });
  });

  it('非整数逻辑尺寸按 Math.round 取整（与 ceil 口径区分）', () => {
    // ceil 会给 376×501=188376；统一口径为 round → 375×500=187500
    expect(computeCardPixelSize({ width: 375.4, height: 500.4 }, 1)).toEqual({ width: 375, height: 500 });
  });

  it('非法倍率（0 / 负数 / 非数值）按 1 处理，不产生 0 或 NaN 尺寸', () => {
    const size = RATIO_PRESETS['3:4'];
    expect(computeCardPixelSize(size, 0)).toEqual({ width: 375, height: 500 });
    expect(computeCardPixelSize(size, -2)).toEqual({ width: 375, height: 500 });
    expect(computeCardPixelSize(size, Number.NaN)).toEqual({ width: 375, height: 500 });
  });
});

describe('会话设置状态机 × 比例（C01②）', () => {
  it('apply 接受三档比例并触发 onChanged；非法比例回落现值', () => {
    let bumps = 0;
    const state = createCardLayoutSettingsState({ onChanged: () => { bumps += 1; return `k${bumps}`; } });
    expect(state.apply({ ratioId: '3:5' })).toMatchObject({ changed: true, layoutKey: 'k1' });
    expect(state.get().ratioId).toBe('3:5');
    expect(state.apply({ ratioId: '9:16' }).changed).toBe(true);
    expect(state.get().ratioId).toBe('9:16');
    expect(state.apply({ ratioId: '16:9' }).changed).toBe(false);
    expect(state.get().ratioId).toBe('9:16');
    expect(bumps).toBe(2);
  });

  it('reset 回到创建时 defaults 的比例（含全局默认注入的非默认比例）', () => {
    const state = createCardLayoutSettingsState({
      defaults: { ratioId: '3:5' },
    });
    state.apply({ ratioId: '9:16' });
    state.reset();
    expect(state.get().ratioId).toBe('3:5');
  });
});
