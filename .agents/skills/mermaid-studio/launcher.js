import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, listen, revisionForSource } from './server.js';

const lifecycleDirectory = path.join(os.tmpdir(), 'mermaid-studio');

export function lifecyclePath(filePath) {
  const key = createHash('sha256').update(path.resolve(filePath)).digest('hex');
  return path.join(lifecycleDirectory, `${key}.json`);
}

async function removeLifecycle(filePath) {
  await unlink(lifecyclePath(filePath)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
}

async function readLifecycle(filePath) {
  try { return JSON.parse(await readFile(lifecyclePath(filePath), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
}

async function writeLifecycle(filePath, state) {
  await mkdir(lifecycleDirectory, { recursive: true, mode: 0o700 });
  await writeFile(lifecyclePath(filePath), JSON.stringify(state), { mode: 0o600 });
}

export async function healthCheck(url, filePath, timeoutMs = 1000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL('/health', url), { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return false;
    const health = await response.json();
    return health.healthy === true && path.resolve(health.filePath) === path.resolve(filePath);
  } catch { return false; }
  finally { clearTimeout(timeout); }
}

async function stopAt(url, token, timeoutMs = 1000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL('/stop', url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), signal: controller.signal });
    return response.ok;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}

export async function stop({ filePath } = {}) {
  const selectedPath = validatePath(filePath, '--file');
  const lifecycle = await readLifecycle(selectedPath);
  if (!lifecycle) return false;
  const stopped = await stopAt(lifecycle.url, lifecycle.token);
  await removeLifecycle(selectedPath);
  return stopped;
}

export async function lifecycleState({ filePath } = {}) {
  return readLifecycle(validatePath(filePath, '--file'));
}

export function defaultBrowserOpener(url) {
  return new Promise((resolve, reject) => {
    execFile('open', [url], (error) => error ? reject(error) : resolve());
  });
}

function usageError(message) {
  return new Error(`${message}\nUsage: node .agents/skills/mermaid-studio/launcher.js --new <absolute-path.mmd> | --file <absolute-path.mmd>`);
}

function validatePath(filePath, option) {
  if (!filePath || !path.isAbsolute(filePath)) {
    throw usageError(`${option} requires an absolute local path`);
  }
  if (path.extname(filePath).toLowerCase() !== '.mmd') {
    throw usageError(`${option} path must end in .mmd`);
  }
  return filePath;
}

export async function launch({ browserOpener = defaultBrowserOpener, port = 0, filePath, create = false } = {}) {
  const selectedPath = validatePath(filePath, create ? '--new' : '--file');
  let source;
  if (create) {
    try {
      const handle = await open(selectedPath, 'wx');
      await handle.close();
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw usageError(`cannot create ${selectedPath}: file already exists`);
      }
      throw error;
    }
    source = '';
  } else {
    source = await readFile(selectedPath, 'utf8');
  }
  const existing = await readLifecycle(selectedPath);
  if (!create && existing && await healthCheck(existing.url, selectedPath)) {
    await browserOpener(existing.url);
    return { server: { close: () => stop({ filePath: selectedPath }) }, url: existing.url, reused: true, lifecycle: existing };
  }
  if (existing) await removeLifecycle(selectedPath);
  const controlToken = randomUUID();
  let stopping = false;
  const server = createServer({ source, filePath: selectedPath, revision: revisionForSource(source), controlToken, onStop: () => {
    if (stopping) return;
    stopping = true;
    server.close();
  } });
  const address = await listen(server, port);
  const url = `http://127.0.0.1:${address.port}/`;
  const lifecycle = { version: 1, filePath: selectedPath, url, port: address.port, pid: process.pid, token: controlToken, startedAt: new Date().toISOString() };
  await writeLifecycle(selectedPath, lifecycle);
  server.once('close', () => removeLifecycle(selectedPath).catch(() => {}));
  try {
    await browserOpener(url);
  } catch (error) {
    server.close();
    throw error;
  }
  return { server, url, reused: false, lifecycle };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = args[0];
  if (args.length === 2 && option === '--stop') {
    stop({ filePath: args[1] }).then((stopped) => console.log(stopped ? 'Mermaid Studio stopped.' : 'Mermaid Studio was not running.')).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  } else if (args.length !== 2 || !['--new', '--file'].includes(option)) {
    console.error(usageError('choose exactly one workspace option').message);
    process.exitCode = 1;
  } else {
    launch({ filePath: args[1], create: option === '--new' }).then(({ url }) => console.log(`Mermaid Studio is running at ${url}`)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  }
}
