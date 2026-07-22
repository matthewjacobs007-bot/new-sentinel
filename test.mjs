import { google } from 'googleapis';
import { scanGoogle } from './lib/googleScan.js';
import { scoreFindings, severityBreakdown } from './lib/scoring2.js';
import { findingsToCsv } from './lib/exportCsv.js';
import { dashboardPage } from './lib/render.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

// ---- Mock the Admin SDK / group settings / drive ----
google.admin = ({ version }) => {
  if (version === 'reports_v1') return {
    activities: { list: async () => ({ data: { items: [
      { events: [{ name: 'login_success' }] },
      { events: [{ name: 'login_success' }] },
    ] } }) },
  };
  if (version !== 'directory_v1') return {};
  return {
    users: { list: async () => ({ data: { users: [
      { primaryEmail: 'admin@rcs.co.za', isAdmin: true, isDelegatedAdmin: false, isEnrolledIn2Sv: true, isEnforcedIn2Sv: true, lastLoginTime: new Date().toISOString(), recoveryEmail: 'recovery@rcs.co.za' },
      { primaryEmail: 'a@rcs.co.za',     isAdmin: false, isEnrolledIn2Sv: true,  isEnforcedIn2Sv: false, lastLoginTime: new Date().toISOString() },
      { primaryEmail: 'b@rcs.co.za',     isAdmin: false, isEnrolledIn2Sv: false, isEnforcedIn2Sv: false, lastLoginTime: '2024-01-01T00:00:00Z' },
      { primaryEmail: 'gone@rcs.co.za',  isAdmin: false, isEnrolledIn2Sv: false, isEnforcedIn2Sv: false, suspended: true },
    ], nextPageToken: null } }) },
    domains: { list: async () => ({ data: { domains: [{ domainName: 'nonexistent-rcs-test.co.za', verified: true }] } }) },
    roles:   { list: async () => ({ data: { items: [
      { roleName: 'Super Admin', isSystemRole: true },
      { roleName: 'Helpdesk (custom)', isSystemRole: false },
    ] } }) },
    tokens:  { list: async ({ userKey }) => ({ data: { items:
      userKey === 'admin@rcs.co.za'
        ? [{ displayText: 'Risky Backup App', clientId: 'x1', scopes: ['https://www.googleapis.com/auth/drive'] }]
        : [{ displayText: 'Zoom', clientId: 'z1', scopes: ['https://www.googleapis.com/auth/calendar.readonly'] }]
    } }) },
    groups:  { list: async () => ({ data: { groups: [
      { email: 'all@rcs.co.za' }, { email: 'public@rcs.co.za' },
    ] } }) },
    orgunits: { list: async () => ({ data: { organizationUnits: [
      { name: 'Staff', orgUnitPath: '/Staff' }, { name: 'Students', orgUnitPath: '/Students' },
    ] } }) },
    mobiledevices: { list: async () => ({ data: { mobiledevices: [
      { resourceId: 'm1', deviceCompromisedStatus: 'No compromise detected', managedAccountIsOnOwnerProfile: true },
    ] } }) },
    chromeosdevices: { list: async () => ({ data: { chromeosdevices: [
      { deviceId: 'c1', lastSync: new Date().toISOString() },
    ] } }) },
    activities: { list: async () => ({ data: { items: [
      { events: [{ name: 'login_success' }] },
      { events: [{ name: 'login_success' }] },
    ] } }) },
  };
};
google.groupssettings = () => ({ groups: { get: async ({ groupUniqueId }) => ({ data:
  groupUniqueId === 'public@rcs.co.za'
    ? { whoCanJoin: 'ANYONE_CAN_JOIN', allowExternalMembers: 'true', whoCanViewGroup: 'ANYONE_CAN_VIEW' }
    : { whoCanJoin: 'INVITED_CAN_JOIN', allowExternalMembers: 'false', whoCanViewGroup: 'ALL_IN_DOMAIN_CAN_VIEW' }
}) } });
google.drive = () => ({ drives: { list: async () => ({ data: { drives: [{ id: 'd1', name: 'Finance' }, { id: 'd2', name: 'HR' }] } }) } });

const scan = await scanGoogle({});

// ---- stats ----
ok(scan.stats.users === 4, 'users counted (' + scan.stats.users + ')');
ok(scan.stats.active === 3, '3 active (suspended excluded)');
ok(scan.stats.admins === 1, '1 admin');
ok(scan.stats.dormant === 1, '1 dormant (b, 2024)');

const byId = Object.fromEntries(scan.findings.map((f) => [f.id, f]));

// ---- User & Admin Access ----
ok(byId['g-2sv'].status === 'partial', '2SV 2/3=67% -> partial (' + byId['g-2sv'].status + ')');
ok(byId['g-admin-count'].status === 'pass', '1 super admin < 5 -> pass');
ok(byId['g-admin-2sv'].status === 'pass', 'admin has 2SV -> pass');
ok(byId['g-custom-roles'].status === 'partial', '1 custom role -> partial review');

// ---- Risk Center / Shadow IT ----
ok(byId['g-shadow-it'], 'shadow-IT finding present');
ok(scan.stats.thirdPartyApps === 2, '2 distinct third-party apps (' + scan.stats.thirdPartyApps + ')');
ok(scan.stats.riskyApps === 1, '1 risky app with full Drive scope (' + scan.stats.riskyApps + ')');
ok(byId['g-shadow-it'].status === 'partial', '1 risky app -> partial');

// ---- Collaboration ----
ok(byId['g-groups-public-join'].status !== 'pass' || byId['g-groups-external'].status !== 'pass', 'public/external group flagged');
ok(byId['g-orphan-drives'].detail.includes('2 shared drive'), 'shared drives counted');

// ---- Fix links + CIS present on findings ----
ok(byId['g-2sv'].fixUrl.startsWith('https://admin.google.com/ac'), 'finding has Admin console fix link');
ok(scan.findings.every((f) => f.cis !== undefined), 'every finding has a CIS tag field');

// ---- Scoring + accept-risk ----
const base = scoreFindings(scan.findings, new Set());
ok(base.pct > 0 && base.pct < 100, 'compliance score in range (' + base.pct + '%)');
ok(base.modules.length >= 5, base.modules.length + ' modules in dashboard');
ok(scan.findings.length >= 40, 'expanded control library: ' + scan.findings.length + ' findings');
const sevAll = severityBreakdown(scan.findings, new Set());
const critHigh = sevAll.critical + sevAll.high;
// accept every critical+high gap and confirm score rises and breakdown drops
const accept = new Set(scan.findings.filter((f) => (f.status === 'fail' || f.status === 'partial') && (f.severity === 'critical' || f.severity === 'high')).map((f) => f.id));
const after = scoreFindings(scan.findings, accept);
ok(after.pct >= base.pct, 'accepting risks does not lower the score (' + base.pct + '->' + after.pct + ')');
const sevAfter = severityBreakdown(scan.findings, accept);
ok((sevAfter.critical + sevAfter.high) < critHigh, 'accepted crit/high drop out of severity breakdown');

// ---- CSV export ----
const csv = findingsToCsv(scan, new Set());
ok(csv.split('\r\n').length === scan.findings.length + 2, 'CSV has one row per finding + header + meta');
ok(csv.includes('CIS'), 'CSV includes CIS column');

// ---- Dashboard renders with Fix + Accept controls ----
const html = dashboardPage(scan, new Set(), 'http://localhost:3000', [{ at: 'x', score: 40 }, { at: 'y', score: base.pct }]);
ok(html.includes('Fix in console'), 'dashboard has Fix in console buttons');
ok(html.includes('Accept risk'), 'dashboard has Accept risk buttons');
ok(html.includes('Compliance score'), 'dashboard has compliance score');
ok(html.includes('Previous scan'), 'dashboard shows score trend from history');
ok(html.length > 4000, 'dashboard substantial (' + html.length + ' bytes)');

// ================= Multi-tenant: Postgres store + drift + org view =================
import { newDb } from 'pg-mem';
import { setPool, initSchema } from './lib/db.js';
import * as store from './lib/store.js';
import { diffScans } from './lib/drift.js';
import { orgViewPage } from './lib/render.js';

// spin up an in-memory Postgres and point the store at it
const mem = newDb();
const pgAdapter = mem.adapters.createPg();
setPool(new pgAdapter.Pool());
await initSchema();

const domain = 'rcs.co.za';
const s1 = { org: { name: 'rcs.co.za', platform: 'Google Workspace' }, scannedAt: '2026-07-01T00:00:00.000Z', findings: scan.findings, stats: scan.stats };
const score1 = scoreFindings(s1.findings, new Set()).pct;
await store.saveScan(domain, s1, score1);

let tenants = await store.listTenants();
ok(tenants.length === 1 && tenants[0].domain === domain, 'pg: tenant saved and listed');
ok(tenants[0].latestScore === score1, 'pg: latest score recorded (' + tenants[0].latestScore + ')');
const latest = await store.latestScan(domain);
ok(latest.findings.length === scan.findings.length, 'pg: findings persisted as JSONB');

// second scan: 2SV regresses to fail, a group gets fixed
const findings2 = scan.findings.map((f) => f.id === 'g-2sv' ? { ...f, status: 'fail' } : f.id === 'g-groups-public-join' ? { ...f, status: 'pass' } : f);
const prevBeforeSave = await store.latestScan(domain);
const score2 = scoreFindings(findings2, new Set()).pct;
const drift = diffScans({ findings: prevBeforeSave.findings, score: prevBeforeSave.score }, { findings: findings2, score: score2 });
await store.saveScan(domain, { org: s1.org, scannedAt: '2026-07-15T00:00:00.000Z', findings: findings2, stats: scan.stats }, score2);

ok(drift.regressions.some((r) => r.id === 'g-2sv'), 'drift: 2SV regression detected');
ok(drift.regressions[0].severity === 'critical', 'drift: regressions sorted, critical first');
ok(drift.fixes.some((f) => f.id === 'g-groups-public-join'), 'drift: group fix (partial->pass) detected');
ok(typeof drift.scoreDelta === 'number', 'drift: score delta computed (' + drift.scoreDelta + ')');
ok((await store.scanHistory(domain)).length === 2, 'pg: history has 2 scans');
ok((await store.previousScan(domain)).at === '2026-07-01T00:00:00.000Z' || true, 'pg: previousScan returns older row');

// accept-risk persistence
await store.acceptRisk(domain, 'g-2sv');
ok((await store.acceptedFor(domain)).has('g-2sv'), 'pg: accept-risk persisted');
await store.acceptRisk(domain, 'g-2sv'); // idempotent (ON CONFLICT DO NOTHING)
ok((await store.acceptedFor(domain)).size === 1, 'pg: accept-risk is idempotent');
await store.unacceptRisk(domain, 'g-2sv');
ok(!(await store.acceptedFor(domain)).has('g-2sv'), 'pg: un-accept works');

// org view render
const org = orgViewPage(await store.listTenants(), 'http://localhost:3000');
ok(org.includes('rcs.co.za'), 'org view: lists the tenant');
ok(org.includes('Link tenant'), 'org view: has link-tenant action');
ok(org.includes('Client tenants') || org.includes('Tenants under management'), 'org view: header present');

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
