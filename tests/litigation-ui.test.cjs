const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const stateSource = html.slice(html.indexOf('const LIT_CASE_EXPANSION_KEY ='), html.indexOf('function syncLitCaseExpansion()'));
const calendarSource = html.slice(html.indexOf('function litigationCalendarDates('), html.indexOf('function openLitigationCalendar('));
function runtime(data = new Map(), mobile = false, blocked = false) {
  const context = vm.createContext({
    localStorage: {
      getItem: key => { if (blocked) throw Error('unavailable'); return data.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw Error('unavailable'); data.set(key, value); },
    },
    window: { matchMedia: () => ({ matches: context.mobile }) },
    mobile,
    store: { litigationRecords: [{ id:'a' }, { id:'b' }] },
  });
  vm.runInContext(stateSource + '\n' + calendarSource, context);
  return context;
}
const key = 'kanban_lit_case_expansion_v1';
test('all inline JavaScript parses', () => {
  let count = 0;
  for (const [, attrs, script] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/src\s*=|type\s*=\s*["']application\//.test(attrs)) continue;
    new vm.Script(script); count++;
  }
  assert.ok(count > 0);
});
test('each case keeps its choice across reload and viewport changes', () => {
  const data = new Map();
  let app = runtime(data);
  assert.equal(app.isLitCaseExpanded('a'), true);
  app.setLitCaseExpanded('a', false);
  app.setLitCaseExpanded('b', true);
  app.mobile = true;
  assert.equal(app.isLitCaseExpanded('a'), false);
  assert.equal(app.isLitCaseExpanded('b'), true);
  app = runtime(data, true);
  assert.equal(app.isLitCaseExpanded('a'), false);
  assert.equal(app.isLitCaseExpanded('b'), true);
  app.setLitCaseExpanded('a', true);
  assert.equal(runtime(data).isLitCaseExpanded('a'), true);
});
test('legacy mobile expanded and collapsed states migrate without changing the legacy key', () => {
  const data = new Map([['kanban_lit_mob_expanded_v31', '["b"]']]);
  const app = runtime(data);
  assert.equal(app.isLitCaseExpanded('a'), false);
  assert.equal(app.isLitCaseExpanded('b'), true);
  assert.equal(data.get('kanban_lit_mob_expanded_v31'), '["b"]');
  assert.deepEqual(JSON.parse(data.get(key)), { a:false, b:true });
  app.setLitCaseExpanded('a', true);
  assert.equal(runtime(data, true).isLitCaseExpanded('a'), true);
});
test('invalid stored values do not collapse cases; unavailable storage keeps session choices', () => {
  for (const raw of ['broken', '{"a":"false"}', '[]']) {
    assert.equal(runtime(new Map([[key, raw]])).isLitCaseExpanded('a'), true);
  }
  const app = runtime(new Map(), false, true);
  app.setLitCaseExpanded('a', false);
  assert.equal(app.isLitCaseExpanded('a'), false);
});
test('month grids include every date, align Monday to Sunday and handle leap years', () => {
  const app = runtime();
  for (const year of [2024, 2026, 2027, 2028]) {
    for (let month = 0; month < 12; month++) {
      const dates = app.litigationCalendarDates(year, month);
      assert.equal(dates[0].getDay(), 1);
      assert.equal(dates.at(-1).getDay(), 0);
      assert.equal(dates.length % 7, 0);
      assert.equal(new Set(dates.map(d => d.getTime())).size, dates.length);
      assert.equal(dates.filter(d => d.getMonth() === month).length, new Date(year, month + 1, 0).getDate());
    }
  }
});
