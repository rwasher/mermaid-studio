import { execFile } from 'node:child_process';
import { createServer, listen } from './server.js';

export function defaultBrowserOpener(url) {
  return new Promise((resolve, reject) => {
    execFile('open', [url], (error) => error ? reject(error) : resolve());
  });
}

export async function launch({ browserOpener = defaultBrowserOpener, port = 0 } = {}) {
  const server = createServer();
  const address = await listen(server, port);
  const url = `http://127.0.0.1:${address.port}/`;
  await browserOpener(url);
  return { server, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  launch().then(({ url }) => console.log(`Mermaid Studio is running at ${url}`)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
