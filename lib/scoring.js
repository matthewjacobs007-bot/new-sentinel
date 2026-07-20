// lib/scoring.js
// Turns raw findings from a scan into per-control results + weighted scores.
//
// A "finding" is produced by the platform scanners (googleScan / microsoftScan)
// as: { id, domain, severity, title, status, detail, recommendation }
//   status: 'pass' | 'partial' | 'fail' | 'unknown'
//     'unknown' = the API does not expose this setting; needs manual review.

export const SEV_WEIGHT = { critical: 10, high: 6, medium: 3, low: 1 };

const value = (status) => (status === 'pass' ? 1 : status === 'partial' ? 0.5 : 0);

export function scoreFindings(findings) {
  const domains = {};
  let earned = 0, possible = 0;

  for (const f of findings) {
    const w = SEV_WEIGHT[f.severity] ?? 1;
    domains[f.domain] ??= { name: f.domain, earned: 0, possible: 0, items: [] };
    domains[f.domain].items.push(f);

    // 'unknown' controls are excluded from the score (can't be measured),
    // but still surfaced in the report as "manual review required".
    if (f.status !== 'unknown') {
      earned += w * value(f.status);
      possible += w;
      domains[f.domain].earned += w * value(f.status);
      domains[f.domain].possible += w;
    }
  }

  const domainList = Object.values(domains).map((d) => ({
    name: d.name,
    pct: d.possible ? Math.round((d.earned / d.possible) * 100) : null,
    items: d.items,
    gaps: d.items.filter((i) => i.status === 'fail' || i.status === 'partial').length,
    total: d.items.length,
  }));

  const pct = possible ? Math.round((earned / possible) * 100) : 0;
  return { pct, band: bandFor(pct), domains: domainList };
}

export function bandFor(pct) {
  if (pct >= 85) return { label: 'Strong', colour: '#55b076' };
  if (pct >= 70) return { label: 'Moderate', colour: '#3073b5' };
  if (pct >= 50) return { label: 'At risk', colour: '#f3a542' };
  return { label: 'Critical', colour: '#b93733' };
}

// Prioritised remediation list: open gaps first (by severity), then unknowns.
export function remediation(findings) {
  const order = ['critical', 'high', 'medium', 'low'];
  const gaps = findings
    .filter((f) => f.status === 'fail' || f.status === 'partial')
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  const manual = findings.filter((f) => f.status === 'unknown');
  return { gaps, manual };
}
