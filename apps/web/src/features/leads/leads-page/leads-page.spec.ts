import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthApi } from '../../auth/auth-api';
import { UsersApi } from '../../settings/tabs/users-tab/users-api';
import { TasksApi } from '../../tasks/tasks-api';
import { Lead } from '../lead-types';
import { LeadsApi } from '../leads-api';
import { PipelinesApi } from '../pipelines-api';
import { LeadsPage } from './leads-page';

const status = { id: 1, name: 'New', color: '#fff' };
const baseLead: Lead = {
  id: 7,
  name: 'Pilot project',
  price: 0,
  source: null,
  pipelineId: 1,
  statusId: status.id,
  ownerId: 2,
  createdAt: '',
  updatedAt: '',
  customFields: {},
  status,
  company: { id: 3, name: 'Acme Industries' },
  owner: null,
  contacts: [],
};
const leads: Lead[] = [
  baseLead,
  { ...baseLead, id: 17, name: 'Renewal', ownerId: 1, company: null },
  { ...baseLead, id: 27, name: 'Expansion', ownerId: null, company: null },
  { ...baseLead, id: 8, pipelineId: 2 },
];

function resource<T>(value: T) {
  return {
    value: signal(value),
    error: signal(undefined),
    isLoading: signal(false),
  };
}

describe('LeadsPage filters', () => {
  let page: LeadsPage;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('accessToken', 'test-token');
    TestBed.configureTestingModule({
      imports: [LeadsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LeadsApi, useValue: { leads: resource(leads) } },
        {
          provide: PipelinesApi,
          useValue: {
            selectedPipeline: signal({ id: 1, name: 'Sales' }),
            pipelines: resource([]),
            statuses: resource([status]),
          },
        },
        { provide: TasksApi, useValue: { tasks: resource([]) } },
        { provide: UsersApi, useValue: { users: resource([]) } },
      ],
    });
    TestBed.overrideComponent(LeadsPage, {
      set: { template: '', imports: [] },
    });
    page = TestBed.createComponent(LeadsPage).componentInstance;
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('leads:viewMode');
  });

  function rowIds() {
    return page['rows']().map(({ id }) => id);
  }

  function mineCount() {
    return page['tabs']().find(({ value }) => value === 'mine')?.count;
  }

  it('updates Mine rows and count when the signed-in user is loaded', async () => {
    page['activeTab'].set('mine');
    expect(rowIds()).toEqual([]);
    expect(mineCount()).toBeNull();

    http.expectOne('/api/auth/me').flush({ user: { id: 2 }, permissions: [] });
    await Promise.resolve();
    TestBed.tick();
    expect(rowIds()).toEqual([7]);
    expect(mineCount()).toBe(1);

    TestBed.inject(AuthApi).logout();
    expect(rowIds()).toEqual([]);
    expect(mineCount()).toBeNull();
  });

  it('marks Mine unavailable on a session error and retries the lookup', async () => {
    http
      .expectOne('/api/auth/me')
      .flush(null, { status: 500, statusText: 'Server error' });
    await Promise.resolve();
    TestBed.tick();
    page['activeTab'].set('mine');
    expect(rowIds()).toEqual([]);
    expect(page['mineSessionError']()).toBeTruthy();
    expect(mineCount()).toBeNull();

    page['retryMineSession']();
    TestBed.tick();
    http.expectOne('/api/auth/me').flush({ user: { id: 2 }, permissions: [] });
    await Promise.resolve();
    TestBed.tick();
    expect(page['mineSessionError']()).toBeFalsy();
    expect(rowIds()).toEqual([7]);
  });

  it('keeps Mine, owner and status filters in effect during search', async () => {
    http.expectOne('/api/auth/me').flush({ user: { id: 2 }, permissions: [] });
    await Promise.resolve();
    TestBed.tick();
    page['activeTab'].set('mine');
    page['search'].set('Renewal');
    expect(rowIds()).toEqual([]);
    page['search'].set('Acme');
    expect(rowIds()).toEqual([7]);
    page['ownerFilter'].set(1);
    expect(rowIds()).toEqual([]);
    page['ownerFilter'].set(null);
    page['statusFilter'].set(2);
    expect(rowIds()).toEqual([]);
    expect(page['columns']()[0].leads).toEqual([]);
  });

  it.each([
    ['  pILOt  ', [7]],
    ['  aCME  ', [7]],
    ['7', [7]],
    [' #7 ', [7]],
    ['   ', [7, 17, 27]],
    ['missing', []],
  ])('filters both list and board for search %j', (query, expected) => {
    http.match('/api/auth/me');
    page['search'].set(query);
    expect(rowIds()).toEqual(expected);
    expect(
      page['columns']().flatMap((column) => column.leads.map(({ id }) => id)),
    ).toEqual(expected);
  });
});
