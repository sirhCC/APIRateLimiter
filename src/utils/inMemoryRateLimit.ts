// Simple in-memory rate limiting store when Redis is unavailable
interface RateLimitEntry {
  count: number;
  resetTime: number;
  tokens?: number;
  lastRefill?: number;
}

class SimpleInMemoryRateLimit {
  private store = new Map<string, RateLimitEntry>();
  private keyValueStore = new Map<string, string>(); // For general key-value storage like API keys
  
  // Clean up expired entries
  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }

  slidingWindow(key: string, windowMs: number, limit: number): { allowed: boolean; remainingRequests: number } {
    this.cleanup();
    const now = Date.now();
    const entry = this.store.get(key) || { count: 0, resetTime: now + windowMs };

    // Reset if window has passed
    if (entry.resetTime <= now) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }

    if (entry.count < limit) {
      entry.count++;
      this.store.set(key, entry);
      return { allowed: true, remainingRequests: limit - entry.count };
    } else {
      return { allowed: false, remainingRequests: 0 };
    }
  }

  tokenBucket(key: string, capacity: number, tokensPerInterval: number, intervalMs: number): { allowed: boolean; remainingTokens: number } {
    this.cleanup();
    const now = Date.now();
    const entry = this.store.get(key) || { 
      count: 0, 
      resetTime: now + intervalMs,
      tokens: capacity,
      lastRefill: now
    };

    // Calculate tokens to add based on elapsed time
    const elapsed = Math.max(0, now - (entry.lastRefill || now));
    const tokensToAdd = Math.floor(elapsed * tokensPerInterval / intervalMs);
    const currentTokens = Math.min(capacity, (entry.tokens || capacity) + tokensToAdd);

    if (currentTokens >= 1) {
      // Allow request and consume token
      const newTokens = currentTokens - 1;
      entry.tokens = newTokens;
      entry.lastRefill = now;
      entry.resetTime = now + intervalMs;
      this.store.set(key, entry);
      return { allowed: true, remainingTokens: newTokens };
    } else {
      // Deny request
      entry.tokens = currentTokens;
      entry.lastRefill = now;
      entry.resetTime = now + intervalMs;
      this.store.set(key, entry);
      return { allowed: false, remainingTokens: currentTokens };
    }
  }

  fixedWindow(key: string, limit: number, windowMs: number): { allowed: boolean; remainingRequests: number; resetTime: number } {
    this.cleanup();
    const now = Date.now();
    const entry = this.store.get(key) || { count: 0, resetTime: now + windowMs };

    // Reset if window has passed
    if (entry.resetTime <= now) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }

    if (entry.count < limit) {
      entry.count++;
      this.store.set(key, entry);
      return { 
        allowed: true, 
        remainingRequests: limit - entry.count,
        resetTime: entry.resetTime
      };
    } else {
      return { 
        allowed: false, 
        remainingRequests: 0,
        resetTime: entry.resetTime
      };
    }
  }

  // Key-value operations for general storage (like API keys)
  get(key: string): string | null {
    return this.keyValueStore.get(key) || null;
  }

  set(key: string, value: string): void {
    this.keyValueStore.set(key, value);
  }

  del(key: string): boolean {
    return this.keyValueStore.delete(key);
  }

  // Clear expired entries and optionally clear all data
  clear(): void {
    this.store.clear();
    this.keyValueStore.clear();
  }
}

// Global instance
export const inMemoryRateLimit = new SimpleInMemoryRateLimit();
