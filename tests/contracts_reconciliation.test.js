/*
## 核心功能

静态合同（`project-*.d.ts`）与运行时实现的**双向对账**，把「合同台账不得漂移」从人的自觉
变成机器的守卫。三层断言：

1. **覆盖级**：每个方法组合同都有且仅有 1 个方法组模块认领（无孤儿、无重复认领）；
2. **组级**：每个带 `@type {XxxMethodsContract & ThisType<...>}` 注解的方法组模块，其对象
   方法集合与该组合同**完全一致**（双向）；
3. **类级**：`AppleStyleView` / `AppleStyleSettingTab` 原型上的每个方法都在视图合同里登记，
   且合同里声明的每个方法都有实现。
4. **引用级**：方法组合同 `Pick` 的每个方法都存在于其基类合同里（不引用幽灵方法）。

## 背景

合同漂移此前**无任何自动检查**：`tsc` 不在流水线上（基线 3700+ 历史错误），类型感知的 ESLint
只暴露「规则」问题、不暴露 TS 语义错误。于是合同与实现一旦脱节，构建和测试全是绿的，
只能靠人偶然翻到。本文件补上这一格。

受检方向的不对称也在此兜住：对象字面量带 `@type` 时会受 excess property check 约束
（实现 ⊆ 合同，`tsc` 可拦），但**合同声明了没人实现的方法不会被拦**——而 `ThisType<合同>`
会把合同当真，反向放行调用方，直到运行时才炸。第 2、3 层的反向断言专门盯这一侧。

## 已知盲区（2026-09-20 探针实测）

本文件只管**方法名的双向对齐**。以下三类漂移它看不见，别把绿当成万能：

- **签名写错**：只比名字，不比参数/返回类型。视图合同被拆成两份文件，同名方法在 TS 里
  合并成**重载**而非冲突，故跨文件签名不一致静默通过。
- **陈旧属性声明**：视图合同里 139 条属性声明不在受检范围（只解析 4 空格缩进的 `name(`）。
- **类型名不存在**：如把 `ObsidianElementLike` 拼错，本文件不报。全量 `tsc` 能抓，但它不在
  流水线上；窄口径 `tsc` 目前有 20 个既有错误、且会被 `WechatApiContract` 拖进
  `services/wechat-api.js`，尚不足以当门禁。

前两类当前无任何自动保护。

## 输入

接收三份合同文件与 `views/` 下全部方法组模块；运行时不写盘、无副作用。

## 输出

输出 vitest 断言结果；失败时以差异名单形式打印「谁多登记了 / 谁漏登记了」。

## 定位

位于 tests/，是合同台账的机器守卫（闸门落在 `npm test`，随 CI 的 `review:guard` 生效）。

## 依赖

关键依赖：`views/apple-style-view.js`、`views/settings/apple-style-setting-tab.js`
（取装配后的真实原型）与三份 `project-*.d.ts`。

## 维护规则

- 命中失败时**改合同或改实现**，不要放宽断言。
- 只有「宿主基类提供、类内不实现」的方法才允许进 ALLOW_HOST_BASE，并写明来源。
- 新增方法组模块必须带 `@type {XxxMethodsContract & ThisType<...>}` 注解（纯展开聚合对象除外）。
- 保持单文件在 800 行软限制以内。
*/

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GROUP_CONTRACTS_FILE = "project-method-groups.d.ts";
const VIEW_CONTRACTS_FILES = [
  "project-view-contracts.d.ts",
  "project-view-method-contracts.d.ts",
];

/**
 * 合同声明了、但没有实现也非宿主基类提供的方法白名单。
 * 目前为空：宿主覆写（如设置页的 `display()`）都在类体里实现了，理应在合同登记。
 */
const ALLOW_HOST_BASE = new Set([]);

/**
 * 类合同 ↔ 装配后真实原型的对应关系。
 * 用显式字面量 import，避免动态拼接模块路径。
 */
const CLASS_CASES = [
  {
    contract: "AppleStyleViewContract",
    load: async () => (await import("../views/apple-style-view.js")).AppleStyleView,
  },
  {
    contract: "AppleStyleSettingTabContract",
    load: async () => (await import("../views/settings/apple-style-setting-tab.js")).AppleStyleSettingTab,
  },
];

/* ------------------------------------------------------------------ 解析 */

function readContract(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

/**
 * 方法组合同：`type XxxMethodsContract = Pick<Base, 'a' | 'b' | …>;`
 * @returns {Map<string, { base: string, methods: string[] }>}
 */
function parseGroupContracts() {
  const out = new Map();
  const re = /type\s+(\w+)\s*=\s*Pick<\s*(\w+)\s*,\s*([\s\S]*?)>\s*;/g;
  let hit;
  while ((hit = re.exec(readContract(GROUP_CONTRACTS_FILE))) !== null) {
    out.set(hit[1], {
      base: hit[2],
      methods: [...hit[3].matchAll(/'([^']+)'/g)].map((m) => m[1]),
    });
  }
  return out;
}

/**
 * 类合同的方法名。视图合同被拆成两份文件，同名 interface 走 TS 接口合并语义 → 取并集。
 * 只认 4 空格缩进、同行的 `name(` 声明，属性（`name:`）不计。
 * @returns {Map<string, Set<string>>}
 */
function parseClassContracts() {
  const out = new Map();
  for (const file of VIEW_CONTRACTS_FILES) {
    const re = /^interface\s+(\w+)[^{]*\{([\s\S]*?)^\}/gm;
    let hit;
    while ((hit = re.exec(readContract(file))) !== null) {
      if (!out.has(hit[1])) out.set(hit[1], new Set());
      const target = out.get(hit[1]);
      for (const line of hit[2].split("\n")) {
        const method = line.match(/^\s{4}([A-Za-z_$][\w$]*)\s*\??\s*\(/);
        if (method) target.add(method[1]);
      }
    }
  }
  return out;
}

/**
 * 扫描 views/ 下带合同注解的方法组模块。
 * 注解即「本模块负责实现视图/设置页的哪几个方法」的声明，故它是模块与合同的唯一官方接线。
 * 纯展开聚合对象（如 `wechatPublishMethods = { ...a, ...b }`）不参与认领，故无需注解。
 * @returns {Array<{ relPath: string, symbol: string, contract: string, base: string }>}
 */
function collectGroupModules() {
  const annotation =
    /@type\s*\{(\w+)\s*&\s*ThisType<(\w+)>\s*\}\s*\*\/\s*\n\s*(?:export\s+)?const\s+(\w+)\s*=\s*\{/g;
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith(".js")) {
        const text = fs.readFileSync(abs, "utf8");
        let hit;
        annotation.lastIndex = 0;
        while ((hit = annotation.exec(text)) !== null) {
          found.push({
            relPath: path.relative(ROOT, abs),
            symbol: hit[3],
            contract: hit[1],
            base: hit[2],
          });
        }
      }
    }
  };
  walk(path.join(ROOT, "views"));
  return found;
}

/* ---------------------------------------------------------------- 反射 */

/**
 * 对象自身的方法名（不含原型链）。
 * 类传 `ctor.prototype`：`Object.assign` 装配进来的方法与类体方法都落在这一层。
 * @returns {Set<string>}
 */
function ownMethodsOf(target) {
  const own = new Set();
  for (const name of Object.getOwnPropertyNames(target)) {
    if (name === "constructor") continue;
    const desc = Object.getOwnPropertyDescriptor(target, name);
    if (desc && typeof desc.value === "function") own.add(name);
  }
  return own;
}

/**
 * 双向差集，只返回非空方向，便于断言失败时定位。
 * @returns {{ 实现未登记: string[], 合同未实现: string[] }}
 */
function reconcile(implemented, declared) {
  return {
    实现未登记: [...implemented].filter((m) => !declared.has(m)).sort(),
    合同未实现: [...declared].filter((m) => !implemented.has(m) && !ALLOW_HOST_BASE.has(m)).sort(),
  };
}

/* ---------------------------------------------------------------- 用例 */

const groupContracts = parseGroupContracts();
const classContracts = parseClassContracts();
const groupModules = collectGroupModules();

describe("静态合同对账 · 覆盖级", () => {
  it("每个方法组合同都有且仅有 1 个方法组模块认领", () => {
    const owners = new Map();
    for (const mod of groupModules) {
      owners.set(mod.contract, (owners.get(mod.contract) ?? 0) + 1);
    }
    const 无模块认领 = [...groupContracts.keys()].filter((name) => !owners.has(name)).sort();
    const 多模块重复认领 = [...owners].filter(([, count]) => count > 1).map(([name]) => name).sort();
    expect({ 无模块认领, 多模块重复认领 }).toEqual({ 无模块认领: [], 多模块重复认领: [] });
  });

  it("方法组合同 Pick 的每个方法都存在于其基类合同", () => {
    const 悬挂引用 = [];
    for (const [name, def] of groupContracts) {
      const base = classContracts.get(def.base);
      if (!base) {
        悬挂引用.push(`${name} -> 基类 ${def.base} 未找到`);
        continue;
      }
      for (const method of def.methods) {
        if (!base.has(method)) 悬挂引用.push(`${name} -> ${def.base}.${method}`);
      }
    }
    expect(悬挂引用.sort()).toEqual([]);
  });

  it("方法组模块的注解基类与组合同声明的基类一致", () => {
    const 基类不一致 = groupModules
      .filter((mod) => groupContracts.get(mod.contract)?.base !== mod.base)
      .map((mod) => `${mod.symbol}: 注解 ThisType<${mod.base}> vs 合同基类 ${groupContracts.get(mod.contract)?.base}`)
      .sort();
    expect(基类不一致).toEqual([]);
  });
});

describe("静态合同对账 · 方法组级", () => {
  for (const mod of groupModules) {
    it(`${mod.relPath} 的 ${mod.symbol} 与 ${mod.contract} 双向一致`, async () => {
      const declared = groupContracts.get(mod.contract);
      expect(declared, `组合同 ${mod.contract} 无法解析`).toBeTruthy();

      const loaded = await import(pathToFileURL(path.join(ROOT, mod.relPath)).href);
      const object = loaded[mod.symbol];
      expect(object, `${mod.relPath} 未导出 ${mod.symbol}`).toBeTruthy();

      const drift = reconcile(ownMethodsOf(object), new Set(declared.methods));
      expect(drift).toEqual({ 实现未登记: [], 合同未实现: [] });
    });
  }
});

describe("静态合同对账 · 类级", () => {
  for (const { contract, load } of CLASS_CASES) {
    it(`${contract} 与装配后的真实原型双向一致`, async () => {
      const declared = classContracts.get(contract);
      expect(declared, `合同 ${contract} 无法解析`).toBeTruthy();

      const ctor = await load();
      const drift = reconcile(ownMethodsOf(ctor.prototype), declared);
      expect(drift).toEqual({ 实现未登记: [], 合同未实现: [] });
    });
  }
});
