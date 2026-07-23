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
  const suspended = users.filter((u) => u.suspended);
  const archived = users.filter((u) => u.archived);
  const admins = users.filter((u) => u.isAdmin);
  const delegatedAdmins = users.filter((u) => u.isDelegatedAdmin);
  const enrolled = active.filter((u) => u.isEnrolledIn2Sv).length;
  const enforced = active.filter((u) => u.isEnforcedIn2Sv).length;
  const enrolPct = active.length ? Math.round((enrolled / active.length) * 100) : 0;
  const pctBand = (p) => (p >= 100 ? 'pass' : p >= 50 ? 'partial' : 'fail');

  // password hygiene: users who haven't changed passwords in >1yr
  const yearAgo = Date.now() - 365 * 864e5;
  const oldPasswords = active.filter((u) => {
    const t = u.lastLoginTime && u.lastLoginTime !== '1970-01-01T00:00:00.000Z' ? Date.parse(u.lastLoginTime) : 0;
    return t && t < yearAgo;
  });

  // super admins vs delegated admins split
  const superAdmins = admins.filter((u) => !u.isDelegatedAdmin);

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
    title: 'Super administrators kept below 5', status: superAdmins.length === 0 ? 'unknown' : superAdmins.length < 5 ? 'pass' : 'fail',
    detail: `${superAdmins.length} super admin(s): ${superAdmins.map((a) => a.primaryEmail).join(', ') || 'none visible'}.`,
    recommendation: 'Keep to 2–4 named super admins; delegate the rest via least-privilege roles.', fixUrl: `${AC}/roles` });

  add({ id: 'g-delegated-admins', module: 'User & Admin Access', severity: 'medium', cis: 'CIS 1.3',
    title: 'Delegated administrators reviewed', status: delegatedAdmins.length === 0 ? 'pass' : delegatedAdmins.length <= 10 ? 'partial' : 'fail',
    detail: `${delegatedAdmins.length} delegated admin(s) — accounts with elevated but not super-admin privileges.`,
    recommendation: 'Review each delegated admin; remove privileges no longer needed.', fixUrl: `${AC}/roles` });

  add({ id: 'g-admin-recovery', module: 'User & Admin Access', severity: 'high', cis: 'CIS 1.3',
    title: 'Admin accounts have recovery information set', status: admins.length && admins.every((a) => a.recoveryEmail || a.recoveryPhone) ? 'pass' : admins.some((a) => a.recoveryEmail || a.recoveryPhone) ? 'partial' : 'fail',
    detail: `${admins.filter((a) => a.recoveryEmail || a.recoveryPhone).length} of ${admins.length} admins have recovery email/phone set.`,
    recommendation: 'Set recovery email and phone on every admin account to prevent lockout.', fixUrl: `${AC}/users` });

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

  const neverLoggedIn = active.filter((u) => !u.lastLoginTime || u.lastLoginTime === '1970-01-01T00:00:00.000Z');
  add({ id: 'g-never-login', module: 'Account Hygiene', severity: 'medium', cis: 'CIS 1.2',
    title: 'No accounts that have never signed in', status: neverLoggedIn.length === 0 ? 'pass' : neverLoggedIn.length <= 3 ? 'partial' : 'fail',
    detail: `${neverLoggedIn.length} active account(s) have never signed in — provisioned but never used.`,
    recommendation: 'Investigate never-used accounts; suspend if no longer needed.', fixUrl: `${AC}/users` });

  add({ id: 'g-old-passwords', module: 'Account Hygiene', severity: 'low', cis: 'CIS 1.2',
    title: 'Password rotation on active accounts', status: oldPasswords.length === 0 ? 'pass' : oldPasswords.length <= Math.ceil(active.length * 0.2) ? 'partial' : 'fail',
    detail: `${oldPasswords.length} of ${active.length} active user(s) have not signed in for over a year (likely stale passwords).`,
    recommendation: 'Review long-dormant users; enforce password reset or offboard.', fixUrl: `${AC}/users` });

  add({ id: 'g-suspended-cleanup', module: 'Account Hygiene', severity: 'low', cis: 'CIS 1.2',
    title: 'Suspended accounts reviewed for deletion', status: suspended.length === 0 ? 'pass' : suspended.length <= 10 ? 'partial' : 'fail',
    detail: `${suspended.length} suspended account(s); ${archived.length} archived. Data still retained.`,
    recommendation: 'Archive or delete long-suspended accounts to reduce licence cost and clutter.', fixUrl: `${AC}/users` });

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
    let publicJoin = 0, extMembers = 0, publicView = 0, publicPost = 0, checked = 0, settingsReadable = true;
    for (const gr of groups.slice(0, GROUP_SCAN_CAP)) {
      const s = await safe(settings.groups.get({ groupUniqueId: gr.email }), false);
      if (s === false) { settingsReadable = false; break; }
      checked++;
      const d = s?.data || {};
      if (d.whoCanJoin === 'ANYONE_CAN_JOIN') publicJoin++;
      if (d.allowExternalMembers === 'true') extMembers++;
      if (d.whoCanViewGroup === 'ANYONE_CAN_VIEW') publicView++;
      if (d.whoCanPostMessage === 'ANYONE_CAN_POST') publicPost++;
    }
    if (settingsReadable) {
      add({ id: 'g-groups-public-join', module: 'Collaboration', severity: 'high', cis: 'CIS 3.x',
        title: 'No groups allow public joining', status: publicJoin === 0 ? 'pass' : publicJoin <= 2 ? 'partial' : 'fail',
        detail: `${publicJoin} of ${checked} group(s) allow anyone on the internet to join.`,
        recommendation: 'Set "who can join" to invited or organisation-only.', fixUrl: `${AC}/groups` });

      add({ id: 'g-groups-external', module: 'Collaboration', severity: 'high', cis: 'CIS 3.x',
        title: 'External members restricted on groups', status: extMembers === 0 ? 'pass' : extMembers <= 5 ? 'partial' : 'fail',
        detail: `${extMembers} of ${checked} group(s) allow external members.`,
        recommendation: 'Block external members unless a specific group requires them.', fixUrl: `${AC}/groups` });

      add({ id: 'g-groups-public-view', module: 'Collaboration', severity: 'medium', cis: 'CIS 3.x',
        title: 'Group content not publicly viewable', status: publicView === 0 ? 'pass' : publicView <= 3 ? 'partial' : 'fail',
        detail: `${publicView} of ${checked} group(s) let anyone on the internet view messages.`,
        recommendation: 'Restrict "who can view group" to members or organisation.', fixUrl: `${AC}/groups` });

      add({ id: 'g-groups-public-post', module: 'Collaboration', severity: 'medium', cis: 'CIS 3.x',
        title: 'Groups do not accept posts from anyone', status: publicPost === 0 ? 'pass' : publicPost <= 3 ? 'partial' : 'fail',
        detail: `${publicPost} of ${checked} group(s) let anyone post — spam and phishing vector.`,
        recommendation: 'Restrict posting to members; require moderation for external posts.', fixUrl: `${AC}/groups` });
    }
  }

  // OU structure — indicates whether the tenant uses OU-based policy segmentation
  const ouRes = await safe(directory.orgunits.list({ customerId: 'my_customer', type: 'all' }));
  if (ouRes?.data) {
    const ouCount = (ouRes.data.organizationUnits || []).length;
    add({ id: 'g-ou-structure', module: 'Collaboration', severity: 'low', cis: 'CIS 1.x',
      title: 'OU structure supports policy segmentation', status: ouCount >= 2 ? 'pass' : 'partial',
      detail: `${ouCount} organizational unit(s) defined beyond the root.`,
      recommendation: 'Use OUs to apply differentiated security policies (e.g. stricter for admins/finance).', fixUrl: `${AC}/orgunits` });
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

  add({ id: 'g-drive-link-share', module: 'Collaboration', severity: 'high', cis: 'CIS 3.1',
    title: 'Link sharing default is restricted', status: 'unknown',
    detail: 'Default link-sharing behaviour not exposed by API — verify in the Admin console.',
    recommendation: 'Set default link sharing to "off" or "restricted" so new files aren\'t public by default.', fixUrl: `${AC}/drive-docs/sharing` });

  add({ id: 'g-drive-ownership-transfer', module: 'Collaboration', severity: 'medium', cis: 'CIS 3.x',
    title: 'Drive ownership transfer process defined', status: 'unknown',
    detail: 'Verify that departing user Drive content is transferred to a manager before offboarding.',
    recommendation: 'Document and follow a Drive ownership transfer step in the offboarding workflow.', fixUrl: `${AC}/users` });

  // ── Module: Endpoint & Device (mobile devices via Directory API) ──
  const mobileRes = await safe(directory.mobiledevices.list({ customerId: 'my_customer', maxResults: 100 }));
  if (mobileRes?.data) {
    const devices = mobileRes.data.mobiledevices || [];
    const unmanaged = devices.filter((d) => d.managedAccountIsOnOwnerProfile === false || !d.deviceCompromisedStatus).length;
    const compromised = devices.filter((d) => d.deviceCompromisedStatus && d.deviceCompromisedStatus !== 'No compromise detected').length;
    add({ id: 'g-mobile-count', module: 'Endpoint & Device', severity: 'medium', cis: 'CIS 5.x',
      title: 'Mobile devices enrolled in management', status: devices.length === 0 ? 'unknown' : 'partial',
      detail: `${devices.length} mobile device(s) known to Workspace.`,
      recommendation: 'Enable advanced mobile management; enforce screen lock, encryption, and remote wipe.', fixUrl: `${AC}/devices/mobile` });

    add({ id: 'g-mobile-compromised', module: 'Endpoint & Device', severity: 'high', cis: 'CIS 5.x',
      title: 'No compromised mobile devices detected', status: compromised === 0 ? 'pass' : 'fail',
      detail: `${compromised} device(s) flagged as compromised (jailbroken/rooted).`,
      recommendation: 'Block compromised devices from accessing Workspace data.', fixUrl: `${AC}/devices/mobile` });
  }

  const chromeRes = await safe(directory.chromeosdevices.list({ customerId: 'my_customer', maxResults: 100 }));
  if (chromeRes?.data) {
    const chromebooks = chromeRes.data.chromeosdevices || [];
    const inactive = chromebooks.filter((d) => {
      const t = d.lastSync ? Date.parse(d.lastSync) : 0;
      return t && Date.now() - t > 30 * 864e5;
    }).length;
    add({ id: 'g-chromeos-inactive', module: 'Endpoint & Device', severity: 'low', cis: 'CIS 5.x',
      title: 'Chrome devices actively syncing', status: chromebooks.length === 0 ? 'unknown' : inactive === 0 ? 'pass' : inactive <= Math.ceil(chromebooks.length * 0.1) ? 'partial' : 'fail',
      detail: `${chromebooks.length} Chrome device(s); ${inactive} not synced in 30+ days.`,
      recommendation: 'Deprovision Chrome devices no longer in use.', fixUrl: `${AC}/devices/chrome` });
  }

  add({ id: 'g-calendar-external', module: 'Calendar & Sites', severity: 'medium', cis: 'CIS 3.x',
    title: 'External Calendar sharing restricted', status: 'unknown',
    detail: 'Calendar external sharing defaults are not exposed by the API — verify in the Admin console.',
    recommendation: 'Restrict external Calendar sharing to free/busy only.', fixUrl: `${AC}/apps/calendar` });

  add({ id: 'g-sites-public', module: 'Calendar & Sites', severity: 'medium', cis: 'CIS 3.x',
    title: 'New Sites default to private, not public', status: 'unknown',
    detail: 'Sites publishing defaults are not exposed by the API — verify in the Admin console.',
    recommendation: 'Set default Sites publishing to organisation-only; audit any publicly-shared Sites.', fixUrl: `${AC}/apps/sites` });

  add({ id: 'g-meet-external', module: 'Calendar & Sites', severity: 'low', cis: 'CIS 3.x',
    title: 'Google Meet external participant controls in place', status: 'unknown',
    detail: 'Meet host controls are not exposed by the API — verify in the Admin console.',
    recommendation: 'Require host approval for external Meet joiners; disable anonymous joining.', fixUrl: `${AC}/apps/meet` });

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

  add({ id: 'g-dkim-signing', module: 'Email Security', severity: 'high', cis: 'CIS 4.x',
    title: 'DKIM signing enabled', status: 'unknown',
    detail: 'DKIM cannot be confirmed via API without knowing the selector.',
    recommendation: 'Enable DKIM (2048-bit) for each domain and publish the DNS record.', fixUrl: `${AC}/apps/gmail/authenticateemail` });

  add({ id: 'g-gmail-fwd', module: 'Email Security', severity: 'high', cis: 'CIS 4.x',
    title: 'Automatic external mail forwarding disabled', status: 'unknown',
    detail: 'Auto-forwarding rules are set by users and not exposed org-wide via API.',
    recommendation: 'Disable auto-forwarding to external addresses org-wide — a classic account-takeover exfiltration path.', fixUrl: `${AC}/apps/gmail/enduseraccess` });

  add({ id: 'g-gmail-safety', module: 'Email Security', severity: 'medium', cis: 'CIS 4.x',
    title: 'Gmail advanced safety features enabled', status: 'unknown',
    detail: 'Safety settings (attachment scanning, spoofing/authentication, link protection) are not exposed by API.',
    recommendation: 'Enable all Gmail advanced safety settings; set suspicious content to quarantine.', fixUrl: `${AC}/apps/gmail/safety` });

  add({ id: 'g-gmail-confidential', module: 'Email Security', severity: 'low', cis: 'CIS 4.x',
    title: 'Confidential mode policy defined', status: 'unknown',
    detail: 'Confidential mode allows expiry and revocation on sensitive mail.',
    recommendation: 'Enable Gmail confidential mode for cases where mail must be revocable.', fixUrl: `${AC}/apps/gmail/usersettings` });

  // ── Module: Application & API Access ────────────────────────
  add({ id: 'g-api-controls', module: 'Application & API Access', severity: 'high', cis: 'CIS 2.x',
    title: 'App access control set to restricted', status: 'unknown',
    detail: 'API app-access control policy is not exposed via the Admin SDK.',
    recommendation: 'Set API access to "restricted" and allowlist only trusted apps.', fixUrl: `${AC}/owl/list?tab=configuredApps` });

  add({ id: 'g-marketplace', module: 'Application & API Access', severity: 'medium', cis: 'CIS 2.x',
    title: 'Marketplace app installs controlled', status: 'unknown',
    detail: 'Marketplace install policy is not exposed via the Admin SDK.',
    recommendation: 'Allow only admin-approved Marketplace apps to be installed.', fixUrl: `${AC}/apps/marketplace` });

  add({ id: 'g-lsa', module: 'Application & API Access', severity: 'high', cis: 'CIS 2.x',
    title: 'Less-secure app access blocked', status: 'unknown',
    detail: 'Less-secure app access setting is not exposed via the API.',
    recommendation: 'Disable less-secure app access org-wide (legacy protocols bypass MFA).', fixUrl: `${AC}/security/lsa` });

  // ── Module: Logging & Monitoring (via Reports API) ──────────
  const reports = google.admin({ version: 'reports_v1', auth });
  const loginActs = await safe(reports.activities.list({ userKey: 'all', applicationName: 'login', maxResults: 100 }));
  if (loginActs?.data) {
    const events = loginActs.data.items || [];
    const suspicious = events.filter((e) => (e.events || []).some((ev) => /suspicious|failure|challenge/i.test(ev.name || ''))).length;
    add({ id: 'g-suspicious-logins', module: 'Logging & Monitoring', severity: suspicious ? 'high' : 'medium', cis: 'CIS 6.x',
      title: 'No recent suspicious login events', status: events.length === 0 ? 'unknown' : suspicious === 0 ? 'pass' : suspicious <= 3 ? 'partial' : 'fail',
      detail: `${suspicious} suspicious/failed login event(s) in the last 100 login records.`,
      recommendation: 'Investigate suspicious logins; consider tightening Conditional Access.', fixUrl: `${AC}/reporting/audit-log/login` });
  }

  add({ id: 'g-audit-retention', module: 'Logging & Monitoring', severity: 'medium', cis: 'CIS 6.x',
    title: 'Audit log retention configured', status: 'unknown',
    detail: 'Audit log retention beyond the default requires configuration in Vault or BigQuery export.',
    recommendation: 'Export admin, login and Drive logs to BigQuery for long-term retention.', fixUrl: `${AC}/reporting/audit` });

  add({ id: 'g-alert-center', module: 'Logging & Monitoring', severity: 'medium', cis: 'CIS 6.x',
    title: 'Alert Center rules configured', status: 'unknown',
    detail: 'Alert Center rule configuration is not exposed via the API.',
    recommendation: 'Enable alerts for suspicious login, admin changes and data exfiltration signals.', fixUrl: `${AC}/security/alerts` });

  // ── Backup & Continuity ─────────────────────────────────────
  add({ id: 'g-backup', module: 'Backup & Continuity', severity: 'high', cis: 'CIS 6.x',
    title: 'Independent third-party backup in place', status: 'unknown',
    detail: 'Google protects infrastructure, not against deletion/ransomware. Not detectable via API.',
    recommendation: 'Deploy independent daily backup with point-in-time restore covering Gmail, Drive, Contacts and Calendar.', fixUrl: `${AC}/apps/gvault` });

  add({ id: 'g-vault-retention', module: 'Backup & Continuity', severity: 'medium', cis: 'CIS 6.x',
    title: 'Google Vault retention policies defined', status: 'unknown',
    detail: 'Vault retention rules are not exposed via the Admin SDK.',
    recommendation: 'Configure Vault retention aligned to POPIA/legal requirements; apply holds where needed.', fixUrl: `${AC}/apps/gvault` });

  add({ id: 'g-incident-response', module: 'Backup & Continuity', severity: 'medium', cis: 'CIS 6.x',
    title: 'Incident response runbook documented', status: 'unknown',
    detail: 'Procedural control — not detectable via API.',
    recommendation: 'Document a Workspace-specific incident response runbook covering account compromise, data loss and admin lockout.', fixUrl: `${AC}` });

  return {
    org: { name: domains[0] || 'Google Workspace tenant', platform: 'Google Workspace' },
    stats: {
      users: users.length, active: active.length, admins: admins.length, superAdmins: superAdmins.length,
      delegatedAdmins: delegatedAdmins.length, thirdPartyApps: appScopes.size, riskyApps,
      dormant: stale.length, neverLoggedIn: neverLoggedIn.length, suspended: suspended.length,
    },
    scannedAt: new Date().toISOString(),
    findings,
  };
}
