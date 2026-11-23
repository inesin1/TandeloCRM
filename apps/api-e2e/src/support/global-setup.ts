import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { on, once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    apiUrl: string;
    adminCredentials: { email: string; password: string };
  }
}

export default async function setup({ provide }: TestProject) {
  const {
    API_E2E_DATABASE_URL: databaseUrl,
    API_E2E_ADMIN_EMAIL: email,
    API_E2E_ADMIN_PASSWORD: password,
  } = process.env;
  if (!databaseUrl || !email || !password) {
    throw new Error(
      'Set API_E2E_DATABASE_URL, API_E2E_ADMIN_EMAIL and API_E2E_ADMIN_PASSWORD for the dedicated test database.',
    );
  }

  const entrypoint = resolve(
    import.meta.dirname,
    '../../../../dist/apps/api/main.js',
  );
  const server = spawn(process.execPath, [entrypoint], {
    cwd: dirname(entrypoint),
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '0',
      DATABASE_URL: databaseUrl,
      JWT_SECRET: randomBytes(32).toString('hex'),
      COPILOT_ENABLED: 'false',
      NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(server, 'close');
  const stop = async () => {
    if (server.exitCode === null && server.signalCode === null) server.kill();
    await closed;
  };

  const lines = createInterface({ input: server.stdout });
  let startupError = '';
  server.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    startupError = (startupError + chunk).slice(-8_000);
  });

  try {
    for await (const [line] of on(lines, 'line', {
      close: ['close'],
      signal: AbortSignal.timeout(10_000),
    })) {
      const apiUrl = line.match(
        /API listening at (http:\/\/127\.0\.0\.1:\d+)/,
      )?.[1];
      if (apiUrl) {
        provide('apiUrl', apiUrl);
        provide('adminCredentials', { email, password });
        return stop;
      }
    }
    throw new Error('The API exited during startup');
  } catch (cause) {
    await stop();
    throw new Error(`Could not start the E2E API. ${startupError}`, { cause });
  }
}
