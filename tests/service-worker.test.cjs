const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '../sw.js'), 'utf8');
function worker(offline = false) {
  const events = {}, deleted = [], writes = [], requested = [];
  const cache = { match: async () => 'offline HTML', put: async (...args) => writes.push(args) };
  vm.runInNewContext(source, {
    URL, Response,
    self: { registration:{ scope:'https://example.com/kanban-app/' }, addEventListener:(name, cb) => events[name] = cb, skipWaiting:async () => {}, clients:{ claim:async () => {} } },
    caches:{ open:async () => cache, keys:async () => ['other-app', 'kanban-app-shell-old', 'kanban-app-shell-20261026'], delete:async key => deleted.push(key) },
    fetch:async (request, options) => { requested.push(options.cache); if (offline) throw Error('offline'); return { ok:true, clone:() => 'fresh HTML' }; }
  });
  return { events, deleted, writes, requested };
}
test('documents use network-first and preserve an offline copy', async () => {
  const app = worker();
  const waits = []; let response;
  app.events.fetch({ request:{ method:'GET', mode:'navigate', url:'https://example.com/kanban-app/?version=new' }, waitUntil:p => waits.push(p), respondWith:p => response = p });
  assert.equal((await response).ok, true);
  await Promise.all(waits);
  assert.deepEqual(app.requested, ['no-cache']);
  assert.equal(app.writes[0][0], 'https://example.com/kanban-app/index.html');
});
test('offline documents fall back to this application cache', async () => {
  const app = worker(true); let response;
  app.events.fetch({ request:{ method:'GET', url:'https://example.com/kanban-app/index.html?new=1' }, waitUntil:() => {}, respondWith:p => response = p });
  assert.equal(await response, 'offline HTML');
});
test('activation only removes this app cache; other paths are not intercepted', async () => {
  const app = worker(); let activated;
  app.events.activate({ waitUntil:p => activated = p }); await activated;
  assert.deepEqual(app.deleted, ['kanban-app-shell-old']);
  app.events.fetch({ request:{ method:'GET', mode:'navigate', url:'https://example.com/another-app/' }, respondWith:() => assert.fail('other app intercepted') });
});
