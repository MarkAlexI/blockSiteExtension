import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

// Failure-only host diagnostics. These queries neither play audio nor change
// the sink, volume, browser or extension. Preserve errors as evidence rather
// than replacing the failed playback assertion with a missing-tool exception.
export async function readNativeAudioOutput({ run = execute } = {}) {
  const queries = [['info'], ['list', 'short', 'sinks'], ['list', 'short', 'sink-inputs']];
  const results = await Promise.allSettled(queries.map(args =>
    run('pactl', args, { timeout: 2000, maxBuffer: 64 * 1024, encoding: 'utf8' })));
  return results.map((result, index) => ({ command: 'pactl', args: queries[index],
    ...(result.status === 'fulfilled' ? { stdout: result.value.stdout.slice(0, 12000),
      stderr: result.value.stderr.slice(0, 4000) } : { error: String(result.reason) }) }));
}
