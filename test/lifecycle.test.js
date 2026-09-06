import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launch, lifecyclePath, lifecycleState, stop } from '../.agents/skills/mermaid-studio/launcher.js';

const quietOpen = async () => {};
const workspace = async (directory, name, source = '') => {
  const filePath = path.join(directory, name);
  await writeFile(filePath, source, 'utf8');
  return { filePath, source };
};

async function waitForStopped(filePath) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await lifecycleState({ filePath }))) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(await lifecycleState({ filePath }), null);
}

test('healthy launch reuses one server and explicit stop works', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-life-'));
  const { filePath } = await workspace(directory, 'one.mmd', 'flowchart LR\n A-->B\n');
  const first = await launch({ filePath, browserOpener: quietOpen });
  const second = await launch({ filePath, browserOpener: quietOpen });
  try {
    assert.equal(second.reused, true);
    assert.equal(second.url, first.url);
    assert.equal((await (await fetch(new URL('/health', first.url))).json()).healthy, true);
    assert.equal(await stop({ filePath }), true);
    await assert.rejects(() => fetch(new URL('/health', first.url)));
  } finally {
    first.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('stale lifecycle state is discarded and the workspace recovers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-life-'));
  const { filePath } = await workspace(directory, 'stale.mmd', 'flowchart LR\n A-->B\n');
  await writeFile(lifecyclePath(filePath), JSON.stringify({ url: 'http://127.0.0.1:1/', filePath, token: 'stale' }));
  const recovered = await launch({ filePath, browserOpener: quietOpen });
  try {
    assert.equal(recovered.reused, false);
    assert.match(recovered.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal((await (await fetch(new URL('/health', recovered.url))).json()).healthy, true);
  } finally {
    recovered.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('separate sessions retain separate sources and reconnect resumes the selected workspace', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-life-'));
  const one = await workspace(directory, 'one.mmd', 'one source\n');
  const two = await workspace(directory, 'two.mmd', 'two source\n');
  const first = await launch({ filePath: one.filePath, browserOpener: quietOpen });
  const second = await launch({ filePath: two.filePath, browserOpener: quietOpen });
  try {
    assert.notEqual(first.url, second.url);
    assert.equal((await (await fetch(new URL('/source', first.url))).json()).source, one.source);
    assert.equal((await (await fetch(new URL('/source', second.url))).json()).source, two.source);
    await writeFile(one.filePath, 'one resumed\n', 'utf8');
    first.server.close();
    await waitForStopped(one.filePath);
    const restarted = await launch({ filePath: one.filePath, browserOpener: quietOpen });
    assert.equal(restarted.reused, false);
    assert.equal((await (await fetch(new URL('/source', restarted.url))).json()).source, 'one resumed\n');
  } finally {
    first.server.close();
    second.server.close();
    await lifecycleState({ filePath: one.filePath }).then((state) => state && stop({ filePath: one.filePath }));
    await rm(directory, { recursive: true, force: true });
  }
});
