/*
## 核心功能

覆盖公网 IP 查询（public-ip.js）、白名单报错人性化转换（toSyncFriendlyMessage）与设置页一键查 IP 的 Vitest 测试用例。

## 输入

接收 mock 的 HTTP 响应、微信 API 报错字符串与设置页 DOM。

## 输出

输出自动化断言结果，保证 IP 白名单报错友好易懂，一键查询公网 IP 可靠并能复制到剪贴板。

## 定位

位于 tests/，是针对微信白名单诊断与辅助工具的单元与集成测试。

## 依赖

关键依赖：Vitest、`services/public-ip.js`、`services/sync-context.js`。
*/

import { describe, it, expect, vi } from 'vitest';
import obsidian from 'obsidian';
import { obsidianApi } from '../services/obsidian-compat.js';
import {
  isValidPublicIpv4,
  extractIpv4FromResponse,
  fetchCurrentPublicIp,
} from '../services/public-ip.js';
import { toSyncFriendlyMessage } from '../services/sync-context.js';

const { createObsidianLikeElement } = require('./helpers/obsidian-dom.js');
const { loadInputModule } = require('./helpers/input-module.cjs');
const { AppleStyleSettingTab } = loadInputModule();

function makeMinimalPlugin() {
  return {
    app: {},
    manifest: { dir: '/test', id: 'wechat-converter', version: '0.0.0-test' },
    settings: {
      avatarUrl: '',
      wechatAccounts: [],
      defaultAccountId: '',
      cleanupAfterSync: false,
      cleanupDirTemplate: '',
      cleanupUseSystemTrash: true,
      enableEngagementCard: false,
      headingStyle: 'default',
      frontmatterInterpolation: false,
      customCssSource: 'none',
      multiPlatformSync: { enabled: false },
      ai: { enabled: false, providers: [] },
    },
    saveSettings: vi.fn().mockResolvedValue(undefined),
    openExternalUrl: vi.fn(() => true),
    getConverterView: vi.fn(() => null),
    getArticleLayoutState: vi.fn(() => null),
  };
}

describe('Public IP Lookup & Whitelist Error Friendliness', () => {
  describe('isValidPublicIpv4', () => {
    it('accepts valid public IPv4 addresses', () => {
      expect(isValidPublicIpv4('111.192.170.183')).toBe(true);
      expect(isValidPublicIpv4('8.8.8.8')).toBe(true);
      expect(isValidPublicIpv4('202.108.22.5')).toBe(true);
    });

    it('rejects private, loopback, or invalid IP addresses', () => {
      expect(isValidPublicIpv4('127.0.0.1')).toBe(false);
      expect(isValidPublicIpv4('192.168.1.1')).toBe(false);
      expect(isValidPublicIpv4('10.0.0.1')).toBe(false);
      expect(isValidPublicIpv4('172.16.0.1')).toBe(false);
      expect(isValidPublicIpv4('256.0.0.1')).toBe(false);
      expect(isValidPublicIpv4('not-an-ip')).toBe(false);
      expect(isValidPublicIpv4('')).toBe(false);
    });
  });

  describe('extractIpv4FromResponse', () => {
    it('extracts ip from json object with ip or origin property', () => {
      expect(extractIpv4FromResponse({ ip: '111.192.170.183' })).toBe('111.192.170.183');
      expect(extractIpv4FromResponse({ origin: '111.192.170.183, 10.0.0.1' })).toBe('111.192.170.183');
    });

    it('extracts ip from raw text', () => {
      expect(extractIpv4FromResponse('Your IP is 111.192.170.183')).toBe('111.192.170.183');
    });

    it('returns null when no valid public IP is found', () => {
      expect(extractIpv4FromResponse({ ip: '192.168.1.1' })).toBeNull();
      expect(extractIpv4FromResponse('empty response')).toBeNull();
    });
  });

  describe('fetchCurrentPublicIp', () => {
    it('queries endpoints and returns first valid public IP', async () => {
      const mockRequester = vi.fn().mockResolvedValue({
        json: { ip: '111.192.170.183' },
      });

      const ip = await fetchCurrentPublicIp(mockRequester);
      expect(ip).toBe('111.192.170.183');
      expect(mockRequester).toHaveBeenCalledTimes(1);
    });

    it('falls back to next endpoint if first one fails', async () => {
      const mockRequester = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({
          json: { origin: '202.108.22.5' },
        });

      const ip = await fetchCurrentPublicIp(mockRequester);
      expect(ip).toBe('202.108.22.5');
      expect(mockRequester).toHaveBeenCalledTimes(2);
    });

    it('throws friendly error when all endpoints fail', async () => {
      const mockRequester = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(fetchCurrentPublicIp(mockRequester)).rejects.toThrow('无法获取公网 IP');
    });
  });

  describe('toSyncFriendlyMessage for WeChat Whitelist (40164)', () => {
    it('translates technical 40164 error into user friendly Chinese message with IP', () => {
      const technicalMsg = '获取 Token 失败: invalid ip 111.192.170.183 ipv6 ::ffff:111.192.170.183, not in whitelist rid: 69c (40164)';
      const friendly = toSyncFriendlyMessage(technicalMsg);

      expect(friendly).toContain('检测到当前 IP（111.192.170.183）未在微信白名单中');
      expect(friendly).toContain('基本配置 - IP 白名单');
      expect(friendly).not.toContain('rid: 69c');
      expect(friendly).not.toContain('ipv6');
    });

    it('translates 40164 error without specific IP into friendly message', () => {
      const technicalMsg = '40164 not in whitelist';
      const friendly = toSyncFriendlyMessage(technicalMsg);

      expect(friendly).toContain('检测到当前网络 IP未在微信白名单中');
      expect(friendly).toContain('基本配置 - IP 白名单');
    });
  });

  describe('WeChat Tab IP Setting Integration', () => {
    it('renders a dedicated setting item for public IP lookup instead of inline plain text link', async () => {
      const mockReq = vi.fn().mockResolvedValue({
        status: 200,
        json: { ip: '111.192.170.183' },
        text: '{"ip":"111.192.170.183"}',
      });
      obsidianApi.requestUrl = mockReq;
      obsidian.requestUrl = mockReq;

      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        configurable: true,
        writable: true,
      });
      globalThis.__obsidianNoticeRegistry = [];

      const plugin = makeMinimalPlugin();
      const tab = new AppleStyleSettingTab(plugin.app, plugin);
      tab._activeSettingsTab = 'wechat';
      tab.containerEl = createObsidianLikeElement('div');
      tab.renderSettingsContent();

      // 验证说明文案中不再混有内联的查询公网 IP 链接
      const descEls = Array.from(tab.containerEl.querySelectorAll('.apple-settings-about-section-desc'));
      const accountDesc = descEls[0];
      expect(accountDesc).toBeDefined();
      expect(accountDesc.textContent).not.toContain('查询当前公网 IP');
      expect(accountDesc.textContent).toContain('查看图文指南');

      // 验证生成了独立的微信接口白名单 IP Setting
      expect(globalThis.__obsidianSettingNamesRegistry).toContain('微信接口白名单 IP');
      const ipSetting = globalThis.__obsidianSettingInstancesRegistry.find(
        (s) => s.name === '微信接口白名单 IP'
      );
      expect(ipSetting).toBeDefined();
      expect(ipSetting.description).toContain('检测当前网络公网出口 IPv4 地址');

      const ipBtn = globalThis.__obsidianButtonRegistry.find(
        (b) => b.text === '查询当前公网 IP'
      );
      expect(ipBtn).toBeDefined();

      // 触发点击查询
      await ipBtn.clickHandler();

      expect(mockReq).toHaveBeenCalled();
      expect(mockWriteText).toHaveBeenCalledWith('111.192.170.183');

      // 按钮文字更新并展示 IP
      expect(ipBtn.text).toContain('111.192.170.183');
      expect(ipBtn.text).toContain('点击复制');

      // Notice 提示用户已复制
      const notices = globalThis.__obsidianNoticeRegistry;
      expect(notices.some((n) => n.message.includes('111.192.170.183') && n.message.includes('IP 白名单'))).toBe(true);
    });
  });
});
