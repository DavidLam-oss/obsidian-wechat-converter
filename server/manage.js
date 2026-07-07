/*
## 核心功能

提供代理服务的管理脚本，用于本地或部署环境中的启动、状态和运维操作。

## 输入

接收 HTTP 请求、环境变量、微信开放平台配置和部署运行时信号。

## 输出

输出代理 API 响应、健康状态、日志或服务管理结果。

## 定位

位于 server/，是可选后端辅助服务；插件主流程必须能在没有它时按设置降级。

## 依赖

关键依赖：`sqlite3`、`path`、`crypto`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 server 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH);

// 提取命令行参数的辅助函数
function getArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  // 第一个参数通常是 action
  parsed.action = args[0];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        parsed[key] = val;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function closeDbAndExit(code = 0) {
  db.close(() => {
    process.exit(code);
  });
}

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
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

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

async function main() {
  const args = getArgs();
  const action = args.action;

  if (!action) {
    console.log(`
微信中转服务 CLI 运维工具：
使用方法: node manage.js [action] [options]

可用的 action：
  add             创建新 Token 并分配有效期和设备上限
  renew           延长指定 Token 的有效期
  reset-devices   清空指定 Token 绑定的所有设备记录
  list            列出所有 Token 及其状态

选项：
  --token         指定 Token 字符串（如不指定 add 会自动生成随机 Token）
  --days          指定天数（如 365 表示一年）
  --limit         设备最大绑定限制数量（默认 3）
  --comment       用户备注（如微信昵称、手机号或付款日期）
`);
    closeDbAndExit(0);
  }

  // 检查数据表是否已经建立
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      token TEXT PRIMARY KEY,
      expired_at INTEGER NOT NULL,
      device_limit INTEGER DEFAULT 3,
      comment TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS device_logs (
      token TEXT,
      client_id TEXT,
      last_seen INTEGER,
      PRIMARY KEY (token, client_id)
    )
  `);

  if (action === 'add') {
    const token = args.token || 'wp_user_' + crypto.randomBytes(8).toString('hex');
    const days = parseInt(args.days) || 365;
    const limit = parseInt(args.limit) || 3;
    const comment = args.comment || '';

    const expiredAt = Date.now() + days * 24 * 60 * 60 * 1000;

    try {
      await dbRun(
        "INSERT OR REPLACE INTO users (token, expired_at, device_limit, comment) VALUES (?, ?, ?, ?)",
        [token, expiredAt, limit, comment]
      );
      const expiryDate = new Date(expiredAt).toLocaleString('zh-CN');
      console.log(`\n✅ 成功创建/替换用户 Token!`);
      console.log(`==========================================`);
      console.log(`Token   : ${token}`);
      console.log(`有效期  : ${days} 天 (到期日: ${expiryDate})`);
      console.log(`设备上限: ${limit} 台`);
      console.log(`备注    : ${comment}`);
      console.log(`==========================================`);
    } catch (err) {
      console.error('❌ 添加 Token 失败:', err.message);
    }
    closeDbAndExit(0);
  }

  else if (action === 'renew') {
    const token = args.token;
    const days = parseInt(args.days);

    if (!token || isNaN(days)) {
      console.error('❌ 错误: renew 必须传入 --token <token> 和 --days <天数>');
      closeDbAndExit(1);
    }

    try {
      const user = await dbGet("SELECT * FROM users WHERE token = ?", [token]);
      if (!user) {
        console.error(`❌ 未找到该 Token: ${token}`);
        closeDbAndExit(1);
      }

      // 如果当前已经过期，基于当前时间续费；否则基于原过期时间累加
      const baseTime = Math.max(Date.now(), user.expired_at);
      const newExpiredAt = baseTime + days * 24 * 60 * 60 * 1000;

      await dbRun("UPDATE users SET expired_at = ? WHERE token = ?", [newExpiredAt, token]);
      console.log(`\n✅ Token 续费成功!`);
      console.log(`==========================================`);
      console.log(`Token   : ${token}`);
      console.log(`新增天数: ${days} 天`);
      console.log(`新到期日: ${new Date(newExpiredAt).toLocaleString('zh-CN')}`);
      console.log(`==========================================`);
    } catch (err) {
      console.error('❌ 续费失败:', err.message);
    }
    closeDbAndExit(0);
  }

  else if (action === 'reset-devices') {
    const token = args.token;

    if (!token) {
      console.error('❌ 错误: reset-devices 必须传入 --token <token>');
      closeDbAndExit(1);
    }

    try {
      const user = await dbGet("SELECT * FROM users WHERE token = ?", [token]);
      if (!user) {
        console.error(`❌ 未找到该 Token: ${token}`);
        closeDbAndExit(1);
      }

      await dbRun("DELETE FROM device_logs WHERE token = ?", [token]);
      console.log(`\n✅ 成功重置该 Token 绑定的所有历史设备，用户可以立即重新进行绑定!`);
    } catch (err) {
      console.error('❌ 重置设备绑定失败:', err.message);
    }
    closeDbAndExit(0);
  }

  else if (action === 'list') {
    try {
      const users = await dbAll("SELECT * FROM users ORDER BY created_at DESC");
      
      if (users.length === 0) {
        console.log('\n数据库中目前没有任何 Token。可以使用 add 命令进行创建。');
        closeDbAndExit(0);
      }

      console.log(`\n总共有 ${users.length} 个 Token：`);
      console.log(`-------------------------------------------------------------------------------------------------------`);
      console.log(`| Token                  | 状态   | 到期时间            | 设备上限 | 备注                 |`);
      console.log(`-------------------------------------------------------------------------------------------------------`);
      
      const now = Date.now();
      for (const u of users) {
        const isExpired = now > u.expired_at;
        const status = isExpired ? '已过期' : '正常';
        const expiryDate = new Date(u.expired_at).toISOString().split('T')[0];
        
        // 补齐空格对齐列
        const tokenStr = u.token.padEnd(22).substring(0, 22);
        const statusStr = status.padEnd(4);
        const dateStr = expiryDate.padEnd(18);
        const limitStr = String(u.device_limit).padStart(4) + ' 台';
        const commentStr = (u.comment || '').substring(0, 20).padEnd(20);

        console.log(`| ${tokenStr} | ${statusStr}   | ${dateStr}  | ${limitStr} | ${commentStr} |`);
      }
      console.log(`-------------------------------------------------------------------------------------------------------`);
    } catch (err) {
      console.error('❌ 查询列表失败:', err.message);
    }
    closeDbAndExit(0);
  }

  else {
    console.error(`❌ 未知操作 Action: ${action}。输入 node manage.js 查看帮助。`);
    closeDbAndExit(1);
  }
}

main().catch(err => {
  console.error('脚本运行异常:', err);
  closeDbAndExit(1);
});
