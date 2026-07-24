// server.js — Sentinel (multi-tenant Google Workspace posture platform, PostgreSQL-backed)
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import crypto from 'node:crypto';
import { google } from 'googleapis';

import { scanGoogle } from './lib/googleScan.js';
import { scoreFindings } from './lib/scoring2.js';
import { findingsToCsv } from './lib/exportCsv.js';
import { diffScans } from './lib/drift.js';
import { loginPage, dashboardPage, errorPage, teamLoginPage, orgViewPage } from './lib/render.js';
import { initSchema } from './lib/db.js';
import * as store from './lib/store.js';

const { PORT = 3000, BASE_URL = `http://localhost:${PORT}`, SESSION_SECRET = 'dev-secret',
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
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
];
const oauth = () => new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${BASE_URL}/auth/google/callback`);

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax' } }));

const requireTeam = (req, res, next) => (req.session.team ? next() : res.redirect('/login'));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(500).send(errorPage(e.message)));

app.get('/login', (req, res) => res.send(teamLoginPage(BASE_URL, req.query.e ? 'Wrong username or password.' : '')));
app.post('/login', (req, res) => {
  if (req.body.user === TEAM_USER && req.body.pass === TEAM_PASS) { req.session.team = req.body.user; return res.redirect('/'); }
  res.redirect('/login?e=1');
});
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/', requireTeam, wrap(async (_req, res) => res.send(orgViewPage(await store.listTenants(), BASE_URL))));

app.get('/tenant/:domain/user/:email', requireTeam, wrap(async (req, res) => {
  const domain = req.params.domain;
  const saved = await store.latestScan(domain);
  if (!saved) return res.redirect('/');
  const t = (await store.listTenants()).find((x) => x.domain === domain);
  const scan = { org: { name: t?.name || domain, platform: t?.platform || 'Google Workspace' }, scannedAt: saved.at, findings: saved.findings, stats: saved.stats || {}, details: saved.details || {} };
  const drift = diffScans(await store.previousScan(domain), { findings: saved.findings, score: saved.score });
  const category = 'user:' + encodeURIComponent(req.params.email);
  res.send(dashboardPage(scan, await store.acceptedFor(domain), BASE_URL, await store.scanHistory(domain), drift, category));
}));

app.get('/tenant/:domain', requireTeam, wrap(async (req, res) => {
  const domain = req.params.domain;
  const saved = await store.latestScan(domain);
  if (!saved) return res.redirect('/');
  const t = (await store.listTenants()).find((x) => x.domain === domain);
  const scan = { org: { name: t?.name || domain, platform: t?.platform || 'Google Workspace' }, scannedAt: saved.at, findings: saved.findings, stats: saved.stats || {}, details: saved.details || {} };
  const drift = diffScans(await store.previousScan(domain), { findings: saved.findings, score: saved.score });
  const category = String(req.query.cat || 'overview');
  res.send(dashboardPage(scan, await store.acceptedFor(domain), BASE_URL, await store.scanHistory(domain), drift, category));
}));

app.get('/auth/google', requireTeam, (req, res) => {
  const state = crypto.randomBytes(16).toString('hex'); req.session.state = state;
  res.redirect(oauth().generateAuthUrl({ access_type: 'online', prompt: 'consent', scope: SCOPES, state }));
});
app.get('/auth/google/callback', requireTeam, wrap(async (req, res) => {
  if (!req.query.state || req.query.state !== req.session.state) throw new Error('State mismatch.');
  const client = oauth();
  const { tokens } = await client.getToken(req.query.code);
  client.setCredentials(tokens);
  const scan = await scanGoogle(client);
  const domain = (scan.org.name || '').toLowerCase();
  const prev = await store.latestScan(domain);
  const accepted = await store.acceptedFor(domain);
  const { pct } = scoreFindings(scan.findings, accepted);
  await store.saveScan(domain, scan, pct);
  const drift = diffScans(prev, { findings: scan.findings, score: pct });
  res.send(dashboardPage(scan, accepted, BASE_URL, await store.scanHistory(domain), drift));
}));

const back = (req, res) => res.redirect('/tenant/' + encodeURIComponent(req.query.tenant || ''));
app.get('/accept', requireTeam, wrap(async (req, res) => { if (req.query.tenant && req.query.id) await store.acceptRisk(req.query.tenant.toLowerCase(), req.query.id); back(req, res); }));
app.get('/unaccept', requireTeam, wrap(async (req, res) => { if (req.query.tenant && req.query.id) await store.unacceptRisk(req.query.tenant.toLowerCase(), req.query.id); back(req, res); }));

app.get('/export.csv', requireTeam, wrap(async (req, res) => {
  const domain = (req.query.tenant || '').toLowerCase();
  const saved = await store.latestScan(domain);
  if (!saved) return res.redirect('/');
  const scan = { org: { name: domain, platform: 'Google Workspace' }, scannedAt: saved.at, findings: saved.findings };
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="sentinel-${domain}.csv"`);
  res.send(findingsToCsv(scan, await store.acceptedFor(domain)));
}));

initSchema()
  .then(() => app.listen(PORT, () => console.log(`Sentinel running at ${BASE_URL}`)))
  .catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
