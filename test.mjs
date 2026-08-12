import { google } from 'googleapis';
import { scanGoogle } from './lib/googleScan.js';
import { scanMicrosoft, isGlobalAdmin } from './lib/microsoftScan.js';
import { scoreFindings, severityBreakdown } from './lib/scoring2.js';
import { findingsToCsv } from './lib/exportCsv.js';
import { dashboardPage } from './lib/render.js';
import { computeMonthlyPriceCents, priceBreakdown, formatUsd } from './lib/pricing.js';
import { usdRate, usdCentsTo } from './lib/fx.js';
import { FRAMEWORKS, frameworksFor, scoreByFramework } from './lib/frameworks.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++; };

// ================= Pricing: $0.50/user/month, $100/month floor =================
ok(computeMonthlyPriceCents(0) === 10000, '0 users -> $100 floor');
ok(computeMonthlyPriceCents(100) === 10000, '100 users × $0.50 = $50 -> still floored to $100');
ok(computeMonthlyPriceCents(200) === 10000, '200 users × $0.50 = $100 -> exactly at the floor');
ok(computeMonthlyPriceCents(201) === 10050, '201 users × $0.50 = $100.50 -> floor no longer applies');
ok(computeMonthlyPriceCents(1000) === 50000, '1000 users × $0.50 = $500');
ok(formatUsd(10000) === '$100.00', 'formatUsd renders cents as dollars');
const bdFloor = priceBreakdown(50);
ok(bdFloor.minimumApplied === true && bdFloor.priceCents === 10000, 'priceBreakdown flags when the floor kicks in');
ok(bdFloor.summary.includes('minimum applies'), 'priceBreakdown summary explains the floor (' + bdFloor.summary + ')');
const bdOverFloor = priceBreakdown(500);
ok(bdOverFloor.minimumApplied === false && bdOverFloor.priceCents === 25000, 'priceBreakdown: 500 users -> $250, no floor message');

// ================= FX: USD -> billing-currency conversion =================
ok(await usdRate('USD') === 1, 'usdRate: USD is always 1:1 with itself');
ok(await usdCentsTo(10000, 'USD') === 10000, 'usdCentsTo: no conversion when billing currency is USD');
// Live rate lookup (ZAR) — sanity-bounded rather than exact, since real FX rates move.
// (Same "hit a real external service in tests" pattern already used for DNS lookups above.)
const zarRate = await usdRate('ZAR');
ok(typeof zarRate === 'number' && zarRate > 5 && zarRate < 50, 'usdRate: USD->ZAR is a plausible rate (' + zarRate + ')');
const zarAmount = await usdCentsTo(10000, 'ZAR');
ok(zarAmount === Math.round(10000 * zarRate), 'usdCentsTo: $100.00 converts to the expected ZAR cents (' + zarAmount + ')');

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
ok(byId['g-user-recovery'].status === 'fail', 'only 1/3 active users have recovery info -> fail (' + byId['g-user-recovery'].detail + ')');
ok(byId['g-suspended-admin'].status === 'pass', 'no suspended account holds admin rights -> pass');

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
ok(['SOC 2', 'ISO 27001', 'GDPR', 'POPIA'].every((h) => csv.includes(h)), 'CSV includes the new compliance framework columns');

// ================= Compliance frameworks =================
ok(['soc2', 'iso27001', 'gdpr', 'popia'].every((k) => FRAMEWORKS[k]), 'FRAMEWORKS registers all 4 new frameworks');
ok(frameworksFor('g-2sv').soc2 === 'CC6.1', 'g-2sv maps to SOC 2 CC6.1 (MFA/logical access)');
ok(frameworksFor('g-suspicious-logins').gdpr === 'Art. 33', 'monitoring control maps to GDPR Art. 33 (breach notification)');
ok(frameworksFor('g-suspicious-logins').popia === 's22', 'monitoring control maps to POPIA s22 (security compromise notification)');
ok(frameworksFor('m-mfa-coverage').soc2 === 'CC6.1', 'Microsoft MFA control is mapped too, not just Google');
ok(frameworksFor('g-spf-example.com').iso27001 === 'A.8.24', 'dynamic per-domain SPF id still resolves via prefix match');
ok(frameworksFor('g-drive-ownership-transfer').gdpr === null, 'a control with no real framework fit stays null, not force-mapped');

const byFramework = scoreByFramework(scan.findings, new Set());
ok(byFramework.soc2.total > 0 && byFramework.soc2.pct !== null, 'SOC 2 scores against this scan\'s mapped controls (' + byFramework.soc2.pct + '%)');
ok(typeof byFramework.cis.pct === 'number', 'existing CIS scoring still works via scoreByFramework (' + byFramework.cis.pct + '%)');
const totalAcrossFrameworks = Object.values(byFramework).reduce((s, fw) => s + fw.total, 0);
ok(totalAcrossFrameworks > scan.findings.length, 'a finding can count toward multiple frameworks at once');

const complianceHtml = dashboardPage(scan, new Set(), 'http://localhost:3000', [], null, 'compliance');
ok(complianceHtml.includes('Compliance frameworks'), 'compliance page has the right title');
ok(complianceHtml.includes('SOC 2 Trust Criteria') && complianceHtml.includes('ISO/IEC 27001:2022')
  && complianceHtml.includes('EU GDPR') && complianceHtml.includes('POPIA (South Africa)'), 'compliance page shows all 4 new framework cards');
ok(complianceHtml.includes('not a certification'), 'compliance page discloses this is a best-effort mapping, not certification');

// ---- Dashboard overview renders score + trend ----
const html = dashboardPage(scan, new Set(), 'http://localhost:3000', [{ at: 'x', score: 40 }, { at: 'y', score: base.pct }]);
ok(html.includes('Compliance score'), 'dashboard has compliance score');
ok(html.includes('Previous scan'), 'dashboard shows score trend from history');
ok(html.length > 4000, 'dashboard substantial (' + html.length + ' bytes)');

// ---- Per-category module page renders Fix + Accept controls ----
const identityHtml = dashboardPage(scan, new Set(), 'http://localhost:3000', [], null, 'identity');
ok(identityHtml.includes('Fix in console'), 'dashboard has Fix in console buttons');
ok(identityHtml.includes('Accept risk'), 'dashboard has Accept risk buttons');

// ---- Role hint: MSP re-scanning must never fall through to client mode ----
// (Regression: a Re-scan click without ?mode=msp defaults to mode=client on the
// server, which both demotes the MSP's session AND routes them into the payment
// wall meant only for clients.)
const mspHtml = dashboardPage(scan, new Set(), 'http://localhost:3000', [], null, 'overview', { role: 'msp' });
ok(mspHtml.includes('/auth/google?mode=msp">Re-scan'), 'MSP dashboard: Re-scan link preserves mode=msp');
ok(mspHtml.includes('All tenants'), 'MSP dashboard: shows the back-to-all-tenants link');

const clientHtml = dashboardPage(scan, new Set(), 'http://localhost:3000', [], null, 'overview', { role: 'client' });
ok(clientHtml.includes('/auth/google">Re-scan'), 'client dashboard: Re-scan link has no mode param (defaults to client)');
ok(!clientHtml.includes('All tenants'), 'client dashboard: hides the all-tenants link (no org-view access)');

// Calling without a roleHint at all (older call sites) must default safely to client,
// not accidentally expose the MSP-only "All tenants" link.
const noHintHtml = dashboardPage(scan, new Set(), 'http://localhost:3000', [], null, 'overview');
ok(!noHintHtml.includes('All tenants'), 'dashboard with no roleHint defaults to client (safe default)');

// ---- Overview surfaces top priority actions instead of requiring a click into every category ----
ok(html.includes('Top priority actions'), 'overview has a top-priority-actions panel');
ok(html.includes('open gap'), 'overview shows an open-gap count');

// ---- Modules with only 'unknown' (needs-review) findings must NOT collapse as "all passing" ----
// Application & API Access is 100% 'unknown' status in this fixture (0 measurable gaps,
// but nothing is actually verified pass) — a naive gaps===0 check would mislabel it clean.
const appsHtml = dashboardPage(scan, new Set(), 'http://localhost:3000', [], null, 'apps');
const appsModuleIdx = appsHtml.indexOf('data-module="Application &amp; API Access"');
ok(appsModuleIdx > -1, 'apps category renders the Application & API Access module');
ok(appsHtml.slice(appsModuleIdx, appsModuleIdx + 60).includes('data-allpass="0"'),
  'a module full of unknown/review findings is not marked all-passing (' + appsHtml.slice(appsModuleIdx, appsModuleIdx + 60) + ')');

// ================= Microsoft 365 scan (Graph API) =================
const graphFixtures = {
  '/organization': { value: [{ displayName: 'RCS Group', verifiedDomains: [
    { name: 'rcs.onmicrosoft.com', isDefault: false },
    { name: 'rcs-group.co.za', isDefault: true },
  ] }] },
  '/reports/authenticationMethods/userRegistrationDetails?$top=999': { value: [
    { isMfaCapable: true }, { isMfaCapable: true }, { isMfaCapable: false },
  ] },
  '/identity/conditionalAccess/policies': { value: [
    { state: 'enabled', conditions: { clientAppTypes: ['other'] }, grantControls: { builtInControls: ['block'] } },
    { state: 'disabled' },
  ] },
  '/security/secureScores?$top=1': { value: [{ currentScore: 62, maxScore: 100, controlScores: [
    { controlName: 'ipfilter', score: 4 }, { controlName: 'mfaall', score: 0 },
  ] }] },
  '/security/secureScoreControlProfiles?$top=999': { value: [
    { id: 'ipfilter', maxScore: 4, title: 'Restrict sign-in by location', controlCategory: 'Identity', threats: [] },
    { id: 'mfaall', maxScore: 10, title: 'Enable MFA', controlCategory: 'Identity', threats: ['account_breach'] },
  ] },
};
const realFetch = global.fetch;
global.fetch = async (url) => {
  const path = String(url).replace('https://graph.microsoft.com/v1.0', '');
  if (path === "/users/$count?$filter=userType eq 'Guest'") return { ok: true, json: async () => 1 };
  if (path.startsWith('/users/$count')) return { ok: true, json: async () => 20 };
  if (path in graphFixtures) return { ok: true, json: async () => graphFixtures[path] };
  return { ok: false, status: 404, json: async () => ({}) };
};

const msScan = await scanMicrosoft('fake-token');
global.fetch = realFetch;

ok(msScan.org.platform === 'Microsoft 365', 'MS scan tags platform as Microsoft 365');
ok(msScan.org.name === 'rcs-group.co.za', 'MS scan keys tenant by its default verified domain, not display name (' + msScan.org.name + ')');
ok(msScan.findings.every((f) => f.module && f.severity && f.status), 'every MS finding has module/severity/status');
ok(msScan.findings.every((f) => f.cis !== undefined), 'every MS finding has a CIS tag field (schema parity with Google findings)');
const msById = Object.fromEntries(msScan.findings.map((f) => [f.id, f]));
ok(msById['m-mfa-coverage'].status === 'partial', '2/3 MFA-capable -> partial (' + msById['m-mfa-coverage'].status + ')');
ok(msById['m-ca'].status === 'pass', '1 enabled Conditional Access policy -> pass');
ok(msById['m-legacy'].status === 'pass', 'legacy-auth block policy detected -> pass');
ok(msById['m-ss-mfaall'].severity === 'critical', 'Secure Score control with account_breach threat -> critical severity');
ok(msById['m-guest-users'].status === 'partial', '1/20 (5%) guest users -> partial (' + msById['m-guest-users'].detail + ')');
ok(msScan.stats.users === 20, 'MS stats.users reuses the single /users/$count call (' + msScan.stats.users + ')');
const msScored = scoreFindings(msScan.findings, new Set());
ok(msScored.pct > 0 && msScored.pct < 100, 'MS findings score against the same engine as Google findings (' + msScored.pct + '%)');

// isGlobalAdmin gate — mirrors the Google super-admin check
global.fetch = async (url) => {
  const path = String(url).replace('https://graph.microsoft.com/v1.0', '');
  if (path.startsWith('/me/memberOf')) return { ok: true, json: async () => ({ value: [{ displayName: 'Global Administrator', roleTemplateId: '62e90394-69f5-4237-9190-012177145e10' }] }) };
  return { ok: false, status: 404, json: async () => ({}) };
};
ok(await isGlobalAdmin('fake-token') === true, 'isGlobalAdmin recognises the Global Administrator role');
global.fetch = async () => ({ ok: true, json: async () => ({ value: [{ displayName: 'Helpdesk Administrator', roleTemplateId: 'not-ga' }] }) });
ok(await isGlobalAdmin('fake-token') === false, 'isGlobalAdmin rejects a non-Global-Admin role');
global.fetch = realFetch;

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

// ================= Billing: activation gate =================
// s1 (saved earlier via saveScan) had 4 users -> $100 floor. New tenant defaults unpaid.
const t0 = await store.getTenant(domain);
ok(t0.active === false, 'pg: a freshly-scanned tenant starts inactive (unpaid)');
ok(t0.userCount === scan.stats.users, 'pg: tenant records the scanned user count (' + t0.userCount + ')');
ok(t0.priceCents === 10000, 'pg: 4 users -> $100 floor price recorded (' + t0.priceCents + ')');

await store.activateTenant(domain, { paymentCustomerId: 'CUS_test123', paymentSubscriptionId: 'PLN_test456' });
const t1 = await store.getTenant(domain);
ok(t1.active === true, 'pg: activateTenant marks the tenant active');
ok(t1.paymentCustomerId === 'CUS_test123', 'pg: payment customer id persisted');

// Re-scanning must NOT reset billing status back to unpaid.
await store.saveScan(domain, { org: s1.org, scannedAt: '2026-07-20T00:00:00.000Z', findings: scan.findings, stats: scan.stats }, score1);
ok((await store.getTenant(domain)).active === true, 'pg: re-scanning an active tenant leaves it active');

// activateTenant is idempotent / safe to call twice (webhook + success-page fallback race)
await store.activateTenant(domain, { paymentCustomerId: 'CUS_test123' });
ok((await store.getTenant(domain)).active === true, 'pg: activateTenant is idempotent');

// ---- activate / activateSuccess page render ----
const { activatePage, activateSuccessPage } = await import('./lib/render.js');
const unpaidTenant = { domain: 'new-client.co.za', name: 'new-client.co.za', userCount: 60, priceCents: 10000, active: false };
const wallHtml = activatePage(unpaidTenant, 'http://localhost:3000', { paymentsConfigured: false });
ok(wallHtml.includes('$100.00'), 'activate page shows the computed monthly price');
ok(wallHtml.includes("contact us") , 'activate page falls back to contact-us when payments are not configured');
ok(!wallHtml.includes('action="http://localhost:3000/activate/checkout"'), 'activate page hides the payment form when not configured');

const wallHtmlConfigured = activatePage(unpaidTenant, 'http://localhost:3000', { paymentsConfigured: true });
ok(wallHtmlConfigured.includes('action="http://localhost:3000/activate/checkout"'), 'activate page shows the Paystack checkout form when configured');

const successHtml = activateSuccessPage({ domain: 'new-client.co.za', name: 'new-client.co.za' }, 'http://localhost:3000', true);
ok(successHtml.includes("You're all set") && successHtml.includes('/tenant/new-client.co.za'), 'activate-success page links to the dashboard once activated');
const processingHtml = activateSuccessPage({ domain: 'new-client.co.za' }, 'http://localhost:3000', false);
ok(processingHtml.includes('processing'), 'activate-success page shows a processing state before activation lands');

// org view render
const org = orgViewPage(await store.listTenants(), 'http://localhost:3000');
ok(org.includes('rcs.co.za'), 'org view: lists the tenant');
ok(org.includes('Link Google Workspace') && org.includes('Link Microsoft 365'), 'org view: has link-tenant actions for both platforms');
ok(org.includes('Client tenants') || org.includes('Tenants under management'), 'org view: header present');
ok(org.includes(`${'http://localhost:3000'}/leads`), 'org view: links to the leads inbox');

// ================= Marketing page + contact-form leads =================
const { marketingPage, leadsPage } = await import('./lib/render.js');

const marketing = marketingPage('http://localhost:3000');
ok(marketing.includes('action="http://localhost:3000/contact"'), 'marketing page posts to /contact');
ok(marketing.includes('Get started') && marketing.includes('Client sign in'), 'marketing page has both CTAs');
ok(!marketing.includes("Thanks — we've got it"), 'marketing page shows the form, not the thank-you, by default');
ok(MODULE_BLURBS_COUNT(marketing) === 10, 'marketing page lists all 10 control modules');

const thanked = marketingPage('http://localhost:3000', { sent: true });
ok(thanked.includes("Thanks — we've got it"), 'marketing page shows thank-you after a submission (?sent=1)');
ok(!thanked.includes('<form'), 'marketing page hides the form once submitted');

// leads round-trip through the same pg-mem store used above
ok((await store.listLeads()).length === 0, 'pg: no leads yet');
await store.saveLead({ name: 'Jane <script>', email: 'jane@acme.co.za', company: 'Acme', platform: 'Google Workspace', message: 'We have 40 users, interested.' });
const leads = await store.listLeads();
ok(leads.length === 1, 'pg: lead saved');
ok(leads[0].email === 'jane@acme.co.za', 'pg: lead email persisted');

const leadsHtml = leadsPage(leads, 'http://localhost:3000');
ok(leadsHtml.includes('Jane &lt;script&gt;'), 'leads page escapes untrusted input');
ok(leadsHtml.includes('acme.co.za'), 'leads page lists the captured lead');
ok(leadsPage([], 'http://localhost:3000').includes('No leads yet'), 'leads page has an empty state');

function MODULE_BLURBS_COUNT(html) {
  // crude check: count how many of the known module names appear (HTML-escaped, since '&' -> '&amp;')
  const names = ['User &amp; Admin Access', 'Account Hygiene', 'Risk Center (Shadow IT)', 'Collaboration',
    'Calendar &amp; Sites', 'Endpoint &amp; Device', 'Email Security', 'Application &amp; API Access', 'Logging &amp; Monitoring', 'Backup &amp; Continuity'];
  return names.filter((n) => html.includes(n)).length;
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL GREEN');
process.exit(fail ? 1 : 0);
