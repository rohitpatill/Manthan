# Manthan — Project Blueprint (claude.md)

> **Purpose of this file.** This is the single, complete reference for the Manthan project.
> Any engineer or AI agent should be able to read this and confidently make changes anywhere
> in the codebase. It covers the idea, architecture, every file's responsibility, the data
> model, the request/data-flow for every feature, the streaming protocol, and the conventions.
> Keep it updated when you change structure, endpoints, the DB schema, or core logic.
>
> **Living document — keep it current.** This file must stay a complete, accurate picture of
> the project throughout development. Whenever a change is confirmed working by the person
> directing the work, update every section it touches (files, endpoints, schema, data flow,
> conventions) in the same pass — do not let the blueprint drift from the code. See §11.9.

---

## 1. The Idea (why this exists)

Most people use AI by pasting a problem into one chatbot and getting one answer from one
"mind." **Manthan** is built on a different principle — the **wisdom of diverse experts**
("diversity trumps ability" / wisdom of crowds): when the *same* hard problem is given to a
scientist, an economist, an ethicist, a strategist — each reasoning independently — you get
genuinely different framings, the conflicts between them surface, and the final decision is
far stronger than any single brilliant answer.

The name is Sanskrit — **मंथन / Manthan, "churning"** — after the *Samudra Manthan* myth where
many forces churn the same ocean to surface its essence (nectar). That is the product: many
expert minds churn one problem; the synthesis is the nectar.

**What the app does, end to end:**
1. The user builds a library of **experts** (personas), each assigned to whichever LLM model
   suits that kind of thinking (e.g. an engineer on Gemini, an ethicist on Claude).
2. The user opens a **council session**, picks experts, and briefs a guide agent
   (**"Manthan AI"**) in a chat until the problem is fully understood.
3. Manthan AI compiles a single **brief**; the user approves it.
4. **Round 1:** the identical brief goes to every expert in parallel — each answers
   independently and **blind** (no expert sees another's answer), streaming live.
5. Optional **Synthesis:** Manthan AI combines all answers into one verdict (agreements,
   conflicts, recommendation).
6. Optional **Round 2 (debate):** each expert now sees the others' Round-1 answers **and** the
   Round-1 synthesis, and revises/defends — then a final synthesis runs.
7. The session **freezes** into a permanent, read-only record. Every LLM call is logged and
   every token/dollar is tracked in analytics.

**Principles that must not be broken:**
- **Local-first, BYOK (bring your own keys).** No auth, no accounts, no cloud. The user's own
  OpenAI/Gemini/Anthropic API keys power everything; keys are encrypted at rest locally.
- **Round 1 is blind.** Experts never see each other in Round 1.
- **Experts library is the source of truth** for an expert's model/persona — *until* a session
  runs, after which that session is frozen to what it actually used (historical accuracy).
- **Everything is traceable.** Each session has a full `.md` + `.jsonl` log of every call.

---

## 2. Tech Stack & Top-Level Layout

```
ExpertsCouncil/                 ← repo root
├── claude.md                   ← THIS FILE (project blueprint)
├── .gitignore                  ← ignores .env, *.db, node_modules, logs/, docs/, etc.
├── FRONTEND_PROMPT.md           ← (gitignored) original design brief, local only
├── docs/                        ← (gitignored) local-only docs incl. GIT_INSTRUCTIONS.md
├── backend/                     ← Python FastAPI + SQLite
└── frontend/                    ← React + Vite SPA
```

- **Backend:** Python 3.10+, FastAPI, SQLite (stdlib `sqlite3`), `httpx` (async HTTP to LLM
  providers), Pydantic. Runs on `http://127.0.0.1:8000`.
- **Frontend:** React 18 + Vite, plain JS (JSX), no UI framework, no chart library — bespoke
  SVG charts and a hand-rolled CSS design system. Runs on `http://localhost:5173` (dev),
  proxies `/api` and `/uploads` to the backend.
- **No ORM, no state library** — raw SQL on the backend, a small reactive store on the frontend.

---

## 3. Backend — Structure & File Responsibilities

```
backend/
├── main.py               FastAPI app: router mounting, startup (init_db, .env key import,
│                         seed starter experts), admin endpoints (/api/health,
│                         /api/seed-starters, /api/admin/clear-data — selective wipe via
│                         independent flags sessions/experts/analytics, +keep_keys=false for
│                         full "start from scratch"; no auto-reseed).
├── config.py             Paths, MOCK_MODE flag, token budgets, SYNTHESIS_MAX_WORDS_DEFAULT
│                         (700, the fallback for the user-editable global synthesis word cap),
│                         expert min/max, and .env loader → ENV_API_KEYS (placeholder
│                         "REPLACE-ME" keys are ignored).
├── db.py                 SQLite: connection ctx manager, init_db() schema + lightweight
│                         migrations, DPAPI/base64 secret encryption, mask_key(), helpers
│                         (row_to_dict, rows_to_dicts, get/set_setting, dumps/loads).
├── data/expert_pack.json A curated, importable library of ~70 experts across 20 domains
│                         (no avatars/model — model is chosen at import). Each entry has a
│                         stable pack_key used for idempotent import (re-import adds only
│                         entries whose pack_key is not already in the DB; never overwrites).
├── prompts.py            All system prompts + user-message builders: INTAKE, BUILDER, SUGGEST,
│                         expert_system_prompt(), round2_user_message(), synthesis prompts.
│                         Word limits are PARAMETERS: expert_system_prompt(...,max_words) and
│                         round2_user_message(...,max_words) take the per-expert cap;
│                         synthesis_system_prompt(max_words) takes the global synthesis cap.
│                         BUILDER prompt also asks for a suggested_max_words (50–500, default 300)
│                         and a suggested_domain (reuse an existing library domain if one fits,
│                         else propose a concise new one). The synthesis prompt is written to speak
│                         TO the user (not recap the panel): answer-first, decisive, and free to
│                         choose whatever structure best fits the question — the only fixed format
│                         rule is the "STANCE:" first line (see §7.3).
├── requirements.txt      fastapi, uvicorn[standard], httpx, pydantic, python-multipart, pytest
├── .env                  (gitignored) OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY
├── manthan.db            (gitignored) the live SQLite database (created on first run)
├── uploads/avatars/      (gitignored content) uploaded expert avatar images
├── logs/                 (gitignored) per-session logs (see §7)
│
├── providers/            LLM provider abstraction
│   ├── base.py           BaseProvider (abstract): validate_api_key, generate_json,
│   │                     stream_text; ProviderError. Usage normalized to
│   │                     {input_tokens, output_tokens, cached_tokens}.
│   ├── openai_provider.py    OpenAI /v1/responses API (json + SSE streaming).
│   ├── gemini_provider.py    Google Gemini generateContent + streamGenerateContent (SSE).
│   ├── anthropic_provider.py Anthropic /v1/messages (json + SSE streaming).
│   ├── mock_provider.py  Deterministic offline provider used when MANTHAN_MOCK=1 (tests).
│   ├── factory.py        get_provider(type) → real provider, or MockProvider in mock mode.
│   ├── registry.py       PROVIDER_CATALOG (models + per-1M pricing), compute_cost(),
│   │                     model_exists(), model_pricing().
│   └── __init__.py       re-exports.
│
├── services/
│   ├── llm.py            Shared helpers: get_api_key, get_default_model,
│   │                     validate_model_choice, record_usage (writes usage_log + cost),
│   │                     call_json (structured calls + optional logging), split_stance.
│   ├── orchestrator.py   THE ENGINE. Runs rounds (parallel expert streaming merged into one
│   │                     SSE stream), synthesis, status derivation, freeze, resume/skip-done,
│   │                     single-expert retry. Builds R2 context (peers + R1 synthesis).
│   └── session_logger.py Per-session .md + .jsonl logging of every LLM call (full prompts).
│
├── routers/
│   ├── providers.py      /api/providers : list (+catalog+default_model+synthesis_max_words),
│   │                     save+validate key, delete key, set default model, set app-settings
│   │                     (PUT /app-settings → global synthesis_max_words).
│   ├── experts.py        /api/experts : CRUD, duplicate, builder/chat (Manthan AI persona
│   │                     designer — fed existing domains, returns suggested_domain), suggest
│   │                     (panel suggestion), pack/preview (what an import would add vs skip)
│   │                     and pack/import (idempotent import of data/expert_pack.json, all
│   │                     assigned the one model the user picks).
│   ├── sessions.py       /api/sessions : create (with optional per-run model_overrides),
│   │                     list, detail, rename, delete, intake turn,
│   │                     pending-brief save, back-to-briefing, dispatch (R1 SSE), round2 (SSE),
│   │                     synthesize (SSE), expert retry (SSE). Holds _live_overlay_experts.
│   ├── analytics.py      /api/analytics : filtered rollups + time series (range/granularity/
│   │                     provider).
│   └── uploads.py        /api/uploads/avatar : image upload → /uploads/avatars/<file>.
│
└── tests/
    ├── test_api.py       32 end-to-end API tests (mock mode). Run: python -m pytest tests/
    ├── live_test.py      Full flow against REAL provider keys (cheap models).
    ├── e2e/flow.mjs      Node script exercising the same REST+SSE the frontend uses.
    └── tmp/              (gitignored) throwaway test databases + logs.
```

### Key backend conventions
- **Async throughout** for provider calls (`httpx.AsyncClient`). The orchestrator uses
  `asyncio` tasks + a shared `asyncio.Queue` to merge concurrent expert streams.
- **Each DB op opens its own short-lived connection** via `with db.get_conn() as conn:`
  (auto-commit, `PRAGMA foreign_keys = ON`). Never hold a connection across an `await`.
- **Mock mode**: set env `MANTHAN_MOCK=1` → `get_provider` returns `MockProvider`
  (deterministic, no network/keys). Tests rely on this.
- **Errors** surface as `HTTPException` with a clear `detail` string; the frontend shows it.

---

## 4. Frontend — Structure & File Responsibilities

```
frontend/
├── index.html            Vite entry → /src/main.jsx
├── vite.config.js        React plugin + dev proxy (/api, /uploads → :8000)
├── package.json          react, react-dom, vite, @vitejs/plugin-react
├── public/fonts/         Plus Jakarta Sans variable fonts
├── prototype/            (kept for reference) the original plain-JS mockup — NOT the app
└── src/
    ├── main.jsx          ReactDOM root; imports styles/manthan.css.
    ├── App.jsx           Root: hash-router (#/home, #/experts, …), onboarding guard,
    │                     calls API.init() on mount, loading + backend-unreachable screens.
    ├── styles/manthan.css  The entire design system: tokens (CSS vars), buttons, inputs,
    │                       cards, chips, badges, avatars, modal, status dots, churn spinner,
    │                       prose, AND the responsive media queries (§8).
    ├── lib/
    │   ├── catalog.js     Provider display metadata + model catalog. Models/pricing are
    │   │                  filled from the backend (Catalog.setModels) — NOT hardcoded.
    │   │                  costOf(), fmtCost(), fmtTok(), estimateTokens().
    │   └── store.js       THE FRONTEND BRAIN. Reactive store + the real API client
    │                      (REST + SSE). Normalizes backend payloads, runs the live-run
    │                      orchestration (runFlow/runStage/makeEventHandler), abort/stop,
    │                      derives session status. Exposes window-free `API` + `useStore`.
    └── components/
    │   ├── ui.jsx         Shared primitives: useStore hook, Icon, ManthanMark, ExpertAvatar,
    │   │                  ModelChip, ModelPicker, Md (mini-markdown), Modal, Confirm, Menu,
    │   │                  Toggle, EmptyState, EditableTitle, SessionStatus, ChatBubble.
    │   └── shell.jsx      App shell: desktop sidebar + mobile top-bar/drawer (responsive),
    │                      navigate(), Page wrapper.
    └── screens/
        ├── onboarding.jsx  First-run: paste+validate keys → pick default model. ProviderKeyCard.
        ├── home.jsx        Sessions list (in-progress + frozen archive). SessionRow.
        ├── experts.jsx     Experts library grouped by domain in a collapsible DomainAccordion
        │                   (first domain auto-opens once; Expand/Collapse all). ExpertEditor
        │                   (manual; includes domain dropdown + max-words), BuilderChat (Manthan
        │                   AI), ImportPackModal (pick one model → preview → idempotent import),
        │                   groupByDomain(), expertNeedsReassignment().
        ├── session.jsx     Session lifecycle controller: NewSession (configure — selected experts
        │                   have a per-run "Change model" popup, ModelOverrideModal), IntakeChat,
        │                   BriefApproval, SessionScreen (routes to the right phase view).
        ├── panel.jsx       LivePanel (rounds + synthesis, stepper, stop banner, retry/resume),
        │                   FrozenView (full archived record + cost breakdown), SessionCostTicker.
        ├── analytics.jsx   Premium dashboard: filters, KPI cards, SVG spend chart, donut,
        │                   call-type bars, sortable tables.
        └── settings.jsx    Provider keys, default model, synthesis word limit, selective
                            clear-data (Sessions/Experts/Analytics checkboxes), Restore
                            starter experts, start-from-scratch.
```

### Key frontend conventions
- **No global window state.** Everything goes through `import { API } from '../lib/store'`
  and `useStore()` (a subscribe-based hook that re-renders on store change).
- **Styling** is inline styles + the shared CSS classes/tokens in `manthan.css`. Colors always
  reference CSS variables (`var(--primary)`, `var(--ink)`, …) — never hardcode hex in JSX
  except the navy sidebar accents.
- **Responsive** behavior is class-driven (`mn-2col`, `mn-stack`, `mn-kpis`, `mn-pad`,
  `mn-scroll-x`, `mn-session-row`, etc.) with all overrides inside media queries so desktop
  is the untouched default. See §8.
- **Routing** is hash-based (`location.hash`), no router library.

---

## 5. Data Model (SQLite — defined in `backend/db.py :: init_db`)

```
settings(key PK, value)                         -- e.g. default_provider_type, default_model_id,
                                                --      synthesis_max_words (global synthesis cap)

provider_configs(
  id, provider_type UNIQUE, display_name,
  api_key_ciphertext,        -- DPAPI-encrypted (Win) / base64 (else); NEVER plaintext
  masked_key,                -- e.g. "sk-pro…AB12" for display
  is_valid, validation_error, validated_at, created_at, updated_at)

experts(                                          -- the reusable persona library (source of truth)
  id, name, title, persona, avatar_url,
  provider_type, model_id,
  max_words,                                      -- per-expert answer word cap (default 300, range 50–500)
  domain,                                         -- category for grouping in the library (free text; '' = Others)
  pack_key,                                       -- stable id for imported pack experts ('' for user-created); dedup key for import
  is_starter,
  created_at, updated_at)

sessions(
  id, title, status,                              -- status is DERIVED, see §6
  round2_enabled, synthesis_enabled,
  pending_brief,                                  -- AI-compiled brief awaiting approval (survives refresh)
  compiled_brief,                                 -- the approved brief that experts receive
  round1_done, round2_done, synth1_done, synth2_done,  -- stage flags
  created_at, updated_at)

session_experts(                                  -- snapshot of experts chosen for a session
  id, session_id→sessions, expert_id→experts (nullable if source deleted),
  name, title, persona, avatar_url,
  provider_type, model_id, max_words, domain,
  overridden,                                     -- 1 = model was overridden for THIS session at create time
  sort_order)
  -- Re-synced from the live expert at DISPATCH while not-yet-run; frozen after.
  -- max_words and domain are snapshotted/re-synced alongside model & persona.
  -- If overridden=1, the per-run provider/model is preserved (NOT re-synced from the library).

intake_messages(id, session_id→sessions, role, content, created_at)  -- the briefing chat

responses(                                        -- expert answers + syntheses
  id, session_id→sessions, session_expert_id→session_experts (null for synthesis),
  kind ('expert'|'synthesis'), round (1|2),
  stance, content, status ('done'|'failed'), error, created_at,
  UNIQUE(session_id, session_expert_id, kind, round))   -- so retries upsert

usage_log(                                        -- one row per LLM call (powers analytics)
  id, session_id (nullable), expert_name, provider_type, model_id,
  purpose (intake|builder|suggest|expert_r1|expert_r2|synthesis_r1|synthesis_r2),
  input_tokens, output_tokens, cached_tokens, cost, created_at)
```

`init_db()` also performs **idempotent migrations** (ALTER TABLE ADD COLUMN guarded by a
PRAGMA check) for columns added over time (masked_key, pending_brief, experts.max_words,
experts.domain, experts.pack_key, session_experts.max_words, session_experts.domain,
session_experts.overridden, etc.).
Adding a new column = add it to the CREATE TABLE *and* add a guarded ALTER for existing DBs.

---

## 6. Session Status (derived, never hand-set)

`orchestrator.compute_status(session)` derives status from the stage flags + toggles:

- `briefing` — no `compiled_brief` yet (intake chat in progress).
- `ready` — brief approved/dispatched, Round 1 not done. *(Frontend also uses
  `awaiting-approval` when a `pending_brief` exists; the brief-approval screen.)*
- `in_progress` — Round 1 done, more stages pending.
- `frozen` — all enabled stages complete (R1 [+synth1] [+R2] [+synth2]). Read-only forever.

The frontend `store.js :: deriveStatus` mirrors this and adds transient run states
(`round1`, `synthesis1`, `round2`, `synthesis2`, `round1-partial`, `round2-partial`) used to
drive the live panel and the resume/retry banners.

---

## 7. Core Data Flows

### 7.1 Onboarding & keys
1. `App.jsx` mounts → `API.init()` loads `/api/providers` (catalog + key states + default
   model), `/api/experts`, `/api/sessions`.
2. If a valid key + default model already exist (e.g. imported from `.env` on backend startup),
   onboarding is auto-skipped.
3. `onboarding.jsx` → `POST /api/providers {provider_type, api_key}` validates against the
   provider and stores it encrypted. `PUT /api/providers/default-model` sets the model that
   powers Manthan AI. `completeOnboarding()` calls `POST /api/seed-starters`.
- **Key gating rule (everywhere):** model pickers only show models from providers whose key
  `is_valid`. Deleting a key flags affected experts as "needs reassignment".

### 7.2 Experts
- Manual: `experts.jsx` ExpertEditor → `POST/PUT /api/experts`. Avatar via
  `POST /api/uploads/avatar` (file) or a pasted public URL. The editor includes a `domain`
  dropdown (existing domains + "Create new domain" + "Others").
- Import pack: `ImportPackModal` → `GET /api/experts/pack/preview` (adds vs already-present,
  by domain) → user picks ONE model for all → `POST /api/experts/pack/import {provider_type,
  model_id}`. Idempotent by `pack_key`: re-import only restores deleted entries and never
  duplicates or overwrites edited ones (editing a pack expert keeps its pack_key).
- Library is grouped by `domain` and rendered as a collapsible accordion (see experts.jsx).
- Via Manthan AI: BuilderChat → `POST /api/experts/builder/chat {messages}` → returns a drafted
  `{name, title, persona, suggested_provider_type, suggested_model_id, suggested_max_words}` for
  review, then saved. `suggested_max_words` defaults to 300 unless the user asked for shorter/longer.
  The builder is fed the library's existing domains and returns `suggested_domain` (reusing one
  if it fits, else proposing a concise new domain).
- Each expert carries a `max_words` cap (default 300, range 50–500), editable in the Expert editor;
  it is injected into that expert's own Round 1 & Round 2 prompts only (never mixed across experts).
- Suggestion (in NewSession): `POST /api/experts/suggest {problem}` → relevant expert ids.

### 7.3 The council session (the heart) — request/data flow
1. **Create:** `POST /api/sessions {title, expert_ids, round2_enabled, synthesis_enabled,
   model_overrides}`. Backend snapshots chosen experts into `session_experts`. `model_overrides`
   is an optional `{expert_id: {provider_type, model_id}}` map (set on the convene screen via the
   per-expert "Change model" popup) — the chosen model applies to THIS session only, is validated
   (key-gated), and marks that participant `overridden=1`. The library expert is never changed.
2. **Intake chat:** `POST /api/sessions/{id}/intake {message}` (per turn). Manthan AI (default
   model, JSON mode) returns `{assistant_message, ready_to_dispatch, compiled_brief}`. When
   ready, the brief is saved to `sessions.pending_brief` (survives refresh).
3. **Brief approval:** the editable brief is shown. Edits save on blur via
   `PUT /api/sessions/{id}/pending-brief`. "Back to briefing" → `POST /back-to-briefing`.
4. **Dispatch (Round 1):** `POST /api/sessions/{id}/dispatch {brief}` →
   - stores `compiled_brief`, clears `pending_brief`;
   - **re-reads each not-yet-run session_expert from its live source expert** (model/persona/
     max_words) — unless the expert was deleted or its provider key is now invalid. A participant
     with `overridden=1` keeps its per-run provider/model (only persona/name/etc. re-sync);
   - streams Round 1 as **SSE** (see §7.4). Each expert: persona system prompt (with its own
     `max_words` cap) + the brief only (blind). Answers stream in parallel.
5. **Synthesis (if enabled):** `POST /api/sessions/{id}/synthesize?round=1` (SSE). Manthan AI
   gets the brief + all done answers (+ notes any failed/missing experts). The synthesis is
   written **for the user, not about the panel** — it leads with the decisive answer, weaves in
   only the cross-expert reasoning/conflict that changes what the user should do, and **chooses
   whatever structure fits the question** (no fixed template; the only required format is the
   `STANCE:` first line). It does NOT recap each expert (their full answers are already shown
   above the synthesis). Its length obeys the global `synthesis_max_words` setting (default 700),
   read from the DB at synthesis time.
6. **Round 2 (if enabled):** `POST /api/sessions/{id}/round2` (SSE). Each expert receives a
   structured prompt (built by `prompts.round2_user_message`): platform context → brief →
   their own R1 answer → every peer's R1 answer (labeled) → **the R1 synthesis** → revise/defend.
7. **Final synthesis (if R2+synthesis):** `synthesize?round=2` (SSE).
8. **Freeze:** when all enabled stages are done, status → `frozen`; the session is read-only
   (intake, round2, dispatch all 409 on a frozen session). `FrozenView` shows the full record.

- **Failure isolation:** one expert failing (bad key, provider error) does not block others;
  its card shows the error with a **Retry** button → `POST /api/sessions/{id}/experts/{seid}/retry`.
  A full-round re-run **skips experts already done** (so resume never double-spends).
- **Stop:** the frontend aborts the in-flight SSE fetches (AbortController). Partial results are
  kept; the session is left resumable (`API.resume`).

### 7.4 The streaming (SSE) protocol — backend → frontend
Streaming endpoints (`/dispatch`, `/round2`, `/synthesize`, `/retry`) return
`text/event-stream`. The orchestrator runs all experts of a round as concurrent `asyncio`
tasks pushing events into one `asyncio.Queue`, yielded as `data: {json}\n\n` lines:

```
expert_start    {expert_id, name, round}
chunk           {expert_id, round, text}          # expert_id null ⇒ synthesis chunk
expert_done     {expert_id, round, stance, usage}
expert_failed   {expert_id, round, error}
synthesis_start {round}
synthesis_done  {round, stance, usage}
synthesis_failed{round, error}
stage_done      {stage, session_status}           # marks a round/synth complete (+ freeze)
```

The frontend (`store.js :: makeEventHandler`) consumes these, accumulates per-expert text,
splits the `STANCE:` first line, updates the reactive session detail, and re-renders the panel
live. **Preconditions are validated before streaming starts** (`validate_round`/
`validate_synthesis`) so errors return a proper HTTP status instead of arriving after a 200.

### 7.5 Logging (traceability) — `services/session_logger.py`
Every LLM call is logged with FULL prompts/outputs:
- Session-scoped calls → `logs/session_<id>.md` (readable timeline) + `logs/session_<id>.jsonl`
  (raw records), **append-only across resumes** (keyed by session id).
- Non-session calls (builder, suggest) → `logs/manthan-ai.jsonl`.
Each record: ts, purpose, expert, round, provider, model, status/error, duration_ms, usage,
cost, **system_prompt, input_messages, output**. This is the audit trail used to verify that
context (blind R1, R2 peers+synthesis, persona→model binding) is built correctly. Tests
redirect logs to `tests/tmp/logs` via `config.LOGS_DIR`.

### 7.6 Analytics
`GET /api/analytics?range=7d|30d|90d|all&granularity=daily|weekly|monthly&provider=all|<p>` →
server-side filtered rollups (totals, by_provider, by_model, by_expert, by_purpose, by_session)
+ a bucketed time `series`. Cost is computed from `registry.compute_cost` using the catalog
pricing at log time. The frontend renders bespoke SVG (area chart, donut, bars) + sortable
tables; one-bucket ranges show a "not enough data yet" state.

---

## 8. Responsiveness (frontend)

Desktop is the default and untouched; all responsive rules live in media queries in
`manthan.css`:
- **≤1000px (tablet):** fixed two-column page layouts stack (`mn-2col`, `mn-stack`), sticky
  sidebars become static, analytics KPIs go 4→2 cols, page padding tightens.
- **≤720px (phone):** the desktop sidebar becomes a **slide-in drawer** triggered by a mobile
  **top bar** with a hamburger (`shell.jsx` manages drawer state + backdrop + scroll lock);
  content is full-width; wide tables scroll horizontally (`mn-scroll-x`); session rows stack so
  avatars/cost don't overlap the title (`mn-session-row`/`mn-session-meta`); modals near-fullscreen.

---

## 9. Configuration & Run

**Backend** (`backend/`):
```
pip install -r requirements.txt
# put real keys in backend/.env (optional — can also add them in the UI):
#   OPENAI_API_KEY=...  GEMINI_API_KEY=...  ANTHROPIC_API_KEY=...
python main.py            # serves http://127.0.0.1:8000 (docs at /docs)
MANTHAN_MOCK=1 python ... # offline/deterministic mode (no keys/network) — used by tests
```
`config.py` knobs: `EXPERT_MAX_TOKENS`, `SYNTHESIS_MAX_TOKENS`, `INTAKE_MAX_TOKENS`,
`BUILDER_MAX_TOKENS`, `MIN/MAX_EXPERTS_PER_SESSION`, `DB_PATH`, `LOGS_DIR`.

**Frontend** (`frontend/`):
```
npm install
npm run dev               # http://localhost:5173, proxies /api + /uploads → :8000
npm run build             # production bundle to dist/
```

**Tests** (`backend/`): `python -m pytest tests/test_api.py` (32 tests, mock mode).

---

## 10. How to make common changes

| Change | Where |
|--------|-------|
| Add/adjust a model or pricing | `backend/providers/registry.py` (frontend reads it via `/api/providers`). |
| Add a new LLM provider | New `providers/<x>_provider.py` extending `BaseProvider` (impl `validate_api_key`, `generate_json`, `stream_text`); register in `factory.py`; add to `PROVIDER_CATALOG`; add display meta in `frontend/src/lib/catalog.js`. |
| Change an LLM prompt | `backend/prompts.py` (intake, builder, suggest, expert system prompt, round-2 context, synthesis). Verify via the session log. |
| Add/edit pack experts | Edit `backend/data/expert_pack.json` (each needs a unique `pack_key`, plus name/title/domain/persona). Count is read live — no code change. Re-import is idempotent by `pack_key`. |
| Per-run model override | Set on the convene screen (`session.jsx` ModelOverrideModal) → `model_overrides` in `POST /api/sessions` → snapshot stores it with `session_experts.overridden=1`; dispatch re-sync (`sessions.py`) preserves model for overridden participants. Library expert untouched; frozen session keeps the model it ran with. |
| Add/rename a domain | Domains are free text on `experts.domain` — just type a new one in the editor, set it in the pack JSON, or let the AI builder propose it. No table, no migration. Library grouping (`groupByDomain`/`DomainAccordion` in `experts.jsx`) picks it up automatically. |
| Adjust answer word limits | Per-expert: `experts.max_words` (UI in `experts.jsx` ExpertEditor; flows store → `prompts.expert_system_prompt`/`round2_user_message`). Global synthesis: `synthesis_max_words` setting (UI in `settings.jsx`; `PUT /api/providers/app-settings`; read in `orchestrator._synthesis_max_words` → `prompts.synthesis_system_prompt`). |
| Add a DB column | `db.py :: init_db` — add to CREATE TABLE **and** a guarded `ALTER TABLE ADD COLUMN`. |
| New API endpoint | Add to the relevant `routers/*.py`; mount is automatic if the router is already included in `main.py`. |
| New screen / route | Add a screen in `frontend/src/screens/`, wire a hash route in `App.jsx`, add a nav item in `shell.jsx`. |
| Touch the live-run / streaming logic | `backend/services/orchestrator.py` (server) + `frontend/src/lib/store.js` (client event handling). Keep the SSE event contract in §7.4 in sync on both sides. |
| Change analytics | `backend/routers/analytics.py` (rollups/series) + `frontend/src/screens/analytics.jsx` (charts/tables). |
| Adjust responsiveness | media queries in `frontend/src/styles/manthan.css` + the `mn-*` classes in screens. |

---

## 11. Invariants (do not break)

1. Round 1 is **blind** — experts get only their persona + the brief.
2. **Key-gated models** everywhere — never offer a model whose provider lacks a valid key.
3. **Frozen = immutable** — a frozen session never re-runs or mutates; archives keep the model
   they actually ran with.
4. **Source-of-truth = Experts library** for a not-yet-run session (re-read at dispatch).
5. **Secrets never leave the machine / repo** — keys encrypted at rest; `.env`, `*.db`, `logs/`,
   `docs/` are gitignored. No key is ever logged in plaintext to analytics.
6. **Every LLM call is logged** (full prompt/output) and **metered** (usage_log → analytics).
7. SSE event contract (§7.4) is shared by backend orchestrator and frontend store — change both.
8. Desktop UI is the default; responsiveness is additive via media queries only.
9. **This blueprint stays in sync with the code.** When a change is confirmed working by the
   person directing the work, update every section of this file it affects (file
   responsibilities, endpoints, §5 schema, §7 data flow, §10 how-to, conventions) in the same
   pass. The blueprint must never lag behind what the code actually does.
