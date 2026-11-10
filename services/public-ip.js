/*
## 核心功能

提供获取当前设备公网出口 IPv4 地址的服务能力，支撑微信公众号 IP 白名单配置诊断与一键查询。

## 输入

接收可选的 `requestUrlFn` 请求适配器（支持依赖注入与单测 Mock）。

## 输出

输出 `fetchCurrentPublicIp(requestUrlFn?)`，解析并返回合法的公网 IPv4 字符串；若网络不通则抛出用户友好的错误。

## 定位

位于 services/，是轻量级的网络公网地址探测服务，不直接操作 DOM。

## 依赖

关键依赖：`./obsidian-compat.js`。

## 维护规则

- 查询端点仅选用支持 HTTPS 的轻量公网 IPv4 端点（如 ipify / httpbin）。
- 必须校验提取结果为合法的公网 IPv4，防止非法字符或局域网私有地址误导用户。
*/

import { getObsidianRequestUrl } from './obsidian-compat.js';

const IP_LOOKUP_ENDPOINTS = [
  'https://api.ipify.org?format=json',
  'https://api4.ipify.org?format=json',
  'https://httpbin.org/ip',
];

/**
 * 校验是否为合法公网 IPv4 地址
 * @param {string} ip
 * @returns {boolean}
 */
export function isValidPublicIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  const match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octets.some((o) => o < 0 || o > 255)) return false;

  const [first, second] = octets;
  // 排除保留与内网回环地址
  if (first === 0 || first === 127) return false; // 本地 / 环回
  if (first === 10) return false; // 10.0.0.0/8
  if (first === 172 && second >= 16 && second <= 31) return false; // 172.16.0.0/12
  if (first === 192 && second === 168) return false; // 192.168.0.0/16
  if (first >= 224) return false; // 组播与保留

  return true;
}

/**
 * 从 API 响应数据或文本中解析提取 IPv4
 * @param {unknown} data
 * @returns {string | null}
 */
export function extractIpv4FromResponse(data) {
  if (!data) return null;

  if (typeof data === 'object' && data !== null) {
    const record = /** @type {Record<string, unknown>} */ (data);
    if (typeof record.ip === 'string' && isValidPublicIpv4(record.ip)) {
      return record.ip.trim();
    }
    if (typeof record.origin === 'string') {
      // httpbin origin 可能是 "1.2.3.4, 5.6.7.8"
      const candidate = record.origin.split(',')[0].trim();
      if (isValidPublicIpv4(candidate)) return candidate;
    }
  }

  const rawText = typeof data === 'string' ? data : JSON.stringify(data);
  const match = rawText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (match && isValidPublicIpv4(match[0])) {
    return match[0];
  }

  return null;
}

/**
 * 查询当前设备的公网出口 IPv4 地址
 * @param {((options: { url: string, method?: string, headers?: Record<string, string>, throw?: boolean }) => Promise<{ json?: unknown, text?: string }>) | undefined} [requestUrlFn]
 * @returns {Promise<string>}
 */
export async function fetchCurrentPublicIp(requestUrlFn) {
  const defaultRequester = getObsidianRequestUrl();
  const requester = typeof requestUrlFn === 'function' ? requestUrlFn : defaultRequester;
  if (typeof requester !== 'function') {
    throw new Error('Obsidian 网络请求接口不可用');
  }

  let lastError = null;

  for (const endpoint of IP_LOOKUP_ENDPOINTS) {
    try {
      const response = /** @type {{ json?: unknown, text?: string }} */ (await requester({
        url: endpoint,
        method: 'GET',
        headers: { Accept: 'application/json, text/plain' },
        throw: false,
      }));

      const body = response ? (response.json !== undefined ? response.json : response.text) : null;
      const ip = extractIpv4FromResponse(body);
      if (ip) {
        return ip;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    lastError ? `无法获取公网 IP: ${lastError.message}` : '查询公网 IP 超时或服务不可用，请检查网络连接'
  );
}
