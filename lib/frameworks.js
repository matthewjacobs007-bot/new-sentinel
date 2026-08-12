// lib/frameworks.js
// Maps each control ID to its equivalent references across compliance frameworks,
// so a finding — and a tenant's overall posture — can be read against whichever
// framework a client actually needs to answer to, without duplicating the control
// definitions per framework.
//
// Every mapping is a best-effort match, not a certified crosswalk. Some frameworks
// don't have a 1:1 equivalent for every control (e.g. Cyber Essentials is narrower
// than CIS, POPIA's Security Safeguards condition is far less granular than ISO
// 27001's Annex A), so gaps are represented as null and hidden from the filter and
// from framework scoring. This tool does not itself certify compliance with any of
// these frameworks — it shows how technical controls already being scanned line up
// against them, as a starting point for a real audit.

export const FRAMEWORKS = {
  cis:      { name: 'CIS',      label: 'CIS Controls v8',        colour: '#22d3ee' },
  nist:     { name: 'NIST',     label: 'NIST 800-53 rev5',       colour: '#818cf8' },
  scuba:    { name: 'SCuBA',    label: 'CISA SCuBA',             colour: '#f59e0b' },
  ce:       { name: 'CE',       label: 'Cyber Essentials',       colour: '#10b981' },
  soc2:     { name: 'SOC 2',    label: 'SOC 2 Trust Criteria',   colour: '#f472b6' },
  iso27001: { name: 'ISO 27001',label: 'ISO/IEC 27001:2022',     colour: '#a78bfa' },
  gdpr:     { name: 'GDPR',     label: 'EU GDPR',                colour: '#60a5fa' },
  popia:    { name: 'POPIA',    label: 'POPIA (South Africa)',   colour: '#fb923c' },
};

const NONE = { cis: null, nist: null, scuba: null, ce: null, soc2: null, iso27001: null, gdpr: null, popia: null };

// Control ID → tag per framework. null = that framework doesn't cover this control.
export const MAPPING = {
  // ── Identity & Access ──────────────────────────────────────────────
  'g-2sv':                { cis: 'CIS 6.5',  nist: 'IA-2(1)', scuba: 'AAD.1.1', ce: 'MFA',            soc2: 'CC6.1', iso27001: 'A.8.5',  gdpr: 'Art. 32', popia: 's19' },
  'g-2sv-enf':            { cis: 'CIS 6.5',  nist: 'IA-2(1)', scuba: 'AAD.1.2', ce: 'MFA',            soc2: 'CC6.1', iso27001: 'A.8.5',  gdpr: 'Art. 32', popia: 's19' },
  'g-admin-count':        { cis: 'CIS 5.4',  nist: 'AC-6(5)', scuba: 'AAD.7.1', ce: 'User Access',    soc2: 'CC6.3', iso27001: 'A.8.2',  gdpr: 'Art. 32', popia: 's19' },
  'g-delegated-admins':   { cis: 'CIS 5.4',  nist: 'AC-6',    scuba: 'AAD.7.2', ce: 'User Access',    soc2: 'CC6.3', iso27001: 'A.8.2',  gdpr: 'Art. 32', popia: 's19' },
  'g-admin-2sv':          { cis: 'CIS 6.5',  nist: 'IA-2(1)', scuba: 'AAD.1.3', ce: 'MFA',            soc2: 'CC6.1', iso27001: 'A.8.5',  gdpr: 'Art. 32', popia: 's19' },
  'g-admin-recovery':     { cis: 'CIS 5.2',  nist: 'IA-4',    scuba: null,      ce: null,             soc2: 'CC6.1', iso27001: 'A.5.17', gdpr: 'Art. 32', popia: 's19' },
  'g-custom-roles':       { cis: 'CIS 6.8',  nist: 'AC-6',    scuba: 'AAD.7.3', ce: 'User Access',    soc2: 'CC6.3', iso27001: 'A.8.2',  gdpr: 'Art. 32', popia: 's19' },

  // ── Account Hygiene ─────────────────────────────────────────────────
  'g-zombie':             { cis: 'CIS 5.3',  nist: 'AC-2(3)', scuba: null,      ce: 'User Access',    soc2: 'CC6.2', iso27001: 'A.5.18', gdpr: 'Art. 32', popia: 's19' },
  'g-never-login':        { cis: 'CIS 5.3',  nist: 'AC-2(3)', scuba: null,      ce: 'User Access',    soc2: 'CC6.2', iso27001: 'A.5.18', gdpr: 'Art. 32', popia: 's19' },
  'g-old-passwords':      { cis: 'CIS 5.2',  nist: 'IA-5',    scuba: null,      ce: null,             soc2: 'CC6.1', iso27001: 'A.5.17', gdpr: 'Art. 32', popia: 's19' },
  'g-suspended-cleanup':  { cis: 'CIS 5.3',  nist: 'AC-2(3)', scuba: null,      ce: null,             soc2: 'CC6.2', iso27001: 'A.5.18', gdpr: 'Art. 32', popia: 's19' },
  'g-user-recovery':      { cis: 'CIS 5.2',  nist: 'IA-4',    scuba: null,      ce: null,             soc2: 'CC6.1', iso27001: 'A.5.17', gdpr: 'Art. 32', popia: 's19' },
  'g-suspended-admin':    { cis: 'CIS 5.4',  nist: 'AC-2(3)', scuba: 'AAD.7.4', ce: 'User Access',    soc2: 'CC6.3', iso27001: 'A.5.18', gdpr: 'Art. 32', popia: 's19' },

  // ── Risk Center (Shadow IT) ─────────────────────────────────────────
  'g-shadow-it':          { cis: 'CIS 2.3',  nist: 'CM-7',    scuba: 'GWS.6',   ce: null,             soc2: 'CC6.6', iso27001: 'A.5.19', gdpr: 'Art. 32', popia: 's19' },
  'g-shadow-concentration': { cis: 'CIS 2.3', nist: 'CM-7',   scuba: 'GWS.6.1', ce: null,             soc2: 'CC6.6', iso27001: 'A.5.19', gdpr: 'Art. 32', popia: 's19' },
  'g-shadow-anon':        { cis: 'CIS 2.3',  nist: 'CM-7',    scuba: 'GWS.6.2', ce: null,             soc2: 'CC6.6', iso27001: 'A.5.19', gdpr: 'Art. 32', popia: 's19' },

  // ── Collaboration ───────────────────────────────────────────────────
  'g-groups-public-join': { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.5.1', ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-groups-external':    { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.5.2', ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-groups-public-view': { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.5.3', ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-groups-public-post': { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.5.4', ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-ou-structure':       { cis: 'CIS 6.8',  nist: 'AC-2',    scuba: null,      ce: null,             soc2: 'CC6.3', iso27001: 'A.5.18', gdpr: 'Art. 25', popia: null },
  'g-orphan-drives':      { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.11',  ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-ext-share':          { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.11.1', ce: null,            soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-drive-link-share':   { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.11.2', ce: null,            soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-drive-ownership-transfer': { cis: 'CIS 6.2', nist: 'AC-2', scuba: null,    ce: null,             soc2: null,    iso27001: null,     gdpr: null,      popia: null },

  // ── Calendar & Sites ────────────────────────────────────────────────
  'g-calendar-external':  { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.4',   ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-sites-public':       { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.10',  ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-meet-external':      { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: 'GWS.3',   ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },

  // ── Endpoint & Device ───────────────────────────────────────────────
  'g-mobile-count':       { cis: 'CIS 4.1',  nist: 'CM-2',    scuba: null,      ce: 'Device Management', soc2: 'CC6.1', iso27001: 'A.8.1', gdpr: 'Art. 32', popia: 's19' },
  'g-mobile-compromised': { cis: 'CIS 4.1',  nist: 'SI-4',    scuba: null,      ce: 'Device Management', soc2: 'CC6.8', iso27001: 'A.8.7', gdpr: 'Art. 32', popia: 's19' },
  'g-chromeos-inactive':  { cis: 'CIS 1.1',  nist: 'CM-8',    scuba: null,      ce: 'Device Management', soc2: 'CC6.1', iso27001: 'A.8.1', gdpr: null,      popia: null },

  // ── Email Security ──────────────────────────────────────────────────
  'g-dkim-signing':       { cis: 'CIS 9.5',  nist: 'SC-8',    scuba: 'GWS.7.4', ce: null,             soc2: 'CC6.7', iso27001: 'A.8.24', gdpr: 'Art. 32', popia: 's19' },
  'g-gmail-fwd':          { cis: 'CIS 9.6',  nist: 'SC-7',    scuba: 'GWS.7.5', ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },
  'g-gmail-safety':       { cis: 'CIS 9.7',  nist: 'SI-3',    scuba: 'GWS.7.6', ce: 'Malware Protection', soc2: 'CC6.8', iso27001: 'A.8.7', gdpr: 'Art. 32', popia: 's19' },
  'g-gmail-confidential': { cis: 'CIS 3.3',  nist: 'SC-8',    scuba: null,      ce: null,             soc2: 'CC6.7', iso27001: 'A.8.12', gdpr: 'Art. 32', popia: 's19' },

  // ── Application & API Access ────────────────────────────────────────
  'g-api-controls':       { cis: 'CIS 2.3',  nist: 'CM-7',    scuba: 'GWS.6.1', ce: null,             soc2: 'CC6.6', iso27001: 'A.5.19', gdpr: 'Art. 32', popia: 's19' },
  'g-marketplace':        { cis: 'CIS 2.3',  nist: 'CM-7',    scuba: 'GWS.6.2', ce: null,             soc2: 'CC6.6', iso27001: 'A.5.19', gdpr: 'Art. 32', popia: 's19' },
  'g-lsa':                { cis: 'CIS 6.7',  nist: 'IA-2',    scuba: 'GWS.7.1', ce: null,             soc2: 'CC6.1', iso27001: 'A.8.5',  gdpr: 'Art. 32', popia: 's19' },

  // ── Logging & Monitoring ────────────────────────────────────────────
  'g-suspicious-logins':  { cis: 'CIS 8.11', nist: 'AU-6',    scuba: 'GWS.12',  ce: null,             soc2: 'CC7.2', iso27001: 'A.8.16', gdpr: 'Art. 33', popia: 's22' },
  'g-audit-retention':    { cis: 'CIS 8.10', nist: 'AU-11',   scuba: 'GWS.12.1', ce: null,            soc2: 'CC7.2', iso27001: 'A.8.16', gdpr: 'Art. 33', popia: 's22' },
  'g-alert-center':       { cis: 'CIS 8.11', nist: 'AU-6',    scuba: 'GWS.12.2', ce: null,            soc2: 'CC7.3', iso27001: 'A.8.16', gdpr: 'Art. 33', popia: 's22' },

  // ── Backup & Continuity ─────────────────────────────────────────────
  'g-backup':             { cis: 'CIS 11.1', nist: 'CP-9',    scuba: null,      ce: null,             soc2: 'A1.2',  iso27001: 'A.8.13', gdpr: 'Art. 32', popia: 's19' },
  'g-vault-retention':    { cis: 'CIS 3.4',  nist: 'AU-11',   scuba: null,      ce: null,             soc2: 'A1.2',  iso27001: 'A.8.13', gdpr: 'Art. 5(1)(e)', popia: 's14' },
  'g-incident-response':  { cis: 'CIS 17.1', nist: 'IR-1',    scuba: null,      ce: null,             soc2: 'CC7.4', iso27001: 'A.5.24', gdpr: 'Art. 33', popia: 's22' },

  // ── Microsoft 365 (Identity & Access) ───────────────────────────────
  'm-mfa-coverage':       { cis: 'CIS 6.5',  nist: 'IA-2(1)', scuba: null,      ce: 'MFA',            soc2: 'CC6.1', iso27001: 'A.8.5',  gdpr: 'Art. 32', popia: 's19' },
  'm-ca':                 { cis: 'CIS 6.7',  nist: 'AC-17',   scuba: null,      ce: null,             soc2: 'CC6.1', iso27001: 'A.8.5',  gdpr: 'Art. 32', popia: 's19' },
  'm-legacy':             { cis: 'CIS 4.8',  nist: 'AC-17',   scuba: null,      ce: null,             soc2: 'CC6.1', iso27001: 'A.8.5',  gdpr: 'Art. 32', popia: 's19' },

  // ── Microsoft 365 (Collaboration / Backup) ──────────────────────────
  'm-guest-users':        { cis: 'CIS 3.3',  nist: 'AC-3',    scuba: null,      ce: null,             soc2: 'CC6.7', iso27001: 'A.5.19', gdpr: 'Art. 32', popia: 's19' },
  'm-backup':             { cis: 'CIS 11.1', nist: 'CP-9',    scuba: null,      ce: null,             soc2: 'A1.2',  iso27001: 'A.8.13', gdpr: 'Art. 32', popia: 's19' },
};

// Get all framework tags for a finding (handles dynamic IDs like g-spf-domain.co.za,
// and Microsoft's per-control Secure Score IDs, which can't be mapped generically).
export function frameworksFor(id) {
  if (MAPPING[id]) return MAPPING[id];
  if (id.startsWith('g-spf-') || id.startsWith('m-spf-')) {
    return { cis: 'CIS 9.5', nist: 'SC-8', scuba: 'GWS.7.2', ce: null, soc2: 'CC6.7', iso27001: 'A.8.24', gdpr: 'Art. 32', popia: 's19' };
  }
  if (id.startsWith('g-dmarc-') || id.startsWith('m-dmarc-')) {
    return { cis: 'CIS 9.5', nist: 'SC-8', scuba: 'GWS.7.3', ce: null, soc2: 'CC6.7', iso27001: 'A.8.24', gdpr: 'Art. 32', popia: 's19' };
  }
  // m-ss-* (Microsoft Secure Score) IDs are generated per-tenant from whatever
  // controls Graph returns — there's no fixed catalog to map against generically.
  return NONE;
}

// Given a framework key, does a finding have coverage?
export function coveredBy(id, framework) {
  const m = frameworksFor(id);
  return Boolean(m[framework]);
}

// Same severity-weighted scoring as scoring2.js's scoreFindings, but grouped by
// compliance framework instead of by module — "are we compliant with X" instead
// of "how's this category doing". A finding only counts toward a framework if
// frameworksFor() actually tags it for that framework; frameworks with zero
// mapped, measurable controls report pct: null rather than a misleading 0%/100%.
const SEV_WEIGHT = { critical: 10, high: 6, medium: 3, low: 1 };
const value = (s) => (s === 'pass' ? 1 : s === 'partial' ? 0.5 : 0);

export function scoreByFramework(findings, accepted = new Set()) {
  const result = {};
  for (const key of Object.keys(FRAMEWORKS)) {
    let earned = 0, possible = 0;
    const items = [];
    for (const f of findings) {
      const tag = frameworksFor(f.id)[key];
      if (!tag) continue;
      const isAccepted = accepted.has(f.id);
      items.push({ ...f, accepted: isAccepted, frameworkTag: tag });
      if (f.status === 'unknown' || isAccepted) continue;
      const w = SEV_WEIGHT[f.severity] ?? 1;
      earned += w * value(f.status); possible += w;
    }
    const pct = possible ? Math.round((earned / possible) * 100) : null;
    result[key] = {
      ...FRAMEWORKS[key],
      pct,
      items,
      gaps: items.filter((i) => !i.accepted && (i.status === 'fail' || i.status === 'partial')).length,
      total: items.length,
    };
  }
  return result;
}
