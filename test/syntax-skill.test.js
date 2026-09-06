import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { launch } from '../.agents/skills/mermaid-studio/launcher.js';
import { updateSource } from '../.agents/skills/mermaid-studio/update.js';

const skillPath = new URL('../.agents/skills/mermaid-studio/SKILL.md', import.meta.url);

test('prompt templates in the skill render with the pinned Mermaid bundle', async () => {
  const skill = await readFile(skillPath, 'utf8');
  const templates = [...skill.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((match) => match[1]);
  assert.equal(templates.length, 6);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'mermaid-studio-syntax-'));
  const filePath = path.join(directory, 'workspace.mmd');
  await writeFile(filePath, templates[0], 'utf8');
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const workspace = await launch({ filePath, browserOpener: async () => {} });

  try {
    const page = await browser.newPage();
    await page.goto(workspace.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#diagram svg').waitFor();

    for (const source of templates) {
      await updateSource(filePath, source);
      await page.waitForFunction((expectedSource) => (
        document.querySelector('#source')?.value === expectedSource
        && document.querySelector('#diagram svg')
        && !document.querySelector('#status')?.textContent.startsWith('Unable to render workspace:')
      ), source);
      assert.equal(await page.locator('#diagram svg').count(), 1);
      assert.doesNotMatch(await page.locator('#status').innerText(), /^Unable to render workspace:/);
    }
  } finally {
    workspace.server.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
