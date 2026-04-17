/**
 * chat-prompt.ts — 发送消息（异步，前端通过 SSE 收取增量）
 *
 * POST /api/chat/prompt
 * Body:
 *   {
 *     sessionId: string,
 *     parts: Array<{ type: 'text', text: string } | { type: 'file', mime: string, url: string, filename?: string }>,
 *     providerId?: string,
 *     modelId?: string,
 *     agent?: string,
 *     variant?: string,
 *     directory?: string
 *   }
 *
 * 成功返回 { ok: true }，模型输出由 /api/chat/events SSE 推送。
 *
 * 见 plan-v2.md 第四节。
 */

import express, { type Request, type Response, type Application } from 'express';
import { opencodeClient } from '../../opencode/client.js';
import { chatAuthMiddleware } from './chat-auth.js';

interface PromptRequestBody {
  sessionId?: string;
  parts?: Array<{ type: 'text'; text: string } | { type: 'file'; mime: string; url: string; filename?: string }>;
  providerId?: string;
  modelId?: string;
  agent?: string;
  variant?: string;
  directory?: string;
}

function errorMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

function validateParts(parts: unknown): parts is PromptRequestBody['parts'] {
  if (!Array.isArray(parts) || parts.length === 0) return false;
  for (const p of parts) {
    if (!p || typeof p !== 'object') return false;
    const rec = p as Record<string, unknown>;
    if (rec.type === 'text') {
      if (typeof rec.text !== 'string') return false;
    } else if (rec.type === 'file') {
      if (typeof rec.mime !== 'string' || typeof rec.url !== 'string') return false;
    } else {
      return false;
    }
  }
  return true;
}

export function registerChatPromptRoutes(app: Application): void {
  const router = express.Router();
  router.use(chatAuthMiddleware);

  router.post('/prompt', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as PromptRequestBody;
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
      if (!sessionId) {
        res.status(400).json({ error: '缺少 sessionId' });
        return;
      }
      if (!validateParts(body.parts)) {
        res.status(400).json({ error: 'parts 必须为非空数组，仅支持 text / file 两种类型' });
        return;
      }

      await opencodeClient.sendMessagePartsAsync(sessionId, body.parts!, {
        providerId: body.providerId,
        modelId: body.modelId,
        agent: body.agent,
        variant: body.variant,
        directory: body.directory,
      });

      res.json({ ok: true });
    } catch (e) {
      console.error('[Chat API] 发送消息失败:', e);
      res.status(502).json({ error: errorMsg(e) });
    }
  });

  app.use('/api/chat', router);
}
