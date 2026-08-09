// lib/microsoftScan.js
// Scans a Microsoft 365 tenant via Microsoft Graph. Leans on Secure Score
// (Graph already scores dozens of controls) and adds MFA registration,
// Conditional Access presence and DNS email authentication.
//
// Delegated Graph permissions required (admin consents at sign-in):
//   Organization.Read.All, User.Read.All, Directory.Read.All,
//   Policy.Read.All, Reports.Read.All, SecurityEvents.Read.All
import { checkEmailAuth } from './dns.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const ENTRA = 'https://entra.microsoft.com';
const SECURE_SCORE_URL = 'https://security.microsoft.com/securescore';

async function g(token, path, extraHeaders = {}) {
  const res = await fetch(GRAPH + path, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });
  if (!res.ok) throw new Error(`Graph ${path} → ${res.status}`);
  return res.json();
}
const safe = async (p, fallback = null) => { try { return await p; } catch { return fallback; } };

// The Global Administrator role template ID is fixed across every Azure AD / Entra tenant.
const GLOBAL_ADMIN_ROLE_ID = '62e90394-69f5-4237-9190-012177145e10';

export async function getSignedInUser(token) {
  const me = await g(token, '/me?$select=userPrincipalName,mail,displayName');
  return { email: (me.mail || me.userPrincipalName || '').toLowerCase(), name: me.displayName };
}

// Mirrors the Google scan's super-admin gate: only a tenant Global Administrator can sign in.
export async function isGlobalAdmin(token) {
  const roles = await safe(g(token, '/me/memberOf/microsoft.graph.directoryRole'));
  return Boolean(roles?.value?.some((r) => r.roleTemplateId === GLOBAL_ADMIN_ROLE_ID || r.displayName === 'Global Administrator'));
}

export async function scanMicrosoft(token) {
  const findings = [];

  const org = await safe(g(token, '/organization'));
  const verifiedDomains = org?.value?.[0]?.verifiedDomains || [];
  const domains = verifiedDomains.map((d) => d.name);
  // Mirror the Google Workspace scan: org.name is the tenant's primary domain (the
  // multi-tenant key), not the free-text display name. Prefer the domain Microsoft
  // marks as default; fall back to the first custom (non-onmicrosoft.com) domain.
  const primaryDomain = verifiedDomains.find((d) => d.isDefault)?.name
    || domains.find((d) => !d.endsWith('.onmicrosoft.com'))
    || domains[0]
    || org?.value?.[0]?.displayName
    || 'microsoft-365-tenant';

  // ── MFA registration (Reports) ─────────────────────────────
  const reg = await safe(g(token, '/reports/authenticationMethods/userRegistrationDetails?$top=999'));
  if (reg?.value) {
    const total = reg.value.length;
    const mfaCapable = reg.value.filter((u) => u.isMfaCapable).length;
    const pct = total ? Math.round((mfaCapable / total) * 100) : 0;
    findings.push({
      id: 'm-mfa-coverage', module: 'Identity & Access', severity: 'critical', cis: 'CIS 6.5',
      title: 'MFA registered for all users',
      status: pct >= 100 ? 'pass' : pct >= 50 ? 'partial' : 'fail',
      detail: `${mfaCapable} of ${total} users are MFA-capable (${pct}%).`,
      recommendation: 'Require MFA for all users via Conditional Access (or Security Defaults).',
      fixUrl: `${ENTRA}/#view/Microsoft_AAD_IAM/AuthenticationMethodsMenuBlade`,
    });
  }

  // ── Conditional Access ─────────────────────────────────────
  const ca = await safe(g(token, '/identity/conditionalAccess/policies'));
  if (ca?.value) {
    const enabled = ca.value.filter((p) => p.state === 'enabled');
    const blocksLegacy = enabled.some((p) =>
      (p.conditions?.clientAppTypes || []).some((t) => t === 'exchangeActiveSync' || t === 'other')
      && p.grantControls?.builtInControls?.includes('block'));
    findings.push({
      id: 'm-ca', module: 'Identity & Access', severity: 'high', cis: 'CIS 6.7',
      title: 'Conditional Access policies in force',
      status: enabled.length ? 'pass' : 'fail',
      detail: `${enabled.length} enabled Conditional Access policy/policies of ${ca.value.length} total.`,
      recommendation: 'Enforce MFA, block legacy auth and require compliant devices via Conditional Access.',
      fixUrl: `${ENTRA}/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade`,
    });
    findings.push({
      id: 'm-legacy', module: 'Identity & Access', severity: 'high', cis: 'CIS 4.8',
      title: 'Legacy authentication blocked',
      status: blocksLegacy ? 'pass' : 'partial',
      detail: blocksLegacy ? 'A policy blocking legacy clients is enabled.'
        : 'No explicit legacy-auth block policy detected.',
      recommendation: 'Add a Conditional Access policy blocking legacy authentication tenant-wide.',
      fixUrl: `${ENTRA}/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade`,
    });
  }

  // ── Secure Score (the backbone: Graph scores controls for us) ──
  const score = await safe(g(token, '/security/secureScores?$top=1'));
  const profiles = await safe(g(token, '/security/secureScoreControlProfiles?$top=999'));
  const latest = score?.value?.[0];
  if (latest && profiles?.value) {
    const profById = Object.fromEntries(profiles.value.map((p) => [p.id, p]));
    for (const c of latest.controlScores || []) {
      const prof = profById[c.controlName] || {};
      const max = prof.maxScore ?? c.score ?? 0;
      if (!max) continue;
      const ratio = (c.score ?? 0) / max;
      const sev = ({ Critical: 'critical', High: 'high', Moderate: 'medium', Low: 'low' })[prof.rank ? 'High' : (prof.threats?.length ? 'high' : 'medium')] || 'medium';
      findings.push({
        id: `m-ss-${c.controlName}`,
        module: prettyDomain(prof.controlCategory || c.controlCategory || 'Microsoft Secure Score'),
        severity: mapSeverity(prof), cis: '',
        title: prof.title || c.controlName,
        status: ratio >= 1 ? 'pass' : ratio > 0 ? 'partial' : 'fail',
        detail: `Secure Score: ${c.score ?? 0} of ${max} points. ${strip(prof.implementationCost ? `Effort: ${prof.implementationCost}.` : '')}`,
        recommendation: strip(prof.remediation || prof.actionType || 'Review this control in the Microsoft Secure Score portal.'),
        fixUrl: SECURE_SCORE_URL,
      });
    }
  } else {
    findings.push({
      id: 'm-ss', module: 'Microsoft Secure Score', severity: 'high', cis: '',
      title: 'Microsoft Secure Score available',
      status: 'unknown',
      detail: 'Could not read Secure Score — confirm the SecurityEvents.Read.All permission is consented.',
      recommendation: 'Grant Secure Score read access to enable automated control scoring.',
      fixUrl: SECURE_SCORE_URL,
    });
  }

  // ── Email security (DNS) ───────────────────────────────────
  for (const d of domains.filter((x) => !x.endsWith('onmicrosoft.com'))) {
    const auth = await checkEmailAuth(d);
    findings.push({
      id: `m-spf-${d}`, module: 'Email Security', severity: 'high', cis: 'CIS 9.5',
      title: `SPF published — ${d}`,
      status: auth.spf.present ? (auth.spf.hardFail ? 'pass' : 'partial') : 'fail',
      detail: auth.spf.record ? `Record: ${auth.spf.record}` : 'No SPF record found.',
      recommendation: 'Publish SPF authorising Exchange Online, ending -all.',
      fixUrl: 'https://admin.microsoft.com/#/domains',
    });
    findings.push({
      id: `m-dmarc-${d}`, module: 'Email Security', severity: 'high', cis: 'CIS 9.5',
      title: `DMARC at enforcement — ${d}`,
      status: auth.dmarc.enforced ? 'pass' : auth.dmarc.present ? 'partial' : 'fail',
      detail: auth.dmarc.record ? `Policy p=${auth.dmarc.policy}` : 'No DMARC record found.',
      recommendation: 'Move DMARC to p=quarantine then p=reject.',
      fixUrl: 'https://admin.microsoft.com/#/domains',
    });
  }

  // ── Guest / external users (Collaboration) ─────────────────
  const totalUsers = await safe(g(token, '/users/$count', { ConsistencyLevel: 'eventual' }));
  const guests = await safe(g(token, "/users/$count?$filter=userType eq 'Guest'", { ConsistencyLevel: 'eventual' }));
  if (typeof guests === 'number' && typeof totalUsers === 'number') {
    const guestPct = totalUsers ? Math.round((guests / totalUsers) * 100) : 0;
    findings.push({
      id: 'm-guest-users', module: 'Collaboration', severity: 'medium', cis: 'CIS 3.3',
      title: 'Guest / external user access reviewed',
      status: guests === 0 ? 'pass' : guestPct <= 10 ? 'partial' : 'fail',
      detail: `${guests} of ${totalUsers} accounts (${guestPct}%) are guest/external users.`,
      recommendation: 'Review guest accounts periodically; remove stale ones and restrict guest invites to admins or approved inviters.',
      fixUrl: `${ENTRA}/#view/Microsoft_AAD_IAM/AllUsersFilterUserType.Guest`,
    });
  }

  // ── RCS managed backup (not a Secure Score control) ────────
  findings.push({
    id: 'm-backup', module: 'Backup & Continuity', severity: 'high', cis: 'CIS 11.1',
    title: 'Independent third-party backup in place',
    status: 'unknown',
    detail: 'Microsoft\u2019s shared-responsibility model does not back up your data. Not detectable via API.',
    recommendation: 'Deploy an independent daily backup with point-in-time restore (RCS managed offering).',
    fixUrl: '',
  });

  return {
    org: { name: primaryDomain, platform: 'Microsoft 365' },
    stats: { users: typeof totalUsers === 'number' ? totalUsers : (reg?.value?.length ?? 0), secureScore: latest?.currentScore ?? null, secureScoreMax: latest?.maxScore ?? null },
    findings,
  };
}

function strip(html) { return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function prettyDomain(cat) {
  return ({ Identity: 'Identity & Access', Data: 'Data Protection & Sharing', Device: 'Endpoint & Device', Apps: 'Application & API Access' })[cat] || cat;
}
function mapSeverity(prof) {
  const t = (prof.threats || []).join(' ').toLowerCase();
  if (t.includes('account_breach') || t.includes('elevation')) return 'critical';
  if (prof.userImpact === 'High' || (prof.maxScore ?? 0) >= 8) return 'high';
  if ((prof.maxScore ?? 0) >= 4) return 'medium';
  return 'low';
}
