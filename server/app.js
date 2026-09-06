/*
## 核心功能

提供可部署的微信 API 代理服务，处理 CORS、token、素材和草稿相关请求。

## 输入

接收 HTTP 请求、环境变量、微信开放平台配置和部署运行时信号。

## 输出

输出代理 API 响应、健康状态、日志或服务管理结果。

## 定位

位于 server/，是可选后端辅助服务；插件主流程必须能在没有它时按设置降级。

## 依赖

关键依赖：`express`、`node-fetch`、`form-data`、`sqlite3`、`path`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 server 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.db');

// 初始化 SQLite 数据库
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('无法打开 SQLite 数据库:', err.message);
  } else {
    console.log('已连接至 SQLite 数据库.');
    // 初始化数据表
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          token TEXT PRIMARY KEY,
          expired_at INTEGER NOT NULL,
          device_limit INTEGER DEFAULT 3,
          comment TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS device_logs (
          token TEXT,
          client_id TEXT,
          last_seen INTEGER,
          PRIMARY KEY (token, client_id)
        )
      `);
    });
  }
});

// 解析 JSON 体 (限制为 15MB 兼容大图上传)
app.use(express.json({ limit: '15mb' }));

// CORS 跨域请求头处理与 OPTIONS 快速响应
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 辅助包装 DB 异步查询方法
const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// 鉴权与防超用核心中间件
async function checkAccess(req, res, next) {
  const token = req.query.token;
  const clientId = req.headers['x-client-id'];

  if (!token) {
    return res.status(401).json({ error: '未授权：链接中缺少 token 参数' });
  }

  try {
    // 1. 检查 Token 有效性与过期
    const user = await dbGet("SELECT * FROM users WHERE token = ?", [token]);
    if (!user) {
      return res.status(403).json({ error: 'Token 无效，请联系作者获取' });
    }

    if (Date.now() > user.expired_at) {
      const expiryDate = new Date(user.expired_at).toLocaleDateString('zh-CN');
      return res.status(403).json({ error: `服务已于 ${expiryDate} 到期，请联系作者续费` });
    }

    // 2. 弹性的设备防超额绑定逻辑
    if (clientId) {
      const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
      // 自动清理 15 天前未活跃的过期设备
      await dbRun("DELETE FROM device_logs WHERE last_seen < ?", [fifteenDaysAgo]);

      // 获取当前活跃设备
      const activeDevices = await dbAll("SELECT client_id, last_seen FROM device_logs WHERE token = ?", [token]);
      const deviceIds = activeDevices.map(d => d.client_id);
      const limit = user.device_limit || 3;

      if (!deviceIds.includes(clientId)) {
        // 新设备：如果超过弹性限制数，立刻阻断
        if (deviceIds.length >= limit) {
          return res.status(403).json({ error: `安全警报：当前 Token 绑定的设备数量已达上限 (最大 ${limit} 台)` });
        }
        // 允许绑定，写入新设备
        await dbRun("INSERT INTO device_logs (token, client_id, last_seen) VALUES (?, ?, ?)", [token, clientId, Date.now()]);
      } else {
        // 已绑定设备：10分钟活跃写节流，避免高频发图频繁写 SQLite
        const record = activeDevices.find(d => d.client_id === clientId);
        if (Date.now() - record.last_seen > 10 * 60 * 1000) {
          await dbRun("UPDATE device_logs SET last_seen = ? WHERE token = ? AND client_id = ?", [Date.now(), token, clientId]);
        }
      }
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('鉴权执行异常:', err.message);
    return res.status(500).json({ error: '服务端内部鉴权异常' });
  }
}

// 核心转发路由
app.post('/proxy', checkAccess, async (req, res) => {
  const { url, method = 'GET', data, fileData, fileName, mimeType, fieldName = 'media' } = req.body;

  // 使用严格的 URL 解析校验协议与主机名，避免前缀匹配被绕过 (SSRF)
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: '非法 URL。只允许访问微信官方 API (api.weixin.qq.com)' });
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'api.weixin.qq.com') {
    return res.status(400).json({ error: '非法 URL。只允许访问微信官方 API (api.weixin.qq.com)' });
  }

  try {
    const normalizedMethod = String(method).toUpperCase();
    let response;

    if (normalizedMethod === 'UPLOAD') {
      // 1. 处理图片上传请求 (Base64 -> Buffer -> FormData)
      if (!fileData) {
        return res.status(400).json({ error: '缺少图片二进制数据 fileData' });
      }

      const buffer = Buffer.from(fileData, 'base64');
      const formData = new FormData();
      // 使用 form-data 附加 Buffer
      formData.append(fieldName, buffer, {
        filename: fileName || 'image.jpg',
        contentType: mimeType || 'image/jpeg'
      });

      response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
    } else {
      // 2. 处理普通 JSON 请求 (GET / POST)
      const opts = { method: normalizedMethod };
      if (normalizedMethod === 'POST') {
        opts.headers = { 'Content-Type': 'application/json' };
        if (data !== undefined) {
          opts.body = JSON.stringify(data);
        }
      }
      response = await fetch(url, opts);
    }

    const responseText = await response.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      return res.status(502).json({ error: '微信服务器返回了非 JSON 格式响应' });
    }

    res.status(response.status).json(result);
  } catch (error) {
    // 日志安全脱敏：仅打印错误消息，避免把包含 AppSecret 的 URL 整体写进日志
    console.error('中转转发失败:', error.message);
    res.status(500).json({ error: '代理中转请求失败，请稍后重试' });
  }
});

// 启动服务
app.listen(PORT, '127.0.0.1', () => {
  console.log(`微信中转代理服务已启动，正在监听 http://127.0.0.1:${PORT}`);
});
