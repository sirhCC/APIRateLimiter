import { describe, expect, it } from '@jest/globals';
import request from 'supertest';

describe('Split route module regressions', () => {
  async function loadApp() {
    const appModule = await import('../../src/index');
    return appModule.default;
  }

  it('serves system routes after the route split', async () => {
    const app = await loadApp();

    const health = await request(app).get('/health');
    expect([200, 503]).toContain(health.status);

    const configHash = await request(app).get('/config/hash').expect(200);
    expect(configHash.body).toHaveProperty('hash');
  });

  it('serves auth routes after the route split', async () => {
    const app = await loadApp();

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'bad-password' });

    expect(login.status).toBe(401);
    expect(login.body).toHaveProperty('error');
  });

  it('serves rule routes after the route split', async () => {
    const app = await loadApp();

    const rules = await request(app)
      .post('/rules')
      .send({});

    expect(rules.status).toBe(400);
    expect(rules.body).toHaveProperty('error');
  });

  it('serves demo routes after the route split', async () => {
    const app = await loadApp();

    const testEndpoint = await request(app).get('/test').expect(200);
    expect(testEndpoint.body).toHaveProperty('rateLimitInfo');
  });
});
