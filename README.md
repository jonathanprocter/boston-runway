# Boston Runway

A behavioral co-pilot for the 20-day runway to the Boston men's yoga retreat. Built by Jonathan Procter, Ph.D., LMHC for his client John Best.

## What this is

A full-stack web app that combines:

- **Setup wizard** — six steps to build a B=MAP recipe (Motivation × Ability × Prompt + Celebration + Identity)
- **Low-friction daily logging** — 15-second morning intention, under-a-minute evening reflection, both tap-first
- **Event-level database** — every interaction logged (Postgres)
- **Daily observational praise** — Claude generates one sentence of specific, non-cheerleading acknowledgment each morning, based on John's actual recent data
- **Weather integration** — Open-Meteo (no API key), showing temp and conditions so the morning has physical context
- **Built-in Claude companion** — full chat with John's clinical profile, the four behavior-change principles, his logged history, and Jonathan's voice loaded into the system prompt
- **Pattern insights** — on-demand Claude analysis of logged data

## Architecture

```
boston-runway/
├── server/index.js          # Express API + Claude proxy + Open-Meteo proxy
├── client/                  # Vite + React + Tailwind frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── package.json             # root — Express + pg
├── render.yaml              # Render infrastructure-as-code
└── README.md
```

On Render, the Node web service both serves the API (`/api/*`) and serves the compiled frontend (`/`). Single service, one URL.

## Deploying to Render

### 1. Prerequisites

- A Render account
- An Anthropic API key

### 2. Push to GitHub

```bash
cd boston-runway
git init
git add .
git commit -m "Initial commit"
gh repo create boston-runway --private --source=. --push
```

### 3. Create the services on Render

**Option A: Blueprint deploy (recommended)**

1. In the Render dashboard, click **New → Blueprint**
2. Connect the GitHub repo
3. Render reads `render.yaml` and proposes the web service + Postgres database
4. Accept. It will provision both.

**Option B: Manual**

If you don't want to use the blueprint:

1. Create a new **Postgres** database on Render (any plan; Starter is $7/mo)
2. Create a new **Web Service** pointing to the repo
   - Build: `npm install && npm run build`
   - Start: `npm start`
   - Node version: 20
3. Link the database: add `DATABASE_URL` env var from the database's internal connection string
4. Add the Anthropic env vars (next step)

### 4. Set environment variables

In the web service settings on Render, add:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (secret) |
| `ANTHROPIC_MODEL` | `claude-opus-4-7` (or whichever model you prefer) |
| `NODE_VERSION` | `20` |
| `DATABASE_URL` | Auto-wired from the Postgres database |

### 5. Deploy

Render will build on push. First build takes 2-3 minutes (npm install + Vite build).

The database schema is created automatically on server startup (see `initDb()` in `server/index.js`).

## Running locally

```bash
# Install everything
npm install

# In one terminal: start the backend
npm run dev:server

# In another terminal: start the Vite dev server
npm run dev:client
```

The Vite dev server runs on port 5173 and proxies `/api/*` to the backend on port 3001.

You'll need a local Postgres for development, or point `DATABASE_URL` at a Render-hosted dev database.

### Local env vars

Create `.env` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-7
DATABASE_URL=postgresql://localhost:5432/boston_runway
PORT=3001
```

Then `source .env` before `npm run dev:server`, or install `dotenv` and import at the top of `server/index.js`.

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/bootstrap` | Initial load: returns config + events + intentions + reflections + chat + insights |
| POST | `/api/config` | Save setup config |
| POST | `/api/events` | Append event |
| POST | `/api/intentions` | Upsert morning intention (by date) |
| POST | `/api/reflections` | Upsert evening reflection (by date) |
| POST | `/api/chat` | Send message, get Claude response, save both |
| DELETE | `/api/chat` | Clear conversation history |
| POST | `/api/insights/generate` | Generate a pattern insight from recent data |
| GET | `/api/weather` | Weather (Open-Meteo, no key required) |
| GET | `/api/daily-praise` | Today's observational praise (cached per day) |
| GET | `/api/health` | Health check |

## Database schema

Seven tables, all created automatically on startup:

- `config` — one-row table holding the user's recipe + identity statement
- `events` — full engagement log (UUID, type, JSONB data, timestamp)
- `intentions` — morning intentions keyed by date
- `reflections` — evening reflections keyed by date
- `chat_messages` — conversation history with the companion
- `insights` — AI-generated pattern observations
- `daily_praise` — one observational praise sentence per day, cached

## Security notes

- The Anthropic API key lives only in the backend env — never exposed to the browser
- CORS is wide-open since this is deployed as a single-origin app (frontend served by the backend). If you split origins, lock it down.
- No authentication is implemented — this is a single-user tool. If deploying for multiple users, add auth before going live.

## Voice + behavior notes

All of Claude's responses are constrained by a system prompt that includes:

- John's clinical profile (age, partner, therapy history, key quotes from sessions)
- His current recipe + identity
- Recent logged data (last 5 intentions, last 5 reflections)
- The four distilled principles from the five book summaries Jonathan sent him
- Voice guidance (match Jonathan's register — direct, warm, no cheerleading, no markdown)

The model is told explicitly: "You are NOT John's therapist. Jonathan is." And it's told to redirect to Jonathan for crisis content or major life decisions.

## Tuning

Things you'll probably want to adjust for John specifically:

- **Default location** (`DEFAULT_LOCATION` in `App.jsx`) — currently Long Beach, NY
- **Retreat date** — currently `2026-05-02`; edit in `App.jsx` default config
- **Model** — change `ANTHROPIC_MODEL` env var if you want Sonnet instead of Opus
- **Praise prompt** — adjust the `SPECIAL TASK` block in `/api/daily-praise` handler if the praise register drifts
- **Quick-start prompts** — six prompts hardcoded in the Companion screen, adjust to taste

---

*Built for Jonathan Procter's private practice. Not for release.*
