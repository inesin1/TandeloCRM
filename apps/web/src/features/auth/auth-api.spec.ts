import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApi } from './auth-api';

describe('AuthApi', () => {
  let http: HttpTestingController;

  async function settle() {
    await Promise.resolve();
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.removeItem('accessToken');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('accessToken');
    TestBed.resetTestingModule();
  });

  it('loads effective permissions from the current session', async () => {
    localStorage.setItem('accessToken', 'token');
    const authApi = TestBed.inject(AuthApi);
    await settle();

    http.expectOne('/api/auth/me').flush({
      user: { id: 1, name: 'Admin', email: 'admin@example.com' },
      permissions: ['users:write', 'groups:write'],
    });
    await settle();

    expect(authApi.hasPermission('users:write')).toBe(true);
    expect(authApi.hasPermission('groups:write')).toBe(true);
    expect(authApi.hasPermission('analytics:write')).toBe(false);
  });

  it('does not grant permissions when the session request fails', async () => {
    localStorage.setItem('accessToken', 'token');
    const authApi = TestBed.inject(AuthApi);
    await settle();

    http.expectOne('/api/auth/me').flush('Unavailable', {
      status: 500,
      statusText: 'Error',
    });
    await settle();

    expect(authApi.permissions()).toEqual([]);
  });
});
