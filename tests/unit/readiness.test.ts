import request from 'supertest';
import app from '../../src/index';

describe('Health and Readiness Endpoints', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.body).toHaveProperty('redis');
  });

  it('should return readiness status', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.body).toHaveProperty('redis');
    expect(res.body).toHaveProperty('config');
  });
});
