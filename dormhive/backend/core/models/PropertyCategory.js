import { query } from '../config/database.js';

export async function list() {
  return query('SELECT id, slug, name FROM property_categories ORDER BY name');
}

export async function create(slug, name) {
  const result = await query('INSERT INTO property_categories (slug, name) VALUES (?, ?)', [slug, name]);
  const rows = await query('SELECT id, slug, name FROM property_categories WHERE id = ? LIMIT 1', [result.insertId]);
  return rows[0] ?? null;
}
