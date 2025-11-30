interface RateLimitEntry {
  ip: string;
  count: number;
  resetTime: number; // Unix timestamp
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly FREE_TIER_LIMIT = 10;
  private readonly RESET_INTERVAL_MS = 12 * 60 * 1000; // 12 hour

  check(ip: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const entry = this.limits.get(ip);

    // No entry or expired - create new
    if (!entry || now >= entry.resetTime) {
      const resetTime = now + this.RESET_INTERVAL_MS;
      this.limits.set(ip, { ip, count: 0, resetTime });
      return { allowed: true, remaining: this.FREE_TIER_LIMIT, resetTime };
    }

    // Check if under limit
    if (entry.count < this.FREE_TIER_LIMIT) {
      return {
        allowed: true,
        remaining: this.FREE_TIER_LIMIT - entry.count,
        resetTime: entry.resetTime,
      };
    }

    // Over limit
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }

  record(ip: string): void {
    const entry = this.limits.get(ip);
    if (entry) {
      entry.count++;
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.limits.entries()) {
      if (now >= entry.resetTime) {
        this.limits.delete(ip);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

// Cleanup expired entries every hour
setInterval(() => rateLimiter.cleanup(), 60 * 60 * 1000);
