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
  // Billing: a tenant is scanned immediately on first sign-in (so we know its user
  // count), but is gated behind /activate — a paid subscription — before the client
  // role can see the dashboard. MSPs are never gated. `active` defaults false and is
  // deliberately excluded from saveScan's re-scan UPDATE, so re-scanning never
  // resets a paying tenant back to unpaid.
  await p.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT false`);
  await p.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS user_count INT`);
  await p.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS price_cents INT`);
  await p.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_customer_id TEXT`);
  await p.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_subscription_id TEXT`);
  await p.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ`);
  await p.query(`CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY, domain TEXT, at TIMESTAMPTZ, score INT,
    findings JSONB, stats JSONB, details JSONB)`);
  await p.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS details JSONB`);
  await p.query(`CREATE TABLE IF NOT EXISTS accepted (
    domain TEXT, finding_id TEXT, PRIMARY KEY (domain, finding_id))`);
  await p.query(`CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ, name TEXT, email TEXT,
    company TEXT, platform TEXT, message TEXT)`);
}
