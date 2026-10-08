import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeChromiumArgs } from '../e2e/native-launch.mjs';

test('native visibility launch and restart use the same explicit isolated profile', () => {
  const config = { profile: '/tmp/isolated profile', port: 12345, headless: false, args: ['--load-extension=/tmp/extension'] };
  const first = nativeChromiumArgs(config);
  const restarted = nativeChromiumArgs({ ...config, port: 12346 });
  assert.equal(first.filter(arg => arg.startsWith('--user-data-dir=')).length, 1);
  assert.equal(first.find(arg => arg.startsWith('--user-data-dir=')), '--user-data-dir=/tmp/isolated profile');
  assert.equal(restarted.find(arg => arg.startsWith('--user-data-dir=')), first.find(arg => arg.startsWith('--user-data-dir=')));
  assert.ok(first.includes('--remote-debugging-port=12345'));
  assert.ok(restarted.includes('--remote-debugging-port=12346'));
  assert.equal(first.includes('--headless=new'), false);
  assert.equal(nativeChromiumArgs({ ...config, headless: true }).includes('--headless=new'), true);
});
