import { open } from 'node:fs/promises';
import path from 'node:path';

function usageError(message) {
  return new Error(`${message}\nUsage: cat diagram.mmd | node .agents/skills/mermaid-studio/update.js /absolute/path/workspace.mmd`);
}

function validatePath(filePath) {
  if (!filePath || !path.isAbsolute(filePath)) {
    throw usageError('update requires an absolute local path');
  }
  if (path.extname(filePath).toLowerCase() !== '.mmd') {
    throw usageError('update path must end in .mmd');
  }
  return filePath;
}

export async function updateSource(filePath, source) {
  const selectedPath = validatePath(filePath);
  const handle = await open(selectedPath, 'r+');
  try {
    await handle.truncate(0);
    await handle.writeFile(source, 'utf8');
  } finally {
    await handle.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (process.argv.length !== 3) {
    console.error(usageError('choose exactly one existing workspace file').message);
    process.exitCode = 1;
  } else {
    process.stdin.setEncoding('utf8');
    let source = '';
    process.stdin.on('data', (chunk) => { source += chunk; });
    process.stdin.on('end', () => updateSource(filePath, source).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    }));
  }
}
