import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { loginAsAdmin } from '../support/test-setup';

async function answer(
  request: IncomingMessage,
  response: ServerResponse,
  companyName: string,
) {
  request.setEncoding('utf8');
  let body = '';
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  const isProbe = input.text?.format?.name === 'connection_check';
  const hasToolResult = input.input.some(
    (item: { type?: string }) => item.type === 'function_call_output',
  );

  if (request.url !== '/v1/responses' || input.store !== false) {
    response.writeHead(400).end();
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(
    JSON.stringify({
      status: 'completed',
      output:
        isProbe || hasToolResult
          ? []
          : [
              {
                type: 'function_call',
                id: 'function-1',
                call_id: 'call-1',
                name: 'propose_create_record',
                arguments: JSON.stringify({
                  kind: 'company',
                  name: companyName,
                  price: null,
                  source: null,
                  pipelineId: null,
                  statusId: null,
                  companyId: null,
                  ownerId: null,
                  contactIds: null,
                  industry: null,
                  address: null,
                  email: null,
                  phone: null,
                  position: null,
                  customFields: null,
                }),
              },
            ],
      ...(isProbe || hasToolResult
        ? {
            output_text: JSON.stringify({
              text: isProbe ? 'OK' : 'Draft ready.',
              sourceIds: [],
            }),
          }
        : {}),
    }),
  );
}

it('runs a Copilot chat, streams the reply, and writes a proposed record only after confirmation', async () => {
  const admin = await loginAsAdmin();
  const settings = await admin.get('/api/copilot/settings');
  expect(settings.data).toMatchObject({
    source: 'environment',
    enabled: false,
  });

  const companyName = `Copilot E2E ${randomUUID()}`;
  const provider = createServer((request, response) => {
    void answer(request, response, companyName).catch(() =>
      response.writeHead(400).end(),
    );
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const address = provider.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test provider address');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  let conversationId: number | undefined;
  let companyId: number | undefined;

  try {
    await admin.put('/api/copilot/settings', {
      enabled: true,
      baseUrl,
      model: 'e2e',
      apiFormat: 'responses',
    });
    const probe = await admin.post('/api/copilot/settings/test', {});
    expect(probe.data).toEqual({ ok: true });

    const conversation = await admin.post('/api/copilot/conversations', {
      title: 'E2E conversation',
    });
    conversationId = conversation.data.id;
    const started = await admin.post(
      `/api/copilot/conversations/${conversationId}/messages`,
      {
        clientRequestId: randomUUID(),
        text: `Draft a company named "${companyName}".`,
        timezone: 'UTC',
      },
    );
    expect(started.status).toBe(202);

    const runUrl = `/api/copilot/runs/${started.data.runId}`;
    const events = await admin.get<string>(`${runUrl}/events`);
    expect(events.headers['content-type']).toContain('text/event-stream');
    expect(events.data).toContain('event: completed');
    expect(events.data).toContain('Draft ready.');

    const run = await admin.get(runUrl);
    expect(run.data).toMatchObject({
      status: 'completed',
      actions: [expect.objectContaining({ status: 'proposed' })],
    });
    const before = await admin.get('/api/companies', {
      params: { search: companyName },
    });
    expect(before.data).toEqual([]);

    const confirmUrl = `/api/copilot/actions/${run.data.actions[0].id}/confirm`;
    const confirmed = await admin.post(confirmUrl, {});
    companyId = confirmed.data.result?.recordId;
    expect(confirmed.data).toMatchObject({
      status: 'executed',
      result: { recordId: expect.any(Number) },
    });
    expect((await admin.post(confirmUrl, {})).data).toEqual(confirmed.data);
    const after = await admin.get('/api/companies', {
      params: { search: companyName },
    });
    expect(after.data).toEqual([
      expect.objectContaining({ id: companyId, name: companyName }),
    ]);
  } finally {
    const providerClosed = once(provider, 'close');
    provider.close();
    const db = new Pool({ connectionString: process.env.API_E2E_DATABASE_URL });
    try {
      await providerClosed;
      await db.query('delete from copilot_settings where "baseUrl" = $1', [
        baseUrl,
      ]);
      if (conversationId !== undefined)
        await admin.delete(`/api/copilot/conversations/${conversationId}`);
      if (companyId !== undefined)
        await admin.delete(`/api/companies/${companyId}`);
    } finally {
      await db.end();
    }
  }
}, 15_000);
