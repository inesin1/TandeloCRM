import { httpResource, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthApi } from '../../auth/auth-api';
import { Pipeline, PipelinesApi } from '../../leads/pipelines-api';
import { PipelineAnalyticsRow } from '../analytics-api';
import { AnalyticsPage } from './analytics-page';

const pipelines: Pipeline[] = [
  { id: 1, name: 'Sales' },
  { id: 2, name: 'Renewals' },
];

describe('AnalyticsPage', () => {
  let fixture: ComponentFixture<AnalyticsPage>;
  let http: HttpTestingController;

  function start(rows: PipelineAnalyticsRow[]) {
    TestBed.configureTestingModule({
      imports: [AnalyticsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthApi, useValue: { isAuthenticated: () => true } },
        {
          provide: PipelinesApi,
          useFactory: () => ({
            pipelines: httpResource<Pipeline[]>(() => undefined, {
              defaultValue: pipelines,
            }),
            selectedPipeline: signal<Pipeline | undefined>(pipelines[0]),
          }),
        },
      ],
    });

    fixture = TestBed.createComponent(AnalyticsPage);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne('/api/analytics/pipeline').flush(rows);
    fixture.detectChanges();
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
    fixture.detectChanges();
  }

  it('shows stage totals for the selected pipeline', async () => {
    start([
      {
        pipelineId: 1,
        pipelineName: 'Sales',
        statusId: 11,
        statusName: 'New',
        statusColor: '#111111',
        leadCount: 2,
        totalPrice: 1250,
      },
      {
        pipelineId: 1,
        pipelineName: 'Sales',
        statusId: 12,
        statusName: 'Qualified',
        statusColor: '#222222',
        leadCount: 1,
        totalPrice: 500,
      },
      {
        pipelineId: 2,
        pipelineName: 'Renewals',
        statusId: 21,
        statusName: 'Review',
        statusColor: '#333333',
        leadCount: 3,
        totalPrice: 900,
      },
    ]);
    await settle();

    let content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Sales');
    expect(content).toContain('$1,750');
    expect(content).toContain('Qualified');
    expect(content).not.toContain('Review');

    const select = fixture.nativeElement.querySelector(
      '#analytics-pipeline',
    ) as HTMLSelectElement;
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    await settle();

    content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Review');
    expect(content).toContain('$900');
    expect(content).not.toContain('Qualified');
  });

  it('shows an empty state and zero totals when the pipeline has no leads', async () => {
    start([
      {
        pipelineId: 1,
        pipelineName: 'Sales',
        statusId: 11,
        statusName: 'New',
        statusColor: '#111111',
        leadCount: 0,
        totalPrice: 0,
      },
    ]);
    await settle();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('No leads in this pipeline yet');
    expect(content).toContain('New');
    expect(content).toContain('$0');
  });
});
