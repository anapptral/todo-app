import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? path.join(__dirname, '..', 'data.db');

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    completed  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
`);

/** Create a user; returns the row id. Throws on duplicate username. */
export function createUser(username, passwordHash) {
  const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
  const result = stmt.run(username, passwordHash);
  return Number(result.lastInsertRowid);
}

export function findUserByUsername(username) {
  return db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE')
    .get(username);
}

export function findUserById(id) {
  return db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
}

/** All tasks belonging to one user, newest first. */
export function getTasksByUser(userId) {
  return db
    .prepare('SELECT id, title, completed, created_at FROM tasks WHERE user_id = ? ORDER BY id DESC')
    .all(userId);
}

export function createTask(userId, title) {
  const stmt = db.prepare('INSERT INTO tasks (user_id, title) VALUES (?, ?)');
  const result = stmt.run(userId, title);
  return db
    .prepare('SELECT id, title, completed, created_at FROM tasks WHERE id = ?')
    .get(result.lastInsertRowid);
}

/** Returns true if a task owned by userId was found and updated. */
export function setTaskCompleted(userId, taskId, completed) {
  const result = db
    .prepare('UPDATE tasks SET completed = ? WHERE id = ? AND user_id = ?')
    .run(completed ? 1 : 0, taskId, userId);
  return Number(result.changes) > 0;
}

/** Returns true if a task owned by userId was found and deleted. */
export function deleteTask(userId, taskId) {
  const result = db
    .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
    .run(taskId, userId);
  return Number(result.changes) > 0;
}
