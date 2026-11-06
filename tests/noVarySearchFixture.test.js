import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:https';
import { startNoVarySearchFixture, NO_VARY_SEARCH } from '../e2e/no-vary-search-fixture.mjs';

function read(url, ca, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = get(url, { ca, headers }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
  });
}

test('native prefetch origin serves real TLS, cacheable No-Vary-Search responses and unique body witnesses', async () => {
  const fixture = await startNoVarySearchFixture();
  try {
    const entry = fixture.createCase('positive');
    const source = await read(entry.sourceUrl, fixture.cert);
    assert.equal(source.status, 200);
    assert.equal(source.headers['cache-control'], 'no-store');
    const json = source.body.match(/<script type="speculationrules">(.*?)<\/script>/)[1];
    const rules = JSON.parse(json);
    assert.deepEqual(rules.prefetch[0].urls, [entry.prefetchUrl]);
    assert.equal(rules.prefetch[0].expects_no_vary_search, NO_VARY_SEARCH);
    const first = await read(entry.prefetchUrl, fixture.cert, { 'sec-purpose': 'prefetch' });
    const second = await read(entry.navigationUrl, fixture.cert);
    assert.equal(first.headers['no-vary-search'], NO_VARY_SEARCH);
    assert.equal(first.headers['cache-control'], 'private, max-age=300');
    assert.equal(fixture.events.length, 2, 'the server never simulates browser cache reuse');
    assert.notEqual(fixture.events[0].token, fixture.events[1].token);
    assert.ok(first.body.includes(fixture.events[0].token));
    assert.ok(second.body.includes(fixture.events[1].token));
    assert.ok(fixture.events.every(event => event.finished));
    assert.equal(fixture.events[0].purpose, 'prefetch');
    assert.equal(fixture.events[1].purpose, '');
    const mismatch = fixture.createCase('negative', { changeMaterial: true });
    assert.equal(new URL(mismatch.prefetchUrl).searchParams.get('keep'), 'one');
    assert.equal(new URL(mismatch.navigationUrl).searchParams.get('keep'), 'two');
    assert.equal((await read(fixture.origin + '/unknown', fixture.cert)).status, 404);
  } finally { await fixture.close(); await fixture.close(); }
  await assert.rejects(read(fixture.origin, fixture.cert));
});
