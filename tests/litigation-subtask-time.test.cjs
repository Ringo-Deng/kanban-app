const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const extract = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const source = [
  extract('function resolveTaskName(', 'function resolveProjectName('),
  extract('function splitTimeRangeToLocalDays(', '// v5.69: 过期未完成任务'),
  extract('function stopActiveTimer(', '// v1.2: 启动一个番茄钟'),
  extract('// Litigation todo controls.', '// End litigation todo controls.'),
].join('\n');
const plain = value => JSON.parse(JSON.stringify(value));
const start = Date.parse('2026-11-03T08:00:00Z');

function fixture() {
  return {
    litigationRecords: [{ id: 'case', caseName: '测试案件', projectId: 'project', timeline: [
      { id: 'line', todos: [{ id: 'todo', text: '整理证据', status: '待处理', taskId: 'task' }] },
    ] }],
    boards: { board: { name: '诉讼看板', projects: [{ id: 'project', name: '测试案件', color: '#224466', tasks: [
      { id: 'task', title: '整理证据', notes: '保留备注', checklist: [{ id: 'check', text: '核对原件', done: true }],
        translations: { ja: { text: '証拠資料の整理', manual: true } } },
      { id: 'other', title: '另一任务' },
    ] }] } },
    archive: {},
    timeEntries: [{ id: 'entry', taskId: 'task', projectId: 'project', start, end: start + 3600000 }],
    tsDescByTaskId: { task: { translations: { en: { text: 'Organize evidence', manual: true } } } },
  };
}

function runtime(initial = fixture(), timer = null) {
  const history = [], timerStates = [];
  let persisted, id = 0;
  const app = vm.createContext({
    store: plain(initial), activeTimer: timer && plain(timer), timerDraftNote: '',
    litigationRecord: recordId => app.store.litigationRecords.find(record => record.id === recordId),
    findTaskAcrossBoards: taskId => {
      for (const [boardKey, board] of Object.entries(app.store.boards)) {
        for (const project of board.projects) {
          const task = project.tasks.find(item => item.id === taskId);
          if (task) return { task, project, board, boardKey };
        }
      }
      return null;
    },
    findProjectOfTask: taskId => app.findTaskAcrossBoards(taskId)?.project,
    findArchivedTask: taskId => Object.values(app.store.archive).flat().find(item => item.taskId === taskId),
    collectArchiveEntries: () => Object.values(app.store.archive).flat(),
    ensureLitigationProject: record => {
      for (const [key, board] of Object.entries(app.store.boards)) {
        const project = board.projects.find(item => item.id === record.projectId);
        if (project) return { key, board, project };
      }
      return null;
    },
    localDateStr: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    uid: () => `time-${++id}`,
    getActiveElapsedMs: () => app.activeTimer?.elapsed || 0,
    pushHistory: () => history.push(plain(app.store)),
    save: () => { persisted = JSON.stringify(app.store); },
    persistTimerRuntime: () => timerStates.push(plain(app.activeTimer)),
    stopTimerInterval: () => {}, renderTimerPanel: () => {}, refreshAllCardTimeDisplays: () => {},
    renderLitigation: () => {},
  });
  vm.runInContext(source, app);
  return { app, history, timerStates, saved: () => JSON.parse(persisted) };
}

test('deleting a timed subtask preserves names, project, notes, checklist and translations after reload', () => {
  const { app, saved } = runtime();
  const before = plain(app.collectTimesheetEntries()[0]);
  assert.equal(app.deleteLitigationTodo('case', 'line', 'todo'), true);
  const reloaded = runtime(saved()).app;
  const after = plain(reloaded.collectTimesheetEntries()[0]);
  for (const field of ['title', 'projectId', 'projectName', 'projectColor', 'boardKey', 'boardName', 'notes', 'checklist', 'totalTimeMs']) {
    assert.deepEqual(after[field], before[field], field);
  }
  assert.equal(after.translations.ja.text, '証拠資料の整理');
  assert.equal(after.translations.en.text, 'Organize evidence');
  assert.equal(reloaded.resolveTaskName('task'), '整理证据');
  assert.equal(reloaded.findTaskAcrossBoards('task'), null);
});

test('deletion settles only its running timer before the undo snapshot, retaining settled work on undo', () => {
  const initial = fixture();
  initial.timeEntries = [];
  const timer = { taskId: 'task', projectId: 'project', start, elapsed: 120000, note: '本次计时' };
  const { app, history, timerStates, saved } = runtime(initial, timer);
  assert.equal(app.deleteLitigationTodo('case', 'line', 'todo'), true);
  assert.equal(app.activeTimer, null);
  assert.deepEqual(timerStates, [null]);
  assert.equal(app.collectTimesheetEntries()[0].totalTimeMs, 120000);
  assert.equal(app.collectTimesheetEntries()[0].title, '整理证据');
  assert.equal(saved().timeEntries.length, 1);
  assert.equal(saved().timeEntries[0].note, '本次计时');
  assert.equal(history.length, 2, 'timer settlement and deletion have separate undo entries');
  app.store = history.at(-1);
  assert.ok(app.findTaskAcrossBoards('task'), 'undo restores the linked task');
  assert.equal(app.store.litigationRecords[0].timeline[0].todos[0].id, 'todo');
  assert.equal(app.collectTimesheetEntries()[0].totalTimeMs, 120000, 'undo deletion retains newly settled time');
});

test('deleting another subtask does not stop or persist an unrelated running timer', () => {
  const timer = { taskId: 'other', projectId: 'project', start, elapsed: 300000 };
  const { app, timerStates, history } = runtime(fixture(), timer);
  assert.equal(app.deleteLitigationTodo('case', 'line', 'todo'), true);
  assert.deepEqual(plain(app.activeTimer), timer);
  assert.deepEqual(timerStates, []);
  assert.equal(history.length, 1);
});

test('a moved linked task retains its actual project and board in historical work', () => {
  const initial = fixture();
  const [task] = initial.boards.board.projects[0].tasks.splice(0, 1);
  initial.boards.moved = { name: '其他看板', projects: [{ id: 'moved-project', name: '其他项目', tasks: [task] }] };
  const { app } = runtime(initial);
  assert.equal(app.deleteLitigationTodo('case', 'line', 'todo'), true);
  assert.equal(app.findTaskAcrossBoards('task'), null);
  const entry = app.collectTimesheetEntries()[0];
  assert.equal(entry.projectId, 'moved-project');
  assert.equal(entry.projectName, '其他项目');
  assert.equal(entry.boardKey, 'moved');
  assert.equal(entry.boardName, '其他看板');
});

test('restored active tasks and archived tasks take precedence over deletion metadata', () => {
  const { app, history } = runtime();
  app.deleteLitigationTodo('case', 'line', 'todo');
  const retained = plain(app.store.tsDescByTaskId);
  app.store = history.at(-1);
  app.store.tsDescByTaskId = retained;
  const task = app.findTaskAcrossBoards('task').task;
  task.title = '恢复后修改的名称';
  task.notes = '';
  task.checklist = [];
  assert.equal(app.resolveTaskName('task'), '恢复后修改的名称');
  assert.equal(app.collectTimesheetEntries()[0].title, '恢复后修改的名称');
  assert.equal(app.collectTimesheetEntries()[0].notes, '');
  assert.deepEqual(plain(app.collectTimesheetEntries()[0].checklist), []);
  app.findTaskAcrossBoards('task').project.tasks = [];
  app.store.archive.month = [{ taskId: 'task', title: '已归档名称', projectName: '归档项目' }];
  assert.equal(app.resolveTaskName('task'), '已归档名称');
  assert.equal(app.collectTimesheetEntries()[0].title, '已归档名称');
});
