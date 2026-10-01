import {
  HttpClient,
  httpResource,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { inject } from '@angular/core';
import { Lead } from '../../leads/lead-types';
import { LeadsApi } from '../../leads/leads-api';
import { User, UsersApi } from '../../settings/tabs/users-tab/users-api';
import { Task, TasksApi } from '../tasks-api';
import { TasksPage } from './tasks-page';

const lead = { id: 7, name: 'Existing lead' } as Lead;
const user: User = {
  id: 3,
  name: 'Alex User',
  email: 'alex@example.com',
  isActive: true,
  roles: [],
  groups: [],
};
const task: Task = {
  id: 12,
  leadId: lead.id,
  type: 'call',
  text: 'Call prospect',
  dueAt: '2026-10-01T09:30:00.000Z',
  isCompleted: false,
  assigneeId: null,
  assignee: null,
  createdAt: '2026-09-29T12:00:00.000Z',
  updatedAt: '2026-09-29T12:00:00.000Z',
};

describe('TasksPage', () => {
  let fixture: ComponentFixture<TasksPage>;
  let http: HttpTestingController;

  function start(tasks: Task[] = []) {
    TestBed.configureTestingModule({
      imports: [TasksPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: TasksApi,
          useFactory: () => {
            const httpClient = inject(HttpClient);
            return {
              tasks: httpResource<Task[]>(() => '/api/tasks', {
                defaultValue: [],
              }),
              create: (input: Parameters<TasksApi['create']>[0]) =>
                httpClient.post<Task>('/api/tasks', input),
              setCompleted: (id: number, isCompleted: boolean) =>
                httpClient.put<Task>(`/api/tasks/${id}`, { isCompleted }),
            };
          },
        },
        {
          provide: LeadsApi,
          useFactory: () => ({
            leads: httpResource<Lead[]>(() => '/api/leads', {
              defaultValue: [],
            }),
          }),
        },
        {
          provide: UsersApi,
          useFactory: () => ({
            users: httpResource<User[]>(() => '/api/users', {
              defaultValue: [],
            }),
          }),
        },
      ],
    });
    TestBed.overrideComponent(TasksPage, {
      set: { template: '', imports: [] },
    });
    fixture = TestBed.createComponent(TasksPage);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/api/tasks').flush(tasks);
    http.expectOne('/api/leads').flush([lead]);
    http.expectOne('/api/users').flush([user]);
    TestBed.tick();
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

  it('creates a task and updates the shared task list', async () => {
    start();
    await settle();
    const page = fixture.componentInstance;
    page['taskDraft'].set({
      leadId: lead.id,
      type: 'email',
      text: ' Send details ',
      dueAt: '2026-10-02T11:00',
      assigneeId: user.id,
    });

    const save = page['createTask']();
    const request = http.expectOne('/api/tasks');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      leadId: lead.id,
      type: 'email',
      text: 'Send details',
      dueAt: new Date('2026-10-02T11:00').toISOString(),
      assigneeId: user.id,
    });
    const created = { ...task, id: 13, type: 'email' as const, assignee: user };
    request.flush(created);
    await save;

    expect(TestBed.inject(TasksApi).tasks.value()).toContainEqual(created);
    expect(page['showCreateForm']()).toBe(false);
  });

  it('completes and reopens tasks, and reports API failures', async () => {
    start([task]);
    await settle();
    const page = fixture.componentInstance;

    const complete = page['toggleTask'](task);
    const completeRequest = http.expectOne('/api/tasks/12');
    expect(completeRequest.request.method).toBe('PUT');
    expect(completeRequest.request.body).toEqual({ isCompleted: true });
    completeRequest.flush({ ...task, isCompleted: true });
    await complete;
    expect(page['tasks'].value()[0].isCompleted).toBe(true);

    const reopen = page['toggleTask']({ ...task, isCompleted: true });
    http.expectOne('/api/tasks/12').flush({ ...task, isCompleted: false });
    await reopen;
    expect(page['tasks'].value()[0].isCompleted).toBe(false);

    const failed = page['toggleTask'](task);
    http
      .expectOne('/api/tasks/12')
      .flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    await failed;
    expect(page['taskError']()).toContain('Could not update');
  });
});
