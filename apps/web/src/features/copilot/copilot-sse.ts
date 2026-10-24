export interface CopilotSseEvent {
  type: string;
  data: string;
}

/** Reads SSE records without losing split UTF-8 code points or line boundaries. */
export async function readCopilotSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: CopilotSseEvent) => void | Promise<void>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let type = 'message';
  const data: string[] = [];

  const dispatch = async () => {
    if (data.length) await onEvent({ type, data: data.join('\n') });
    type = 'message';
    data.length = 0;
  };

  const line = async (value: string) => {
    const valueWithoutCarriageReturn = value.endsWith('\r') ? value.slice(0, -1) : value;
    if (!valueWithoutCarriageReturn) {
      await dispatch();
      return;
    }
    if (valueWithoutCarriageReturn.startsWith(':')) return;
    const separator = valueWithoutCarriageReturn.indexOf(':');
    const field = separator < 0 ? valueWithoutCarriageReturn : valueWithoutCarriageReturn.slice(0, separator);
    const content = separator < 0 ? '' : valueWithoutCarriageReturn.slice(separator + 1).replace(/^ /, '');
    if (field === 'event') type = content;
    if (field === 'data') data.push(content);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let separator = buffer.indexOf('\n');
      while (separator >= 0) {
        const current = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 1);
        await line(current);
        separator = buffer.indexOf('\n');
      }
      if (done) {
        if (buffer) await line(buffer);
        await dispatch();
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
