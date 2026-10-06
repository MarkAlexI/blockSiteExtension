import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultExpectedVersion } from '../e2e/target-version.mjs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('all visible and published release metadata describe the same extension version', () => {
  assert.equal(packageJson.version, manifest.version);
  assert.equal(changelog.match(/^## \[([^\]]+)\]/m)?.[1], manifest.version);
  assert.equal(readme.includes(`Chromium%20Source-v${manifest.version}-`), true);
  assert.equal(readme.includes('img.shields.io/chrome-web-store/v/kfhgdgokgjmdboidlhphajinmgpcmmec'), true);
  assert.equal(readme.includes('Chrome%20Web%20Store-v'), false);

  if (Object.hasOwn(manifest, 'version_name')) {
    assert.equal(manifest.version_name, manifest.version);
  }
});

test('E2E instructions and default target match the checked-out manifest', () => {
  const instructions = readFileSync(new URL('../e2e/README.md', import.meta.url), 'utf8');
  assert.equal(defaultExpectedVersion, manifest.version);
  assert.equal(instructions.includes(`**${manifest.version}**`), true);
  assert.equal(instructions.includes('5.3.6'), false);
});
