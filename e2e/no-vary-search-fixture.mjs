import { createServer } from 'node:https';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';

const execute = promisify(execFile);
export const NO_VARY_SEARCH = 'params=("utm_source")';

// A real HTTPS origin is required: routed/fulfilled requests disable Chromium's
// HTTP cache and cannot establish that a speculative response was reused.
export async function startNoVarySearchFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'bd-nvs-'));
  const events = [], cases = new Map();
  let server, origin, closed = false;
  try {
    const keyPath = path.join(root, 'server.key'), certPath = path.join(root, 'server.pem');
    await mkdir(root, { recursive: true });
    await execute(process.env.BD_OPENSSL || 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-days', '2', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { timeout: 15_000, windowsHide: true });
    const key = await readFile(keyPath), cert = await readFile(certPath);
    const publicKey = new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' });
    const spki = createHash('sha256').update(publicKey).digest('base64');
    server = createServer({ key, cert }, (request, response) => {
      const url = new URL(request.url, origin);
      const entry = cases.get(url.searchParams.get('case'));
      response.setHeader('content-type', 'text/html; charset=utf-8');
      if (!entry || !['/source', '/target'].includes(url.pathname)) {
        response.writeHead(404, { 'cache-control': 'no-store' }); response.end('Unknown fixture'); return;
      }
      if (url.pathname === '/source') {
        const rules = { prefetch: [{ urls: [entry.prefetchUrl], eagerness: 'immediate',
          expects_no_vary_search: NO_VARY_SEARCH }] };
        response.setHeader('cache-control', 'no-store');
        response.end(`<!doctype html><title>Native prefetch fixture</title><script type="speculationrules">${JSON.stringify(rules)}</script><a id="navigate" href="${entry.navigationUrl.replaceAll('&', '&amp;')}">Navigate</a>`);
        return;
      }
      const token = randomUUID();
      const event = { caseId: entry.id, url: url.href, token,
        purpose: request.headers['sec-purpose'] || request.headers.purpose || '',
        finished: false };
      events.push(event);
      response.on('finish', () => { event.finished = true; });
      response.setHeader('cache-control', 'private, max-age=300');
      response.setHeader('no-vary-search', NO_VARY_SEARCH);
      response.end(`<!doctype html><title>Native prefetched document</title><body data-response-token="${token}"><h1 id="allowed-resource">Allowed fixture</h1><script>console.info(${JSON.stringify('bd-nvs-executed:' + token)})</script></body>`);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = `https://127.0.0.1:${server.address().port}`;
    return { origin, spki, cert, events,
      createCase(name, { changeMaterial = false } = {}) {
        const id = `${name}-${randomUUID()}`;
        const query = new URLSearchParams({ case: id, keep: 'one', utm_source: 'prefetch' });
        const prefetchUrl = `${origin}/target?${query}`;
        query.set('utm_source', 'navigation');
        if (changeMaterial) query.set('keep', 'two');
        const entry = { id, prefetchUrl, navigationUrl: `${origin}/target?${query}`,
          sourceUrl: `${origin}/source?case=${id}` };
        cases.set(id, entry); return entry;
      },
      async close() {
        if (closed) return; closed = true;
        try {
          await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
            server.closeAllConnections();
          });
        } finally { await rm(root, { recursive: true, force: true }); }
      }
    };
  } catch (error) {
    server?.close(); server?.closeAllConnections();
    await rm(root, { recursive: true, force: true }); throw error;
  }
}
