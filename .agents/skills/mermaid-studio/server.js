import http from 'node:http';
import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dependencyRoot = path.resolve(root, '../../..');

export function revisionForSource(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

export function createServer({ source = '', filePath, revision = revisionForSource(source) } = {}) {
  const server = http.createServer(async (request, response) => {
    const requestedPath = new URL(request.url, 'http://127.0.0.1').pathname;
    if (requestedPath === '/source') {
      if (!filePath) {
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Workspace source is unavailable' }));
        return;
      }
      if (request.method === 'POST') {
        if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
          response.writeHead(415, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'Expected application/json request' }));
          return;
        }
        let body = '';
        let tooLarge = false;
        request.setEncoding('utf8');
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 1_000_000) {
            tooLarge = true;
            break;
          }
        }
        if (tooLarge) {
          response.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'Source request is too large' }));
          return;
        }
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'Request body must be valid JSON' }));
          return;
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)
          || Object.keys(payload).length !== 2 || !Object.hasOwn(payload, 'source')
          || !Object.hasOwn(payload, 'revision') || typeof payload.source !== 'string'
          || typeof payload.revision !== 'string') {
          response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'Request body must contain only string source and revision fields' }));
          return;
        }
        try {
          const handle = await open(filePath, 'r+');
          try {
            const currentSource = await handle.readFile('utf8');
            const currentRevision = revisionForSource(currentSource);
            if (payload.revision !== currentRevision) {
              const conflict = JSON.stringify({
                error: 'Workspace source changed since this revision was read',
                source: currentSource,
                revision: currentRevision,
              });
              response.writeHead(409, {
                'content-type': 'application/json; charset=utf-8',
                'content-length': Buffer.byteLength(conflict),
                'cache-control': 'no-store',
              });
              response.end(conflict);
              return;
            }
            await handle.truncate(0);
            await handle.write(payload.source, 0, 'utf8', 0);
          } finally {
            await handle.close();
          }
          const result = JSON.stringify({ source: payload.source, revision: revisionForSource(payload.source) });
          response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(result),
            'cache-control': 'no-store',
          });
          response.end(result);
        } catch {
          response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'Workspace source could not be saved' }));
        }
        return;
      }
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET, POST', 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Use GET or POST /source' }));
        return;
      }
      try {
        const currentSource = await readFile(filePath, 'utf8');
        const body = JSON.stringify({ source: currentSource, revision: revisionForSource(currentSource) });
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(body),
          'cache-control': 'no-store',
        });
        response.end(body);
      } catch {
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Workspace source is unavailable' }));
      }
      return;
    }
    const assetPath = requestedPath === '/'
      ? path.join(root, 'index.html')
      : requestedPath.startsWith('/node_modules/mermaid/')
        ? path.join(dependencyRoot, requestedPath.slice(1))
        : null;
    if (!assetPath || !path.resolve(assetPath).startsWith(path.resolve(dependencyRoot)) && requestedPath !== '/') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    try {
      let content = await readFile(assetPath, 'utf8');
      if (requestedPath === '/') {
        const serializedSource = JSON.stringify(source).replaceAll('<', '\\u003c');
        content = content.replace('__MERMAID_SOURCE__', serializedSource)
          .replace('__MERMAID_REVISION__', JSON.stringify(revision));
      }
      const contentType = assetPath.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
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
