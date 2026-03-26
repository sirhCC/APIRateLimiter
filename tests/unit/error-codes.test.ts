import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { ERROR_CODES } from '../../src/utils/errorCodes';

describe('Error code regressions', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  async function loadApp() {
    const appModule = await import('../../src/index');
    return appModule.default;
  }

  it('returns AUTH002 for invalid demo login credentials', async () => {
    const app = await loadApp();

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-password' })
      .expect(401);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.AUTH.INVALID_CREDENTIALS,
      error: 'Invalid credentials',
    });
  });

  it('returns AUTH001 when demo auth is disabled', async () => {
    process.env.DEMO_USERS_ENABLED = 'false';
    const app = await loadApp();

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'demo123' })
      .expect(503);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.AUTH.DEMO_DISABLED,
      error: 'Demo authentication disabled',
    });
  });

  it('returns VAL001 when API key listing query validation fails', async () => {
    const app = await loadApp();

    const response = await request(app)
      .get('/api-keys')
      .expect(400);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.VALIDATION.REQUEST_FAILED,
      error: 'Validation Error',
    });
  });

  it('returns MET001 when metrics are disabled', async () => {
    process.env.METRICS_ENABLED = 'false';
    const app = await loadApp();

    const response = await request(app)
      .get('/metrics')
      .expect(404);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.METRICS.DISABLED,
      error: 'Metrics disabled',
    });
  });
});
