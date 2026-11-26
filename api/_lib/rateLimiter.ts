/**
 * Rate limiter abstraction for Vercel serverless API endpoints.
 *
 * NOTE: `InMemoryRateLimiter` tracks counts per warm serverless instance and
 * resets on cold starts or across concurrent Lambda instances. Keeping this
 * behind the `RateLimiter` interface allows swapping in a shared store
 * (Redis, Upstash, or Supabase) without changing endpoint services or tests.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export interface RateLimiter {
  consume(key: string, limit: number): RateLimitResult;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  consume(key: string, limit: number): RateLimitResult {
    const used = this.counts.get(key) || 0;
    if (used >= limit) {
      return { allowed: false, remaining: 0 };
    }
    const next = used + 1;
    this.counts.set(key, next);
    return { allowed: true, remaining: Math.max(0, limit - next) };
  }

  reset(): void {
    this.counts.clear();
  }
}
