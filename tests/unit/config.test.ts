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
    delete process.env.DEMO_USERS_ENABLED;
    delete process.env.DEMO_ENDPOINTS_ENABLED;

    const cfg = loadConfig();

    expect(cfg.security.demoUsersEnabled).toBe(false);
    expect(cfg.security.demoEndpointsEnabled).toBe(false);
  });
});
