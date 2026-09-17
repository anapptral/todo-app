import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');

const server = createApp().listen(0);
after(() => server.close());
const baseURL = `http://127.0.0.1:${server.address().port}`;

/** Tiny cookie-jar fetch client so sessions persist across calls. */
function makeClient() {
  let cookie = '';
  return async (path, options = {}) => {
    const res = await fetch(baseURL + path, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(options.headers ?? {}),
      },
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) cookie = setCookie[0].split(';')[0];
    return res;
  };
}

async function registerAndLogin(username, password = 'test-pass-123') {
  const client = makeClient();
  const res = await client('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 201);
  return client;
}

async function addTask(client, title) {
  const res = await client('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

let n = 0;
const unique = (name) => `${name}-tasks-${++n}-${Date.now()}`;

test('tasks require login (401 when logged out)', async () => {
  const client = makeClient();
  const res = await client('/api/tasks');
  assert.equal(res.status, 401);
});

test('a user can add tasks and sees only their own', async () => {
  const client = await registerAndLogin(unique('owner'));
  await addTask(client, 'Buy milk');
  await addTask(client, 'Walk the dog');

  const res = await client('/api/tasks');
  assert.equal(res.status, 200);
  const tasks = await res.json();
  assert.deepEqual(
    tasks.map((t) => t.title),
    ['Walk the dog', 'Buy milk']
  );
  assert.ok(tasks.every((t) => t.completed === 0));
});

test('a task can be completed and un-completed', async () => {
  const client = await registerAndLogin(unique('completer'));
  const task = await addTask(client, 'Water the plants');

  const done = await client(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(done.status, 200);

  let list = await (await client('/api/tasks')).json();
  assert.equal(list.find((t) => t.id === task.id).completed, 1);

  const undone = await client(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed: false }),
  });
  assert.equal(undone.status, 200);

  list = await (await client('/api/tasks')).json();
  assert.equal(list.find((t) => t.id === task.id).completed, 0);
});

test('PATCH with a non-boolean completed is rejected', async () => {
  const client = await registerAndLogin(unique('patcher'));
  const task = await addTask(client, 'Refactor the shed');
  const res = await client(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed: 'yes' }),
  });
  assert.equal(res.status, 400);
});

test('a task can be deleted', async () => {
  const client = await registerAndLogin(unique('deleter'));
  const a = await addTask(client, 'First');
  const b = await addTask(client, 'Second');

  const del = await client(`/api/tasks/${a.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);

  const titles = (await (await client('/api/tasks')).json()).map((t) => t.title);
  assert.deepEqual(titles, ['Second']);
  assert.ok(b.id > a.id);
});

test('one user cannot see, complete, or delete another user’s tasks', async () => {
  const owner = await registerAndLogin(unique('owner'));
  const intruder = await registerAndLogin(unique('intruder'));

  const task = await addTask(owner, 'Owner’s secret task');

  let res = await intruder('/api/tasks');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []); // no leakage into the other list

  res = await intruder(`/api/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(res.status, 404); // invisible, not forbidden

  res = await intruder(`/api/tasks/${task.id}`, { method: 'DELETE' });
  assert.equal(res.status, 404);

  // Owner still intact and untouched.
  const list = await (await owner('/api/tasks')).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].completed, 0);
});

test('empty task titles are rejected', async () => {
  const client = await registerAndLogin(unique('empty'));
  const res = await client('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: '   ' }),
  });
  assert.equal(res.status, 400);
});
