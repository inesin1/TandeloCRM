import type { AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { api, loginAsAdmin } from '../support/test-setup';

async function expectStatus(
  request: Promise<unknown>,
  status: number,
): Promise<void> {
  await expect(request).rejects.toMatchObject({
    response: { status },
  });
}

describe('CRM API workflows', () => {
  let admin: AxiosInstance;
  const created = {
    pipelineId: undefined as number | undefined,
    leadId: undefined as number | undefined,
    contactId: undefined as number | undefined,
    companyId: undefined as number | undefined,
    taskId: undefined as number | undefined,
    customFieldId: undefined as number | undefined,
    groupId: undefined as number | undefined,
  };

  beforeAll(async () => {
    admin = await loginAsAdmin();
    const health = await api.get('/api/health');
    expect(health.data).toEqual({ status: 'ok' });
  });

  afterEach(async () => {
    for (const [id, path] of [
      [created.taskId, 'tasks'],
      [created.leadId, 'leads'],
      [created.contactId, 'contacts'],
      [created.companyId, 'companies'],
      [created.customFieldId, 'custom-fields'],
      [created.groupId, 'groups'],
      [created.pipelineId, 'pipelines'],
    ] as const) {
      if (id === undefined) continue;
      await admin.delete(`/api/${path}/${id}`);
    }

    for (const key of Object.keys(created) as (keyof typeof created)[]) {
      created[key] = undefined;
    }
  });

  it('creates and links CRM records, filters tasks, and reports pipeline totals', async () => {
    const unique = randomUUID();
    const pipeline = await admin.post('/api/pipelines', {
      name: `E2E pipeline ${unique}`,
      sortOrder: 91,
    });
    created.pipelineId = pipeline.data.id;
    await expectStatus(
      admin.put(`/api/pipelines/${created.pipelineId}`, { sortOrder: null }),
      400,
    );

    const newStatus = await admin.post(
      `/api/pipelines/${created.pipelineId}/statuses`,
      { name: 'New', color: '#3478f6', sortOrder: 1 },
    );
    const qualifiedStatus = await admin.post(
      `/api/pipelines/${created.pipelineId}/statuses`,
      { name: 'Qualified', color: '#25a579', sortOrder: 2 },
    );

    const company = await admin.post('/api/companies', {
      name: `E2E company ${unique}`,
      industry: 'Software',
      email: `company-${unique}@example.test`,
      customFields: {},
    });
    created.companyId = company.data.id;

    const contact = await admin.post('/api/contacts', {
      name: `E2E contact ${unique}`,
      companyId: created.companyId,
      email: `contact-${unique}@example.test`,
      customFields: {},
    });
    created.contactId = contact.data.id;

    const customField = await admin.post('/api/custom-fields', {
      entityType: 'lead',
      key: `portfolio_${unique.replaceAll('-', '')}`,
      label: 'Portfolio field',
      type: 'select',
      options: ['standard', 'priority'],
      isRequired: true,
    });
    created.customFieldId = customField.data.id;

    const lead = await admin.post('/api/leads', {
      name: `E2E lead ${unique}`,
      pipelineId: created.pipelineId,
      statusId: newStatus.data.id,
      price: 7200,
      companyId: created.companyId,
      contactIds: [created.contactId],
      customFields: { [customField.data.key]: 'priority' },
    });
    created.leadId = lead.data.id;

    expect(lead.data).toMatchObject({
      name: `E2E lead ${unique}`,
      price: 7200,
      company: { id: created.companyId },
      contacts: [expect.objectContaining({ id: created.contactId })],
      customFields: { [customField.data.key]: 'priority' },
    });
    await expectStatus(
      admin.delete(`/api/pipelines/${created.pipelineId}`),
      409,
    );

    const note = await admin.post(`/api/leads/${created.leadId}/notes`, {
      body: `E2E note ${unique}`,
    });
    expect(note.data).toMatchObject({
      kind: 'note',
      body: `E2E note ${unique}`,
      author: { id: expect.any(Number) },
    });

    const updated = await admin.put(`/api/leads/${created.leadId}`, {
      statusId: qualifiedStatus.data.id,
      price: 8900,
    });
    expect(updated.data).toMatchObject({
      status: { id: qualifiedStatus.data.id, name: 'Qualified' },
      price: 8900,
    });

    const searchResults = await admin.get('/api/leads', {
      params: { pipelineId: created.pipelineId, search: unique },
    });
    expect(
      searchResults.data.map((record: { id: number }) => record.id),
    ).toContain(created.leadId);
    await expectStatus(
      admin.get('/api/leads', { params: { pipelineId: 'not-an-integer' } }),
      400,
    );

    const linkedCompanyLeads = await admin.get(
      `/api/companies/${created.companyId}/leads`,
    );
    expect(linkedCompanyLeads.data).toEqual([
      expect.objectContaining({ id: created.leadId }),
    ]);
    const linkedContactLeads = await admin.get(
      `/api/contacts/${created.contactId}/leads`,
    );
    expect(linkedContactLeads.data).toEqual([
      expect.objectContaining({ id: created.leadId }),
    ]);

    const dueAt = new Date(Date.now() + 86_400_000).toISOString();
    const task = await admin.post('/api/tasks', {
      leadId: created.leadId,
      type: 'call',
      text: `E2E task ${unique}`,
      dueAt,
    });
    created.taskId = task.data.id;
    expect(task.data).toMatchObject({
      leadId: created.leadId,
      isCompleted: false,
    });

    const openTasks = await admin.get('/api/tasks', {
      params: { leadId: created.leadId, isCompleted: false },
    });
    expect(openTasks.data.map((record: { id: number }) => record.id)).toContain(
      created.taskId,
    );
    const invalidCompletionFilter = await admin
      .get('/api/tasks', { params: { isCompleted: 'invalid' } })
      .catch((error: unknown) => error);
    expect(invalidCompletionFilter).toMatchObject({
      response: { status: 400 },
    });

    const completed = await admin.put(`/api/tasks/${created.taskId}`, {
      isCompleted: true,
    });
    expect(completed.data.isCompleted).toBe(true);
    const completedTasks = await admin.get('/api/tasks', {
      params: { leadId: created.leadId, isCompleted: true },
    });
    expect(
      completedTasks.data.map((record: { id: number }) => record.id),
    ).toContain(created.taskId);

    const analytics = await admin.get('/api/analytics/pipeline');
    expect(analytics.data).toContainEqual(
      expect.objectContaining({
        pipelineId: created.pipelineId,
        statusId: qualifiedStatus.data.id,
        leadCount: 1,
        totalPrice: 8900,
      }),
    );

    const fields = await admin.get('/api/custom-fields', {
      params: { entityType: 'lead' },
    });
    expect(fields.data).toContainEqual(
      expect.objectContaining({ id: created.customFieldId }),
    );
    await expectStatus(
      admin.post('/api/leads', {
        name: `Missing required field ${unique}`,
        pipelineId: created.pipelineId,
        statusId: newStatus.data.id,
        customFields: {},
      }),
      400,
    );
  });

  it('creates, updates, lists, and deletes a group', async () => {
    const name = `E2E group ${randomUUID()}`;
    const group = await admin.post('/api/groups', { name });
    created.groupId = group.data.id;
    expect(group.data).toMatchObject({ id: expect.any(Number), name });

    const updatedName = `${name} updated`;
    const updated = await admin.put(`/api/groups/${created.groupId}`, {
      name: updatedName,
    });
    expect(updated.data.name).toBe(updatedName);

    const groups = await admin.get('/api/groups');
    expect(groups.data).toContainEqual(
      expect.objectContaining({ id: created.groupId, name: updatedName }),
    );
  });
});
