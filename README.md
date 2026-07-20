# RCS Sentinel — Workspace Audit

A read-only Cloud Security Posture Management (CSPM) scanner for Google Workspace,
built to the "Workspace Audit" blueprint. A super admin signs in, Sentinel scans
the domain's configuration, scores it against security best practice, and returns
a fixable, exportable report — with a deep link into the Admin console for each gap.

**Read-only, always.** No email, chat or Drive file contents are ever accessed —
only security metadata (settings, roles, group policies, user status).

---

## Run it

```bash
npm install
cp .env.example .env      # fill in GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
npm start                 # → http://localhost:3000
npm test                  # runs the scanner/scoring/export test suite (mocked APIs)
```

Node 20+.

## Google setup

1. Google Cloud Console → new project → enable **Admin SDK API**, **Groups Settings API**, **Google Drive API**.
2. OAuth consent screen → External → add the scopes below. These are *sensitive/
   restricted*, so Google requires **app verification** before use outside your own
   domain (test users work until then).
3. Credentials → OAuth client ID → Web application →
   redirect URI `http://localhost:3000/auth/google/callback`.
4. Sign in as a **super admin** when scanning.

Scopes (all read-only where a readonly variant exists):
`admin.directory.user.readonly`, `admin.directory.domain.readonly`,
`admin.directory.rolemanagement.readonly`, `admin.directory.group.readonly`,
`admin.directory.user.security` (needed to list a user's OAuth tokens — Shadow IT),
`apps.groups.settings`, `admin.reports.audit.readonly`, `drive.readonly`.

---

## Blueprint → what's built

| Blueprint module | Status |
|---|---|
| Security Posture Dashboard (compliance score, severity Critical→Low) | **Built** |
| "Fix Setting" deep links into the Admin console per finding | **Built** |
| "Accept Risk" (excludes a finding from the score) | **Built** |
| Risk Center — third-party OAuth apps / Shadow IT, flag broad Drive/Gmail scopes | **Built** |
| User & Admin Access — 2SV coverage/enforcement, super-admin count (<5), admin 2SV, custom roles | **Built** |
| Account Hygiene — zombie accounts (>90 days) | **Built** |
| Collaboration — public/external Google Groups; shared-drive review | **Built** (drive orphan-owner detection is basic) |
| CIS tags on every finding + CSV export | **Built** |
| PDF export | **Built** (browser print; a server-side PDF lib is the polish step) |
| Score history / trend | **Built** (file-backed; see below) |

## What still needs building for production

These are in the blueprint but are infrastructure that needs a database and a
scheduler standing up — they're scaffolded, not finished, and I've been explicit
rather than pretend otherwise:

- **Multi-tenant "Organization View"** — one dashboard across many client domains.
  Needs the store swapped from the file stub (`lib/store.js`) to **PostgreSQL**.
- **Cron engine + drift alerts** — scheduled recurring scans and an email when a
  secure setting flips insecure. Blueprint suggests Cloud Scheduler / EventBridge.
- **Domain-Wide Delegation via a service account** — required for headless,
  scheduled multi-tenant scanning (the interactive OAuth login here covers a single
  admin-driven scan). Wiring a service-account JWT with subject impersonation is
  the change; the scan modules themselves are unchanged.
- **Historical timeline UI** — the data is being recorded (`lib/store.js`); the
  richer per-setting change log is the next view.
- **NIST mapping** — CIS tags are on every finding; NIST is a second mapping table.

## Tested

`npm test` mocks the Admin SDK, Groups Settings and Drive APIs and drives the real
scan logic end to end: user/admin/2SV counts, Shadow IT scope detection, public-group
flagging, scoring, accept-risk, severity breakdown, CSV export and dashboard render —
27 assertions. The live OAuth sign-in is the one thing that can only be verified with
your registered Google app.
