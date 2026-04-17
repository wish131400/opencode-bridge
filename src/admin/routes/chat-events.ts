import { Request, Response } from 'express';
import { chatEventBus } from '../chat/event-bus.js';
import type { AddressedChatEvent } from '../chat/types.js';
import { chatAuthMiddleware } from './chat-auth.js';

interface SSEQuery {
  session_id?: string;
  since?: string;
}

function writeEvent(res: Response, addressedEvent: AddressedChatEvent): void {
  const data = JSON.stringify(addressedEvent.event);
  res.write(`id: ${addressedEvent.seq}\nevent: ${addressedEvent.event.type}\ndata: ${data}\n\n`);
}

function parseSinceSeq(req: Request): number | undefined {
  const query = req.query as SSEQuery;
  const candidates = [
    typeof query.since === 'string' ? query.since : undefined,
    typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : undefined,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

export async function sseHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as SSEQuery;
  const sessionId = typeof query.session_id === 'string' ? query.session_id : undefined;
  const sinceSeq = parseSinceSeq(req);
  const clientId = Math.random().toString(36).substring(7);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`id: 0\nevent: connected\ndata: {"clientId":"${clientId}"}\n\n`);

  const eventHandler = (addressedEvent: AddressedChatEvent) => {
    if (sessionId && addressedEvent.sessionId !== sessionId) {
      return;
    }

    try {
      writeEvent(res, addressedEvent);
    } catch (err) {
      console.error('[Chat Events] Failed to write SSE event:', err, clientId);
    }
  };

  if (sessionId) {
    for (const snapshotEvent of chatEventBus.snapshot(sessionId, sinceSeq)) {
      writeEvent(res, snapshotEvent);
    }
  }

  const unsubscribe = sessionId
    ? chatEventBus.subscribe(sessionId, eventHandler)
    : (() => {
        chatEventBus.on('publish', eventHandler);
        return () => chatEventBus.off('publish', eventHandler);
      })();

  const keepalive = setInterval(() => {
    res.write('event: keepalive\ndata: {"type":"keepalive"}\n\n');
  }, 15000);

  console.log('[Chat Events] SSE client connected:', clientId, sessionId);

  req.on('close', () => {
    clearInterval(keepalive);
    unsubscribe();
    console.log('[Chat Events] SSE client disconnected:', clientId);
  });
}

export function registerChatEventsRoutes(app: any): void {
  app.get('/api/chat/events', chatAuthMiddleware, sseHandler);
  console.log('[Chat Routes] Chat events route registered: GET /api/chat/events');
}
