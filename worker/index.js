// ==========================================================================
// WINGO EATS — worker/index.js
// Single Cloudflare Worker entry point. Static files (index.html, style.css,
// /admin/*, etc.) are served automatically by the "assets" binding — this
// script only runs for /api/* requests (see wrangler.jsonc: run_worker_first).
// ==========================================================================

import {
  hashPassword, verifyPassword, getCookie, sessionCookieHeader, clearCookieHeader,
  SESSION_TTL_SECONDS, createSession, getAdminFromRequest, json, requireAdmin
} from './lib/auth.js';
import { fileToBase64, base64ToBytes } from './lib/base64.js';

const MAX_BYTES = 1.5 * 1024 * 1024; // 1.5MB per image
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Matches a path like '/api/restaurants/:id' against an actual pathname.
// Returns a params object ({ id: '5' }) or null if it doesn't match.
function matchRoute(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (part !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      /* ---------------- Auth & setup ---------------- */

      if (pathname === '/api/setup-status' && method === 'GET') {
        const row = await env.DB.prepare('SELECT COUNT(*) as count FROM admin_users').first();
        return json({ needsSetup: row.count === 0 });
      }

      if (pathname === '/api/setup' && method === 'POST') {
        const existing = await env.DB.prepare('SELECT COUNT(*) as count FROM admin_users').first();
        if (existing.count > 0) return json({ error: 'An admin account already exists. Please log in instead.' }, 409);
        let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
        const username = (body.username || '').trim();
        const password = body.password || '';
        if (username.length < 3) return json({ error: 'Username must be at least 3 characters.' }, 400);
        if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
        const { hash, salt } = await hashPassword(password);
        const result = await env.DB.prepare(
          'INSERT INTO admin_users (username, password_hash, salt) VALUES (?, ?, ?)'
        ).bind(username, hash, salt).run();
        const token = await createSession(env.DB, result.meta.last_row_id);
        return json({ success: true, username }, 200, { 'Set-Cookie': sessionCookieHeader(token, SESSION_TTL_SECONDS) });
      }

      if (pathname === '/api/login' && method === 'POST') {
        let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
        const username = (body.username || '').trim();
        const password = body.password || '';
        const admin = await env.DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(username).first();
        if (!admin) return json({ error: 'Incorrect username or password.' }, 401);
        const valid = await verifyPassword(password, admin.password_hash, admin.salt);
        if (!valid) return json({ error: 'Incorrect username or password.' }, 401);
        const token = await createSession(env.DB, admin.id);
        return json({ success: true, username: admin.username }, 200, { 'Set-Cookie': sessionCookieHeader(token, SESSION_TTL_SECONDS) });
      }

      if (pathname === '/api/logout' && method === 'POST') {
        const token = getCookie(request, 'session');
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        return json({ success: true }, 200, { 'Set-Cookie': clearCookieHeader() });
      }

      if (pathname === '/api/session' && method === 'GET') {
        const admin = await getAdminFromRequest(request, env.DB);
        if (!admin) return json({ authenticated: false });
        return json({ authenticated: true, username: admin.username });
      }

      /* ---------------- Restaurants ---------------- */

      if (pathname === '/api/restaurants' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        const excludeId = url.searchParams.get('exclude');
        const limit = parseInt(url.searchParams.get('limit') || '0', 10);
        let query = 'SELECT * FROM restaurants';
        const conditions = []; const params = [];
        if (q) { conditions.push('(name LIKE ? OR cuisine LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (excludeId) { conditions.push('id != ?'); params.push(excludeId); }
        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY sort_order ASC, created_at DESC';
        if (limit > 0) query += ` LIMIT ${limit}`;
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return json({ restaurants: results });
      }

      if (pathname === '/api/restaurants' && method === 'POST') {
        const { admin, response } = await requireAdmin(request, env.DB);
        if (!admin) return response;
        let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
        const name = (body.name || '').trim();
        if (!name) return json({ error: 'Restaurant name is required.' }, 400);
        const result = await env.DB.prepare(
          `INSERT INTO restaurants (name, cuisine, rating, distance, prep_time, price_for_two, phone, address, logo_image_id, banner_image_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          name, body.cuisine || '', body.rating != null ? body.rating : 4.5, body.distance || '', body.prepTime || '',
          body.priceForTwo || '', body.phone || '', body.address || '', body.logoImageId || null, body.bannerImageId || null, body.sortOrder || 0
        ).run();
        return json({ success: true, id: result.meta.last_row_id });
      }

      let m = matchRoute('/api/restaurants/:id', pathname);
      if (m && method === 'GET') {
        const restaurant = await env.DB.prepare('SELECT * FROM restaurants WHERE id = ?').bind(m.id).first();
        if (!restaurant) return json({ error: 'Restaurant not found.' }, 404);
        const { results: dishes } = await env.DB.prepare(
          'SELECT * FROM dishes WHERE restaurant_id = ? ORDER BY category ASC, subcategory ASC, sort_order ASC, id ASC'
        ).bind(m.id).all();
        return json({ restaurant, dishes });
      }
      if (m && method === 'PUT') {
        const { admin, response } = await requireAdmin(request, env.DB);
        if (!admin) return response;
        const existing = await env.DB.prepare('SELECT id FROM restaurants WHERE id = ?').bind(m.id).first();
        if (!existing) return json({ error: 'Restaurant not found.' }, 404);
        let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
        const name = (body.name || '').trim();
        if (!name) return json({ error: 'Restaurant name is required.' }, 400);
        await env.DB.prepare(
          `UPDATE restaurants SET name = ?, cuisine = ?, rating = ?, distance = ?, prep_time = ?, price_for_two = ?,
           phone = ?, address = ?, logo_image_id = ?, banner_image_id = ?, sort_order = ? WHERE id = ?`
        ).bind(
          name, body.cuisine || '', body.rating != null ? body.rating : 4.5, body.distance || '', body.prepTime || '',
          body.priceForTwo || '', body.phone || '', body.address || '', body.logoImageId || null, body.bannerImageId || null, body.sortOrder || 0, m.id
        ).run();
        return json({ success: true });
      }
      if (m && method === 'DELETE') {
        const { admin, response } = await requireAdmin(request, env.DB);
        if (!admin) return response;
        await env.DB.prepare('DELETE FROM restaurants WHERE id = ?').bind(m.id).run();
        return json({ success: true });
      }

      /* ---------------- Dishes ---------------- */

      if (pathname === '/api/dishes' && method === 'POST') {
        const { admin, response } = await requireAdmin(request, env.DB);
        if (!admin) return response;
        let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
        const name = (body.name || '').trim();
        const restaurantId = body.restaurantId;
        if (!name) return json({ error: 'Dish name is required.' }, 400);
        if (!restaurantId) return json({ error: 'restaurantId is required.' }, 400);
        const result = await env.DB.prepare(
          `INSERT INTO dishes (restaurant_id, category, subcategory, name, description, price, is_veg, is_bestseller, image_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          restaurantId, (body.category || 'Menu').trim(), (body.subcategory || '').trim(), name, body.description || '', body.price != null ? body.price : 0,
          body.isVeg ? 1 : 0, body.isBestseller ? 1 : 0, body.imageId || null, body.sortOrder || 0
        ).run();
        return json({ success: true, id: result.meta.last_row_id });
      }

      m = matchRoute('/api/dishes/:id', pathname);
      if (m && method === 'PUT') {
        const { admin, response } = await requireAdmin(request, env.DB);
        if (!admin) return response;
        const existing = await env.DB.prepare('SELECT id FROM dishes WHERE id = ?').bind(m.id).first();
        if (!existing) return json({ error: 'Dish not found.' }, 404);
        let body; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
        const name = (body.name || '').trim();
        if (!name) return json({ error: 'Dish name is required.' }, 400);
        await env.DB.prepare(
          `UPDATE dishes SET category = ?, subcategory = ?, name = ?, description = ?, price = ?, is_veg = ?, is_bestseller = ?,
           image_id = ?, sort_order = ? WHERE id = ?`
        ).bind(
          (body.category || 'Menu').trim(), (body.subcategory || '').trim(), name, body.description || '', body.price != null ? body.price : 0,
          body.isVeg ? 1 : 0, body.isBestseller ? 1 : 0, body.imageId || null, body.sortOrder || 0, m.id
        ).run();
        return json({ success: true });
      }
      if (m && method === 'DELETE') {
        const { admin, response } = await requireAdmin(request, env.DB);
        if (!admin) return response;
        await env.DB.prepare('DELETE FROM dishes WHERE id = ?').bind(m.id).run();
        return json({ success: true });
      }

      /* ---------------- Images ---------------- */

      if (pathname === '/api/upload' && method === 'POST') {
        const { admin, response } = await requireAdmin(request, env.DB);
        if (!admin) return response;
        let formData; try { formData = await request.formData(); } catch { return json({ error: 'Invalid upload.' }, 400); }
        const file = formData.get('image');
        if (!file || typeof file === 'string') return json({ error: 'No image file received.' }, 400);
        if (!ALLOWED_TYPES.includes(file.type)) return json({ error: 'Please upload a JPG, PNG, WEBP or GIF image.' }, 400);
        if (file.size > MAX_BYTES) return json({ error: 'Image is too large. Please use a file under 1.5MB.' }, 400);
        const base64 = await fileToBase64(file);
        const result = await env.DB.prepare('INSERT INTO images (mime_type, data) VALUES (?, ?)').bind(file.type, base64).run();
        return json({ success: true, imageId: result.meta.last_row_id });
      }

      m = matchRoute('/api/image/:id', pathname);
      if (m && method === 'GET') {
        const row = await env.DB.prepare('SELECT mime_type, data FROM images WHERE id = ?').bind(m.id).first();
        if (!row) return new Response('Not found', { status: 404 });
        const bytes = base64ToBytes(row.data);
        return new Response(bytes, {
          headers: { 'Content-Type': row.mime_type, 'Cache-Control': 'public, max-age=31536000, immutable' }
        });
      }

      /* ---------------- Fallback ---------------- */

      if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      // Anything else shouldn't reach here (static files are served directly
      // by the assets binding), but fall back to it just in case.
      return env.ASSETS.fetch(request);

    } catch (err) {
      return json({ error: 'Server error: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }
};
