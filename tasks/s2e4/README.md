# S2E4 — Mailbox (multi-agent)

Universal three-agent system for the **mailbox** task: Orchestrator + ZMAIL Operator + Data Analyst.

The investigation **mission** comes from the CLI — not from hardcoded agent prompts.

## Run

```bash
npm run s2e4 -- "Znajdź mi date, password i confirmation_code wysłane od Wiktora z domeny proton.me"
```

Start fresh (clear prior run data for the same mission hash):

```bash
npm run s2e4 -- --fresh "Your mission here"
```

From repo root (`ai-devs-tasks`), with `.env` containing `AI_DEVS_API_KEY`, `HUB_BASE_URL`, and an LLM key (`OPENROUTER_API_KEY` or `OPENAI_API_KEY`).

On startup the system:
1. Parses your mission text from CLI
2. Uses a one-shot LLM call to extract field names (`date`, `password`, etc.)
3. Creates a per-mission workspace under `workspace/runs/<hash>/`
4. Initializes `state/progress.json` with those fields set to `null`

## Architecture

- **Orchestrator** — woken every 15s, receives mission + progress each cycle, delegates to specialists
- **ZMAIL Operator** — searches/fetches mails based on mission context (LLM-derived queries)
- **Data Analyst** — extracts requested fields from mail bodies via LLM (no regex extraction)

Verify/submit is **deterministic** in `app.js` (not delegated to LLM). Process stops when hub returns `{FLG:...}`.

## Env

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `LOG_CONSOLE` | `all` | `all` \| `conversation` |
| `CYCLE_SLEEP_MS` | `15000` | Pause between orchestrator cycles |
| `MAX_CYCLES` | `120` | Max loop iterations |
| `ORCHESTRATOR_MODEL` | `google/gemini-3.1-flash-lite` | Orchestrator + mission bootstrap model |
| `SPECIALIST_MODEL` | `google/gemini-3.1-flash-lite` | Zmail + Analyst models |

Logs: `tasks/s2e4/logs/YYYY-MM-DD.jsonl`

## Workspace

```
workspace/
  agents/          # generic *.agent.md templates (shared)
  runs/
    <hash>/        # per-mission isolated state
      mission.json
      state/       # progress, fetched/analyzed registries
      mails/       # saved message bodies
      docs/        # cached zmail API help
      messages/    # agent message inbox
```

Same mission text → same run hash → resumes existing progress. Use `--fresh` to reset.
