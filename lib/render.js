// lib/render.js — Sentinel UI.
// Standalone product identity: deep indigo + electric cyan. Positioned as an
// MSP-oriented Google Workspace security posture platform.
import { scoreFindings, severityBreakdown } from './scoring2.js';

const SEV = { critical: '#f43f5e', high: '#f59e0b', medium: '#38bdf8', low: '#10b981' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const barColour = (p) => (p == null ? '#2a2f45' : p >= 85 ? '#10b981' : p >= 70 ? '#22d3ee' : p >= 50 ? '#f59e0b' : '#f43f5e');

// Inline SVG mark — a stylised shield / sentinel glyph in cyan on indigo
const MARK = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block">
  <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#818cf8"/></linearGradient></defs>
  <path d="M16 2 L28 7 V16 C28 22 22 27 16 30 C10 27 4 22 4 16 V7 Z" fill="url(#sg)" opacity="0.9"/>
  <path d="M16 9 L22 11.5 V16.5 C22 20 19 22.5 16 24 C13 22.5 10 20 10 16.5 V11.5 Z" fill="#0f1226"/>
  <circle cx="16" cy="16" r="2.5" fill="#22d3ee"/>
</svg>`;

const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0a0d1e;--bg2:#0f1330;--panel:#141838;--panel2:#1a1f45;
  --line:#242a55;--line2:#2f3766;
  --ink:#f1f2f8;--ink-dim:#a8adcc;--ink-mute:#6b7299;
  --cyan:#22d3ee;--cyan-d:#0891b2;--indigo:#818cf8;--indigo-d:#4f46e5;
  --pass:#10b981;--warn:#f59e0b;--info:#38bdf8;--danger:#f43f5e;
}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg);font-size:14.5px;line-height:1.55}
h1,h2,h3,.head{font-family:'Space Grotesk',Inter,sans-serif;letter-spacing:-0.01em}
a{color:var(--cyan);text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:26px 22px 70px}
.btn{display:inline-flex;align-items:center;gap:7px;text-decoration:none;font-family:'Space Grotesk';font-weight:600;font-size:13px;padding:9px 14px;border-radius:8px;transition:all .15s;cursor:pointer;border:none;font-family:inherit}
.btn.primary{background:linear-gradient(135deg,var(--cyan) 0%,var(--indigo) 100%);color:#0a0d1e}
.btn.primary:hover{filter:brightness(1.1)}
.btn.ghost{border:1px solid var(--line2);color:var(--ink);background:transparent}
.btn.ghost:hover{border-color:var(--cyan);color:var(--cyan)}
.btn.fix{background:var(--panel2);color:var(--ink);border:1px solid var(--line2)}
.btn.fix:hover{border-color:var(--cyan);background:var(--panel)}
.brand-mark{display:inline-flex;align-items:center;gap:10px}
.brand-mark .name{font-family:'Space Grotesk';font-weight:700;letter-spacing:0.02em;font-size:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px}
.muted{color:var(--ink-mute)}.dim{color:var(--ink-dim)}
::selection{background:var(--cyan);color:#0a0d1e}
input,button{font-family:inherit}
</style>`;

// ── Team login ──────────────────────────────────────────────
export function teamLoginPage(baseUrl, error = '') {
  return `<!doctype html>${HEAD}<title>Sentinel — sign in</title><body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(ellipse at top,rgba(129,140,248,.15),transparent 60%),radial-gradient(ellipse at bottom,rgba(34,211,238,.1),transparent 60%),var(--bg)">
    <div style="width:100%;max-width:400px">
      <div class="brand-mark" style="justify-content:center;margin-bottom:28px">${MARK}<span class="name" style="font-size:19px">Sentinel</span></div>
      <div class="card" style="padding:32px 30px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
        <h2 class="head" style="margin:0 0 6px;font-size:20px;font-weight:600">Sign in</h2>
        <p class="dim" style="font-size:13px;margin:0 0 22px">Google Workspace security posture for MSPs.</p>
        ${error ? `<div style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);color:#fda4af;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:16px">${esc(error)}</div>` : ''}
        <form method="post" action="${baseUrl}/login">
          <label class="dim" style="font-size:11.5px;font-weight:500;letter-spacing:.4px;text-transform:uppercase;display:block;margin-bottom:6px">Username</label>
          <input name="user" autocomplete="username" style="width:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:9px;padding:11px 13px;color:var(--ink);margin-bottom:14px;outline:none" onfocus="this.style.borderColor='var(--cyan)'" onblur="this.style.borderColor='var(--line2)'">
          <label class="dim" style="font-size:11.5px;font-weight:500;letter-spacing:.4px;text-transform:uppercase;display:block;margin-bottom:6px">Password</label>
          <input name="pass" type="password" autocomplete="current-password" style="width:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:9px;padding:11px 13px;color:var(--ink);margin-bottom:20px;outline:none" onfocus="this.style.borderColor='var(--cyan)'" onblur="this.style.borderColor='var(--line2)'">
          <button class="btn primary" style="width:100%;justify-content:center;padding:12px" type="submit">Sign in →</button>
        </form>
      </div>
      <p class="muted" style="text-align:center;font-size:11.5px;margin-top:18px;letter-spacing:.3px">Read-only · Configuration &amp; metadata only</p>
    </div>
  </div>`;
}

// ── Error page ──────────────────────────────────────────────
export function errorPage(msg) {
  return `<!doctype html>${HEAD}<title>Sentinel — error</title><body><div class="wrap" style="max-width:560px;padding-top:8vh">
    <div class="brand-mark" style="margin-bottom:24px">${MARK}<span class="name">Sentinel</span></div>
    <div class="card" style="padding:26px 28px;border-left:3px solid var(--danger)">
      <h2 class="head" style="margin:0 0 10px;color:var(--danger);font-size:18px">Scan could not complete</h2>
      <p style="line-height:1.7">${esc(msg)}</p>
      <p class="muted" style="font-size:13px;margin-top:16px">Usually a Google API scope wasn't consented, or the signed-in account isn't a super admin. <a href="/">Try again</a></p>
    </div></div>`;
}

// ── Legacy placeholder (login redirect target) ──────────────
export function loginPage(baseUrl) { return teamLoginPage(baseUrl); }

// ── Drift panel (shown at top of dashboard after re-scan) ───
function driftPanel(drift) {
  if (!drift || (!drift.regressions.length && !drift.fixes.length)) return '';
  const reg = drift.regressions.map((r) => `<li style="margin:5px 0;list-style:none;display:flex;align-items:center;gap:8px"><span style="font-size:9px;font-weight:700;color:#0a0d1e;background:${SEV[r.severity]};padding:2px 7px;border-radius:4px;letter-spacing:.4px">${r.severity.toUpperCase()}</span> ${esc(r.title)} <span class="muted" style="font-size:12px">(${r.from} → ${r.to})</span></li>`).join('');
  const fix = drift.fixes.map((f) => `<li style="margin:5px 0;list-style:none;color:var(--pass)">✓ ${esc(f.title)}</li>`).join('');
  const delta = drift.scoreDelta != null ? ` · ${drift.scoreDelta >= 0 ? '+' : ''}${drift.scoreDelta}%` : '';
  const hasRegressions = drift.regressions.length > 0;
  return `<div class="card" style="padding:18px 22px;margin-bottom:18px;border-left:3px solid ${hasRegressions ? 'var(--danger)' : 'var(--pass)'}">
    <div class="head" style="font-weight:600;font-size:14.5px;margin-bottom:4px">Changes since last scan${esc(delta)}</div>
    ${hasRegressions ? `<div style="margin-top:10px;font-size:12px;font-weight:600;color:var(--danger);text-transform:uppercase;letter-spacing:.5px">Regressions (${drift.regressions.length})</div><ul style="margin:6px 0 0;padding:0;font-size:13.5px">${reg}</ul>` : ''}
    ${drift.fixes.length ? `<div style="margin-top:12px;font-size:12px;font-weight:600;color:var(--pass);text-transform:uppercase;letter-spacing:.5px">Resolved (${drift.fixes.length})</div><ul style="margin:6px 0 0;padding:0;font-size:13.5px">${fix}</ul>` : ''}
  </div>`;
}

// ── Tenant dashboard ────────────────────────────────────────
export function dashboardPage(scan, accepted, baseUrl, history = [], drift = null) {
  const { pct, band, modules } = scoreFindings(scan.findings, accepted);
  const sev = severityBreakdown(scan.findings, accepted);
  const circ = 2 * Math.PI * 52;
  const date = new Date(scan.scannedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  const tenant = scan.org.name;

  const sevChip = (k) => `<div class="card" style="flex:1;text-align:center;padding:14px 8px;border-top:2px solid ${SEV[k]}"><div class="head" style="font-weight:700;font-size:26px;color:var(--ink)">${sev[k] || 0}</div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;margin-top:2px">${k}</div></div>`;

  const moduleBlocks = modules.map((m) => {
    const items = m.items.map((f) => {
      const statusColour = f.accepted ? 'var(--ink-mute)' : f.status === 'pass' ? 'var(--pass)' : f.status === 'partial' ? 'var(--warn)' : f.status === 'unknown' ? 'var(--info)' : 'var(--danger)';
      const label = f.accepted ? 'ACCEPTED' : f.status === 'unknown' ? 'REVIEW' : f.status.toUpperCase();
      const actions = (f.status === 'fail' || f.status === 'partial' || f.status === 'unknown')
        ? `${f.fixUrl ? `<a class="btn fix" href="${esc(f.fixUrl)}" target="_blank" rel="noopener">Fix in console →</a>` : ''}
           ${f.accepted
             ? `<a class="btn ghost" href="${baseUrl}/unaccept?tenant=${encodeURIComponent(tenant)}&id=${encodeURIComponent(f.id)}">Un-accept</a>`
             : `<a class="btn ghost" href="${baseUrl}/accept?tenant=${encodeURIComponent(tenant)}&id=${encodeURIComponent(f.id)}">Accept risk</a>`}`
        : '';
      return `<div style="padding:15px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <span style="width:8px;height:8px;border-radius:50%;background:${statusColour};flex:0 0 8px;margin-top:7px"></span>
          <span style="font-size:9px;font-weight:700;letter-spacing:.5px;color:#0a0d1e;background:${SEV[f.severity]};padding:3px 8px;border-radius:4px;margin-top:4px">${f.severity.toUpperCase()}</span>
          <div class="head" style="font-weight:600;font-size:14.5px;flex:1;min-width:200px">${esc(f.title)}</div>
          <span class="muted" style="font-size:11px;background:var(--bg2);padding:3px 8px;border-radius:5px;margin-top:2px">${esc(f.cis || 'CIS')}</span>
          <span style="font-size:10.5px;font-weight:700;color:${statusColour};margin-top:4px">${label}</span>
        </div>
        <div class="dim" style="font-size:13px;margin:8px 0 0 22px">${esc(f.detail)}</div>
        <div style="font-size:13px;margin:4px 0 0 22px"><span style="color:var(--cyan);font-weight:600">Action ›</span> <span class="dim">${esc(f.recommendation)}</span></div>
        ${actions ? `<div style="margin:12px 0 0 22px;display:flex;gap:8px;flex-wrap:wrap">${actions}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:14px;overflow:hidden">
      <div style="padding:14px 22px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--line)">
        <h3 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">${esc(m.name)}</h3>
        <div style="width:130px;height:6px;background:var(--bg2);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${m.pct == null ? 0 : m.pct}%;background:${barColour(m.pct)};transition:width .3s"></i></div>
        <div class="head" style="font-weight:700;color:${barColour(m.pct)};width:52px;text-align:right;font-size:14px">${m.pct == null ? 'N/A' : m.pct + '%'}</div>
      </div><div style="padding:4px 22px 12px">${items}</div></div>`;
  }).join('');

  const trend = history.length > 1
    ? `<div class="muted" style="font-size:12.5px;margin-top:6px">Previous scan: <b style="color:var(--ink-dim)">${history[history.length - 2].score}%</b> · now <b style="color:${band.colour}">${pct}%</b></div>` : '';

  return `<!doctype html>${HEAD}<title>${esc(tenant)} — Sentinel</title><body><div class="wrap">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;flex-wrap:wrap">
      <a href="${baseUrl}/" class="brand-mark" style="text-decoration:none;color:inherit">${MARK}<span class="name">Sentinel</span></a>
      <div style="flex:1;min-width:200px">
        <div class="head" style="font-weight:600;font-size:15px">${esc(tenant)}</div>
        <div class="muted" style="font-size:12px">${esc(scan.org.platform)} · scanned ${esc(date)}</div>
      </div>
      <a class="btn ghost" href="${baseUrl}/">All tenants</a>
      <a class="btn primary" href="${baseUrl}/auth/google">Re-scan</a>
      <a class="btn ghost" href="${baseUrl}/export.csv?tenant=${encodeURIComponent(tenant)}">Export CSV</a>
      <a class="btn ghost" href="javascript:print()">PDF</a>
    </div>

    ${driftPanel(drift)}

    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">
      <div class="card" style="padding:22px 26px;display:flex;align-items:center;gap:24px;flex:1;min-width:320px">
        <div style="position:relative;width:120px;height:120px;flex:0 0 120px">
          <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg2)" stroke-width="10"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="url(#scoreGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}"/>
            <defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${band.colour}" stop-opacity="0.7"/><stop offset="1" stop-color="${band.colour}"/></linearGradient></defs>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><b class="head" style="font-size:30px;font-weight:700">${pct}<span style="font-size:16px;color:var(--ink-mute)">%</span></b><span class="muted" style="font-size:9.5px;text-transform:uppercase;letter-spacing:.7px;margin-top:2px">Compliance</span></div>
        </div>
        <div>
          <h3 class="head" style="margin:0 0 8px;font-size:16px;font-weight:600">Compliance score</h3>
          <span style="display:inline-block;font-family:'Space Grotesk';font-weight:700;font-size:11.5px;padding:4px 12px;border-radius:20px;color:#0a0d1e;background:${band.colour};letter-spacing:.4px">${band.label.toUpperCase()}</span>
          <div class="muted" style="margin-top:12px;font-size:12.5px">${scan.stats.active || 0} active users · ${scan.stats.admins || 0} admins · ${scan.stats.thirdPartyApps ?? 0} third-party apps</div>
          ${trend}
        </div>
      </div>
      <div style="display:flex;gap:10px;flex:1;min-width:320px">${['critical', 'high', 'medium', 'low'].map(sevChip).join('')}</div>
    </div>

    ${moduleBlocks}
    <p class="muted" style="text-align:center;font-size:11.5px;margin-top:22px;letter-spacing:.3px">Sentinel · Read-only Google Workspace posture · <a href="/" style="color:var(--ink-mute)">Back to overview</a></p>
  </div>`;
}

// ── Organisation view: all tenants ──────────────────────────
export function orgViewPage(tenants, baseUrl) {
  const rows = tenants.map((t) => {
    const c = barColour(t.latestScore);
    const b = t.latestScore >= 85 ? 'STRONG' : t.latestScore >= 70 ? 'MODERATE' : t.latestScore >= 50 ? 'AT RISK' : 'CRITICAL';
    const when = t.lastScanAt ? new Date(t.lastScanAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—';
    return `<a href="${baseUrl}/tenant/${encodeURIComponent(t.domain)}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:18px;padding:18px 22px;border-bottom:1px solid var(--line);transition:background .12s" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
      <div style="flex:1;min-width:0">
        <div class="head" style="font-weight:600;font-size:15px">${esc(t.name)}</div>
        <div class="muted" style="font-size:12px;margin-top:2px">${esc(t.domain)} · ${esc(t.platform)} · scanned ${esc(when)}</div>
      </div>
      <span style="font-family:'Space Grotesk';font-size:10.5px;font-weight:700;color:#0a0d1e;background:${c};padding:3px 11px;border-radius:20px;letter-spacing:.5px">${b}</span>
      <div style="width:120px;height:6px;background:var(--bg2);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${t.latestScore}%;background:${c}"></i></div>
      <div class="head" style="font-weight:700;color:${c};width:52px;text-align:right;font-size:15px">${t.latestScore}%</div>
    </a>`;
  }).join('');
  const avg = tenants.length ? Math.round(tenants.reduce((s, t) => s + (t.latestScore || 0), 0) / tenants.length) : 0;
  const avgColour = barColour(avg);

  return `<!doctype html>${HEAD}<title>Sentinel — tenants</title><body><div class="wrap">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:26px">
      <div class="brand-mark">${MARK}<span class="name">Sentinel</span></div>
      <div style="flex:1"></div>
      <a class="btn primary" href="${baseUrl}/auth/google">+ Link tenant</a>
      <a class="btn ghost" href="${baseUrl}/logout">Sign out</a>
    </div>

    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:22px">
      <div class="card" style="padding:20px 24px;flex:1;min-width:220px">
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px">Tenants under management</div>
        <div class="head" style="font-size:32px;font-weight:700;margin-top:6px">${tenants.length}</div>
      </div>
      <div class="card" style="padding:20px 24px;flex:1;min-width:220px">
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px">Average posture</div>
        <div class="head" style="font-size:32px;font-weight:700;margin-top:6px;color:${avgColour}">${avg}<span style="font-size:18px;color:var(--ink-mute)">%</span></div>
      </div>
      <div class="card" style="padding:20px 24px;flex:1;min-width:220px">
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px">Last scan</div>
        <div class="head" style="font-size:16px;font-weight:600;margin-top:10px">${tenants[0]?.lastScanAt ? new Date(tenants[0].lastScanAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : '—'}</div>
      </div>
    </div>

    <div class="card" style="overflow:hidden">
      <div style="padding:16px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center">
        <h2 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">Client tenants</h2>
        <span class="muted" style="font-size:12px">${tenants.length} total</span>
      </div>
      ${tenants.length ? rows : `<div style="padding:56px 40px;text-align:center">
        <div style="opacity:.5;margin-bottom:16px">${MARK}</div>
        <div class="head" style="font-weight:600;font-size:15px;margin-bottom:6px">No tenants linked yet</div>
        <div class="dim" style="font-size:13px;max-width:380px;margin:0 auto 18px">Click <b style="color:var(--cyan)">+ Link tenant</b> and sign in with a client's Google Workspace super admin to run the first audit.</div>
      </div>`}
    </div>

    <p class="muted" style="text-align:center;font-size:11.5px;margin-top:22px;letter-spacing:.3px">Sentinel · Read-only · Configuration &amp; metadata only</p>
  </div>`;
}
