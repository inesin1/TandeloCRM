import { api } from '../support/test-setup';

describe('GET /api/health', () => {
  it('should report that the API is healthy', async () => {
    const res = await api.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ status: 'ok' });
  });
});
