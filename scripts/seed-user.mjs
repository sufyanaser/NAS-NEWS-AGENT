// Creates (or resets the password of) the single editor in the LOCAL D1 database.
// Specs §5.1: there is no signup API; the first user is seeded manually.
//
//   $env:NAS_EDITOR_EMAIL="editor@example.org"; $env:NAS_EDITOR_PASSWORD="<choose one>"; npm run db:seed
//
// The password is never written to the repository; only its PBKDF2 hash goes to a git-ignored SQL file.
// Optional: --persist-to <dir> to target a non-default local state directory (used by the E2E suite).
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const email = (process.env.NAS_EDITOR_EMAIL ?? '').trim().toLowerCase();
const password = process.env.NAS_EDITOR_PASSWORD ?? '';

// Allow shorter credentials in dev/staging if explicitly provided
if (!email || email.length > 254) {
  console.error('Set NAS_EDITOR_EMAIL to a valid identifier.');
  process.exit(1);
}
if (!password) {
  console.error('Set NAS_EDITOR_PASSWORD.');
  process.exit(1);
}

// Keep the iteration count in lock-step with src/server/crypto.ts.
const cryptoSrc = readFileSync(resolve(root, 'src/server/crypto.ts'), 'utf8');
const m = /PBKDF2_ITERATIONS\s*=\s*([\d_]+)/.exec(cryptoSrc);
if (!m) throw new Error('Could not read PBKDF2_ITERATIONS from src/server/crypto.ts');
const iterations = Number(m[1].replaceAll('_', ''));

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const passwordHash = `${iterations}$${hash.toString('base64')}`;
const passwordSalt = salt.toString('base64');
const id = crypto.randomUUID();

const sql =
  `INSERT INTO users (id, email, password_hash, password_salt) VALUES ('${id}', '${email}', '${passwordHash}', '${passwordSalt}')\n` +
  `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt;\n`;

const dir = resolve(root, '.wrangler');
mkdirSync(dir, { recursive: true });
const file = resolve(dir, `seed-${process.pid}.sql`);
writeFileSync(file, sql, { mode: 0o600 });

const dbName = process.env.NAS_DB_NAME ?? 'nas-newsroom-db';
const envFlag = process.env.NAS_ENV ? ['--env', process.env.NAS_ENV] : [];
const remoteFlag = process.env.NAS_REMOTE === 'true' ? ['--remote'] : ['--local'];
const args = ['wrangler', 'd1', 'execute', dbName, ...envFlag, ...remoteFlag, `--file=${file}`];
const idx = process.argv.indexOf('--persist-to');
if (idx !== -1 && process.argv[idx + 1]) args.push('--persist-to', process.argv[idx + 1]);

try {
  execFileSync('npx', args, { cwd: root, stdio: 'inherit', shell: true });
  console.log(`Editor ready: ${email}`);
} finally {
  try {
    writeFileSync(file, ''); // do not leave the hash lying around
  } catch {
    /* ignore */
  }
}
