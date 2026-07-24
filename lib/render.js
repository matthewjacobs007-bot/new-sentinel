// lib/render.js — Sentinel UI with left sidebar navigation and category pages.
import { scoreFindings, severityBreakdown } from './scoring2.js';
import { FRAMEWORKS, frameworksFor, coveredBy } from './frameworks.js';

const SEV = { critical: '#f43f5e', high: '#f59e0b', medium: '#38bdf8', low: '#10b981' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const barColour = (p) => (p == null ? '#2a2f45' : p >= 85 ? '#10b981' : p >= 70 ? '#22d3ee' : p >= 50 ? '#f59e0b' : '#f43f5e');

const MARK = `<svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block">
  <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#818cf8"/></linearGradient></defs>
  <path d="M16 2 L28 7 V16 C28 22 22 27 16 30 C10 27 4 22 4 16 V7 Z" fill="url(#sg)" opacity="0.9"/>
  <path d="M16 9 L22 11.5 V16.5 C22 20 19 22.5 16 24 C13 22.5 10 20 10 16.5 V11.5 Z" fill="#0f1226"/>
  <circle cx="16" cy="16" r="2.5" fill="#22d3ee"/>
</svg>`;

// Category → module mapping (which findings show up under which nav item)
const CATEGORIES = {
  overview:   { label: 'Overview',          icon: '◈', modules: null }, // special: shows summary
  identity:   { label: 'Identity & Access', icon: '⚿', modules: ['User & Admin Access', 'Account Hygiene'] },
  apps:       { label: 'Apps & Shadow IT',  icon: '⌬', modules: ['Risk Center (Shadow IT)', 'Application & API Access'] },
  data:       { label: 'Data & Sharing',    icon: '⊞', modules: ['Collaboration', 'Calendar & Sites'] },
  devices:    { label: 'Devices',           icon: '▢', modules: ['Endpoint & Device'] },
  email:      { label: 'Email Security',    icon: '✉', modules: ['Email Security'] },
  monitoring: { label: 'Monitoring',        icon: '◉', modules: ['Logging & Monitoring'] },
  backup:     { label: 'Backup',            icon: '⛃', modules: ['Backup & Continuity'] },
  devicesList:{ label: 'Device inventory',  icon: '▤', modules: null }, // detail page
  shadowIt:   { label: 'Third-party apps',  icon: '⚙', modules: null }, // detail page
};

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
input,button{font-family:inherit}

.layout{display:flex;min-height:100vh}
.sidebar{width:240px;flex:0 0 240px;background:var(--bg2);border-right:1px solid var(--line);padding:20px 0;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto}
.sidebar .brand{padding:0 20px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink)}
.sidebar .brand .name{font-family:'Space Grotesk';font-weight:700;letter-spacing:0.02em;font-size:16px}
.sidebar .tenant{padding:16px 20px;border-bottom:1px solid var(--line)}
.sidebar .tenant .tname{font-family:'Space Grotesk';font-weight:600;font-size:14px;color:var(--ink)}
.sidebar .tenant .tmeta{font-size:11px;color:var(--ink-mute);margin-top:2px}
.sidebar .nav{padding:12px 12px;flex:1;overflow-y:auto}
.sidebar .navlbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--ink-mute);font-weight:600;padding:12px 10px 6px}
.sidebar .navitem{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:var(--ink-dim);text-decoration:none;font-size:13.5px;font-family:'Space Grotesk';font-weight:500;transition:all .12s;position:relative}
.sidebar .navitem:hover{background:var(--panel);color:var(--ink)}
.sidebar .navitem.active{background:linear-gradient(135deg,rgba(34,211,238,.12),rgba(129,140,248,.12));color:var(--cyan);border-left:2px solid var(--cyan);padding-left:10px}
.sidebar .navitem .ico{font-size:15px;width:18px;text-align:center;color:var(--ink-mute)}
.sidebar .navitem.active .ico{color:var(--cyan)}
.sidebar .navitem .badge{margin-left:auto;font-size:10.5px;background:var(--panel);border-radius:20px;padding:2px 8px;color:var(--ink-mute)}
.sidebar .navitem.active .badge{background:var(--cyan);color:#0a0d1e;font-weight:600}
.sidebar .footer{padding:16px 20px;border-top:1px solid var(--line);font-size:11px;color:var(--ink-mute)}
.sidebar .footer a{color:var(--ink-mute)}

.main{flex:1;min-width:0;padding:26px 32px 60px;max-width:1000px}
.topbar{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.topbar h1{margin:0;font-size:22px;font-weight:600}
.topbar .sub{font-size:12.5px;color:var(--ink-mute);margin-top:2px}

.btn{display:inline-flex;align-items:center;gap:7px;text-decoration:none;font-family:'Space Grotesk';font-weight:600;font-size:12.5px;padding:8px 13px;border-radius:8px;transition:all .15s;cursor:pointer;border:none}
.btn.primary{background:linear-gradient(135deg,var(--cyan) 0%,var(--indigo) 100%);color:#0a0d1e}
.btn.primary:hover{filter:brightness(1.1)}
.btn.ghost{border:1px solid var(--line2);color:var(--ink);background:transparent}
.btn.ghost:hover{border-color:var(--cyan);color:var(--cyan)}
.btn.fix{background:var(--panel2);color:var(--ink);border:1px solid var(--line2)}
.btn.fix:hover{border-color:var(--cyan);background:var(--panel)}

.card{background:var(--panel);border:1px solid var(--line);border-radius:14px}
.muted{color:var(--ink-mute)}.dim{color:var(--ink-dim)}
::selection{background:var(--cyan);color:#0a0d1e}

/* Filter bar */
.filterbar{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:14px}
.filterbar .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px}
.filterbar .row:last-child{margin-bottom:0}
.filterbar .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink-mute);font-weight:600;min-width:64px}
.chip{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:20px;font-size:12px;font-weight:500;border:1px solid var(--line2);background:transparent;color:var(--ink-dim);cursor:pointer;transition:all .12s;font-family:inherit}
.chip:hover{border-color:var(--cyan);color:var(--ink)}
.chip.on{background:var(--cyan);border-color:var(--cyan);color:#0a0d1e;font-weight:600}
.chip .n{font-size:10.5px;opacity:.7}
.chip .dot{width:7px;height:7px;border-radius:50%}
.chip[data-preset].on{background:linear-gradient(135deg,var(--cyan),var(--indigo));border-color:transparent;color:#0a0d1e}
.searchbox{flex:1;min-width:160px;background:var(--bg2);border:1px solid var(--line2);border-radius:8px;padding:7px 12px;color:var(--ink);outline:none;font-size:13px}
.searchbox:focus{border-color:var(--cyan)}
.summary{font-size:12px;color:var(--ink-dim)}.summary b{color:var(--cyan);font-weight:600}
.hidden{display:none!important}
.no-results{padding:40px;text-align:center;color:var(--ink-mute);font-size:13px}

/* Framework tags on findings */
.fw-tag{display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;letter-spacing:.3px;margin-right:4px;background:var(--bg2);border:1px solid var(--line2);color:var(--ink-dim)}
.fw-tag.cis{border-color:rgba(34,211,238,.4);color:#7dd3fc}
.fw-tag.nist{border-color:rgba(129,140,248,.4);color:#a5b4fc}
.fw-tag.scuba{border-color:rgba(245,158,11,.4);color:#fcd34d}
.fw-tag.ce{border-color:rgba(16,185,129,.4);color:#6ee7b7}

/* Detail tables */
.dtable{width:100%;border-collapse:collapse;font-size:13px}
.dtable th{text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink-mute);font-weight:600;border-bottom:1px solid var(--line);background:var(--bg2)}
.dtable td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.dtable tr:hover td{background:var(--panel2)}
.dtable .risky{color:var(--danger);font-weight:600}
.dtable .safe{color:var(--pass)}
.dtable .muted{color:var(--ink-mute);font-size:12px}
.details{background:var(--bg2);padding:12px 16px;border-radius:8px;margin-top:6px;font-size:12.5px;color:var(--ink-dim)}
.details ul{margin:6px 0 0;padding-left:20px}
.expand{cursor:pointer;color:var(--cyan);font-size:12px}

@media(max-width:900px){.sidebar{position:fixed;left:0;top:0;transform:translateX(-100%);transition:transform .2s;z-index:50}.sidebar.open{transform:none}.main{padding:20px 18px}}
</style>`;

// ── Login page ──────────────────────────────────────────────
export function teamLoginPage(baseUrl, error = '') {
  return `<!doctype html>${HEAD}<title>Sentinel — sign in</title><body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(ellipse at top,rgba(129,140,248,.15),transparent 60%),radial-gradient(ellipse at bottom,rgba(34,211,238,.1),transparent 60%),var(--bg)">
    <div style="width:100%;max-width:400px">
      <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:28px">${MARK}<span class="head" style="font-family:'Space Grotesk';font-weight:700;font-size:19px">Sentinel</span></div>
      <div class="card" style="padding:32px 30px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
        <h2 class="head" style="margin:0 0 6px;font-size:20px;font-weight:600">Sign in</h2>
        <p class="dim" style="font-size:13px;margin:0 0 22px">Google Workspace security posture for MSPs.</p>
        ${error ? `<div style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);color:#fda4af;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:16px">${esc(error)}</div>` : ''}
        <form method="post" action="${baseUrl}/login">
          <label class="dim" style="font-size:11.5px;font-weight:500;letter-spacing:.4px;text-transform:uppercase;display:block;margin-bottom:6px">Username</label>
          <input name="user" autocomplete="username" style="width:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:9px;padding:11px 13px;color:var(--ink);margin-bottom:14px;outline:none">
          <label class="dim" style="font-size:11.5px;font-weight:500;letter-spacing:.4px;text-transform:uppercase;display:block;margin-bottom:6px">Password</label>
          <input name="pass" type="password" autocomplete="current-password" style="width:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:9px;padding:11px 13px;color:var(--ink);margin-bottom:20px;outline:none">
          <button class="btn primary" style="width:100%;justify-content:center;padding:12px" type="submit">Sign in →</button>
        </form>
      </div>
      <p class="muted" style="text-align:center;font-size:11.5px;margin-top:18px;letter-spacing:.3px">Read-only · Configuration &amp; metadata only</p>
    </div>
  </div>`;
}
export function loginPage(baseUrl) { return teamLoginPage(baseUrl); }

export function errorPage(msg) {
  return `<!doctype html>${HEAD}<title>Sentinel — error</title><body><div style="max-width:560px;margin:8vh auto;padding:0 22px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">${MARK}<span class="head" style="font-family:'Space Grotesk';font-weight:700;font-size:16px">Sentinel</span></div>
    <div class="card" style="padding:26px 28px;border-left:3px solid var(--danger)">
      <h2 class="head" style="margin:0 0 10px;color:var(--danger);font-size:18px">Scan could not complete</h2>
      <p style="line-height:1.7">${esc(msg)}</p>
      <p class="muted" style="font-size:13px;margin-top:16px">Usually a Google API scope wasn't consented, or the signed-in account isn't a super admin. <a href="/">Try again</a></p>
    </div></div>`;
}

// ── Sidebar ─────────────────────────────────────────────────
function sidebar(scan, activeCat, baseUrl, moduleCounts) {
  const tenant = scan.org.name;
  const encTenant = encodeURIComponent(tenant);
  const item = (cat, extra = '') => {
    const c = CATEGORIES[cat];
    const isActive = cat === activeCat;
    const badge = moduleCounts[cat] != null ? `<span class="badge">${moduleCounts[cat]}</span>` : '';
    return `<a class="navitem ${isActive ? 'active' : ''}" href="${baseUrl}/tenant/${encTenant}?cat=${cat}${extra}">
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
      ${item('overview')}
      ${item('identity')}
      ${item('apps')}
      ${item('data')}
      ${item('devices')}
      ${item('email')}
      ${item('monitoring')}
      ${item('backup')}
      <div class="navlbl">Inventory</div>
      ${item('shadowIt')}
      ${item('devicesList')}
    </nav>
    <div class="footer">
      <a href="${baseUrl}/">← All tenants</a>
    </div>
  </aside>`;
}

// ── Finding row ────────────────────────────────────────────
function renderFinding(f, accepted, baseUrl, tenant) {
  const isAcc = accepted.has(f.id);
  const statusColour = isAcc ? 'var(--ink-mute)' : f.status === 'pass' ? 'var(--pass)' : f.status === 'partial' ? 'var(--warn)' : f.status === 'unknown' ? 'var(--info)' : 'var(--danger)';
  const label = isAcc ? 'ACCEPTED' : f.status === 'unknown' ? 'REVIEW' : f.status.toUpperCase();
  const statusKey = isAcc ? 'accepted' : f.status;
  const fw = frameworksFor(f.id);
  const fwTags = Object.entries(fw).filter(([, v]) => v).map(([k, v]) => `<span class="fw-tag ${k}">${esc(v)}</span>`).join('');
  const actions = (f.status === 'fail' || f.status === 'partial' || f.status === 'unknown')
    ? `${f.fixUrl ? `<a class="btn fix" href="${esc(f.fixUrl)}" target="_blank" rel="noopener">Fix in console →</a>` : ''}
       ${isAcc
         ? `<a class="btn ghost" href="${baseUrl}/unaccept?tenant=${encodeURIComponent(tenant)}&id=${encodeURIComponent(f.id)}">Un-accept</a>`
         : `<a class="btn ghost" href="${baseUrl}/accept?tenant=${encodeURIComponent(tenant)}&id=${encodeURIComponent(f.id)}">Accept risk</a>`}`
    : '';
  const frameworksAttr = Object.entries(fw).filter(([, v]) => v).map(([k]) => k).join(',');
  return `<div class="finding" data-status="${statusKey}" data-severity="${f.severity}" data-module="${esc(f.module)}" data-frameworks="${frameworksAttr}" data-text="${esc((f.title + ' ' + f.detail).toLowerCase())}" style="padding:15px 0;border-bottom:1px solid var(--line)">
    <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <span style="width:8px;height:8px;border-radius:50%;background:${statusColour};flex:0 0 8px;margin-top:7px"></span>
      <span style="font-size:9px;font-weight:700;letter-spacing:.5px;color:#0a0d1e;background:${SEV[f.severity]};padding:3px 8px;border-radius:4px;margin-top:4px">${f.severity.toUpperCase()}</span>
      <div class="head" style="font-weight:600;font-size:14.5px;flex:1;min-width:200px">${esc(f.title)}</div>
      <span style="font-size:10.5px;font-weight:700;color:${statusColour};margin-top:4px">${label}</span>
    </div>
    <div class="dim" style="font-size:13px;margin:8px 0 0 22px">${esc(f.detail)}</div>
    <div style="font-size:13px;margin:4px 0 0 22px"><span style="color:var(--cyan);font-weight:600">Action ›</span> <span class="dim">${esc(f.recommendation)}</span></div>
    ${fwTags ? `<div style="margin:8px 0 0 22px">${fwTags}</div>` : ''}
    ${actions ? `<div style="margin:12px 0 0 22px;display:flex;gap:8px;flex-wrap:wrap">${actions}</div>` : ''}
  </div>`;
}

// ── Filter bar ─────────────────────────────────────────────
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
  const fwChip = (key) => `<button class="chip" data-filter="framework" data-value="${key}" onclick="toggleFilter(this)"><span class="fw-tag ${key}" style="margin:0">${FRAMEWORKS[key].name}</span></button>`;

  return `<div class="filterbar" id="filterbar">
    <div class="row">
      <span class="lbl">Presets</span>
      <button class="chip" data-preset="urgent" onclick="applyPreset(this,'urgent')">🎯 Critical &amp; high failures</button>
      <button class="chip" data-preset="quickwins" onclick="applyPreset(this,'quickwins')">⚡ Quick wins</button>
      <button class="chip" data-preset="review" onclick="applyPreset(this,'review')">👁 Needs review</button>
      <div style="flex:1"></div>
      <input class="searchbox" id="searchBox" placeholder="Search findings…" oninput="applyFilters()">
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
      <span class="muted" style="font-size:11px;margin-left:6px">Only show controls covered by the selected framework(s)</span>
    </div>` : ''}
    <div class="row" style="justify-content:space-between">
      <span class="summary" id="summary">Showing <b>${total}</b> of <b>${total}</b> findings</span>
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
      if (sum) sum.innerHTML = 'Showing <b>' + shown + '</b> of <b>' + total + '</b> findings';
      const nr = document.getElementById('noResults');
      if (nr) nr.classList.toggle('hidden', shown > 0);
    }
  </script>`;
}

// ── Module block for category pages ─────────────────────────
function moduleBlock(m, accepted, baseUrl, tenant) {
  const items = m.items.map((f) => renderFinding(f, accepted, baseUrl, tenant)).join('');
  return `<div class="module" data-module="${esc(m.name)}" style="margin-bottom:14px;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:14px">
    <div style="padding:14px 22px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">${esc(m.name)}</h3>
      <div style="width:130px;height:6px;background:var(--bg2);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${m.pct == null ? 0 : m.pct}%;background:${barColour(m.pct)};transition:width .3s"></i></div>
      <div class="head" style="font-weight:700;color:${barColour(m.pct)};width:52px;text-align:right;font-size:14px">${m.pct == null ? 'N/A' : m.pct + '%'}</div>
    </div><div style="padding:4px 22px 12px">${items}</div></div>`;
}

// ── Overview page (compliance score, severity chips, drift) ─
function overviewContent(scan, pct, band, sev, modules, drift, history) {
  const circ = 2 * Math.PI * 52;
  const sevChip = (k) => `<div class="card" style="flex:1;text-align:center;padding:14px 8px;border-top:2px solid ${SEV[k]}"><div class="head" style="font-weight:700;font-size:26px;color:var(--ink)">${sev[k] || 0}</div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;margin-top:2px">${k}</div></div>`;
  const trend = history.length > 1
    ? `<div class="muted" style="font-size:12.5px;margin-top:6px">Previous scan: <b style="color:var(--ink-dim)">${history[history.length - 2].score}%</b> · now <b style="color:${band.colour}">${pct}%</b></div>` : '';
  const driftHtml = drift && (drift.regressions?.length || drift.fixes?.length)
    ? `<div class="card" style="padding:16px 20px;margin-bottom:16px;border-left:3px solid ${drift.regressions.length ? 'var(--danger)' : 'var(--pass)'}">
        <div class="head" style="font-weight:600;font-size:14px">Changes since last scan${drift.scoreDelta != null ? ` · ${drift.scoreDelta >= 0 ? '+' : ''}${drift.scoreDelta}%` : ''}</div>
        ${drift.regressions.length ? `<div style="margin-top:8px;font-size:11.5px;font-weight:600;color:var(--danger);text-transform:uppercase;letter-spacing:.5px">Regressions (${drift.regressions.length})</div><ul style="margin:5px 0 0;padding-left:20px;font-size:13px">${drift.regressions.map((r) => `<li>${esc(r.title)} <span class="muted">(${r.from} → ${r.to})</span></li>`).join('')}</ul>` : ''}
        ${drift.fixes.length ? `<div style="margin-top:8px;font-size:11.5px;font-weight:600;color:var(--pass);text-transform:uppercase;letter-spacing:.5px">Resolved (${drift.fixes.length})</div><ul style="margin:5px 0 0;padding-left:20px;font-size:13px">${drift.fixes.map((f) => `<li>${esc(f.title)}</li>`).join('')}</ul>` : ''}
      </div>` : '';

  return `${driftHtml}
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">
      <div class="card" style="padding:22px 26px;display:flex;align-items:center;gap:24px;flex:1;min-width:320px">
        <div style="position:relative;width:120px;height:120px;flex:0 0 120px">
          <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg2)" stroke-width="10"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="${band.colour}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}"/>
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
      <div style="display:flex;gap:10px;flex:1;min-width:300px">${['critical', 'high', 'medium', 'low'].map(sevChip).join('')}</div>
    </div>

    <div class="card" style="padding:20px 24px">
      <h3 class="head" style="margin:0 0 14px;font-size:14px;font-weight:600">Posture by category</h3>
      ${modules.map((m) => `<div style="display:flex;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid var(--line)">
        <div class="head" style="font-weight:500;font-size:13.5px;flex:1">${esc(m.name)}</div>
        <div class="muted" style="font-size:11.5px">${m.gaps} of ${m.total} to address</div>
        <div style="width:120px;height:5px;background:var(--bg2);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${m.pct == null ? 0 : m.pct}%;background:${barColour(m.pct)}"></i></div>
        <div class="head" style="font-weight:700;color:${barColour(m.pct)};width:46px;text-align:right;font-size:13.5px">${m.pct == null ? 'N/A' : m.pct + '%'}</div>
      </div>`).join('')}
    </div>`;
}

// ── Shadow IT detail page ───────────────────────────────────
function shadowItPage(details) {
  const apps = details.thirdPartyApps || [];
  if (!apps.length) return `<div class="card" style="padding:40px;text-align:center;color:var(--ink-mute)">No third-party OAuth apps detected across scanned users, or the required scope wasn't consented.</div>`;
  const rows = apps.map((a, i) => {
    const risky = a.risky;
    const users = a.users.slice(0, 5).map(esc).join(', ') + (a.userCount > 5 ? ` and ${a.userCount - 5} more` : '');
    const scopeList = a.scopes.map((s) => esc(s.replace('https://www.googleapis.com/auth/', ''))).join(', ');
    return `<tr>
      <td>
        <div class="head" style="font-weight:600;font-size:13.5px">${esc(a.name)}</div>
        <div class="muted" style="font-size:11px;margin-top:2px">${esc(a.clientId || '')}</div>
      </td>
      <td class="${risky ? 'risky' : ''}" style="text-align:center">${risky ? 'HIGH' : 'Standard'}</td>
      <td style="text-align:center">${a.userCount}</td>
      <td style="text-align:center">${a.scopeCount}</td>
      <td>
        <div class="muted">${users}</div>
        <div class="expand" onclick="this.nextElementSibling.classList.toggle('hidden')">Show scopes ▾</div>
        <div class="details hidden">${scopeList}</div>
      </td>
    </tr>`;
  }).join('');
  return `<div class="card" style="overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0 0 4px;font-size:15px;font-weight:600">Third-party OAuth apps</h3>
      <p class="muted" style="margin:0;font-size:12.5px">Every app users have granted access to across the tenant. Apps in <span class="risky">red</span> hold broad Drive or Gmail access.</p>
    </div>
    <table class="dtable"><thead><tr><th>Application</th><th style="text-align:center">Risk</th><th style="text-align:center">Users</th><th style="text-align:center">Scopes</th><th>Granted by</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

// ── Device inventory page ───────────────────────────────────
function deviceInventoryPage(details) {
  const mobile = details.mobileDevices || [];
  const chrome = details.chromeDevices || [];
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const mobileTable = mobile.length ? `<div class="card" style="overflow:hidden;margin-bottom:16px">
    <div style="padding:16px 20px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600">Mobile devices <span class="muted" style="font-size:12px;font-weight:400">(${mobile.length})</span></h3>
    </div>
    <table class="dtable"><thead><tr><th>User</th><th>Model</th><th>Type</th><th>OS</th><th style="text-align:center">Status</th><th>Last sync</th></tr></thead><tbody>
      ${mobile.map((d) => `<tr><td>${esc(d.email)}</td><td>${esc(d.model)}</td><td class="muted">${esc(d.type || '')}</td><td class="muted">${esc(d.os || '')}</td><td style="text-align:center" class="${d.compromised ? 'risky' : 'safe'}">${d.compromised ? '⚠ COMPROMISED' : '✓ OK'}</td><td class="muted">${fmtDate(d.lastSync)}</td></tr>`).join('')}
    </tbody></table></div>` : '';

  const chromeTable = chrome.length ? `<div class="card" style="overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600">Chrome / ChromeOS devices <span class="muted" style="font-size:12px;font-weight:400">(${chrome.length})</span></h3>
    </div>
    <table class="dtable"><thead><tr><th>Last user</th><th>Model</th><th>Serial</th><th style="text-align:center">Status</th><th>Last sync</th></tr></thead><tbody>
      ${chrome.map((d) => `<tr><td>${esc(d.lastUser)}</td><td>${esc(d.model)}</td><td class="muted">${esc(d.serial || '')}</td><td style="text-align:center">${esc(d.status || '')}</td><td class="muted">${fmtDate(d.lastSync)}</td></tr>`).join('')}
    </tbody></table></div>` : '';

  if (!mobile.length && !chrome.length) return `<div class="card" style="padding:40px;text-align:center;color:var(--ink-mute)">No devices found. Enrol devices in Google endpoint management, or grant the required scope, to populate this inventory.</div>`;
  return mobileTable + chromeTable;
}

// ── Main dashboard router ───────────────────────────────────
export function dashboardPage(scan, accepted, baseUrl, history = [], drift = null, category = 'overview') {
  const { pct, band, modules } = scoreFindings(scan.findings, accepted);
  const sev = severityBreakdown(scan.findings, accepted);
  const date = new Date(scan.scannedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  const tenant = scan.org.name;

  // Compute count badges per category for the sidebar
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
    sub = 'Every application connected to a user in this tenant, with risk classification.';
    content = shadowItPage(scan.details || {});
    showFilters = false;
  } else if (category === 'devicesList') {
    title = 'Device inventory';
    sub = 'Mobile and Chrome devices enrolled to the tenant.';
    content = deviceInventoryPage(scan.details || {});
    showFilters = false;
  } else {
    // A posture category — show its modules
    const catModules = modules.filter((m) => cat.modules.includes(m.name));
    const catFindings = catModules.flatMap((m) => m.items);
    content = (catModules.length
      ? `${filterBar(catFindings, accepted, true)}${catModules.map((m) => moduleBlock(m, accepted, baseUrl, tenant)).join('')}<div class="no-results hidden" id="noResults">No findings match the current filters. <a href="#" onclick="clearFilters();return false" style="color:var(--cyan)">Clear filters</a></div>`
      : `<div class="card" style="padding:40px;text-align:center;color:var(--ink-mute)">No controls in this category yet.</div>`);
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

// ── Organisation view ───────────────────────────────────────
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

  return `<!doctype html>${HEAD}<title>Sentinel — tenants</title><body><div style="max-width:1080px;margin:0 auto;padding:26px 22px 70px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:26px">
      <div style="display:flex;align-items:center;gap:10px">${MARK}<span class="head" style="font-family:'Space Grotesk';font-weight:700;font-size:16px">Sentinel</span></div>
      <div style="flex:1"></div>
      <a class="btn primary" href="${baseUrl}/auth/google">+ Link tenant</a>
      <a class="btn ghost" href="${baseUrl}/logout">Sign out</a>
    </div>
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:22px">
      <div class="card" style="padding:20px 24px;flex:1;min-width:220px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px">Tenants under management</div><div class="head" style="font-size:32px;font-weight:700;margin-top:6px">${tenants.length}</div></div>
      <div class="card" style="padding:20px 24px;flex:1;min-width:220px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px">Average posture</div><div class="head" style="font-size:32px;font-weight:700;margin-top:6px;color:${avgColour}">${avg}<span style="font-size:18px;color:var(--ink-mute)">%</span></div></div>
      <div class="card" style="padding:20px 24px;flex:1;min-width:220px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px">Last scan</div><div class="head" style="font-size:16px;font-weight:600;margin-top:10px">${tenants[0]?.lastScanAt ? new Date(tenants[0].lastScanAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : '—'}</div></div>
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
