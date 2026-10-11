import type { D1Migration } from '@cloudflare/vitest-plugin';

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import('../src/worker');
    }
    interface Env {
      DB: D1Database;
      ASSETS: Fetcher;
      ALLOWED_ORIGIN: string;
      AI_API_KEY: string;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
