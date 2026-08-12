// server.js — Sentinel (multi-tenant Google Workspace posture platform, PostgreSQL-backed)
//
// Two user roles share this login page:
//   MSP team   — username + password (env vars). Sees everything.
//   Client     — signs in with Google as their tenant's super admin. Scoped to that tenant only.
//
// Client sessions are bound to a tenant on first Google sign-in: whichever primary domain
// the Admin SDK reports for the signed-in account becomes their permanent scope.

import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { ConfidentialClientApplication } from '@azure/msal-node';

import { scanGoogle } from './lib/googleScan.js';
import { scanMicrosoft, isGlobalAdmin, getSignedInUser } from './lib/microsoftScan.js';
import { scoreFindings } from './lib/scoring2.js';
import { findingsToCsv } from './lib/exportCsv.js';
import { diffScans } from './lib/drift.js';
import { notifyDrift } from './lib/alerts.js';
import { loginPage, dashboardPage, errorPage, teamLoginPage, orgViewPage, marketingPage, leadsPage, activatePage, activateSuccessPage } from './lib/render.js';
import { initSchema } from './lib/db.js';
import * as store from './lib/store.js';
import * as billing from './lib/billing.js';

const { PORT = 3000, BASE_URL = `http://localhost:${PORT}`, SESSION_SECRET = 'dev-secret',
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
  MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID = 'organizations',
  ALERT_WEBHOOK_URL,
  TEAM_USER = 'rcs', TEAM_PASS = 'changeme' } = process.env;

const SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/admin.directory.domain.readonly',
  'https://www.googleapis.com/auth/admin.directory.rolemanagement.readonly',
  'https://www.googleapis.com/auth/admin.directory.group.readonly',
  'https://www.googleapis.com/auth/admin.directory.user.security',
  'https://www.googleapis.com/auth/apps.groups.settings',
  'https://www.googleapis.com/auth/admin.reports.audit.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'openid', 'email', 'profile',                    // to identify the signed-in Google user
];

const oauth = () => new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${BASE_URL}/auth/google/callback`);

// ── Microsoft 365 (Entra ID) OAuth ───────────────────────────
const MS_SCOPES = [
  'User.Read', 'Organization.Read.All', 'User.Read.All', 'Directory.Read.All',
  'Policy.Read.All', 'Reports.Read.All', 'SecurityEvents.Read.All',
];
const MS_REDIRECT_URI = `${BASE_URL}/auth/microsoft/callback`;
const msIsConfigured = Boolean(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);
const msal = () => new ConfidentialClientApplication({
  auth: {
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}`,
  },
});

const app = express();
app.set('trust proxy', 1); // Render sits behind a reverse proxy — needed for accurate req.ip (rate limiting) and secure cookies
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: BASE_URL.startsWith('https') },
}));

// ── CSRF protection ──────────────────────────────────────────
// Session-bound synchronizer token. SameSite=Lax already blocks cookies on
// cross-site subresource requests, but a crafted link is still a top-level GET
// navigation that Lax allows — a real risk for state-changing GETs, and this is
// defense-in-depth for the POST routes below regardless.
const csrfToken = (req) => (req.session.csrfToken ??= crypto.randomBytes(20).toString('hex'));
const requireCsrf = (req, res, next) => (
  req.body._csrf && req.body._csrf === req.session.csrfToken
    ? next()
    : res.status(403).send(errorPage('Your session expired or this form was submitted from somewhere unexpected. Please go back and try again.'))
);

// ── Login rate limiting ──────────────────────────────────────
// In-memory, per-IP. Resets on deploy/restart and doesn't share state across
// multiple instances — acceptable for a single-instance deployment; a real
// multi-instance setup would need this backed by Redis or similar.
const loginAttempts = new Map(); // ip -> { count, resetAt }
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const tooManyLoginAttempts = (ip) => {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= LOGIN_MAX_ATTEMPTS;
};
const recordFailedLogin = (ip) => {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else entry.count += 1;
};
const clearLoginAttempts = (ip) => loginAttempts.delete(ip);

// ── Auth helpers ────────────────────────────────────────────
// A request is authenticated if the session has either an MSP team login OR a client role.
const isMsp = (req) => req.session.role === 'msp';
const isClient = (req) => req.session.role === 'client' && req.session.tenant;
const isAuthed = (req) => isMsp(req) || isClient(req);

// Middleware for pages both roles can hit; server code branches inside based on role.
const requireAuth = (req, res, next) => (isAuthed(req) ? next() : res.redirect('/login'));

// Middleware for MSP-only routes (org view, linking new tenants, etc.).
const requireMsp = (req, res, next) => (isMsp(req) ? next() : res.status(403).send(errorPage('This page is only available to MSP administrators.')));

// A client trying to reach a tenant that isn't theirs must be blocked.
const canSeeTenant = (req, domain) => isMsp(req) || (isClient(req) && req.session.tenant === domain);

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(500).send(errorPage(e.message)));
// Same as wrap(), but with the scan-specific title/hint — only genuinely applies
// to the two OAuth callback routes, where a thrown error really is usually a
// missing scope or a non-admin account.
const wrapScan = (fn) => (req, res) => fn(req, res).catch((e) => res.status(500).send(errorPage(e.message, {
  title: 'Scan could not complete',
  hint: "Usually a Google API scope wasn't consented, or the signed-in account isn't a super admin.",
})));

// A client's tenant must be paid & active before they see the dashboard. MSPs are
// never gated — this is a client-only billing check, not an access-control one.
const requireActive = (req, res, next) => {
  if (!isClient(req)) return next();
  store.getTenant(req.session.tenant)
    .then((t) => ((t && t.active) ? next() : res.redirect('/activate')))
    .catch((e) => res.status(500).send(errorPage(e.message)));
};

// ── Login page (dual: MSP team OR client Google) ────────────
app.get('/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/');
  const err = req.query.e === '1' ? 'Wrong username or password.'
    : req.query.e === 'locked' ? 'Too many failed sign-in attempts. Please wait 15 minutes and try again.'
    : req.query.e === 'not_admin' ? 'That Google account is not a super admin of a Workspace domain. Ask your Workspace administrator to sign in instead.'
    : req.query.e === 'no_tenant' ? 'Your Workspace has not been onboarded to Sentinel yet. Please contact your MSP.'
    : '';
  res.send(teamLoginPage(BASE_URL, err, csrfToken(req)));
});

// MSP team login — username + password from env vars.
app.post('/login', requireCsrf, (req, res) => {
  if (tooManyLoginAttempts(req.ip)) return res.redirect('/login?e=locked');
  if (req.body.user === TEAM_USER && req.body.pass === TEAM_PASS) {
    clearLoginAttempts(req.ip);
    req.session.role = 'msp';
    req.session.user = req.body.user;
    return res.redirect('/');
  }
  recordFailedLogin(req.ip);
  res.redirect('/login?e=1');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// ── Landing / index (public marketing page, or the app if signed in) ───
app.get('/', wrap(async (req, res) => {
  if (!isAuthed(req)) {
    // Anonymous visitor: the public lead-gen site, not a login redirect.
    return res.send(marketingPage(BASE_URL, { sent: req.query.sent === '1', csrfToken: csrfToken(req) }));
  }
  if (isMsp(req)) {
    // MSP: full org view.
    return res.send(orgViewPage(await store.listTenants(), BASE_URL));
  }
  // Client: straight into their tenant.
  return res.redirect('/tenant/' + encodeURIComponent(req.session.tenant));
}));

// ── Contact / lead capture (public) ─────────────────────────
app.post('/contact', requireCsrf, wrap(async (req, res) => {
  const { name, email, company, platform, message } = req.body;
  if (!name || !email) return res.redirect('/#contact');
  await store.saveLead({ name, email, company, platform, message });
  res.redirect('/?sent=1#contact');
}));

// ── Leads inbox (MSP-only) ──────────────────────────────────
app.get('/leads', requireMsp, wrap(async (req, res) => {
  res.send(leadsPage(await store.listLeads(), BASE_URL));
}));

// ── Tenant dashboard ────────────────────────────────────────
app.get('/tenant/:domain', requireAuth, requireActive, wrap(async (req, res) => {
  const domain = req.params.domain;
  if (!canSeeTenant(req, domain)) return res.status(403).send(errorPage('You do not have access to this tenant.'));
  const saved = await store.latestScan(domain);
  if (!saved) return res.redirect(isMsp(req) ? '/' : '/link-workspace');
  const t = (await store.listTenants()).find((x) => x.domain === domain);
  const scan = { org: { name: t?.name || domain, platform: t?.platform || 'Google Workspace' }, scannedAt: saved.at, findings: saved.findings, stats: saved.stats || {}, details: saved.details || {} };
  const drift = diffScans(await store.previousScan(domain), { findings: saved.findings, score: saved.score });
  const category = String(req.query.cat || 'overview');
  // Clients can't access the "all tenants" back link — the renderer already reads a role hint.
  res.send(dashboardPage(scan, await store.acceptedFor(domain), BASE_URL, await store.scanHistory(domain), drift, category, { role: isMsp(req) ? 'msp' : 'client' }, csrfToken(req)));
}));

app.get('/tenant/:domain/user/:email', requireAuth, requireActive, wrap(async (req, res) => {
  const domain = req.params.domain;
  if (!canSeeTenant(req, domain)) return res.status(403).send(errorPage('You do not have access to this tenant.'));
  const saved = await store.latestScan(domain);
  if (!saved) return res.redirect('/');
  const t = (await store.listTenants()).find((x) => x.domain === domain);
  const scan = { org: { name: t?.name || domain, platform: t?.platform || 'Google Workspace' }, scannedAt: saved.at, findings: saved.findings, stats: saved.stats || {}, details: saved.details || {} };
  const drift = diffScans(await store.previousScan(domain), { findings: saved.findings, score: saved.score });
  const category = 'user:' + encodeURIComponent(req.params.email);
  res.send(dashboardPage(scan, await store.acceptedFor(domain), BASE_URL, await store.scanHistory(domain), drift, category, { role: isMsp(req) ? 'msp' : 'client' }, csrfToken(req)));
}));

// ── Client: link Workspace prompt (shown after first sign-in if no scan yet) ─
app.get('/link-workspace', requireAuth, (req, res) => {
  if (isMsp(req)) return res.redirect('/');
  res.send(errorPage('Your Workspace has not been scanned yet. Please click "Re-scan" to run the first audit.'));
});

// ── Google OAuth ────────────────────────────────────────────
// Two flows share this endpoint, differentiated by ?mode=:
//   mode=msp   — MSP is linking a new client tenant (must already be MSP-authed).
//   mode=client — client is signing in for the first time or re-authing.
app.get('/auth/google', (req, res) => {
  const mode = req.query.mode === 'msp' ? 'msp' : 'client';
  // MSP linking a tenant must already be signed in as MSP.
  if (mode === 'msp' && !isMsp(req)) return res.redirect('/login');
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauth_state = state;
  req.session.oauth_mode = mode;
  res.redirect(oauth().generateAuthUrl({ access_type: 'online', prompt: 'consent', scope: SCOPES, state }));
});

app.get('/auth/google/callback', wrapScan(async (req, res) => {
  if (!req.query.state || req.query.state !== req.session.oauth_state) throw new Error('State mismatch.');
  const mode = req.session.oauth_mode || 'client';
  const client = oauth();
  const { tokens } = await client.getToken(req.query.code);
  client.setCredentials(tokens);

  // Identify the signed-in Google user before running the scan.
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const me = await oauth2.userinfo.get();
  const signedInEmail = (me.data.email || '').toLowerCase();

  // Verify they are a super admin of the tenant. Admin SDK will reject or return non-admin.
  const directory = google.admin({ version: 'directory_v1', auth: client });
  let userRecord;
  try {
    userRecord = (await directory.users.get({ userKey: signedInEmail })).data;
  } catch {
    return res.redirect('/login?e=not_admin');
  }
  const isSuperAdmin = Boolean(userRecord.isAdmin && !userRecord.isDelegatedAdmin);
  if (!isSuperAdmin) return res.redirect('/login?e=not_admin');

  // Run the scan — same code path used previously by the MSP link flow.
  const scan = await scanGoogle(client);
  const domain = (scan.org.name || '').toLowerCase();
  const prev = await store.latestScan(domain);
  const accepted = await store.acceptedFor(domain);
  const { pct } = scoreFindings(scan.findings, accepted);
  await store.saveScan(domain, scan, pct);

  // Bind session to a role for future requests.
  if (mode === 'client') {
    req.session.role = 'client';
    req.session.tenant = domain;
    req.session.user = signedInEmail;
  }
  // If MSP was already signed in, their role stays 'msp' — this was just a link operation.

  const drift = diffScans(prev, { findings: scan.findings, score: pct });
  notifyDrift(ALERT_WEBHOOK_URL, domain, drift, pct); // fire-and-forget; never blocks the response

  // Client tenants must be paid & active before seeing the dashboard — a first-time
  // sign-in lands on the payment wall; an already-active client re-scanning does not.
  if (mode === 'client' && !(await store.getTenant(domain))?.active) return res.redirect('/activate');

  const roleHint = { role: isMsp(req) ? 'msp' : 'client' };
  res.send(dashboardPage(scan, accepted, BASE_URL, await store.scanHistory(domain), drift, 'overview', roleHint));
}));

// ── Microsoft 365 (Entra ID) OAuth ───────────────────────────
// Mirrors the Google flow above: same dual mode=msp/client, same super-admin gate
// (Global Administrator in Entra), same scan → score → persist → dashboard pipeline.
app.get('/auth/microsoft', (req, res) => {
  if (!msIsConfigured) return res.status(500).send(errorPage('Microsoft 365 sign-in is not configured on this server (missing MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).'));
  const mode = req.query.mode === 'msp' ? 'msp' : 'client';
  if (mode === 'msp' && !isMsp(req)) return res.redirect('/login');
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauth_state = state;
  req.session.oauth_mode = mode;
  msal().getAuthCodeUrl({ scopes: MS_SCOPES, redirectUri: MS_REDIRECT_URI, state, prompt: 'consent' })
    .then((url) => res.redirect(url))
    .catch((e) => res.status(500).send(errorPage(e.message)));
});

app.get('/auth/microsoft/callback', wrapScan(async (req, res) => {
  if (!req.query.state || req.query.state !== req.session.oauth_state) throw new Error('State mismatch.');
  const mode = req.session.oauth_mode || 'client';
  const result = await msal().acquireTokenByCode({ code: req.query.code, scopes: MS_SCOPES, redirectUri: MS_REDIRECT_URI });
  const token = result.accessToken;

  // Identify the signed-in user and verify they are a tenant Global Administrator.
  const { email: signedInEmail } = await getSignedInUser(token);
  if (!(await isGlobalAdmin(token))) return res.redirect('/login?e=not_admin');

  // Run the scan — same code path used by the MSP link flow.
  const scan = await scanMicrosoft(token);
  const domain = (scan.org.name || '').toLowerCase();
  const prev = await store.latestScan(domain);
  const accepted = await store.acceptedFor(domain);
  const { pct } = scoreFindings(scan.findings, accepted);
  await store.saveScan(domain, scan, pct);

  if (mode === 'client') {
    req.session.role = 'client';
    req.session.tenant = domain;
    req.session.user = signedInEmail;
  }

  const drift = diffScans(prev, { findings: scan.findings, score: pct });
  notifyDrift(ALERT_WEBHOOK_URL, domain, drift, pct); // fire-and-forget; never blocks the response

  // Client tenants must be paid & active before seeing the dashboard — a first-time
  // sign-in lands on the payment wall; an already-active client re-scanning does not.
  if (mode === 'client' && !(await store.getTenant(domain))?.active) return res.redirect('/activate');

  const roleHint = { role: isMsp(req) ? 'msp' : 'client' };
  res.send(dashboardPage(scan, accepted, BASE_URL, await store.scanHistory(domain), drift, 'overview', roleHint));
}));

// ── Accept / un-accept risk (both roles can, but only on their own tenant) ──
// POST + CSRF, not a plain GET link — this is a state change, and SameSite=Lax
// cookies still ride along on a top-level GET navigation (e.g. a crafted link).
const back = (req, res) => res.redirect('/tenant/' + encodeURIComponent(req.body.tenant || ''));
app.post('/accept', requireAuth, requireActive, requireCsrf, wrap(async (req, res) => {
  const domain = (req.body.tenant || '').toLowerCase();
  if (!canSeeTenant(req, domain)) return res.status(403).send(errorPage('You do not have access to this tenant.'));
  if (req.body.id) await store.acceptRisk(domain, req.body.id);
  back(req, res);
}));
app.post('/unaccept', requireAuth, requireActive, requireCsrf, wrap(async (req, res) => {
  const domain = (req.body.tenant || '').toLowerCase();
  if (!canSeeTenant(req, domain)) return res.status(403).send(errorPage('You do not have access to this tenant.'));
  if (req.body.id) await store.unacceptRisk(domain, req.body.id);
  back(req, res);
}));

// ── Billing / activation (client payment wall after first scan) ─────
app.get('/activate', requireAuth, wrap(async (req, res) => {
  const domain = isMsp(req) ? (req.query.domain || '').toLowerCase() : req.session.tenant;
  if (!domain) return res.redirect('/');
  const tenant = await store.getTenant(domain);
  if (!tenant) return res.redirect('/');
  // An already-active client landing here (e.g. a stale bookmark) just goes to their dashboard.
  if (tenant.active && !isMsp(req)) return res.redirect('/tenant/' + encodeURIComponent(domain));
  res.send(activatePage(tenant, BASE_URL, {
    paymentsConfigured: billing.isConfigured(),
    cancelled: req.query.cancelled === '1',
    isMsp: isMsp(req),
    billingCurrency: process.env.PAYSTACK_CURRENCY || 'USD',
    csrfToken: csrfToken(req),
  }));
}));

app.post('/activate/checkout', requireAuth, requireCsrf, wrap(async (req, res) => {
  const domain = (isMsp(req) ? req.body.domain : req.session.tenant || '').toLowerCase();
  if (!domain || !canSeeTenant(req, domain)) return res.status(403).send(errorPage('You do not have access to this tenant.'));
  if (!billing.isConfigured()) return res.redirect('/activate?domain=' + encodeURIComponent(domain));
  const tenant = await store.getTenant(domain);
  if (!tenant) return res.redirect('/');
  const email = (req.session.user || '').includes('@') ? req.session.user : undefined;
  const tx = await billing.startCheckout({ domain, name: tenant.name, email, priceCents: tenant.priceCents, baseUrl: BASE_URL });
  res.redirect(tx.authorization_url);
}));

app.get('/activate/success', requireAuth, wrap(async (req, res) => {
  const domain = (req.query.domain || '').toLowerCase();
  if (!domain || !canSeeTenant(req, domain)) return res.status(403).send(errorPage('You do not have access to this tenant.'));
  let tenant = await store.getTenant(domain);
  if (!tenant) return res.redirect('/');
  // The webhook below is the source of truth; this is an immediate-feedback fallback
  // that also covers local dev, where Paystack's webhook can't reach localhost.
  if (!tenant.active && req.query.reference && billing.isConfigured()) {
    try {
      const tx = await billing.verifyTransaction(req.query.reference);
      if (tx.status === 'success') {
        await store.activateTenant(domain, {
          paymentCustomerId: tx.customer?.customer_code,
          paymentSubscriptionId: tx.plan_object?.plan_code || tx.plan,
        });
        tenant = await store.getTenant(domain);
      }
    } catch { /* fall through to the "processing" state */ }
  }
  res.send(activateSuccessPage(tenant, BASE_URL, tenant.active));
}));

// MSP-only override — activate a tenant without a real charge (demos, manual invoicing).
app.post('/activate/manual', requireMsp, requireCsrf, wrap(async (req, res) => {
  const domain = (req.body.domain || '').toLowerCase();
  if (domain) await store.activateTenant(domain, {});
  res.redirect('/tenant/' + encodeURIComponent(domain));
}));

// Paystack's source of truth for activation. Needs the RAW body for signature
// verification, so this route gets its own body parser (urlencoded above only
// engages for form content-types and leaves this stream untouched).
app.post('/webhooks/paystack', express.raw({ type: 'application/json' }), wrap(async (req, res) => {
  if (!billing.isConfigured()) return res.status(400).send('Paystack webhook is not configured.');
  const valid = await billing.verifyWebhookSignature(req.body, req.headers['x-paystack-signature']);
  if (!valid) return res.status(400).send('Webhook signature verification failed.');
  const event = JSON.parse(req.body.toString('utf8'));
  if (event.event === 'charge.success') {
    const domain = event.data?.metadata?.domain;
    if (domain) {
      await store.activateTenant(domain, {
        paymentCustomerId: event.data.customer?.customer_code,
        paymentSubscriptionId: event.data.plan_object?.plan_code || event.data.plan,
      });
    }
  } else if (event.event === 'subscription.create') {
    // The real subscription_code + email_token (needed to ever cancel) only exist on
    // this event, not on charge.success — and this event doesn't carry our metadata,
    // so recover the domain from the plan name we set at creation ("Sentinel — <domain>"),
    // falling back to matching the customer_code charge.success already stored.
    const planName = event.data?.plan?.name || '';
    const prefix = 'Sentinel — ';
    let domain = planName.startsWith(prefix) ? planName.slice(prefix.length) : null;
    if (!domain && event.data?.customer?.customer_code) {
      domain = (await store.getTenantByPaymentCustomerId(event.data.customer.customer_code))?.domain || null;
    }
    if (domain) {
      await store.activateTenant(domain, {
        paymentCustomerId: event.data.customer?.customer_code,
        paymentSubscriptionId: event.data.subscription_code,
        paymentSubscriptionToken: event.data.email_token,
      });
    }
  }
  res.json({ received: true });
}));

// ── Cancel subscription ──────────────────────────────────────
// Real cancellation needs the subscription_code + email_token from the
// subscription.create webhook (see above) — without it we can't safely tell
// Paystack to stop billing, so we say so rather than silently deactivating a
// tenant whose subscription is still actually live and charging them.
app.post('/subscription/cancel', requireAuth, requireCsrf, wrap(async (req, res) => {
  const domain = (isMsp(req) ? req.body.domain : req.session.tenant || '').toLowerCase();
  if (!domain || !canSeeTenant(req, domain)) return res.status(403).send(errorPage('You do not have access to this tenant.'));
  const tenant = await store.getTenant(domain);
  if (!tenant) return res.redirect('/');
  if (!billing.isConfigured() || !tenant.paymentSubscriptionId || !tenant.paymentSubscriptionToken) {
    return res.status(400).send(errorPage('We don’t have enough information yet to cancel this subscription automatically. Please contact us and we’ll cancel it for you.', { title: 'Cancellation unavailable' }));
  }
  try {
    await billing.disableSubscription(tenant.paymentSubscriptionId, tenant.paymentSubscriptionToken);
  } catch (e) {
    return res.status(502).send(errorPage(`Paystack couldn't cancel this subscription (${e.message}). Please contact us and we'll sort it out.`, { title: 'Cancellation failed' }));
  }
  await store.deactivateTenant(domain);
  res.redirect(isMsp(req) ? '/' : '/activate');
}));

// MSP-only override — deactivate a tenant without touching Paystack (the client
// arranged cancellation directly with the MSP outside the app, a comped account
// is ending, etc.). Mirrors /activate/manual's override for the opposite direction.
app.post('/subscription/deactivate-manual', requireMsp, requireCsrf, wrap(async (req, res) => {
  const domain = (req.body.domain || '').toLowerCase();
  if (domain) await store.deactivateTenant(domain);
  res.redirect('/');
}));

// ── CSV export ──────────────────────────────────────────────
app.get('/export.csv', requireAuth, requireActive, wrap(async (req, res) => {
  const domain = (req.query.tenant || '').toLowerCase();
  if (!canSeeTenant(req, domain)) return res.status(403).send(errorPage('You do not have access to this tenant.'));
  const saved = await store.latestScan(domain);
  if (!saved) return res.redirect('/');
  const t = (await store.listTenants()).find((x) => x.domain === domain);
  const scan = { org: { name: domain, platform: t?.platform || 'Google Workspace' }, scannedAt: saved.at, findings: saved.findings };
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="sentinel-${domain}.csv"`);
  res.send(findingsToCsv(scan, await store.acceptedFor(domain)));
}));

initSchema()
  .then(() => app.listen(PORT, () => console.log(`Sentinel running at ${BASE_URL}`)))
  .catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
