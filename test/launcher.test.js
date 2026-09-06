import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { launch } from '../.agents/skills/mermaid-studio/launcher.js';

test('launch uses an injected browser opener and loopback URL', async () => {
  let opened;
  const { server, url } = await launch({ browserOpener: async (value) => { opened = value; } });
  try {
    assert.equal(opened, url);
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  } finally {
    server.close();
  }
});

test('fixed Mermaid example renders an SVG in headless Chrome', async () => {
  const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ executablePath, headless: true });
  const { server, url } = await launch({ browserOpener: async () => {} });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#diagram svg').waitFor();
    assert.equal(await page.locator('#diagram svg').count(), 1);
    assert.match(await page.locator('#diagram').innerText(), /Start/);
    assert.match(await page.locator('#diagram').innerText(), /Finish/);
  } finally {
    await browser.close();
    server.close();
  }
});
