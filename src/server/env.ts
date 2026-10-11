export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Exact origin allowed to perform state-changing requests (Specs §12.3). */
  ALLOWED_ORIGIN: string;
  /** Optional: Cloudflare ratelimit binding for login (Specs §12.4). Absent locally unless configured. */
  LOGIN_LIMITER?: RateLimiter;
  /** Reserved for the AI pipeline (not used in this slice). Must never reach responses or the client bundle. */
  AI_API_KEY?: string;
}
