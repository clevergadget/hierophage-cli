# Active Plan

*Current development direction. AI maintains this. User reads but doesn't approve.*

---

## Current Direction

**Three parallel tracks:**

### Track 1: Ritual Profile (CLI)
The ritual profile is the entry point for the feedback loop. User arrives (potentially depleted), system solicits information, builds understanding, issues directives.

**Status: Active. Habit tracking system working. 7 habits being tracked.**

### Track 2: Discord Bot ("The Emissary")
Extends ritual profile beyond CLI. Bot initiates contact at variable times (anchor-relative, not clock-based).

**Status: Phase 1 done. Phase 2 (timing) partially implemented, needs testing.**

See `docs/discord-bot-spec.md` for full spec.

### Track 3: Stigmergy Engine
Specification-through-swarm-behavior. Filesystem-backed tree with signal-driven priority selection and mutation dispatcher.

**Status: Phase 0 + Phase 1 + Phase 2 complete. FlashSpore validated. Phase 3 (Membrane/Crystallizer) next.**

See `docs/stigmergy-architecture-v4-engineering.md` for spec.

---

## Stigmergy: Phase 0 Completed

`packages/stigmergy/` — TypeScript package, 70 tests passing, CLI wired via hierophage wrapper.

**What was built:**
- Filesystem-as-tree storage: directories are nodes, `_node.md` files with YAML frontmatter signals
- Node operations: parse, serialize, read, write, list children
- Context chain assembly: root-to-target chain with sibling summaries
- Tree scanner: recursive walk, priority selection (need×2 - confidence + conflict×0.5 + scaffold boost)
- Mutation dispatcher: Redux-style single codepath, validation, append-only `mutations.log`
- CLI: `stig init`, `stig status`, `stig show`, `stig add`, `stig set`
- Hierophage wrapper dispatch: `hierophage stig <command>`

**What was validated (simulation loop test):**
- `scanTree()` → `findHighestPriority()` → `buildFullContext()` → agent produces `Mutation[]` → `dispatcher.dispatch()` each → re-scan → priority correctly rotates
- Scaffold nodes selected first (need:7 + boost), yield after work
- Stability detection works: `stable_count` identifies nodes at rest (need≤2, confidence≥8, conflict≤1)
- 4-level deep trees with context chains render correctly
- Batch dispatch (multiple mutations per pulse) works sequentially

**Design decisions validated:**
- `MutationPayload` is separate from `Partial<StigNode>` — agents need to send partial signal updates (e.g., just `{ confidence: 3 }`)
- Root uses `root.md`, children use `_node.md` — this distinction is clean
- Full paths required for all operations (no implicit path resolution) — agents will always use full paths

---

## Stigmergy: Phase 1 Completed (The Simulator)

**Goal:** Implement the Agent interface and MockSpore. Prove the simulation loop runs to stability without real AI. Zero cost, deterministic, testable.

**What was built:**
- `Agent` interface: `run(target, context, children) → AgentResult { mutations, cost }`
- `MockSpore`: deterministic agent with 3-phase behavior (settle → decompose → review)
- `pulse()` function: one scan-select-act cycle
- `run()` function: loop pulses until stability or max_pulses, with post-loop stability check
- `stig pulse` CLI command: run one pulse, show what changed
- `stig run` CLI command: loop pulses until stability or max_pulses
- 18 new tests (mock-spore determinism, pulse mechanics, convergence, circuit breaker)
- Budget & temperature protections (see Cost Protections section below)

**What was validated:**
- Full simulation loop converges to stability: 3 scaffolds → 22 nodes → all stable in 51 pulses
- MockSpore 3-phase cycle: settle (need≤3 or reviewed parent), decompose (leaf with work), review (everything else)
- Fixed decomposition table ensures determinism: `testing→[unit-tests, integration-tests]`, etc.
- Priority rotation: scaffolds first, then their children, depth-first stabilization
- Max depth cap (3 levels) prevents infinite decomposition
- Post-loop stability check catches the edge case where the final pulse achieves stability
- `max_pulses` circuit breaker works correctly

**Design decisions resolved:**
- MockSpore uses a fixed decomposition table (not markdown splitting) — most deterministic
- Settle check runs before decompose check — prevents decomposing nodes that are already low-need
- Default max_pulses bumped from 50 → 100 to accommodate deeper trees
- Agent receives children array so it knows what's already been decomposed

---

## Cost Protections (Pre-Phase 2)

Built before touching any real API. These are the guardrails that prevent accidental budget blowout.

**What was built:**

1. **BudgetTracker** (`src/budget/tracker.ts`) — Tracks API calls, input/output tokens per run. Records each pulse's cost to `budget.log` (append-only, human-readable). Provides `snapshot()` for final reporting and `checkBudget()` for pre-pulse gate.

2. **Hard budget cap in run loop** — Before each pulse, `run()` calls `tracker.checkBudget()`. If API calls or input tokens exceed configured limits, the run terminates with `terminated_reason: 'budget_exceeded'` and a detail string explaining which limit was hit. Default: 200 API calls, 500K input tokens.

3. **Node temperature / damping** — Each node mutation increments a per-node counter. When a node reaches `node_temperature_limit` (default: 5), further mutations to that node are silently skipped. This prevents runaway loops where an agent repeatedly rewrites the same node. `getOverheatedNodes()` reports which nodes were damped.

4. **`--dry-run` mode** — `stig run --dry-run` uses MockSpore regardless of config. Zero API cost, deterministic. Always safe to run.

5. **`--confirm` gate** — When using a real AI agent (`isRealAI = true`), the run refuses to proceed without `--confirm`. Displays budget limits and model before requiring explicit opt-in.

6. **Agent.isRealAI flag** — Each agent declares whether it makes real API calls. MockSpore: `false`. Future FlashSpore: `true`. The confirmation gate and cost reporting key off this flag.

**Configuration (`BudgetConfig` in `WorkspaceConfig`):**
```
budget:
  max_api_calls: 200       # Hard cap on total API calls per run
  max_input_tokens: 500000  # Hard cap on total input tokens per run
  node_temperature_limit: 5 # Max mutations per node before damping
```

**Tests:** 12 new tests in `tests/budget.test.ts` covering:
- API call and token tracking
- Budget exceeded detection (API calls, input tokens)
- Within-budget check returns null
- Budget log filesystem persistence
- Node temperature tracking and overheating detection
- Budget cap integration with `run()` loop (API call and token limits)
- Budget snapshot in run results
- Temperature-based mutation skipping in run loop

**Design decisions:**
- Budget is per-run, not cumulative across runs. Each `stig run` starts fresh.
- Temperature is per-run, not persistent. Nodes cool down between runs.
- `AgentResult` replaces bare `Mutation[]` return — agents must report their cost alongside mutations. This is the contract that makes budget tracking work.

---

## Stigmergy: Phase 2 Completed (Real AI — FlashSpore)

**Goal:** Wire a real AI agent (Gemini 2.5 Flash Lite) into the simulation loop. Validate that the engine produces meaningful specification trees from a seed goal.

**What was built:**
- `FlashSpore` agent (`src/agents/flash-spore.ts`) — calls Gemini 2.5 Flash Lite with structured JSON output schema (`responseMimeType: 'application/json'`)
- System prompt with explicit path rules, mutation format, and decomposition guidance
- Anti-echo guard: rejects child paths where slug matches parent slug (e.g., `deployment/deployment`)
- Dedup: tracks seen CREATE_NODE paths per response, skips duplicates
- Error reporting: `AgentResult.error` field surfaces API failures to CLI
- D3.js visualizer (`src/viz/generate.ts`, `src/cli/viz.ts`) — interactive horizontal tree with path highlighting, breathing animations, context chain sidebar
- 5 scaffold nodes with descriptive content: user-flows, architecture, testing, deployment, error-handling
- `stig viz` CLI command — generates self-contained HTML, opens in browser

**Bugs found and fixed during live testing:**
- **Echo bug:** FlashSpore named children same as parent. Fixed with anti-echo guard in `sanitizeChildPath`.
- **Duplicate mutations:** Model returned identical CREATE_NODEs. Fixed with `seenCreatePaths` dedup set.
- **Stuck priority (confidence nudge trigger):** When all mutations were overheated/damped, `agentResult.mutations.length > 0` but 0 succeeded — nudge didn't fire, node selected forever. Fixed: nudge fires when `succeeded === 0`, scales with overheated count.
- **Root excluded from selection:** `findHighestPriority` filtered out root, so the goal never decomposed into features. Fixed.
- **Gravity well (depth):** Deep branches accumulated high-need descendants that dominated priority indefinitely. Added depth penalty (0.3/level) to priority formula. This is a simple heuristic — V4 designs more sophisticated mechanisms (Ghost Nodes, energy decay).

**Stress test results (200 pulses, budget-capped):**

| Run | Pulses | Nodes | Input tokens | Distribution |
|-----|--------|-------|-------------|-------------|
| Pre-fix | 200 | 171 | 394k | 142/200 stuck on error-handling |
| Post-fix | 200 | 493 | 194k | Even spread across all 5 branches |

**Validated:**
- FlashSpore produces meaningful decomposition (add-todo, list-todos, data-persistence, CI/CD, etc.)
- Budget cap and temperature damping prevent cost explosions
- Context chain assembly scales (tokens grow with depth but stay manageable)
- 85 tests passing across 8 test files

**Design decisions resolved:**
- ~~Phase 2 prompt design~~ — Structured JSON with explicit path rules and mutation format
- ~~FlashSpore return format~~ — Structured JSON via `responseMimeType`, not freeform markdown
- Model: `gemini-2.5-flash-lite` (cost-efficient, sufficient quality for decomposition)
- Recommended max_pulses for testing: 100 (balances coverage vs wait time)

---

## Next Steps

### Stigmergy
1. **Phase 3: The Membrane (Crystallizer)** — Take the specification tree and generate human-readable markdown deliverables. The Crystallizer agent reads stable subtrees and writes structured specification files to disk.
2. Phase 4 (future): Coherence — Neighbor verification, cross-tree pairing, conflict resolution agents

### Ritual Profile (CLI)
1. **Iterate based on feedback** — Adjust prompt, directive style based on experience reports
2. **Build pattern analysis** — Analyze compliance data over time to calibrate directives

### Discord Bot (The Emissary)
1. **Phase 2: Timing system** — Needs testing
2. **Phase 3: Intelligence** — Context parsing, outcome tracking
3. **Phase 4: Polish** — CLI commands, setup wizard

### Infrastructure
1. **Document MCP server setup** — Add to README or separate doc

---

## Known Issues

- **Message duplication in ritual output** — Observed in first intake session. Monitor.

---

## Open Questions

### For Stigmergy
- ~~MockSpore decomposition strategy~~ — Resolved: fixed decomposition table + 3-phase settle/decompose/review
- ~~Phase 2 prompt design~~ — Resolved: structured JSON with explicit path rules
- ~~FlashSpore return format~~ — Resolved: structured JSON via `responseMimeType`
- When to introduce the V4 in-memory graph behind `StorageBackend` interface — not yet needed, filesystem works at 500+ nodes
- What does the Crystallizer read? Stable subtrees only, or the full tree?
- Crystallizer output format: single spec doc, or one file per top-level branch?
- How does the system decide a branch is "crystallizer-ready" vs still evolving?

### For Ritual Profile
- Is the directive style appropriate (single directive, no justification)?
- How often should self-monitoring verification happen?

### For Discord Bot
- Model choice: Gemini (matches CLI) or allow other providers?
- Conversation memory: How many exchanges before bot "forgets" current thread?

### User Context (From Intake)
- Age: 43
- Health: ADHD, bipolar, medications (Ritalin, Ambien, Lamictal)
- Delegation: Broad scope, excludes things directly impacting girlfriend, THC for now
- Active habits (7 recurring + 1 one-time, as of 2026-02-02)

---

## Files Changed This Session

- `packages/stigmergy/` — Stigmergy package (Phase 0 + Phase 1 + Cost Protections)
  - `src/types.ts` — Added `BudgetConfig`, `DEFAULT_BUDGET`, `MutationPayload`
  - `src/agents/agent.ts` — Agent interface with `AgentResult`, `AgentCost`, `isRealAI`
  - `src/agents/mock-spore.ts` — MockSpore returns `AgentResult` (isRealAI=false, zero cost)
  - `src/budget/tracker.ts` — BudgetTracker class (API calls, tokens, node temperature)
  - `src/simulation/pulse.ts` — Budget cap, temperature damping, cost tracking in run loop
  - `src/cli/cli.ts` — Added `--dry-run`, `--confirm` flags
  - `src/cli/run-cmd.ts` — Confirmation gate, budget display, overheated node indicators
  - `src/cli/pulse-cmd.ts` — Single pulse CLI command
  - `src/index.ts` — Exports for all new types
  - `tests/budget.test.ts` — 12 cost protection tests
  - `tests/mock-spore.test.ts` — Updated for AgentResult interface
  - `tests/simulation.test.ts` — 9 simulation tests
- `.hierophage/bin/hierophage.js` — Added `stig` subcommand dispatch
- `docs/active-plan.md` — This file

---

*Last updated: 2026-02-04*
