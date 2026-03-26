import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

describe('API key route authorization', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  async function loadApp() {
    const appModule = await import('../../src/index');
    return appModule.default;
  }

  async function login(app: any, email: string, password: string = 'demo123') {
    const response = await request(app)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.token as string;
  }

  it('rejects unauthenticated API key creation', async () => {
    const app = await loadApp();

    const response = await request(app)
      .post('/api-keys')
      .send({ name: 'No Auth Key', tier: 'free', userId: 'user-1' })
      .expect(401);

    expect(response.body).toMatchObject({
      error: 'Unauthorized',
      message: 'JWT token is required',
    });
  });

  it('rejects non-admin API key creation', async () => {
    const app = await loadApp();
    const premiumToken = await login(app, 'premium@example.com');

    const response = await request(app)
      .post('/api-keys')
      .set('Authorization', `Bearer ${premiumToken}`)
      .send({ name: 'Premium Cannot Create', tier: 'free', userId: 'user-1' })
      .expect(403);

    expect(response.body).toMatchObject({
      error: 'Insufficient permissions',
    });
  });

  it('allows admin API key create, list, rotate, and revoke flows', async () => {
    const app = await loadApp();
    const adminToken = await login(app, 'admin@example.com');

    const createResponse = await request(app)
      .post('/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Admin Managed Key',
        tier: 'premium',
        userId: 'managed-user',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })
      .expect(201);

    const keyId = createResponse.body.metadata.id;
    expect(createResponse.body.metadata).toMatchObject({
      name: 'Admin Managed Key',
      tier: 'premium',
      isActive: true,
    });

    const listResponse = await request(app)
      .get('/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ userId: 'managed-user' })
      .expect(200);

    expect(listResponse.body.keys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: keyId, name: 'Admin Managed Key' }),
      ])
    );

    const rotateResponse = await request(app)
      .post(`/api-keys/${keyId}/rotate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ gracePeriodMs: 5000 })
      .expect(200);

    expect(rotateResponse.body).toMatchObject({
      keyId,
      message: 'API key rotated successfully',
    });

    const revokeResponse = await request(app)
      .delete(`/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'manual_cleanup' })
      .expect(200);

    expect(revokeResponse.body).toMatchObject({
      keyId,
      message: 'API key revoked successfully',
    });

    const detailResponse = await request(app)
      .get(`/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detailResponse.body.metadata).toMatchObject({
      id: keyId,
      isActive: false,
      revocationReason: 'manual_cleanup',
      revokedBy: 'admin-1',
    });
  });
});