import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { revisionForSource } from './server.js';

function usageError(message) {
  return new Error(`${message}\nUsage: cat diagram.mmd | node .agents/skills/mermaid-studio/update.js [--revision <revision>] /absolute/path/workspace.mmd\n       node .agents/skills/mermaid-studio/update.js --read /absolute/path/workspace.mmd`);
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

export class RevisionConflictError extends Error {
  constructor(expectedRevision, currentRevision) {
    super(`Workspace source changed before update (expected revision ${expectedRevision}, current revision ${currentRevision})`);
    this.name = 'RevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

export async function readSource(filePath) {
  const selectedPath = validatePath(filePath);
  const source = await readFile(selectedPath, 'utf8');
  return { source, revision: revisionForSource(source) };
}

export async function updateSource(filePath, source, expectedRevision) {
  const selectedPath = validatePath(filePath);
  const initial = await readSource(selectedPath);
  const revision = expectedRevision ?? initial.revision;
  if (revision !== initial.revision) {
    throw new RevisionConflictError(revision, initial.revision);
  }
  const handle = await open(selectedPath, 'r+');
  try {
    const currentSource = await handle.readFile('utf8');
    const currentRevision = revisionForSource(currentSource);
    if (revision !== currentRevision) {
      throw new RevisionConflictError(revision, currentRevision);
    }
    await handle.truncate(0);
    await handle.write(source, 0, 'utf8', 0);
  } finally {
    await handle.close();
  }
  return { source, revision: revisionForSource(source) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const readOnly = args[0] === '--read';
  let expectedRevision;
  let filePath;
  if (readOnly && args.length === 2) {
    filePath = args[1];
  } else if (!readOnly) {
    if (args.length === 1) filePath = args[0];
    if (args.length === 3 && args[0] === '--revision') {
      expectedRevision = args[1];
      filePath = args[2];
    }
  }
  if (!filePath) {
    console.error(usageError('choose one existing workspace file').message);
    process.exitCode = 1;
  } else if (readOnly) {
    readSource(filePath).then((result) => console.log(JSON.stringify(result))).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  } else {
    process.stdin.setEncoding('utf8');
    let source = '';
    process.stdin.on('data', (chunk) => { source += chunk; });
    process.stdin.on('end', () => updateSource(filePath, source, expectedRevision).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    }));
  }
}
