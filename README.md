# Lawyered — AI-Assisted Will Maker

A full-stack application that guides users through creating a legal will via an AI interview. Built with **NestJS · Next.js · PostgreSQL · Claude (Anthropic)**.

---

## Mock Mode vs Real AI Mode

The app runs in two modes depending on whether an Anthropic API key is set:

| | Mock Mode | Real AI Mode |
|---|---|---|
| **API key required** | No | Yes |
| **Chat UI & streaming** | ✅ Works | ✅ Works |
| **Scripted questions** | ✅ (fixed sequence) | ✅ (intelligent, adaptive) |
| **Data extraction from answers** | ❌ Preview stays empty | ✅ Live preview updates |
| **PDF download** | ✅ Works (demo user) | ✅ Works |
| **Backend log** | `[InterviewService] MOCK MODE` | (no warning) |

**Mock mode is the default** — no API key needed to run the app. The chat shows a scripted set of questions and displays `⚠️ Mock mode — add ANTHROPIC_API_KEY to .env` as the last message.

### Enabling Real AI Mode

1. Get an API key at [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key
2. Open `backend/.env` and update:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxx
   ```
3. Restart the backend (`Ctrl+C` then `npm run start:dev`)

No code changes needed — the service auto-detects the key and switches to real Claude (Haiku).

---

## Quick start (Docker — recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Node.js 20+

> **macOS tip:** Clone or unzip the project into a folder path **without spaces** (e.g. `~/Desktop/lawyered-will-maker` or `~/Projects/lawyered-will-maker`). Paths with spaces can cause Next.js native binary issues on macOS.

### Step 1 — Configure

```bash
git clone <repo-url>
cd lawyered-will-maker
cp .env.example .env
```

The app runs in mock mode by default. If you have an Anthropic API key, open `.env` and add it now (optional).

### Step 2 — Start all services

```bash
docker compose up --build
```

Wait until you see:
```
lawyered_backend   | Lawyered backend running on port 3001
lawyered_frontend  | ▲ Next.js - Local: http://localhost:3000
```

### Step 3 — Seed the database

In a new terminal:
```bash
docker compose exec backend npm run db:seed
```

Expected output:
```
✅ Seed complete!
   Demo user: demo@lawyered.com / demo1234
```

### Step 4 — Open the app

Visit [http://localhost:3000](http://localhost:3000)

- **Demo account** `demo@lawyered.com` / `demo1234` — opens a fully completed will ready to download
- **Register a new account** — starts the AI interview from scratch

---

## Local development (without Docker)

Use this if you prefer to run services directly on your machine.

### Step 1 — Start only PostgreSQL via Docker

```bash
docker compose up postgres -d
```

Expected: `Container lawyered_db Started`

### Step 2 — Configure and run the backend

```bash
cd backend
npm install
cp ../.env.example .env   # creates backend/.env — NestJS reads .env from its own directory
npm run start:dev
```

Expected: `Lawyered backend running on port 3001`

> **Port conflict?** If you see `EADDRINUSE :3001`, run `lsof -ti :3001 | xargs kill -9` then retry.

### Step 3 — Seed the database

Open a new terminal:
```bash
cd backend
npm run db:seed
```

Expected:
```
✅ Seed complete!
   Demo user: demo@lawyered.com / demo1234
```

### Step 4 — Run the frontend

Open another new terminal:
```bash
cd frontend
npm install
npm run dev
```

Expected: `▲ Next.js - Local: http://localhost:3000`

### Step 5 — Open the app

Visit [http://localhost:3000](http://localhost:3000)

---

## Running tests

```bash
cd backend
npm test           # all unit tests
npm run test:cov   # with coverage report
```

All tests should pass. The suite covers:
- `auth.service.spec.ts` — password hashing, JWT, login errors
- `validity.service.spec.ts` — all four states (INCOMPLETE / INVALID / WARNING / VALID)
- `interview.service.spec.ts` — context window capping, message persistence

---

## Project structure

```
lawyered-will-maker/
├── backend/                    # NestJS API
│   └── src/
│       ├── auth/               # JWT auth (Part 1)
│       ├── users/              # User entity + service
│       ├── wills/              # DB entities + wills service (Part 2)
│       │   └── entities/       # Will, Beneficiary, Asset, AssetShare,
│       │                       # Executor, Guardian, Witness, ChatMessage
│       ├── interview/          # AI interview + streaming (Parts 3, 8)
│       ├── validity/           # Validation rules (Part 4)
│       ├── document/           # PDF generation (Part 5)
│       └── database/           # Seed script
├── frontend/                   # Next.js app
│   └── src/
│       ├── app/
│       │   ├── auth/           # Login + Register pages
│       │   └── will/           # Split-view will builder (Part 6)
│       ├── components/
│       │   ├── Chat/           # AI chat panel with streaming
│       │   └── WillPreview/    # Live will preview
│       └── lib/                # API client, auth helpers
├── DECISIONS.md                # 6 architectural decisions (Part 7)
├── INCIDENT.md                 # On-call runbook (Part 7)
├── docker-compose.yml
└── .env.example
```

---

## API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login, get JWT |
| POST | `/api/wills` | JWT | Create new will |
| GET | `/api/wills` | JWT | List user's wills |
| GET | `/api/wills/:id` | JWT | Get full will data |
| POST | `/api/wills/:id/interview/start` | JWT | Begin interview |
| POST | `/api/wills/:id/interview/message` | JWT | Send message, get reply |
| GET | `/api/wills/:id/interview/stream` | JWT | SSE streaming reply (Part 8) |
| GET | `/api/wills/:id/validity` | JWT | Check will validity |
| GET | `/api/wills/:id/document/download` | JWT | Download PDF |

---

## AI tools used

- **Claude (Anthropic)** — used throughout. Helped generate entity boilerplate, the pdfkit layout code, and the SSE streaming wiring.

**One thing it got wrong that I caught:** When generating the `AssetShare` entity, Claude initially set the `percentage` column type to `float` rather than `decimal(5,2)`. Float types have precision issues — `100.0 - 30.0 - 20.0 - 50.0` can return a tiny floating-point residue instead of exactly `0`, which would silently break the "shares sum to 100%" validity check. Changed to `decimal(5,2)` and added `Math.round(total * 100) / 100` in the validity check as a belt-and-suspenders guard.

---

## What was skipped and why

- **Part 8 (streaming)** — **included** — SSE streaming is implemented in `InterviewController` and the frontend.
- **Database migrations** — using `synchronize: true` in development for speed. Production would use explicit TypeORM migrations.
- **E2E tests** — unit tests cover the core services. E2E requires a live Postgres + mocked Anthropic and was deprioritised in favour of depth in unit tests.
- **Email verification** — explicitly excluded per the brief.
