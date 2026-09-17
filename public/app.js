/* global fetch, document */
const $ = (id) => document.getElementById(id);

const authView = $('auth-view');
const tasksView = $('tasks-view');
const authError = $('auth-error');
const tasksError = $('tasks-error');

let registerMode = false;

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function clearError(el) {
  el.hidden = true;
  el.textContent = '';
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function checkSession() {
  try {
    const me = await api('/api/me');
    enterTasksView(me.username);
  } catch {
    showAuthView();
  }
}

function showAuthView() {
  authView.hidden = false;
  tasksView.hidden = true;
}

function enterTasksView(username) {
  authView.hidden = true;
  tasksView.hidden = false;
  $('greeting').textContent = `Logged in as ${username}`;
  clearError(tasksError);
  refreshTasks();
}

function setRegisterMode(on) {
  registerMode = on;
  $('tab-login').classList.toggle('active', !on);
  $('tab-register').classList.toggle('active', on);
  $('auth-submit').textContent = on ? 'Create account' : 'Log in';
  $('password').autocomplete = on ? 'new-password' : 'current-password';
  clearError(authError);
}

$('tab-login').addEventListener('click', () => setRegisterMode(false));
$('tab-register').addEventListener('click', () => setRegisterMode(true));

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(authError);
  const username = $('username').value.trim();
  const password = $('password').value;
  const path = registerMode ? '/api/register' : '/api/login';
  try {
    const user = await api(path, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    enterTasksView(user.username);
  } catch (err) {
    showError(authError, err.message);
  }
});

$('logout-btn').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } finally {
    $('auth-form').reset();
    showAuthView();
  }
});

async function refreshTasks() {
  try {
    const tasks = await api('/api/tasks');
    renderTasks(tasks);
  } catch (err) {
    showError(tasksError, err.message);
  }
}

function renderTasks(tasks) {
  const list = $('task-list');
  list.textContent = '';
  if (tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Nothing here yet — add your first task!';
    list.appendChild(empty);
    return;
  }
  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = task.completed ? 'task done' : 'task';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.completed);
    checkbox.id = `task-${task.id}`;
    checkbox.addEventListener('change', () =>
      toggleTask(task.id, checkbox.checked).catch((err) => {
        showError(tasksError, err.message);
        checkbox.checked = !checkbox.checked;
      })
    );

    const label = document.createElement('label');
    label.htmlFor = `task-${task.id}`;
    label.textContent = task.title;

    const del = document.createElement('button');
    del.className = 'delete';
    del.type = 'button';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', `Delete task: ${task.title}`);
    del.addEventListener('click', () =>
      deleteTask(task.id).catch((err) => showError(tasksError, err.message))
    );

    li.append(checkbox, label, del);
    list.appendChild(li);
  }
}

$('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('task-title');
  const title = input.value.trim();
  if (!title) return;
  try {
    await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) });
    input.value = '';
    clearError(tasksError);
    refreshTasks();
  } catch (err) {
    showError(tasksError, err.message);
  }
});

async function toggleTask(id, completed) {
  await api(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed }),
  });
  refreshTasks();
}

async function deleteTask(id) {
  await api(`/api/tasks/${id}`, { method: 'DELETE' });
  refreshTasks();
}

checkSession();
