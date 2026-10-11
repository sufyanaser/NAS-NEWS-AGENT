import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(root, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Canary secret: tests assert this value never appears in any API response.
            AI_API_KEY: 'test-canary-ai-key-DO-NOT-LEAK-9f3a',
            ALLOWED_ORIGIN: 'https://nr.nasfm.info',
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
