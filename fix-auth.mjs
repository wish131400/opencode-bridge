import fs from 'node:fs';

let adminServerTs = fs.readFileSync('src/admin/admin-server.ts', 'utf8');

adminServerTs = adminServerTs.replace(
  /if \(\!crypto\.timingSafeEqual.+?\n\s+res\.status\(401\).+?\n\s+return;\n\s+\}/s,
  `const tokenBuf = Buffer.from(token);
    const passBuf = Buffer.from(password);
    if (tokenBuf.length !== passBuf.length || !crypto.timingSafeEqual(tokenBuf, passBuf)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }`
);

fs.writeFileSync('src/admin/admin-server.ts', adminServerTs, 'utf8');
console.log('Fixed authMiddleware');
