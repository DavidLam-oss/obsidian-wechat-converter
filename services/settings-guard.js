/*
## 核心功能

提供设置持久化安全守卫，包含敏感凭据指纹提取、结构化深对比与实体级凭据降级安全检查。

## 输入

接收磁盘既有设置对象、待保存候选 Draft 设置对象及显式意图 intent。

## 输出

输出 `isRecord`、`canonicalJsonEqual`、`extractSecrets` 与 `checkCredentialDowngrade`，供主入口保存事务调用。

## 定位

位于 services/，属于设置安全守卫纯函数层；不直接操作 DOM，不直接调用 Obsidian 读写 API。

## 依赖

无外部模块依赖，纯函数实现。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 保持职责边界清晰，杜绝全局 boolean 放宽，严格核验实体与字段级意图。
*/

/**
 * 校验是否为纯对象
 * @param {unknown} val
 * @returns {val is Record<string, unknown>}
 */
export function isRecord(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * 递归规范化对象键排序，用于结构化深对比
 * @param {unknown} obj
 * @returns {unknown}
 */
function canonicalize(obj) {
  if (Array.isArray(obj)) return obj.map(canonicalize);
  if (obj && typeof obj === 'object') {
    /** @type {Record<string, unknown>} */
    const sorted = {};
    const record = /** @type {Record<string, unknown>} */ (obj);
    Object.keys(record).sort().forEach((key) => {
      sorted[key] = canonicalize(record[key]);
    });
    return sorted;
  }
  return obj;
}

/**
 * 结构化 JSON 规范化深对比（消除缩进、换行与键排序差异）
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function canonicalJsonEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/**
 * 提取核心实体敏感凭据全息指纹
 * @param {Record<string, unknown> | null | undefined} settings
 */
export function extractSecrets(settings) {
  const safe = isRecord(settings) ? settings : {};
  const ai = isRecord(safe.ai) ? safe.ai : {};
  const providers = Array.isArray(ai.providers) ? ai.providers : [];
  const accounts = Array.isArray(safe.wechatAccounts) ? safe.wechatAccounts : [];
  const feishu = isRecord(safe.feishuSync) ? safe.feishuSync : {};
  const bridge = isRecord(safe.multiPlatformSync) ? safe.multiPlatformSync : {};

  return {
    wechatSecrets: accounts.map((raw) => {
      const a = isRecord(raw) ? raw : {};
      return {
        id: String(a['id'] || ''),
        name: String(a['name'] || a['id'] || ''),
        appId: String(a['appId'] || a['appid'] || '').trim(),
        secret: String(a['appSecret'] || '').trim(),
      };
    }),
    legacyWechat: {
      appId: String(safe['wechatAppId'] || '').trim(),
      appSecret: String(safe['wechatAppSecret'] || '').trim(),
    },
    aiKeys: providers.map((raw) => {
      const p = isRecord(raw) ? raw : {};
      return {
        id: String(p['id'] || ''),
        name: String(p['name'] || p['id'] || ''),
        key: String(p['apiKey'] || '').trim(),
      };
    }),
    feishu: {
      appId: String(feishu['appId'] || '').trim(),
      appSecret: String(feishu['appSecret'] || '').trim(),
      folderToken: String(feishu['folderToken'] || '').trim(),
    },
    feishuSecret: String(feishu['appSecret'] || '').trim(),
    bridgeToken: String(bridge['token'] || '').trim(),
  };
}

/**
 * 实体级敏感凭据降级检查（杜绝全局 boolean 放宽）
 * @param {Record<string, unknown>} diskSettings
 * @param {Record<string, unknown>} draftSettings
 * @param {{ action?: string, entityType?: string, targetId?: string, fieldPath?: string }} [intent]
 * @returns {{ isDowngrade: boolean, reason?: string }}
 */
export function checkCredentialDowngrade(diskSettings, draftSettings, intent = {}) {
  const disk = extractSecrets(diskSettings);
  const draft = extractSecrets(draftSettings);

  // 1. 微信账号检查
  for (const diskAcc of disk.wechatSecrets) {
    if (!diskAcc.secret && !diskAcc.appId) continue;
    const draftAcc = draft.wechatSecrets.find((a) => a.id === diskAcc.id);
    const isExplicitDelete =
      intent.action === 'delete_wechat_account' &&
      intent.entityType === 'wechat_account' &&
      intent.targetId === diskAcc.id;
    const isExplicitClearSecret =
      intent.action === 'clear_credential' &&
      intent.entityType === 'wechat_account' &&
      intent.targetId === diskAcc.id &&
      intent.fieldPath === 'appSecret';
    const isExplicitClearAppId =
      intent.action === 'clear_credential' &&
      intent.entityType === 'wechat_account' &&
      intent.targetId === diskAcc.id &&
      intent.fieldPath === 'appId';

    if (!draftAcc && !isExplicitDelete) {
      return { isDowngrade: true, reason: `微信账号 [${diskAcc.name}] 被意外删除` };
    }
    if (draftAcc) {
      if (diskAcc.secret && !draftAcc.secret && !isExplicitClearSecret && !isExplicitDelete) {
        return { isDowngrade: true, reason: `微信账号 [${diskAcc.name}] 的 AppSecret 被意外清空` };
      }
      if (diskAcc.appId && !draftAcc.appId && !isExplicitClearAppId && !isExplicitDelete) {
        return { isDowngrade: true, reason: `微信账号 [${diskAcc.name}] 的 AppID 被意外清空` };
      }
    }
  }

  // 1.1 Legacy 根字段迁移保护（旧数据有 secret，新 draft 既没保留也没迁移进 wechatAccounts[0]）
  if (disk.legacyWechat.appSecret) {
    const hasInDraftLegacy = Boolean(draft.legacyWechat.appSecret);
    const hasInDraftAccounts = draft.wechatSecrets.some((a) => a.secret === disk.legacyWechat.appSecret);
    const isExplicitLegacyClear =
      intent.action === 'clear_credential' &&
      intent.entityType === 'wechat_account' &&
      (intent.targetId === 'primary' || intent.targetId === 'wx_legacy_primary') &&
      intent.fieldPath === 'appSecret';
    if (!hasInDraftLegacy && !hasInDraftAccounts && !isExplicitLegacyClear) {
      return { isDowngrade: true, reason: '旧版微信公众号密钥迁移丢失' };
    }
  }

  // 2. AI 提供商检查
  for (const diskP of disk.aiKeys) {
    if (!diskP.key) continue;
    const draftP = draft.aiKeys.find((p) => p.id === diskP.id);
    const isExplicitDelete =
      intent.action === 'delete_ai_provider' &&
      intent.entityType === 'ai_provider' &&
      intent.targetId === diskP.id;
    const isExplicitClear =
      intent.action === 'clear_credential' &&
      intent.entityType === 'ai_provider' &&
      intent.targetId === diskP.id &&
      intent.fieldPath === 'apiKey';

    if (!draftP && !isExplicitDelete) {
      return { isDowngrade: true, reason: `AI 提供商 [${diskP.name}] 被意外删除` };
    }
    if (draftP && !draftP.key && !isExplicitClear && !isExplicitDelete) {
      return { isDowngrade: true, reason: `AI 提供商 [${diskP.name}] 的 API Key 被意外清空` };
    }
  }

  // 3. 飞书凭据检查
  const isFeishuClearSecret =
    intent.action === 'clear_credential' &&
    intent.entityType === 'feishu' &&
    (intent.targetId === 'primary' || !intent.targetId) &&
    intent.fieldPath === 'appSecret';
  if (disk.feishu.appSecret && !draft.feishu.appSecret && !isFeishuClearSecret) {
    return { isDowngrade: true, reason: '飞书应用密钥被意外清空' };
  }
  const isFeishuClearAppId =
    intent.action === 'clear_credential' &&
    intent.entityType === 'feishu' &&
    (intent.targetId === 'primary' || !intent.targetId) &&
    intent.fieldPath === 'appId';
  if (disk.feishu.appId && !draft.feishu.appId && !isFeishuClearAppId) {
    return { isDowngrade: true, reason: '飞书应用 ID 被意外清空' };
  }

  // 4. Bridge Token 检查
  const isBridgeClear =
    intent.action === 'clear_credential' &&
    intent.entityType === 'bridge' &&
    (intent.targetId === 'primary' || !intent.targetId) &&
    intent.fieldPath === 'token';
  if (disk.bridgeToken && !draft.bridgeToken && !isBridgeClear) {
    return { isDowngrade: true, reason: '多平台连接 Token 被意外清空' };
  }

  return { isDowngrade: false };
}
