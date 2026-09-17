import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { findUserByUsername } from './db.js';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

/** scrypt with a per-user random salt; output format: scrypt:<saltHex>:<hashHex> */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Constant-time comparison against the stored scrypt hash. */
export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function requireLogin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

/** Register a new user with a hashed password. Returns { id, username } or null if taken. */
export async function registerUser(username, password) {
  const existing = findUserByUsername(username);
  if (existing) return null;
  const passwordHash = await hashPassword(password);
  const { createUser } = await import('./db.js');
  return { id: createUser(username, passwordHash), username };
}

/** Verify credentials; returns the user row (without hash) or null. */
export async function authenticate(username, password) {
  const user = findUserByUsername(username);
  if (!user) {
    // Burn comparable time so missing users and wrong passwords look alike.
    await hashPassword(password);
    return null;
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return null;
  return { id: user.id, username: user.username };
}
