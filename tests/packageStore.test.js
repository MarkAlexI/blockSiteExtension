import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packageStores, runtimePaths } from '../tools/package-store.js';

function unzip(archive) {
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'ZIP central directory');
  let offset = archive.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < archive.readUInt16LE(end + 10); i++) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50);
    const method = archive.readUInt16LE(offset + 10);
    const size = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString();
    const local = archive.readUInt32LE(offset + 42);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const content = archive.subarray(start, start + size);
    if (!name.endsWith('/')) files.set(name, method === 8 ? inflateRawSync(content) : content);
    offset += 46 + nameLength + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
  }
  return files;
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'bd-store-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init']);
  for (const entry of runtimePaths) {
    const filename = path.join(root, entry.includes('.') ? entry : `${entry}/fixture.js`);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, `fixture:${entry}`);
  }
  writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ version: '5.3.20', manifest_version: 3, background: { service_worker: 'scripts/fixture.js' } }));
  writeFileSync(path.join(root, 'utils/storeTarget.js'), "export const STORE_TARGET = 'chrome';\n");
  writeFileSync(path.join(root, 'README.md'), 'Never include development documentation.');
  git(['add', '.']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'fixture']);
  return { root, git };
}

test('both store packages record the exact archive, commit and transformed runtime bytes', t => {
  const { root, git } = fixture(t);
  writeFileSync(path.join(root, 'local-note.txt'), 'development only');
  const results = packageStores(root, 'all');
  assert.deepEqual(results.map(item => item.target), ['chrome', 'edge']);
  for (const result of results) {
    assert.equal(result.version, '5.3.20');
    assert.equal(result.commit, git(['rev-parse', 'HEAD']));
    assert.equal(result.tree, git(['rev-parse', 'HEAD^{tree}']));
    const archive = path.join(root, 'dist', result.filename);
    const bytes = readFileSync(archive);
    assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(readFileSync(`${archive}.sha256`, 'utf8'), `${result.sha256}  ${result.filename}\n`);
    assert.deepEqual(JSON.parse(readFileSync(`${archive}.build.json`, 'utf8')), result);
    const files = unzip(bytes);
    assert.equal(files.size, result.runtimeFiles.length);
    assert.equal(files.has('local-note.txt'), false);
    assert.equal(files.has('README.md'), false);
    for (const entry of result.runtimeFiles) {
      const content = files.get(entry.path);
      const blob = createHash('sha1').update(Buffer.from(`blob ${content.length}\0`)).update(content).digest('hex');
      assert.equal(blob, entry.gitBlob, entry.path);
      if (result.target !== 'edge' || entry.path !== 'utils/storeTarget.js') {
        assert.equal(content.toString(), execFileSync('git', ['show', `HEAD:${entry.path}`], { cwd: root }).toString());
      }
    }
    assert.equal(files.get('utils/storeTarget.js').toString(), `export const STORE_TARGET = '${result.target}';\n`);
    assert.equal(result.overrides.length, result.target === 'edge' ? 1 : 0);
    if (result.target === 'edge') {
      const override = result.overrides[0];
      assert.equal(override.sourceGitBlob, git(['rev-parse', 'HEAD:utils/storeTarget.js']));
      assert.equal(override.sha256, createHash('sha256').update(files.get(override.path)).digest('hex'));
    }
  }
});

test('store packaging rejects local version drift, modified, staged, untracked and missing runtime files', t => {
  const { root, git } = fixture(t);
  for (const file of ['manifest.json', 'popup.js']) {
    const pathname = path.join(root, file);
    const original = readFileSync(pathname);
    writeFileSync(pathname, file === 'manifest.json' ? JSON.stringify({ version: '5.3.99' }) : 'local edit');
    assert.throws(() => packageStores(root, 'all'), /Commit runtime changes/);
    git(['add', file]);
    assert.throws(() => packageStores(root, 'all'), /Commit runtime changes/);
    git(['reset', '--', file]);
    writeFileSync(pathname, original);
  }
  const added = path.join(root, 'scripts/untracked.js'); writeFileSync(added, 'new runtime');
  assert.throws(() => packageStores(root), /Commit runtime changes/);
  rmSync(added); rmSync(path.join(root, 'popup.js'));
  assert.throws(() => packageStores(root), /Commit runtime changes/);
});

test('store packaging rejects a committed incomplete runtime tree and unknown targets', t => {
  const { root, git } = fixture(t);
  assert.throws(() => packageStores(root, 'unknown'), /Unsupported store target/);
  git(['rm', 'popup.js']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'incomplete']);
  assert.throws(() => packageStores(root), /Required runtime path is missing/);
});
