import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repository = path.resolve(new URL('.', import.meta.url).pathname, '..');
const [operations, readme, status, skillPackage] = await Promise.all([
  readFile(path.join(repository, 'docs', 'OPERATIONS.md'), 'utf8'),
  readFile(path.join(repository, 'README.md'), 'utf8'),
  readFile(path.join(repository, 'docs', 'STATUS.md'), 'utf8'),
  readFile(path.join(repository, '.agents', 'skills', 'mermaid-studio', 'package.json'), 'utf8').then(JSON.parse),
]);

for (const heading of [
  'Fresh workspace and conversational updates',
  'Syntax recovery',
  'Stop, reconnect, and separate sessions',
  'Export and clipboard actions',
  'Operational and security boundaries',
  'macOS and browser limitations',
  'Team and plugin distribution proposal',
]) assert.match(operations, new RegExp(`^## ${heading}$`, 'm'), `walkthrough heading missing: ${heading}`);
for (const command of ['--new', '--file', '--stop', 'update.js', '--read', '--revision', 'npm install --prefix']) {
  assert.match(operations, new RegExp(command.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `documented command missing: ${command}`);
}
assert.match(operations, /--omit=dev --ignore-scripts/);
assert.match(operations, /mermaid@11\.17\.2/);
assert.match(operations, /127\.0\.0\.1/);
assert.match(operations, /1,000,000 bytes/);
assert.match(operations, /#32/);
assert.match(readme, /docs\/OPERATIONS\.md/);
assert.match(status, /Issue #32/);
assert.match(status, /No next implementation branch/);
assert.equal(skillPackage.dependencies.mermaid, '11.17.2');

console.log('Documentation and packaging references are consistent.');
