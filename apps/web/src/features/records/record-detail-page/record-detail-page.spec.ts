import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthApi } from '../../auth/auth-api';
import { CopilotState } from '../../copilot/copilot-state';
import { RecordDetailPage } from './record-detail-page';

describe('RecordDetailPage', () => {
  let fixture: ComponentFixture<RecordDetailPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    const params = new BehaviorSubject(convertToParamMap({ id: '4' }));
    TestBed.configureTestingModule({
      imports: [RecordDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthApi,
          useValue: { isAuthenticated: () => true, hasPermission: () => false },
        },
        {
          provide: CopilotState,
          useValue: { confirmedMutation: signal(null) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            snapshot: {
              paramMap: params.value,
              data: { recordKind: 'contact' },
            },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(RecordDetailPage, {
      set: { template: '', imports: [] },
    });
    fixture = TestBed.createComponent(RecordDetailPage);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/api/workspace-settings').flush({ currency: 'USD' });

    http.expectOne('/api/contacts').flush([]);
    http.expectOne('/api/companies').flush([]);
    http.expectOne('/api/leads').flush([]);
    http.expectOne('/api/users').flush([]);
    http.expectOne('/api/groups').flush([]);
    http.expectOne('/api/contacts/4/leads').flush([]);
    http.expectOne('/api/contacts/4/activity').flush([]);
    http.expectOne('/api/custom-fields?entityType=contact').flush([
      {
        id: 1,
        key: 'currentField',
        label: 'Current field',
        type: 'text',
        options: null,
        isRequired: false,
      },
    ]);
    http.expectOne('/api/contacts/4').flush({
      id: 4,
      name: 'Existing contact',
      position: null,
      companyId: null,
      email: null,
      phone: null,
      ownerId: null,
      customFields: { currentField: 'kept', deletedField: 'stale' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    TestBed.tick();
  });

  afterEach(() => http.verify());

  it('omits deleted custom fields when saving a contact', async () => {
    const page = fixture.componentInstance;
    page['updateField']('name', 'Renamed contact');

    const save = page['save']();
    const request = http.expectOne('/api/contacts/4');

    expect(request.request.method).toBe('PUT');
    expect(request.request.body.customFields).toEqual({ currentField: 'kept' });
    request.flush({
      id: 4,
      name: 'Renamed contact',
      position: null,
      companyId: null,
      email: null,
      phone: null,
      ownerId: null,
      customFields: { currentField: 'kept' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await save;
  });
});
