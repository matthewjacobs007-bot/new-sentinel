// lib/render.js — Sentinel UI, Apple-inspired light theme.
// Design principles: near-white surfaces, hairline borders, generous whitespace,
// one restrained blue accent, considered typography (SF-inspired), soft shadows.
import { scoreFindings, severityBreakdown } from './scoring2.js';
import { FRAMEWORKS, frameworksFor } from './frameworks.js';
import { isStale, daysSince } from './alerts.js';
import { priceBreakdown, formatUsd } from './pricing.js';

const SEV = { critical: '#d70015', high: '#c04c00', medium: '#0071e3', low: '#248a3d' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const barColour = (p) => (p == null ? '#e5e5ea' : p >= 85 ? '#248a3d' : p >= 70 ? '#0071e3' : p >= 50 ? '#c04c00' : '#d70015');

// Refined shield mark in the accent blue
const MARK = `<svg width="26" height="26" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block">
  <path d="M16 2 L28 7 V16 C28 22 22 27 16 30 C10 27 4 22 4 16 V7 Z" fill="#0071e3"/>
  <path d="M16 9 L22 11.5 V16.5 C22 20 19 22.5 16 24 C13 22.5 10 20 10 16.5 V11.5 Z" fill="#ffffff"/>
  <circle cx="16" cy="16" r="2" fill="#0071e3"/>
</svg>`;

// Small platform badges so a multi-platform tenant list is scannable at a glance.
const GOOGLE_ICON = `<svg width="13" height="13" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="flex:0 0 auto"><path fill="#4285F4" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16 4 9.2 8.5 6.3 14.7z"/><path fill="#FBBC05" d="M24 44c5.4 0 10.2-1.8 13.9-4.9l-6.4-5.4C29.6 35.4 27 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5C9.1 39.5 16 44 24 44z"/><path fill="#EA4335" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5.001 0 .001 0 0 0l6.4 5.4C41.5 35.9 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>`;
const MS_ICON = `<svg width="13" height="13" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg" style="flex:0 0 auto"><rect x="1" y="1" width="10" height="10" fill="#f25022"/><rect x="12" y="1" width="10" height="10" fill="#7fba00"/><rect x="1" y="12" width="10" height="10" fill="#00a4ef"/><rect x="12" y="12" width="10" height="10" fill="#ffb900"/></svg>`;
const platformIcon = (platform) => (platform === 'Microsoft 365' ? MS_ICON : GOOGLE_ICON);

const CATEGORIES = {
  overview:   { label: 'Overview',          icon: '◈', modules: null },
  identity:   { label: 'Identity & Access', icon: '⚿', modules: ['User & Admin Access', 'Account Hygiene'] },
  apps:       { label: 'Apps & Shadow IT',  icon: '⌬', modules: ['Risk Center (Shadow IT)', 'Application & API Access'] },
  data:       { label: 'Data & Sharing',    icon: '⊞', modules: ['Collaboration', 'Calendar & Sites'] },
  devices:    { label: 'Devices',           icon: '▢', modules: ['Endpoint & Device'] },
  email:      { label: 'Email Security',    icon: '✉', modules: ['Email Security'] },
  emailDeep:  { label: 'Email deep dive',   icon: '⚡', modules: null },
  activity:   { label: 'Activity timeline', icon: '◐', modules: null },
  monitoring: { label: 'Monitoring',        icon: '◉', modules: ['Logging & Monitoring'] },
  backup:     { label: 'Backup',            icon: '⛃', modules: ['Backup & Continuity'] },
  devicesList:{ label: 'Device inventory',  icon: '▤', modules: null },
  shadowIt:   { label: 'Third-party apps',  icon: '⚙', modules: null },
  users:      { label: 'Users',             icon: '◍', modules: null },
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

/* Collapsible modules — clean tenants shouldn't read as a wall of green text */
.module.collapsed .module-items{display:none}
.module-head:hover{background:var(--bg-inset)}

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
  const optionCard = (href, icon, label, caveat) => `
    <a href="${href}" style="display:flex;align-items:center;gap:13px;padding:14px 16px;border-radius:11px;
      border:1px solid var(--line-2);background:var(--bg-elev);text-decoration:none;transition:all .12s;margin-bottom:10px"
      onmouseover="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 3px rgba(0,113,227,.1)'"
      onmouseout="this.style.borderColor='var(--line-2)';this.style.boxShadow='none'">
      <span style="flex:0 0 auto;width:34px;height:34px;border-radius:9px;background:var(--bg-inset);display:flex;align-items:center;justify-content:center">${icon}</span>
      <span style="flex:1;min-width:0">
        <span class="head" style="display:block;font-weight:600;font-size:14px;color:var(--ink)">${label}</span>
        <span class="muted" style="display:block;font-size:11.5px;margin-top:1px;line-height:1.4">${caveat}</span>
      </span>
      <span class="muted" style="font-size:15px">→</span>
    </a>`;

  return `<!doctype html>${HEAD}<title>Sentinel — sign in</title><body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:radial-gradient(ellipse 900px 560px at 50% -8%, var(--accent-tint), transparent 65%), var(--bg)">
    <div style="width:100%;max-width:408px">
      <div style="display:flex;align-items:center;gap:9px;justify-content:center;margin-bottom:32px">${MARK}<span class="head" style="font-weight:600;font-size:19px;letter-spacing:-0.015em">Sentinel</span></div>

      <div class="card elev" style="padding:30px 30px 26px;position:relative;overflow:hidden">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),#5ac8fa)"></div>
        <h2 class="head" style="margin:0 0 6px;font-size:22px">Sign in</h2>
        <p class="dim" style="font-size:14px;margin:0 0 20px;line-height:1.5">Read-only security posture for your Google Workspace or Microsoft 365 tenant.</p>

        ${error ? `<div style="background:#fff1f2;border:1px solid #fecdd3;color:#9f1239;border-radius:8px;padding:11px 13px;font-size:13px;margin-bottom:18px;line-height:1.5">${esc(error)}</div>` : ''}

        <!-- Client path -->
        <div class="muted" style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">For clients</div>
        ${optionCard(`${baseUrl}/auth/google?mode=client`,
          `<svg width="17" height="17" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16 4 9.2 8.5 6.3 14.7z"/><path fill="#FBBC05" d="M24 44c5.4 0 10.2-1.8 13.9-4.9l-6.4-5.4C29.6 35.4 27 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5C9.1 39.5 16 44 24 44z"/><path fill="#EA4335" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.4 5.4C41.5 35.9 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>`,
          'Sign in with Google', 'Requires Workspace <b>super admin</b>')}
        ${optionCard(`${baseUrl}/auth/microsoft?mode=client`,
          `<svg width="16" height="16" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="10" height="10" fill="#f25022"/><rect x="12" y="1" width="10" height="10" fill="#7fba00"/><rect x="1" y="12" width="10" height="10" fill="#00a4ef"/><rect x="12" y="12" width="10" height="10" fill="#ffb900"/></svg>`,
          'Sign in with Microsoft', 'Requires 365 <b>Global Administrator</b>')}
        <p class="muted" style="font-size:11px;margin:4px 0 0;line-height:1.5">Sentinel only reads security configuration — never email, chat or file contents.</p>

        <!-- MSP path (collapsed by default so clients don't see it as a competing option) -->
        <details style="margin-top:20px;padding-top:18px;border-top:1px solid var(--line)">
          <summary style="cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink-dim);user-select:none;list-style:none;display:flex;align-items:center;gap:5px">
            <span style="display:inline-block;transition:transform .15s">▸</span> MSP administrator sign in
          </summary>
          <form method="post" action="${baseUrl}/login" style="margin-top:16px">
            <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Username</label>
            <input name="user" autocomplete="username" style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);margin-bottom:14px;outline:none;font-size:14px;box-sizing:border-box" onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 3px rgba(0,113,227,.12)'" onblur="this.style.borderColor='var(--line-2)';this.style.boxShadow='none'">
            <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Password</label>
            <input name="pass" type="password" autocomplete="current-password" style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);margin-bottom:18px;outline:none;font-size:14px;box-sizing:border-box" onfocus="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 3px rgba(0,113,227,.12)'" onblur="this.style.borderColor='var(--line-2)';this.style.boxShadow='none'">
            <button class="btn ghost" style="width:100%;justify-content:center;padding:10px;font-size:13.5px;box-sizing:border-box" type="submit">Sign in as MSP</button>
          </form>
        </details>
      </div>

      <div style="display:flex;gap:16px;justify-content:center;margin-top:22px;flex-wrap:wrap">
        <span class="muted" style="font-size:12px;display:flex;align-items:center;gap:5px">🔒 Read-only access</span>
        <span class="muted" style="font-size:12px;display:flex;align-items:center;gap:5px">⚡ Results in minutes</span>
        <span class="muted" style="font-size:12px;display:flex;align-items:center;gap:5px">🛡 CIS-mapped controls</span>
      </div>
    </div>
  </div>
  <style>details[open] summary span:first-child{transform:rotate(90deg)}</style>`;
}
export function loginPage(baseUrl) { return teamLoginPage(baseUrl); }

// ── Public marketing / lead-gen page (unauthenticated visitors land here) ──
const MODULE_BLURBS = [
  ['⚿', 'User & Admin Access', '2SV coverage, super-admin sprawl, custom roles'],
  ['◍', 'Account Hygiene', 'Dormant accounts, stale passwords, recovery info'],
  ['⌬', 'Risk Center (Shadow IT)', 'Third-party OAuth apps with broad Drive/Gmail scopes'],
  ['⊞', 'Collaboration', 'Public groups, external sharing, shared-drive sprawl'],
  ['◐', 'Calendar & Sites', 'External sharing defaults, Meet & Sites exposure'],
  ['▢', 'Endpoint & Device', 'Mobile enrolment, compromised & inactive devices'],
  ['✉', 'Email Security', 'SPF, DMARC, DKIM, forwarding, Gmail safety'],
  ['⚙', 'Application & API Access', 'App access restrictions, Marketplace, legacy auth'],
  ['◉', 'Logging & Monitoring', 'Suspicious logins, audit retention, alert rules'],
  ['⛃', 'Backup & Continuity', 'Independent backup, Vault retention, IR runbook'],
];

export function marketingPage(baseUrl, { sent = false } = {}) {
  const nav = (href, label) => `<a href="${href}" style="color:var(--ink-2);font-weight:500;font-size:14px;text-decoration:none">${label}</a>`;
  const feature = (icon, title, body) => `<div class="card" style="padding:24px 26px">
    <div style="width:38px;height:38px;border-radius:10px;background:var(--accent-tint);display:flex;align-items:center;justify-content:center;font-size:17px;margin-bottom:14px">${icon}</div>
    <h3 class="head" style="margin:0 0 6px;font-size:15.5px;font-weight:600">${title}</h3>
    <p class="dim" style="margin:0;font-size:13.5px;line-height:1.55">${body}</p>
  </div>`;
  const step = (n, title, body) => `<div style="flex:1;min-width:220px">
    <div style="width:32px;height:32px;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;margin-bottom:14px">${n}</div>
    <h3 class="head" style="margin:0 0 6px;font-size:15px;font-weight:600">${title}</h3>
    <p class="dim" style="margin:0;font-size:13.5px;line-height:1.55">${body}</p>
  </div>`;
  const moduleChip = ([icon, name, blurb]) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--line)">
    <span style="flex:0 0 auto;width:30px;height:30px;border-radius:8px;background:var(--bg-inset);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--ink-dim)">${icon}</span>
    <div><div class="head" style="font-weight:600;font-size:13.5px">${esc(name)}</div><div class="muted" style="font-size:12.5px;margin-top:1px;line-height:1.4">${esc(blurb)}</div></div>
  </div>`;

  return `<!doctype html>${HEAD}<title>Sentinel — Security &amp; compliance posture, without the busywork</title>
  <meta name="description" content="Sentinel scans your Google Workspace tenant against 46 CIS-mapped security controls in minutes — read-only, MSP-ready, with direct fix links.">
  <body>
  <div style="position:sticky;top:0;z-index:40;background:rgba(251,251,253,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)">
    <div style="max-width:1100px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;gap:32px">
      <a href="${baseUrl}/" style="display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink)">${MARK}<span class="head" style="font-weight:600;font-size:16px">Sentinel</span></a>
      <div style="display:flex;gap:26px;flex:1">${nav('#features', 'Features')}${nav('#modules', 'What we check')}${nav('#msp', 'For MSPs')}${nav('#contact', 'Contact')}</div>
      <a class="btn ghost" href="${baseUrl}/login">Sign in</a>
      <a class="btn primary" href="${baseUrl}/auth/google?mode=client">Get started</a>
    </div>
  </div>

  <div style="background:radial-gradient(ellipse 1100px 600px at 50% -10%, var(--accent-tint), transparent 60%), var(--bg)">
    <div style="max-width:760px;margin:0 auto;padding:88px 24px 64px;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:20px;padding:6px 14px;font-size:12.5px;font-weight:500;color:var(--ink-dim);margin-bottom:24px">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--pass)"></span> Google Workspace, live now · Microsoft 365 coming soon
      </div>
      <h1 class="head" style="font-size:44px;line-height:1.12;margin:0 0 18px;letter-spacing:-0.03em">Security &amp; compliance posture,<br>without the busywork.</h1>
      <p class="dim" style="font-size:17px;line-height:1.55;margin:0 0 32px">Sign in as a super admin, and Sentinel scores your tenant against 46 CIS-mapped controls in minutes — with a fixable, exportable report and a deep link into the Admin console for every gap.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <a class="btn primary" href="${baseUrl}/auth/google?mode=client" style="padding:12px 22px;font-size:14.5px">Get started — sign in with Google</a>
        <a class="btn ghost" href="#contact" style="padding:12px 22px;font-size:14.5px">Talk to us first →</a>
      </div>
      <p class="muted" style="font-size:12px;margin-top:14px">Free to scan and see your score — you'll see the price before you pay anything.</p>
      <div style="display:flex;gap:22px;justify-content:center;margin-top:36px;flex-wrap:wrap">
        <span class="muted" style="font-size:12.5px;display:flex;align-items:center;gap:5px">🔒 Read-only, always</span>
        <span class="muted" style="font-size:12.5px;display:flex;align-items:center;gap:5px">🛡 CIS · NIST · SCuBA · CE mapped</span>
        <span class="muted" style="font-size:12.5px;display:flex;align-items:center;gap:5px">⚡ Results in minutes</span>
      </div>
    </div>
  </div>

  <div id="features" style="max-width:1100px;margin:0 auto;padding:64px 24px">
    <h2 class="head" style="text-align:center;font-size:26px;margin:0 0 10px">One sign-in. A complete posture report.</h2>
    <p class="dim" style="text-align:center;font-size:14.5px;margin:0 0 36px">No agents, no browser extensions, no access to email or file contents.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px">
      ${feature('◈', 'Automated scanning', 'Every control is scored automatically from Admin SDK, Reports API and live DNS — no manual checklist.')}
      ${feature('🛡', 'Framework-mapped', 'Every finding carries CIS, NIST 800-53, CISA SCuBA and Cyber Essentials tags for compliance reporting.')}
      ${feature('📉', 'Drift &amp; regressions', 'Every re-scan is diffed against the last one — regressions surface immediately, optionally to Slack/Teams.')}
      ${feature('🔗', 'One-click fixes', 'Every gap deep-links straight into the right Admin console page — no hunting through menus.')}
    </div>
  </div>

  <div id="modules" style="background:var(--bg-inset);border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
    <div style="max-width:900px;margin:0 auto;padding:64px 24px">
      <h2 class="head" style="text-align:center;font-size:26px;margin:0 0 10px">46 controls across 10 modules</h2>
      <p class="dim" style="text-align:center;font-size:14.5px;margin:0 0 36px">Modelled on real Workspace audit practice, from admin access to backup &amp; continuity.</p>
      <div class="card" style="padding:8px 26px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));column-gap:32px">
          ${MODULE_BLURBS.map(moduleChip).join('')}
        </div>
      </div>
    </div>
  </div>

  <div style="max-width:1100px;margin:0 auto;padding:64px 24px">
    <h2 class="head" style="text-align:center;font-size:26px;margin:0 0 40px">How it works</h2>
    <div style="display:flex;gap:32px;flex-wrap:wrap;justify-content:center">
      ${step(1, 'Sign in as super admin', 'Read-only OAuth — Sentinel never touches email, chat or file contents, and access can be revoked anytime.')}
      ${step(2, 'Automatic scan &amp; scoring', 'Every control is scanned and scored in minutes, with severity-weighted compliance percentage.')}
      ${step(3, 'Fix, export, track drift', 'Deep-linked fixes, exportable CSV/PDF reports, and drift detection on every re-scan.')}
    </div>
  </div>

  <div id="msp" style="background:var(--ink);color:#fff">
    <div style="max-width:1100px;margin:0 auto;padding:64px 24px;display:flex;gap:40px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:280px">
        <h2 class="head" style="font-size:26px;margin:0 0 14px;color:#fff">Built for MSPs managing many tenants</h2>
        <p style="color:rgba(255,255,255,.7);font-size:14.5px;line-height:1.6;margin:0 0 20px">One dashboard across every client tenant — average posture, tenants needing a re-scan, and drift alerts the moment a client's configuration regresses. Clients get their own scoped view; you keep the full picture.</p>
        <a class="btn primary" href="#contact" style="padding:10px 20px">Talk to us about your MSP</a>
      </div>
      <div style="flex:0 0 auto;display:flex;gap:14px;flex-wrap:wrap">
        ${['Multi-tenant org view', 'Stale-scan reminders', 'Slack/Teams drift alerts', 'Per-tenant accepted-risk tracking'].map((t) => `<div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px 18px;font-size:13px;min-width:170px">${esc(t)}</div>`).join('')}
      </div>
    </div>
  </div>

  <div id="contact" style="max-width:640px;margin:0 auto;padding:72px 24px 90px">
    <h2 class="head" style="text-align:center;font-size:26px;margin:0 0 10px">Interested? Let's talk.</h2>
    <p class="dim" style="text-align:center;font-size:14.5px;margin:0 0 32px">Tell us a bit about your organisation and we'll be in touch to get you scanning.</p>
    <div class="card elev" style="padding:32px">
      ${sent ? `<div style="background:#f0faf3;border:1px solid #bce8c9;color:#1a7a3a;border-radius:8px;padding:14px 16px;font-size:13.5px;line-height:1.5;text-align:center">
          <b>Thanks — we've got it.</b> We'll be in touch shortly.
        </div>` : `
      <form method="post" action="${baseUrl}/contact">
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
          <div style="flex:1;min-width:180px">
            <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Name</label>
            <input name="name" required style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);outline:none;font-size:14px;box-sizing:border-box">
          </div>
          <div style="flex:1;min-width:180px">
            <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Work email</label>
            <input name="email" type="email" required style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);outline:none;font-size:14px;box-sizing:border-box">
          </div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
          <div style="flex:1;min-width:180px">
            <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Company</label>
            <input name="company" style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);outline:none;font-size:14px;box-sizing:border-box">
          </div>
          <div style="flex:1;min-width:180px">
            <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Platform</label>
            <select name="platform" style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);outline:none;font-size:14px;box-sizing:border-box">
              <option>Google Workspace</option><option>Microsoft 365</option><option>Both</option><option>Not sure yet</option>
            </select>
          </div>
        </div>
        <label class="muted" style="font-size:11.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px">Message</label>
        <textarea name="message" rows="4" placeholder="How many tenants/users, and what you're looking to solve…" style="width:100%;background:var(--bg-elev);border:1px solid var(--line-2);border-radius:9px;padding:10px 13px;color:var(--ink);outline:none;font-size:14px;box-sizing:border-box;font-family:inherit;resize:vertical;margin-bottom:18px"></textarea>
        <button class="btn primary" type="submit" style="width:100%;justify-content:center;padding:11px;font-size:14px">Send</button>
      </form>`}
    </div>
  </div>

  <div style="border-top:1px solid var(--line);padding:28px 24px;text-align:center">
    <div style="display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:8px">${MARK}<span class="head" style="font-weight:600;font-size:14px">Sentinel</span></div>
    <p class="muted" style="font-size:12px;margin:0">Read-only · Configuration and metadata only · <a href="${baseUrl}/login">Client sign in</a></p>
  </div>
  </body>`;
}

export function errorPage(msg) {
  return `<!doctype html>${HEAD}<title>Sentinel — error</title><body><div style="max-width:560px;margin:8vh auto;padding:0 24px">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:28px">${MARK}<span class="head" style="font-weight:600;font-size:16px">Sentinel</span></div>
    <div class="card" style="padding:28px 32px;border-left:3px solid var(--danger)">
      <h2 class="head" style="margin:0 0 10px;color:var(--danger);font-size:20px">Scan could not complete</h2>
      <p style="line-height:1.65;color:var(--ink-2)">${esc(msg)}</p>
      <p class="muted" style="font-size:13px;margin-top:18px">Usually a Google API scope wasn't consented, or the signed-in account isn't a super admin. <a href="/">Try again</a></p>
    </div></div>`;
}

// ── Payment wall — shown after first scan, before a client tenant is active ──
export function activatePage(tenant, baseUrl, { paymentsConfigured = false, cancelled = false, isMsp = false, billingCurrency = 'USD' } = {}) {
  const bd = priceBreakdown(tenant.userCount || 0);
  return `<!doctype html>${HEAD}<title>Sentinel — activate ${esc(tenant.domain)}</title><body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:radial-gradient(ellipse 900px 560px at 50% -8%, var(--accent-tint), transparent 65%), var(--bg)">
    <div style="width:100%;max-width:460px">
      <div style="display:flex;align-items:center;gap:9px;justify-content:center;margin-bottom:28px">${MARK}<span class="head" style="font-weight:600;font-size:19px;letter-spacing:-0.015em">Sentinel</span></div>

      <div class="card elev" style="padding:32px;position:relative;overflow:hidden">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),#5ac8fa)"></div>
        <div class="muted" style="font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Scan complete</div>
        <h2 class="head" style="margin:0 0 6px;font-size:21px">One step left — activate ${esc(tenant.name || tenant.domain)}</h2>
        <p class="dim" style="font-size:13.5px;margin:0 0 22px;line-height:1.55">We scanned your tenant and found <b>${bd.userCount}</b> user${bd.userCount === 1 ? '' : 's'}. Subscribe to unlock the full compliance dashboard, drift alerts, and exportable reports.</p>

        ${cancelled ? `<div style="background:#fff8e6;border:1px solid #ffe1a8;color:#8a5a00;border-radius:8px;padding:11px 13px;font-size:13px;margin-bottom:18px;line-height:1.5">Checkout was cancelled — no charge was made. You can try again below.</div>` : ''}

        <div class="card" style="padding:18px 20px;margin-bottom:22px;background:var(--bg-inset);border-style:dashed">
          <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px">
            <span class="head" style="font-size:30px;font-weight:600;letter-spacing:-0.03em">${formatUsd(bd.priceCents)}</span>
            <span class="muted" style="font-size:13px">/month</span>
          </div>
          <div class="muted" style="font-size:12.5px;line-height:1.5">${esc(bd.summary)}</div>
        </div>

        ${paymentsConfigured ? `
        <form method="post" action="${baseUrl}/activate/checkout">
          <input type="hidden" name="domain" value="${esc(tenant.domain)}">
          <button class="btn primary" type="submit" style="width:100%;justify-content:center;padding:12px;font-size:14.5px">Subscribe with Paystack →</button>
        </form>
        <p class="muted" style="font-size:11.5px;margin:10px 0 0;text-align:center;line-height:1.5">Cancel anytime. Billing is monthly, based on your active user count at scan time.${billingCurrency !== 'USD' ? ` Charged in ${esc(billingCurrency)} at the current exchange rate.` : ''}</p>
        ` : `
        <div style="background:#fff1f2;border:1px solid #fecdd3;color:#9f1239;border-radius:8px;padding:13px 15px;font-size:13px;line-height:1.55">
          Online payment isn't switched on yet — <a href="${baseUrl}/#contact">contact us</a> and we'll activate your account manually.
        </div>`}

        ${isMsp ? `
        <form method="post" action="${baseUrl}/activate/manual" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
          <input type="hidden" name="domain" value="${esc(tenant.domain)}">
          <button class="btn ghost" type="submit" style="width:100%;justify-content:center;padding:9px;font-size:13px">MSP override: activate without payment →</button>
        </form>` : ''}
      </div>
      <p class="muted" style="text-align:center;font-size:12px;margin-top:20px"><a href="${baseUrl}/logout">Sign out</a></p>
    </div>
  </div>`;
}

// Shown right after returning from Stripe Checkout.
export function activateSuccessPage(tenant, baseUrl, activated) {
  return `<!doctype html>${HEAD}<title>Sentinel — activated</title><body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg)">
    <div style="width:100%;max-width:420px;text-align:center">
      <div style="display:flex;align-items:center;gap:9px;justify-content:center;margin-bottom:28px">${MARK}<span class="head" style="font-weight:600;font-size:19px;letter-spacing:-0.015em">Sentinel</span></div>
      <div class="card elev" style="padding:36px 32px">
        ${activated ? `
          <div style="font-size:36px;margin-bottom:12px">✓</div>
          <h2 class="head" style="margin:0 0 8px;font-size:20px">You're all set</h2>
          <p class="dim" style="font-size:13.5px;margin:0 0 24px;line-height:1.55">${esc(tenant.name || tenant.domain)} is now active. Your dashboard is ready.</p>
          <a class="btn primary" href="${baseUrl}/tenant/${encodeURIComponent(tenant.domain)}" style="width:100%;justify-content:center;padding:11px">Go to dashboard →</a>
        ` : `
          <h2 class="head" style="margin:0 0 8px;font-size:20px">Payment is processing</h2>
          <p class="dim" style="font-size:13.5px;margin:0 0 24px;line-height:1.55">This usually takes a few seconds. Refresh in a moment, or contact us if it doesn't clear.</p>
          <a class="btn ghost" href="${baseUrl}/activate/success?domain=${encodeURIComponent(tenant.domain)}" style="width:100%;justify-content:center;padding:11px">Refresh →</a>
        `}
      </div>
    </div>
  </div>`;
}

function sidebar(scan, activeCat, baseUrl, moduleCounts, isMsp) {
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
      <div class="tmeta" style="display:flex;align-items:center;gap:5px">${platformIcon(scan.org.platform)}${esc(scan.org.platform)}</div>
    </div>
    <nav class="nav">
      <div class="navlbl">Posture</div>
      ${item('overview')}${item('identity')}${item('apps')}${item('data')}${item('devices')}${item('email')}${item('monitoring')}${item('backup')}
      <div class="navlbl">Inventory</div>
      ${item('users')}${item('shadowIt')}${item('devicesList')}${item('emailDeep')}${item('activity')}
    </nav>
    ${isMsp ? `<div class="footer"><a href="${baseUrl}/">← All tenants</a></div>` : ''}
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
      <button class="chip" onclick="toggleAllModules()" id="expandAllBtn">Expand all</button>
      <button class="chip" onclick="clearFilters()">Clear all</button>
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
    function toggleModule(mod) {
      mod.classList.toggle('collapsed');
      const chev = mod.querySelector('.chevron');
      if (chev) chev.style.transform = mod.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
    function toggleAllModules() {
      const btn = document.getElementById('expandAllBtn');
      const collapseAll = btn.textContent === 'Expand all';
      document.querySelectorAll('.module').forEach(m => {
        m.classList.toggle('collapsed', !collapseAll);
        const chev = m.querySelector('.chevron');
        if (chev) chev.style.transform = !collapseAll ? 'rotate(-90deg)' : 'rotate(0deg)';
      });
      btn.textContent = collapseAll ? 'Collapse all' : 'Expand all';
    }
    function applyFilters() {
      const sb = document.getElementById('searchBox');
      const search = sb ? sb.value.trim().toLowerCase() : '';
      const anyFilterActive = search || Object.values(active).some(s => s.size);
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
        // While a filter/search is active, force every matching module open so
        // results aren't hidden behind the "all passing" collapse; once cleared,
        // restore each module's default collapsed-if-clean state.
        m.classList.toggle('collapsed', anyFilterActive ? false : m.dataset.allpass === '1');
      });
      const expandBtn = document.getElementById('expandAllBtn');
      if (expandBtn && !anyFilterActive) expandBtn.textContent = 'Expand all';
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
  // Modules where every control is genuinely passing (or accepted) start collapsed so a
  // clean tenant doesn't read as a wall of green text. gaps===0 alone isn't enough — it
  // doesn't count 'unknown' (needs-manual-review) findings, which must stay visible.
  const allPass = m.items.every((f) => f.accepted || f.status === 'pass');
  return `<div class="module card${allPass ? ' collapsed' : ''}" data-module="${esc(m.name)}" data-allpass="${allPass ? '1' : '0'}" style="margin-bottom:16px;overflow:hidden">
    <div class="module-head" style="padding:16px 22px;display:flex;align-items:center;gap:16px;cursor:pointer" onclick="toggleModule(this.parentElement)">
      <span class="chevron muted" style="font-size:11px;transition:transform .15s;flex:0 0 auto;transform:rotate(${allPass ? '-90deg' : '0deg'})">▾</span>
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">${esc(m.name)}</h3>
      ${allPass ? `<span class="muted" style="font-size:12.5px">✓ all ${m.total} passing</span>` : `<span class="muted" style="font-size:12.5px">${m.gaps} of ${m.total} to address</span>`}
      <div style="width:140px;height:6px;background:var(--bg-inset);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${m.pct == null ? 0 : m.pct}%;background:${barColour(m.pct)};transition:width .3s"></i></div>
      <div class="head" style="font-weight:600;color:${barColour(m.pct)};width:54px;text-align:right;font-size:14px">${m.pct == null ? 'N/A' : m.pct + '%'}</div>
    </div><div class="module-items" style="padding:0 22px 8px;border-top:1px solid var(--line)">${items}</div></div>`;
}

// Reverse-lookup: which sidebar category a module lives under (for deep-linking).
const MODULE_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORIES).flatMap(([key, c]) => (c.modules || []).map((m) => [m, key])));

// The single highest-leverage view for a busy MSP: instead of scrolling every
// category to find what's broken, surface the worst open gaps in one place.
function topActionsPanel(modules, baseUrl, tenant, limit = 6) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const gaps = modules.flatMap((m) => m.items.filter((f) => !f.accepted && (f.status === 'fail' || f.status === 'partial')))
    .sort((a, b) => (order[a.severity] - order[b.severity]) || (a.status === 'fail' ? -1 : 1));
  if (!gaps.length) {
    return `<div class="card" style="padding:22px 26px;margin-bottom:20px;border-left:3px solid var(--pass)">
      <div class="head" style="font-weight:600;font-size:14.5px">✓ No open gaps</div>
      <div class="muted" style="font-size:13px;margin-top:4px">Every measurable control is passing or has an accepted risk.</div>
    </div>`;
  }
  const shown = gaps.slice(0, limit);
  const row = (f) => `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)">
      <span style="font-size:10px;font-weight:600;letter-spacing:.4px;color:#fff;background:${SEV[f.severity]};padding:3px 9px;border-radius:5px;text-transform:uppercase;flex:0 0 auto">${f.severity}</span>
      <div style="flex:1;min-width:0">
        <div class="head" style="font-weight:500;font-size:13.5px;color:var(--ink)">${esc(f.title)}</div>
        <div class="muted" style="font-size:12px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.module)} · ${esc(f.detail)}</div>
      </div>
      ${f.fixUrl ? `<a class="btn fix" style="flex:0 0 auto;padding:5px 11px;font-size:12px" href="${esc(f.fixUrl)}" target="_blank" rel="noopener">Fix →</a>`
        : `<a class="btn ghost" style="flex:0 0 auto;padding:5px 11px;font-size:12px" href="${baseUrl}/tenant/${encodeURIComponent(tenant)}?cat=${MODULE_TO_CATEGORY[f.module] || 'overview'}">Review →</a>`}
    </div>`;
  return `<div class="card" style="padding:22px 26px;margin-bottom:20px">
    <div style="display:flex;align-items:center;margin-bottom:6px">
      <h3 class="head" style="margin:0;font-size:14.5px;font-weight:600;flex:1">Top priority actions</h3>
      <span class="muted" style="font-size:12px">${gaps.length} open gap${gaps.length === 1 ? '' : 's'}</span>
    </div>
    ${shown.map(row).join('')}
  </div>`;
}

function overviewContent(scan, pct, band, sev, modules, drift, history, baseUrl, tenant) {
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
  const staleHtml = isStale(scan.scannedAt)
    ? `<div class="card" style="padding:14px 22px;margin-bottom:18px;border-left:3px solid var(--danger);display:flex;align-items:center;gap:10px">
        <span style="font-size:14px">⚠</span>
        <span style="font-size:13.5px;color:var(--ink-2)">This scan is <b>${daysSince(scan.scannedAt)} days old</b> — click <b>Re-scan</b> to refresh the compliance posture.</span>
      </div>` : '';

  return `${staleHtml}${driftHtml}
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

    ${topActionsPanel(modules, baseUrl, tenant)}

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

  // Classify scope categories per app so we can filter on them.
  const classify = (scopes) => {
    const s = scopes.join(' ');
    const tags = [];
    if (/auth\/drive(?!\.readonly)/.test(s)) tags.push('drive-write');
    else if (/auth\/drive/.test(s)) tags.push('drive-read');
    if (/auth\/gmail(?!\.readonly|\.metadata)/.test(s)) tags.push('gmail-write');
    else if (/auth\/gmail/.test(s)) tags.push('gmail-read');
    if (/auth\/calendar/.test(s)) tags.push('calendar');
    if (/auth\/contacts/.test(s)) tags.push('contacts');
    if (/admin\.directory/.test(s)) tags.push('directory');
    return tags;
  };

  // Precompute per-row data + counts for chips
  const rows = apps.map((a) => ({ ...a, categories: classify(a.scopes || []) }));
  const c = {
    high: rows.filter((a) => a.risky).length,
    standard: rows.filter((a) => !a.risky).length,
    wide: rows.filter((a) => a.userCount >= 5).length,
    few: rows.filter((a) => a.userCount >= 2 && a.userCount < 5).length,
    single: rows.filter((a) => a.userCount === 1).length,
    driveWrite: rows.filter((a) => a.categories.includes('drive-write')).length,
    gmailWrite: rows.filter((a) => a.categories.includes('gmail-write')).length,
    calendar: rows.filter((a) => a.categories.includes('calendar')).length,
    directory: rows.filter((a) => a.categories.includes('directory')).length,
    anon: rows.filter((a) => a.anonymous).length,
  };
  const chip = (flag, label, count, colour = 'var(--ink-mute)') =>
    `<button class="chip" onclick="toggleAppFilter(this,'${flag}')"><span class="dot" style="background:${colour}"></span>${label} <span class="n">${count}</span></button>`;

  const rowHtml = rows.map((a) => {
    const flags = [];
    if (a.risky) flags.push('risk-high'); else flags.push('risk-standard');
    if (a.userCount >= 5) flags.push('reach-wide');
    else if (a.userCount >= 2) flags.push('reach-few');
    else flags.push('reach-single');
    if (a.anonymous) flags.push('anon');
    a.categories.forEach((cat) => flags.push('cat-' + cat));

    const users = a.users.slice(0, 5).map(esc).join(', ') + (a.userCount > 5 ? ` and ${a.userCount - 5} more` : '');
    const scopeList = a.scopes.map((s) => esc(s.replace('https://www.googleapis.com/auth/', ''))).join(', ');
    const searchText = esc((a.name + ' ' + (a.clientId || '') + ' ' + a.users.join(' ') + ' ' + a.scopes.join(' ')).toLowerCase());

    // Category badges shown inline
    const catBadge = (label, cls) => `<span style="font-size:10px;font-weight:500;padding:2px 6px;border-radius:4px;background:var(--bg-inset);color:var(--ink-dim);margin-right:4px">${label}</span>`;
    const badges = [];
    if (a.categories.includes('drive-write')) badges.push(catBadge('Drive write'));
    if (a.categories.includes('drive-read')) badges.push(catBadge('Drive read'));
    if (a.categories.includes('gmail-write')) badges.push(catBadge('Gmail write'));
    if (a.categories.includes('gmail-read')) badges.push(catBadge('Gmail read'));
    if (a.categories.includes('calendar')) badges.push(catBadge('Calendar'));
    if (a.categories.includes('contacts')) badges.push(catBadge('Contacts'));
    if (a.categories.includes('directory')) badges.push(catBadge('Directory'));
    if (a.anonymous) badges.push(`<span style="font-size:10px;font-weight:500;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#92400e;margin-right:4px">Anonymous</span>`);

    return `<tr class="arow" data-flags="${flags.join(' ')}" data-text="${searchText}" data-users="${a.userCount}" data-scopes="${a.scopeCount}" data-name="${esc(a.name.toLowerCase())}">
      <td>
        <div class="head" style="font-weight:600;font-size:14px">${esc(a.name)}</div>
        <div class="muted" style="font-size:11.5px;margin-top:2px">${esc(a.clientId || '')}</div>
        ${badges.length ? `<div style="margin-top:6px">${badges.join('')}</div>` : ''}
      </td>
      <td class="${a.risky ? 'risky' : ''}" style="text-align:center">${a.risky ? 'High' : 'Standard'}</td>
      <td style="text-align:center">${a.userCount}</td>
      <td style="text-align:center">${a.scopeCount}</td>
      <td>
        <div>${users}</div>
        <div class="expand" onclick="this.nextElementSibling.classList.toggle('hidden')">Show scopes</div>
        <div class="details hidden">${scopeList}</div>
      </td>
    </tr>`;
  }).join('');

  return `<div class="card" style="padding:14px 18px;margin-bottom:16px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);font-weight:600;min-width:66px">Risk</span>
      ${chip('risk-high', 'High', c.high, 'var(--danger)')}
      ${chip('risk-standard', 'Standard', c.standard, 'var(--pass)')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);font-weight:600;min-width:66px">Reach</span>
      ${chip('reach-wide', 'Widely used (5+)', c.wide, 'var(--warn)')}
      ${chip('reach-few', '2–4 users', c.few, 'var(--info)')}
      ${chip('reach-single', 'Single user', c.single, 'var(--ink-mute)')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);font-weight:600;min-width:66px">Access</span>
      ${chip('cat-drive-write', 'Drive write', c.driveWrite, 'var(--danger)')}
      ${chip('cat-gmail-write', 'Gmail write', c.gmailWrite, 'var(--danger)')}
      ${chip('cat-calendar', 'Calendar', c.calendar)}
      ${chip('cat-directory', 'Directory', c.directory, 'var(--warn)')}
      ${chip('anon', 'Anonymous', c.anon, 'var(--warn)')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--line)">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);font-weight:600;min-width:66px">Sort</span>
      <select id="aSort" onchange="applyAppFilter()" style="background:var(--bg-elev);border:1px solid var(--line-2);border-radius:8px;padding:6px 10px;color:var(--ink);font-size:13px;font-family:inherit">
        <option value="risk">Risk (default)</option>
        <option value="users">Most users</option>
        <option value="scopes">Most scopes</option>
        <option value="name">Name (A→Z)</option>
      </select>
      <div style="flex:1"></div>
      <input class="searchbox" id="aSearch" placeholder="Search app, user, or scope…" oninput="applyAppFilter()" style="min-width:220px">
      <button class="chip" onclick="clearAppFilters()">Clear all</button>
    </div>
  </div>
  <div class="card" style="overflow:hidden">
    <div style="padding:16px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">Third-party OAuth apps</h3>
      <span class="muted" style="font-size:12.5px" id="aSummary">${rows.length} total</span>
    </div>
    <table class="dtable"><thead><tr><th>Application</th><th style="text-align:center">Risk</th><th style="text-align:center">Users</th><th style="text-align:center">Scopes</th><th>Granted by</th></tr></thead><tbody id="aBody">${rowHtml}</tbody></table>
  </div>
  <script>
    const aFlags = new Set();
    function toggleAppFilter(btn, flag) {
      if (aFlags.has(flag)) { aFlags.delete(flag); btn.classList.remove('on'); }
      else { aFlags.add(flag); btn.classList.add('on'); }
      applyAppFilter();
    }
    function clearAppFilters() {
      aFlags.clear();
      document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
      document.getElementById('aSearch').value = '';
      document.getElementById('aSort').value = 'risk';
      applyAppFilter();
    }
    function applyAppFilter() {
      const search = (document.getElementById('aSearch').value || '').trim().toLowerCase();
      const sortBy = document.getElementById('aSort').value;

      // Group flags by category — within a category, chips are OR; across categories, AND.
      const byCat = { risk: [], reach: [], cat: [], other: [] };
      aFlags.forEach(f => {
        if (f.startsWith('risk-')) byCat.risk.push(f);
        else if (f.startsWith('reach-')) byCat.reach.push(f);
        else if (f.startsWith('cat-')) byCat.cat.push(f);
        else byCat.other.push(f);
      });

      let shown = 0;
      const rows = [...document.querySelectorAll('.arow')];
      rows.forEach(r => {
        const rowFlags = (r.dataset.flags || '').split(' ');
        let ok = true;
        for (const [, arr] of Object.entries(byCat)) {
          if (arr.length && !arr.some(f => rowFlags.includes(f))) { ok = false; break; }
        }
        if (ok && search && !r.dataset.text.includes(search)) ok = false;
        r.classList.toggle('hidden', !ok);
        if (ok) shown++;
      });

      // Sort visible rows
      const body = document.getElementById('aBody');
      rows.sort((a, b) => {
        if (sortBy === 'users') return Number(b.dataset.users) - Number(a.dataset.users);
        if (sortBy === 'scopes') return Number(b.dataset.scopes) - Number(a.dataset.scopes);
        if (sortBy === 'name') return a.dataset.name.localeCompare(b.dataset.name);
        // 'risk': risky first, then most users
        const ar = a.dataset.flags.includes('risk-high') ? 1 : 0;
        const br = b.dataset.flags.includes('risk-high') ? 1 : 0;
        if (ar !== br) return br - ar;
        return Number(b.dataset.users) - Number(a.dataset.users);
      });
      rows.forEach(r => body.appendChild(r));

      const total = rows.length;
      document.getElementById('aSummary').textContent = shown === total ? total + ' total' : shown + ' of ' + total;
    }
  </script>`;
}

function usersListPage(details, baseUrl, tenant) {
  const users = details.users || [];
  if (!users.length) return `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">No user data captured for this scan.</div>`;

  const now = Date.now();
  const daysSince = (t) => t ? Math.floor((now - Date.parse(t)) / 864e5) : null;
  const fmtLastLogin = (t) => {
    const d = daysSince(t);
    if (d == null) return 'Never';
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 30) return `${d}d ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
  };

  // Per-user posture score. Weighted-average across the controls that apply.
  // Returns { pct, band, colour } — same maths as tenant score for consistency.
  const scoreUser = (u) => {
    if (u.suspended || u.archived) return null;
    const items = [];
    items.push({ w: 10, ok: u.has2sv });                                    // MFA enrolled — critical
    items.push({ w: 6,  ok: u.enforced2sv });                               // MFA enforced — high
    items.push({ w: 3,  ok: daysSince(u.lastLogin) != null && daysSince(u.lastLogin) <= 90 }); // Active
    items.push({ w: 6,  ok: !u.apps.some((a) => a.risky) });                // No risky apps — high
    if (u.isAdmin) {
      items.push({ w: 3, ok: u.hasRecovery });                              // Recovery info — medium (admins)
      items.push({ w: 10, ok: u.has2sv });                                  // Admin with MFA — critical (admins)
    }
    const earned = items.reduce((s, i) => s + (i.ok ? i.w : 0), 0);
    const possible = items.reduce((s, i) => s + i.w, 0);
    const pct = Math.round((earned / possible) * 100);
    let colour = '#248a3d', band = 'Strong';
    if (pct < 50) { colour = '#d70015'; band = 'Critical'; }
    else if (pct < 70) { colour = '#c04c00'; band = 'At risk'; }
    else if (pct < 85) { colour = '#0071e3'; band = 'Moderate'; }
    return { pct, band, colour };
  };

  // Compute per-row risk flags for filtering, and score
  const scored = users.map((u) => ({ ...u, score: scoreUser(u) }));
  const activeUsers = scored.filter((u) => !u.suspended && !u.archived);
  const avgScore = activeUsers.length
    ? Math.round(activeUsers.reduce((s, u) => s + (u.score?.pct || 0), 0) / activeUsers.length)
    : 0;

  const rows = scored.map((u) => {
    const flags = [];
    if (u.isAdmin && !u.has2sv) flags.push('admin-no-2sv');
    if (u.isSuperAdmin) flags.push('super-admin');
    if (u.isAdmin) flags.push('admin');
    if (!u.has2sv && !u.suspended) flags.push('no-2sv');
    if (u.suspended) flags.push('suspended');
    if (!u.lastLogin && !u.suspended) flags.push('never-signed-in');
    const dsl = daysSince(u.lastLogin);
    if (dsl != null && dsl > 90 && !u.suspended) flags.push('dormant');
    if (u.apps.some((a) => a.risky)) flags.push('risky-apps');
    if (u.score) {
      if (u.score.pct < 50) flags.push('score-critical');
      else if (u.score.pct < 70) flags.push('score-at-risk');
      else if (u.score.pct < 85) flags.push('score-moderate');
      else flags.push('score-strong');
    }

    const status = u.suspended ? 'Suspended' : u.archived ? 'Archived' : 'Active';
    const statusColour = u.suspended || u.archived ? 'var(--ink-mute)' : 'var(--pass)';
    const mfaIcon = u.has2sv
      ? (u.enforced2sv ? '<span title="Enforced" style="color:var(--pass);font-weight:600">✓ Enforced</span>' : '<span title="Enrolled" style="color:var(--info);font-weight:500">✓ Enrolled</span>')
      : '<span style="color:var(--danger);font-weight:600">✗ Off</span>';
    const roleTag = u.isSuperAdmin
      ? '<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:#fff1f2;color:#9f1239;letter-spacing:.3px">SUPER ADMIN</span>'
      : u.isDelegatedAdmin
      ? '<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:#fef3c7;color:#92400e;letter-spacing:.3px">ADMIN</span>'
      : '<span class="muted" style="font-size:12px">User</span>';
    const appBadge = u.apps.length
      ? `<span class="${u.apps.some((a) => a.risky) ? 'risky' : ''}" style="font-size:12.5px;font-weight:${u.apps.some((a) => a.risky) ? '600' : '400'}">${u.apps.length}${u.apps.some((a) => a.risky) ? ' ⚠' : ''}</span>`
      : '<span class="muted" style="font-size:12.5px">0</span>';

    // Score cell: mini gauge + percentage
    const scoreCell = u.score
      ? `<div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
           <div style="width:70px;height:5px;background:var(--bg-inset);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${u.score.pct}%;background:${u.score.colour}"></i></div>
           <div style="font-weight:600;color:${u.score.colour};min-width:36px;text-align:right;font-size:13.5px">${u.score.pct}%</div>
         </div>`
      : '<span class="muted" style="font-size:12.5px">—</span>';

    const scorePctData = u.score ? u.score.pct : -1;

    return `<tr class="urow" data-flags="${flags.join(' ')}" data-text="${esc((u.email + ' ' + u.fullName).toLowerCase())}" data-score="${scorePctData}" onclick="window.location.href='${baseUrl}/tenant/${encodeURIComponent(tenant)}/user/${encodeURIComponent(u.email)}'" style="cursor:pointer">
      <td>
        <div class="head" style="font-weight:600;font-size:13.5px">${esc(u.email)}</div>
        ${u.fullName ? `<div class="muted" style="font-size:11.5px;margin-top:2px">${esc(u.fullName)}</div>` : ''}
      </td>
      <td>${roleTag}</td>
      <td style="text-align:center">${mfaIcon}</td>
      <td class="muted">${esc(fmtLastLogin(u.lastLogin))}</td>
      <td style="text-align:center">${appBadge}</td>
      <td style="text-align:right">${scoreCell}</td>
      <td style="color:${statusColour};font-size:12.5px;font-weight:${status === 'Active' ? '400' : '500'}">${status}</td>
    </tr>`;
  }).join('');

  // Counts for filter chips
  const c = {
    admin: scored.filter((u) => u.isAdmin).length,
    noMfa: scored.filter((u) => !u.has2sv && !u.suspended).length,
    adminNoMfa: scored.filter((u) => u.isAdmin && !u.has2sv).length,
    dormant: scored.filter((u) => { const d = daysSince(u.lastLogin); return d != null && d > 90 && !u.suspended; }).length,
    neverIn: scored.filter((u) => !u.lastLogin && !u.suspended).length,
    suspended: scored.filter((u) => u.suspended).length,
    riskyApps: scored.filter((u) => u.apps.some((a) => a.risky)).length,
    scoreCritical: scored.filter((u) => u.score && u.score.pct < 50).length,
    scoreAtRisk: scored.filter((u) => u.score && u.score.pct >= 50 && u.score.pct < 70).length,
  };
  const filterChip = (flag, label, count, colour = 'var(--ink-mute)') =>
    `<button class="chip" onclick="toggleUserFilter(this,'${flag}')"><span class="dot" style="background:${colour}"></span>${label} <span class="n">${count}</span></button>`;

  // Score distribution summary bar
  const dist = {
    strong: scored.filter((u) => u.score && u.score.pct >= 85).length,
    moderate: scored.filter((u) => u.score && u.score.pct >= 70 && u.score.pct < 85).length,
    atRisk: scored.filter((u) => u.score && u.score.pct >= 50 && u.score.pct < 70).length,
    critical: scored.filter((u) => u.score && u.score.pct < 50).length,
  };
  const totalScored = dist.strong + dist.moderate + dist.atRisk + dist.critical;
  const pctOf = (n) => totalScored ? (n / totalScored) * 100 : 0;

  const avgColour = avgScore >= 85 ? '#248a3d' : avgScore >= 70 ? '#0071e3' : avgScore >= 50 ? '#c04c00' : '#d70015';
  const avgBand = avgScore >= 85 ? 'Strong' : avgScore >= 70 ? 'Moderate' : avgScore >= 50 ? 'At risk' : 'Critical';

  return `<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:18px">
    <div class="card" style="padding:22px 26px;flex:1;min-width:280px;display:flex;align-items:center;gap:22px">
      <div style="position:relative;width:88px;height:88px;flex:0 0 88px">
        <svg width="88" height="88" viewBox="0 0 88 88" style="transform:rotate(-90deg)">
          <circle cx="44" cy="44" r="38" fill="none" stroke="var(--bg-inset)" stroke-width="7"/>
          <circle cx="44" cy="44" r="38" fill="none" stroke="${avgColour}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * 38}" stroke-dashoffset="${2 * Math.PI * 38 * (1 - avgScore / 100)}"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <b class="head" style="font-size:22px;font-weight:600;letter-spacing:-0.02em">${avgScore}<span style="font-size:12px;color:var(--ink-mute);font-weight:500">%</span></b>
        </div>
      </div>
      <div>
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:600">Average user posture</div>
        <div class="head" style="font-size:16px;font-weight:600;margin-top:4px;color:${avgColour}">${avgBand}</div>
        <div class="muted" style="font-size:12px;margin-top:6px">Across ${activeUsers.length} active user${activeUsers.length === 1 ? '' : 's'}</div>
      </div>
    </div>
    <div class="card" style="padding:22px 26px;flex:1.5;min-width:340px">
      <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:12px">Posture distribution</div>
      <div style="display:flex;height:10px;border-radius:20px;overflow:hidden;background:var(--bg-inset)">
        ${dist.critical ? `<div style="width:${pctOf(dist.critical)}%;background:#d70015" title="Critical: ${dist.critical}"></div>` : ''}
        ${dist.atRisk ? `<div style="width:${pctOf(dist.atRisk)}%;background:#c04c00" title="At risk: ${dist.atRisk}"></div>` : ''}
        ${dist.moderate ? `<div style="width:${pctOf(dist.moderate)}%;background:#0071e3" title="Moderate: ${dist.moderate}"></div>` : ''}
        ${dist.strong ? `<div style="width:${pctOf(dist.strong)}%;background:#248a3d" title="Strong: ${dist.strong}"></div>` : ''}
      </div>
      <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap;font-size:12.5px">
        <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#d70015;margin-right:6px"></span><b>${dist.critical}</b> <span class="muted">Critical</span></div>
        <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#c04c00;margin-right:6px"></span><b>${dist.atRisk}</b> <span class="muted">At risk</span></div>
        <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#0071e3;margin-right:6px"></span><b>${dist.moderate}</b> <span class="muted">Moderate</span></div>
        <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#248a3d;margin-right:6px"></span><b>${dist.strong}</b> <span class="muted">Strong</span></div>
      </div>
    </div>
  </div>

  <div class="card" style="padding:14px 18px;margin-bottom:16px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);font-weight:600;min-width:60px">Risk</span>
      ${filterChip('score-critical', 'Score < 50', c.scoreCritical, 'var(--danger)')}
      ${filterChip('score-at-risk', 'Score 50–69', c.scoreAtRisk, 'var(--warn)')}
      ${filterChip('admin', 'Admins', c.admin, 'var(--warn)')}
      ${filterChip('admin-no-2sv', 'Admin without MFA', c.adminNoMfa, 'var(--danger)')}
      ${filterChip('no-2sv', 'No MFA', c.noMfa, 'var(--danger)')}
      ${filterChip('dormant', 'Dormant 90d+', c.dormant, 'var(--warn)')}
      ${filterChip('never-signed-in', 'Never signed in', c.neverIn, 'var(--info)')}
      ${filterChip('risky-apps', 'Risky apps', c.riskyApps, 'var(--danger)')}
      ${filterChip('suspended', 'Suspended', c.suspended)}
      <div style="flex:1"></div>
      <input class="searchbox" id="uSearch" placeholder="Search email or name…" oninput="applyUserFilter()">
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--line)">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);font-weight:600;min-width:60px">Sort</span>
      <select id="uSort" onchange="applyUserFilter()" style="background:var(--bg-elev);border:1px solid var(--line-2);border-radius:8px;padding:6px 10px;color:var(--ink);font-size:13px;font-family:inherit">
        <option value="score-asc">Score (worst first)</option>
        <option value="score-desc">Score (best first)</option>
        <option value="email">Email (A→Z)</option>
        <option value="last-login">Last login (recent first)</option>
      </select>
      <div style="flex:1"></div>
      <button class="chip" onclick="clearUserFilters()">Clear all</button>
    </div>
  </div>
  <div class="card" style="overflow:hidden">
    <div style="padding:16px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">Users</h3>
      <span class="muted" style="font-size:12.5px" id="uSummary">${users.length} total</span>
    </div>
    <table class="dtable"><thead><tr>
      <th>User</th><th>Role</th><th style="text-align:center">MFA</th><th>Last login</th><th style="text-align:center">Apps</th><th style="text-align:right">Score</th><th>Status</th>
    </tr></thead><tbody id="uBody">${rows}</tbody></table>
  </div>
  ${users.length >= 500 ? `<p class="muted" style="text-align:center;font-size:12px;margin-top:14px">Showing first 500 users. Full directory scanned for scoring; capped here for page performance.</p>` : ''}
  <script>
    const uFlags = new Set();
    function toggleUserFilter(btn, flag) {
      if (uFlags.has(flag)) { uFlags.delete(flag); btn.classList.remove('on'); }
      else { uFlags.add(flag); btn.classList.add('on'); }
      applyUserFilter();
    }
    function clearUserFilters() {
      uFlags.clear();
      document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
      document.getElementById('uSearch').value = '';
      document.getElementById('uSort').value = 'score-asc';
      applyUserFilter();
    }
    function applyUserFilter() {
      const search = (document.getElementById('uSearch').value || '').trim().toLowerCase();
      const sortBy = document.getElementById('uSort').value;
      let shown = 0;
      const rows = [...document.querySelectorAll('.urow')];
      rows.forEach(r => {
        const rowFlags = (r.dataset.flags || '').split(' ');
        const tx = r.dataset.text;
        let ok = true;
        for (const f of uFlags) if (!rowFlags.includes(f)) { ok = false; break; }
        if (search && !tx.includes(search)) ok = false;
        r.classList.toggle('hidden', !ok);
        if (ok) shown++;
      });
      // Sort
      const body = document.getElementById('uBody');
      rows.sort((a, b) => {
        const sa = Number(a.dataset.score), sb = Number(b.dataset.score);
        if (sortBy === 'score-asc') {
          // Push -1 (no score, suspended) to the end
          if (sa === -1 && sb !== -1) return 1;
          if (sb === -1 && sa !== -1) return -1;
          return sa - sb;
        }
        if (sortBy === 'score-desc') {
          if (sa === -1 && sb !== -1) return 1;
          if (sb === -1 && sa !== -1) return -1;
          return sb - sa;
        }
        if (sortBy === 'email') return a.dataset.text.localeCompare(b.dataset.text);
        if (sortBy === 'last-login') {
          // fallback: use existing DOM order (already newest first from data)
          return 0;
        }
        return 0;
      });
      rows.forEach(r => body.appendChild(r));

      const total = rows.length;
      document.getElementById('uSummary').textContent = shown === total ? total + ' total' : shown + ' of ' + total;
    }
    // Default sort on load: worst score first (most useful for a triage view)
    applyUserFilter();
  </script>`;
}

function userDetailPage(details, email, baseUrl, tenant) {
  const u = (details.users || []).find((x) => x.email === email);
  if (!u) return `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">User not found in the latest scan. <a href="${baseUrl}/tenant/${encodeURIComponent(tenant)}?cat=users">Back to users</a></div>`;

  const fmt = (t) => t ? new Date(t).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const daysSince = (t) => t ? Math.floor((Date.now() - Date.parse(t)) / 864e5) : null;
  const daysSinceLogin = daysSince(u.lastLogin);

  // Same score maths as the list — kept in sync.
  const scoreUser = () => {
    if (u.suspended || u.archived) return null;
    const items = [];
    items.push({ w: 10, ok: u.has2sv, label: 'MFA enrolled', level: 'critical' });
    items.push({ w: 6,  ok: u.enforced2sv, label: 'MFA enforced by policy', level: 'high' });
    items.push({ w: 3,  ok: daysSince(u.lastLogin) != null && daysSince(u.lastLogin) <= 90, label: 'Signed in within 90 days', level: 'medium' });
    items.push({ w: 6,  ok: !u.apps.some((a) => a.risky), label: 'No risky third-party apps granted', level: 'high' });
    if (u.isAdmin) {
      items.push({ w: 3, ok: u.hasRecovery, label: 'Recovery info set (admin)', level: 'medium' });
      items.push({ w: 10, ok: u.has2sv, label: 'Admin with MFA', level: 'critical' });
    }
    const earned = items.reduce((s, i) => s + (i.ok ? i.w : 0), 0);
    const possible = items.reduce((s, i) => s + i.w, 0);
    const pct = Math.round((earned / possible) * 100);
    let colour = '#248a3d', band = 'Strong';
    if (pct < 50) { colour = '#d70015'; band = 'Critical'; }
    else if (pct < 70) { colour = '#c04c00'; band = 'At risk'; }
    else if (pct < 85) { colour = '#0071e3'; band = 'Moderate'; }
    return { pct, band, colour, items };
  };
  const score = scoreUser();

  // Risk flags for a summary strip at the top
  const flags = [];
  if (u.isAdmin && !u.has2sv) flags.push({ level: 'critical', text: 'Admin account without MFA' });
  else if (!u.has2sv && !u.suspended) flags.push({ level: 'high', text: 'MFA not enrolled' });
  if (u.isAdmin && !u.hasRecovery) flags.push({ level: 'medium', text: 'Admin without recovery info set' });
  if (daysSinceLogin != null && daysSinceLogin > 90 && !u.suspended) flags.push({ level: 'medium', text: `Dormant — last signed in ${daysSinceLogin} days ago` });
  if (!u.lastLogin && !u.suspended) flags.push({ level: 'medium', text: 'Account has never signed in' });
  if (u.apps.some((a) => a.risky)) flags.push({ level: 'high', text: `Granted access to ${u.apps.filter((a) => a.risky).length} risky third-party app(s)` });

  const flagStrip = flags.length ? `<div class="card" style="padding:16px 20px;margin-bottom:18px;border-left:3px solid ${flags.some((f) => f.level === 'critical') ? 'var(--danger)' : 'var(--warn)'}">
    <div class="head" style="font-weight:600;font-size:13.5px;margin-bottom:8px">Risks flagged for this user</div>
    <ul style="margin:0;padding-left:20px;font-size:13.5px;color:var(--ink-2)">
      ${flags.map((f) => `<li style="margin:3px 0"><span style="color:${SEV[f.level]};font-weight:600">${f.level.toUpperCase()}</span> · ${esc(f.text)}</li>`).join('')}
    </ul>
  </div>` : `<div class="card" style="padding:16px 20px;margin-bottom:18px;border-left:3px solid var(--pass)">
    <div class="head" style="font-weight:600;font-size:13.5px;color:var(--pass)">✓ No security risks flagged for this user</div>
  </div>`;

  const kv = (label, value) => `<div style="padding:11px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:16px">
    <div class="muted" style="font-size:12.5px;width:180px;flex:0 0 180px">${esc(label)}</div>
    <div style="font-size:13.5px;color:var(--ink);flex:1">${value}</div></div>`;
  const yesNo = (b, goodIsTrue = true) => {
    const good = goodIsTrue ? b : !b;
    return `<span style="color:${good ? 'var(--pass)' : 'var(--danger)'};font-weight:600">${b ? 'Yes' : 'No'}</span>`;
  };

  // Header card with avatar + posture gauge side-by-side
  const scoreCard = score ? `
    <div style="display:flex;align-items:center;gap:20px;padding-left:24px;border-left:1px solid var(--line);margin-left:8px">
      <div style="position:relative;width:82px;height:82px;flex:0 0 82px">
        <svg width="82" height="82" viewBox="0 0 82 82" style="transform:rotate(-90deg)">
          <circle cx="41" cy="41" r="35" fill="none" stroke="var(--bg-inset)" stroke-width="7"/>
          <circle cx="41" cy="41" r="35" fill="none" stroke="${score.colour}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * 35}" stroke-dashoffset="${2 * Math.PI * 35 * (1 - score.pct / 100)}"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <b class="head" style="font-size:20px;font-weight:600;letter-spacing:-0.02em">${score.pct}<span style="font-size:11px;color:var(--ink-mute);font-weight:500">%</span></b>
        </div>
      </div>
      <div>
        <div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;font-weight:600">Posture score</div>
        <div class="head" style="font-size:15px;font-weight:600;margin-top:4px;color:${score.colour}">${score.band}</div>
      </div>
    </div>` : '';

  const scoreBreakdown = score ? `<div class="card" style="padding:20px 24px;margin-bottom:16px">
    <h3 class="head" style="margin:0 0 12px;font-size:14px;font-weight:600">Score breakdown</h3>
    <div style="font-size:12.5px;color:var(--ink-dim);margin-bottom:12px">How this user's ${score.pct}% posture score was calculated. Each control is weighted by severity.</div>
    ${score.items.map((it) => `<div style="display:flex;align-items:center;gap:14px;padding:8px 0;border-bottom:1px solid var(--line)">
      <span style="color:${it.ok ? 'var(--pass)' : 'var(--danger)'};font-weight:600;width:16px">${it.ok ? '✓' : '✗'}</span>
      <div style="flex:1;font-size:13.5px">${esc(it.label)}</div>
      <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;color:#fff;background:${SEV[it.level]};text-transform:uppercase;letter-spacing:.3px">${it.level}</span>
      <span class="muted" style="font-size:12px;width:52px;text-align:right">${it.ok ? '+' : ''}${it.ok ? it.w : 0}/${it.w}</span>
    </div>`).join('')}
  </div>` : '';

  const appsSection = u.apps.length ? `<div class="card" style="overflow:hidden;margin-bottom:16px">
    <div style="padding:16px 22px;border-bottom:1px solid var(--line)">
      <h3 class="head" style="margin:0;font-size:15px;font-weight:600">Third-party apps granted <span class="muted" style="font-size:12.5px;font-weight:400;margin-left:6px">${u.apps.length}</span></h3>
    </div>
    <table class="dtable"><thead><tr><th>Application</th><th style="text-align:center">Risk</th><th style="text-align:center">Scopes</th></tr></thead><tbody>
      ${u.apps.map((a) => `<tr>
        <td><div class="head" style="font-weight:500;font-size:13.5px">${esc(a.name)}</div></td>
        <td class="${a.risky ? 'risky' : ''}" style="text-align:center">${a.risky ? 'High' : 'Standard'}</td>
        <td style="text-align:center" class="muted">${a.scopeCount}</td>
      </tr>`).join('')}
    </tbody></table></div>` : '';

  return `${flagStrip}
    <div class="card" style="padding:22px 26px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:52px;height:52px;border-radius:50%;background:var(--accent-tint);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:20px">${esc((u.fullName || u.email).charAt(0).toUpperCase())}</div>
        <div style="flex:1">
          <div class="head" style="font-size:19px;font-weight:600;letter-spacing:-0.015em">${esc(u.fullName || u.email)}</div>
          <div class="muted" style="font-size:13px;margin-top:2px">${esc(u.email)}</div>
        </div>
        ${scoreCard}
      </div>
    </div>

    ${scoreBreakdown}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card" style="padding:18px 24px">
        <h3 class="head" style="margin:0 0 4px;font-size:14px;font-weight:600">Account</h3>
        ${kv('Status', u.suspended ? '<span style="color:var(--ink-mute)">Suspended</span>' : u.archived ? '<span style="color:var(--ink-mute)">Archived</span>' : '<span style="color:var(--pass);font-weight:600">Active</span>')}
        ${kv('Organizational unit', `<code style="font-size:12.5px;background:var(--bg-inset);padding:2px 7px;border-radius:4px">${esc(u.orgUnit)}</code>`)}
        ${kv('Created', esc(fmt(u.creationTime)))}
        ${kv('Last sign-in', u.lastLogin ? esc(fmt(u.lastLogin)) + (daysSinceLogin != null ? ` <span class="muted">(${daysSinceLogin}d ago)</span>` : '') : '<span style="color:var(--warn)">Never</span>')}
      </div>
      <div class="card" style="padding:18px 24px">
        <h3 class="head" style="margin:0 0 4px;font-size:14px;font-weight:600">Security</h3>
        ${kv('2-Step Verification enrolled', yesNo(u.has2sv))}
        ${kv('2SV enforced by policy', yesNo(u.enforced2sv))}
        ${kv('Recovery info set', yesNo(u.hasRecovery))}
        ${kv('Admin role', u.isSuperAdmin ? '<span style="color:var(--danger);font-weight:600">Super Admin</span>' : u.isDelegatedAdmin ? '<span style="color:var(--warn);font-weight:600">Delegated Admin</span>' : '<span class="muted">User</span>')}
      </div>
    </div>

    ${appsSection}

    <div style="margin-top:20px;display:flex;gap:10px">
      <a class="btn ghost" href="${baseUrl}/tenant/${encodeURIComponent(tenant)}?cat=users">← Back to users</a>
      <a class="btn fix" href="https://admin.google.com/ac/users/${encodeURIComponent(u.email)}" target="_blank" rel="noopener">Open in Admin Console →</a>
    </div>`;
}

function emailDeepDivePage(details, tenant) {
  const emailSec = details.emailSecurity || {};
  const domains = Object.keys(emailSec);
  if (!domains.length) return `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">No verified domains found in this scan.</div>`;

  const SEV_C = { critical: '#d70015', high: '#c04c00', medium: '#0071e3', low: '#248a3d' };
  const statusIcon = (s) => s === 'pass' ? '<span style="color:var(--pass);font-weight:600;font-size:15px">✓</span>'
    : s === 'partial' ? '<span style="color:var(--warn);font-weight:600;font-size:15px">◐</span>'
    : s === 'unknown' ? '<span style="color:var(--info);font-weight:600;font-size:15px">?</span>'
    : '<span style="color:var(--danger);font-weight:600;font-size:15px">✗</span>';
  const statusLabel = (s) => ({ pass: 'Pass', partial: 'Partial', unknown: 'Review', fail: 'Fail' })[s] || s;

  const domainCards = domains.map((d) => {
    const data = emailSec[d];
    if (data.error) return `<div class="card" style="padding:20px 24px;margin-bottom:14px">
      <h3 class="head" style="margin:0 0 4px;font-size:15px;font-weight:600">${esc(d)}</h3>
      <div style="color:var(--danger);font-size:13px">Could not analyse: ${esc(data.error)}</div>
    </div>`;

    const s = data.score;
    const checkRow = (c) => `<div style="display:flex;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)">
      <div style="width:20px;flex:0 0 20px;text-align:center;padding-top:1px">${statusIcon(c.status)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="head" style="font-weight:500;font-size:13.5px">${esc(c.label)}</span>
          <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;color:#fff;background:${SEV_C[c.severity]};text-transform:uppercase;letter-spacing:.3px">${c.severity}</span>
          <span style="font-size:11.5px;color:${c.status === 'pass' ? 'var(--pass)' : c.status === 'partial' ? 'var(--warn)' : c.status === 'unknown' ? 'var(--info)' : 'var(--danger)'};font-weight:600;margin-left:auto">${statusLabel(c.status)}</span>
        </div>
        <div class="dim" style="font-size:12.5px;margin-top:4px;line-height:1.5">${esc(c.detail)}</div>
        ${c.fix ? `<div style="font-size:12.5px;margin-top:4px;color:var(--ink-dim)"><span style="color:var(--accent);font-weight:500">Fix ›</span> ${esc(c.fix)}</div>` : ''}
      </div>
    </div>`;

    // Group checks by section for readability
    const groups = [
      { name: 'SPF', ids: ['spf-present', 'spf-qualifier', 'spf-lookups', 'spf-google'] },
      { name: 'DMARC', ids: ['dmarc-present', 'dmarc-policy', 'dmarc-subdomain', 'dmarc-reporting'] },
      { name: 'DKIM', ids: ['dkim-present', 'dkim-strength'] },
      { name: 'Mail routing', ids: ['mx-present', 'mx-google'] },
      { name: 'Transport security', ids: ['mta-sts', 'tls-rpt'] },
      { name: 'Brand & DNS integrity', ids: ['bimi', 'dnssec'] },
    ];

    const groupsHtml = groups.map((g) => {
      const items = data.checks.filter((c) => g.ids.includes(c.id));
      if (!items.length) return '';
      return `<div style="margin-top:14px">
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;padding:8px 0 4px">${g.name}</div>
        ${items.map(checkRow).join('')}
      </div>`;
    }).join('');

    // Raw records panel (collapsed by default) — useful for consultants who want to paste into a ticket.
    const rawRecords = [];
    if (data.spf) rawRecords.push({ label: 'SPF', value: data.spf.record });
    if (data.dmarc) rawRecords.push({ label: 'DMARC', value: data.dmarc.record });
    (data.dkim || []).forEach((k) => rawRecords.push({ label: `DKIM (${k.selector})`, value: k.record }));
    if (data.mx?.records) data.mx.records.forEach((r) => rawRecords.push({ label: 'MX', value: `${r.priority} ${r.exchange}` }));

    const rawPanel = rawRecords.length ? `<details style="margin-top:14px">
      <summary style="cursor:pointer;color:var(--accent);font-size:12.5px;font-weight:500;user-select:none">Show raw DNS records</summary>
      <div style="margin-top:10px;background:var(--bg-inset);border-radius:8px;padding:14px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--ink-2);line-height:1.6;overflow-x:auto">
        ${rawRecords.map((r) => `<div style="padding:3px 0;word-break:break-all"><span style="color:var(--ink-mute);font-weight:600;margin-right:8px">${esc(r.label)}</span>${esc(r.value || '')}</div>`).join('')}
      </div>
    </details>` : '';

    // Passes vs total for the summary chip
    const passed = data.checks.filter((c) => c.status === 'pass').length;
    const total = data.checks.length;

    return `<div class="card" style="padding:22px 26px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:6px">
        <div style="position:relative;width:72px;height:72px;flex:0 0 72px">
          <svg width="72" height="72" viewBox="0 0 72 72" style="transform:rotate(-90deg)">
            <circle cx="36" cy="36" r="30" fill="none" stroke="var(--bg-inset)" stroke-width="6"/>
            <circle cx="36" cy="36" r="30" fill="none" stroke="${s.colour}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * 30}" stroke-dashoffset="${2 * Math.PI * 30 * (1 - s.pct / 100)}"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <b class="head" style="font-size:17px;font-weight:600;letter-spacing:-0.02em">${s.pct}<span style="font-size:10px;color:var(--ink-mute);font-weight:500">%</span></b>
          </div>
        </div>
        <div style="flex:1">
          <h3 class="head" style="margin:0;font-size:17px;font-weight:600;letter-spacing:-0.015em">${esc(d)}</h3>
          <div class="muted" style="font-size:12.5px;margin-top:3px">Email-security posture · <span style="color:${s.colour};font-weight:600">${s.band}</span> · ${passed} of ${total} checks pass</div>
        </div>
      </div>
      ${groupsHtml}
      ${rawPanel}
    </div>`;
  }).join('');

  // Overall summary across all domains
  const overall = domains.reduce((acc, d) => {
    if (emailSec[d].error) return acc;
    return { pct: acc.pct + emailSec[d].score.pct, n: acc.n + 1 };
  }, { pct: 0, n: 0 });
  const avg = overall.n ? Math.round(overall.pct / overall.n) : 0;
  const avgColour = avg >= 85 ? '#248a3d' : avg >= 70 ? '#0071e3' : avg >= 50 ? '#c04c00' : '#d70015';

  const summary = overall.n > 1 ? `<div class="card" style="padding:22px 26px;margin-bottom:16px;display:flex;align-items:center;gap:24px">
    <div style="position:relative;width:82px;height:82px;flex:0 0 82px">
      <svg width="82" height="82" viewBox="0 0 82 82" style="transform:rotate(-90deg)">
        <circle cx="41" cy="41" r="35" fill="none" stroke="var(--bg-inset)" stroke-width="7"/>
        <circle cx="41" cy="41" r="35" fill="none" stroke="${avgColour}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * 35}" stroke-dashoffset="${2 * Math.PI * 35 * (1 - avg / 100)}"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <b class="head" style="font-size:20px;font-weight:600;letter-spacing:-0.02em">${avg}<span style="font-size:11px;color:var(--ink-mute);font-weight:500">%</span></b>
      </div>
    </div>
    <div>
      <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:600">Overall email posture</div>
      <div class="head" style="font-size:15px;font-weight:600;margin-top:4px;color:${avgColour}">Across ${overall.n} verified domain${overall.n === 1 ? '' : 's'}</div>
    </div>
  </div>` : '';

  return `${summary}${domainCards}
    <p class="muted" style="text-align:center;font-size:12px;margin-top:22px">All checks performed via live DNS lookups. No mail is sent. DKIM selectors probed: google, google2048, common dated selectors.</p>`;
}

function activityTimelinePage(details, baseUrl, tenant) {
  const activity = details.activity || {};
  if (activity.error) return `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">Activity timeline could not be loaded: ${esc(activity.error)}</div>`;
  const events = activity.events || [];
  if (!events.length) return `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">No activity captured in the last ${activity.windowDays || 30} days, or the Reports API scope wasn't consented.</div>`;

  const APP_LABEL = { login: 'Login', admin: 'Admin', token: 'OAuth', drive: 'Drive', groups: 'Groups', saml: 'SSO' };
  const APP_COLOUR = { login: '#0071e3', admin: '#c04c00', token: '#7c3aed', drive: '#248a3d', groups: '#8e8e93', saml: '#0891b2' };
  const SEV_C = { critical: '#d70015', high: '#c04c00', medium: '#0071e3', low: '#8e8e93' };

  const fmtDateTime = (t) => new Date(t).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  const fmtTime = (t) => new Date(t).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

  // Attention strip
  const attentionStrip = activity.attention?.length ? `<div class="card" style="padding:18px 22px;margin-bottom:18px;border-left:3px solid var(--danger)">
    <div class="head" style="font-weight:600;font-size:14.5px;margin-bottom:10px">Attention needed <span class="muted" style="font-size:12px;font-weight:400;margin-left:6px">${activity.attention.length} event${activity.attention.length === 1 ? '' : 's'}</span></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${activity.attention.map((e) => `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px">
        <span style="font-size:10px;font-weight:600;letter-spacing:.4px;color:#fff;background:${SEV_C[e.severity]};padding:3px 8px;border-radius:5px;text-transform:uppercase;flex:0 0 auto">${e.severity}</span>
        <span style="flex:1;color:var(--ink)">${esc(e.summary)}</span>
        <span class="muted" style="font-size:12px">${esc(e.user)}</span>
        <span class="muted" style="font-size:12px;min-width:120px;text-align:right">${esc(fmtDateTime(e.at))}</span>
      </div>`).join('')}
    </div>
  </div>` : `<div class="card" style="padding:16px 20px;margin-bottom:18px;border-left:3px solid var(--pass)">
    <div class="head" style="font-weight:600;font-size:13.5px;color:var(--pass)">✓ No high-severity events flagged in the last ${activity.windowDays} days</div>
  </div>`;

  // Daily activity chart (simple bars)
  const byDay = activity.stats?.byDay || {};
  const dayKeys = Object.keys(byDay).sort();
  const maxDay = Math.max(...Object.values(byDay), 1);
  const chart = dayKeys.length ? `<div class="card" style="padding:20px 24px;margin-bottom:16px">
    <h3 class="head" style="margin:0 0 14px;font-size:14px;font-weight:600">Events per day <span class="muted" style="font-size:12.5px;font-weight:400;margin-left:6px">${activity.stats.total} total in ${activity.windowDays} days</span></h3>
    <div style="display:flex;gap:2px;align-items:flex-end;height:80px">
      ${dayKeys.map((d) => {
        const c = byDay[d];
        const h = Math.max(2, Math.round((c / maxDay) * 76));
        return `<div title="${d}: ${c} events" style="flex:1;background:var(--accent);opacity:${0.3 + 0.7 * (c / maxDay)};height:${h}px;border-radius:3px 3px 0 0;min-width:2px"></div>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--ink-mute)">
      <span>${dayKeys[0]}</span>
      <span>${dayKeys[dayKeys.length - 1]}</span>
    </div>
  </div>` : '';

  // Counts for filter chips
  const bySev = activity.stats?.bySeverity || {};
  const byApp = activity.stats?.byApp || {};

  // Build the event feed
  const rows = events.map((e) => {
    const flags = [`sev-${e.severity}`, `app-${e.app}`];
    return `<div class="evrow" data-flags="${flags.join(' ')}" data-text="${esc((e.summary + ' ' + e.user + ' ' + e.action).toLowerCase())}" style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:13px">
      <span style="width:6px;height:6px;border-radius:50%;background:${SEV_C[e.severity]};flex:0 0 6px"></span>
      <span style="font-size:10px;font-weight:600;letter-spacing:.3px;color:#fff;background:${APP_COLOUR[e.app] || 'var(--ink-mute)'};padding:2px 7px;border-radius:4px;text-transform:uppercase;flex:0 0 auto;min-width:52px;text-align:center">${APP_LABEL[e.app] || e.app}</span>
      <span style="flex:1;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.summary)}</span>
      <span class="muted" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 0 auto">${esc(e.user)}</span>
      <span class="muted" style="font-size:11.5px;min-width:110px;text-align:right;flex:0 0 auto">${esc(fmtDateTime(e.at))}</span>
    </div>`;
  }).join('');

  const chip = (flag, label, count, colour = 'var(--ink-mute)') =>
    `<button class="chip" onclick="toggleEventFilter(this,'${flag}')"><span class="dot" style="background:${colour}"></span>${label} <span class="n">${count}</span></button>`;

  return `${attentionStrip}${chart}
    <div class="card" style="padding:14px 18px;margin-bottom:16px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);font-weight:600;min-width:66px">Severity</span>
        ${chip('sev-critical', 'Critical', bySev.critical || 0, SEV_C.critical)}
        ${chip('sev-high', 'High', bySev.high || 0, SEV_C.high)}
        ${chip('sev-medium', 'Medium', bySev.medium || 0, SEV_C.medium)}
        ${chip('sev-low', 'Low', bySev.low || 0, SEV_C.low)}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-mute);font-weight:600;min-width:66px">App</span>
        ${chip('app-login', 'Login', byApp.login || 0, APP_COLOUR.login)}
        ${chip('app-admin', 'Admin', byApp.admin || 0, APP_COLOUR.admin)}
        ${chip('app-token', 'OAuth', byApp.token || 0, APP_COLOUR.token)}
        ${chip('app-drive', 'Drive', byApp.drive || 0, APP_COLOUR.drive)}
        ${chip('app-groups', 'Groups', byApp.groups || 0, APP_COLOUR.groups)}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--line)">
        <input class="searchbox" id="evSearch" placeholder="Search event, user, or action…" oninput="applyEventFilter()">
        <button class="chip" onclick="clearEventFilters()">Clear all</button>
      </div>
    </div>
    <div class="card" style="overflow:hidden">
      <div style="padding:14px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center">
        <h3 class="head" style="margin:0;font-size:15px;font-weight:600;flex:1">Event feed</h3>
        <span class="muted" style="font-size:12.5px" id="evSummary">${events.length} events</span>
      </div>
      <div id="evBody">${rows}</div>
    </div>
    <p class="muted" style="text-align:center;font-size:12px;margin-top:22px">Last ${activity.windowDays} days · Reports API has ingestion lag (minutes to hours); most recent events may not yet be visible.</p>
    <script>
      const evFlags = new Set();
      function toggleEventFilter(btn, flag) {
        if (evFlags.has(flag)) { evFlags.delete(flag); btn.classList.remove('on'); }
        else { evFlags.add(flag); btn.classList.add('on'); }
        applyEventFilter();
      }
      function clearEventFilters() {
        evFlags.clear();
        document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
        document.getElementById('evSearch').value = '';
        applyEventFilter();
      }
      function applyEventFilter() {
        const search = (document.getElementById('evSearch').value || '').trim().toLowerCase();
        // Group flags by prefix — within group = OR, across groups = AND
        const byCat = { sev: [], app: [] };
        evFlags.forEach(f => {
          if (f.startsWith('sev-')) byCat.sev.push(f);
          else if (f.startsWith('app-')) byCat.app.push(f);
        });
        let shown = 0;
        document.querySelectorAll('.evrow').forEach(r => {
          const rowFlags = (r.dataset.flags || '').split(' ');
          let ok = true;
          for (const [, arr] of Object.entries(byCat)) {
            if (arr.length && !arr.some(f => rowFlags.includes(f))) { ok = false; break; }
          }
          if (ok && search && !r.dataset.text.includes(search)) ok = false;
          r.classList.toggle('hidden', !ok);
          if (ok) shown++;
        });
        const total = document.querySelectorAll('.evrow').length;
        document.getElementById('evSummary').textContent = shown === total ? total + ' events' : shown + ' of ' + total;
      }
    </script>`;
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

export function dashboardPage(scan, accepted, baseUrl, history = [], drift = null, category = 'overview', roleHint = { role: 'client' }) {
  const isMsp = roleHint?.role === 'msp';
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
  moduleCounts.users = (scan.details?.users || []).length || null;

  const cat = CATEGORIES[category] || CATEGORIES.overview;
  let title = cat.label, sub = `${scan.org.platform} · scanned ${date}`, content = '', showFilters = true;

  if (category === 'overview') {
    title = 'Overview';
    content = overviewContent(scan, pct, band, sev, modules, drift, history, baseUrl, tenant);
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
  } else if (category === 'emailDeep') {
    title = 'Email security deep dive';
    sub = 'Live DNS analysis per verified domain: SPF, DMARC, DKIM, MX, MTA-STS, BIMI, DNSSEC.';
    content = emailDeepDivePage(scan.details || {}, tenant);
    showFilters = false;
  } else if (category === 'activity') {
    title = 'Activity timeline';
    sub = 'Last 30 days of login, admin, OAuth, Drive, and group activity from the Reports API.';
    content = activityTimelinePage(scan.details || {}, baseUrl, tenant);
    showFilters = false;
  } else if (category === 'users') {
    title = 'Users';
    sub = 'Full directory with per-user security posture.';
    content = usersListPage(scan.details || {}, baseUrl, tenant);
    showFilters = false;
  } else if (category && category.startsWith('user:')) {
    const email = decodeURIComponent(category.slice(5));
    title = email;
    sub = 'Per-user security posture';
    content = userDetailPage(scan.details || {}, email, baseUrl, tenant);
    showFilters = false;
  } else {
    const catModules = modules.filter((m) => cat.modules.includes(m.name));
    const catFindings = catModules.flatMap((m) => m.items);
    content = (catModules.length
      ? `${filterBar(catFindings, accepted, true)}${catModules.map((m) => moduleBlock(m, accepted, baseUrl, tenant)).join('')}<div class="no-results hidden" id="noResults">No findings match the current filters. <a href="#" onclick="clearFilters();return false">Clear filters</a></div>`
      : `<div class="card" style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">No controls in this category yet.</div>`);
  }

  // MSPs re-scanning must keep mode=msp — otherwise the OAuth callback defaults to
  // mode=client, which both demotes the MSP's session to a client bound to this
  // tenant AND (now that billing exists) routes them into the payment wall.
  const rescanMode = isMsp ? '?mode=msp' : '';

  return `<!doctype html>${HEAD}<title>${esc(tenant)} — Sentinel</title><body>
  <div class="layout">
    ${sidebar(scan, category, baseUrl, moduleCounts, isMsp)}
    <main class="main">
      <div class="topbar">
        <div style="flex:1"><h1 class="head">${esc(title)}</h1><div class="sub">${esc(sub)}</div></div>
        <a class="btn primary" href="${baseUrl}${scan.org.platform === 'Microsoft 365' ? '/auth/microsoft' : '/auth/google'}${rescanMode}">Re-scan</a>
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
    const stale = isStale(t.lastScanAt);
    const staleBadge = stale ? `<span style="color:var(--danger);font-weight:600" title="Re-scan recommended — no scan in over 30 days">⚠ ${daysSince(t.lastScanAt)}d ago</span>` : `<span class="muted">${esc(when)}</span>`;
    const initial = esc((t.name || '?').charAt(0).toUpperCase());
    const href = `${baseUrl}/tenant/${encodeURIComponent(t.domain)}`;
    return `<tr class="org-row" data-name="${esc((t.name || '').toLowerCase())}" data-domain="${esc((t.domain || '').toLowerCase())}"
      data-platform="${t.platform === 'Microsoft 365' ? 'microsoft' : 'google'}" data-stale="${stale ? '1' : '0'}"
      style="cursor:pointer" onclick="location.href='${href}'">
      <td>
        <a href="${href}" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit">
          <span style="flex:0 0 auto;width:32px;height:32px;border-radius:9px;background:var(--bg-inset);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:var(--ink-dim)">${initial}</span>
          <div style="min-width:0">
            <div class="head" style="font-weight:600;font-size:14px;color:var(--ink)">${esc(t.name)}</div>
            ${t.name !== t.domain ? `<div class="muted" style="font-size:12px;margin-top:1px">${esc(t.domain)}</div>` : ''}
          </div>
        </a>
      </td>
      <td><span style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--ink-2)">${platformIcon(t.platform)}${esc(t.platform)}</span></td>
      <td style="font-size:13px">${staleBadge}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
          <div style="width:90px;height:5px;background:var(--bg-inset);border-radius:20px;overflow:hidden"><i style="display:block;height:100%;border-radius:20px;width:${t.latestScore}%;background:${c}"></i></div>
          <span class="head" style="font-weight:600;color:${c};width:38px;text-align:right;font-size:14px">${t.latestScore}%</span>
        </div>
      </td>
      <td style="text-align:right"><span style="font-weight:600;font-size:11px;color:#fff;background:${c};padding:3px 11px;border-radius:20px;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap">${b}</span></td>
    </tr>`;
  }).join('');
  const avg = tenants.length ? Math.round(tenants.reduce((s, t) => s + (t.latestScore || 0), 0) / tenants.length) : null;
  const avgColour = avg == null ? 'inherit' : barColour(avg);
  const staleCount = tenants.filter((t) => isStale(t.lastScanAt)).length;

  const kpi = (icon, label, value, colour) => `<div class="card" style="padding:20px 24px;flex:1;min-width:190px;display:flex;align-items:center;gap:14px">
    <span style="flex:0 0 auto;width:38px;height:38px;border-radius:10px;background:var(--bg-inset);display:flex;align-items:center;justify-content:center;font-size:16px">${icon}</span>
    <div><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:600">${label}</div>
    <div class="head" style="font-size:26px;font-weight:600;margin-top:2px;letter-spacing:-0.03em${colour ? `;color:${colour}` : ''}">${value}</div></div>
  </div>`;

  return `<!doctype html>${HEAD}<title>Sentinel — tenants</title><body><div style="max-width:1080px;margin:0 auto;padding:32px 24px 80px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:30px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:9px">${MARK}<span class="head" style="font-weight:600;font-size:17px;letter-spacing:-0.015em">Sentinel</span></div>
      <div style="flex:1"></div>
      <a class="btn primary" href="${baseUrl}/auth/google?mode=msp">Link Google Workspace</a>
      <a class="btn primary" href="${baseUrl}/auth/microsoft?mode=msp">Link Microsoft 365</a>
      <a class="btn ghost" href="${baseUrl}/leads">Leads</a>
      <a class="btn ghost" href="${baseUrl}/logout">Sign out</a>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      ${kpi('🏢', 'Tenants managed', tenants.length)}
      ${kpi('🛡', 'Average posture', avg == null ? '—' : avg + '%', avgColour)}
      ${kpi('🕒', 'Last scan', tenants[0]?.lastScanAt ? new Date(tenants[0].lastScanAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—')}
      ${kpi('⚠', 'Needs re-scan', staleCount, staleCount ? 'var(--danger)' : null)}
    </div>
    <div class="card" style="overflow:hidden">
      <div style="padding:16px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h2 class="head" style="margin:0;font-size:15px;font-weight:600">Client tenants</h2>
        <span class="muted" id="orgCount" style="font-size:12.5px">${tenants.length} total</span>
        <div style="flex:1"></div>
        <input class="searchbox" id="orgSearch" placeholder="Search tenants…" oninput="orgFilter()" style="max-width:200px">
        <button class="chip on" data-org-filter="all" onclick="orgSetFilter(this,'all')">All</button>
        <button class="chip" data-org-filter="stale" onclick="orgSetFilter(this,'stale')">Needs re-scan${staleCount ? ` <span class="n">${staleCount}</span>` : ''}</button>
        <button class="chip" data-org-filter="google" onclick="orgSetFilter(this,'google')">Google</button>
        <button class="chip" data-org-filter="microsoft" onclick="orgSetFilter(this,'microsoft')">Microsoft</button>
      </div>
      ${tenants.length ? `<div style="overflow-x:auto"><table class="dtable">
        <thead><tr><th>Tenant</th><th>Platform</th><th>Last scan</th><th style="text-align:right">Score</th><th style="text-align:right">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : `<div style="padding:64px 40px;text-align:center">
        <div style="opacity:.4;margin-bottom:18px;display:flex;justify-content:center">${MARK}</div>
        <div class="head" style="font-weight:600;font-size:16px;margin-bottom:8px">No tenants linked yet</div>
        <div class="dim" style="font-size:13.5px;max-width:400px;margin:0 auto 20px;line-height:1.55">Click <b style="color:var(--accent)">Link Google Workspace</b> or <b style="color:var(--accent)">Link Microsoft 365</b> and sign in as a client's admin to run the first audit.</div>
      </div>`}
      ${tenants.length ? `<div class="no-results hidden" id="orgNoResults" style="padding:48px;text-align:center;color:var(--ink-mute);font-size:14px">No tenants match your search/filter.</div>` : ''}
    </div>
    <p class="muted" style="text-align:center;font-size:12px;margin-top:26px">Sentinel · Read-only · Configuration and metadata only</p>
  </div>
  <script>
    let orgActiveFilter = 'all';
    function orgSetFilter(btn, kind) {
      orgActiveFilter = kind;
      document.querySelectorAll('[data-org-filter]').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      orgFilter();
    }
    function orgFilter() {
      const q = (document.getElementById('orgSearch')?.value || '').trim().toLowerCase();
      let shown = 0;
      document.querySelectorAll('.org-row').forEach(el => {
        let ok = true;
        if (orgActiveFilter === 'stale' && el.dataset.stale !== '1') ok = false;
        if ((orgActiveFilter === 'google' || orgActiveFilter === 'microsoft') && el.dataset.platform !== orgActiveFilter) ok = false;
        if (q && !el.dataset.name.includes(q) && !el.dataset.domain.includes(q)) ok = false;
        el.classList.toggle('hidden', !ok);
        if (ok) shown++;
      });
      const cnt = document.getElementById('orgCount'); if (cnt) cnt.textContent = shown + ' shown';
      const nr = document.getElementById('orgNoResults'); if (nr) nr.classList.toggle('hidden', shown > 0);
    }
  </script>`;
}

// ── Leads inbox (MSP-only) — contact-form submissions from the marketing site ──
export function leadsPage(leads, baseUrl) {
  const rows = leads.map((l) => `<tr>
      <td class="muted" style="white-space:nowrap">${new Date(l.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
      <td class="head" style="font-weight:600">${esc(l.name)}</td>
      <td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td>
      <td class="muted">${esc(l.company || '—')}</td>
      <td class="muted">${esc(l.platform || '—')}</td>
      <td class="muted" style="max-width:280px">${esc(l.message || '—')}</td>
    </tr>`).join('');
  return `<!doctype html>${HEAD}<title>Sentinel — leads</title><body><div style="max-width:1080px;margin:0 auto;padding:32px 24px 80px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:30px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:9px">${MARK}<span class="head" style="font-weight:600;font-size:17px;letter-spacing:-0.015em">Sentinel</span></div>
      <div style="flex:1"></div>
      <a class="btn ghost" href="${baseUrl}/">← Tenants</a>
      <a class="btn ghost" href="${baseUrl}/logout">Sign out</a>
    </div>
    <div class="card" style="overflow:hidden">
      <div style="padding:16px 24px;border-bottom:1px solid var(--line)">
        <h2 class="head" style="margin:0;font-size:15px;font-weight:600">Contact form leads</h2>
        <span class="muted" style="font-size:12.5px">${leads.length} total</span>
      </div>
      ${leads.length ? `<div style="overflow-x:auto"><table class="dtable">
        <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Company</th><th>Platform</th><th>Message</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : `<div style="padding:56px;text-align:center;color:var(--ink-mute);font-size:14px">No leads yet — submissions from the public marketing site's contact form will show up here.</div>`}
    </div>
  </div>`;
}
