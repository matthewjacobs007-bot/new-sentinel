// lib/store.js — multi-tenant persistence (PostgreSQL).
// Same interface the rest of the app already uses; the file store is gone.
import { getPool } from './db.js';
import { computeMonthlyPriceCents } from './pricing.js';

export async function listTenants() {
  const { rows } = await getPool().query(
    `SELECT domain, name, platform, linked_at, last_scan_at, latest_score, active, user_count, price_cents
     FROM tenants ORDER BY last_scan_at DESC NULLS LAST`);
  return rows.map((r) => ({
    domain: r.domain, name: r.name, platform: r.platform,
    linkedAt: r.linked_at, lastScanAt: r.last_scan_at, latestScore: r.latest_score,
    active: r.active, userCount: r.user_count, priceCents: r.price_cents,
  }));
}

export async function getTenant(domain) {
  const { rows } = await getPool().query(
    `SELECT domain, name, platform, active, user_count, price_cents, payment_customer_id, payment_subscription_id
     FROM tenants WHERE domain=$1`, [domain]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    domain: r.domain, name: r.name, platform: r.platform, active: r.active,
    userCount: r.user_count, priceCents: r.price_cents,
    paymentCustomerId: r.payment_customer_id, paymentSubscriptionId: r.payment_subscription_id,
  };
}

export async function saveScan(domain, scan, score) {
  const p = getPool();
  const userCount = scan.stats?.users ?? scan.stats?.active ?? 0;
  const priceCents = computeMonthlyPriceCents(userCount);
  // `active` is intentionally NOT in this UPDATE — re-scanning an already-paying
  // tenant must never reset their billing status. It only defaults on first INSERT.
  await p.query(
    `INSERT INTO tenants (domain, name, platform, linked_at, last_scan_at, latest_score, user_count, price_cents, active)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,false)
     ON CONFLICT (domain) DO UPDATE SET name=$2, platform=$3, last_scan_at=$4, latest_score=$5, user_count=$6, price_cents=$7`,
    [domain, scan.org.name, scan.org.platform, scan.scannedAt, score, userCount, priceCents]);
  await p.query(
    `INSERT INTO scans (domain, at, score, findings, stats, details) VALUES ($1,$2,$3,$4,$5,$6)`,
    [domain, scan.scannedAt, score, JSON.stringify(scan.findings), JSON.stringify(scan.stats || {}), JSON.stringify(scan.details || {})]);
}

// Marks a tenant active after a confirmed payment. Idempotent — safe to call
// from both the webhook and the success-page fallback for the same event.
export async function activateTenant(domain, { paymentCustomerId, paymentSubscriptionId } = {}) {
  await getPool().query(
    `UPDATE tenants SET active=true, activated_at=now(),
       payment_customer_id=COALESCE($2, payment_customer_id),
       payment_subscription_id=COALESCE($3, payment_subscription_id)
     WHERE domain=$1`,
    [domain, paymentCustomerId || null, paymentSubscriptionId || null]);
}

async function nthScan(domain, offset) {
  const { rows } = await getPool().query(
    `SELECT at, score, findings, stats, details FROM scans WHERE domain=$1 ORDER BY at DESC LIMIT 1 OFFSET $2`,
    [domain, offset]);
  if (!rows[0]) return null;
  return { at: rows[0].at, score: rows[0].score, findings: rows[0].findings, stats: rows[0].stats, details: rows[0].details || {} };
}
export const latestScan = (domain) => nthScan(domain, 0);
export const previousScan = (domain) => nthScan(domain, 1);

export async function scanHistory(domain) {
  const { rows } = await getPool().query(`SELECT at, score FROM scans WHERE domain=$1 ORDER BY at ASC`, [domain]);
  return rows.map((r) => ({ at: r.at, score: r.score }));
}

export async function removeTenant(domain) {
  const p = getPool();
  await p.query(`DELETE FROM scans WHERE domain=$1`, [domain]);
  await p.query(`DELETE FROM accepted WHERE domain=$1`, [domain]);
  await p.query(`DELETE FROM tenants WHERE domain=$1`, [domain]);
}

export async function acceptedFor(domain) {
  const { rows } = await getPool().query(`SELECT finding_id FROM accepted WHERE domain=$1`, [domain]);
  return new Set(rows.map((r) => r.finding_id));
}
export async function saveLead({ name, email, company, platform, message }) {
  await getPool().query(
    `INSERT INTO leads (created_at, name, email, company, platform, message) VALUES ($1,$2,$3,$4,$5,$6)`,
    [new Date().toISOString(), name, email, company || null, platform || null, message || null]);
}
export async function listLeads() {
  const { rows } = await getPool().query(`SELECT id, created_at, name, email, company, platform, message FROM leads ORDER BY created_at DESC`);
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, name: r.name, email: r.email, company: r.company, platform: r.platform, message: r.message }));
}

export async function acceptRisk(domain, id) {
  await getPool().query(
    `INSERT INTO accepted (domain, finding_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [domain, id]);
}
export async function unacceptRisk(domain, id) {
  await getPool().query(`DELETE FROM accepted WHERE domain=$1 AND finding_id=$2`, [domain, id]);
}
