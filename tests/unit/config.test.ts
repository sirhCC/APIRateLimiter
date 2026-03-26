import request from 'supertest';
import app from '../../src/index';
import { computeConfigHash, loadConfig } from '../../src/utils/config';

const SECURE_PROD_JWT_SECRET = 'Ab9xQ2mN7pR4sT8uV1wX5yZ0cD3eF6gH9jK2Lm5Np8Qr1St4Uv7Wx0Yz3Bc6';

describe('Configuration hash endpoint', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns a stable hash and included fields list', async () => {
    const res = await request(app).get('/config/hash').expect(200);
    expect(res.body.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Array.isArray(res.body.includedFields)).toBe(true);
    expect(res.body.includedFields.length).toBeGreaterThan(5);
  });

  it('hash matches computeConfigHash output', async () => {
    const cfg = loadConfig();
    const { hash } = computeConfigHash(cfg);
    const res = await request(app).get('/config/hash').expect(200);
    expect(res.body.hash).toBe(hash);
  });

  it('defaults demo features off in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECURE_PROD_JWT_SECRET;
    process.env.CORS_ORIGIN = 'https://api.example.com';
    delete process.env.DEMO_USERS_ENABLED;
    delete process.env.DEMO_ENDPOINTS_ENABLED;

    const cfg = loadConfig();

    expect(cfg.security.demoUsersEnabled).toBe(false);
    expect(cfg.security.demoEndpointsEnabled).toBe(false);
    expect(cfg.environment.isProduction).toBe(true);
  });

  it('builds centralized environment profile fields', () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_TRUST_PROXY = 'true';
    process.env.IP_WHITELIST = '10.0.0.1, 10.0.0.2';
    process.env.IP_BLACKLIST = '192.168.0.10';
    process.env.METRICS_ENABLED = 'false';

    const cfg = loadConfig();

    expect(cfg.environment).toMatchObject({
      name: 'test',
      isTest: true,
      trustProxy: true,
      ipWhitelist: ['10.0.0.1', '10.0.0.2'],
      ipBlacklist: ['192.168.0.10'],
      metricsEndpointEnabled: false,
    });
  });

  it('requires JWT_SECRET in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://api.example.com';
    delete process.env.JWT_SECRET;

    expect(() => loadConfig()).toThrow('JWT_SECRET is required in production');
  });

  it('requires explicit CORS_ORIGIN in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECURE_PROD_JWT_SECRET;
    delete process.env.CORS_ORIGIN;

    expect(() => loadConfig()).toThrow('CORS_ORIGIN must be explicitly configured in production');
  });

  it('rejects weak JWT secrets in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
    process.env.CORS_ORIGIN = 'https://api.example.com';

    expect(() => loadConfig()).toThrow('JWT_SECRET is insecure for production');
  });

  it('requires REDIS_PASSWORD when Redis is enabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = SECURE_PROD_JWT_SECRET;
    process.env.CORS_ORIGIN = 'https://api.example.com';
    process.env.REDIS_ENABLED = 'true';
    delete process.env.REDIS_PASSWORD;

    expect(() => loadConfig()).toThrow('REDIS_PASSWORD is required when Redis is enabled in production');
  });
});
