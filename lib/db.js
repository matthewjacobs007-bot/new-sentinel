// lib/db.js — PostgreSQL connection + schema.
// Production uses node-postgres against DATABASE_URL. Tests inject a pg-mem pool
// via setPool(), so the exact same SQL is exercised without a live database.
import pg from 'pg';

let pool = null;

export function setPool(p) { pool = p; }               // used by tests

export function getPool() {
  if (pool) return pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL is not set.');
  // Render/most managed PG need SSL; allow self-signed.
  pool = new pg.Pool({ connectionString: cs, ssl: cs.includes('localhost') ? false : { rejectUnauthorized: false } });
  return pool;
}

export async function initSchema() {
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS tenants (
    domain TEXT PRIMARY KEY, name TEXT, platform TEXT,
    linked_at TIMESTAMPTZ, last_scan_at TIMESTAMPTZ, latest_score INT)`);
  await p.query(`CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY, domain TEXT, at TIMESTAMPTZ, score INT,
    findings JSONB, stats JSONB)`);
  await p.query(`CREATE TABLE IF NOT EXISTS accepted (
    domain TEXT, finding_id TEXT, PRIMARY KEY (domain, finding_id))`);
}
