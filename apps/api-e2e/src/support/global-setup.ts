import { killPort, waitForPortOpen } from '@nx/node/utils';

export default async function setup() {
  console.log('\nSetting up...\n');

  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await waitForPortOpen(port, { host });

  return async () => {
    await killPort(port);
    console.log('\nTearing down...\n');
  };
}
