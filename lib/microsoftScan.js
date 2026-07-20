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

async function g(token, path, extraHeaders = {}) {
  const res = await fetch(GRAPH + path, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });
  if (!res.ok) throw new Error(`Graph ${path} → ${res.status}`);
  return res.json();
}
const safe = async (p, fallback = null) => { try { return await p; } catch { return fallback; } };

export async function scanMicrosoft(token) {
  const findings = [];

  const org = await safe(g(token, '/organization'));
  const orgName = org?.value?.[0]?.displayName || 'Microsoft 365 tenant';
  const domains = (org?.value?.[0]?.verifiedDomains || []).map((d) => d.name);

  // ── MFA registration (Reports) ─────────────────────────────
  const reg = await safe(g(token, '/reports/authenticationMethods/userRegistrationDetails?$top=999'));
  if (reg?.value) {
    const total = reg.value.length;
    const mfaCapable = reg.value.filter((u) => u.isMfaCapable).length;
    const pct = total ? Math.round((mfaCapable / total) * 100) : 0;
    findings.push({
      id: 'm-mfa-coverage', domain: 'Identity & Access', severity: 'critical',
      title: 'MFA registered for all users',
      status: pct >= 100 ? 'pass' : pct >= 50 ? 'partial' : 'fail',
      detail: `${mfaCapable} of ${total} users are MFA-capable (${pct}%).`,
      recommendation: 'Require MFA for all users via Conditional Access (or Security Defaults).',
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
      id: 'm-ca', domain: 'Identity & Access', severity: 'high',
      title: 'Conditional Access policies in force',
      status: enabled.length ? 'pass' : 'fail',
      detail: `${enabled.length} enabled Conditional Access policy/policies of ${ca.value.length} total.`,
      recommendation: 'Enforce MFA, block legacy auth and require compliant devices via Conditional Access.',
    });
    findings.push({
      id: 'm-legacy', domain: 'Identity & Access', severity: 'high',
      title: 'Legacy authentication blocked',
      status: blocksLegacy ? 'pass' : 'partial',
      detail: blocksLegacy ? 'A policy blocking legacy clients is enabled.'
        : 'No explicit legacy-auth block policy detected.',
      recommendation: 'Add a Conditional Access policy blocking legacy authentication tenant-wide.',
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
        domain: prettyDomain(prof.controlCategory || c.controlCategory || 'Microsoft Secure Score'),
        severity: mapSeverity(prof),
        title: prof.title || c.controlName,
        status: ratio >= 1 ? 'pass' : ratio > 0 ? 'partial' : 'fail',
        detail: `Secure Score: ${c.score ?? 0} of ${max} points. ${strip(prof.implementationCost ? `Effort: ${prof.implementationCost}.` : '')}`,
        recommendation: strip(prof.remediation || prof.actionType || 'Review this control in the Microsoft Secure Score portal.'),
      });
    }
  } else {
    findings.push({
      id: 'm-ss', domain: 'Microsoft Secure Score', severity: 'high',
      title: 'Microsoft Secure Score available',
      status: 'unknown',
      detail: 'Could not read Secure Score — confirm the SecurityEvents.Read.All permission is consented.',
      recommendation: 'Grant Secure Score read access to enable automated control scoring.',
    });
  }

  // ── Email security (DNS) ───────────────────────────────────
  for (const d of domains.filter((x) => !x.endsWith('onmicrosoft.com'))) {
    const auth = await checkEmailAuth(d);
    findings.push({
      id: `m-spf-${d}`, domain: 'Email Security', severity: 'high',
      title: `SPF published — ${d}`,
      status: auth.spf.present ? (auth.spf.hardFail ? 'pass' : 'partial') : 'fail',
      detail: auth.spf.record ? `Record: ${auth.spf.record}` : 'No SPF record found.',
      recommendation: 'Publish SPF authorising Exchange Online, ending -all.',
    });
    findings.push({
      id: `m-dmarc-${d}`, domain: 'Email Security', severity: 'high',
      title: `DMARC at enforcement — ${d}`,
      status: auth.dmarc.enforced ? 'pass' : auth.dmarc.present ? 'partial' : 'fail',
      detail: auth.dmarc.record ? `Policy p=${auth.dmarc.policy}` : 'No DMARC record found.',
      recommendation: 'Move DMARC to p=quarantine then p=reject.',
    });
  }

  // ── RCS managed backup (not a Secure Score control) ────────
  findings.push({
    id: 'm-backup', domain: 'Backup & Continuity', severity: 'high',
    title: 'Independent third-party backup in place',
    status: 'unknown',
    detail: 'Microsoft\u2019s shared-responsibility model does not back up your data. Not detectable via API.',
    recommendation: 'Deploy an independent daily backup with point-in-time restore (RCS managed offering).',
  });

  const users = await safe(g(token, '/users/$count', { ConsistencyLevel: 'eventual' }));
  return {
    org: { name: orgName, platform: 'Microsoft 365' },
    stats: { users: typeof users === 'number' ? users : (reg?.value?.length ?? 0), secureScore: latest?.currentScore ?? null, secureScoreMax: latest?.maxScore ?? null },
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
