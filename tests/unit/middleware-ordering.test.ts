import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

describe('Middleware ordering regressions', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  async function loadApp() {
    const appModule = await import('../../src/index');
    return appModule.default;
  }

  it('blocks blacklisted IPs before auth middleware runs', async () => {
    process.env.IP_BLACKLIST = '::ffff:127.0.0.1';
    const app = await loadApp();

    const response = await request(app)
      .get('/auth/verify')
      .expect(403);

    expect(response.body).toMatchObject({
      error: 'Forbidden',
      message: 'Your IP address is blocked',
    });
  });

  it('adds the security audit header before auth routes handle sensitive requests', async () => {
    const app = await loadApp();

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-password' })
      .expect(401);

    expect(response.headers['x-security-audit']).toBe('logged');
  });

  it('uses API key rate limiting ahead of JWT role rate limiting when both are present', async () => {
    const app = await loadApp();

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'demo123' })
      .expect(200);

    const apiKeyResponse = await request(app)
      .post('/api-keys')
      .send({
        name: 'Ordering Premium Key',
        tier: 'premium',
        userId: 'ordering-user',
      })
      .expect(201);

    const response = await request(app)
      .get('/api-keys/tiers')
      .set('Authorization', `Bearer ${loginResponse.body.token}`)
      .set('X-API-Key', apiKeyResponse.body.apiKey)
      .expect(200);

    expect(response.headers['x-api-key-tier']).toBe('premium');
    expect(response.headers['x-ratelimit-limit']).toBe('1000');
    expect(response.headers['ratelimit-limit']).toBe('1000');
  });
});