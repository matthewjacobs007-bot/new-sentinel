# Sentinel

A read-only Google Workspace security posture platform for MSPs. Sign in a client's super admin, scan the tenant's configuration, score it against best practice, and hand back a fixable, exportable report — with a deep link into the Admin console for every gap.

**Read-only, always.** Sentinel only reads security metadata (settings, roles, group policies, user status). No email, chat or Drive file contents are ever accessed.

## Run locally

```bash
npm install
cp .env.example .env      # fill in the values
npm start                 # → http://localhost:3000
npm test                  # runs the scanner + persistence test suite
```

Node 20+.

## What it scans (44 controls across 9 modules)

- **User & Admin Access** — 2SV coverage & enforcement, super/delegated admin counts, admin 2SV, admin recovery, custom roles
- **Account Hygiene** — dormant accounts, never-used accounts, password rotation, suspended cleanup
- **Risk Center (Shadow IT)** — third-party OAuth apps with broad Drive/Gmail scopes
- **Collaboration** — Groups public join / external members / public view / public post, OU structure, shared drives, Drive sharing defaults, link sharing, ownership transfer
- **Calendar & Sites** — external calendar sharing, public Sites, Meet controls
- **Endpoint & Device** — mobile enrolment, compromised devices, ChromeOS activity
- **Email Security** — SPF, DMARC, DKIM, external forwarding, Gmail safety, confidential mode
- **Application & API Access** — app access restrictions, Marketplace, less-secure apps
- **Logging & Monitoring** — suspicious logins (live), audit retention, alert centre
- **Backup & Continuity** — third-party backup, Vault retention, IR runbook

Every finding carries a severity (critical/high/medium/low), a CIS tag, and a deep link into the Admin console.

## Google setup

1. Google Cloud Console → new project → enable **Admin SDK API**, **Groups Settings API**, **Google Drive API**.
2. OAuth consent screen → External → add scopes below. Sensitive scopes require Google verification before external use (test users work until then).
3. Credentials → OAuth client ID → Web application → redirect URI `{BASE_URL}/auth/google/callback`.
4. Sign in as a **super admin** when scanning.

Scopes: `admin.directory.user.readonly`, `admin.directory.domain.readonly`, `admin.directory.rolemanagement.readonly`, `admin.directory.group.readonly`, `admin.directory.user.security`, `apps.groups.settings`, `admin.reports.audit.readonly`, `drive.readonly`.

## Architecture

Node + Express + PostgreSQL. Multi-tenant: each linked Workspace domain is a tenant with its own scan history and accepted-risk state. Drift detection compares consecutive scans and surfaces regressions.
