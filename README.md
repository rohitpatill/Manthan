<div align="center">

# 🧠 Manthan

### What if you could ask a *council* of AI experts instead of one chatbot?

*Many minds. One problem. A stronger answer.*

</div>

---

## The idea

When you ask ChatGPT something, you're talking to **one model, in one voice**. You get a single
answer shaped by a single point of view. That's fine for most questions — but the hardest
problems aren't single-perspective problems. A decision about your company, your health, your
career, an ethical dilemma — these sit at the intersection of *many* kinds of thinking.
Science. Economics. Ethics. Strategy. Human psychology.

There's an old, well-proven idea behind this: **a diverse group of independent thinkers
consistently beats a single brilliant expert.** Give the same hard problem to a scientist, an
economist, an ethicist, and a strategist — separately — and you don't get the same answer four
times. You get four genuinely different framings, you see where they *disagree*, and the final
decision is far stronger because it survived all of them.

<img width="1350" height="1011" alt="image11" src="https://github.com/user-attachments/assets/266ceb40-b189-404e-8a3f-2480c1d40b85" />


**Manthan brings that to AI.**

> **A note on how this actually works (the honest version).**
> A large language model is not a stack of separate "expert brains" you can switch between.
> But when you give a model a specific role and persona, you **change the context it's
> reasoning in** — and that shifts its output toward a different region of everything it has
> learned. Telling it *"you are a skeptical macro-economist"* genuinely produces
> economist-flavored reasoning; *"you are a trauma surgeon"* produces something else entirely.
> So the right way to say it isn't "we activate unused parts of the model" — it's **we activate
> different *perspectives*.** The intuition holds; the mechanism is conditioning, not unlocking.

Manthan does two things a normal chatbot can't:

1. **Different experts, different best-in-class models.** Each expert isn't just a different
   prompt — you assign each one to whichever frontier model is *best* at that kind of thinking.
   Your engineer can run on Gemini, your ethicist on Claude, your economist on GPT. One
   conversation, many models, each playing to its strength. (With a normal chatbot you're stuck
   talking to one provider's one model.)

2. **It goes a step further — a real debate.** After every expert answers *independently and
   blind* (no one sees anyone else's answer), you can run a **second round** where each expert
   reads what the others said and revises or defends their position. Then a final synthesis
   weighs it all. It's not a poll — it's a deliberation.

The name says it: **Manthan** (Sanskrit, *मंथन*) means **"churning"** — from the myth of the
*Samudra Manthan*, where many great forces churned the same ocean together to bring up its
nectar. That's exactly the shape of this product: many expert minds churn one problem, and the
synthesis is the nectar.

---

## How Manthan solves it

You stay in control the whole way. Nothing expensive happens by accident, and nothing is hidden.

**1. Build your council.**
Start in seconds with a **curated library of 60+ ready-made experts across 20+ domains** —
science, engineering, law, medicine, economics, philosophy, strategy, and more — each a richly
written persona you can import with one click and assign to any model. Or make your own: write
the persona yourself, or describe what you need and let the built-in guide, **Manthan AI**, draft
it for you. Create experts once, organize them by domain, and reuse them forever.

**2. Convene a session and brief it.**
Pick the experts for this problem (or let Manthan AI suggest a panel). Then just *talk* to
Manthan AI like you'd brief a chief of staff — it asks clarifying questions until it truly
understands the problem, then compiles one clean brief. **You approve that brief before a single
expert is called** — so you never spend ten parallel model calls on a misunderstanding.

**3. Watch the council think — live and in parallel.**
The identical brief goes to every expert at once. Each answers **independently and blind**,
streaming in real time, each on its own model. You see every answer, with a one-line stance up
top so you can scan the whole panel at a glance.

**4. Get the synthesis.**
Manthan AI reads the entire panel and gives you **one clear, decisive answer to your problem** —
not a recap of who said what. It thinks across the experts, surfaces the genuine tensions only
where they change what you should do, and integrates the best of every mind into a single
recommendation written for you, in one voice.

**5. (Optional) Run the debate — Round 2.**
Turn it on and each expert is shown the others' answers *and* the first synthesis, then revises
or defends. A final synthesis weighs the sharpened positions. Two rounds, max — deliberate, not
endless.

**6. Freeze and keep it.**
When it's done, the session freezes into a permanent, read-only record — the briefing chat, the
exact brief, every answer, every synthesis, and the full cost. Revisit it any time.

And because it's your money powering it, **every token and every dollar is tracked** — a real
analytics dashboard breaks spend down by model, provider, expert, and session, over time.

---

## Why it's different

|  | A normal chatbot | **Manthan** |
|---|---|---|
| Perspectives | One | As many experts as you want |
| Models | One provider's model | The best model *per expert* (OpenAI · Gemini · Claude) |
| Independence | — | Experts answer blind in Round 1 — no groupthink |
| Disagreement | Hidden inside one answer | Surfaced explicitly, then debated |
| Depth | One pass | Independent round → synthesis → optional debate round → final synthesis |
| Transparency | A black box | Every answer shown; every call logged; every cost tracked |
| Your data | On someone's cloud | **Local-first, your own keys, your machine** |

---

## Local-first and private by design

Manthan runs entirely on **your own API keys** — no accounts, no sign-up, no cloud backend
holding your data. Your keys are encrypted on your own machine, your sessions live in a local
database, and every model call is something *you* paid for and can inspect. You bring the keys;
Manthan brings the orchestration.

---

## How it works (under the hood)

A clean two-part app:

- **Backend** — **Python · FastAPI · SQLite.** Talks to OpenAI, Google Gemini, and Anthropic
  through one unified provider layer; runs the council (parallel expert calls streamed over
  Server-Sent Events); stores everything locally; logs every call for full traceability.
- **Frontend** — **React · Vite.** A fast single-page app with a bespoke design system (no UI
  kit), live-streaming panels, and a usage/cost dashboard. Fully responsive — desktop to phone.

```
You ──▶ Manthan AI (briefing) ──▶ approved brief
                                      │
                 ┌────────────────────┼────────────────────┐
                 ▼                    ▼                    ▼
            Expert · GPT        Expert · Gemini       Expert · Claude     ← Round 1 (blind, parallel)
                 └────────────────────┼────────────────────┘
                                      ▼
                              Synthesis (Manthan AI)
                                      │
                              (optional) Round 2 — experts see each other & debate
                                      ▼
                              Final synthesis  ──▶  frozen, permanent record
```

> 📌 *Architecture and data-flow diagrams will be added here.*

For the full technical blueprint — file-by-file structure, the database schema, the streaming
protocol, and how to extend anything — see **[`claude.md`](claude.md)**.

---

## Get it running

You'll need **Python 3.10+**, **Node 18+**, and at least one API key (OpenAI, Gemini, and/or
Anthropic).

### 1. Backend

```bash
cd backend
pip install -r requirements.txt

# Optional: drop your keys in backend/.env so they load automatically.
# (You can also paste them in the app's onboarding screen instead.)
#   OPENAI_API_KEY=sk-...
#   GEMINI_API_KEY=AIza...
#   ANTHROPIC_API_KEY=sk-ant-...

python main.py
```

The API runs at **http://127.0.0.1:8000** (interactive docs at `/docs`).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the printed URL (**http://localhost:5173**). The dev server proxies API calls to the
backend automatically.

### 3. First run

If you didn't use `.env`, the onboarding screen walks you through pasting and validating a key,
then picking the default model that powers Manthan AI. You'll start with a set of ready-made
starter experts — convene them, brief a problem, and watch the council think.

> 💡 **Tip:** want to explore the UI without spending anything? Run the backend with
> `MANTHAN_MOCK=1` for deterministic, offline responses (also what the test suite uses).

---

## Tech at a glance

**Backend:** Python, FastAPI, SQLite, httpx (async), Pydantic · unified OpenAI/Gemini/Anthropic
provider layer · SSE streaming · per-session audit logs · encrypted-at-rest keys.
**Frontend:** React 18, Vite, hand-built design system + SVG charts (no UI/chart libraries),
hash routing, reactive store, fully responsive.

---

<div align="center">

**Manthan** — stop asking one mind. Convene a council.

</div>
