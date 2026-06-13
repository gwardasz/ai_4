# S03E02 — Firmware Agent

CLI agent for the **firmware** task. Operates a restricted Linux VM via `POST /api/shell`, recovers `cooler.bin`, and submits the ECCS confirmation code to `/verify`.

Architecture follows [`notes.md`](notes.md): LLM handles reasoning; TypeScript handles orchestration, guardrails, retry, and Langfuse observability (pattern from `4th-devs/03_01_observability`).

## Prerequisites

1. Root [`ai-devs-tasks/.env`](../../.env):
   - `AI_DEVS_API_KEY`
   - `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`) + `AI_PROVIDER=openrouter`
   - `HUB_BASE_URL` 

2. Local [`tasks/s3e2/.env`](.env) (optional):
   - `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` for tracing
   - `FIRMWARE_MODEL` to override the default `anthropic/claude-sonnet-4-6`

## Setup

```bash
cd tasks/s3e2
npm install
```

## Run

From repo root:

```bash
npm run s3e2
```

Or from this directory:

```bash
npm start
```

## Tests

```bash
npm run test:s3e2
```

## Langfuse trace hierarchy

Each CLI run creates one trace:

```
firmware-run
└── firmware-agent
    ├── firmware/generation#1
    ├── firmware/run_shell#1
    ├── firmware/generation#2
    └── firmware/submit_confirmation#1
```

- **Trace** (`firmware-run`) — entire CLI execution, tagged `firmware`, `shell`, `cli`
- **Agent** (`firmware-agent`) — full agent loop
- **Generation** — each Responses API call (model, input, output, token usage)
- **Tool** — each `run_shell` / `submit_confirmation` invocation

Tracing is optional: without Langfuse keys the agent runs normally with no-op spans.

## Security guardrails (code-enforced)

- Blocks commands touching `/etc`, `/root`, `/proc` before hitting the shell API
- Validates paths against `.gitignore` rules in target directories
- Retries shell/verify HTTP 429 and 503 with exponential backoff
- Auto-reboots VM on deadlock (stalling rounds or repeated identical commands)

## Tools exposed to the LLM

| Tool | Purpose |
|------|---------|
| `run_shell` | Execute one shell command on the VM |
| `submit_confirmation` | Send ECCS code to Centrala `/verify` |

`reboot` is **not** exposed to the LLM — triggered programmatically on deadlock.
