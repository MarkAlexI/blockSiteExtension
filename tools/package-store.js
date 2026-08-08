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

const distDir = path.join(rootDir, 'dist');

rmSync(distDir, {
  recursive: true,
  force: true
});

mkdirSync(distDir, {
  recursive: true
});

const archiveName =
  `BlockDistraction-${manifest.version}-store.zip`;

const archivePath = path.join(distDir, archiveName);

/*
 * Build the package directly from the checked-out Git commit.
 *
 * Only explicitly allowed runtime files and directories are included.
 * Development files such as tests/, tools/, docs/, .github/,
 * package.json and README.md cannot enter the store package.
 */
execFileSync(
  'git',
  [
    'archive',
    '--format=zip',
    '--output',
    archivePath,
    'HEAD',
    '--',
    ...runtimePaths
  ],
  {
    cwd: rootDir,
    stdio: 'inherit'
  }
);

const archive = readFileSync(archivePath);

const sha256 = createHash('sha256')
  .update(archive)
  .digest('hex');

console.log('');
console.log(`Created: dist/${archiveName}`);
console.log(`SHA-256: ${sha256}`);