// lib/googleScan.js
// CSPM-style scan of a Google Workspace domain, modelled on the Workspace Audit
// feature set: Posture, User & Admin Access, Risk Center (Shadow IT),
// Collaboration exposure, Account Hygiene, Email Security.
//
// Read-only. Every finding carries a severity, a CIS tag, and a "fixUrl" deep
// link into the customer's Admin console so the issue can be fixed in one click.
//
// Scopes (all *.readonly where a readonly variant exists):
//   admin.directory.user.readonly, admin.directory.domain.readonly,
//   admin.directory.rolemanagement.readonly, admin.directory.group.readonly,
//   admin.directory.user.security  (required to list a user's OAuth tokens),
//   apps.groups.settings, admin.reports.audit.readonly
import { google } from 'googleapis';
import { checkEmailAuth } from './dns.js';

const AC = 'https://admin.google.com/ac';           // Admin console base
const safe = async (p, fb = null) => { try { return await p; } catch { return fb; } };

// caps so a large tenant scan stays bounded (documented in the report)
const TOKEN_SCAN_CAP = 60;
const GROUP_SCAN_CAP = 100;
const HIGH_RISK = /(auth\/drive|auth\/gmail|auth\/documents|auth\/spreadsheets)(?!\.readonly)/;

export async function scanGoogle(auth) {
  const directory = google.admin({ version: 'directory_v1', auth });
  const settings = google.groupssettings({ version: 'v1', auth });
  const findings = [];
  const add = (f) => findings.push({ status: 'fail', cis: '', fixUrl: '', ...f });

  // ── Directory: all users ───────────────────────────────────
  let users = [], pageToken;
  do {
    const { data } = await directory.users.list({ customer: 'my_customer', maxResults: 500, projection: 'full', pageToken });
    users = users.concat(data.users || []); pageToken = data.nextPageToken;
  } while (pageToken);

  const active = users.filter((u) => !u.suspended && !u.archived);
  const admins = users.filter((u) => u.isAdmin);
  const enrolled = active.filter((u) => u.isEnrolledIn2Sv).length;
  const enforced = active.filter((u) => u.isEnforcedIn2Sv).length;
  const enrolPct = active.length ? Math.round((enrolled / active.length) * 100) : 0;
  const pctBand = (p) => (p >= 100 ? 'pass' : p >= 50 ? 'partial' : 'fail');

  // ── Module: User & Admin Access ─────────────────────────────
  add({ id: 'g-2sv', module: 'User & Admin Access', severity: 'critical', cis: 'CIS 1.1',
    title: '2-Step Verification enrolled for all active users', status: pctBand(enrolPct),
    detail: `${enrolled} of ${active.length} active users enrolled (${enrolPct}%).`,
    recommendation: 'Enforce 2SV org-wide; require security keys/passkeys for admins.',
    fixUrl: `${AC}/security/2sv` });

  add({ id: 'g-2sv-enf', module: 'User & Admin Access', severity: 'high', cis: 'CIS 1.1',
    title: '2-Step Verification enforced by policy', status: active.length && enforced === active.length ? 'pass' : enforced ? 'partial' : 'fail',
    detail: `${enforced} of ${active.length} active users have 2SV enforced.`,
    recommendation: 'Move from optional to enforced so users cannot disable 2SV.', fixUrl: `${AC}/security/2sv` });

  add({ id: 'g-admin-count', module: 'User & Admin Access', severity: 'high', cis: 'CIS 1.3',
    title: 'Super administrators kept below 5', status: admins.length === 0 ? 'unknown' : admins.length < 5 ? 'pass' : 'fail',
    detail: `${admins.length} super admin(s): ${admins.map((a) => a.primaryEmail).join(', ') || 'none visible'}.`,
    recommendation: 'Keep to 2–4 named super admins; delegate the rest via least-privilege roles.', fixUrl: `${AC}/roles` });

  add({ id: 'g-admin-2sv', module: 'User & Admin Access', severity: 'critical', cis: 'CIS 1.1',
    title: 'All super admins have 2SV enrolled', status: admins.length && admins.every((a) => a.isEnrolledIn2Sv) ? 'pass' : admins.some((a) => a.isEnrolledIn2Sv) ? 'partial' : 'fail',
    detail: `${admins.filter((a) => a.isEnrolledIn2Sv).length} of ${admins.length} admins have 2SV.`,
    recommendation: 'Require hardware security keys or passkeys for every admin.', fixUrl: `${AC}/security/2sv` });

  // custom admin roles (privileged access)
  const roles = await safe(directory.roles.list({ customer: 'my_customer' }));
  if (roles?.data) {
    const custom = (roles.data.items || []).filter((r) => !r.isSystemRole);
    add({ id: 'g-custom-roles', module: 'User & Admin Access', severity: 'medium', cis: 'CIS 1.3',
      title: 'Custom admin roles reviewed', status: custom.length === 0 ? 'pass' : 'partial',
      detail: `${custom.length} custom admin role(s) defined — review each for over-broad privileges.`,
      recommendation: 'Audit custom roles; remove dangerously broad privilege grants.', fixUrl: `${AC}/roles` });
  }

  // ── Module: Account Hygiene (zombie accounts) ───────────────
  const now = Date.now(); const staleDays = 90;
  const stale = active.filter((u) => {
    const t = u.lastLoginTime && u.lastLoginTime !== '1970-01-01T00:00:00.000Z' ? Date.parse(u.lastLoginTime) : 0;
    return t && now - t > staleDays * 864e5;
  });
  add({ id: 'g-zombie', module: 'Account Hygiene', severity: 'medium', cis: 'CIS 1.2',
    title: `No zombie accounts (no login in ${staleDays} days)`, status: stale.length === 0 ? 'pass' : stale.length <= 3 ? 'partial' : 'fail',
    detail: `${stale.length} active account(s) dormant for over ${staleDays} days.`,
    recommendation: 'Suspend or offboard dormant accounts to cut attack surface and licence cost.', fixUrl: `${AC}/users` });

  // ── Module: Risk Center (Shadow IT / third-party OAuth apps) ─
  const sample = active.slice(0, TOKEN_SCAN_CAP);
  const appScopes = new Map(); let riskyApps = 0, scanned = 0, tokenReadable = true;
  for (const u of sample) {
    const res = await safe(directory.tokens.list({ userKey: u.primaryEmail }), false);
    if (res === false) { tokenReadable = false; break; }
    scanned++;
    for (const t of res?.data?.items || []) {
      const scopes = t.scopes || [];
      const risky = scopes.some((s) => HIGH_RISK.test(s));
      const cur = appScopes.get(t.displayText || t.clientId) || { risky: false, count: 0 };
      cur.risky = cur.risky || risky; cur.count++; appScopes.set(t.displayText || t.clientId, cur);
    }
  }
  riskyApps = [...appScopes.values()].filter((a) => a.risky).length;
  if (tokenReadable) {
    add({ id: 'g-shadow-it', module: 'Risk Center (Shadow IT)', severity: riskyApps ? 'high' : 'medium', cis: 'CIS 1.4',
      title: 'Third-party apps with broad Drive/Gmail access', status: riskyApps === 0 ? 'pass' : riskyApps <= 3 ? 'partial' : 'fail',
      detail: `${appScopes.size} distinct third-party app(s) connected across ${scanned} scanned user(s); ${riskyApps} hold full read/write Drive or Gmail access.`,
      recommendation: 'Restrict third-party API access and allowlist only vetted apps.', fixUrl: `${AC}/owl/list` });
  } else {
    add({ id: 'g-shadow-it', module: 'Risk Center (Shadow IT)', severity: 'high', cis: 'CIS 1.4',
      title: 'Third-party app access', status: 'unknown',
      detail: 'Could not enumerate OAuth tokens — the admin.directory.user.security scope was not consented.',
      recommendation: 'Grant the security scope to enable Shadow IT discovery.', fixUrl: `${AC}/owl/list` });
  }

  // ── Module: Collaboration (public / external groups) ────────
  const groupsRes = await safe(directory.groups.list({ customer: 'my_customer', maxResults: GROUP_SCAN_CAP }));
  if (groupsRes?.data) {
    const groups = groupsRes.data.groups || [];
    let exposed = 0, checked = 0, settingsReadable = true;
    for (const gr of groups.slice(0, GROUP_SCAN_CAP)) {
      const s = await safe(settings.groups.get({ groupUniqueId: gr.email }), false);
      if (s === false) { settingsReadable = false; break; }
      checked++;
      const d = s?.data || {};
      if (d.whoCanJoin === 'ANYONE_CAN_JOIN' || d.allowExternalMembers === 'true' || d.whoCanViewGroup === 'ANYONE_CAN_VIEW') exposed++;
    }
    if (settingsReadable) {
      add({ id: 'g-groups', module: 'Collaboration', severity: exposed ? 'high' : 'medium', cis: 'CIS 3.x',
        title: 'Google Groups not publicly / externally exposed', status: exposed === 0 ? 'pass' : exposed <= 2 ? 'partial' : 'fail',
        detail: `${exposed} of ${checked} group(s) allow public access or external members.`,
        recommendation: 'Set groups to organisation-only access; block external members unless required.', fixUrl: `${AC}/groups` });
    }
  }

  // orphaned shared drives (needs Drive scope; degrade gracefully)
  const drive = google.drive({ version: 'v3', auth });
  const drives = await safe(drive.drives.list({ useDomainAdminAccess: true, pageSize: 100 }), null);
  if (drives?.data) {
    add({ id: 'g-orphan-drives', module: 'Collaboration', severity: 'medium', cis: 'CIS 3.x',
      title: 'Shared drives reviewed for orphaned/unmanaged state', status: 'partial',
      detail: `${(drives.data.drives || []).length} shared drive(s) found — verify each has an active manager.`,
      recommendation: 'Assign an active manager to every shared drive; archive orphaned ones.', fixUrl: `${AC}/drive-docs/shareddrives` });
  } else {
    add({ id: 'g-orphan-drives', module: 'Collaboration', severity: 'medium', cis: 'CIS 3.x',
      title: 'Shared drives reviewed for orphaned state', status: 'unknown',
      detail: 'Drive scope not consented — enable to detect orphaned shared drives.',
      recommendation: 'Assign an active manager to every shared drive.', fixUrl: `${AC}/drive-docs/shareddrives` });
  }

  add({ id: 'g-ext-share', module: 'Collaboration', severity: 'high', cis: 'CIS 3.1',
    title: 'External Drive sharing restricted', status: 'unknown',
    detail: 'Drive sharing defaults are not exposed by the API — verify in the Admin console.',
    recommendation: 'Restrict external sharing / disable "anyone with the link".', fixUrl: `${AC}/drive-docs/sharing` });

  // ── Module: Email Security (one module among many) ──────────
  let domains = [];
  const dres = await safe(directory.domains.list({ customer: 'my_customer' }));
  if (dres?.data) domains = (dres.data.domains || []).filter((d) => d.verified).map((d) => d.domainName);
  for (const d of domains) {
    const a = await checkEmailAuth(d);
    add({ id: `g-spf-${d}`, module: 'Email Security', severity: 'high', cis: 'CIS 4.x',
      title: `SPF at enforcement — ${d}`, status: a.spf.present ? (a.spf.hardFail ? 'pass' : 'partial') : 'fail',
      detail: a.spf.record ? `Record: ${a.spf.record}` : 'No SPF record.', recommendation: 'Publish SPF ending in -all.', fixUrl: `${AC}/apps/gmail/authenticateemail` });
    add({ id: `g-dmarc-${d}`, module: 'Email Security', severity: 'high', cis: 'CIS 4.x',
      title: `DMARC at enforcement — ${d}`, status: a.dmarc.enforced ? 'pass' : a.dmarc.present ? 'partial' : 'fail',
      detail: a.dmarc.record ? `Policy p=${a.dmarc.policy}` : 'No DMARC record.', recommendation: 'Move DMARC to p=quarantine then p=reject.', fixUrl: `${AC}/apps/gmail/authenticateemail` });
  }

  // ── Backup & Continuity (RCS managed) ───────────────────────
  add({ id: 'g-backup', module: 'Backup & Continuity', severity: 'high', cis: 'CIS 6.x',
    title: 'Independent third-party backup in place', status: 'unknown',
    detail: 'Google protects infrastructure, not against deletion/ransomware. Not detectable via API.',
    recommendation: 'Deploy independent daily backup with point-in-time restore (RCS managed offering).', fixUrl: `${AC}/apps/gvault` });

  return {
    org: { name: domains[0] || 'Google Workspace tenant', platform: 'Google Workspace' },
    stats: { users: users.length, active: active.length, admins: admins.length, thirdPartyApps: appScopes.size, riskyApps, dormant: stale.length },
    scannedAt: new Date().toISOString(),
    findings,
  };
}
