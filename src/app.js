import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import session from 'express-session';
import {
  createUser,
  getTasksByUser,
  createTask,
  setTaskCompleted,
  deleteTask,
} from './db.js';
import { registerUser, authenticate, requireLogin } from './auth.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')));
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? 'dev-only-insecure-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  // ---------- Auth ----------

  app.post('/api/register', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    try {
      const user = await registerUser(username, password);
      if (!user) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      req.session.userId = user.id;
      req.session.username = user.username;
      return res.status(201).json({ id: user.id, username: user.username });
    } catch (err) {
      if (String(err?.code).startsWith('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      throw err;
    }
  });

  app.post('/api/login', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = await authenticate(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      req.session.userId = user.id;
      req.session.username = user.username;
      return res.json({ id: user.id, username: user.username });
    });
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/me', (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Not logged in' });
    res.json({ id: req.session.userId, username: req.session.username });
  });

  // ---------- Tasks (always scoped to the logged-in user) ----------

  app.get('/api/tasks', requireLogin, (req, res) => {
    res.json(getTasksByUser(req.session.userId));
  });

  app.post('/api/tasks', requireLogin, (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: 'Task title must be 200 characters or fewer' });
    }
    res.status(201).json(createTask(req.session.userId, title));
  });

  app.patch('/api/tasks/:id', requireLogin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }
    const completed = req.body?.completed;
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: '"completed" must be true or false' });
    }
    const updated = setTaskCompleted(req.session.userId, id, completed);
    if (!updated) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ ok: true });
  });

  app.delete('/api/tasks/:id', requireLogin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid task id' });
    }
    const deleted = deleteTask(req.session.userId, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ ok: true });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
