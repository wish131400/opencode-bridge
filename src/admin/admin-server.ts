/**
 * Admin HTTP Server（外挂式，不影响主服务）
 *
 * 提供：
 * - GET  /api/config          读取当前配置
 * - POST /api/config          全量保存配置，返回 needRestart 标志
 * - GET  /api/cron            列出所有运行时 Cron 任务
 * - POST /api/cron/:id/toggle 切换任务启用/禁用
 * - DELETE /api/cron/:id      删除任务
 * - POST /api/admin/restart   重启进程（exit 0，依赖 PM2/systemd）
 * - GET  /api/admin/status    服务状态（uptime、版本等）
 * - 静态托管 dist/public/     (前端构建产物)
 */

import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { configStore, type BridgeSettings } from '../store/config-store.js';
import type { RuntimeCronManager } from '../reliability/runtime-cron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────
// 需要重启才能生效的敏感配置项
// ──────────────────────────────────────────────
const RESTART_REQUIRED_KEYS: (keyof BridgeSettings)[] = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_ENCRYPT_KEY',
  'FEISHU_VERIFICATION_TOKEN',
  'DISCORD_ENABLED',
  'DISCORD_TOKEN',
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'OPENCODE_HOST',
  'OPENCODE_PORT',
  'OPENCODE_SERVER_USERNAME',
  'OPENCODE_SERVER_PASSWORD',
  'OPENCODE_AUTO_START',
  'OPENCODE_AUTO_START_CMD',
  'RELIABILITY_CRON_ENABLED',
  'RELIABILITY_CRON_API_ENABLED',
  'RELIABILITY_CRON_API_HOST',
  'RELIABILITY_CRON_API_PORT',
  'RELIABILITY_CRON_API_TOKEN',
];

export interface AdminServerOptions {
  port: number;
  password: string;
  cronManager?: RuntimeCronManager;
  startedAt?: Date;
  version?: string;
}

export function createAdminServer(options: AdminServerOptions): { start: () => void; stop: () => void } {
  const app = express();
  const { port, password, cronManager } = options;
  const startedAt = options.startedAt ?? new Date();
  const version = options.version ?? 'unknown';

  app.use(express.json());

  // ── 静态前端文件（dist/public）
  const publicDir = path.resolve(__dirname, '../../dist/public');
  app.use(express.static(publicDir));

  // ── 基础 Token 鉴权中间件（Bearer password）
  function authMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    if (!password) {
      next();
      return;
    }
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const tokenBuf = Buffer.from(token);
    const passBuf = Buffer.from(password);
    if (tokenBuf.length !== passBuf.length || !crypto.timingSafeEqual(tokenBuf, passBuf)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }

  const api = express.Router();
  api.use(authMiddleware);

  // ── GET /api/config
  api.get('/config', (_req, res) => {
    const settings = configStore.get();
    // 脱敏：不直接返回密钥原文给前端（返回掩码，前端保存时若未修改则不覆盖）
    const masked = { ...settings };
    const secretKeys: (keyof BridgeSettings)[] = [
      'FEISHU_APP_SECRET',
      'DISCORD_TOKEN',
      'DISCORD_BOT_TOKEN',
      'OPENCODE_SERVER_PASSWORD',
      'RELIABILITY_CRON_API_TOKEN',
    ];
    for (const k of secretKeys) {
      if (masked[k]) {
        masked[k] = '••••••••';
      }
    }
    res.json({ settings: masked });
  });

  // ── POST /api/config
  api.post('/config', (req, res) => {
    const incoming = req.body as Partial<BridgeSettings>;
    const current = configStore.get();

    // 若前端传来的仍是掩码值，则保留原始值
    const MASK = '••••••••';
    const secretKeys: (keyof BridgeSettings)[] = [
      'FEISHU_APP_SECRET',
      'DISCORD_TOKEN',
      'DISCORD_BOT_TOKEN',
      'OPENCODE_SERVER_PASSWORD',
      'RELIABILITY_CRON_API_TOKEN',
    ];
    const merged: BridgeSettings = { ...current };
    for (const [k, v] of Object.entries(incoming)) {
      const key = k as keyof BridgeSettings;
      if (secretKeys.includes(key) && v === MASK) {
        // 保留原值，不覆盖
        continue;
      }
      if (v === undefined || v === '') {
        delete merged[key];
      } else {
        (merged as Record<string, string>)[key] = String(v);
      }
    }

    configStore.set(merged);

    // 检测哪些敏感 key 发生了变更
    const changedRestartKeys = RESTART_REQUIRED_KEYS.filter(k => {
      const oldVal = (current as Record<string, string | undefined>)[k] ?? '';
      const newVal = (incoming as Record<string, string | undefined>)[k] ?? '';
      return newVal !== MASK && newVal !== oldVal;
    });

    res.json({
      ok: true,
      needRestart: changedRestartKeys.length > 0,
      changedKeys: changedRestartKeys,
    });
  });

  // ── GET /api/cron
  api.get('/cron', (_req, res) => {
    if (!cronManager) {
      res.json({ jobs: [] });
      return;
    }
    res.json({ jobs: cronManager.listJobs() });
  });

  // ── POST /api/cron/create
  api.post('/cron/create', (req, res) => {
    if (!cronManager) {
      res.status(503).json({ error: 'CronManager not available' });
      return;
    }
    const { name, cronExpression, platform, conversationId, prompt } = req.body;
    if (!cronExpression || !platform || !conversationId) {
      res.status(400).json({ error: 'Missing required fields: cronExpression, platform, conversationId' });
      return;
    }
    try {
      const job = cronManager.addJob({
        name: name || 'Custom Cron',
        schedule: { kind: 'cron', expr: cronExpression },
        payload: {
          kind: 'systemEvent',
          text: prompt || 'Please respond with OK',
          delivery: {
            platform,
            conversationId,
          },
        },
        enabled: true,
      });
      res.json({ ok: true, job });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to create job' });
    }
  });

  // ── POST /api/cron/:id/toggle
  api.post('/cron/:id/toggle', (req, res) => {
    if (!cronManager) {
      res.status(503).json({ error: 'CronManager not available' });
      return;
    }
    const job = cronManager.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    const updated = cronManager.updateJob({ id: job.id, enabled: !job.enabled });
    res.json({ ok: true, job: updated });
  });

  // ── DELETE /api/cron/:id
  api.delete('/cron/:id', (req, res) => {
    if (!cronManager) {
      res.status(503).json({ error: 'CronManager not available' });
      return;
    }
    const removed = cronManager.removeJob(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ ok: true });
  });

  // ── GET /api/admin/status
  api.get('/admin/status', (_req, res) => {
    res.json({
      version,
      uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      startedAt: startedAt.toISOString(),
      dbPath: configStore.getDbPath(),
      cronJobCount: cronManager?.listJobs().length ?? 0,
    });
  });

  // ── POST /api/admin/restart
  api.post('/admin/restart', (_req, res) => {
    res.json({ ok: true, message: '服务将在 1 秒后重启' });
    setTimeout(() => {
      console.log('[Admin] 用户从控制台触发重启...');
      process.exit(0);
    }, 1000);
  });

  app.use('/api', api);

  // SPA fallback（所有非 /api 路由返回 index.html）
  app.use((_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    start() {
      server = app.listen(port, '0.0.0.0', () => {
    const interfaces = os.networkInterfaces();
    let lanIp = 'localhost';
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          lanIp = net.address;
          break;
        }
      }
      if (lanIp !== 'localhost') break;
    }
    console.log(`[Admin] 可视化配置面板已启动: http://${lanIp}:${port}`);
  });
    },
    stop() {
      server?.close();
    },
  };
}
