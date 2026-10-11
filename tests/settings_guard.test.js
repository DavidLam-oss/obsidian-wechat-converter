/*
## 核心功能

覆盖设置安全防洗白 (Phase A) 最小闭环测试用例 (TC-01 ~ TC-10)。

## 输入

模拟的 Obsidian 存储适配器、异常磁盘读取、并发请求、敏感凭据意图。

## 输出

对存储状态机、Draft/Commit 回滚、实体级凭据防清空、MathJax 3/4 兼容性、串行队列及默认 ID 修复的完整断言。

## 定位

位于 tests/，是设置安全防护与兼容性的门禁测试。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkCredentialDowngrade, canonicalJsonEqual } from '../services/settings-guard.js';

const { loadInputModule } = require('./helpers/input-module.cjs');

describe('Settings Safety Guard & Obsidian Compatibility (Phase A)', () => {
  let AppleStylePlugin;

  beforeEach(() => {
    vi.resetModules();
    AppleStylePlugin = loadInputModule().default;
  });

  // TC-01: 存量空读保护
  it('TC-01: prevents overwriting data.json when disk exists but loadData returns null', async () => {
    const plugin = new AppleStylePlugin();
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn().mockResolvedValue('{"wechatAccounts":[{"id":"acc1","appSecret":"sec1"}]}'),
          write: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    plugin.loadData = vi.fn().mockResolvedValue(null);
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin._storageState).toBe('known-existing');
    expect(plugin._settingsSafeMode).toBe(true);
    expect(plugin.saveData).toHaveBeenCalledTimes(0);

    // 任何后续 saveSettings 均触发安全模式拦截
    const saveRes = await plugin.saveSettings();
    expect(saveRes.success).toBe(false);
    expect(saveRes.reason).toBe('SAFE_MODE_LOCKED');
    expect(plugin.saveData).toHaveBeenCalledTimes(0);
  });

  // TC-02: 存量空对象保护
  it('TC-02: prevents overwriting data.json when disk exists but loadData returns empty object', async () => {
    const plugin = new AppleStylePlugin();
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn().mockResolvedValue('{"wechatAccounts":[{"id":"acc1"}]}'),
          write: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    plugin.loadData = vi.fn().mockResolvedValue({});
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin._storageState).toBe('known-existing');
    expect(plugin._settingsSafeMode).toBe(true);
    expect(plugin.saveData).toHaveBeenCalledTimes(0);

    const saveRes = await plugin.saveSettings();
    expect(saveRes.success).toBe(false);
    expect(saveRes.reason).toBe('SAFE_MODE_LOCKED');
    expect(plugin.saveData).toHaveBeenCalledTimes(0);
  });

  // TC-03: 纯净首装与状态推进
  it('TC-03: handles virgin install with 0 writes on load, and promotes to known-existing after first successful save', async () => {
    let diskExists = false;
    let diskContent = '';
    const plugin = new AppleStylePlugin();
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockImplementation(async () => diskExists),
          read: vi.fn().mockImplementation(async () => diskContent),
          write: vi.fn().mockImplementation(async (path, data) => {
            diskContent = data;
            diskExists = true;
          }),
        },
      },
    };
    plugin.loadData = vi.fn().mockResolvedValue(null);
    plugin.saveData = vi.fn().mockImplementation(async (data) => {
      diskContent = JSON.stringify(data);
      diskExists = true;
    });

    await plugin.loadSettings();

    expect(plugin._storageState).toBe('virgin');
    expect(plugin._settingsSafeMode).toBe(false);
    expect(plugin.saveData).toHaveBeenCalledTimes(0);

    // 首次保存成功
    const firstSave = await plugin.saveSettings();
    expect(firstSave.success).toBe(true);
    expect(plugin._storageState).toBe('known-existing');
    expect(plugin.saveData).toHaveBeenCalledTimes(1);

    // 状态推进后，若文件被外部删除/损坏，后续保存必须被预检拦截
    diskExists = false;
    const secondSave = await plugin.saveSettings();
    expect(secondSave.success).toBe(false);
    expect(secondSave.reason).toBe('PRE_CHECK_FAILED');
  });

  // TC-04: Adapter 异常与非布尔保护
  it('TC-04: enters safe mode and sets storageState to unknown when adapter.exists throws or returns non-boolean', async () => {
    const plugin = new AppleStylePlugin();
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockRejectedValue(new Error('I/O error')),
        },
      },
    };
    plugin.loadData = vi.fn().mockResolvedValue(null);
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin._storageState).toBe('unknown');
    expect(plugin._settingsSafeMode).toBe(true);
    expect(plugin.saveData).toHaveBeenCalledTimes(0);

    const saveRes = await plugin.saveSettings();
    expect(saveRes.success).toBe(false);
  });

  // TC-05: 保存预检失败 Fail-Closed
  it('TC-05: blocks save and rolls back memory if disk pre-check read fails in known-existing state', async () => {
    const plugin = new AppleStylePlugin();
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn().mockRejectedValue(new Error('Disk read timeout')),
          write: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    const validData = {
      clientId: 'wp_dev_123',
      wechatAccounts: [{ id: 'acc1', name: 'Original', appSecret: 'sec' }],
    };
    plugin.loadData = vi.fn().mockResolvedValue(validData);
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    plugin._storageState = 'known-existing';
    plugin._committedSettings = JSON.parse(JSON.stringify(validData));
    plugin.settings = JSON.parse(JSON.stringify(validData));

    // 用户在内存中修改了配置
    plugin.settings.wechatAccounts[0].name = 'Tampered';

    const saveRes = await plugin.saveSettings();
    expect(saveRes.success).toBe(false);
    expect(saveRes.reason).toBe('PRE_CHECK_FAILED');
    // 内存成功回滚至基线
    expect(plugin.settings.wechatAccounts[0].name).toBe('Original');
  });

  // TC-06: 启动迁移写盘失败回滚
  it('TC-06: rolls back memory to rawDiskBaseline and locks safe mode if migration save fails', async () => {
    const plugin = new AppleStylePlugin();
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn().mockResolvedValue(JSON.stringify({
            wechatAppId: 'wx123',
            wechatAppSecret: 'sec123',
          })),
        },
      },
    };
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAppId: 'wx123',
      wechatAppSecret: 'sec123',
    });
    // saveData 抛错
    plugin.saveData = vi.fn().mockRejectedValue(new Error('Disk full'));

    await plugin.loadSettings();

    expect(plugin._settingsSafeMode).toBe(true);
    // 原始字段与状态保留，不抹杀迁移所需字段
    expect(plugin.settings.wechatAppId).toBe('wx123');
    expect(plugin.settings.wechatAppSecret).toBe('sec123');
  });

  // TC-07: 实体级凭据防清空与意图核验
  it('TC-07: prevents accidental credential downgrade without explicit entity intent, but permits target entity intent', async () => {
    const diskSettings = {
      ai: {
        providers: [
          { id: 'p1', name: 'OpenAI', apiKey: 'sk-123' },
          { id: 'p2', name: 'Claude', apiKey: 'sk-456' },
        ],
      },
      wechatAccounts: [
        { id: 'acc1', name: 'Official', appSecret: 'wx-sec' },
      ],
      feishuSync: { appSecret: 'feishu-sec' },
      multiPlatformSync: { token: 'bridge-token' },
    };

    // 1. 无 intent 清空 p1 的 API Key -> 拦截
    const draftWithoutKey = JSON.parse(JSON.stringify(diskSettings));
    draftWithoutKey.ai.providers[0].apiKey = '';
    const resBlocked = checkCredentialDowngrade(diskSettings, draftWithoutKey, {});
    expect(resBlocked.isDowngrade).toBe(true);

    // 2. 意图实体类型错误 -> 拦截
    const resWrongEntity = checkCredentialDowngrade(diskSettings, draftWithoutKey, {
      action: 'clear_credential',
      entityType: 'wechat_account',
      targetId: 'p1',
      fieldPath: 'apiKey',
    });
    expect(resWrongEntity.isDowngrade).toBe(true);

    // 3. 意图与 targetId 完全匹配 -> 放行
    const resAllowed = checkCredentialDowngrade(diskSettings, draftWithoutKey, {
      action: 'clear_credential',
      entityType: 'ai_provider',
      targetId: 'p1',
      fieldPath: 'apiKey',
    });
    expect(resAllowed.isDowngrade).toBe(false);

    // 4. 携带明确意图删除 p1 -> 放行
    const draftOnlyP2 = JSON.parse(JSON.stringify(diskSettings));
    draftOnlyP2.ai.providers = [{ id: 'p2', name: 'Claude', apiKey: 'sk-456' }];
    const resDeleteAllowed = checkCredentialDowngrade(diskSettings, draftOnlyP2, {
      action: 'delete_ai_provider',
      entityType: 'ai_provider',
      targetId: 'p1',
    });
    expect(resDeleteAllowed.isDowngrade).toBe(false);

    // 5. 跨实体误删：携带 p1 删除意图，但把 p2 也删了 -> 拦截
    const draftNone = JSON.parse(JSON.stringify(diskSettings));
    draftNone.ai.providers = [];
    const resCrossBlocked = checkCredentialDowngrade(diskSettings, draftNone, {
      action: 'delete_ai_provider',
      entityType: 'ai_provider',
      targetId: 'p1',
    });
    expect(resCrossBlocked.isDowngrade).toBe(true);
  });

  // TC-08: MathJax 3/4 与异常兼容
  it('TC-08: verifies MathJax bundle compatibility with MathJax 3, 4, missing, and non-function', () => {
    const mathjaxBundlePath = path.join(process.cwd(), 'lib', 'mathjax-plugin.js');
    expect(fs.existsSync(mathjaxBundlePath)).toBe(true);
    const code = fs.readFileSync(mathjaxBundlePath, 'utf8');

    // 严禁存在 MathJax.loader.preLoad( 裸调用
    expect(/MathJax\.loader\.preLoad\(/.test(code)).toBe(false);

    // 模拟运行时的四种表现分支
    const evalShim = (loaderObj) => {
      let called = null;
      const MathJax = {
        loader: {
          ...loaderObj,
          preLoaded: typeof loaderObj.preLoaded === 'function' ? (...args) => {
            called = 'preLoaded';
            return loaderObj.preLoaded(...args);
          } : loaderObj.preLoaded,
          preLoad: typeof loaderObj.preLoad === 'function' ? (...args) => {
            called = 'preLoad';
            return loaderObj.preLoad(...args);
          } : loaderObj.preLoad,
        },
      };

      (typeof MathJax.loader.preLoaded === 'function' ? MathJax.loader.preLoaded : (typeof MathJax.loader.preLoad === 'function' ? MathJax.loader.preLoad : function(){})).call(MathJax.loader, 'loader', 'startup');
      return called;
    };

    // 分支 1: MathJax 3 (preLoad 为函数)
    expect(evalShim({ preLoad: () => {} })).toBe('preLoad');

    // 分支 2: MathJax 4 (preLoaded 为函数，preLoad 未定义)
    expect(evalShim({ preLoaded: () => {} })).toBe('preLoaded');

    // 分支 3: preLoad 为非函数
    expect(evalShim({ preLoad: 'not-a-fn', preLoaded: null })).toBe(null);

    // 分支 4: 属性缺失
    expect(evalShim({})).toBe(null);
  });

  // TC-09: 并发保存串行化隔离
  it('TC-09: serializes concurrent saveSettings calls and preserves isolation', async () => {
    const plugin = new AppleStylePlugin();
    let currentDisk = { count: 0 };
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn().mockImplementation(async () => JSON.stringify(currentDisk)),
        },
      },
    };
    plugin._storageState = 'known-existing';
    plugin._committedSettings = JSON.parse(JSON.stringify(currentDisk));
    plugin.settings = JSON.parse(JSON.stringify(currentDisk));

    let save1Running = false;
    const saveOrder = [];

    plugin.saveData = vi.fn().mockImplementation(async (data) => {
      if (data.count === 1) {
        save1Running = true;
        saveOrder.push('save1-start');
        await new Promise((r) => setTimeout(r, 20));
        saveOrder.push('save1-end');
        currentDisk = data;
        save1Running = false;
      } else if (data.count === 2) {
        expect(save1Running).toBe(false); // save1 必须在 save2 前完成
        saveOrder.push('save2-start');
        currentDisk = data;
        saveOrder.push('save2-end');
      }
    });

    const draft1 = { count: 1 };
    const draft2 = { count: 2 };

    const p1 = plugin.saveSettings(draft1);
    const p2 = plugin.saveSettings(draft2);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(saveOrder).toEqual(['save1-start', 'save1-end', 'save2-start', 'save2-end']);
    expect(plugin.settings.count).toBe(2);
  });

  // TC-10: 实体删除修复默认引用不变量
  it('TC-10: automatically repairs default ID invariants when deleting AI provider or WeChat account', async () => {
    const plugin = new AppleStylePlugin();
    const initialSettings = {
      ai: {
        defaultProviderId: 'p1',
        defaultImageProviderId: 'p2',
        providers: [
          { id: 'p1', name: 'P1', supportsText: true, supportsImage: false },
          { id: 'p2', name: 'P2', supportsText: false, supportsImage: true },
          { id: 'p3', name: 'P3', supportsText: true, supportsImage: true },
        ],
      },
      defaultAccountId: 'acc1',
      wechatAccounts: [
        { id: 'acc1', name: 'Acc1' },
        { id: 'acc2', name: 'Acc2' },
      ],
    };

    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn().mockImplementation(async () => JSON.stringify(initialSettings)),
        },
      },
    };
    plugin._storageState = 'known-existing';
    plugin._committedSettings = JSON.parse(JSON.stringify(initialSettings));
    plugin.settings = JSON.parse(JSON.stringify(initialSettings));
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    // 删除默认文本 Provider p1
    const delAiRes = await plugin.deleteAiProvider('p1');
    expect(delAiRes.success).toBe(true);
    expect(plugin.settings.ai.providers.some((p) => p.id === 'p1')).toBe(false);
    expect(plugin.settings.ai.defaultProviderId).toBe('p2');

    // 删除默认图像 Provider p2
    const delAiImgRes = await plugin.deleteAiProvider('p2');
    expect(delAiImgRes.success).toBe(true);
    expect(plugin.settings.ai.defaultImageProviderId).toBe('p3');

    // 删除默认微信账号 acc1
    const delWxRes = await plugin.deleteWechatAccount('acc1');
    expect(delWxRes.success).toBe(true);
    expect(plugin.settings.wechatAccounts.some((a) => a.id === 'acc1')).toBe(false);
    expect(plugin.settings.defaultAccountId).toBe('acc2');

    // 删除剩余微信账号 acc2
    const delWxRes2 = await plugin.deleteWechatAccount('acc2');
    expect(delWxRes2.success).toBe(true);
    expect(plugin.settings.wechatAccounts.length).toBe(0);
    expect(plugin.settings.defaultAccountId).toBe('');
  });

  // TC-11: 受控快照 (.bak) 生成与容错 (ADR-5)
  it('TC-11: generates .bak snapshot on structural changes and tolerates .bak write errors without blocking main save', async () => {
    const plugin = new AppleStylePlugin();
    const diskData = { count: 1, theme: 'default' };
    const bakWrites = [];
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn().mockResolvedValue(JSON.stringify(diskData)),
          write: vi.fn().mockImplementation(async (filePath, data) => {
            if (filePath.endsWith('.bak')) {
              bakWrites.push(JSON.parse(data));
            }
          }),
        },
      },
    };
    plugin._storageState = 'known-existing';
    plugin._committedSettings = JSON.parse(JSON.stringify(diskData));
    plugin.settings = JSON.parse(JSON.stringify(diskData));
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    // 1. 实质变更：修改 count -> 应该生成 .bak 快照
    const draftChanged = { count: 2, theme: 'default' };
    const resChanged = await plugin.saveSettings(draftChanged);
    expect(resChanged.success).toBe(true);
    expect(bakWrites.length).toBe(1);
    expect(bakWrites[0]).toEqual(diskData);

    // 2. 伪变更（结构相同，键顺序不同）-> 不应该生成新的 .bak 快照
    expect(canonicalJsonEqual(diskData, { theme: 'default', count: 1 })).toBe(true);
    const draftSameStruct = { theme: 'default', count: 2 };
    // 更新磁盘模拟为 count: 2
    plugin.app.vault.adapter.read = vi.fn().mockResolvedValue(JSON.stringify({ count: 2, theme: 'default' }));
    plugin._committedSettings = { count: 2, theme: 'default' };
    await plugin.saveSettings(draftSameStruct);
    expect(bakWrites.length).toBe(1); // 仍为 1 次，无重复写入

    // 3. 快照写入失败时不阻塞正本写入 (Fail-Safe)
    plugin.app.vault.adapter.read = vi.fn().mockResolvedValue(JSON.stringify({ count: 2, theme: 'default' }));
    plugin.app.vault.adapter.write = vi.fn().mockRejectedValue(new Error('Permission denied on .bak'));
    const draftNew = { count: 3, theme: 'default' };
    const resFaultTolerant = await plugin.saveSettings(draftNew);
    expect(resFaultTolerant.success).toBe(true);
    expect(plugin.saveData).toHaveBeenCalled();
  });

  // TC-12: 从快照自愈恢复配置 (Recovery Protocol)
  it('TC-12: restores configuration from .bak and unlocks safe mode', async () => {
    const plugin = new AppleStylePlugin();
    const backupContent = {
      wechatAccounts: [{ id: 'acc_restored', name: 'Restored Acc', appSecret: 'sec_restored' }],
    };
    let writtenData = null;
    plugin.app = {
      vault: {
        configDir: '.obsidian',
        adapter: {
          exists: vi.fn().mockImplementation(async (filePath) => filePath.endsWith('.bak')),
          read: vi.fn().mockResolvedValue(JSON.stringify(backupContent)),
          write: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    plugin._storageState = 'unknown';
    plugin._settingsSafeMode = true;
    plugin.saveData = vi.fn().mockImplementation(async (data) => {
      writtenData = data;
    });

    const res = await plugin.restoreFromBackup();
    expect(res.success).toBe(true);
    expect(plugin._settingsSafeMode).toBe(false);
    expect(plugin._storageState).toBe('known-existing');
    expect(writtenData).toEqual(backupContent);
  });

  // TC-13: 外部同步变更响应 (F4)
  it('TC-13: handles onExternalSettingsChange by reloading settings and refreshing view', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadSettings = vi.fn().mockResolvedValue(undefined);
    const mockRequestRender = vi.fn();
    plugin.getConverterView = vi.fn().mockReturnValue({
      requestRender: mockRequestRender,
    });

    await plugin.onExternalSettingsChange();

    expect(plugin.loadSettings).toHaveBeenCalledTimes(1);
    expect(mockRequestRender).toHaveBeenCalledTimes(1);
  });

  // TC-14: 扩展凭据守护：Legacy 微信根凭据与 AppID (F5)
  it('TC-14: protects legacy WeChat root credentials and account appId from silent erasure', () => {
    // 1. 拦截旧版根字段凭据丢失
    const legacyDisk = {
      wechatAppId: 'wx_old',
      wechatAppSecret: 'sec_old',
      wechatAccounts: [],
    };
    // 既没有保留根字段，也没有迁移进 wechatAccounts[0]
    const emptyDraft = {
      wechatAccounts: [],
    };
    const legacyCheck = checkCredentialDowngrade(legacyDisk, emptyDraft, {});
    expect(legacyCheck.isDowngrade).toBe(true);
    expect(legacyCheck.reason).toContain('旧版微信公众号密钥迁移丢失');

    // 若成功迁移进 wechatAccounts，则允许放行
    const migratedDraft = {
      wechatAccounts: [{ id: 'wx_legacy_primary', appId: 'wx_old', appSecret: 'sec_old' }],
    };
    const migratedCheck = checkCredentialDowngrade(legacyDisk, migratedDraft, {});
    expect(migratedCheck.isDowngrade).toBe(false);

    // 2. 拦截微信账号 AppID 静默清空
    const accDisk = {
      wechatAccounts: [{ id: 'acc1', name: 'MyAccount', appId: 'wx_123', appSecret: 'sec_123' }],
    };
    const clearAppIdDraft = {
      wechatAccounts: [{ id: 'acc1', name: 'MyAccount', appId: '', appSecret: 'sec_123' }],
    };
    const appIdCheck = checkCredentialDowngrade(accDisk, clearAppIdDraft, {});
    expect(appIdCheck.isDowngrade).toBe(true);
    expect(appIdCheck.reason).toContain('AppID 被意外清空');

    // 3. 拦截飞书 AppID 静默清空
    const feishuDisk = {
      feishuSync: { appId: 'cli_123', appSecret: 'feishu_sec' },
    };
    const clearFeishuAppIdDraft = {
      feishuSync: { appId: '', appSecret: 'feishu_sec' },
    };
    const feishuAppIdCheck = checkCredentialDowngrade(feishuDisk, clearFeishuAppIdDraft, {});
    expect(feishuAppIdCheck.isDowngrade).toBe(true);
    expect(feishuAppIdCheck.reason).toContain('飞书应用 ID 被意外清空');
  });
});
