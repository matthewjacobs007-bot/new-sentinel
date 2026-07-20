// lib/scoring2.js — scoring for the CSPM findings model (module + severity + accept-risk).
export const SEV_WEIGHT = { critical: 10, high: 6, medium: 3, low: 1 };
const value = (s) => (s === 'pass' ? 1 : s === 'partial' ? 0.5 : 0);

export function scoreFindings(findings, accepted = new Set()) {
  const modules = {};
  let earned = 0, possible = 0;
  for (const f of findings) {
    const isAccepted = accepted.has(f.id);
    modules[f.module] ??= { name: f.module, earned: 0, possible: 0, items: [] };
    modules[f.module].items.push({ ...f, accepted: isAccepted });
    if (f.status === 'unknown' || isAccepted) continue;   // not measurable / risk accepted
    const w = SEV_WEIGHT[f.severity] ?? 1;
    earned += w * value(f.status); possible += w;
    modules[f.module].earned += w * value(f.status); modules[f.module].possible += w;
  }
  const moduleList = Object.values(modules).map((m) => ({
    name: m.name, pct: m.possible ? Math.round((m.earned / m.possible) * 100) : null,
    items: m.items, gaps: m.items.filter((i) => !i.accepted && (i.status === 'fail' || i.status === 'partial')).length, total: m.items.length,
  }));
  return { pct: possible ? Math.round((earned / possible) * 100) : 0, band: bandFor(possible ? Math.round((earned / possible) * 100) : 0), modules: moduleList };
}

export function bandFor(pct) {
  if (pct >= 85) return { label: 'Strong', colour: '#55b076' };
  if (pct >= 70) return { label: 'Moderate', colour: '#3073b5' };
  if (pct >= 50) return { label: 'At risk', colour: '#f3a542' };
  return { label: 'Critical', colour: '#b93733' };
}

export function severityBreakdown(findings, accepted = new Set()) {
  const b = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (accepted.has(f.id)) continue;
    if (f.status === 'fail' || f.status === 'partial') b[f.severity] = (b[f.severity] || 0) + 1;
  }
  return b;
}

export function remediation(findings, accepted = new Set()) {
  const order = ['critical', 'high', 'medium', 'low'];
  const gaps = findings.filter((f) => !accepted.has(f.id) && (f.status === 'fail' || f.status === 'partial'))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  const manual = findings.filter((f) => !accepted.has(f.id) && f.status === 'unknown');
  return { gaps, manual };
}
