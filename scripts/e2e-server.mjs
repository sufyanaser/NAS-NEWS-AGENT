// Starts a fully local, throw-away environment for the E2E suite: fresh D1 state, real migrations,
// a seeded editor with a random password, and `wrangler dev --local`. Nothing touches Cloudflare.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const state = resolve(root, '.wrangler/e2e-state');
const port = process.env.E2E_PORT ?? '8799';

const sh = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });

rmSync(state, { recursive: true, force: true });
mkdirSync(resolve(root, '.wrangler'), { recursive: true });

sh('npm', ['run', 'build']);
sh('npx', ['wrangler', 'd1', 'migrations', 'apply', 'nas-newsroom-db', '--local', '--persist-to', state]);

const creds = { email: 'e2e-editor@example.test', password: randomBytes(18).toString('base64url') };
writeFileSync(resolve(root, '.wrangler/e2e-creds.json'), JSON.stringify(creds), { mode: 0o600 });
sh('node', ['scripts/seed-user.mjs', '--persist-to', state], { NAS_EDITOR_EMAIL: creds.email, NAS_EDITOR_PASSWORD: creds.password });

const dev = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    '--local',
    '--port',
    port,
    '--local-upstream',
    `localhost:${port}`,
    '--upstream-protocol',
    'http',
    '--persist-to',
    state,
    '--var',
    `ALLOWED_ORIGIN:http://localhost:${port}`,
  ],
  { cwd: root, stdio: 'inherit', shell: true },
);
const stop = () => {
  dev.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
dev.on('exit', (code) => process.exit(code ?? 0));
