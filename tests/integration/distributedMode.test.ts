import express, { Express } from 'express';
import request from 'supertest';
import { Redis } from 'ioredis';
import { createDistributedRateLimiter } from '../../src/middleware/distributedRateLimiter';

describe('Distributed Mode Integration', () => {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisDb = parseInt(process.env.REDIS_TEST_DB || process.env.REDIS_DB || '15', 10);
  const coordinationPrefix = `test:distributed:integration:${Date.now()}`;
  let directRedis: Redis | undefined;
  let redisAvailable = false;

  beforeAll(async () => {
    directRedis = new Redis({
      host: redisHost,
      port: redisPort,
      db: redisDb,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      retryStrategy: () => null,
    });

    try {
      await directRedis.connect();
      await directRedis.ping();
      redisAvailable = true;
    } catch (error) {
      redisAvailable = false;
      directRedis.disconnect();
      directRedis.removeAllListeners();
    }
  });

  afterAll(async () => {
    if (directRedis) {
      directRedis.disconnect();
      directRedis.removeAllListeners();
    }
  });

  beforeEach(async () => {
    if (redisAvailable && directRedis?.status === 'ready') {
      await directRedis.flushdb();
    }
  });

  function buildApp(instanceId: string): { app: Express; shutdown: () => Promise<void> } {
    const app = express();
    const limiter = createDistributedRateLimiter({
      redis: {
        instanceId,
        coordinationPrefix,
        single: {
          host: redisHost,
          port: redisPort,
          db: redisDb,
        },
        circuitBreaker: {
          failureThreshold: 2,
          successThreshold: 1,
          timeout: 1000,
        },
      },
      rules: [
        {
          path: '/shared',
          methods: ['GET'],
          algorithm: 'sliding-window',
          limit: 3,
          windowMs: 10000,
        },
      ],
      defaultRule: {
        algorithm: 'sliding-window',
        limit: 10,
        windowMs: 10000,
      },
      coordinationStrategy: 'consistent-hashing',
    });

    app.get('/shared', limiter.middleware, (req, res) => {
      res.json({ instanceId });
    });

    return {
      app,
      shutdown: limiter.shutdown,
    };
  }

  test('shares rate-limit state across app instances on the same Redis backend', async () => {
    if (!redisAvailable) {
      return;
    }

    const instanceOne = buildApp('distributed-app-1');
    const instanceTwo = buildApp('distributed-app-2');

    try {
      const first = await request(instanceOne.app).get('/shared').set('X-Forwarded-For', '203.0.113.10');
      const second = await request(instanceTwo.app).get('/shared').set('X-Forwarded-For', '203.0.113.10');
      const third = await request(instanceOne.app).get('/shared').set('X-Forwarded-For', '203.0.113.10');
      const fourth = await request(instanceTwo.app).get('/shared').set('X-Forwarded-For', '203.0.113.10');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(200);
      expect(fourth.status).toBe(429);

      expect(first.headers['x-ratelimit-instance']).toBe('distributed-app-1');
      expect(second.headers['x-ratelimit-instance']).toBe('distributed-app-2');
      expect(third.headers['x-ratelimit-remaining']).toBe('0');
      expect(fourth.body.instanceId).toBe('distributed-app-2');
    } finally {
      await instanceOne.shutdown();
      await instanceTwo.shutdown();
    }
  });
});