// lib/dns.js
// Real DNS lookups for email-authentication posture (SPF, DMARC).
// DKIM can't be checked reliably without knowing the selector, so it is
// reported as 'unknown' (manual) by the scanners.
import { promises as dns } from 'node:dns';

async function txt(name) {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

export async function checkEmailAuth(domain) {
  const [root, dmarc] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)]);

  const spf = root.find((r) => r.toLowerCase().startsWith('v=spf1'));
  const dmarcRec = dmarc.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
  const policy = dmarcRec ? (dmarcRec.match(/\bp=([a-z]+)/i)?.[1] || 'none').toLowerCase() : null;

  return {
    domain,
    spf: {
      present: Boolean(spf),
      hardFail: Boolean(spf && /[~-]all\s*$/.test(spf.trim())),
      record: spf || null,
    },
    dmarc: {
      present: Boolean(dmarcRec),
      policy,                      // none | quarantine | reject
      enforced: policy === 'quarantine' || policy === 'reject',
      record: dmarcRec || null,
    },
  };
}
