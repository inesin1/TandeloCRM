import axios, { AxiosInstance } from 'axios';
import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

loadEnv({ path: resolve(import.meta.dirname, '../../../../.env') });

const adminEmail = process.env.ADMIN_EMAIL?.trim();
const adminPassword = process.env.ADMIN_PASSWORD;
const adminCredentials =
  adminEmail && adminPassword?.trim()
    ? { email: adminEmail, password: adminPassword }
    : null;

function apiWithToken(token: string): AxiosInstance {
  return axios.create({
    baseURL: axios.defaults.baseURL,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function login(email: string, password: string) {
  const response = await axios.post<{ accessToken: string }>(
    '/api/auth/login',
    {
      email,
      password,
    },
  );
  return apiWithToken(response.data.accessToken);
}

async function expectHttpStatus(request: Promise<unknown>, status: number) {
  await request.then(
    () => {
      throw new Error(`Expected request to fail with HTTP ${status}`);
    },
    (error: unknown) => {
      if (!axios.isAxiosError(error)) throw error;
      expect(error.response?.status).toBe(status);
    },
  );
}

describe.skipIf(adminCredentials === null)('Member API permissions', () => {
  let adminApi: AxiosInstance | undefined;
  let temporaryUserId: number | undefined;

  afterEach(async () => {
    if (!adminApi || temporaryUserId === undefined) return;
    const id = temporaryUserId;
    temporaryUserId = undefined;
    await adminApi.delete(`/api/users/${id}`);
  });

  it('limits Member writes while allowing group and analytics reads', async () => {
    if (!adminCredentials) return;
    const admin = await login(
      adminCredentials.email,
      adminCredentials.password,
    );
    adminApi = admin;

    const roles = await admin.get('/api/roles');
    const memberRole = roles.data.find(
      (role: { name: string }) => role.name === 'Member',
    );
    expect(memberRole).toBeDefined();

    const suffix = randomUUID();
    const email = `member-${suffix}@example.test`;
    const password = `E2e-${suffix}`;
    const createdUser = await admin.post('/api/users', {
      name: 'Temporary E2E Member',
      email,
      password,
      roleIds: [memberRole.id],
      groupIds: [],
    });
    temporaryUserId = createdUser.data.id;

    const member = await login(email, password);
    const me = await member.get('/api/auth/me');
    const permissions: string[] = me.data.permissions;
    expect(me.data.user).toMatchObject({ email, isActive: true });
    expect(permissions).toEqual(
      expect.arrayContaining(['groups:read', 'analytics:read', 'users:read']),
    );
    expect(permissions).not.toContain('users:write');
    expect(permissions).not.toContain('groups:write');
    expect(permissions).not.toContain('roles:write');

    const users = await member.get('/api/users');
    expect(users.status).toBe(200);
    expect(users.data.some((user: { email: string }) => user.email === email)).toBe(
      true,
    );

    const groups = await member.get('/api/groups');
    expect(groups.status).toBe(200);
    expect(Array.isArray(groups.data)).toBe(true);

    const analytics = await member.get('/api/analytics/pipeline');
    expect(analytics.status).toBe(200);
    expect(Array.isArray(analytics.data)).toBe(true);

    await expectHttpStatus(
      member.post('/api/users', {
        name: 'Unauthorized User',
        email: `unauthorized-${suffix}@example.test`,
        password,
        roleIds: [memberRole.id],
      }),
      403,
    );
    await expectHttpStatus(
      member.put(`/api/users/${temporaryUserId}`, {
        name: 'Unauthorized Rename',
      }),
      403,
    );
    await expectHttpStatus(
      member.post('/api/groups', { name: `unauthorized-${suffix}` }),
      403,
    );
    await expectHttpStatus(
      member.get('/api/roles'),
      403,
    );
    await expectHttpStatus(
      member.post('/api/roles', { name: `unauthorized-${suffix}` }),
      404,
    );

    await admin.put(`/api/users/${temporaryUserId}`, { isActive: false });
    await expectHttpStatus(member.get('/api/auth/me'), 401);
  });
});
