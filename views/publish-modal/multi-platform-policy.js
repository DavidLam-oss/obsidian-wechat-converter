/*
## 核心功能

承载多平台发布弹窗所需的能力、Pro 状态和每日额度策略计算。

## 输入

Bridge 能力、健康状态、平台选择和发布结果的动态记录。

## 输出

额度提示、能力合并结果、平台截断结果和跳过平台信息。

## 定位

位于 views/publish-modal/，是多平台发布的纯策略适配层。

## 依赖

关键依赖：`../../services/wechatsync-settings.js`、`../../services/obsidian-publisher-policy.js`。

## 边界

- 只处理普通数据，不创建 DOM、不调用 Bridge、不保存设置。
- 保持现有额度、Pro 判定和结果归一化规则不变。
- 由 multi-platform.js 负责把结果连接到界面和发布流程。

## 维护规则

- 不在此处创建 DOM、发起请求或保存设置。
- 修改额度、Pro 判定或结果字段时同步更新对应测试。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: policy adapters normalize dynamic Bridge capability and result records */

import {
  normalizeWechatSyncCapabilities,
  parseWechatsyncPlatformIds,
} from '../../services/wechatsync-settings.js';
import {
  getDailyPlatformQuotaLimit,
  normalizePolicyQuota,
} from '../../services/obsidian-publisher-policy.js';

const FREE_DAILY_PLATFORM_QUOTA = 1;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value) {
  return isRecord(value) ? value : {};
}

function toText(value) {
  return typeof value === 'string' ? value : '';
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getQuotaHintText(selectedCount = 0, { proLicensed = false, freeLimit = FREE_DAILY_PLATFORM_QUOTA } = {}) {
  const limit = Number.isFinite(Number(freeLimit))
    ? Math.max(0, Math.floor(Number(freeLimit)))
    : FREE_DAILY_PLATFORM_QUOTA;
  if (proLicensed) {
    return selectedCount > 0
      ? `已选 ${selectedCount} 个平台。Pro 已激活，无每日平台数量限制。`
      : 'Pro 已激活，无每日平台数量限制。';
  }
  if (selectedCount > limit) {
    return `已选 ${selectedCount} 个平台；免费版每天 ${limit} 个平台额度，超出部分会自动跳过。`;
  }
  if (selectedCount === limit) {
    return `已选 ${selectedCount} 个平台，刚好达到免费版每天 ${limit} 个平台额度。`;
  }
  if (selectedCount > 0) {
    return `已选 ${selectedCount} 个平台；免费版每天 ${limit} 个平台额度。`;
  }
  return `免费版每天 ${limit} 个平台额度。`;
}

function mergePolicyCapabilityDetails(target, source) {
  const sourceRecord = toRecord(source);
  const next = {
    ...target,
    ...normalizeWechatSyncCapabilities(sourceRecord),
  };
  const quota = normalizePolicyQuota(sourceRecord.quota);
  if (quota) next.quota = quota;

  const policyVersion = toFiniteNumber(sourceRecord.policyVersion);
  if (policyVersion !== undefined) next.policyVersion = policyVersion;

  for (const key of [
    'minExtensionVersion',
    'minObsidianPluginVersion',
    'proUpgradeUrl',
    'extensionUpgradeUrl',
    'obsidianPluginUpgradeUrl',
  ]) {
    const text = toText(sourceRecord[key]);
    if (text) next[key] = text;
  }

  if (toText(sourceRecord.version)) next.extensionVersion = toText(sourceRecord.version);
  for (const key of ['forceUpgradeExtension', 'forceUpgradeObsidianPlugin']) {
    if (Object.prototype.hasOwnProperty.call(sourceRecord, key)) {
      next[key] = sourceRecord[key] === true;
    }
  }
  return next;
}

function mergeHealthPolicyCapabilities(cachedCapabilities, health) {
  const healthRecord = toRecord(health);
  return mergePolicyCapabilityDetails(
    mergePolicyCapabilityDetails(cachedCapabilities, healthRecord.capabilities),
    healthRecord
  );
}

function getDailyPlatformQuotaLimitFromCapabilities(value, fallback = FREE_DAILY_PLATFORM_QUOTA) {
  const quota = normalizePolicyQuota(toRecord(value).quota);
  if (!quota || quota.mode !== 'daily_platform_count') return fallback;
  return Math.max(0, Math.floor(Number(quota.freeLimit)));
}

function resolveInitialFreeQuotaLimit(bridgeSettings, capabilities) {
  const settingsRecord = toRecord(bridgeSettings);
  const cachedPolicy = toRecord(toRecord(settingsRecord.policyCache).payload);
  const fallback = getDailyPlatformQuotaLimitFromCapabilities(capabilities, FREE_DAILY_PLATFORM_QUOTA);
  return getDailyPlatformQuotaLimit(cachedPolicy, fallback);
}

function resolvePluginSideQuotaTruncation(requestedPlatformIds, effectivePolicy, capabilities) {
  if (capabilities.proLicensed === true) {
    return {
      platformIds: requestedPlatformIds,
      skippedPlatformIds: [],
      quotaLimit: FREE_DAILY_PLATFORM_QUOTA,
      truncated: false,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(capabilities, 'proLicensed')) {
    return {
      platformIds: requestedPlatformIds,
      skippedPlatformIds: [],
      quotaLimit: FREE_DAILY_PLATFORM_QUOTA,
      truncated: false,
    };
  }

  const policyQuota = effectivePolicy.source !== 'fallback'
    ? normalizePolicyQuota(toRecord(effectivePolicy.payload).quota)
    : null;
  const quota = policyQuota
    || normalizePolicyQuota(toRecord(capabilities).quota)
    || normalizePolicyQuota(toRecord(effectivePolicy.payload).quota);
  if (!quota || quota.mode !== 'daily_platform_count') {
    return {
      platformIds: requestedPlatformIds,
      skippedPlatformIds: [],
      quotaLimit: FREE_DAILY_PLATFORM_QUOTA,
      truncated: false,
    };
  }

  const quotaLimit = Math.max(0, Math.floor(Number(quota.freeLimit)));
  if (requestedPlatformIds.length <= quotaLimit) {
    return {
      platformIds: requestedPlatformIds,
      skippedPlatformIds: [],
      quotaLimit,
      truncated: false,
    };
  }
  return {
    platformIds: requestedPlatformIds.slice(0, quotaLimit),
    skippedPlatformIds: requestedPlatformIds.slice(quotaLimit),
    quotaLimit,
    truncated: true,
  };
}

function mergePluginSkippedPlatformsIntoResult(result, truncation) {
  if (!truncation.skippedPlatformIds.length) return result;
  const skippedPlatformIds = parseWechatsyncPlatformIds([
    ...truncation.skippedPlatformIds,
    ...parseWechatsyncPlatformIds(Array.isArray(result.skippedPlatforms) ? result.skippedPlatforms : []),
  ]);
  const publishedPlatforms = Array.isArray(result.publishedPlatforms) && result.publishedPlatforms.length
    ? result.publishedPlatforms
    : truncation.platformIds;
  return {
    ...result,
    quotaBlocked: true,
    maxPlatforms: Number.isFinite(Number(result.maxPlatforms))
      ? Number(result.maxPlatforms)
      : truncation.quotaLimit,
    publishedPlatforms,
    skippedPlatforms: skippedPlatformIds,
  };
}

export {
  getQuotaHintText,
  mergePolicyCapabilityDetails,
  mergeHealthPolicyCapabilities,
  getDailyPlatformQuotaLimitFromCapabilities,
  resolveInitialFreeQuotaLimit,
  resolvePluginSideQuotaTruncation,
  mergePluginSkippedPlatformsIntoResult,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: restore unsafe-rule checking after the dynamic policy adapter */
