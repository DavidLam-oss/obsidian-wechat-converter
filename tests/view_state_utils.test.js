/**
 * ## 核心功能
 *
 * 测试 views/shared/view-state-utils.js 中的 syncInPlace 与 setPluginSettings。
 * 覆盖：
 * 1. 根对象与嵌套子对象内存引用稳定性；
 * 2. 数组内对象在拥有 id 属性时维持对象引用稳定性（保持 UI 组件持有的 provider 引用不丢失）；
 * 3. 数组内无 id 对象按位置维持对象引用稳定性；
 * 4. 数组元素新增、删除、排序就地同步；
 * 5. 持有数组元素引用后修改能反映到 settings。
 */

import { describe, it, expect } from 'vitest';
import {
  syncInPlace,
  setPluginSettings,
} from '../views/shared/view-state-utils.js';

describe('view-state-utils: syncInPlace & setPluginSettings', () => {
  it('根对象与嵌套子对象内存引用保持稳定', () => {
    const target = {
      theme: 'default',
      ai: {
        enabled: true,
        defaultModel: 'gpt-4o',
      },
    };
    const targetAiRef = target.ai;

    const source = {
      theme: 'dark',
      ai: {
        enabled: false,
        defaultModel: 'claude-3-5',
        newField: 123,
      },
    };

    syncInPlace(target, source);

    expect(target.theme).toBe('dark');
    expect(target.ai).toBe(targetAiRef);
    expect(target.ai.enabled).toBe(false);
    expect(target.ai.defaultModel).toBe('claude-3-5');
    expect(target.ai.newField).toBe(123);
  });

  it('持有数组元素对象引用时（如 ai.providers[i]），保持对象引用稳定', () => {
    const target = {
      ai: {
        providers: [
          { id: 'prov-1', name: 'OpenAI', apiKey: 'sk-1' },
          { id: 'prov-2', name: 'Anthropic', apiKey: 'sk-2' },
        ],
      },
    };

    // UI 组件获取并持有了 prov-1 的引用
    const heldProvider1 = target.ai.providers[0];
    const heldProvider2 = target.ai.providers[1];
    const originalProvidersArray = target.ai.providers;

    // 模拟从磁盘或其它设置同步了新的设置数据
    const source = {
      ai: {
        providers: [
          { id: 'prov-2', name: 'Anthropic Updated', apiKey: 'sk-2-new' },
          { id: 'prov-1', name: 'OpenAI Updated', apiKey: 'sk-1-new' },
          { id: 'prov-3', name: 'Google', apiKey: 'sk-3' },
        ],
      },
    };

    syncInPlace(target, source);

    // 数组本身引用不变
    expect(target.ai.providers).toBe(originalProvidersArray);
    expect(target.ai.providers).toHaveLength(3);

    // 元素的引用依然指向原本持有的对象！
    expect(target.ai.providers[1]).toBe(heldProvider1);
    expect(target.ai.providers[0]).toBe(heldProvider2);

    // 并且属性已经就地更新
    expect(heldProvider1.name).toBe('OpenAI Updated');
    expect(heldProvider1.apiKey).toBe('sk-1-new');
    expect(heldProvider2.name).toBe('Anthropic Updated');

    // UI 此时继续修改 heldProvider1，能直接影响 target.ai.providers
    heldProvider1.apiKey = 'sk-1-modified-by-ui';
    expect(target.ai.providers[1].apiKey).toBe('sk-1-modified-by-ui');
  });

  it('数组内无 id 对象按位置保持引用并同步字段', () => {
    const target = {
      rules: [
        { pattern: 'foo', action: 'allow' },
        { pattern: 'bar', action: 'deny' },
      ],
    };
    const heldRule0 = target.rules[0];

    const source = {
      rules: [
        { pattern: 'foo-updated', action: 'allow-updated' },
      ],
    };

    syncInPlace(target, source);

    expect(target.rules).toHaveLength(1);
    expect(target.rules[0]).toBe(heldRule0);
    expect(heldRule0.pattern).toBe('foo-updated');
  });

  it('数组内无 id 对象在顺序颠倒或重新排序时，通过语义键精准对齐，绝不错配', () => {
    const target = {
      rules: [
        { name: 'rule-A', action: 'allow' },
        { name: 'rule-B', action: 'deny' },
      ],
    };
    const heldRuleA = target.rules[0];
    const heldRuleB = target.rules[1];

    // 新数组顺序反转，且内容更新
    const source = {
      rules: [
        { name: 'rule-B', action: 'deny-updated' },
        { name: 'rule-A', action: 'allow-updated' },
      ],
    };

    syncInPlace(target, source);

    expect(target.rules[0]).toBe(heldRuleB);
    expect(target.rules[0].action).toBe('deny-updated');
    expect(target.rules[1]).toBe(heldRuleA);
    expect(target.rules[1].action).toBe('allow-updated');
  });

  it('setPluginSettings 保持 plugin.settings 引用并就地更新', () => {
    const plugin = {
      settings: {
        general: { autoSave: true },
        accounts: [{ id: 'acc-1', nickname: 'Official' }],
      },
    };
    const settingsRef = plugin.settings;
    const accRef = plugin.settings.accounts[0];

    const newSettings = {
      general: { autoSave: false },
      accounts: [{ id: 'acc-1', nickname: 'Official Renamed' }],
    };

    const result = setPluginSettings(plugin, newSettings);

    expect(result).toBe(settingsRef);
    expect(plugin.settings).toBe(settingsRef);
    expect(plugin.settings.accounts[0]).toBe(accRef);
    expect(accRef.nickname).toBe('Official Renamed');
  });
});
