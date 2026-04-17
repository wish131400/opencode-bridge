import express from 'express';
import { simpleGit } from 'simple-git';
import type { Response } from 'express';
import { getWorkspaceDirectoryInput, resolveWorkspaceDirectory } from './workspace-utils.js';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Unknown error';
}

function isUntracked(index: string, workingTree: string): boolean {
  return index === '?' || workingTree === '?';
}

function isConflicted(index: string, workingTree: string): boolean {
  return index === 'U' || workingTree === 'U' || (index === 'A' && workingTree === 'A');
}

function sendGitError(res: Response, error: unknown, fallbackMessage: string): void {
  const message = errorMessage(error);
  console.error(`[Workspace Git] ${fallbackMessage}:`, error);
  res.status(502).json({ error: message || fallbackMessage });
}

export function registerWorkspaceGitRoutes(api: express.Router): void {
  api.get('/workspace/git/status', async (req, res) => {
    const resolvedDirectory = resolveWorkspaceDirectory(getWorkspaceDirectoryInput(req));
    if (!resolvedDirectory.ok) {
      res.status(resolvedDirectory.status).json({ error: resolvedDirectory.error });
      return;
    }

    try {
      const git = simpleGit(resolvedDirectory.directory);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        res.status(409).json({ error: '当前目录不是 Git 仓库。' });
        return;
      }

      const [status, branches, log, repositoryRoot] = await Promise.all([
        git.status(),
        git.branchLocal(),
        git.log({ maxCount: 1 }),
        git.revparse(['--show-toplevel']),
      ]);

      const files = status.files.map(file => {
        const index = file.index ?? ' ';
        const workingTree = file.working_dir ?? ' ';
        const untracked = isUntracked(index, workingTree);
        const conflicted = isConflicted(index, workingTree);
        const staged = !untracked && index.trim().length > 0 && !conflicted;
        const modified = !untracked && workingTree.trim().length > 0 && !conflicted;

        return {
          path: file.path,
          index,
          workingTree,
          staged,
          modified,
          untracked,
          conflicted,
        };
      });

      const lastCommit = log.latest
        ? {
            hash: log.latest.hash,
            message: log.latest.message,
            authorName: log.latest.author_name,
            date: log.latest.date,
          }
        : undefined;

      res.json({
        directory: resolvedDirectory.directory,
        repositoryRoot: repositoryRoot.trim() || resolvedDirectory.directory,
        branch: status.current || branches.current || 'HEAD',
        tracking: status.tracking || undefined,
        ahead: status.ahead ?? 0,
        behind: status.behind ?? 0,
        clean: files.length === 0,
        detached: Boolean(status.detached),
        branches: branches.all,
        counts: {
          staged: files.filter(file => file.staged).length,
          modified: files.filter(file => file.modified).length,
          untracked: files.filter(file => file.untracked).length,
          conflicted: files.filter(file => file.conflicted).length,
        },
        files,
        lastCommit,
      });
    } catch (error) {
      sendGitError(res, error, '获取 Git 状态失败');
    }
  });

  api.get('/workspace/git/diff', async (req, res) => {
    const resolvedDirectory = resolveWorkspaceDirectory(getWorkspaceDirectoryInput(req));
    if (!resolvedDirectory.ok) {
      res.status(resolvedDirectory.status).json({ error: resolvedDirectory.error });
      return;
    }

    const filePath = typeof req.query.filePath === 'string' && req.query.filePath.trim()
      ? req.query.filePath.trim()
      : undefined;
    const staged = req.query.staged === 'true';

    try {
      const git = simpleGit(resolvedDirectory.directory);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        res.status(409).json({ error: '当前目录不是 Git 仓库。' });
        return;
      }

      const args: string[] = [];
      if (staged) {
        args.push('--cached');
      }
      if (filePath) {
        args.push('--', filePath);
      }

      const diff = await git.diff(args);
      res.json({
        directory: resolvedDirectory.directory,
        filePath,
        staged,
        diff,
      });
    } catch (error) {
      sendGitError(res, error, '获取 Git diff 失败');
    }
  });

  api.post('/workspace/git/commit', async (req, res) => {
    const resolvedDirectory = resolveWorkspaceDirectory(getWorkspaceDirectoryInput(req));
    if (!resolvedDirectory.ok) {
      res.status(resolvedDirectory.status).json({ error: resolvedDirectory.error });
      return;
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: '缺少 commit message。' });
      return;
    }

    // files: optional array of file paths to stage; if omitted, stages all changes
    const rawFiles = req.body?.files;
    const files: string[] | null = Array.isArray(rawFiles) && rawFiles.length > 0
      ? rawFiles.filter((f: unknown): f is string => typeof f === 'string' && f.trim().length > 0).map((f: string) => f.trim())
      : null;

    try {
      const git = simpleGit(resolvedDirectory.directory);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        res.status(409).json({ error: '当前目录不是 Git 仓库。' });
        return;
      }

      if (files && files.length > 0) {
        await git.add(files);
      } else {
        await git.add(['-A']);
      }
      const result = await git.commit(message);

      res.json({
        ok: true,
        commit: {
          hash: result.commit,
          branch: result.branch,
          summary: result.summary,
        },
      });
    } catch (error) {
      sendGitError(res, error, '提交变更失败');
    }
  });

  api.post('/workspace/git/pull', async (req, res) => {
    const resolvedDirectory = resolveWorkspaceDirectory(getWorkspaceDirectoryInput(req));
    if (!resolvedDirectory.ok) {
      res.status(resolvedDirectory.status).json({ error: resolvedDirectory.error });
      return;
    }

    try {
      const git = simpleGit(resolvedDirectory.directory);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        res.status(409).json({ error: '当前目录不是 Git 仓库。' });
        return;
      }

      const result = await git.pull();
      res.json({ ok: true, result });
    } catch (error) {
      sendGitError(res, error, '拉取远端变更失败');
    }
  });

  api.post('/workspace/git/push', async (req, res) => {
    const resolvedDirectory = resolveWorkspaceDirectory(getWorkspaceDirectoryInput(req));
    if (!resolvedDirectory.ok) {
      res.status(resolvedDirectory.status).json({ error: resolvedDirectory.error });
      return;
    }

    try {
      const git = simpleGit(resolvedDirectory.directory);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        res.status(409).json({ error: '当前目录不是 Git 仓库。' });
        return;
      }

      const result = await git.push();
      res.json({ ok: true, result });
    } catch (error) {
      sendGitError(res, error, '推送远端失败');
    }
  });

  api.post('/workspace/git/checkout', async (req, res) => {
    const resolvedDirectory = resolveWorkspaceDirectory(getWorkspaceDirectoryInput(req));
    if (!resolvedDirectory.ok) {
      res.status(resolvedDirectory.status).json({ error: resolvedDirectory.error });
      return;
    }

    const branch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : '';
    if (!branch) {
      res.status(400).json({ error: '缺少 branch。' });
      return;
    }

    try {
      const git = simpleGit(resolvedDirectory.directory);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        res.status(409).json({ error: '当前目录不是 Git 仓库。' });
        return;
      }

      await git.checkout(branch);
      res.json({ ok: true, branch });
    } catch (error) {
      sendGitError(res, error, '切换分支失败');
    }
  });
}
