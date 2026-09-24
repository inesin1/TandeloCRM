import { httpResource, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthApi } from '../../auth/auth-api';
import { Lead } from '../lead-types';
import { LeadsApi } from '../leads-api';
import { PipelinesApi } from '../pipelines-api';
import { UsersApi } from '../../settings/tabs/users-tab/users-api';
import { TasksApi } from '../../tasks/tasks-api';
import { LeadDetailPage } from './lead-detail-page';

const existingLead: Lead = {
  id: 7,
  name: 'Existing lead',
  pipelineId: 2,
  statusId: 21,
  price: 500,
  source: 'Website',
  ownerId: null,
  owner: null,
  company: null,
  contacts: [],
  customFields: {},
  createdAt: '2026-09-01T12:00:00Z',
  updatedAt: '2026-09-02T12:00:00Z',
  status: { id: 21, name: 'Qualified', color: '#fff' },
};
const pipelines = [
  { id: 1, name: 'Sales' },
  { id: 2, name: 'Renewals' },
];
const statuses = [{ id: 21, pipelineId: 2, name: 'Qualified', color: '#fff' }];

describe('LeadDetailPage', () => {
  let fixture: ComponentFixture<LeadDetailPage>;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function start(id: string, query: Record<string, string> = {}) {
    params = new BehaviorSubject(convertToParamMap({ id }));
    TestBed.configureTestingModule({
      imports: [LeadDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthApi, useValue: { isAuthenticated: () => true } },
        {
          provide: TasksApi,
          useFactory: () => ({
            tasks: httpResource(() => undefined, { defaultValue: [] }),
            create: vi.fn(),
            setCompleted: vi.fn(),
          }),
        },
        {
          provide: PipelinesApi,
          useFactory: () => ({
            pipelines: httpResource(() => '/api/pipelines', {
              defaultValue: [],
            }),
          }),
        },
        {
          provide: UsersApi,
          useFactory: () => ({
            users: httpResource(() => '/api/users', { defaultValue: [] }),
          }),
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            snapshot: {
              paramMap: params.value,
              queryParamMap: convertToParamMap(query),
            },
          },
        },
        {
          provide: Router,
          useValue: { navigate: vi.fn().mockResolvedValue(true) },
        },
      ],
    });
    TestBed.overrideComponent(LeadDetailPage, {
      set: { template: '', imports: [] },
    });
    fixture = TestBed.createComponent(LeadDetailPage);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    for (const path of ['contacts', 'companies', 'users', 'leads']) {
      http.expectOne(`/api/${path}`).flush([]);
    }
    http.expectOne('/api/custom-fields?entityType=lead').flush([]);
    if (id !== 'new') {
      http.expectOne(`/api/tasks?leadId=${id}`).flush([]);
      http.expectOne(`/api/leads/${id}/activity`).flush([]);
    }
  }

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  async function settle() {
    await Promise.resolve();
    TestBed.tick();
  }

  it('loads statuses for the lead even when pipelines arrive later', async () => {
    start('7');
    http.expectOne('/api/leads/7').flush(existingLead);
    await settle();
    http.expectOne('/api/pipelines/2/statuses').flush(statuses);
    http.expectOne('/api/pipelines').flush(pipelines);
    await settle();
    expect(fixture.componentInstance['draft']().pipelineId).toBe(2);
    expect(fixture.componentInstance['draft']().statusId).toBe(21);
    expect(fixture.componentInstance['canSave']()).toBe(true);
  });

  it('creates from a board status with empty optional fields and refreshes the list', async () => {
    start('new', { pipelineId: '2', statusId: '21' });
    http.expectOne('/api/pipelines').flush(pipelines);
    await settle();
    http.expectOne('/api/pipelines/2/statuses').flush(statuses);
    await settle();
    const page = fixture.componentInstance;
    expect(page['draft']()).toMatchObject({
      pipelineId: 2,
      statusId: 21,
      price: null,
      companyId: null,
      ownerId: null,
      contactIds: [],
    });
    expect(page['draft']().name).toMatch(/^New lead/);
    const reload = vi.spyOn(TestBed.inject(LeadsApi).leads, 'reload');
    const save = page['save']();
    const request = http.expectOne('/api/leads');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.price).toBe(0);
    request.flush({ ...existingLead, name: page['draft']().name });
    await save;
    expect(reload).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['/leads', 7],
      { replaceUrl: true },
    );
    await settle();
    http.expectOne('/api/leads').flush([existingLead]);
  });

  it('changes pipeline statuses and sends all selected contacts on update', async () => {
    start('7');
    http.expectOne('/api/pipelines').flush(pipelines);
    http.expectOne('/api/leads/7').flush(existingLead);
    await settle();
    http.expectOne('/api/pipelines/2/statuses').flush(statuses);
    await settle();
    const page = fixture.componentInstance;
    page['onPipelineChange'](1);
    await settle();
    expect(page['canSave']()).toBe(false);
    http
      .expectOne('/api/pipelines/1/statuses')
      .flush([{ id: 11, pipelineId: 1, name: 'New', color: '#fff' }]);
    await settle();
    page['updateContacts']([3, 4]);
    page['updateContacts'](null);
    expect(page['draft']().contactIds).toEqual([]);
    page['updateContacts']([3, 4]);
    page['updateField']('price', null);
    const save = page['save']();
    const request = http.expectOne('/api/leads/7');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({
      pipelineId: 1,
      statusId: 11,
      price: 0,
      contactIds: [3, 4],
    });
    request.flush({ ...existingLead, pipelineId: 1, statusId: 11, price: 0 });
    await save;
    await settle();
    http.expectOne('/api/leads').flush([]);
    http.expectOne('/api/leads/7/activity').flush([]);
    expect(page['saved']()).toBe(true);
  });

  it('resets existing fields when navigating to new and handles lookup errors', async () => {
    start('7');
    http.expectOne('/api/pipelines').flush(pipelines);
    http.expectOne('/api/leads/7').flush(existingLead);
    await settle();
    http.expectOne('/api/pipelines/2/statuses').flush(statuses);
    await settle();
    params.next(convertToParamMap({ id: 'new' }));
    await settle();
    http
      .expectOne('/api/pipelines/1/statuses')
      .flush('Unavailable', { status: 500, statusText: 'Error' });
    await settle();
    const page = fixture.componentInstance;
    expect(page['draft']()).toMatchObject({
      price: null,
      contactIds: [],
    });
    expect(page['draft']().name).toMatch(/^New lead/);
    expect(page['canSave']()).toBe(false);
    expect(page['statuses'].error()).toBeTruthy();
  });
});
