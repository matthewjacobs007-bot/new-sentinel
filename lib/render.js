// lib/render.js — Sentinel UI, Apple-inspired light theme.
// Design principles: near-white surfaces, hairline borders, generous whitespace,
// one restrained blue accent, considered typography (SF-inspired), soft shadows.
import { scoreFindings, severityBreakdown } from './scoring2.js';
import { FRAMEWORKS, frameworksFor } from './frameworks.js';

const SEV = { critical: '#d70015', high: '#c04c00', medium: '#0071e3', low: '#248a3d' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const barColour = (p) => (p == null ? '#e5e5ea' : p >= 85 ? '#248a3d' : p >= 70 ? '#0071e3' : p >= 50 ? '#c04c00' : '#d70015');

// Refined shield mark in the accent blue
const MARK = `<svg width="26" height="26" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block">
  <path d="M16 2 L28 7 V16 C28 22 22 27 16 30 C10 27 4 22 4 16 V7 Z" fill="#0071e3"/>
  <path d="M16 9 L22 11.5 V16.5 C22 20 19 22.5 16 24 C13 22.5 10 20 10 16.5 V11.5 Z" fill="#ffffff"/>
  <circle cx="16" cy="16" r="2" fill="#0071e3"/>
</svg>`;

const CATEGORIES = {
  overview:   { label: 'Overview',          icon: '◈', modules: null },
  identity:   { label: 'Identity & Access', icon: '⚿', modules: ['User & Admin Access', 'Account Hygiene'] },
  apps:       { label: 'Apps & Shadow IT',  icon: '⌬', modules: ['Risk Center (Shadow IT)', 'Application & API Access'] },
  data:       { label: 'Data & Sharing',    icon: '⊞', modules: ['Collaboration', 'Calendar & Sites'] },
  devices:    { label: 'Devices',           icon: '▢', modules: ['Endpoint & Device'] },
  email:      { label: 'Email Security',    icon: '✉', modules: ['Email Security'] },
  monitoring: { label: 'Monitoring',        icon: '◉', modules: ['Logging & Monitoring'] },
  backup:     { label: 'Backup',            icon: '⛃', modules: ['Backup & Continuity'] },
  devicesList:{ label: 'Device inventory',  icon: '▤', modules: null },
  shadowIt:   { label: 'Third-party apps',  icon: '⚙', modules: null },
};

const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  /* Surfaces */
  --bg:#fbfbfd;--bg-elev:#ffffff;--bg-inset:#f5f5f7;
  --panel:#ffffff;--panel-hover:#fafafa;
  /* Lines — hairline greys */
  --line:#e5e5e7;--line-2:#d2d2d7;
  /* Ink — high-contrast blacks, restrained greys */
  --ink:#1d1d1f;--ink-2:#3a3a3c;--ink-dim:#6e6e73;--ink-mute:#8e8e93;
  /* Accent — restrained system blue */
  --accent:#0071e3;--accent-hover:#0077ed;--accent-tint:#e8f2ff;
  /* Semantic */
  --pass:#248a3d;--warn:#c04c00;--info:#0071e3;--danger:#d70015;
  /* Shadow */
  --shadow-sm:0 1px 2px rgba(0,0,0,.04);
  --shadow-md:0 4px 12px rgba(0,0,0,.06);
  --shadow-lg:0 12px 32px rgba(0,0,0,.08);
  /* Radius */
  --r:12px;--r-sm:8px;--r-lg:18px;
}
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif;
  color:var(--ink);background:var(--bg);font-size:14px;line-height:1.5;letter-spacing:-0.005em}
h1,h2,h3,h4,.head{letter-spacing:-0.02em;font-weight:600}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}
input,button{font-family:inherit}
::selection{background:var(--accent-tint);color:var(--ink)}

.layout{display:flex;min-height:100vh}

/* Sidebar */
.sidebar{width:240px;flex:0 0 240px;background:var(--bg-inset);border-right:1px solid var(--line);
  padding:22px 0;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto}
.sidebar .brand{padding:0 22px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink)}
.sidebar .brand:hover{text-decoration:none}
.sidebar .brand .name{font-weight:600;letter-spacing:-0.015em;font-size:16px}
.sidebar .tenant{padding:16px 22px;border-bottom:1px solid var(--line)}
.sidebar .tenant .tname{font-weight:600;font-size:14px;color:var(--ink);letter-spacing:-0.01em}
.sidebar .tenant .tmeta{font-size:12px;color:var(--ink-mute);margin-top:3px}
.sidebar .nav{padding:12px 12px;flex:1;overflow-y:auto}
.sidebar .navlbl{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink-mute);
  font-weight:600;padding:14px 10px 6px}
.sidebar .navitem{display:flex;align-items:center;gap:11px;padding:8px 12px;border-radius:8px;
  color:var(--ink-2);text-decoration:none;font-size:13.5px;font-weight:500;transition:background .1s}
.sidebar .navitem:hover{background:rgba(0,0,0,.04);text-decoration:none}
.sidebar .navitem.active{background:var(--panel);color:var(--accent);box-shadow:var(--shadow-sm)}
.sidebar .navitem .ico{font-size:14px;width:16px;text-align:center;color:var(--ink-mute);flex:0 0 16px}
.sidebar .navitem.active .ico{color:var(--accent)}
.sidebar .navitem .badge{margin-left:auto;font-size:11px;background:rgba(0,0,0,.05);border-radius:20px;
  padding:1px 8px;color:var(--ink-dim);font-weight:600;min-width:22px;text-align:center}
.sidebar .navitem.active .badge{background:var(--accent);color:#fff}
.sidebar .footer{padding:14px 22px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-mute)}
.sidebar .footer a{color:var(--ink-dim)}

.main{flex:1;min-width:0;padding:32px 40px 80px;max-width:1080px}
.topbar{display:flex;align-items:center;gap:12px;margin-bottom:26px;flex-wrap:wrap}
.topbar h1{margin:0;font-size:26px;font-weight:600;letter-spacing:-0.02em}
.topbar .sub{font-size:13px;color:var(--ink-dim);margin-top:4px}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:500;font-size:13px;
  padding:7px 14px;border-radius:8px;transition:all .12s;cursor:pointer;border:1px solid transparent;line-height:1.2}
.btn.primary{background:var(--accent);color:#fff}
.btn.primary:hover{background:var(--accent-hover);text-decoration:none}
.btn.ghost{border-color:var(--line-2);color:var(--ink);background:var(--bg-elev)}
.btn.ghost:hover{background:var(--bg-inset);text-decoration:none}
.btn.fix{background:var(--ink);color:#fff}
.btn.fix:hover{background:var(--ink-2);text-decoration:none}

/* Cards */
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-sm)}
.card.elev{box-shadow:var(--shadow-md)}

.muted{color:var(--ink-mute)}.dim{color:var(--ink-dim)}

/* Filter bar */
.filterbar{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);
  padding:14px 18px;margin-bottom:16px;box-shadow:var(--shadow-sm)}
.filterbar .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.filterbar .row:last-child{margin-bottom:0}
.filterbar .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);
  font-weight:600;min-width:66px}
.chip{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;
  font-size:12.5px;font-weight:500;border:1px solid var(--line-2);background:var(--bg-elev);color:var(--ink-2);
  cursor:pointer;transition:all .12s;font-family:inherit;line-height:1.3}
.chip:hover{border-color:var(--ink-mute)}
.chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.chip .n{font-size:11px;opacity:.75;font-weight:600}
.chip .dot{width:7px;height:7px;border-radius:50%}
.chip[data-preset].on{background:var(--ink);border-color:var(--ink);color:#fff}
.searchbox{flex:1;min-width:160px;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:8px;
  padding:7px 12px;color:var(--ink);outline:none;font-size:13px;transition:border-color .12s}
.searchbox:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,113,227,.12)}
.summary{font-size:12.5px;color:var(--ink-dim)}.summary b{color:var(--ink);font-weight:600}
.hidden{display:none!important}
.no-results{padding:48px;text-align:center;color:var(--ink-mute);font-size:14px}

/* Framework tags */
.fw-tag{display:inline-block;font-size:10.5px;font-weight:500;padding:2px 8px;border-radius:4px;
  letter-spacing:.2px;margin-right:5px;background:var(--bg-inset);border:1px solid var(--line);color:var(--ink-dim)}

/* Tables */
.dtable{width:100%;border-collapse:collapse;font-size:13px}
.dtable th{text-align:left;padding:11px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;
  color:var(--ink-mute);font-weight:600;border-bottom:1px solid var(--line);background:var(--bg-inset)}
.dtable td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.dtable tr:hover td{background:var(--bg-inset)}
.dtable tr:last-child td{border-bottom:none}
.dtable .risky{color:var(--danger);font-weight:600}
.dtable .safe{color:var(--pass)}
.dtable .muted{color:var(--ink-mute);font-size:12.5px}
.details{background:var(--bg-inset);padding:12px 16px;border-radius:8px;margin-top:8px;
  font-size:12px;color:var(--ink-dim);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.expand{cursor:pointer;color:var(--accent);font-size:12.5px;font-weight:500;margin-top:4px;display:inline-block}
.expand:hover{text-decoration:underline}

@media(max-width:900px){.sidebar{position:fixed;left:0;top:0;transform:translateX(-100%);
  transition:transform .2s;z-index:50}.sidebar.open{transform:none}.main{padding:22px 20px}}
</style>`;

// ── Login page ──────────────────────────────────────────────
export function teamLoginPage(baseUrl, error = '') {
  return `<!doctype html>${HEAD}<title>Sentinel — sign in</title><body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg)">
    <div style="width:100%;max-width:380px">
      <div style="display:flex;align-items:center;gap:9px;justify-content:center;margin-bottom:32px">${MARK}<span class="head" style="font-weight:600;font-size:19px;letter-spacing:-0.015em">Sentinel</span></div>
      <div class="card elev" style="padding:36px 32px">
        <h2 class="head" style="margin:0 0 6px;font-size:22px">Sign in</h2>
        <p class="dim" style="font-size:14px;margin:0 0 26px;line-height:1.5">Google Workspace security posture for MSPs.</p>
        ${error ? `<div style="background:#fff1f2;border:1px solid #fecdd3;color:#9f1239;border-radius:8px;padding:10px 13px;font-size:13px;margin-bottom:16px">${esc(error)}</div>` : ''}
        <form method="post" action="${baseUrl}/login">
          <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Username</label>
          <input name="user" autocomplete="username" style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);margin-bottom:14px;outline:none;font-size:14px" onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 3px rgba(0,113,227,.12)'" onblur="this.style.borderColor='var(--line-2)';this.style.boxShadow='none'">
          <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Password</label>
          <input name="pass" type="password" autocomplete="current-password" style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);margin-bottom:22px;outline:none;font-size:14px" onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 3px rgba(0,113,227,.12)'" onblur="this.style.borderColor='var(--line-2)';this.style.boxShadow='none'">
          <button class="btn primary" style="width:100%;justify-content:center;padding:11px;font-size:14px" type="submit">Sign in</button>
        </form>
      </div>
      <p class="muted" style="text-align:center;font-size:12px;margin-top:20px">Read-only · Configuration and metadata only</p>
    </div>
  </div>`;
}
export function loginPage(baseUrl) { return teamLoginPage(baseUrl); }

export function errorPage(msg) {
  return `<!doctype html>${HEAD}<title>Sentinel — error</title><body><div style="max-width:560px;margin:8vh auto;padding:0 24px">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:28px">${MARK}<span class="head" style="font-weight:600;font-size:16px">Sentinel</span></div>
    <div class="card" style="padding:28px 32px;border-left:3px solid var(--danger)">
      <h2 class="head" style="margin:0 0 10px;color:var(--danger);font-size:20px">Scan could not complete</h2>
      <p style="line-height:1.65;color:var(--ink-2)">${esc(msg)}</p>
      <p class="muted" style="font-size:13px;margin-top:18px">Usually a Google API scope wasn't consented, or the signed-in account isn't a super admin. <a href="/">Try again</a></p>
    </div></div>`;
}

function sidebar(scan, activeCat, baseUrl, moduleCounts) {
  const tenant = scan.org.name;
  const encTenant = encodeURIComponent(tenant);
  const item = (cat) => {
    const c = CATEGORIES[cat];
    const isActive = cat === activeCat;
    const badge = moduleCounts[cat] != null && moduleCounts[cat] > 0 ? `<span class="badge">${moduleCounts[cat]}</span>` : '';
    return `<a class="navitem ${isActive ? 'active' : ''}" href="${baseUrl}/tenant/${encTenant}?cat=${cat}">
      <span class="ico">${c.icon}</span>${c.label}${badge}</a>`;
  };
  return `<aside class="sidebar">
    <a class="brand" href="${baseUrl}/">${MARK}<span class="name">Sentinel</span></a>
    <div class="tenant">
      <div class="tname">${esc(tenant)}</div>
      <div class="tmeta">${esc(scan.org.platform)}</div>
    </div>
    <nav class="nav">
      <div class="navlbl">Posture</div>
      ${item('overview')}${item('identity')}${item('apps')}${item('data')}${item('devices')}${item('email')}${item('monitoring')}${item('backup')}
      <div class="navlbl">Inventory</div>
      ${item('shadowIt')}${item('devicesList')}
    </nav>
    <div class="footer"><a href="${baseUrl}/">← All tenants</a></div>
  </aside>`;
}

function renderFinding(f, accepted, baseUrl, tenant) {
  const isAcc = accepted.has(f.id);
  const statusColour = isAcc ? 'var(--ink-mute)' : f.status === 'pass' ? 'var(--pass)' : f.status === 'partial' ? 'var(--warn)' : f.status === 'unknown' ? 'var(--info)' : 'var(--danger)';
  const label = isAcc ? 'Accepted' : f.status === 'unknown' ? 'Review' : f.status.charAt(0).toUpperCase() + f.status.slice(1);
  const statusKey = isAcc ? 'accepted' : f.status;
  const fw = frameworksFor(f.id);
  const fwTags = Object.entries(fw).filter(([, v]) => v).map(([k, v]) => `<span class="fw-tag">${esc(v)}</span>`).join('');
  const actions = (f.status === 'fail' || f.status === 'partial' || f.status === 'unknown')
    ? `${f.fixUrl ? `<a class="btn fix" href="${esc(f.fixUrl)}" target="_blank" rel="noopener">Fix in console →</a>` : ''}
       ${isAcc
         ? `<a class="btn ghost" href="${baseUrl}/unaccept?tenant=${encodeURIComponent(tenant)}&id=${encodeURIComponent(f.id)}">Un-accept</a>`
         : `<a class="btn ghost" href="${baseUrl}/accept?tenant=${encodeURIComponent(tenant)}&id=${encodeURIComponent(f.id)}">Accept risk</a>`}`
    : '';
  const frameworksAttr = Object.entries(fw).filter(([, v]) => v).map(([k]) => k).join(',');
  return `<div class="finding" data-status="${statusKey}" data-severity="${f.severity}" data-module="${esc(f.module)}" data-frameworks="${frameworksAttr}" data-text="${esc((f.title + ' ' + f.detail).toLowerCase())}" style="padding:18px 0;border-bottom:1px solid var(--line)">
    <div style="display:flex;align-items:flex-start;gap:11px;flex-wrap:wrap">
      <span style="width:8px;height:8px;border-radius:50%;background:${statusColour};flex:0 0 8px;margin-top:8px"></span>
      <span style="font-size:10px;font-weight:600;letter-spacing:.4px;color:#fff;background:${SEV[f.severity]};padding:3px 9px;border-radius:5px;margin-top:4px;text-transform:uppercase">${f.severity}</span>
      <div class="head" style="font-weight:600;font-size:14.5px;flex:1;min-width:200px;color:var(--ink)">${esc(f.title)}</div>
      <span style="font-size:12px;font-weight:600;color:${statusColour};margin-top:4px">${label}</span>
    </div>
    <div style="font-size:13.5px;margin:8px 0 0 24px;color:var(--ink-2);line-height:1.55">${esc(f.detail)}</div>
    <div style="font-size:13.5px;margin:6px 0 0 24px;color:var(--ink-dim);line-height:1.55"><span style="color:var(--accent);font-weight:500">Action ›</span> ${esc(f.recommendation)}</div>
    ${fwTags ? `<div style="margin:10px 0 0 24px">${fwTags}</div>` : ''}
    ${actions ? `<div style="margin:14px 0 0 24px;display:flex;gap:8px;flex-wrap:wrap">${actions}</div>` : ''}
  </div>`;
}

function filterBar(findings, accepted, showFramework = true) {
  const total = findings.length;
  const counts = {
    fail: findings.filter((f) => !accepted.has(f.id) && f.status === 'fail').length,
    partial: findings.filter((f) => !accepted.has(f.id) && f.status === 'partial').length,
    pass: findings.filter((f) => !accepted.has(f.id) && f.status === 'pass').length,
    unknown: findings.filter((f) => !accepted.has(f.id) && f.status === 'unknown').length,
    accepted: findings.filter((f) => accepted.has(f.id)).length,
  };
  const sev = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach((f) => { if (!accepted.has(f.id) && (f.status === 'fail' || f.status === 'partial')) sev[f.severity]++; });
  const statusChip = (key, label, colour) => `<button class="chip" data-filter="status" data-value="${key}" onclick="toggleFilter(this)"><span class="dot" style="background:${colour}"></span>${label} <span class="n">${counts[key]}</span></button>`;
  const sevChip = (key, colour) => `<button class="chip" data-filter="severity" data-value="${key}" onclick="toggleFilter(this)"><span class="dot" style="background:${colour}"></span>${key.charAt(0).toUpperCase() + key.slice(1)} <span class="n">${sev[key] || 0}</span></button>`;
  const fwChip = (key) => `<button class="chip" data-filter="framework" data-value="${key}" onclick="toggleFilter(this)">${FRAMEWORKS[key].name}</button>`;

  return `<div class="filterbar" id="filterbar">
    <div class="row">
      <span class="lbl">Presets</span>
      <button class="chip" data-preset="urgent" onclick="applyPreset(this,'urgent')">Critical &amp; high failures</button>
      <button class="chip" data-preset="quickwins" onclick="applyPreset(this,'quickwins')">Quick wins</button>
      <button class="chip" data-preset="review" onclick="applyPreset(this,'review')">Needs review</button>
      <div style="flex:1"></div>
      <input class="searchbox" id="searchBox" placeholder="Search…" oninput="applyFilters()">
    </div>
    <div class="row">
      <span class="lbl">Status</span>
      ${statusChip('fail', 'Failing', 'var(--danger)')}
      ${statusChip('partial', 'Partial', 'var(--warn)')}
      ${statusChip('unknown', 'Review', 'var(--info)')}
      ${statusChip('pass', 'Passing', 'var(--pass)')}
      ${statusChip('accepted', 'Accepted', 'var(--ink-mute)')}
    </div>
    <div class="row">
      <span class="lbl">Severity</span>
      ${sevChip('critical', SEV.critical)}
      ${sevChip('high', SEV.high)}
      ${sevChip('medium', SEV.medium)}
      ${sevChip('low', SEV.low)}
    </div>
    ${showFramework ? `<div class="row">
      <span class="lbl">Framework</span>
      ${Object.keys(FRAMEWORKS).map(fwChip).join('')}
    </div>` : ''}
    <div class="row" style="justify-content:space-between;padding-top:6px;border-top:1px solid var(--line);margin-top:4px">
      <span class="summary" id="summary">Showing <b>${total}</b> of <b>${total}</b></span>
      <button class="chip" onclick="clearFilters()" style="margin-left:auto">Clear all</button>
    </div>
  </div>`;
}

function filterScript() {
  return `<script>
    const active = { status: new Set(), severity: new Set(), module: new Set(), framework: new Set() };
    function toggleFilter(btn) {
      const f = btn.dataset.filter, v = btn.dataset.value;
      if (active[f].has(v)) { active[f].delete(v); btn.classList.remove('on'); }
      else { active[f].add(v); btn.classList.add('on'); }
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('on'));
      applyFilters();
    }
    function applyPreset(btn, kind) {
      clearFilters(true);
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      const set = (filter, values) => values.forEach(v => {
        active[filter].add(v);
        const chip = document.querySelector('.chip[data-filter="' + filter + '"][data-value="' + v + '"]');
        if (chip) chip.classList.add('on');
      });
      if (kind === 'urgent') { set('status', ['fail','partial']); set('severity', ['critical','high']); }
      else if (kind === 'quickwins') { set('status', ['fail','partial']); set('severity', ['low','medium']); }
      else if (kind === 'review') { set('status', ['unknown']); }
      applyFilters();
    }
    function clearFilters(skipRefresh) {
      Object.values(active).forEach(s => s.clear());
      document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
      const sb = document.getElementById('searchBox'); if (sb) sb.value = '';
      if (!skipRefresh) applyFilters();
    }
    function applyFilters() {
      const sb = document.getElementById('searchBox');
      const search = sb ? sb.value.trim().toLowerCase() : '';
      const findings = document.querySelectorAll('.finding');
      let shown = 0;
      findings.forEach(el => {
        const s = el.dataset.status, sv = el.dataset.severity, mo = el.dataset.module;
        const fw = (el.dataset.frameworks || '').split(',').filter(Boolean);
        const tx = el.dataset.text;
        let ok = true;
        if (active.status.size && !active.status.has(s)) ok = false;
        if (active.severity.size && !active.severity.has(sv)) ok = false;
        if (active.module.size && !active.module.has(mo)) ok = false;
        if (active.framework.size && !fw.some(f => active.framework.has(f))) ok = false;
        if (search && !tx.includes(search)) ok = false;
        el.classList.toggle('hidden', !ok);
        if (ok) shown++;
      });
      document.querySelectorAll('.module').forEach(m => {
        const visible = m.querySelectorAll('.finding:not(.hidden)').length;
        m.classList.toggle('hidden', visible === 0);
      });
      const total = findings.length;
      const sum = document.getElementById('summary');
      if (sum) sum.innerHTML = 'Showing <b>' + shown + '</b> of <b>' + total + '</b>';
      const nr = document.getElementById('noResults');
      if (nr) nr.classList.toggle('hidden', shown > 0);
    }
  </script>`;
}

function moduleBlock(m, accepted, baseUrl, tenant) {
  const items = m.items.map((f) => renderFinding(f, accepted, baseUrl, tenant)).join('');
  return `<div class="module card" data-module="${esc(m.name)}" style="margin-bottom:16px;overflow:hidden">
    <div style="padding:16px 22px;display:flex;align-items:center;gap:16px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">${esc(m.name)}</h3>
      <div style="width:140px;height:6px;background:var(--bg-inset);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${m.pct == null ? 0 : m.pct}%;background:${barColour(m.pct)};transition:width .3s"></i></div>
      <div class="head" style="font-weight:600;color:${barColour(m.pct)};width:54px;text-align:right;font-size:14px">${m.pct == null ? 'N/A' : m.pct + '%'}</div>
    </div><div style="padding:0 22px 8px">${items}</div></div>`;
}

function overviewContent(scan, pct, band, sev, modules, drift, history) {
  const circ = 2 * Math.PI * 52;
  const sevChip = (k) => `<div class="card" style="flex:1;text-align:center;padding:18px 12px"><div class="head" style="font-weight:600;font-size:28px;color:${SEV[k]};letter-spacing:-0.02em">${sev[k] || 0}</div><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;margin-top:4px;font-weight:600">${k}</div></div>`;
  const trend = history.length > 1
    ? `<div class="muted" style="font-size:12.5px;margin-top:8px">Previous scan: <b style="color:var(--ink-2)">${history[history.length - 2].score}%</b> → <b style="color:${band.colour}">${pct}%</b></div>` : '';
  const driftHtml = drift && (drift.regressions?.length || drift.fixes?.length)
    ? `<div class="card" style="padding:18px 22px;margin-bottom:18px;border-left:3px solid ${drift.regressions.length ? 'var(--danger)' : 'var(--pass)'}">
        <div class="head" style="font-weight:600;font-size:14.5px">Changes since last scan${drift.scoreDelta != null ? ` · ${drift.scoreDelta >= 0 ? '+' : ''}${drift.scoreDelta}%` : ''}</div>
        ${drift.regressions.length ? `<div style="margin-top:10px;font-size:11.5px;font-weight:600;color:var(--danger);text-transform:uppercase;letter-spacing:.4px">Regressions (${drift.regressions.length})</div><ul style="margin:6px 0 0;padding-left:20px;font-size:13.5px;color:var(--ink-2)">${drift.regressions.map((r) => `<li style="margin:3px 0">${esc(r.title)} <span class="muted">(${r.from} → ${r.to})</span></li>`).join('')}</ul>` : ''}
        ${drift.fixes.length ? `<div style="margin-top:10px;font-size:11.5px;font-weight:600;color:var(--pass);text-transform:uppercase;letter-spacing:.4px">Resolved (${drift.fixes.length})</div><ul style="margin:6px 0 0;padding-left:20px;font-size:13.5px;color:var(--ink-2)">${drift.fixes.map((f) => `<li style="margin:3px 0">${esc(f.title)}</li>`).join('')}</ul>` : ''}
      </div>` : '';

  return `${driftHtml}
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      <div class="card" style="padding:26px 28px;display:flex;align-items:center;gap:28px;flex:1;min-width:340px">
        <div style="position:relative;width:120px;height:120px;flex:0 0 120px">
          <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg-inset)" stroke-width="9"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="${band.colour}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <b class="head" style="font-size:32px;font-weight:600;letter-spacing:-0.03em">${pct}<span style="font-size:17px;color:var(--ink-mute);font-weight:500">%</span></b>
            <span class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;margin-top:2px;font-weight:600">Compliance</span>
          </div>
        </div>
        <div>
          <h3 class="head" style="margin:0 0 10px;font-size:16px;font-weight:600">Compliance score</h3>
          <span style="display:inline-block;font-weight:600;font-size:11.5px;padding:4px 12px;border-radius:20px;color:#fff;background:${band.colour};letter-spacing:.4px;text-transform:uppercase">${band.label}</span>
          <div class="muted" style="margin-top:14px;font-size:13px">${scan.stats.active || 0} active users · ${scan.stats.admins || 0} admins · ${scan.stats.thirdPartyApps ?? 0} third-party apps</div>
          ${trend}
        </div>
      </div>
      <div style="display:flex;gap:10px;flex:1;min-width:300px">${['critical', 'high', 'medium', 'low'].map(sevChip).join('')}</div>
    </div>

    <div class="card" style="padding:22px 26px">
      <h3 class="head" style="margin:0 0 16px;font-size:14.5px;font-weight:600">Posture by category</h3>
      ${modules.map((m) => `<div style="display:flex;align-items:center;gap:16px;padding:11px 0;border-bottom:1px solid var(--line)">
        <div class="head" style="font-weight:500;font-size:13.5px;flex:1;color:var(--ink)">${esc(m.name)}</div>
        <div class="muted" style="font-size:12px">${m.gaps} of ${m.total} to address</div>
        <div style="width:130px;height:5px;background:var(--bg-inset);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${m.pct == null ? 0 : m.pct}%;background:${barColour(m.pct)}"></i></div>
        <div class="head" style="font-weight:600;color:${barColour(m.pct)};width:48px;text-align:right;font-size:13.5px">${m.pct == null ? 'N/A' : m.pct + '%'}</div>
      </div>`).join('')}
    </div>`;
}

function shadowItPage(details) {
  const apps = details.thirdPartyApps || [];
  if (!apps.length) return `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">No third-party OAuth apps detected across scanned users, or the required scope wasn't consented.</div>`;
  const rows = apps.map((a) => {
    const risky = a.risky;
    const users = a.users.slice(0, 5).map(esc).join(', ') + (a.userCount > 5 ? ` and ${a.userCount - 5} more` : '');
    const scopeList = a.scopes.map((s) => esc(s.replace('https://www.googleapis.com/auth/', ''))).join(', ');
    return `<tr>
      <td>
        <div class="head" style="font-weight:600;font-size:14px">${esc(a.name)}</div>
        <div class="muted" style="font-size:11.5px;margin-top:2px">${esc(a.clientId || '')}</div>
      </td>
      <td class="${risky ? 'risky' : ''}" style="text-align:center">${risky ? 'High' : 'Standard'}</td>
      <td style="text-align:center">${a.userCount}</td>
      <td style="text-align:center">${a.scopeCount}</td>
      <td>
        <div>${users}</div>
        <div class="expand" onclick="this.nextElementSibling.classList.toggle('hidden')">Show scopes</div>
        <div class="details hidden">${scopeList}</div>
      </td>
    </tr>`;
  }).join('');
  return `<div class="card" style="overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0 0 4px;font-size:15px;font-weight:600">Third-party OAuth apps</h3>
      <p class="muted" style="margin:0;font-size:13px">Every app users have granted access to across the tenant. Apps marked <span class="risky">High</span> hold broad Drive or Gmail access.</p>
    </div>
    <table class="dtable"><thead><tr><th>Application</th><th style="text-align:center">Risk</th><th style="text-align:center">Users</th><th style="text-align:center">Scopes</th><th>Granted by</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

function deviceInventoryPage(details) {
  const mobile = details.mobileDevices || [];
  const chrome = details.chromeDevices || [];
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const mobileTable = mobile.length ? `<div class="card" style="overflow:hidden;margin-bottom:16px">
    <div style="padding:20px 24px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600">Mobile devices <span class="muted" style="font-size:12.5px;font-weight:400;margin-left:6px">${mobile.length}</span></h3>
    </div>
    <table class="dtable"><thead><tr><th>User</th><th>Model</th><th>Type</th><th>OS</th><th style="text-align:center">Status</th><th>Last sync</th></tr></thead><tbody>
      ${mobile.map((d) => `<tr><td>${esc(d.email)}</td><td>${esc(d.model)}</td><td class="muted">${esc(d.type || '')}</td><td class="muted">${esc(d.os || '')}</td><td style="text-align:center" class="${d.compromised ? 'risky' : 'safe'}">${d.compromised ? 'Compromised' : 'OK'}</td><td class="muted">${fmtDate(d.lastSync)}</td></tr>`).join('')}
    </tbody></table></div>` : '';

  const chromeTable = chrome.length ? `<div class="card" style="overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600">Chrome / ChromeOS devices <span class="muted" style="font-size:12.5px;font-weight:400;margin-left:6px">${chrome.length}</span></h3>
    </div>
    <table class="dtable"><thead><tr><th>Last user</th><th>Model</th><th>Serial</th><th style="text-align:center">Status</th><th>Last sync</th></tr></thead><tbody>
      ${chrome.map((d) => `<tr><td>${esc(d.lastUser)}</td><td>${esc(d.model)}</td><td class="muted">${esc(d.serial || '')}</td><td style="text-align:center">${esc(d.status || '')}</td><td class="muted">${fmtDate(d.lastSync)}</td></tr>`).join('')}
    </tbody></table></div>` : '';

  if (!mobile.length && !chrome.length) return `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">No devices found. Enrol devices in Google endpoint management, or grant the required scope, to populate this inventory.</div>`;
  return mobileTable + chromeTable;
}

export function dashboardPage(scan, accepted, baseUrl, history = [], drift = null, category = 'overview') {
  const { pct, band, modules } = scoreFindings(scan.findings, accepted);
  const sev = severityBreakdown(scan.findings, accepted);
  const date = new Date(scan.scannedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  const tenant = scan.org.name;

  const moduleCounts = { overview: null };
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (!cat.modules) continue;
    let n = 0;
    for (const m of modules) if (cat.modules.includes(m.name)) n += m.gaps;
    moduleCounts[key] = n;
  }
  moduleCounts.shadowIt = (scan.details?.thirdPartyApps || []).length || null;
  moduleCounts.devicesList = ((scan.details?.mobileDevices || []).length + (scan.details?.chromeDevices || []).length) || null;

  const cat = CATEGORIES[category] || CATEGORIES.overview;
  let title = cat.label, sub = `${scan.org.platform} · scanned ${date}`, content = '', showFilters = true;

  if (category === 'overview') {
    title = 'Overview';
    content = overviewContent(scan, pct, band, sev, modules, drift, history);
    showFilters = false;
  } else if (category === 'shadowIt') {
    title = 'Third-party OAuth apps';
    sub = 'Every application connected to a user in this tenant.';
    content = shadowItPage(scan.details || {});
    showFilters = false;
  } else if (category === 'devicesList') {
    title = 'Device inventory';
    sub = 'Mobile and Chrome devices enrolled to the tenant.';
    content = deviceInventoryPage(scan.details || {});
    showFilters = false;
  } else {
    const catModules = modules.filter((m) => cat.modules.includes(m.name));
    const catFindings = catModules.flatMap((m) => m.items);
    content = (catModules.length
      ? `${filterBar(catFindings, accepted, true)}${catModules.map((m) => moduleBlock(m, accepted, baseUrl, tenant)).join('')}<div class="no-results hidden" id="noResults">No findings match the current filters. <a href="#" onclick="clearFilters();return false">Clear filters</a></div>`
      : `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">No controls in this category yet.</div>`);
  }

  return `<!doctype html>${HEAD}<title>${esc(tenant)} — Sentinel</title><body>
  <div class="layout">
    ${sidebar(scan, category, baseUrl, moduleCounts)}
    <main class="main">
      <div class="topbar">
        <div style="flex:1"><h1 class="head">${esc(title)}</h1><div class="sub">${esc(sub)}</div></div>
        <a class="btn primary" href="${baseUrl}/auth/google">Re-scan</a>
        <a class="btn ghost" href="${baseUrl}/export.csv?tenant=${encodeURIComponent(tenant)}">CSV</a>
        <a class="btn ghost" href="javascript:print()">PDF</a>
      </div>
      ${content}
    </main>
  </div>
  ${showFilters ? filterScript() : ''}
</body>`;
}

export function orgViewPage(tenants, baseUrl) {
  const rows = tenants.map((t) => {
    const c = barColour(t.latestScore);
    const b = t.latestScore >= 85 ? 'Strong' : t.latestScore >= 70 ? 'Moderate' : t.latestScore >= 50 ? 'At risk' : 'Critical';
    const when = t.lastScanAt ? new Date(t.lastScanAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—';
    return `<a href="${baseUrl}/tenant/${encodeURIComponent(t.domain)}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:20px;padding:20px 24px;border-bottom:1px solid var(--line);transition:background .12s" onmouseover="this.style.background='var(--bg-inset)'" onmouseout="this.style.background='transparent'">
      <div style="flex:1;min-width:0">
        <div class="head" style="font-weight:600;font-size:15px;color:var(--ink)">${esc(t.name)}</div>
        <div class="muted" style="font-size:12.5px;margin-top:3px">${esc(t.domain)} · ${esc(t.platform)} · ${esc(when)}</div>
      </div>
      <span style="font-weight:600;font-size:11px;color:#fff;background:${c};padding:3px 11px;border-radius:20px;letter-spacing:.4px;text-transform:uppercase">${b}</span>
      <div style="width:130px;height:5px;background:var(--bg-inset);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${t.latestScore}%;background:${c}"></i></div>
      <div class="head" style="font-weight:600;color:${c};width:52px;text-align:right;font-size:15px">${t.latestScore}%</div>
    </a>`;
  }).join('');
  const avg = tenants.length ? Math.round(tenants.reduce((s, t) => s + (t.latestScore || 0), 0) / tenants.length) : 0;
  const avgColour = barColour(avg);

  return `<!doctype html>${HEAD}<title>Sentinel — tenants</title><body><div style="max-width:1080px;margin:0 auto;padding:32px 24px 80px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:30px">
      <div style="display:flex;align-items:center;gap:9px">${MARK}<span class="head" style="font-weight:600;font-size:17px;letter-spacing:-0.015em">Sentinel</span></div>
      <div style="flex:1"></div>
      <a class="btn primary" href="${baseUrl}/auth/google">Link tenant</a>
      <a class="btn ghost" href="${baseUrl}/logout">Sign out</a>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      <div class="card" style="padding:22px 26px;flex:1;min-width:220px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:600">Tenants under management</div><div class="head" style="font-size:34px;font-weight:600;margin-top:8px;letter-spacing:-0.03em">${tenants.length}</div></div>
      <div class="card" style="padding:22px 26px;flex:1;min-width:220px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:600">Average posture</div><div class="head" style="font-size:34px;font-weight:600;margin-top:8px;color:${avgColour};letter-spacing:-0.03em">${avg}<span style="font-size:19px;color:var(--ink-mute);font-weight:500">%</span></div></div>
      <div class="card" style="padding:22px 26px;flex:1;min-width:220px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:600">Last scan</div><div class="head" style="font-size:17px;font-weight:600;margin-top:12px">${tenants[0]?.lastScanAt ? new Date(tenants[0].lastScanAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : '—'}</div></div>
    </div>
    <div class="card" style="overflow:hidden">
      <div style="padding:18px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center">
        <h2 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">Client tenants</h2>
        <span class="muted" style="font-size:12.5px">${tenants.length} total</span>
      </div>
      ${tenants.length ? rows : `<div style="padding:64px 40px;text-align:center">
        <div style="opacity:.4;margin-bottom:18px;display:flex;justify-content:center">${MARK}</div>
        <div class="head" style="font-weight:600;font-size:16px;margin-bottom:8px">No tenants linked yet</div>
        <div class="dim" style="font-size:13.5px;max-width:400px;margin:0 auto 20px;line-height:1.55">Click <b style="color:var(--accent)">Link tenant</b> and sign in with a client's Google Workspace super admin to run the first audit.</div>
      </div>`}
    </div>
    <p class="muted" style="text-align:center;font-size:12px;margin-top:26px">Sentinel · Read-only · Configuration and metadata only</p>
  </div>`;
}
