import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { getWorkspaceDirectoryInput, resolveWorkspaceDirectory, resolveWorkspacePath } from './workspace-utils.js';

const TREE_LIMIT_DEFAULT = 200;
const TREE_LIMIT_MAX = 500;
const FILE_PREVIEW_BYTES = 120_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Unknown error';
}

function detectBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function parseTreeLimit(raw: unknown): number {
  if (typeof raw !== 'string' || !raw.trim()) {
    return TREE_LIMIT_DEFAULT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return TREE_LIMIT_DEFAULT;
  }

  return Math.min(parsed, TREE_LIMIT_MAX);
}

export function registerWorkspaceFilesRoutes(api: express.Router): void {
  api.get('/workspace/files/tree', async (req, res) => {
    const resolvedDirectory = resolveWorkspaceDirectory(getWorkspaceDirectoryInput(req));
    if (!resolvedDirectory.ok) {
      res.status(resolvedDirectory.status).json({ error: resolvedDirectory.error });
      return;
    }

    const resolvedPath = resolveWorkspacePath(resolvedDirectory.directory, req.query.path);
    if (!resolvedPath.ok) {
      res.status(resolvedPath.status).json({ error: resolvedPath.error });
      return;
    }

    try {
      const stats = await fs.stat(resolvedPath.absolutePath);
      if (!stats.isDirectory()) {
        res.status(400).json({ error: '目标路径不是目录。' });
        return;
      }

      const limit = parseTreeLimit(req.query.limit);
      const items = await fs.readdir(resolvedPath.absolutePath, { withFileTypes: true });
      const visibleItems = items
        .filter(item => item.name !== '.git')
        .sort((left, right) => {
          if (left.isDirectory() !== right.isDirectory()) {
            return left.isDirectory() ? -1 : 1;
          }
          return left.name.localeCompare(right.name, 'zh-Hans-CN');
        });

      const selectedItems = visibleItems.slice(0, limit);
      const entries = await Promise.all(
        selectedItems.map(async item => {
          const absoluteChildPath = path.join(resolvedPath.absolutePath, item.name);
          const childStats = await fs.stat(absoluteChildPath);
          const relativeChildPath = path.relative(resolvedDirectory.directory, absoluteChildPath).split(path.sep).join('/');

          return {
            name: item.name,
            path: relativeChildPath,
            type: childStats.isDirectory() ? 'directory' : 'file',
            size: childStats.isDirectory() ? 0 : childStats.size,
            mtimeMs: childStats.mtimeMs,
          };
        })
      );

      res.json({
        directory: resolvedDirectory.directory,
        path: resolvedPath.relativePath,
        entries,
        truncated: visibleItems.length > selectedItems.length,
      });
    } catch (error) {
      console.error('[Workspace Files] 获取目录失败:', error);
      res.status(502).json({ error: errorMessage(error) });
    }
  });

  api.get('/workspace/files/content', async (req, res) => {
    const resolvedDirectory = resolveWorkspaceDirectory(getWorkspaceDirectoryInput(req));
    if (!resolvedDirectory.ok) {
      res.status(resolvedDirectory.status).json({ error: resolvedDirectory.error });
      return;
    }

    const resolvedPath = resolveWorkspacePath(resolvedDirectory.directory, req.query.path);
    if (!resolvedPath.ok) {
      res.status(resolvedPath.status).json({ error: resolvedPath.error });
      return;
    }

    try {
      const stats = await fs.stat(resolvedPath.absolutePath);
      if (!stats.isFile()) {
        res.status(400).json({ error: '目标路径不是文件。' });
        return;
      }

      const handle = await fs.open(resolvedPath.absolutePath, 'r');
      try {
        const bytesToRead = Math.min(stats.size, FILE_PREVIEW_BYTES);
        const buffer = Buffer.alloc(bytesToRead);
        await handle.read(buffer, 0, bytesToRead, 0);
        const isBinary = detectBinary(buffer);

        res.json({
          directory: resolvedDirectory.directory,
          path: resolvedPath.relativePath,
          size: stats.size,
          truncated: stats.size > FILE_PREVIEW_BYTES,
          isBinary,
          content: isBinary ? '' : buffer.toString('utf-8'),
        });
      } finally {
        await handle.close();
      }
    } catch (error) {
      console.error('[Workspace Files] 读取文件失败:', error);
      res.status(502).json({ error: errorMessage(error) });
    }
  });
}
