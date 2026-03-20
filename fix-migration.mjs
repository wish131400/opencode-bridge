import fs from 'node:fs';

let configTs = fs.readFileSync('src/config.ts', 'utf8');

configTs = configTs.replace(
  /const migrated: BridgeSettings = \{\};\n\s+for \(const key of envKeys\) \{\n\s+const val = process\.env\[key\];\n\s+if \(val !== undefined && val\.trim\(\) !== ''\) \{\n\s+\(migrated as Record<string, string>\)\[key\] = val\.trim\(\);\n\s+\}\n\s+\}/,
  `const migrated: BridgeSettings = {};
  const backupParsed = dotenv.parse(content);
  for (const key of envKeys) {
    const val = backupParsed[key] ?? process.env[key];
    if (val !== undefined && val.trim() !== '') {
      (migrated as Record<string, string>)[key] = val.trim();
    }
  }`
);

fs.writeFileSync('src/config.ts', configTs, 'utf8');
console.log('Fixed migration bug');
