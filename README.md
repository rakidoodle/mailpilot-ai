# MailPilot AI

AI email automation platform that connects multiple Gmail accounts, analyzes
messages with specialized AI agents, drafts replies for human approval, and
schedules delivery — with a dashboard for agent activity and analytics.

> **Status:** early development, running locally. Gmail OAuth and scheduled
> sending are not implemented yet. See [Roadmap](#roadmap).

## Features

Working today:

- Responsive SaaS dashboard with sidebar navigation
- Inbox, email detail, category filters, priority badges
- OpenRouter model catalog with search, free-only filter, and per-user model
  selection (paid models disabled by default)
- Three specialized agents — classification, summarization, reply drafting —
  with JSON validation, one retry on invalid output, and per-run logging
- Agent Activity table: model, status, duration, tokens, estimated cost, errors
- Hono API on Cloudflare Workers, D1 storage, SPA served from the same Worker
- Offline fallback to bundled demo data when the API is down

Planned (not yet built):

- Multiple Gmail accounts via Google OAuth 2.0 and manual inbox sync
- Human-approved scheduled sending with Cloudflare Cron Triggers
- Live analytics charts
- Automated Gmail/Google API integration tests
- Public demo mode and deployment

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, Lucide |
| Backend | Hono on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) with SQL migrations |
| AI | OpenRouter API, Zod-validated agent output |
| Testing | Vitest |
| Email (planned) | Gmail API, Google OAuth 2.0 |
| Scheduling (planned) | Cloudflare Cron Triggers |

## Architecture

```mermaid
flowchart LR
  B[React SPA] -->|/api proxy in dev| W[Hono worker]
  W --> D[(D1)]
  W -->|chat + model catalog| O[OpenRouter]
  A[Orchestrator] --> C[Classification]
  A --> S[Summarization]
  A --> R[Reply]
  C & S & R --> O
  W -.planned.-> G[Gmail API]
  C2[Cron Trigger<br/>planned] -.-> W
```

One Worker serves the built SPA (`dist/`) and the API. `run_worker_first:
["/api/*"]` sends API paths to the Worker; other paths fall back to
`index.html`.

The orchestrator runs agents in order: classification, then summarization,
then reply. The reply agent receives the earlier outputs as context. Each step
is isolated — a failed step is logged and does not block the next one. Every
run is written to `agent_runs` with model, duration, tokens, and estimated cost.

## Getting started

Requires Node.js 20.19+ and npm.

```bash
npm install
npm run db:migrate:local
cp .dev.vars.example .dev.vars   # add your OpenRouter key
npm run dev:api                  # terminal 1: worker on :8787
npm run dev                      # terminal 2: Vite on :5173
```

Without `OPENROUTER_API_KEY` the app still works: models list loads (public
API), but agent runs return `openrouter_not_configured`.

Local D1 data lives in `.wrangler/` (git-ignored). Reset by deleting that folder
and re-running the migration command.

## Free-tier reality

- `openrouter/free` and `:free` models are heavily rate-limited; providers
  return `429` under load. The UI records those failures instead of hiding them.
- Free models often emit prose around JSON. Parsing is tolerant (first balanced
  object) and each agent retries once on invalid output.
- Paid models are blocked unless `ALLOW_PAID_MODELS=true`. Keep it off for $0.
- Cloudflare Workers, D1, and Cron Triggers have free allowances but a deployed
  multi-account Gmail app may need Google verification.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Worker, D1, and OpenRouter key status |
| `GET /api/emails` | Emails joined with account, newest first |
| `GET /api/emails/:id` | Single email with body text |
| `GET /api/models?search=&freeOnly=true` | OpenRouter catalog, filtered |
| `GET /api/settings` | Selected model + paid-model flag |
| `PUT /api/settings/model` | Save model (rejects paid unless allowed) |
| `POST /api/agents/run` | Run all three agents for one email |
| `GET /api/agent-runs` | Latest 50 executions |

Unknown `/api/*` paths return JSON `404`. There is no authentication yet: all
routes operate as the seeded demo user `usr_demo`.

## Database

Schema migrations in `migrations/`:

- `0001_init.sql`: `users`, `gmail_accounts`, `email_records`, `agent_runs`,
  `drafts`, `scheduled_emails`, `audit_events`
- `0002_seed_demo.sql`: fictional user, accounts, and emails
- `0003_settings.sql`: `settings` (selected OpenRouter model)

```bash
npm run db:migrate:local     # apply to local SQLite
npm run db:migrate:remote    # apply to the deployed D1 database
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run dev:api` | Hono worker via `wrangler dev` on :8787 |
| `npm run build` | Type-check all tsconfigs, then build `dist/` |
| `npm run test` | Vitest unit tests (mocked OpenRouter) |
| `npm run lint` | Lint with oxlint |
| `npm run deploy` | Build, then `wrangler deploy` |

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | `.dev.vars` / Worker secret | Agent inference, paid-model list |
| `ALLOW_PAID_MODELS` | optional, default off | Allow selecting paid models |

`.env*` and `.dev.vars` are git-ignored. Keys never reach the browser.

## Security notes

Demo data in `migrations/0002_seed_demo.sql` and `src/data/` is fictional. The
agents treat email content as untrusted data and are instructed to ignore
instructions inside it. Agents can only read one stored email; they cannot send
mail. Reply drafts require human copy/approval, and scheduled sending is not
implemented yet.

## Roadmap

1. Foundations ✅
2. Dashboard ✅
3. Backend and D1 ✅
4. OpenRouter models and selection ✅
5. Agents and activity log ✅
6. Gmail — OAuth, multi-account, manual sync
7. Scheduling — approval, cron sending, statuses
8. Analytics and broader tests
9. Deployment, demo mode, portfolio docs

## License

MIT
