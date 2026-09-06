import { execFile } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer, listen, revisionForSource } from './server.js';

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
  const server = createServer({ source, filePath: selectedPath, revision: revisionForSource(source) });
  const address = await listen(server, port);
  const url = `http://127.0.0.1:${address.port}/`;
  try {
    await browserOpener(url);
  } catch (error) {
    server.close();
    throw error;
  }
  return { server, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = args[0];
  if (args.length !== 2 || !['--new', '--file'].includes(option)) {
    console.error(usageError('choose exactly one workspace option').message);
    process.exitCode = 1;
  } else {
    launch({ filePath: args[1], create: option === '--new' }).then(({ url }) => console.log(`Mermaid Studio is running at ${url}`)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  }
}
