// lib/activityScan.js
// Pulls audit activity from the Google Reports API and classifies each event.
// Read-only. Covers login, admin, token, drive, and groups applications.
//
// Output structure:
//   { events: [ ... normalised events, newest first ... ],
//     stats:  { total, byApp, bySeverity, ... },
//     attention: [ ... high-signal events for the triage strip ... ] }
//
// Each normalised event: { at, app, user, action, severity, summary, params }

const APPS = ['login', 'admin', 'token', 'drive', 'groups'];
const MAX_PER_APP = 500;   // cap per application per scan
const WINDOW_DAYS = 30;

const safe = async (p, fb = null) => { try { return await p; } catch { return fb; } };

// Which event names should raise a red flag on the attention strip.
// Deliberately conservative — we want signal not noise.
const HIGH_SIGNAL = new Set([
  // login
  'login_failure', 'suspicious_login', 'suspicious_login_less_secure_app',
  'suspicious_programmatic_login', 'account_disabled_password_leak',
  'account_disabled_generic', 'gov_attack_warning',
  // admin (privileged changes)
  'GRANT_ADMIN_PRIVILEGE', 'ASSIGN_ROLE', 'CREATE_ROLE',
  'CHANGE_ALLOWED_TWO_STEP_VERIFICATION_METHODS',
  'ENFORCE_STRONG_AUTHENTICATION', 'CHANGE_TWO_STEP_VERIFICATION_ENROLLMENT_PERIOD_DURATION',
  'TOGGLE_SERVICE_ENABLED', 'CHANGE_APPLICATION_SETTING',
  'CHANGE_DOCS_SETTING', 'CHANGE_DRIVE_SETTING',
  // token
  'authorize',       // any new OAuth grant
  // drive
  'change_user_access', 'change_document_visibility',
]);

// Severity ranking for the display colours.
function classify(app, eventName) {
  if (HIGH_SIGNAL.has(eventName)) {
    if (/suspicious|gov_attack|account_disabled|GRANT_ADMIN|ASSIGN_ROLE/.test(eventName)) return 'critical';
    if (/login_failure|CHANGE_.*SETTING|CHANGE_ALLOWED_TWO_STEP|ENFORCE_STRONG/.test(eventName)) return 'high';
    if (app === 'token') return 'medium';    // OAuth grants are noteworthy but not always risky
    return 'medium';
  }
  return 'low';
}

// Turn a raw Reports API activity into a normalised event.
function normalise(item, app) {
  const events = item.events || [];
  const ev = events[0] || {};
  const params = {};
  (ev.parameters || []).forEach((p) => { params[p.name] = p.value ?? p.intValue ?? p.boolValue ?? p.multiValue; });

  const eventName = ev.name || '';
  const severity = classify(app, eventName);
  const user = item.actor?.email || item.actor?.callerType || 'unknown';

  // Build a human-readable summary per app/event.
  let summary = eventName;
  if (app === 'login') {
    if (params.login_type) summary = `${eventName.replace(/_/g, ' ')} (${params.login_type})`;
    else summary = eventName.replace(/_/g, ' ');
  } else if (app === 'admin') {
    const target = params.USER_EMAIL || params.GROUP_EMAIL || params.APPLICATION_NAME || '';
    summary = eventName.replace(/_/g, ' ').toLowerCase() + (target ? ` — ${target}` : '');
  } else if (app === 'token') {
    const client = params.client_id || params.app_name || 'app';
    const scope = params.scope || '';
    summary = `${eventName === 'authorize' ? 'Authorised' : eventName} ${client}${scope ? ` (${String(scope).slice(0, 80)})` : ''}`;
  } else if (app === 'drive') {
    const doc = params.doc_title || '';
    summary = eventName.replace(/_/g, ' ') + (doc ? ` — ${doc}` : '');
  } else if (app === 'groups') {
    const group = params.GROUP_EMAIL || '';
    summary = eventName.replace(/_/g, ' ') + (group ? ` — ${group}` : '');
  }

  return {
    at: item.id?.time || ev.time || new Date().toISOString(),
    app,
    user,
    action: eventName,
    severity,
    summary,
    params,
  };
}

async function fetchApp(reports, app, startTime) {
  const events = [];
  let pageToken;
  let pages = 0;
  do {
    const res = await safe(reports.activities.list({
      userKey: 'all',
      applicationName: app,
      startTime,
      maxResults: 1000,
      pageToken,
    }));
    if (!res?.data) break;
    for (const item of res.data.items || []) {
      events.push(normalise(item, app));
      if (events.length >= MAX_PER_APP) break;
    }
    pageToken = res.data.nextPageToken;
    pages++;
    if (events.length >= MAX_PER_APP || pages > 5) break;
  } while (pageToken);
  return events;
}

export async function scanActivity(reports) {
  const startTime = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const all = [];
  const byApp = {};

  for (const app of APPS) {
    const evs = await fetchApp(reports, app, startTime);
    byApp[app] = evs.length;
    all.push(...evs);
  }

  // Sort newest first
  all.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Bucket for stats
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byDay = {};
  for (const e of all) {
    bySeverity[e.severity]++;
    const day = e.at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }

  // Attention strip: high-severity events, deduped by (user+action), capped at 12
  const seen = new Set();
  const attention = [];
  for (const e of all) {
    if (e.severity !== 'critical' && e.severity !== 'high') continue;
    const key = e.user + '|' + e.action;
    if (seen.has(key)) continue;
    seen.add(key);
    attention.push(e);
    if (attention.length >= 12) break;
  }

  return {
    windowDays: WINDOW_DAYS,
    scannedAt: new Date().toISOString(),
    stats: { total: all.length, byApp, bySeverity, byDay },
    events: all.slice(0, 2000),   // cap payload for the DB
    attention,
  };
}
