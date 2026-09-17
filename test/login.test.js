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

let n = 0;
const unique = (name) => `${name}-${++n}-${Date.now()}`;

test('POST /api/register creates an account and starts a session', async () => {
  const username = unique('alice');
  const client = await registerAndLogin(username);
  const me = await client('/api/me');
  assert.equal(me.status, 200);
  assert.equal((await me.json()).username, username);
});

test('POST /api/register rejects duplicate usernames (case-insensitive)', async () => {
  const username = unique('bob');
  await registerAndLogin(username);
  const client = makeClient();
  const res = await client('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username: username.toUpperCase(), password: 'password2' }),
  });
  assert.equal(res.status, 409);
});

test('POST /api/register rejects missing fields and short passwords', async () => {
  const client = makeClient();
  const missing = await client('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username: unique('x') }),
  });
  assert.equal(missing.status, 400);

  const short = await client('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username: unique('x'), password: 'abc' }),
  });
  assert.equal(short.status, 400);
});

test('POST /api/login succeeds with correct credentials', async () => {
  const username = unique('carol');
  await registerAndLogin(username, 's3cret-pass');
  const client = makeClient();
  const res = await client('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password: 's3cret-pass' }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).username, username);
});

test('POST /api/login fails with wrong password (401)', async () => {
  const username = unique('dave');
  await registerAndLogin(username, 'right-password');
  const client = makeClient();
  const res = await client('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password: 'wrong-password' }),
  });
  assert.equal(res.status, 401);
  assert.ok((await res.json()).error);
});

test('POST /api/login fails with unknown username (401) and a generic message', async () => {
  const client = makeClient();
  const res = await client('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: unique('nobody'), password: 'whatever' }),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /invalid/i);
});

test('Passwords are stored hashed, never as plain text', async () => {
  const { db, findUserByUsername } = await import('../src/db.js');
  const username = unique('hashcheck');
  const password = 'visible-plain-text';
  await registerAndLogin(username, password);

  const row = findUserByUsername(username);
  assert.ok(row);
  assert.notEqual(row.password_hash, password);
  assert.match(row.password_hash, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  // Raw scan of the whole users table: the plain text must appear nowhere.
  for (const r of db.prepare('SELECT password_hash FROM users').all()) {
    assert.ok(!r.password_hash.includes(password));
  }
});

test('POST /api/logout ends the session', async () => {
  const client = await registerAndLogin(unique('erin'), 'logout-pass');
  const res = await client('/api/logout', { method: 'POST' });
  assert.equal(res.status, 200);
  const me = await client('/api/me');
  assert.equal(me.status, 401);
});
