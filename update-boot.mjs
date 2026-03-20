import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// --- Part 1: config.ts updates ---
let configTs = fs.readFileSync('src/config.ts', 'utf8');

// Ensure native path and crypto are imported if needed (already has node:path)
if (!configTs.includes("import crypto from 'node:crypto';")) {
  configTs = configTs.replace("import path from 'node:path';", "import path from 'node:path';\nimport crypto from 'node:crypto';");
}

// Add fallback to generate .env if it doesn't exist
const ensureEnvCode = `
// 自动为首次通过 npm run dev 启动的用户生成必要的安全配置文件
if (!resolvedEnvFile) {
  const generatedEnvFile = path.resolve(process.cwd(), '.env');
  const pureEnvContent = \`ADMIN_PORT=4098\\nADMIN_PASSWORD=\${crypto.randomBytes(8).toString('hex')}\\n\`;
  fs.writeFileSync(generatedEnvFile, pureEnvContent, 'utf-8');
  console.log('[Config] 🔑 检测到无 .env 文件，已自动生成默认包含 ADMIN_PORT=4098 与高强度口令的 .env 文件。');
  dotenv.config({ path: generatedEnvFile });
  process.env.OPENCODE_BRIDGE_ACTIVE_ENV_FILE = generatedEnvFile;
} else {
  dotenv.config({ path: resolvedEnvFile });
  process.env.OPENCODE_BRIDGE_ACTIVE_ENV_FILE ??= resolvedEnvFile;
}
`;

configTs = configTs.replace(
  /\/\/ 始终加载 \.env[\s\S]*?if \(resolvedEnvFile\) \{[\s\S]*?dotenv\.config[\s\S]*?OPENCODE_BRIDGE_ACTIVE_ENV_FILE \?\?= resolvedEnvFile;\n\}/g,
  ensureEnvCode
);
fs.writeFileSync('src/config.ts', configTs, 'utf8');

// --- Part 2: index.ts updates ---
let indexTs = fs.readFileSync('src/index.ts', 'utf8');

const validateConfigRegex = /try \{\n\s*validateConfig\(\);\n\s*\} catch \(error\) \{\n\s*console\.error\('.*?', error\);\n\s*process\.exit\(1\);\n\s*\}/;

const newValidateConfigCode = `let isFeishuConfigured = true;
  try {
    validateConfig();
  } catch (error) {
    console.warn('[Config] ⚠️ 飞书核心凭据未配置完备（可能是首次部署），飞书机器人核心服务暂不拉起。');
    console.warn('[Config] 💡 核心管理后台即将启动，请前往 Web 控制台配置相关参数并按提示重启服务生效！');
    isFeishuConfigured = false;
  }`;

indexTs = indexTs.replace(validateConfigRegex, newValidateConfigCode);

// Wrap feishuClient.start() in if (isFeishuConfigured)
indexTs = indexTs.replace(
  /await feishuClient\.start\(\);/g,
  "if (isFeishuConfigured) { await feishuClient.start(); } else { console.log('[System] 飞书长连接暂未启动 (等待凭据配置)'); }"
);

fs.writeFileSync('src/index.ts', indexTs, 'utf8');
console.log('Boot config patched successfully');
