import { RedisClient } from './redis';
import { createHash, randomBytes } from 'crypto';
import { log } from './logger';

export interface ApiKeyTier {
  name: string;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
    burstCapacity?: number;
  };
  features: string[];
  quotaPerMonth?: number;
}

export interface ApiKeyMetadata {
  id: string;
  key: string;
  name: string;
  tier: string;
  userId?: string;
  organizationId?: string;
  created: number;
  lastUsed?: number;
  isActive: boolean;
  usage: {
    totalRequests: number;
    currentMonthRequests: number;
    lastResetMonth: string;
  };
  rateLimit: ApiKeyTier['rateLimit'];
  metadata: Record<string, any>;
}

/**
 * API Key Management System with Redis backend
 */
export class ApiKeyManager {
  private redis: RedisClient;
  private keyPrefix = 'api_key:';
  private metadataPrefix = 'api_key_meta:';
  private userKeysPrefix = 'user_keys:';

  // Predefined tiers
  private defaultTiers: Record<string, ApiKeyTier> = {
    free: {
      name: 'Free',
      rateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 100,
        algorithm: 'sliding-window',
      },
      features: ['basic-rate-limiting'],
      quotaPerMonth: 10000,
    },
    premium: {
      name: 'Premium',
      rateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 1000,
        algorithm: 'token-bucket',
        burstCapacity: 1500,
      },
      features: ['basic-rate-limiting', 'burst-capacity', 'priority-support'],
      quotaPerMonth: 100000,
    },
    enterprise: {
      name: 'Enterprise',
      rateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 10000,
        algorithm: 'token-bucket',
        burstCapacity: 15000,
      },
      features: ['basic-rate-limiting', 'burst-capacity', 'priority-support', 'custom-rules', 'analytics'],
      quotaPerMonth: 1000000,
    },
  };

  constructor(redis: RedisClient) {
    this.redis = redis;
  }

  /**
   * Generate a new API key
   */
  async generateApiKey(options: {
    name: string;
    tier: string;
    userId?: string;
    organizationId?: string;
    metadata?: Record<string, any>;
  }): Promise<{ apiKey: string; metadata: ApiKeyMetadata }> {
    const { name, tier, userId, organizationId, metadata = {} } = options;

    // Input validation
    if (!name || name.trim().length === 0) {
      throw new Error('Name is required and cannot be empty');
    }
    
    if (userId !== undefined && (!userId || userId.trim().length === 0)) {
      throw new Error('User ID cannot be empty if provided');
    }

    // Validate tier
    if (!this.defaultTiers[tier]) {
      throw new Error(`Invalid tier: ${tier}`);
    }

    // Generate secure API key
    const keyId = this.generateKeyId();
    const apiKey = this.generateSecureKey(keyId);
    const keyHash = this.hashKey(apiKey);

    const keyMetadata: ApiKeyMetadata = {
      id: keyId,
      key: keyHash,
      name,
      tier,
      userId,
      organizationId,
      created: Date.now(),
      isActive: true,
      usage: {
        totalRequests: 0,
        currentMonthRequests: 0,
        lastResetMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
      },
      rateLimit: this.defaultTiers[tier].rateLimit,
      metadata,
    };

    // Store in Redis
    await this.storeKeyMetadata(keyMetadata);

    // Index by user if provided
    if (userId) {
      await this.addKeyToUser(userId, keyId);
    }

    return { apiKey, metadata: keyMetadata };
  }

  /**
   * Validate an API key and return metadata
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyMetadata | null> {
    try {
      const keyHash = this.hashKey(apiKey);
      const keyId = this.extractKeyId(apiKey);
      
      const metadata = await this._getKeyMetadata(keyId);
      
      if (!metadata || metadata.key !== keyHash || !metadata.isActive) {
        return null;
      }

      // Update last used timestamp
      metadata.lastUsed = Date.now();
      await this.updateKeyMetadata(metadata);

      return metadata;
    } catch (error) {
      log.security('API key validation error', {
        eventType: 'auth_failure',
        severity: 'high',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Record usage for an API key
   */
  async recordUsage(keyId: string, requestCount: number = 1): Promise<void> {
    try {
      const metadata = await this._getKeyMetadata(keyId);
      if (!metadata) return;

      const currentMonth = new Date().toISOString().slice(0, 7);
      
      // Reset monthly counter if needed
      if (metadata.usage.lastResetMonth !== currentMonth) {
        metadata.usage.currentMonthRequests = 0;
        metadata.usage.lastResetMonth = currentMonth;
      }

      metadata.usage.totalRequests += requestCount;
      metadata.usage.currentMonthRequests += requestCount;

      await this.updateKeyMetadata(metadata);
    } catch (error) {
      log.system('Usage recording error', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'medium',
        category: 'api-keys'
      });
    }
  }

  /**
   * Check if API key has exceeded quota
   */
  async checkQuota(keyId: string): Promise<{ withinQuota: boolean; usage: ApiKeyMetadata['usage']; quota?: number }> {
    const metadata = await this._getKeyMetadata(keyId);
    if (!metadata) {
      return { withinQuota: false, usage: { totalRequests: 0, currentMonthRequests: 0, lastResetMonth: '' } };
    }

    const tier = this.defaultTiers[metadata.tier];
    const quota = tier?.quotaPerMonth;

    if (!quota) {
      return { withinQuota: true, usage: metadata.usage };
    }

    const withinQuota = metadata.usage.currentMonthRequests < quota;
    return { withinQuota, usage: metadata.usage, quota };
  }

  /**
   * List API keys for a user
   */
  async getUserKeys(userId: string): Promise<ApiKeyMetadata[]> {
    try {
      const keyIds = await this.redis.get(`${this.userKeysPrefix}${userId}`);
      if (!keyIds) return [];

      const ids = JSON.parse(keyIds);
      const keys = await Promise.all(ids.map((id: string) => this._getKeyMetadata(id)));
      
      return keys.filter(Boolean) as ApiKeyMetadata[];
    } catch (error) {
      log.system('Error getting user keys', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        severity: 'medium',
        category: 'api-keys'
      });
      return [];
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string): Promise<boolean> {
    try {
      const metadata = await this._getKeyMetadata(keyId);
      if (!metadata) return false;

      metadata.isActive = false;
      await this.updateKeyMetadata(metadata);

      return true;
    } catch (error) {
      log.security('Error revoking API key', {
        eventType: 'security_violation',
        severity: 'high',
        error: error instanceof Error ? error.message : String(error),
        apiKeyId: keyId
      });
      return false;
    }
  }

  /**
   * Get available tiers
   */
  getTiers(): Record<string, ApiKeyTier> {
    return { ...this.defaultTiers };
  }

  /**
   * Update tier configuration
   */
  updateTier(tierName: string, tierConfig: ApiKeyTier): void {
    this.defaultTiers[tierName] = tierConfig;
  }

  /**
   * Get key metadata (public method for external access)
   */
  async getKeyMetadata(keyId: string): Promise<ApiKeyMetadata | null> {
    try {
      const key = `${this.metadataPrefix}${keyId}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      log.system('Error getting key metadata', {
        error: error instanceof Error ? error.message : String(error),
        keyId,
        severity: 'medium',
        category: 'api-keys'
      });
      return null;
    }
  }

  // Private helper methods

  private generateKeyId(): string {
    return randomBytes(8).toString('hex');
  }

  private generateSecureKey(keyId: string): string {
    const randomPart = randomBytes(24).toString('hex');
    return `rl_${keyId}_${randomPart}`;
  }

  private extractKeyId(apiKey: string): string {
    const parts = apiKey.split('_');
    return parts.length >= 2 ? parts[1] : '';
  }

  private hashKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  private async storeKeyMetadata(metadata: ApiKeyMetadata): Promise<void> {
    const key = `${this.metadataPrefix}${metadata.id}`;
    await this.redis.set(key, JSON.stringify(metadata));
  }

  private async _getKeyMetadata(keyId: string): Promise<ApiKeyMetadata | null> {
    try {
      const key = `${this.metadataPrefix}${keyId}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      log.system('Error getting private key metadata', {
        error: error instanceof Error ? error.message : String(error),
        keyId,
        severity: 'medium',
        category: 'api-keys'
      });
      return null;
    }
  }

  private async updateKeyMetadata(metadata: ApiKeyMetadata): Promise<void> {
    const key = `${this.metadataPrefix}${metadata.id}`;
    await this.redis.set(key, JSON.stringify(metadata));
  }

  private async addKeyToUser(userId: string, keyId: string): Promise<void> {
    try {
      const userKeysKey = `${this.userKeysPrefix}${userId}`;
      const existingKeys = await this.redis.get(userKeysKey);
      const keyIds = existingKeys ? JSON.parse(existingKeys) : [];
      
      if (!keyIds.includes(keyId)) {
        keyIds.push(keyId);
        await this.redis.set(userKeysKey, JSON.stringify(keyIds));
      }
    } catch (error) {
      log.system('Error adding key to user', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        keyId,
        severity: 'high',
        category: 'api-keys'
      });
    }
  }
}

/**
 * Global API key manager instance
 */
export let apiKeyManager: ApiKeyManager;

/**
 * Initialize API key manager
 */
export function initializeApiKeyManager(redis: RedisClient): ApiKeyManager {
  apiKeyManager = new ApiKeyManager(redis);
  return apiKeyManager;
}
