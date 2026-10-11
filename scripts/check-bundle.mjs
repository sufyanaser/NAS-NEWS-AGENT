// Fails the build if anything secret-shaped or any server-side name ended up in the browser bundle (Specs §14 #8).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist/client');

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const forbidden = [
  /AI_API_KEY/i,
  /SESSION_SIGNING_KEY/i,
  /sk-[A-Za-z0-9]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY/,
  /api[_-]?key\s*[:=]\s*["'][^"']{8,}/i,
  /password_hash|password_salt/i,
];

let bad = 0;
const files = walk(dist);
if (files.length === 0) {
  console.error('dist/client is empty; run `npm run build` first.');
  process.exit(1);
}
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const re of forbidden) {
    if (re.test(text)) {
      console.error(`FORBIDDEN in ${f}: ${re}`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log(`bundle check passed: ${files.length} files, no secrets or server-only identifiers`);
