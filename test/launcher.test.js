import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { launch } from '../.agents/skills/mermaid-studio/launcher.js';
import { updateSource } from '../.agents/skills/mermaid-studio/update.js';

test('launch uses an injected browser opener and loopback URL', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  let opened;
  const { server, url } = await launch({ filePath, create: true, browserOpener: async (value) => { opened = value; } });
  try {
    assert.equal(opened, url);
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('new workspace is empty and existing source renders without byte changes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const source = 'flowchart LR\n  A[Start] --> B[Finish]\n';
  await writeFile(filePath, source, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const existing = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(existing.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#diagram svg').waitFor();
    assert.equal(await page.locator('#diagram svg').count(), 1);
    assert.match(await page.locator('#diagram').innerText(), /Start/);
    assert.match(await page.locator('#diagram').innerText(), /Finish/);
    assert.equal(await readFile(filePath, 'utf8'), source);
    existing.server.close();

    const createdPath = path.join(directory, 'empty.mmd');
    const empty = await launch({ filePath: createdPath, create: true, browserOpener: async () => {} });
    const emptyPage = await browser.newPage();
    await emptyPage.goto(empty.url, { waitUntil: 'domcontentloaded' });
    assert.equal(await emptyPage.locator('#diagram svg').count(), 0);
    assert.match(await emptyPage.locator('#status').innerText(), /Empty workspace/);
    assert.equal(await readFile(createdPath, 'utf8'), '');
    await assert.rejects(() => launch({ filePath: createdPath, create: true, browserOpener: async () => {} }), /already exists/);
    empty.server.close();
  } finally {
    await browser.close();
    existing.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects ambiguous and unsafe workspace arguments', async () => {
  await assert.rejects(() => import('../.agents/skills/mermaid-studio/launcher.js').then(({ launch }) => launch()), /--file/);
  await assert.rejects(() => import('../.agents/skills/mermaid-studio/launcher.js').then(({ launch }) => launch({ filePath: 'relative.mmd' })), /absolute local path/);
});

test('successive agent updates render in the same tab without navigation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  await writeFile(filePath, 'flowchart LR\n  A[First] --> B[Initial]\n', 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    let navigationCount = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigationCount += 1;
    });
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#diagram svg').waitFor();
    assert.equal(navigationCount, 1);

    await updateSource(filePath, 'flowchart LR\n  A[First] --> B[Second]\n');
    await page.waitForFunction(() => document.querySelector('#diagram')?.innerText.includes('Second'));
    assert.equal(navigationCount, 1);

    await updateSource(filePath, 'flowchart LR\n  A[First] --> B[Third]\n');
    await page.waitForFunction(() => document.querySelector('#diagram')?.innerText.includes('Third'));
    assert.equal(navigationCount, 1);
    assert.equal(await readFile(filePath, 'utf8'), 'flowchart LR\n  A[First] --> B[Third]\n');
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('editor autosaves source and renders in place without navigation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const initialSource = 'flowchart LR\n  A[Start] --> B[Initial]\n';
  const editedSource = 'flowchart LR\n  A[Start] --> B[Edited]\n';
  await writeFile(filePath, initialSource, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    let navigationCount = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigationCount += 1;
    });
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    const pageUrl = page.url();
    await page.locator('#diagram svg').waitFor();
    await page.locator('#source').fill(editedSource);
    await page.locator('#status').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Workspace saved and rendered.');
    await page.waitForFunction(async (expected) => (await fetch('/source', { cache: 'no-store' })).json().then(({ source }) => source === expected), editedSource);
    assert.equal(await readFile(filePath, 'utf8'), editedSource);
    await page.waitForFunction(() => document.querySelector('#diagram')?.innerText.includes('Edited'));
    assert.match(await page.locator('#diagram').innerText(), /Edited/);
    assert.equal(await page.locator('#diagram svg').count(), 1);
    assert.equal(await page.locator('#source').inputValue(), editedSource);
    assert.equal(page.url(), pageUrl);
    assert.equal(navigationCount, 1);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
