/*
## 核心功能

校验 Gitee 上的指定版本 Release 是否已包含三个安装资产（main.js / manifest.json / styles.css）。

## 输入

命令行参数：版本号（如 `2.12.0`，不带 v 前缀）。可选环境变量 `GITEE_OWNER` / `GITEE_REPO` 覆盖默认仓库坐标。

## 输出

终端校验结果与退出码：资产齐全时 exit 0，缺失或查询失败时 exit 1。

## 定位

位于 scripts/，供发版后在本地或 CI 中确认国内镜像渠道（Gitee）已拿到可安装产物。
GitHub 仍是唯一发布源，本脚本只做镜像侧的一致性回读。

## 依赖

关键依赖：`node:https`（无第三方依赖）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 scripts 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import https from "node:https";

const REQUIRED_ASSETS = ["main.js", "manifest.json", "styles.css"];

const OWNER = process.env.GITEE_OWNER || "david_lin1002";
const REPO = process.env.GITEE_REPO || "obsidian-wechat-converter";

const version = process.argv[2];
if (!version) {
  console.error("用法: node scripts/verify-gitee-release.mjs <version>（如 2.12.0，不带 v 前缀）");
  process.exit(1);
}

const url = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(version)}`;

/**
 * 读取 Gitee Release 的公开 JSON（无需 token）。
 * @param {string} target
 * @returns {Promise<{status: number, body: string}>}
 */
function fetchJson(target) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      target,
      { headers: { Accept: "application/json", "User-Agent": "obsidian-wechat-converter-release-check" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("请求超时（15s）"));
    });
  });
}

try {
  const { status, body } = await fetchJson(url);

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error(`❌ 响应不是合法 JSON（HTTP ${status}）`);
    console.error(`   原始响应前 200 字符: ${body.slice(0, 200)}`);
    process.exit(1);
  }

  // Gitee 对不存在的 tag 会返回 null 或空对象，而不是 {message}。
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.message) {
    const why = parsed && parsed.message ? parsed.message : "空响应（该 tag 可能尚未发布到 Gitee）";
    console.error(`❌ Release ${version} 不存在或查询失败: ${why}`);
    process.exit(1);
  }

  // Gitee 会自动生成 <tag>.zip / <tag>.tar.gz 源码包，它们不算安装资产。
  const assets = (Array.isArray(parsed.assets) ? parsed.assets : [])
    .map((item) => (item && typeof item.name === "string" ? item.name : null))
    .filter(Boolean);

  const missing = REQUIRED_ASSETS.filter((name) => !assets.includes(name));

  console.log(`tag      : ${parsed.tag_name || version}`);
  console.log(`assets   : ${assets.length > 0 ? assets.join(", ") : "(无)"}`);

  if (missing.length > 0) {
    console.error(`❌ 缺少安装资产: ${missing.join(", ")}`);
    console.error("   请在 Gitee 发行版页补齐，或检查 release.yml 的 Gitee 同步步骤日志。");
    process.exit(1);
  }

  console.log("✅ 三个安装资产齐全");
} catch (error) {
  console.error(`❌ 请求失败: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
