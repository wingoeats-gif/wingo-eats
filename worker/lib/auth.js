// Auth helpers used across the admin API: password hashing (PBKDF2 via
// Web Crypto, no external libraries), session tokens, and cookie handling.

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function hashPassword(password, existingSaltHex) {
  const enc = new TextEncoder();
  const salt = existingSaltHex ? hexToBytes(existingSaltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPassword(password, storedHashHex, storedSaltHex) {
  const { hash } = await hashPassword(password, storedSaltHex);
  if (hash.length !== storedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ storedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionCookieHeader(token, maxAgeSeconds) {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearCookieHeader() {
  return `session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function createSession(db, adminId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare('INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, adminId, expiresAt).run();
  return token;
}

export async function getAdminFromRequest(request, db) {
  const token = getCookie(request, 'session');
  if (!token) return null;
  const row = await db.prepare(
    'SELECT sessions.admin_id as adminId, sessions.expires_at as expiresAt, admin_users.username as username ' +
    'FROM sessions JOIN admin_users ON admin_users.id = sessions.admin_id WHERE sessions.token = ?'
  ).bind(token).first();
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;
  return { id: row.adminId, username: row.username };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

export async function requireAdmin(request, db) {
  const admin = await getAdminFromRequest(request, db);
  if (!admin) {
    return { admin: null, response: json({ error: 'Not authenticated' }, 401) };
  }
  return { admin, response: null };
}
