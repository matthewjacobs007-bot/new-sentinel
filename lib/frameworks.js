// lib/frameworks.js
// Maps each control ID to its equivalent references across security frameworks.
// This lets users filter by framework (CIS / NIST 800-53 / CISA SCuBA / Cyber Essentials)
// without having to duplicate the control definitions per framework.
//
// Every mapping is a best-effort match; some frameworks don't have a 1:1 equivalent
// for every control (e.g. Cyber Essentials is narrower than CIS), so gaps are
// represented as null and hidden from the filter.

export const FRAMEWORKS = {
  cis:   { name: 'CIS', label: 'CIS Controls v8', colour: '#22d3ee' },
  nist:  { name: 'NIST', label: 'NIST 800-53 rev5', colour: '#818cf8' },
  scuba: { name: 'SCuBA', label: 'CISA SCuBA', colour: '#f59e0b' },
  ce:    { name: 'CE', label: 'Cyber Essentials', colour: '#10b981' },
};

// Control ID → { cis, nist, scuba, ce }.
// null = framework doesn't cover this control specifically.
export const MAPPING = {
  // Identity & Access
  'g-2sv':                { cis: 'CIS 6.5', nist: 'IA-2(1)', scuba: 'AAD.1.1', ce: 'MFA' },
  'g-2sv-enf':            { cis: 'CIS 6.5', nist: 'IA-2(1)', scuba: 'AAD.1.2', ce: 'MFA' },
  'g-admin-count':        { cis: 'CIS 5.4', nist: 'AC-6(5)', scuba: 'AAD.7.1', ce: 'User Access' },
  'g-delegated-admins':   { cis: 'CIS 5.4', nist: 'AC-6',    scuba: 'AAD.7.2', ce: 'User Access' },
  'g-admin-2sv':          { cis: 'CIS 6.5', nist: 'IA-2(1)', scuba: 'AAD.1.3', ce: 'MFA' },
  'g-admin-recovery':     { cis: 'CIS 5.2', nist: 'IA-4',    scuba: null,      ce: null },
  'g-custom-roles':       { cis: 'CIS 6.8', nist: 'AC-6',    scuba: 'AAD.7.3', ce: 'User Access' },

  // Account Hygiene
  'g-zombie':             { cis: 'CIS 5.3', nist: 'AC-2(3)', scuba: null,      ce: 'User Access' },
  'g-never-login':        { cis: 'CIS 5.3', nist: 'AC-2(3)', scuba: null,      ce: 'User Access' },
  'g-old-passwords':      { cis: 'CIS 5.2', nist: 'IA-5',    scuba: null,      ce: null },
  'g-suspended-cleanup':  { cis: 'CIS 5.3', nist: 'AC-2(3)', scuba: null,      ce: null },

  // Risk Center (Shadow IT)
  'g-shadow-it':          { cis: 'CIS 2.3', nist: 'CM-7',    scuba: 'GWS.6',   ce: null },
  'g-shadow-concentration': { cis: 'CIS 2.3', nist: 'CM-7',  scuba: 'GWS.6.1', ce: null },
  'g-shadow-anon':        { cis: 'CIS 2.3', nist: 'CM-7',    scuba: 'GWS.6.2', ce: null },

  // Collaboration
  'g-groups-public-join': { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.5.1', ce: null },
  'g-groups-external':    { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.5.2', ce: null },
  'g-groups-public-view': { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.5.3', ce: null },
  'g-groups-public-post': { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.5.4', ce: null },
  'g-ou-structure':       { cis: 'CIS 6.8', nist: 'AC-2',    scuba: null,      ce: null },
  'g-orphan-drives':      { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.11',  ce: null },
  'g-ext-share':          { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.11.1', ce: null },
  'g-drive-link-share':   { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.11.2', ce: null },
  'g-drive-ownership-transfer': { cis: 'CIS 6.2', nist: 'AC-2', scuba: null,   ce: null },

  // Calendar & Sites
  'g-calendar-external':  { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.4',   ce: null },
  'g-sites-public':       { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.10',  ce: null },
  'g-meet-external':      { cis: 'CIS 3.3', nist: 'AC-3',    scuba: 'GWS.3',   ce: null },

  // Endpoint & Device
  'g-mobile-count':       { cis: 'CIS 4.1', nist: 'CM-2',    scuba: null,      ce: 'Device Management' },
  'g-mobile-compromised': { cis: 'CIS 4.1', nist: 'SI-4',    scuba: null,      ce: 'Device Management' },
  'g-chromeos-inactive':  { cis: 'CIS 1.1', nist: 'CM-8',    scuba: null,      ce: 'Device Management' },

  // Email Security
  'g-dkim-signing':       { cis: 'CIS 9.5', nist: 'SC-8',    scuba: 'GWS.7.4', ce: null },
  'g-gmail-fwd':          { cis: 'CIS 9.6', nist: 'SC-7',    scuba: 'GWS.7.5', ce: null },
  'g-gmail-safety':       { cis: 'CIS 9.7', nist: 'SI-3',    scuba: 'GWS.7.6', ce: 'Malware Protection' },
  'g-gmail-confidential': { cis: 'CIS 3.3', nist: 'SC-8',    scuba: null,      ce: null },

  // Application & API Access
  'g-api-controls':       { cis: 'CIS 2.3', nist: 'CM-7',    scuba: 'GWS.6.1', ce: null },
  'g-marketplace':        { cis: 'CIS 2.3', nist: 'CM-7',    scuba: 'GWS.6.2', ce: null },
  'g-lsa':                { cis: 'CIS 6.7', nist: 'IA-2',    scuba: 'GWS.7.1', ce: null },

  // Logging & Monitoring
  'g-suspicious-logins':  { cis: 'CIS 8.11', nist: 'AU-6',   scuba: 'GWS.12',  ce: null },
  'g-audit-retention':    { cis: 'CIS 8.10', nist: 'AU-11',  scuba: 'GWS.12.1', ce: null },
  'g-alert-center':       { cis: 'CIS 8.11', nist: 'AU-6',   scuba: 'GWS.12.2', ce: null },

  // Backup & Continuity
  'g-backup':             { cis: 'CIS 11.1', nist: 'CP-9',   scuba: null,      ce: null },
  'g-vault-retention':    { cis: 'CIS 3.4', nist: 'AU-11',   scuba: null,      ce: null },
  'g-incident-response':  { cis: 'CIS 17.1', nist: 'IR-1',   scuba: null,      ce: null },
};

// Get all framework tags for a finding (handles dynamic IDs like g-spf-domain.co.za).
export function frameworksFor(id) {
  if (MAPPING[id]) return MAPPING[id];
  // Dynamic IDs (per-domain SPF / DMARC)
  if (id.startsWith('g-spf-'))   return { cis: 'CIS 9.5', nist: 'SC-8', scuba: 'GWS.7.2', ce: null };
  if (id.startsWith('g-dmarc-')) return { cis: 'CIS 9.5', nist: 'SC-8', scuba: 'GWS.7.3', ce: null };
  return { cis: null, nist: null, scuba: null, ce: null };
}

// Given a framework key ('cis'/'nist'/'scuba'/'ce'), does a finding have coverage?
export function coveredBy(id, framework) {
  const m = frameworksFor(id);
  return Boolean(m[framework]);
}
