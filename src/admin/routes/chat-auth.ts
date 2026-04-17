import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { configStore } from '../../store/config-store.js';

function extractToken(req: Request): string {
  const authHeader = req.headers.authorization ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const token = req.query.token;
  return typeof token === 'string' ? token : '';
}

function safeEquals(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left, 'utf-8');
  const rightBuf = Buffer.from(right, 'utf-8');
  const maxLen = Math.max(leftBuf.length, rightBuf.length, 64);

  const paddedLeft = Buffer.alloc(maxLen);
  const paddedRight = Buffer.alloc(maxLen);
  leftBuf.copy(paddedLeft);
  rightBuf.copy(paddedRight);

  return crypto.timingSafeEqual(paddedLeft, paddedRight);
}

export function isChatAuthorized(req: Request): boolean {
  const currentPassword = configStore.getAdminPassword() || '';
  if (!currentPassword) {
    return true;
  }

  const token = extractToken(req);
  if (!token) {
    return false;
  }

  return safeEquals(token, currentPassword);
}

export function chatAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isChatAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
