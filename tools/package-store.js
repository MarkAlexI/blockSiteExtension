import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const runtimePaths = [
  '_locales', 'backup', 'blocked.html', 'diagnostics', 'dom', 'feedback', 'images',
  'index.html', 'manifest.json', 'onboarding', 'options', 'popup.js', 'pro',
  'redirect.html', 'rules', 'schedules', 'scripts', 'styles', 'telemetry', 'update', 'utils'
];

export function packageStores(rootDir = fileURLToPath(new URL('..', import.meta.url)), requestedTarget = 'chrome') {
  const targets = requestedTarget === 'all' ? ['chrome', 'edge'] : [requestedTarget];
  if (targets.some(target => !['chrome', 'edge'].includes(target))) throw new Error(`Unsupported store target: ${requestedTarget}`);
  const git = args => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
  if (git(['status', '--porcelain', '--untracked-files=all', '--', ...runtimePaths])) {
    throw new Error('Commit runtime changes before packaging stores. The package is built from tracked HEAD.');
  }
  const commit = git(['rev-parse', 'HEAD']);
  const manifest = JSON.parse(git(['show', `${commit}:manifest.json`]));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Invalid extension version.');
  const tree = git(['rev-parse', `${commit}^{tree}`]);
  const objectFormat = git(['rev-parse', '--show-object-format']);
  const tracked = git(['ls-tree', '-r', '--full-tree', commit, '--', ...runtimePaths])
    .split('\n').filter(Boolean).map(line => {
      const match = /^(\d+) blob ([0-9a-f]+)\t(.+)$/.exec(line);
      if (!match || match[1] !== '100644') throw new Error(`Unsupported runtime entry: ${line}`);
      return { path: match[3], gitBlob: match[2] };
    });
  for (const root of runtimePaths) {
    if (!tracked.some(file => file.path === root || file.path.startsWith(`${root}/`))) {
      throw new Error(`Required runtime path is missing from HEAD: ${root}`);
    }
  }
  const source = git(['show', `${commit}:utils/storeTarget.js`]) + '\n';
  // Preserve the committed bytes exactly, including whether the final newline exists.
  const sourceBytes = execFileSync('git', ['show', `${commit}:utils/storeTarget.js`], { cwd: rootDir });
  const declaration = "export const STORE_TARGET = 'chrome';";
  if (!source.includes(declaration)) throw new Error('utils/storeTarget.js must default to the Chrome target.');
  const output = path.join(rootDir, 'dist');
  mkdirSync(output, { recursive: true });
  return targets.map(target => {
    const filename = `BlockDistraction-${manifest.version}-${target === 'chrome' ? 'cws' : 'edge'}.zip`;
    const archivePath = path.join(output, filename);
    const overrides = [];
    const args = ['archive', '--format=zip', '--output', archivePath];
    let runtimeFiles = tracked.map(file => ({ ...file }));
    if (target === 'edge') {
      const transformed = Buffer.from(sourceBytes.toString('utf8').replace(declaration, "export const STORE_TARGET = 'edge';"));
      const hash = createHash(objectFormat).update(Buffer.from(`blob ${transformed.length}\0`)).update(transformed).digest('hex');
      const entry = runtimeFiles.find(file => file.path === 'utils/storeTarget.js');
      overrides.push({ path: entry.path, sourceGitBlob: entry.gitBlob, gitBlob: hash, sha256: createHash('sha256').update(transformed).digest('hex') });
      entry.gitBlob = hash;
      args.push(`--add-virtual-file=utils/storeTarget.js:${transformed.toString('utf8')}`);
    }
    args.push(commit, '--', ...runtimePaths);
    if (target === 'edge') args.push(':(exclude)utils/storeTarget.js');
    execFileSync('git', args, { cwd: rootDir });
    const sha256 = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
    const metadata = { version: manifest.version, target, commit, tree, filename, sha256, signed: false, runtimeFiles, overrides };
    writeFileSync(`${archivePath}.sha256`, `${sha256}  ${filename}\n`);
    writeFileSync(`${archivePath}.build.json`, JSON.stringify(metadata, null, 2) + '\n');
    return metadata;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const result of packageStores(undefined, String(process.argv[2] || 'chrome').toLowerCase())) {
    console.log(`Created: dist/${result.filename}\nTarget: ${result.target}\nCommit: ${result.commit}\nSHA-256: ${result.sha256}`);
  }
}
