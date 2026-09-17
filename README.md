# To-do list 🎀

A multi-user to-do web app: register or log in with a username and password,
then add, complete, and delete your own tasks. Each user sees **only their
own** list. Pastel pink UI.

## Features

- Username/password auth — passwords hashed with **scrypt** (per-user random
  salt, constant-time verification); nothing is ever stored in plain text
- Session cookies are `httpOnly` + `SameSite=Lax`; sessions are regenerated
  on login
- Task CRUD: add, complete/un-complete, delete — every query is scoped
  `WHERE user_id = ?`, so one user can never see or modify another's tasks
- 15 tests (login flows + private task lists) with Node's built-in runner

## Stack

- **Node ≥ 22.5** (for the built-in `node:sqlite` module), **Express 4**
- SQLite database, created automatically on first run
- No build step: vanilla HTML/CSS/JS frontend served by Express

## Run locally

```bash
npm install
cp .env.example .env        # then set SESSION_SECRET to a long random string
npm start                   # http://localhost:3000
```

Run the tests:

```bash
npm test
```

## Deploying (demo mode)

The repo includes a Vercel serverless entry (`api/index.js` + `vercel.json`).
On Vercel the SQLite file lives in `/tmp` because the deployment filesystem
is read-only.

> **⚠️ This is demo-only.** Each serverless instance gets its own ephemeral
> `/tmp`, so users, tasks, and logins **reset whenever Vercel spins up a new
> instance**. Fine for showing the app around — not for real data.

**For production** you would need a **hosted database** instead of a local
SQLite file — e.g. [Turso](https://turso.tech) (hosted SQLite/libSQL, nearly
drop-in), or a managed Postgres such as Neon or Supabase — plus persistent
session storage (e.g. `connect-sqlite3` pointed at that database) so logins
survive instance restarts.

## Security notes

- `.env` (session secret) and `*.db` (the database) are gitignored and never
  committed — see `.gitignore`
- Login errors are generic and constant-time-ish (unknown users burn a hash
  comparison too) to avoid user enumeration and timing leaks
