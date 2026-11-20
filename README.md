# MailPilot AI

AI email automation platform that connects multiple Gmail accounts, analyzes
messages with specialized AI agents, drafts replies for human approval, and
schedules delivery — with a dashboard for agent activity and analytics.

> **Status:** early development. This repository currently contains the
> dashboard shell and fictional demo data only. Gmail, OpenRouter, and AI agent
> integrations are not implemented yet. See [Roadmap](#roadmap).

## Features

Working today:

- Responsive SaaS dashboard layout with sidebar navigation
- Dashboard overview cards and recent activity feed
- Inbox list with category, priority, and AI summary fields (mock data)
- Placeholder pages for scheduled emails, agent activity, analytics, settings

Planned (not yet built):

- Multiple Gmail accounts via Google OAuth 2.0
- Classification, summarization, and reply-generation agents on OpenRouter
- Human-approved scheduled sending with Cloudflare Cron Triggers
- Agent run logging, token/cost tracking, and live analytics
- Public demo mode with fictional data

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, Lucide |
| Backend (planned) | Hono on Cloudflare Workers |
| Database (planned) | Cloudflare D1 (SQLite) |
| AI (planned) | OpenRouter API, Zod-validated agent output |
| Email (planned) | Gmail API, Google OAuth 2.0 |
| Scheduling (planned) | Cloudflare Cron Triggers |
| Testing (planned) | Vitest |

## Getting started

Requires Node.js 20.19+ and npm.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The app runs fully offline with mock data.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |

## Project structure

```
src/
├── main.tsx           React entry point
├── App.tsx            Route table
├── components/        Layout and shared UI
├── data/              Fictional demo data
└── pages/             One component per dashboard route
```

## Environment variables

None required yet. When integrations land, secrets such as
`OPENROUTER_API_KEY`, `GOOGLE_CLIENT_SECRET`, and token-encryption keys stay
server-side and are documented in `.env.example`. Never commit `.env`.

## Security notes

Demo data in `src/data/` is fictional. No real email content, OAuth tokens, or
API keys are stored in this repository. AI agents will never send email
without explicit human approval.

## Roadmap

1. Foundations — tooling, first app, GitHub repo ✅
2. Dashboard — Tailwind, layout, sidebar, inbox UI 🚧
3. Backend — Hono, Cloudflare Workers, D1 migrations
4. OpenRouter — model list, selector, inference
5. Agents — orchestrator, classification, summarization, reply
6. Gmail — OAuth, multi-account, manual sync
7. Scheduling — approval, cron sending, statuses
8. Analytics and testing
9. Deployment, demo mode, portfolio docs

## License

MIT
