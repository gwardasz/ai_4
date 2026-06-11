# S02E05 — drone

Agent mission planner for the DRN-BMB7 drone task. A vision pre-probe locates the dam sector on the map; then an autonomous agent loop reads the API docs and iterates instruction submissions against `/verify` until the flag is captured.

## Run

From `ai-devs-tasks/`:

```bash
npm run s2e5
```

Vision-only probe (no agent):

```bash
npm run probe:drone
```

## Flow

1. **Pre-probe** — fetches `drone.png`, runs vision model, saves `workspace/probe/map-analysis.json`
2. **Agent** — loads `workspace/agents/drone.agent.md`, uses tools:
   - `fetch_drone_docs` — cache and return API documentation
   - `submit_instructions` — POST to `/verify` with `{ instructions: [...] }`
   - `hard_reset` — factory reset when config errors stack up

## Mission logic

The agent must make the system believe the target is power plant `PWR6132PL`, but set the landing sector `set(x,y)` to the **dam** coordinates from the map probe. Exact instruction sequence is discovered from docs + hub feedback.

## Tests

```bash
npm run test:s2e5
```

## Logs

JSONL logs are written to `tasks/s2e5/logs/`.
