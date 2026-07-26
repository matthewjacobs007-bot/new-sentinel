// lib/emailSecurity.js
// Deep email-security analysis via live DNS. All checks read-only.
//
// For each domain, produces a report card covering:
//   - SPF: parsed record, lookup count vs the 10-lookup limit, Google included?
//   - DMARC: policy, subdomain policy, alignment, pct, reporting addresses
//   - DKIM: probes common Google selectors, reports key length
//   - MX: are the MX records actually pointing at Google?
//   - MTA-STS + TLS-RPT: transport security posture
//   - BIMI: brand indicator record present?
//   - DNSSEC: is the domain signed?
//
// Output is an object with per-check status ('pass' | 'partial' | 'fail' | 'unknown')
// and a plain-text `detail` per check, so the UI just renders the report.

import { promises as dns } from 'node:dns';
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');

// ── Common Google Workspace DKIM selectors ──────────────────
// Google's default is 'google'. Some tenants use 'google2048' after
// upgrading to 2048-bit keys, or dated selectors after rotation.
const DKIM_SELECTORS = ['google', 'google2048', '20230601', '20230602', 'default', 'selector1', 'selector2'];

const txt = async (name) => {
  try {
    const rows = await dns.resolveTxt(name);
    return rows.map((chunks) => chunks.join(''));
  } catch { return []; }
};
const mx = async (name) => { try { return await dns.resolveMx(name); } catch { return []; } };

// SPF parsing: count DNS lookups (the classic gotcha — 10-lookup limit)
function parseSpf(record) {
  if (!record) return null;
  const mechanisms = record.trim().split(/\s+/);
  const lookups = mechanisms.filter((m) => /^(include|a|mx|ptr|exists|redirect=)/i.test(m)).length;
  const all = record.match(/([~\-+?])all\s*$/);
  const qualifier = all ? all[1] : null;
  const hasGoogle = /include:_spf\.google\.com/i.test(record);
  return {
    record,
    mechanisms,
    lookups,             // includes count against the 10-lookup limit
    exceedsLookups: lookups > 10,
    qualifier,           // '-' hard-fail, '~' soft-fail, '?' neutral, '+' pass, null missing
    hardFail: qualifier === '-',
    softFail: qualifier === '~',
    missingAll: !qualifier,
    hasGoogle,
  };
}

function parseDmarc(record) {
  if (!record) return null;
  const tags = {};
  record.split(';').forEach((part) => {
    const [k, v] = part.split('=').map((s) => s && s.trim());
    if (k && v) tags[k.toLowerCase()] = v;
  });
  const policy = (tags.p || 'none').toLowerCase();
  const subPolicy = (tags.sp || policy).toLowerCase();
  return {
    record,
    policy,
    subPolicy,
    pct: parseInt(tags.pct || '100', 10),
    adkim: tags.adkim || 'r',       // 'r' relaxed, 's' strict
    aspf: tags.aspf || 'r',
    rua: tags.rua || null,           // aggregate report address
    ruf: tags.ruf || null,           // forensic report address
    enforced: policy === 'quarantine' || policy === 'reject',
    reporting: Boolean(tags.rua),
  };
}

// Probe common DKIM selectors and return details of any that publish keys.
async function probeDkim(domain) {
  const found = [];
  for (const selector of DKIM_SELECTORS) {
    const records = await txt(`${selector}._domainkey.${domain}`);
    const rec = records.find((r) => /(^|;)\s*(v=DKIM1|p=)/i.test(r));
    if (!rec) continue;
    // Extract the public-key material and estimate its length in bits.
    // A base64-encoded 2048-bit RSA key runs ~370–380 characters; 1024-bit ~215.
    const pMatch = rec.match(/(?:^|[;\s])p=([A-Za-z0-9+/=]*)/);
    const keyLen = pMatch ? pMatch[1].length : 0;
    const bits = keyLen === 0 ? 0 : keyLen > 300 ? 2048 : keyLen > 150 ? 1024 : 512;
    const revoked = pMatch && pMatch[1].length === 0;
    found.push({ selector, record: rec, bits, revoked });
  }
  return found;
}

async function checkMx(domain) {
  const records = await mx(domain);
  if (!records.length) return { present: false };
  const google = records.filter((r) => /google|googlemail|aspmx/i.test(r.exchange));
  return {
    present: true,
    count: records.length,
    google: google.length > 0,
    allGoogle: google.length === records.length,
    records: records.sort((a, b) => a.priority - b.priority).map((r) => ({ priority: r.priority, exchange: r.exchange })),
  };
}

async function checkMtaSts(domain) {
  const records = await txt(`_mta-sts.${domain}`);
  const policy = records.find((r) => /^v=STSv1/i.test(r));
  return { present: Boolean(policy), record: policy || null };
}

async function checkTlsRpt(domain) {
  const records = await txt(`_smtp._tls.${domain}`);
  const policy = records.find((r) => /^v=TLSRPTv1/i.test(r));
  return { present: Boolean(policy), record: policy || null };
}

async function checkBimi(domain) {
  const records = await txt(`default._bimi.${domain}`);
  const rec = records.find((r) => /^v=BIMI1/i.test(r));
  return { present: Boolean(rec), record: rec || null };
}

// DNSSEC: is the zone signed? Node's DNS module doesn't validate the chain,
// but we can check for DNSKEY records at the apex — presence is a strong signal.
async function checkDnssec(domain) {
  try {
    // dns.resolve() doesn't have a DNSKEY type in Node, so we use resolveAny
    // and check for DNSKEY/RRSIG in the answers.
    const any = await dns.resolveAny(domain);
    const signed = any.some((r) => r.type === 'DNSKEY' || r.type === 'RRSIG');
    return { signed };
  } catch { return { signed: false, unknown: true }; }
}

// ── Public entry point ────────────────────────────────────────
export async function analyseEmailSecurity(domain) {
  const [rootTxt, dmarcTxt, mxData, mtaStsData, tlsRptData, bimiData, dnssec] = await Promise.all([
    txt(domain),
    txt(`_dmarc.${domain}`),
    checkMx(domain),
    checkMtaSts(domain),
    checkTlsRpt(domain),
    checkBimi(domain),
    checkDnssec(domain),
  ]);

  const spfRecord = rootTxt.find((r) => /^v=spf1/i.test(r));
  const dmarcRecord = dmarcTxt.find((r) => /^v=dmarc1/i.test(r));
  const spf = parseSpf(spfRecord);
  const dmarc = parseDmarc(dmarcRecord);
  const dkim = await probeDkim(domain);

  // Turn raw data into status'd checks the UI can render straight through.
  const checks = [];
  const add = (o) => checks.push(o);

  // SPF checks
  if (!spf) {
    add({ id: 'spf-present', label: 'SPF record published', status: 'fail',
      detail: 'No SPF record found. Anyone can spoof mail from this domain.',
      fix: 'Publish an SPF TXT record listing all authorised senders and ending in -all.' });
  } else {
    add({ id: 'spf-present', label: 'SPF record published', status: 'pass',
      detail: `Record found: ${spf.record}` });
    add({ id: 'spf-qualifier', label: 'SPF policy at hard-fail (-all)',
      status: spf.hardFail ? 'pass' : spf.softFail ? 'partial' : 'fail',
      detail: spf.hardFail ? 'Policy is -all (hard-fail).'
        : spf.softFail ? 'Policy is ~all (soft-fail). Mail from unauthorised sources may still be delivered — tighten to -all once monitoring is stable.'
        : `Policy is ${spf.qualifier || 'missing'}. Move to -all after verifying all senders.`,
      fix: 'Change the trailing mechanism to -all so unauthorised sources are rejected.' });
    add({ id: 'spf-lookups', label: 'SPF lookup count under 10',
      status: spf.lookups <= 8 ? 'pass' : spf.lookups <= 10 ? 'partial' : 'fail',
      detail: `${spf.lookups} DNS lookups used${spf.exceedsLookups ? ' — over the 10-lookup limit; SPF will fail permanently.' : spf.lookups > 8 ? ' — close to the 10-lookup limit.' : '.'}`,
      fix: 'Consolidate includes or use SPF flattening to stay under the 10-lookup limit.' });
    add({ id: 'spf-google', label: 'Google Workspace authorised (include:_spf.google.com)',
      status: spf.hasGoogle ? 'pass' : 'fail',
      detail: spf.hasGoogle ? 'Google is included as an authorised sender.' : 'SPF does not include Google — mail sent via Workspace will fail SPF checks.',
      fix: 'Add include:_spf.google.com to the SPF record.' });
  }

  // DMARC checks
  if (!dmarc) {
    add({ id: 'dmarc-present', label: 'DMARC record published', status: 'fail',
      detail: 'No DMARC record found. Spoofed mail cannot be quarantined or rejected based on SPF/DKIM alignment.',
      fix: 'Publish a _dmarc TXT record starting with v=DMARC1; p=none and monitor before tightening.' });
  } else {
    add({ id: 'dmarc-present', label: 'DMARC record published', status: 'pass',
      detail: `Record found: ${dmarc.record}` });
    add({ id: 'dmarc-policy', label: 'DMARC at enforcement (quarantine/reject)',
      status: dmarc.policy === 'reject' ? 'pass'
        : dmarc.policy === 'quarantine' ? 'partial'
        : 'fail',
      detail: `Policy p=${dmarc.policy}${dmarc.pct < 100 ? ` at ${dmarc.pct}% rollout` : ''}. ${dmarc.policy === 'none' ? 'p=none monitors only — spoofed mail is still delivered.' : dmarc.policy === 'quarantine' ? 'Quarantine sends failing mail to spam; consider progressing to reject.' : 'Reject blocks failing mail outright.'}`,
      fix: 'After a monitoring period, move DMARC to p=quarantine then p=reject.' });
    add({ id: 'dmarc-subdomain', label: 'Subdomain policy set',
      status: dmarc.subPolicy === 'reject' ? 'pass' : dmarc.subPolicy === 'quarantine' ? 'partial' : 'fail',
      detail: `Subdomain policy sp=${dmarc.subPolicy}. Without an enforcing subdomain policy, attackers can spoof from subdomains you don\u2019t use.`,
      fix: 'Set sp=reject (or at least sp=quarantine) to protect subdomains.' });
    add({ id: 'dmarc-reporting', label: 'DMARC aggregate reporting configured',
      status: dmarc.reporting ? 'pass' : 'fail',
      detail: dmarc.reporting ? `Aggregate reports go to ${dmarc.rua}.` : 'No rua= reporting address. You have no visibility into spoofing attempts.',
      fix: 'Add rua=mailto:dmarc-reports@yourdomain (or a monitoring service) to receive aggregate reports.' });
  }

  // DKIM checks — Google specifically
  if (dkim.length === 0) {
    add({ id: 'dkim-present', label: 'DKIM signing key published', status: 'fail',
      detail: 'No DKIM key found under common Google selectors (google, google2048, dated selectors). Mail from this domain is unsigned.',
      fix: 'Enable DKIM in Admin console → Apps → Google Workspace → Gmail → Authenticate email, then publish the generated record.' });
  } else {
    const bestKey = dkim.reduce((a, b) => (b.bits > a.bits ? b : a), { bits: 0 });
    const revokedOnly = dkim.every((k) => k.revoked);
    add({ id: 'dkim-present', label: 'DKIM signing key published',
      status: revokedOnly ? 'fail' : 'pass',
      detail: revokedOnly
        ? `${dkim.length} DKIM record(s) found but all appear revoked (empty public key).`
        : `${dkim.length} DKIM record(s) found. Best selector: ${bestKey.selector} (${bestKey.bits}-bit).` });
    if (!revokedOnly) {
      add({ id: 'dkim-strength', label: 'DKIM key at least 2048-bit',
        status: bestKey.bits >= 2048 ? 'pass' : bestKey.bits >= 1024 ? 'partial' : 'fail',
        detail: `Strongest key detected: ${bestKey.bits}-bit at selector "${bestKey.selector}".${bestKey.bits < 2048 ? ' 1024-bit keys are considered weak — rotate to 2048-bit.' : ''}`,
        fix: bestKey.bits < 2048 ? 'In Admin console, generate a new 2048-bit DKIM key and update DNS.' : undefined });
    }
  }

  // MX
  add({ id: 'mx-present', label: 'MX records published', status: mxData.present ? 'pass' : 'fail',
    detail: mxData.present ? `${mxData.count} MX record(s) published.` : 'No MX records found — this domain cannot receive mail.',
    fix: mxData.present ? undefined : 'Publish MX records pointing to your mail provider.' });
  if (mxData.present) {
    add({ id: 'mx-google', label: 'Mail routed via Google Workspace',
      status: mxData.allGoogle ? 'pass' : mxData.google ? 'partial' : 'fail',
      detail: mxData.allGoogle ? 'All MX records point to Google.'
        : mxData.google ? 'Mixed MX — some Google, some other providers. Verify this is intentional (e.g. mail gateway).'
        : 'MX records do not point to Google — mail routing may bypass Google entirely.',
      fix: 'Verify MX records match Google Workspace values (aspmx.l.google.com, etc.) unless a gateway is intentionally in front.' });
  }

  // Transport security
  add({ id: 'mta-sts', label: 'MTA-STS policy published',
    status: mtaStsData.present ? 'pass' : 'partial',
    detail: mtaStsData.present ? 'MTA-STS policy record found.' : 'No MTA-STS policy. Recommended for enforcing TLS on inbound mail.',
    fix: 'Publish an MTA-STS policy (a _mta-sts TXT record and a policy hosted at mta-sts.yourdomain).' });
  add({ id: 'tls-rpt', label: 'TLS-RPT reporting configured',
    status: tlsRptData.present ? 'pass' : 'partial',
    detail: tlsRptData.present ? 'TLS-RPT reporting is enabled.' : 'No TLS-RPT record. Enables reporting on failed TLS handshakes to inbound mail.',
    fix: 'Publish a _smtp._tls TXT record with a rua= address to receive TLS reports.' });

  // BIMI (nice-to-have)
  add({ id: 'bimi', label: 'BIMI brand indicator published',
    status: bimiData.present ? 'pass' : 'partial',
    detail: bimiData.present ? 'BIMI record found — Gmail can display a verified brand logo.' : 'No BIMI record. Optional; enables verified brand logo display in Gmail (requires DMARC at enforcement).',
    fix: 'Publish a default._bimi TXT record pointing at an SVG logo (requires DMARC p=quarantine or p=reject).' });

  // DNSSEC
  add({ id: 'dnssec', label: 'DNSSEC enabled', status: dnssec.signed ? 'pass' : 'partial',
    detail: dnssec.signed ? 'DNSSEC signatures detected on the zone.' : 'No DNSSEC signatures detected. Protects DNS answers from tampering.',
    fix: 'Enable DNSSEC at the registrar and publish DS records at the parent zone.' });

  // Overall email-security score for this domain — weighted the same way as
  // the tenant score, but scoped to email posture.
  const weights = { critical: 10, high: 6, medium: 3, low: 1 };
  const severities = {
    'spf-present': 'critical', 'spf-qualifier': 'high', 'spf-lookups': 'high', 'spf-google': 'critical',
    'dmarc-present': 'critical', 'dmarc-policy': 'high', 'dmarc-subdomain': 'medium', 'dmarc-reporting': 'medium',
    'dkim-present': 'critical', 'dkim-strength': 'high',
    'mx-present': 'critical', 'mx-google': 'medium',
    'mta-sts': 'medium', 'tls-rpt': 'low',
    'bimi': 'low', 'dnssec': 'medium',
  };
  let earned = 0, possible = 0;
  for (const c of checks) {
    const w = weights[severities[c.id] || 'medium'];
    possible += w;
    earned += w * (c.status === 'pass' ? 1 : c.status === 'partial' ? 0.5 : 0);
    c.severity = severities[c.id] || 'medium';
  }
  const pct = possible ? Math.round((earned / possible) * 100) : 0;

  return {
    domain,
    scannedAt: new Date().toISOString(),
    score: {
      pct,
      band: pct >= 85 ? 'Strong' : pct >= 70 ? 'Moderate' : pct >= 50 ? 'At risk' : 'Critical',
      colour: pct >= 85 ? '#248a3d' : pct >= 70 ? '#0071e3' : pct >= 50 ? '#c04c00' : '#d70015',
    },
    spf, dmarc, dkim, mx: mxData, mtaSts: mtaStsData, tlsRpt: tlsRptData, bimi: bimiData, dnssec,
    checks,
  };
}
