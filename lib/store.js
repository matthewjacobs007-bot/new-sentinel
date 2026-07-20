// lib/store.js — multi-tenant persistence (PostgreSQL).
// Same interface the rest of the app already uses; the file store is gone.
import { getPool } from './db.js';

export async function listTenants() {
  const { rows } = await getPool().query(
    `SELECT domain, name, platform, linked_at, last_scan_at, latest_score
     FROM tenants ORDER BY last_scan_at DESC NULLS LAST`);
  return rows.map((r) => ({
    domain: r.domain, name: r.name, platform: r.platform,
    linkedAt: r.linked_at, lastScanAt: r.last_scan_at, latestScore: r.latest_score,
  }));
}

export async function saveScan(domain, scan, score) {
  const p = getPool();
  await p.query(
    `INSERT INTO tenants (domain, name, platform, linked_at, last_scan_at, latest_score)
     VALUES ($1,$2,$3,$4,$4,$5)
     ON CONFLICT (domain) DO UPDATE SET name=$2, platform=$3, last_scan_at=$4, latest_score=$5`,
    [domain, scan.org.name, scan.org.platform, scan.scannedAt, score]);
  await p.query(
    `INSERT INTO scans (domain, at, score, findings, stats) VALUES ($1,$2,$3,$4,$5)`,
    [domain, scan.scannedAt, score, JSON.stringify(scan.findings), JSON.stringify(scan.stats || {})]);
}

async function nthScan(domain, offset) {
  const { rows } = await getPool().query(
    `SELECT at, score, findings, stats FROM scans WHERE domain=$1 ORDER BY at DESC LIMIT 1 OFFSET $2`,
    [domain, offset]);
  if (!rows[0]) return null;
  return { at: rows[0].at, score: rows[0].score, findings: rows[0].findings, stats: rows[0].stats };
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
export async function acceptRisk(domain, id) {
  await getPool().query(
    `INSERT INTO accepted (domain, finding_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [domain, id]);
}
export async function unacceptRisk(domain, id) {
  await getPool().query(`DELETE FROM accepted WHERE domain=$1 AND finding_id=$2`, [domain, id]);
}
