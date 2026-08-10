import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const toolsDir = path.dirname(currentFile);
const rootDir = path.resolve(toolsDir, '..');

const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (!manifest.version) {
  throw new Error('manifest.json does not contain a version.');
}

const runtimePaths = [
  '_locales',
  'blocked.html',
  'diagnostics',
  'dom',
  'feedback',
  'images',
  'index.html',
  'manifest.json',
  'onboarding',
  'options',
  'popup.js',
  'pro',
  'redirect.html',
  'rules',
  'schedules',
  'scripts',
  'styles',
  'telemetry',
  'update',
  'utils'
];

for (const entry of runtimePaths) {
  const absolutePath = path.join(rootDir, entry);

  if (!existsSync(absolutePath)) {
    throw new Error(`Required runtime path is missing: ${entry}`);
  }
}

const requestedTarget = String(process.argv[2] || 'chrome').toLowerCase();
const targets = requestedTarget === 'all'
  ? ['chrome', 'edge']
  : [requestedTarget];

for (const target of targets) {
  if (!['chrome', 'edge'].includes(target)) {
    throw new Error(`Unsupported store target: ${target}`);
  }
}

const distDir = path.join(rootDir, 'dist');
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const storeTargetPath = path.join(rootDir, 'utils', 'storeTarget.js');
const defaultStoreTargetSource = readFileSync(storeTargetPath, 'utf8');

if (!defaultStoreTargetSource.includes("export const STORE_TARGET = 'chrome';")) {
  throw new Error('utils/storeTarget.js must default to the Chrome target.');
}

function targetSource(target) {
  if (target === 'chrome') return defaultStoreTargetSource;

  return defaultStoreTargetSource.replace(
    "export const STORE_TARGET = 'chrome';",
    "export const STORE_TARGET = 'edge';"
  );
}

function archiveTarget(target) {
  const suffix = target === 'chrome' ? 'cws' : 'edge';
  const archiveName = `BlockDistraction-${manifest.version}-${suffix}.zip`;
  const archivePath = path.join(distDir, archiveName);

  const gitArgs = [
    'archive',
    '--format=zip',
    '--output',
    archivePath
  ];

  if (target === 'edge') {
    gitArgs.push(
      `--add-virtual-file=utils/storeTarget.js:${targetSource(target)}`
    );
  }

  gitArgs.push('HEAD', '--', ...runtimePaths);

  if (target === 'edge') {
    gitArgs.push(':(exclude)utils/storeTarget.js');
  }

  execFileSync('git', gitArgs, {
    cwd: rootDir,
    stdio: 'inherit'
  });

  const archive = readFileSync(archivePath);
  const sha256 = createHash('sha256').update(archive).digest('hex');

  console.log('');
  console.log(`Created: dist/${archiveName}`);
  console.log(`Target: ${target}`);
  console.log(`SHA-256: ${sha256}`);

  return { target, archiveName, archivePath, sha256 };
}

const results = targets.map(archiveTarget);

if (results.length === 2) {
  console.log('');
  console.log('Store packages are ready:');
  for (const result of results) {
    console.log(`- ${result.target}: dist/${result.archiveName}`);
  }
}
