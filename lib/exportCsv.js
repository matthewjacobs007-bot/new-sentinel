// lib/exportCsv.js — audit-ready CSV export mapped to CIS controls.
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function findingsToCsv(scan, accepted = new Set()) {
  const head = ['Module', 'Severity', 'CIS', 'Control', 'Status', 'Risk accepted', 'Detail', 'Recommended action', 'Fix link'];
  const rows = scan.findings.map((f) => [
    f.module, f.severity, f.cis, f.title, f.status,
    accepted.has(f.id) ? 'yes' : 'no', f.detail, f.recommendation, f.fixUrl,
  ].map(q).join(','));
  const meta = `# RCS Sentinel — ${scan.org.name} (${scan.org.platform}) — scanned ${scan.scannedAt}`;
  return [meta, head.map(q).join(','), ...rows].join('\r\n');
}
