/**
 * 读取本项目 package.json 中的 version 字段。
 *
 * 为什么用 fs.readFileSync 而不是 `import pkg from '../../package.json' with { type: 'json' }`：
 * - ESM 的 JSON 导入需要文件在模块解析路径上真实存在。
 * - Electron 打包后，Admin/Bridge 子进程以 ELECTRON_RUN_AS_NODE=1 启动（不走 asar 加载器），
 *   若 package.json 没被 extraResources 复制到 resources/app/，就会抛 ERR_MODULE_NOT_FOUND。
 * - 用 fs.readFileSync 逐路径试探，任一命中即可；全部失败也只是降级到 'unknown'，不会崩溃。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  // 候选路径：
  // 1. dist/utils/ → ../../package.json  （开发 / 源码部署 / Electron unpacked dist）
  // 2. dist-electron/utils/ → ../../package.json  （理论上不会走这条，但留作兜底）
  // 3. process.resourcesPath/app/package.json  （Electron 打包，若 extraResources 已配置）
  const candidates: string[] = [
    path.resolve(__dirname, '../../package.json'),
    path.resolve(__dirname, '../../../package.json'),
  ];
  const resourcesPath = (process as any).resourcesPath as string | undefined;
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'app', 'package.json'));
    candidates.push(path.join(resourcesPath, 'package.json'));
  }

  for (const p of candidates) {
    try {
      const text = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.version === 'string') {
        return parsed.version;
      }
    } catch {
      // 尝试下一个路径
    }
  }
  return 'unknown';
}

export const VERSION = readVersion();
