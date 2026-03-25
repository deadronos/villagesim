export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class SlidingWindowRateLimiter {
  private readonly entries = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, nowMs: number = Date.now()): RateLimitResult {
    const windowStart = nowMs - this.windowMs;
    const recent = (this.entries.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= this.limit) {
      this.entries.set(key, recent);
      const retryAt = recent[0] + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt - nowMs) / 1000)),
      };
    }

    recent.push(nowMs);
    this.entries.set(key, recent);

    return {
      allowed: true,
      remaining: Math.max(0, this.limit - recent.length),
      retryAfterSeconds: 0,
    };
  }
}
