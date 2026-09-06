import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repository = path.resolve(new URL('.', import.meta.url).pathname, '..');
const skillSource = path.join(repository, '.agents', 'skills', 'mermaid-studio');
const rendererSource = path.join(repository, 'node_modules', 'mermaid');
const stage = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-package-'));
const installedSkill = path.join(stage, 'mermaid-studio');
const workspace = path.join(stage, 'workspace.mmd');
const browserCache = path.join(stage, 'playwright-cache');

try {
  await cp(skillSource, installedSkill, { recursive: true });
  await mkdir(path.join(installedSkill, 'node_modules'), { recursive: true });
  await cp(rendererSource, path.join(installedSkill, 'node_modules', 'mermaid'), { recursive: true, dereference: true });
  await readFile(path.join(installedSkill, 'node_modules', 'mermaid', 'dist', 'mermaid.esm.mjs'), 'utf8');
  await writeFile(workspace, 'flowchart LR\n  A[Packaged] --> B[Skill]\n', 'utf8');
  const { launch, stop } = await import(path.join(installedSkill, 'launcher.js'));

  const previousCache = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserCache;
  const opened = [];
  const running = await launch({ filePath: workspace, browserOpener: async (url) => opened.push(url) });
  try {
    assert.deepEqual(opened, [running.url]);
    const health = await (await fetch(new URL('/health', running.url))).json();
    assert.equal(health.healthy, true);
    const renderer = await fetch(new URL('/node_modules/mermaid/dist/mermaid.esm.mjs', running.url));
    assert.equal(renderer.status, 200);
    assert.match(await renderer.text(), /mermaid/);
    assert.deepEqual(await readdir(browserCache).catch(() => []), []);
    assert.equal(await readFile(workspace, 'utf8'), 'flowchart LR\n  A[Packaged] --> B[Skill]\n');
  } finally {
    await stop({ filePath: workspace });
    if (previousCache === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previousCache;
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
