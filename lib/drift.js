// lib/drift.js
// Compares two saved scans and reports configuration drift — the blueprint's
// "a secure setting changed to insecure" signal. Pure function, easy to test.
const rank = { pass: 3, partial: 2, unknown: 1, fail: 0 };

export function diffScans(prev, cur) {
  if (!prev) return { regressions: [], fixes: [], scoreDelta: null };
  const before = Object.fromEntries((prev.findings || []).map((f) => [f.id, f]));
  const regressions = [], fixes = [];
  for (const f of cur.findings || []) {
    const b = before[f.id];
    if (!b) continue;
    const from = rank[b.status] ?? 1, to = rank[f.status] ?? 1;
    if (to < from) regressions.push({ id: f.id, title: f.title, severity: f.severity, module: f.module, from: b.status, to: f.status });
    else if (to > from && (b.status === 'fail' || b.status === 'partial')) fixes.push({ id: f.id, title: f.title, module: f.module, from: b.status, to: f.status });
  }
  const order = ['critical', 'high', 'medium', 'low'];
  regressions.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return { regressions, fixes, scoreDelta: cur.score - prev.score };
}
