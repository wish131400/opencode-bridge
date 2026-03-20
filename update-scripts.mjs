import fs from 'node:fs';
import path from 'node:path';

// --- Part 1: Update scripts/deploy.mjs ---
let deployMjs = fs.readFileSync('scripts/deploy.mjs', 'utf8');

// Add crypto import if missing
if (!deployMjs.includes("import crypto from 'node:crypto';")) {
  deployMjs = deployMjs.replace("import fs from 'node:fs';", "import fs from 'node:fs';\nimport crypto from 'node:crypto';");
}

// Remove promptFeishuCredentialsSetup and related helpers we don't need
const funcsToRemove = [
  /function askText\([^)]*\)\s*\{[\s\S]*?\n\}\n/g,
  /function isSkipInput\([^)]*\)\s*\{[\s\S]*?\n\}\n/g,
  /function isPlaceholderCredentialValue\([^)]*\)\s*\{[\s\S]*?\n\}\n/g,
  /function formatEnvValue\([^)]*\)\s*\{[\s\S]*?\n\}\n/g,
  /function upsertEnvEntry\([^)]*\)\s*\{[\s\S]*?\n\}\n/g,
  /function needsFeishuCredentialSetup\([^)]*\)\s*\{[\s\S]*?\n\}\n/g,
  /function updateEnvEntries\([^)]*\)\s*\{[\s\S]*?\n\}\n/g,
  /async function promptFeishuCredentialsSetup\([^)]*\)\s*\{[\s\S]*?\n\}\n/g,
];

for (const regex of funcsToRemove) {
  deployMjs = deployMjs.replace(regex, '');
}

// Remove call to promptFeishuCredentialsSetup
deployMjs = deployMjs.replace(/\s*await promptFeishuCredentialsSetup\(\);/g, '');


// Replace ensureEnvFile
const ensureEnvFileRegex = /function ensureEnvFile\(\)\s*\{[\s\S]*?\n\}/;
const newEnsureEnvFile = `function ensureEnvFile() {
  cachedDotEnv = null;
  const envBackupPath = path.join(rootDir, '.env.backup');

  if (fs.existsSync(envPath)) {
    const rawContent = fs.readFileSync(envPath, 'utf-8');
    if (rawContent.includes('FEISHU_APP_ID') || rawContent.includes('ALLOWED_USERS')) {
      fs.renameSync(envPath, envBackupPath);
      console.log('[deploy] 📦 检测到旧版本全量 .env 文件，已自动备份为 .env.backup，将在主程序启动时顺滑迁移至 SQLite。');
    } else {
      return;
    }
  }

  const pureEnvContent = \`ADMIN_PORT=4098\\nADMIN_PASSWORD=\${crypto.randomBytes(8).toString('hex')}\\n\`;
  fs.writeFileSync(envPath, pureEnvContent, 'utf-8');
  console.log('[deploy] 🔑 已生成极简版 .env 文件（内含初始 ADMIN_PORT 和随机生成的高强度密码）。');
}`;
deployMjs = deployMjs.replace(ensureEnvFileRegex, newEnsureEnvFile);

// Update deployProject final message
deployMjs = deployMjs.replace(
  /console\.log\('\[deploy\] 部署完成'\);/,
  "console.log('\\n[deploy] 🎉 部署成功！系统默认不会拉起连接或主动外发消息。\\n[deploy] 💡 请执行菜单选项 2 启动主服务后，用浏览器访问 Web 页面配置业务参数。');"
);

// Update runBeginnerGuide final message
deployMjs = deployMjs.replace(
  /console\.log\('\\n\[deploy\] 首次引导完成，建议按顺序继续：'\);\n\s*console\.log\('.*?'\);\n\s*console\.log\('.*?'\);/,
  "console.log('\\n[deploy] 🎉 引导完成！\\n[deploy] 💡 请先启动服务，然后使用浏览器访问后续弹出的控制台地址进行飞书等配置。');"
);

// Update status output (option 7)
const printLinuxStatusRegex = /function printLinuxStatus\(\)\s*\{[\s\S]*?\n\}/;
const newPrintLinuxStatus = `function printLinuxStatus() {
  const hasService = fs.existsSync(serviceFilePath);
  console.log(\`[deploy] systemd 服务文件: \${hasService ? serviceFilePath : '未安装'}\`);

  if (hasService && canUseSystemd()) {
    const active = run('systemctl', ['is-active', serviceName], '', { allowFailure: true, capture: true });
    const enabled = run('systemctl', ['is-enabled', serviceName], '', { allowFailure: true, capture: true });
    console.log(\`[deploy] 服务状态: \${(active.stdout || '').trim() || 'unknown'}\`);
    console.log(\`[deploy] 开机自启: \${(enabled.stdout || '').trim() || 'unknown'}\`);
  }

  if (fs.existsSync(pidFile)) {
    console.log(\`[deploy] 后台进程 PID 文件: \${pidFile}\`);
  }
  
  const port = getRuntimeEnvValue('ADMIN_PORT') || '4098';
  console.log(\`[deploy] 🌐 Web 管理中心监听端口: \${port} \`);
  console.log(\`[deploy] 提示: 若服务正在运行，请使用浏览器访问 http://<机器IP>:\${port}\`);
}`;
deployMjs = deployMjs.replace(printLinuxStatusRegex, newPrintLinuxStatus);

// Fix menu texts
deployMjs = deployMjs.replace(
  /11\) 启动 OpenCode CLI（自动写入 server 配置）/g,
  '11) 启动 OpenCode CLI（调试/挂载模式）'
);
deployMjs = deployMjs.replace(
  /8\) 启动 OpenCode CLI（自动写入 server 配置）/g,
  '8) 启动 OpenCode CLI（调试/挂载模式）'
);

fs.writeFileSync('scripts/deploy.mjs', deployMjs, 'utf8');

// --- Part 2: Update src/config.ts ---
let configTs = fs.readFileSync('src/config.ts', 'utf8');

// Remove current migration trigger condition and rename logic
configTs = configTs.replace(
  /if \(!configStore\.isMigrated\(\) && fs\.existsSync\(resolvedEnvFile\)\) \{/,
  "const resolvedBackupPath = path.resolve(process.cwd(), '.env.backup');\n    if (!configStore.isMigrated() && fs.existsSync(resolvedBackupPath)) {"
);

configTs = configTs.replace(
  /const content = fs\.readFileSync\(resolvedEnvFile, 'utf-8'\);/,
  "const content = fs.readFileSync(resolvedBackupPath, 'utf-8');"
);

configTs = configTs.replace(
  /fs\.renameSync\(resolvedEnvFile, backupPath\);/g,
  "// No longer rename the file since we read from .env.backup"
);

fs.writeFileSync('src/config.ts', configTs, 'utf8');

// --- Part 3: Update src/admin/admin-server.ts ---
let adminServerTs = fs.readFileSync('src/admin/admin-server.ts', 'utf8');
adminServerTs = adminServerTs.replace(
  /server = app\.listen\(port, '0\.0\.0\.0', \(\) => \{[\s\S]*?\}\);/,
  `server = app.listen(port, '0.0.0.0', () => {
    const interfaces = require('os').networkInterfaces();
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
    console.log(\`[Admin] 可视化配置面板已启动: http://\${lanIp}:\${port}\`);
  });`
);
fs.writeFileSync('src/admin/admin-server.ts', adminServerTs, 'utf8');

console.log('Scripts updated successfully!');
