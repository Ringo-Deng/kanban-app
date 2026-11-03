const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const start = html.indexOf('// Litigation todo controls.');
const end = html.indexOf('// End litigation todo controls.');
assert.ok(start >= 0 && end > start, 'shared litigation todo controls must be present');
const source = html.slice(start, end);
const plain = value => JSON.parse(JSON.stringify(value));

function fixture() {
  return {
    litigationRecords: [
      { id: 'case-a', caseName: '测试案件', projectId: 'project-a', updatedAt: 1, timeline: [
        { id: 'line-a', text: '庭前准备', todos: [
          { id: 'a', text: '整理证据', status: '待处理', taskId: 'task-a', startDate: '2026-11-03', due: '2026-11-05' },
          { id: 'b', text: '提交材料', status: '待处理', taskId: 'task-b', due: '2026-11-06' },
          { id: 'c', text: '核对案号', status: '已完成', taskId: 'task-c', due: '' },
        ] },
        { id: 'line-b', text: '另一条进展', todos: [{ id: 'other-line', text: '其他事项' }] },
      ] },
      { id: 'case-b', caseName: '另一个案件', timeline: [{ id: 'line-c', todos: [{ id: 'other-case', text: '不应变更' }] }] },
    ],
    boards: { litigation: { projects: [{ id: 'project-a', tasks: [
      { id: 'task-a', title: '整理证据', taskTime: 1800 },
      { id: 'task-b', title: '提交材料' },
      { id: 'unrelated-task', title: '独立任务' },
    ] }] } },
    archive: { '2026-11-02': [{ taskId: 'task-c', title: '核对案号', time: 900 }] },
    timeEntries: [{ id: 'entry-a', taskId: 'task-a', duration: 1800 }, { id: 'entry-c', taskId: 'task-c', duration: 900 }],
    litigationReminders: [{ id: 'reminder-a', recordId: 'case-a', timelineId: 'line-a', targetDate: '2026-11-05' }],
  };
}

function runtime(initial = fixture()) {
  const history = [], calls = [];
  let persisted;
  const app = vm.createContext({
    store: plain(initial),
    litigationRecord: id => app.store.litigationRecords.find(record => record.id === id),
    ensureLitigationProject: (record, create) => {
      assert.equal(create, false, 'deletion must not create a board or project');
      const board = app.store.boards.litigation;
      const project = board?.projects.find(item => item.id === record.projectId);
      return project ? { board, project } : null;
    },
    findTaskAcrossBoards: taskId => {
      for (const board of Object.values(app.store.boards)) {
        for (const project of board.projects) {
          const task = project.tasks.find(item => item.id === taskId);
          if (task) return { board, project, task };
        }
      }
      return null;
    },
    pushHistory: () => { calls.push('history'); history.push(plain(app.store)); },
    save: options => {
      assert.equal(options?.immediate, true, 'reorder and deletion must persist immediately');
      calls.push('save');
      persisted = JSON.stringify(app.store);
    },
    renderLitigation: () => calls.push('render'),
    showToast: () => {},
  });
  vm.runInContext(source, app);
  return { app, history, calls, saved: () => JSON.parse(persisted) };
}

const todos = store => store.litigationRecords[0].timeline[0].todos;
const order = store => Array.from(todos(store), todo => todo.id);

test('moving a subtask before or after another preserves all subtask details and persists the order', () => {
  const initial = fixture();
  const { app, saved, history, calls } = runtime(initial);
  assert.equal(app.reorderLitigationTodo('case-a', 'line-a', 'c', 'a'), true);
  assert.deepEqual(order(app.store), ['c', 'a', 'b']);
  assert.deepEqual(order(saved()), ['c', 'a', 'b']);
  assert.deepEqual(history[0], initial);
  assert.ok(app.store.litigationRecords[0].updatedAt > 1);
  assert.equal(app.reorderLitigationTodo('case-a', 'line-a', 'c', 'b', true), true);
  assert.deepEqual(order(saved()), ['a', 'b', 'c']);
  assert.deepEqual(plain(todos(app.store)), todos(initial));
  assert.deepEqual(plain(app.store.boards), initial.boards);
  assert.deepEqual(plain(app.store.litigationRecords[1]), initial.litigationRecords[1]);
  assert.deepEqual(calls, ['history', 'save', 'render', 'history', 'save', 'render']);
});

test('reordering rejects cross-line and cross-case targets, stale ids, and moves with no effect', () => {
  const initial = fixture();
  const { app, history, calls } = runtime(initial);
  for (const args of [
    ['missing', 'line-a', 'a', 'b'],
    ['case-a', 'missing', 'a', 'b'],
    ['case-a', 'line-a', 'missing', 'b'],
    ['case-a', 'line-a', 'a', 'missing'],
    ['case-a', 'line-a', 'a', 'other-line'],
    ['case-a', 'line-a', 'a', 'other-case'],
    ['case-a', 'line-a', 'a', 'a'],
    ['case-a', 'line-a', 'a', 'b', false],
    ['case-a', 'line-a', 'b', 'a', true],
    ['case-a', 'line-b', 'other-line', 'other-line'],
  ]) assert.equal(app.reorderLitigationTodo(...args), false, JSON.stringify(args));
  assert.deepEqual(plain(app.store), initial);
  assert.deepEqual(history, []);
  assert.deepEqual(calls, []);
});

test('deleting an active subtask removes its linked board task while retaining time records and other work', () => {
  const initial = fixture();
  const { app, history, calls, saved } = runtime(initial);
  assert.equal(app.deleteLitigationTodo('case-a', 'line-a', 'a'), true);
  const reloaded = saved();
  assert.deepEqual(order(reloaded), ['b', 'c']);
  assert.deepEqual(reloaded.boards.litigation.projects[0].tasks.map(task => task.id), ['task-b', 'unrelated-task']);
  assert.deepEqual(reloaded.archive, initial.archive);
  assert.deepEqual(reloaded.timeEntries, initial.timeEntries);
  assert.deepEqual(reloaded.litigationReminders, initial.litigationReminders);
  assert.deepEqual(reloaded.litigationRecords[0].timeline[1], initial.litigationRecords[0].timeline[1]);
  assert.deepEqual(reloaded.litigationRecords[1], initial.litigationRecords[1]);
  assert.deepEqual(history[0], initial, 'undo snapshot must contain both the subtask and its linked task');
  assert.deepEqual(calls, ['history', 'save', 'render']);
});

test('a newly created blank subtask can be deleted without touching existing board tasks', () => {
  const initial = fixture();
  todos(initial).push({ id: 'blank', text: '', due: '', startDate: null, taskId: null, status: '待处理' });
  const { app, saved } = runtime(initial);
  assert.equal(app.deleteLitigationTodo('case-a', 'line-a', 'blank'), true);
  assert.deepEqual(order(saved()), ['a', 'b', 'c']);
  assert.deepEqual(saved().boards, initial.boards);
});

test('deleting a subtask also removes its board task after that task has moved to another project', () => {
  const initial = fixture();
  const sourceProject = initial.boards.litigation.projects[0];
  const [movedTask] = sourceProject.tasks.splice(0, 1);
  initial.boards.work = { projects: [{ id: 'moved-project', tasks: [
    movedTask, { id: 'other-work', title: '保留的其他任务' },
  ] }] };
  const { app, saved, history } = runtime(initial);
  assert.equal(app.deleteLitigationTodo('case-a', 'line-a', 'a'), true);
  const reloaded = saved();
  assert.deepEqual(order(reloaded), ['b', 'c']);
  assert.deepEqual(reloaded.boards.work.projects[0].tasks.map(task => task.id), ['other-work']);
  assert.deepEqual(reloaded.boards.litigation, initial.boards.litigation);
  assert.deepEqual(reloaded.timeEntries, initial.timeEntries);
  assert.deepEqual(reloaded.archive, initial.archive);
  assert.deepEqual(history[0], initial, 'undo must also retain the moved task in its original project');
});

test('deleting a completed subtask preserves its archive and historical time entries', () => {
  const initial = fixture();
  const { app, saved } = runtime(initial);
  assert.equal(app.deleteLitigationTodo('case-a', 'line-a', 'c'), true);
  assert.deepEqual(order(saved()), ['a', 'b']);
  assert.deepEqual(saved().archive, initial.archive);
  assert.deepEqual(saved().timeEntries, initial.timeEntries);
  assert.deepEqual(saved().boards, initial.boards);
});

test('subtasks remain deletable if their linked project or task no longer exists', () => {
  for (const missing of ['project', 'task']) {
    const initial = fixture();
    if (missing === 'project') initial.boards.litigation.projects = [];
    else initial.boards.litigation.projects[0].tasks = [];
    const { app, saved } = runtime(initial);
    assert.equal(app.deleteLitigationTodo('case-a', 'line-a', 'a'), true);
    assert.deepEqual(order(saved()), ['b', 'c']);
    assert.deepEqual(saved().boards, initial.boards);
  }
});

test('deletion rejects stale ids and ids belonging to a different line or case without saving', () => {
  const initial = fixture();
  const { app, calls, history } = runtime(initial);
  for (const args of [
    ['missing', 'line-a', 'a'], ['case-a', 'missing', 'a'],
    ['case-a', 'line-a', 'missing'], ['case-a', 'line-a', 'other-line'],
    ['case-b', 'line-c', 'a'],
  ]) assert.equal(app.deleteLitigationTodo(...args), false);
  assert.deepEqual(plain(app.store), initial);
  assert.deepEqual(history, []);
  assert.deepEqual(calls, []);
});

test('deleting the last subtask leaves an empty list and a second deletion is a no-op', () => {
  const { app, saved, history, calls } = runtime();
  assert.equal(app.deleteLitigationTodo('case-a', 'line-b', 'other-line'), true);
  assert.deepEqual(saved().litigationRecords[0].timeline[1].todos, []);
  assert.equal(app.deleteLitigationTodo('case-a', 'line-b', 'other-line'), false);
  assert.equal(history.length, 1);
  assert.deepEqual(calls, ['history', 'save', 'render']);
});
