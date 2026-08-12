// lib/exportCsv.js — audit-ready CSV export mapped to every supported framework.
import { frameworksFor } from './frameworks.js';

const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function findingsToCsv(scan, accepted = new Set()) {
  const head = ['Module', 'Severity', 'CIS', 'NIST 800-53', 'CISA SCuBA', 'Cyber Essentials',
    'SOC 2', 'ISO 27001', 'GDPR', 'POPIA', 'Control', 'Status', 'Risk accepted', 'Detail', 'Recommended action', 'Fix link'];
  const rows = scan.findings.map((f) => {
    const fw = frameworksFor(f.id);
    return [
      f.module, f.severity, f.cis, fw.nist, fw.scuba, fw.ce, fw.soc2, fw.iso27001, fw.gdpr, fw.popia,
      f.title, f.status, accepted.has(f.id) ? 'yes' : 'no', f.detail, f.recommendation, f.fixUrl,
    ].map(q).join(',');
  });
  const meta = `# Sentinel — ${scan.org.name} (${scan.org.platform}) — scanned ${scan.scannedAt}`;
  return [meta, head.map(q).join(','), ...rows].join('\r\n');
}
