// lib/render.js — login, CSPM dashboard, and error page.
import { scoreFindings, severityBreakdown } from './scoring2.js';

const SEV = { critical: '#b93733', high: '#f3a542', medium: '#3073b5', low: '#55b076' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const barColour = (p) => (p == null ? '#e3e6ea' : p >= 85 ? '#55b076' : p >= 70 ? '#3073b5' : p >= 50 ? '#f3a542' : '#b93733');

const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Lato:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--red:#b93733;--blue:#3073b5;--green:#55b076;--yellow:#f3a542;--dark:#1A1F24;--off:#F4F5F6;--line:#e3e6ea;--muted:#6b7480}
*{box-sizing:border-box}body{margin:0;font-family:Lato,Arial,sans-serif;color:#0a0a0a;background:var(--off)}
h1,h2,h3,.mont{font-family:Montserrat,Arial,sans-serif}a{color:var(--blue)}
.wrap{max-width:1040px;margin:0 auto;padding:26px 22px 70px}
.btn{display:inline-block;text-decoration:none;font-family:Montserrat;font-weight:600;font-size:13px;padding:8px 14px;border-radius:8px}
.btn.fix{background:var(--dark);color:#fff}.btn.ghost{border:1px solid var(--line);color:#0a0a0a;background:#fff}
</style>`;

export function loginPage(baseUrl) {
  return `<!doctype html>${HEAD}<title>RCS Sentinel</title><body><div class="wrap" style="max-width:540px;padding-top:8vh">
  <div style="background:var(--dark);color:#fff;border-radius:18px;padding:40px 38px;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:11px;margin-bottom:24px"><span style="background:var(--red);border-radius:10px;font-family:Montserrat;font-weight:700;padding:8px 13px;font-size:18px">RCS</span><span style="font-family:Montserrat;font-weight:600;letter-spacing:1px">SENTINEL</span></div>
    <h1 style="font-size:23px;margin:0 0 10px">Workspace security &amp; compliance audit</h1>
    <p style="color:#c5ccd4;margin:0 0 28px;line-height:1.6">Sign in with a client's <b>super administrator</b> account. Sentinel runs a read-only posture scan across identity, admin access, third-party apps and collaboration, and returns a scored, fixable report.</p>
    <a href="${baseUrl}/auth/google" style="display:block;background:#fff;color:#111;text-decoration:none;font-family:Montserrat;font-weight:600;padding:14px;border-radius:11px">Scan a Google Workspace domain</a>
  </div>
  <p style="text-align:center;color:var(--muted);font-size:12.5px;margin-top:18px">Read-only · no email, chat or file contents are ever accessed · Radical Cloud Solutions</p></div>`;
}

export function errorPage(msg) {
  return `<!doctype html>${HEAD}<title>Scan error</title><body><div class="wrap" style="max-width:560px;padding-top:8vh">
  <div style="background:#fff;border:1px solid var(--line);border-left:5px solid var(--red);border-radius:12px;padding:26px 28px">
  <h2 style="margin:0 0 8px;color:var(--red)">Scan could not complete</h2><p style="line-height:1.6">${esc(msg)}</p>
  <p style="color:var(--muted);font-size:13px">Usually a scope wasn't consented or the account isn't a super admin. Check the README, then <a href="/">try again</a>.</p></div></div>`;
}

function driftPanel(drift) {
  if (!drift || (!drift.regressions.length && !drift.fixes.length)) return '';
  const reg = drift.regressions.map((r) => `<li style="margin:4px 0"><span style="font-size:9px;font-weight:700;color:#fff;background:${SEV[r.severity]};padding:2px 6px;border-radius:4px">${r.severity.toUpperCase()}</span> ${esc(r.title)} <span style="color:var(--muted)">(${r.from} → ${r.to})</span></li>`).join('');
  const fix = drift.fixes.map((f) => `<li style="margin:4px 0;color:var(--green)">✓ ${esc(f.title)}</li>`).join('');
  const delta = drift.scoreDelta != null ? ` · score ${drift.scoreDelta >= 0 ? '+' : ''}${drift.scoreDelta}%` : '';
  return `<div style="background:#fff;border:1px solid var(--line);border-left:5px solid ${drift.regressions.length ? '#b93733' : '#55b076'};border-radius:12px;padding:16px 20px;margin-bottom:16px">
    <b class="mont" style="font-size:14px">Changes since last scan${esc(delta)}</b>
    ${drift.regressions.length ? `<div style="margin-top:8px;font-size:12.5px;color:var(--red);font-weight:700">Regressions (${drift.regressions.length})</div><ul style="margin:4px 0 0;padding-left:18px;font-size:13px">${reg}</ul>` : ''}
    ${drift.fixes.length ? `<div style="margin-top:8px;font-size:12.5px;color:var(--green);font-weight:700">Resolved (${drift.fixes.length})</div><ul style="margin:4px 0 0;padding-left:18px;font-size:13px">${fix}</ul>` : ''}
  </div>`;
}

export function dashboardPage(scan, accepted, baseUrl, history = [], drift = null) {
  const { pct, band, modules } = scoreFindings(scan.findings, accepted);
  const sev = severityBreakdown(scan.findings, accepted);
  const circ = 2 * Math.PI * 52;
  const date = new Date(scan.scannedAt).toLocaleString('en-ZA');
  const tenant = scan.org.name;

  const sevChip = (k) => `<div style="flex:1;text-align:center;background:#fff;border:1px solid var(--line);border-top:3px solid ${SEV[k]};border-radius:10px;padding:12px 8px"><div style="font-family:Montserrat;font-weight:700;font-size:24px">${sev[k] || 0}</div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">${k}</div></div>`;

  const moduleBlocks = modules.map((m) => {
    const items = m.items.map((f) => {
      const dot = f.accepted ? '#9aa3ad' : f.status === 'pass' ? SEV.low : f.status === 'partial' ? SEV.high : f.status === 'unknown' ? '#9aa3ad' : SEV.critical;
      const label = f.accepted ? 'RISK ACCEPTED' : f.status.toUpperCase();
      const actions = (f.status === 'fail' || f.status === 'partial' || f.status === 'unknown')
        ? `${f.fixUrl ? `<a class="btn fix" href="${esc(f.fixUrl)}" target="_blank" rel="noopener">Fix setting →</a>` : ''}
           ${f.accepted
             ? `<a class="btn ghost" href="${baseUrl}/unaccept?tenant=${encodeURIComponent(tenant)}&id=${encodeURIComponent(f.id)}">Un-accept</a>`
             : `<a class="btn ghost" href="${baseUrl}/accept?tenant=${encodeURIComponent(tenant)}&id=${encodeURIComponent(f.id)}">Accept risk</a>`}`
        : '';
      return `<div style="padding:14px 0;border-bottom:1px solid var(--off)">
        <div style="display:flex;align-items:center;gap:9px">
          <span style="width:9px;height:9px;border-radius:50%;background:${dot};flex:0 0 9px"></span>
          <span style="font-size:9px;font-weight:700;letter-spacing:.5px;color:#fff;background:${SEV[f.severity]};padding:2px 7px;border-radius:5px">${f.severity.toUpperCase()}</span>
          <b class="mont" style="font-size:14px;flex:1">${esc(f.title)}</b>
          <span style="font-size:11px;color:var(--muted)">${esc(f.cis)}</span>
          <span style="font-size:10px;font-weight:700;color:${dot}">${label}</span>
        </div>
        <div style="font-size:13px;color:#4a525c;margin:6px 0 0 18px">${esc(f.detail)}</div>
        <div style="font-size:12.5px;color:var(--muted);margin:4px 0 0 18px"><b style="color:var(--green)">Action:</b> ${esc(f.recommendation)}</div>
        ${actions ? `<div style="margin:10px 0 0 18px;display:flex;gap:8px;flex-wrap:wrap">${actions}</div>` : ''}
      </div>`;
    }).join('');
    return `<div style="background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:14px;overflow:hidden">
      <div style="padding:14px 20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line)">
        <h3 style="margin:0;font-size:15px;flex:1">${esc(m.name)}</h3>
        <div style="width:130px;height:7px;background:var(--off);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${m.pct == null ? 0 : m.pct}%;background:${barColour(m.pct)}"></i></div>
        <div style="font-family:Montserrat;font-weight:700;color:${barColour(m.pct)};width:46px;text-align:right">${m.pct == null ? 'N/A' : m.pct + '%'}</div>
      </div><div style="padding:6px 20px 12px">${items}</div></div>`;
  }).join('');

  const trend = history.length > 1
    ? `<span style="font-size:12.5px;color:var(--muted)">Previous: ${history[history.length - 2].score}% → now ${pct}%</span>` : '';

  return `<!doctype html>${HEAD}<title>${esc(tenant)} — Sentinel</title><body><div class="wrap">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <span style="background:var(--red);border-radius:9px;font-family:Montserrat;font-weight:700;padding:7px 11px;color:#fff">RCS</span>
      <div style="flex:1"><div style="font-family:Montserrat;font-weight:700;letter-spacing:.5px">SENTINEL</div><div style="font-size:12px;color:var(--muted)">${esc(tenant)} · ${esc(scan.org.platform)} · scanned ${esc(date)}</div></div>
      <a class="btn ghost" href="${baseUrl}/">All clients</a>
      <a class="btn fix" href="${baseUrl}/auth/google">Re-scan</a>
      <a class="btn ghost" href="${baseUrl}/export.csv?tenant=${encodeURIComponent(tenant)}">Export CSV</a>
      <a class="btn ghost" href="javascript:print()">Export PDF</a>
    </div>

    ${driftPanel(drift)}
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 22px;display:flex;align-items:center;gap:20px;flex:1;min-width:300px">
        <div style="position:relative;width:118px;height:118px;flex:0 0 118px"><svg width="118" height="118" viewBox="0 0 120 120" style="transform:rotate(-90deg)"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--off)" stroke-width="11"/><circle cx="60" cy="60" r="52" fill="none" stroke="${band.colour}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}"/></svg><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><b style="font-family:Montserrat;font-size:29px">${pct}%</b><span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">compliance</span></div></div>
        <div><h3 style="margin:0 0 6px">Compliance score</h3><span style="display:inline-block;font-family:Montserrat;font-weight:700;font-size:12px;padding:4px 12px;border-radius:20px;color:#fff;background:${band.colour}">${band.label}</span><div style="margin-top:10px;font-size:12.5px;color:var(--muted)">${scan.stats.active} active users · ${scan.stats.admins} admins · ${scan.stats.thirdPartyApps ?? 0} third-party apps</div>${trend}</div>
      </div>
      <div style="display:flex;gap:10px;flex:1;min-width:300px">${['critical', 'high', 'medium', 'low'].map(sevChip).join('')}</div>
    </div>

    ${moduleBlocks}
    <p style="text-align:center;color:var(--muted);font-size:12px;margin-top:16px">Radical Cloud Solutions · Trust · Security · Reliability · Quality · <a href="/">Scan another domain</a></p>
  </div>`;
}

// ── Team login gate ─────────────────────────────────────────
export function teamLoginPage(baseUrl, error = '') {
  return `<!doctype html>${HEAD}<title>RCS Sentinel — sign in</title><body><div class="wrap" style="max-width:400px;padding-top:12vh">
  <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:32px 30px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px"><span style="background:var(--red);border-radius:9px;font-family:Montserrat;font-weight:700;padding:6px 11px;color:#fff">RCS</span><span style="font-family:Montserrat;font-weight:700;letter-spacing:.5px">SENTINEL</span></div>
    <h2 style="margin:0 0 4px;font-size:19px">Team sign in</h2>
    <p style="color:var(--muted);font-size:13px;margin:0 0 18px">Internal access for the RCS back-end team.</p>
    ${error ? `<div style="background:#fdecec;color:#b93733;border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:14px">${esc(error)}</div>` : ''}
    <form method="post" action="${baseUrl}/login">
      <input name="user" placeholder="Username" autocomplete="username" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:11px 13px;margin-bottom:10px">
      <input name="pass" type="password" placeholder="Password" autocomplete="current-password" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:11px 13px;margin-bottom:16px">
      <button class="btn fix" style="width:100%;border:none;cursor:pointer;padding:12px" type="submit">Sign in</button>
    </form>
  </div></div>`;
}

// ── Organisation View: all client tenants on one dashboard ──
export function orgViewPage(tenants, baseUrl) {
  const rows = tenants.map((t) => {
    const c = barColour(t.latestScore);
    const b = t.latestScore >= 85 ? 'Strong' : t.latestScore >= 70 ? 'Moderate' : t.latestScore >= 50 ? 'At risk' : 'Critical';
    const when = t.lastScanAt ? new Date(t.lastScanAt).toLocaleDateString('en-ZA') : '—';
    return `<a href="${baseUrl}/tenant/${encodeURIComponent(t.domain)}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:16px;padding:16px 20px;border-bottom:1px solid var(--off)">
      <div style="flex:1"><div class="mont" style="font-weight:700;font-size:15px">${esc(t.name)}</div><div style="font-size:12px;color:var(--muted)">${esc(t.domain)} · ${esc(t.platform)} · last scan ${esc(when)}</div></div>
      <span style="font-size:11px;font-weight:700;color:#fff;background:${c};padding:3px 10px;border-radius:20px">${b}</span>
      <div style="width:120px;height:8px;background:var(--off);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${t.latestScore}%;background:${c}"></i></div>
      <div class="mont" style="font-weight:700;color:${c};width:46px;text-align:right">${t.latestScore}%</div>
    </a>`;
  }).join('');
  const avg = tenants.length ? Math.round(tenants.reduce((s, t) => s + (t.latestScore || 0), 0) / tenants.length) : 0;
  return `<!doctype html>${HEAD}<title>RCS Sentinel — clients</title><body><div class="wrap">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px">
      <span style="background:var(--red);border-radius:9px;font-family:Montserrat;font-weight:700;padding:7px 11px;color:#fff">RCS</span>
      <div style="flex:1"><div class="mont" style="font-weight:700;letter-spacing:.5px">SENTINEL</div><div style="font-size:12px;color:var(--muted)">Organisation view · ${tenants.length} client${tenants.length === 1 ? '' : 's'}${tenants.length ? ` · avg ${avg}%` : ''}</div></div>
      <a class="btn fix" href="${baseUrl}/auth/google">+ Link &amp; scan a tenant</a>
      <a class="btn ghost" href="${baseUrl}/logout">Sign out</a>
    </div>
    <div style="background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden">
      ${tenants.length ? rows : '<div style="padding:40px;text-align:center;color:var(--muted)">No clients linked yet. Click <b>+ Link &amp; scan a tenant</b> and sign in with a client super admin to run the first audit.</div>'}
    </div>
    <p style="text-align:center;color:var(--muted);font-size:12px;margin-top:16px">Radical Cloud Solutions · Trust · Security · Reliability · Quality</p>
  </div>`;
}
