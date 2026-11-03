const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function sourceBetween(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `source block ${start}`);
  return html.slice(from, to);
}
const source = [
  sourceBetween('const PRIMARY_STORAGE_KEY =', 'const STORAGE_KEY ='),
  sourceBetween('function isStoreEffectivelyEmpty(', 'let store = loadStore();'),
  sourceBetween('function localDateStr(', 'function today('),
  sourceBetween('function calendarWeekKey(', 'function renderCalendarWeekNote('),
  sourceBetween('const SYNC_EXTRA_DEFAULTS =', 'function validateSyncEnvelope('),
  sourceBetween('function cloneSyncValue(', 'function currentDeviceLabel('),
  sourceBetween('function applyBusinessData(', 'async function executeManualSync('),
  sourceBetween('async function saveAutoHistorySnapshot(', 'function scheduleAutoHistoryRefresh('),
].join('\n');

function fixture(notes = { '2026-11-02': '  整理材料\n提交清单\n' }) {
  return {
    boards: { blank: { name: '默认', projects: [], trash: [] } },
    currentBoard: 'blank', boardOrder: ['blank'],
    timeEntries: [], archive: {}, litigationRecords: [],
    calendarWeekNotes: notes,
  };
}
function runtime(initial = fixture(), stored = new Map()) {
  let historyRecord;
  const app = vm.createContext({
    store: plain(initial), state: null,
    localStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      key: index => Array.from(stored.keys())[index] ?? null,
      get length() { return stored.size; },
    },
    STORAGE_KEY: 'test-data', window: {},
    ensureBoardData: key => app.store.boards[key],
    generateBoardId: () => 'generated',
    updateBoardLabel() {}, renderBoardMenu() {}, updateTrashCount() {}, render() {},
    indexedDB: {}, AUTO_HISTORY_KEY: 'history', AUTO_HISTORY_LIMIT: 30,
    autoBackupDayKey: () => '2026-11-03', currentDeviceLabel: () => 'test',
    readAutoHistoryRecord: async () => ({ items: [] }), openIdb: async () => ({}),
    idbPut: async (_db, _table, value) => { historyRecord = value; },
    save() {},
  });
  vm.runInContext(source, app);
  return { app, stored, history: () => historyRecord };
}

test('notes-only current data is neither empty nor displaced by a populated legacy storage area', () => {
  const notesOnly = fixture();
  const legacy = fixture({});
  legacy.boards.blank.projects = [{ id: 'old', tasks: [{ id: 'old-task' }] }];
  const stored = new Map([
    ['kanban_projects_v31_blank', JSON.stringify(notesOnly)],
    ['kanban_projects_v30_bot', JSON.stringify(legacy)],
  ]);
  const { app } = runtime(notesOnly, stored);
  assert.equal(app.isStoreEffectivelyEmpty(notesOnly), false);
  assert.ok(app.storedKanbanDataWeight(notesOnly) > 0);
  assert.equal(app.selectKanbanStorageKey(), 'kanban_projects_v31_blank');
  assert.equal(app.isStoreEffectivelyEmpty(fixture({})), true);
});

test('notes survive the business-data export/import roundtrip including raw whitespace and line breaks', () => {
  const original = fixture();
  const { app, stored } = runtime(original);
  const exported = plain(app.buildBusinessData());
  assert.deepEqual(exported.calendarWeekNotes, original.calendarWeekNotes);
  app.store.calendarWeekNotes = {};
  app.applyBusinessData(exported);
  assert.deepEqual(plain(app.store.calendarWeekNotes), original.calendarWeekNotes);
  assert.deepEqual(JSON.parse(stored.get('test-data')).calendarWeekNotes, original.calendarWeekNotes);
  exported.calendarWeekNotes['2026-11-02'] = '修改导出副本';
  assert.deepEqual(plain(app.store.calendarWeekNotes), original.calendarWeekNotes);
});

test('older snapshots preserve local notes, while an explicit empty map clears them', () => {
  const original = fixture();
  const { app } = runtime(original);
  const oldData = fixture();
  delete oldData.calendarWeekNotes;
  app.applyBusinessData(oldData);
  assert.deepEqual(plain(app.store.calendarWeekNotes), original.calendarWeekNotes);
  app.applyBusinessData(fixture({}));
  assert.deepEqual(plain(app.store.calendarWeekNotes), {});
  delete app.store.calendarWeekNotes;
  assert.deepEqual(plain(app.buildBusinessData().calendarWeekNotes), {});
});

test('invalid note maps, values and week keys are rejected before replacing local data', () => {
  const { app, stored } = runtime();
  const before = plain(app.store);
  for (const invalid of [
    null, [], 'text', 1,
    { '2026-11-02': {} }, { '2026-11-02': 42 }, { '2026-11-02': null },
    { 'not-a-date': 'text' }, { '2026-11-03': 'Tuesday' }, { '2026-02-30': 'invalid day' },
  ]) {
    assert.throws(() => app.applyBusinessData(fixture(invalid)), /同步数据格式错误/);
    assert.deepEqual(plain(app.store), before);
    assert.equal(stored.has('test-data'), false);
  }
  for (const week of ['2026-11-02', '2026-12-28', '2027-01-04']) {
    assert.doesNotThrow(() => app.validateBusinessData(fixture({ [week]: '第一行\n第二行' })));
  }
});

test('notes-only data is eligible for automatic history and carries notes into the saved snapshot', async () => {
  const original = fixture();
  const { app, history } = runtime(original);
  const summary = app.summarizeBusinessData(original);
  assert.equal(summary.calendarWeekNotes, 1);
  assert.equal(app.hasMeaningfulBusinessData(summary), true);
  assert.match(app.syncSummaryText(summary), /1 周笔记/);
  const snapshot = await app.saveAutoHistorySnapshot('test');
  assert.deepEqual(plain(snapshot.data.calendarWeekNotes), original.calendarWeekNotes);
  assert.deepEqual(plain(history().items[0].data.calendarWeekNotes), original.calendarWeekNotes);
  assert.equal(app.hasMeaningfulBusinessData(app.summarizeBusinessData(fixture({}))), false);
});

test('local Monday keys stay stable across month/year boundaries and daylight-saving transitions', () => {
  const dates = ['2027-01-01', '2026-11-01', '2026-11-02', '2026-03-08', '2026-03-09', '2026-02-01'];
  const expected = ['2026-12-28', '2026-10-26', '2026-11-02', '2026-03-02', '2026-03-09', '2026-01-26'];
  const keySource = sourceBetween('function localDateStr(', 'function today(')
    + sourceBetween('function calendarWeekKey(', 'function getCalendarWeekNote(');
  const script = keySource + `\nprocess.stdout.write(JSON.stringify(${JSON.stringify(dates)}.map(value => calendarWeekKey(new Date(value + 'T00:30:00')))));`;
  for (const timezone of ['Asia/Shanghai', 'America/New_York']) {
    const result = execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(result), expected, timezone);
  }
});

test('note editing preserves multiline text and clearing removes only that week', () => {
  const { app } = runtime(fixture({ '2026-11-02': '本周', '2026-11-09': '下周' }));
  const text = '  整理材料\n- 核对日期\n';
  assert.equal(app.setCalendarWeekNote('2026-11-02', text), true);
  assert.equal(app.getCalendarWeekNote('2026-11-02'), text);
  assert.equal(app.setCalendarWeekNote('2026-11-03', '不可写入非周一键'), false);
  assert.equal(app.setCalendarWeekNote('2026-11-02', ' \n\t'), true);
  assert.deepEqual(plain(app.store.calendarWeekNotes), { '2026-11-09': '下周' });
});
