import { readCopilotSseStream } from './copilot-sse';
import { ReadableStream } from 'node:stream/web';

describe('readCopilotSseStream', () => {
  it('parses events split across chunks and decodes split UTF-8 characters', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('event: text_delta\r\ndata: {"delta":"Привет 🙂"}\r\n\r\nevent: completed\ndata: {"runId":"run-1"}\n\n');
    const split = bytes.findIndex((value, index) => index > 20 && value === 0xF0);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split + 2));
        controller.enqueue(bytes.slice(split + 2, split + 3));
        controller.enqueue(bytes.slice(split + 3));
        controller.close();
      },
    });
    const events: Array<{ type: string; data: string }> = [];

    await readCopilotSseStream(body, (event) => events.push(event));

    expect(events).toEqual([
      { type: 'text_delta', data: '{"delta":"Привет 🙂"}' },
      { type: 'completed', data: '{"runId":"run-1"}' },
    ]);
  });

  it('ignores comments and joins multiple data lines', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(': keepalive\nevent: status\ndata: {\ndata: "status":"running"}\n\n'));
        controller.close();
      },
    });
    const events: Array<{ type: string; data: string }> = [];

    await readCopilotSseStream(body, (event) => events.push(event));

    expect(events).toEqual([{ type: 'status', data: '{\n"status":"running"}' }]);
  });
});
