import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { launch } from '../.agents/skills/mermaid-studio/launcher.js';
import { readSource, RevisionConflictError, updateSource } from '../.agents/skills/mermaid-studio/update.js';
import { revisionForSource } from '../.agents/skills/mermaid-studio/server.js';

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

test('invalid source keeps the last valid preview and later valid source recovers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const sourceA = 'flowchart LR\n  A[Valid A] --> B[Initial]\n';
  const sourceB = 'flowchart LR\n  A[Invalid B] -->\n';
  const sourceC = 'flowchart LR\n  A[Valid C] --> B[Recovered]\n';
  await writeFile(filePath, sourceA, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#diagram svg').waitFor();
    const initialSvg = await page.locator('#diagram').innerHTML();
    const initialRevision = (await readSource(filePath)).revision;

    await updateSource(filePath, sourceB, initialRevision);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Unable to render workspace:'));
    assert.equal(await page.locator('#diagram').innerHTML(), initialSvg);
    assert.match(await page.locator('#status').innerText(), /Unable to render workspace:/);
    assert.equal(await page.locator('#status').getAttribute('role'), 'status');

    await updateSource(filePath, sourceC);
    await page.waitForFunction(() => document.querySelector('#diagram')?.innerText.includes('Recovered'));
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Workspace'));
    assert.match(await page.locator('#diagram').innerText(), /Valid C/);
    assert.doesNotMatch(await page.locator('#status').innerText(), /Unable to render workspace:/);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('rapid source revisions leave the newest render visible', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  await writeFile(filePath, 'flowchart LR\n  A[Initial] --> B[Start]\n', 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#source').waitFor();
    const revisions = [
      'flowchart LR\n  A[Rapid one] --> B[One]\n',
      'flowchart LR\n  A[Rapid two] --> B[Two]\n',
      'flowchart LR\n  A[Rapid final] --> B[Final]\n',
    ];
    for (const nextSource of revisions) await page.locator('#source').fill(nextSource);
    await page.waitForFunction(() => document.querySelector('#diagram')?.innerText.includes('Rapid final'));
    assert.doesNotMatch(await page.locator('#diagram').innerText(), /Rapid one|Rapid two/);
    assert.match(await page.locator('#status').innerText(), /Workspace/);
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
    await page.waitForTimeout(275);
    assert.equal(await page.locator('#source').inputValue(), editedSource);
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

test('source writes require the current revision and return the updated revision', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const initialSource = 'flowchart LR\n  A[Initial]\n';
  const newerSource = 'flowchart LR\n  A[Newer]\n';
  const attemptedSource = 'flowchart LR\n  A[Stale]\n';
  await writeFile(filePath, initialSource, 'utf8');
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const initial = await (await fetch(`${workspace.url}source`)).json();
    await writeFile(filePath, newerSource, 'utf8');
    const conflictResponse = await fetch(`${workspace.url}source`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: attemptedSource, revision: initial.revision }),
    });
    assert.equal(conflictResponse.status, 409);
    const conflict = await conflictResponse.json();
    assert.equal(conflict.source, newerSource);
    assert.equal(conflict.revision, revisionForSource(newerSource));
    assert.equal(await readFile(filePath, 'utf8'), newerSource);

    const matchingResponse = await fetch(`${workspace.url}source`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: attemptedSource, revision: conflict.revision }),
    });
    assert.equal(matchingResponse.status, 200);
    assert.equal((await matchingResponse.json()).revision, revisionForSource(attemptedSource));
    assert.equal(await readFile(filePath, 'utf8'), attemptedSource);
  } finally {
    workspace.server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser preserves local text and reports a stale save conflict', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const initialSource = 'flowchart LR\n  A[Initial]\n';
  const newerSource = 'flowchart LR\n  A[Newer]\n';
  const localSource = 'flowchart LR\n  A[Local unsaved]\n';
  await writeFile(filePath, initialSource, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#source').waitFor();
    await page.locator('#source').fill(localSource);
    await writeFile(filePath, newerSource, 'utf8');
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Save conflict:'));
    assert.equal(await page.locator('#source').inputValue(), localSource);
    assert.equal(await readFile(filePath, 'utf8'), newerSource);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser copies the active Mermaid source and reports clipboard failures', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const source = 'flowchart LR\n  A[Exact source] --> B[Clipboard]\n';
  await writeFile(filePath, source, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const copiedPage = await browser.newPage();
    await copiedPage.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__copiedSource = value; } },
      });
    });
    await copiedPage.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await copiedPage.locator('#copy-source').click();
    await copiedPage.waitForFunction(() => window.__copiedSource !== undefined);
    assert.equal(await copiedPage.evaluate(() => window.__copiedSource), source);
    assert.equal(await copiedPage.locator('#status').innerText(), 'Mermaid source copied to clipboard.');

    const failedPage = await browser.newPage();
    await failedPage.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new Error('permission denied'); } },
      });
    });
    await failedPage.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await failedPage.locator('#copy-source').click();
    await failedPage.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Unable to copy Mermaid source:'));
    assert.equal(await failedPage.locator('#status').getAttribute('data-state'), 'error');
    assert.match(await failedPage.locator('#status').innerText(), /permission denied/);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser pastes Mermaid source into the active workspace and preview', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const source = 'flowchart LR\n  A[Pasted] --> B[Preview]\n';
  await writeFile(filePath, 'flowchart LR\n  A[Original]\n', 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.addInitScript((value) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: async () => value },
      });
    }, source);
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#paste-source').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Mermaid source pasted and workspace saved.');
    assert.equal(await page.locator('#source').inputValue(), source);
    assert.match(await page.locator('#diagram').innerText(), /Pasted/);
    assert.match(await page.locator('#diagram').innerText(), /Preview/);
    assert.equal(await readFile(filePath, 'utf8'), source);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser reports an empty clipboard without replacing the active source', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const source = 'flowchart LR\n  A[Original]\n';
  await writeFile(filePath, source, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: async () => '' },
      });
    });
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#paste-source').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Unable to paste Mermaid source: Clipboard is empty.');
    assert.equal(await page.locator('#status').getAttribute('data-state'), 'error');
    assert.equal(await page.locator('#source').inputValue(), source);
    assert.equal(await readFile(filePath, 'utf8'), source);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser imports a selected Mermaid file into the active workspace and preview', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const importPath = path.join(directory, 'selected.mmd');
  const source = 'flowchart LR\n  A[Imported] --> B[Preview]\n';
  await writeFile(filePath, 'flowchart LR\n  A[Original]\n', 'utf8');
  await writeFile(importPath, source, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#import-source').setInputFiles(importPath);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Mermaid file imported and workspace saved.');
    assert.equal(await page.locator('#source').inputValue(), source);
    assert.match(await page.locator('#diagram').innerHTML(), /Imported/);
    assert.equal(await readFile(filePath, 'utf8'), source);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser reports a clear error when importing a non-Mermaid file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const importPath = path.join(directory, 'selected.txt');
  const source = 'flowchart LR\n  A[Original]\n';
  await writeFile(filePath, source, 'utf8');
  await writeFile(importPath, 'not a Mermaid workspace', 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#import-source').setInputFiles(importPath);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Unable to import Mermaid file:'));
    assert.equal(await page.locator('#status').innerText(), 'Unable to import Mermaid file: Choose a file ending in .mmd.');
    assert.equal(await readFile(filePath, 'utf8'), source);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser downloads the current rendered diagram as a non-empty SVG', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const source = 'flowchart LR\n  A[Export current] --> B[SVG diagram]\n';
  await writeFile(filePath, source, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#diagram svg').waitFor();
    await page.locator('#export-svg').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#export-svg').isEnabled(), true);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-svg').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'mermaid-diagram.svg');
    const exportedSvg = await readFile(await download.path(), 'utf8');
    assert.ok(exportedSvg.length > 0);
    assert.match(exportedSvg, /<svg[\s>]/);
    assert.match(exportedSvg, /Export current/);
    assert.match(exportedSvg, /SVG diagram/);
    assert.equal(await page.locator('#status').innerText(), 'SVG diagram downloaded.');
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser disables SVG export for invalid Mermaid source', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  await writeFile(filePath, 'flowchart LR\n  A[Invalid] -->\n', 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Unable to render workspace:'));
    assert.equal(await page.locator('#export-svg').isDisabled(), true);
    assert.equal(await page.locator('#diagram svg').count(), 0);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser downloads a non-empty PNG matching the rendered diagram dimensions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const source = 'flowchart LR\n  A[Export current] --> B[PNG diagram]\n';
  await writeFile(filePath, source, 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#diagram svg').waitFor();
    assert.equal(await page.locator('#export-png').isEnabled(), true);
    const expected = await page.locator('#diagram svg').evaluate((svg) => ({
      width: svg.viewBox.baseVal.width,
      height: svg.viewBox.baseVal.height,
      text: svg.textContent,
    }));
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-png').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'mermaid-diagram.png');
    const png = await readFile(await download.path());
    assert.ok(png.length > 1000);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.equal(png.readUInt32BE(16), Math.round(expected.width));
    assert.equal(png.readUInt32BE(20), Math.round(expected.height));
    assert.match(expected.text, /Export current/);
    assert.match(expected.text, /PNG diagram/);
    assert.equal(await page.locator('#status').innerText(), 'PNG diagram downloaded.');
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser disables PNG export for invalid Mermaid source', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  await writeFile(filePath, 'flowchart LR\n  A[Invalid] -->\n', 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Unable to render workspace:'));
    assert.equal(await page.locator('#export-png').isDisabled(), true);
    assert.equal(await page.locator('#diagram svg').count(), 0);
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('agent updater rejects a stale expected revision without writing', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-'));
  const filePath = path.join(directory, 'workspace.mmd');
  const initialSource = 'flowchart LR\n  A[Initial]\n';
  const newerSource = 'flowchart LR\n  A[Newer]\n';
  await writeFile(filePath, initialSource, 'utf8');
  try {
    const initial = await readSource(filePath);
    await writeFile(filePath, newerSource, 'utf8');
    await assert.rejects(() => updateSource(filePath, 'flowchart LR\n  A[Stale]\n', initial.revision), RevisionConflictError);
    assert.equal(await readFile(filePath, 'utf8'), newerSource);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
