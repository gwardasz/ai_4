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

- **Orchestrator** — coordinates zmail/analyst, proposes lead searches, calls `submit_verify` when all fields are ready
- **ZMAIL Operator** — searches/fetches mails (mission-direct or user-approved lead queries)
- **Data Analyst** — extracts mission fields + submits investigation leads (`submit_lead`)

### Investigation leads flow

1. Analyst reads mails and records leads in `state/investigation-leads.json` (with `relatedThreadIDs` when a thread should be explored)
2. Orchestrator delegates **zmail_get_thread** for thread leads (no approval) or **propose_search** for broader queries
3. After each cycle, **you approve** query-based searches in the terminal (`y/n/a/q`)
4. Next cycle orchestrator delegates approved queries to zmail
5. When all mission fields are filled, orchestrator calls **`submit_verify`**
6. Run ends only when hub returns a **flag**; wrong answers trigger re-investigation via `verifyFeedback`

Mission-direct searches (from your CLI mission) run without approval. Only **lead-derived** searches need your consent.

## Env

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `LOG_CONSOLE` | `all` | `all` \| `conversation` |
| `CYCLE_SLEEP_MS` | `15000` | Pause between orchestrator cycles |
| `MAX_CYCLES` | `120` | Max loop iterations |
| `AUTO_APPROVE_LEADS` | — | Set `true` to skip lead approval prompts (dev) |
| `ORCHESTRATOR_MODEL` | `gpt-5.4-mini` | Orchestrator + mission bootstrap model |
| `SPECIALIST_MODEL` | `gpt-5.4-mini` | Zmail + Analyst models |

Logs: `tasks/s2e4/logs/YYYY-MM-DD.jsonl`

## Workspace

```
workspace/
  agents/          # generic *.agent.md templates (shared)
  runs/
    <hash>/        # per-mission isolated state
      mission.json
      state/
        progress.json
        investigation-leads.json
        search-proposals.json
        fetched-mail-ids.json
        analyzed-mail-ids.json
      mails/
      docs/
      messages/
```

Same mission text → same run hash → resumes existing progress. Use `--fresh` to reset.

## Tests

```bash
npm run test:s2e4
```

## Lead approval example

```
--- Proposed search ---
Lead:    lead_a1b2c3d4e5f6
Trop:    Mail mentions security@system.nwo
Query:   from:security@system.nwo
Reason:  Sender may have the confirmation ticket
Approve? [y/n/a=all/q=quit]: y
```
