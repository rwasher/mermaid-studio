import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dependencyRoot = path.resolve(root, '../../..');

export function createServer({ source = '' } = {}) {
  const server = http.createServer(async (request, response) => {
    const requestedPath = new URL(request.url, 'http://127.0.0.1').pathname;
    const filePath = requestedPath === '/'
      ? path.join(root, 'index.html')
      : requestedPath.startsWith('/node_modules/mermaid/')
        ? path.join(dependencyRoot, requestedPath.slice(1))
        : null;
    if (!filePath || !path.resolve(filePath).startsWith(path.resolve(dependencyRoot)) && requestedPath !== '/') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    try {
      let content = await readFile(filePath, 'utf8');
      if (requestedPath === '/') {
        const serializedSource = JSON.stringify(source).replaceAll('<', '\\u003c');
        content = content.replace('__MERMAID_SOURCE__', serializedSource);
      }
      const contentType = filePath.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
      response.writeHead(200, { 'content-type': contentType, 'content-length': Buffer.byteLength(content) });
      response.end(content);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  return server;
}

export function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address());
    });
  });
}
