import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApi } from '../../../auth/auth-api';
import { UsersApi } from './users-api';

describe('UsersApi', () => {
  let api: UsersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthApi, useValue: { isAuthenticated: () => false } },
      ],
    });
    api = TestBed.inject(UsersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('creates a user with one role, optional groups, and an initial password', async () => {
    const changes = {
      name: 'Morgan Lee',
      email: 'morgan@example.com',
      password: 'starting-pass-8',
      roleIds: [2],
      groupIds: [4, 7],
    };
    const result = api.create(changes);
    const request = http.expectOne('/api/users');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(changes);
    request.flush({ id: 12 });
    await expect(result).resolves.toEqual({ id: 12 });
  });

  it('updates a user role and groups and supports status and password updates', async () => {
    const result = api.update(12, {
      name: 'Morgan Lee',
      email: 'morgan@example.com',
      roleIds: [3],
      groupIds: [7],
    });
    const request = http.expectOne('/api/users/12');

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      name: 'Morgan Lee',
      email: 'morgan@example.com',
      roleIds: [3],
      groupIds: [7],
    });
    request.flush({});
    await result;

    const statusResult = api.update(12, { isActive: false });
    const statusRequest = http.expectOne('/api/users/12');
    expect(statusRequest.request.body).toEqual({ isActive: false });
    statusRequest.flush({});
    await statusResult;

    const passwordResult = api.update(12, { password: 'new-password-8' });
    const passwordRequest = http.expectOne('/api/users/12');
    expect(passwordRequest.request.body).toEqual({
      password: 'new-password-8',
    });
    passwordRequest.flush({});
    await passwordResult;
  });

  it('supports group create, rename, and delete requests', async () => {
    const createResult = api.createGroup('Sales');
    const createRequest = http.expectOne('/api/groups');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({ name: 'Sales' });
    createRequest.flush({ id: 5, name: 'Sales' });
    await expect(createResult).resolves.toEqual({ id: 5, name: 'Sales' });

    const updateResult = api.updateGroup(5, 'Enterprise');
    const updateRequest = http.expectOne('/api/groups/5');
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual({ name: 'Enterprise' });
    updateRequest.flush({ id: 5, name: 'Enterprise' });
    await expect(updateResult).resolves.toEqual({ id: 5, name: 'Enterprise' });

    const deleteResult = api.removeGroup(5);
    const deleteRequest = http.expectOne('/api/groups/5');
    expect(deleteRequest.request.method).toBe('DELETE');
    deleteRequest.flush({ deleted: true });
    await expect(deleteResult).resolves.toEqual({ deleted: true });
  });
});
