import request from 'supertest';
import app from '../../src/index';
import { computeConfigHash, loadConfig } from '../../src/utils/config';

describe('Configuration hash endpoint', () => {
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
});
