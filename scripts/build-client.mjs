// Bundles the browser app into dist/client (served by Workers Static Assets). Zero runtime dependencies.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/client');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/client/main.ts')],
  outfile: resolve(out, 'app.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  // Anything not explicitly defined stays out of the bundle: no env/secrets can leak in.
  define: { 'process.env.NODE_ENV': '"production"' },
});

for (const f of ['index.html', 'styles.css', '_headers']) {
  await cp(resolve(root, 'src/client', f), resolve(out, f));
}
console.log('client built ->', out);
