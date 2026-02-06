# Stigmergy Engine User Guide

## Project Goals

The Stigmergy Engine is a specification-writing system that uses AI agents coordinated through environmental signals rather than direct communication. Given a high-level goal like "Build a todo list app," it produces a tree of decomposed concerns that converges toward a complete, implementable specification.

**Core thesis:** Software specifications can emerge from many small, local decisions rather than top-down planning. Each agent sees only its immediate context (a node, its parent, its siblings) but the aggregate behavior produces coherent structure.

**What it produces:**
- A filesystem-backed tree of specification nodes
- Each node contains prose describing one aspect of the system
- Signal values indicate the state of each node (needs work, confident, conflicted)
- The tree converges toward stability where all nodes are well-specified

**What it is not:**
- Not a code generator (produces specs, not implementations)
- Not a chatbot (agents work autonomously, humans observe and tune)
- Not a planning tool (emergent structure, not predetermined)

---

## Terminology

### Stigmergy

Stigmergy is a coordination mechanism where agents communicate indirectly by modifying their shared environment. The term comes from biology—ants coordinate nest-building not by talking to each other, but by responding to pheromone trails left in the environment.

**Classic example:** An ant finds food and returns to the nest, leaving a pheromone trail. Other ants encounter the trail and follow it. As more ants use the path, the pheromone strengthens. Unused paths evaporate. The colony "discovers" efficient routes without any ant knowing the full picture.

**In this system:** Agents read and write signal values on nodes. A node with high `need` attracts attention. A node with high `confidence` is left alone. No agent orchestrates the others—coordination emerges from the signals.

### Pheromones (Signals)

The numeric values attached to each node that guide agent behavior:

| Signal | Range | Meaning |
|--------|-------|---------|
| `need` | 0-10 | How much attention this node requires. High need = "work on me" |
| `confidence` | 0-10 | How settled/complete this node is. High confidence = "I'm done" |
| `conflict` | 0-10 | Tension or contradiction detected. High conflict = "something's wrong" |

### Colony Phases

The tree transitions through phases based on aggregate confidence:

| Phase | Condition | Behavior |
|-------|-----------|----------|
| **Germination** | avg confidence < 3 | Rapid decomposition, breadth-first exploration |
| **Foraging** | avg confidence >= 3 and < 5 | Balanced exploration and deepening |
| **Brood Care** | avg confidence >= 5 and < 7 | Focus on nurturing existing nodes, less new creation |
| **Crystallization** | avg confidence >= 7 | Refinement only, preparing for output |

### Other Terms

- **Pulse** — One cycle of: scan tree → select target → run agent → apply mutations
- **Mutation** — A discrete change to the tree (create node, update content, update signals, delete node, merge nodes)
- **Temperature/Damping** — Rate limiting on individual nodes to prevent runaway mutation
- **Necrophoresis** — Dead node removal (from ant behavior of removing corpses from the nest)
- **Scaffold** — Structural nodes created at init to seed decomposition directions

---

## Entities (Agents)

### FlashSpore (Primary Agent)

**Role:** The main decomposition and content-writing agent. Runs on every pulse.

**Behavior:**
- Receives a target node, its context chain (ancestors), and existing children
- Decides whether to decompose (create children) or deepen (improve content)
- Adjusts signals based on what it did
- Phase-aware: more aggressive decomposition in early phases, more refinement later
- Depth-aware: at depth >= 6, receives persuasive guidance to settle rather than decompose further (prevents gravity wells)

**When it runs:** Every pulse, on the highest-priority target

**What it sees:**
- Target node (path, content, signals)
- Parent chain (context)
- Existing children
- Colony phase and stats
- Top-level concepts (to avoid creating duplicates)

### Scout

**Role:** Heuristic problem detector (no LLM, pure heuristics). Patrols the tree looking for issues.

**Detects:**
- **Hollow nodes:** Content < 20 chars AND confidence < 3 (undeveloped placeholders). Raises conflict +2.
- **Tautologies:** Content just restates the node name. Raises conflict +1.
- **Similar siblings:** Names with high word overlap (potential duplicates).

**When it runs:** Every 10 pulses (maintenance cycle)

**Output:** Raises `conflict` signal on problematic nodes

### Grazer

**Role:** Dead node pruner (necrophoresis).

**Detects:**
- **Stagnant nodes:** After 10+ pulses, confidence = 0, need > 3, no children
- **Placeholder nodes:** Content < 20 chars or matches patterns (TBD, TODO, etc.)
- **Withered branches:** Depth >= 4, no children, no siblings

**When it runs:** Every 10 pulses (maintenance cycle)

**Output:** DELETE_NODE mutations for dead nodes

### Resolver

**Role:** LLM-powered conflict resolution.

**Behavior:**
- Takes a node with conflict > 0
- Analyzes what the conflict actually is (from conflict_reasons)
- Rewrites content to resolve or acknowledge the tension
- Lowers conflict signal if successful

**When it runs:**
- When entering crystallization phase with conflicts
- When conflict density > 5% of nodes
- Every 50 pulses (periodic sweep)

**Success rate:** ~50-60% of conflicts resolved

### Verifier

**Role:** LLM quality gates.

**Two modes:**

1. **Stability verification** — "Is this node actually implementable?"
   - Targets leaf nodes that look stable (high confidence, low need)
   - Checks if content is specific enough to implement
   - Failures get knocked back (need +2, confidence -2)

2. **Coverage verification** — "Do children fully cover parent scope?"
   - Runs before parent signal propagation
   - Checks if children address everything in parent
   - Failures raise parent conflict, block propagation

**When it runs:** Every 10 pulses (maintenance cycle)

### Synthesizer

**Role:** LLM-powered sibling duplicate detection and merging.

**Behavior:**
- Scans sibling groups for semantic duplicates
- "Create Task" and "Task Creation" → same concept, merge them
- Generates synthesized content combining both
- Uses MERGE_NODES mutation (atomic: update target, delete sources)

**When it runs:** Every 10 pulses (maintenance cycle)

**Important:** Explicitly told what NOT to merge (Create/Delete/Update are different operations)

### Cross-Branch Scent Trails (built into FlashSpore)

**Role:** Distributed cross-branch overlap detection.

**How it works:**
- FlashSpore receives a lightweight `branchMap` on every pulse — node names and paths organized by branch (no content)
- While working on its target node, FlashSpore can observe overlaps with other branches as a side-channel
- Detected overlaps raise conflict (+2) on both nodes for the Resolver to address
- Most pulses report zero overlaps — this is normal

**Why this replaces the Weaver:** The original Weaver agent violated the Local Context Only principle by ingesting the entire tree in one LLM call. Distributing overlap detection into FlashSpore's per-pulse work is more stigmergic — each agent sees only its local context plus brief environmental markers

---

## Nodes

### Filesystem Structure

```
~/.hierophage/stig/
├── config.json              # Workspace configuration
├── workspace/
│   ├── root.md              # Root node (the goal)
│   └── feature-a/
│       ├── _node.md         # Node file for feature-a
│       └── sub-feature/
│           └── _node.md     # Node file for sub-feature
├── mutations.log            # Append-only mutation history
├── budget.log               # API cost tracking
└── crystals/                # Output specification documents
```

- Directories = nodes
- `_node.md` (or `root.md` for root) = node content
- Path derived from filesystem: `feature-a/sub-feature`

### Node File Format

```markdown
---
need: 7
confidence: 3
conflict: 0
workers_active: 0
conflict_reasons: []
---

# Feature Name

Description of what this feature/concern is about.

## Acceptance Criteria
- Specific requirement 1
- Specific requirement 2

## Implementation Notes
Any relevant technical details...
```

**YAML Frontmatter:** Signal values and metadata
**Markdown Body:** The actual specification content

### Signal Interpretation

| State | Signals | Meaning |
|-------|---------|---------|
| Needs work | need: 7-10, confidence: 0-3 | High priority target |
| In progress | need: 4-6, confidence: 4-6 | Being developed |
| Stable | need: 0-2, confidence: 8-10, conflict: 0-1 | Complete, leave alone |
| Conflicted | conflict: 3+ | Has contradictions to resolve |
| Overheated | (internal) | Too many recent mutations, cooling off |

**Note:** The `stable_count` metric counts nodes meeting: confidence >= 8 AND need <= 2 AND conflict <= 1.

---

## Measurements

### Tree Statistics

Calculated by `getTreeStats()` on every scan:

| Metric | Description |
|--------|-------------|
| `total_nodes` | Count of all nodes in tree |
| `avg_need` | Mean need across all nodes |
| `avg_confidence` | Mean confidence across all nodes |
| `stable_count` | Nodes with confidence >= 8, need <= 2, conflict <= 1 |
| `nodes_in_conflict` | Nodes with conflict > 2 |
| `scaffold_count` | Pre-built structural nodes |

### Priority Calculation

How targets are selected for each pulse:

```
priority = need * 2
         - confidence
         + conflict * 0.5
         + scaffold_boost
         - depth * 0.5
```

- High need pulls priority up
- High confidence pushes priority down
- Conflict adds moderate priority (needs attention)
- Scaffolds get temporary boost to seed structure
- Depth penalty prevents gravity wells (deep branches dominating)

### Budget Tracking

Per-pulse cost recorded in `budget.log`:

| Metric | Description |
|--------|-------------|
| `api_calls` | Number of LLM API calls |
| `input_tokens` | Tokens sent to model |
| `output_tokens` | Tokens received from model |

Configurable limits in `config.json`:
- `max_api_calls` — Hard cap on total API calls
- `max_input_tokens` — Hard cap on total input tokens

### Run Results

What `stig run` reports:

| Metric | Description |
|--------|-------------|
| `total_pulses` | How many pulses executed |
| `terminated_reason` | Why it stopped (stable, max_pulses, budget_exceeded) |
| `pruned_nodes` | Nodes removed by Grazer |
| `scout_fixes` | Problems flagged by Scout |
| `propagations` | Parent signals updated from children |
| `stability_checks` / `stability_failures` | Verifier stability results |
| `coverage_checks` / `coverage_failures` | Verifier coverage results |
| `resolver_attempts` / `resolver_resolutions` | Conflict resolution results |
| `synthesis_merges` | Sibling duplicates merged |
| `flash_overlaps` | Cross-branch overlaps detected by FlashSpore |
| `evaporations` | Nodes affected by signal evaporation |

---

## Scheduling

### Pulse Loop

The core simulation loop in `run()`:

```
while (pulses < max_pulses):
    if tree is stable: return "stable"
    if budget exceeded: return "budget_exceeded"

    select N highest-priority targets (avoiding siblings)
    run FlashSpore on each target in parallel
    apply mutations

    if crossed maintenance interval (every 10 pulses):
        run maintenance cycle
```

### Maintenance Cycle (Every 10 Pulses)

Sequential steps:

1. **Verifier stability check** — Verify up to 3 "stable-looking" leaf nodes
2. **Parent signal propagation** — If all children settled, reduce parent need (includes coverage verification — children must cover parent scope or propagation is blocked and conflict raised)
2½. **Signal evaporation** — Decay need (−0.25) and conflict (−0.08) on nodes not targeted in the last 10 pulses. Confidence is preserved. Prevents stale signals from accumulating as noise.
3. **Scout patrol** — Detect and flag hollow nodes, tautologies
4. **Grazer patrol** — Prune dead nodes (untouched 10+ pulses)
5. **Resolver** — Resolve conflicts if triggered (see triggers below)
6. **Synthesizer** — Merge stable sibling duplicates

**Note:** Cross-branch overlap detection now happens during normal FlashSpore pulses (not in maintenance). See "Cross-Branch Scent Trails" in Entities.

### Resolver Triggers

The Resolver engages when `nodes_in_conflict > 0` (at least one node with conflict > 2) AND any of:

1. **Phase gate** — Tree enters crystallization phase
2. **Conflict density** — More than 5% of nodes have conflict > 2
3. **Periodic sweep** — Every 50 pulses

Once triggered, it resolves up to 5 nodes per cycle, selecting any node with conflict > 0 (sorted by conflict level descending).

### Temperature Damping

Individual nodes have a "temperature" based on recent mutation activity:

- Each mutation to a node increases its temperature
- Temperature decays over time (pulses)
- Overheated nodes (too many recent mutations) are skipped
- Prevents runaway loops where one node gets all attention

When a node is overheated and no mutations succeed:
- Confidence nudged up, need nudged down
- Priority rotates to other nodes

### Signal Evaporation (Trace Decay)

In real ant colonies, unused pheromone trails evaporate — old signals fade if they're not reinforced. The engine implements this as periodic signal decay during each maintenance cycle:

- **Need** decays by 0.25 per cycle on idle nodes (floor: 1)
- **Conflict** decays by 0.08 per cycle on idle nodes (floor: 0)
- **Confidence does NOT decay** — accumulated knowledge persists
- "Idle" means the node was not a pulse target in the last 10 pulses

**Why this matters:** Without evaporation, a node flagged with need:7 at pulse 1 still shows need:7 at pulse 100 if no agent touches it. Old signals accumulate as noise — when everything has high need, nothing has high priority. Evaporation ensures that only actively relevant nodes maintain urgency.

**Child-Need Dampening:** When FlashSpore decomposes a node, children inherit `parent_need - 2` (floor: 3) rather than `parent_need - 1`. This reduces aggregate need inflation from each DECOMPOSE action, working alongside evaporation to keep the priority queue meaningful.

---

## Telemetry & Replay

### How It Works

Every `stig run` writes a `telemetry.jsonl` file in the workspace root. Each line is a JSON object representing one event. The file is cleared at the start of each run.

### Event Types

| Event | When | Key Fields |
|-------|------|------------|
| `run_start` | Start of run | goal, model, max_pulses, parallel count |
| `run_end` | End of run | termination reason, final stats, total cost |
| `pulse` | Each pulse | target, agent, action, reasoning, mutations, cost, phase, stats |
| `phase_change` | Phase transition | from, to, stats |
| `scout` | Maintenance | hollow nodes, tautologies, similar siblings, fixes |
| `grazer` | Maintenance | pruned node paths |
| `verifier_stability` | Maintenance | node, passed, reason |
| `verifier_coverage` | Maintenance | node, passed, gaps |
| `propagation` | Maintenance | node, need/confidence deltas |
| `resolver` | Maintenance | node, resolved, conflict before/after |
| `synthesizer` | Maintenance | target, sources, merged |
| `flash_overlap` | During pulse | target_path, overlap_path, reason |
| `evaporation` | Maintenance | nodes_affected, avg_need_delta, avg_conflict_delta |

### Replay Command

```bash
# Timeline view (default) — pulses grouped by phase
stig replay

# Node history — all events touching a specific node
stig replay --node auth/login

# Pulse detail — full info for one pulse
stig replay --pulse 42

# Maintenance view — only ecology events (scout, grazer, verifier, etc.)
stig replay --maintenance

# Agent filter — events by agent type
stig replay --agent verifier
stig replay --agent overlap
stig replay --agent evaporation
```

### Data Location

Telemetry data is stored at `{stigRoot}/telemetry.jsonl`. It's human-readable (one JSON object per line) and can be processed with standard tools like `jq`.

---

## Levers and Speculation

### Configuration Options (`config.json`)

```json
{
  "model": "gemini-2.5-flash-lite",
  "max_pulses": 100,
  "max_concurrent_workers": 8,
  "stability_threshold": {
    "need_max": 2,
    "confidence_min": 8,
    "conflict_max": 1
  },
  "budget": {
    "max_api_calls": 500,
    "max_input_tokens": 1000000
  }
}
```

These are the actual defaults. The `node_temperature_limit` (default: 5) controls how many mutations a single node can receive before being "overheated".

### Tunable Parameters and Effects

| Parameter | Default | Effect of Increasing | Effect of Decreasing |
|-----------|---------|---------------------|---------------------|
| `max_pulses` | 100 | More time to converge, higher cost | May terminate before stable |
| `max_concurrent_workers` | 8 | Faster execution, more parallel exploration | Sequential, predictable |
| `stability_threshold.need_max` | 2 | Easier to reach stability (nodes can have higher need) | Stricter (nodes must have lower need) |
| `stability_threshold.confidence_min` | 8 | Stricter (nodes need higher confidence) | Easier to reach stability |
| `stability_threshold.conflict_max` | 1 | More tolerant of conflict | Stricter conflict requirements |
| `budget.max_api_calls` | 500 | More room for exploration | Tighter cost control |
| `budget.max_input_tokens` | 1000000 | More context per call | Lower cost per call |
| `budget.node_temperature_limit` | 5 | Nodes can mutate more before cooldown | Faster rotation between nodes |

### Init Options

```bash
stig init "Build a todo app" \
  --context "TypeScript" \
  --context "React" \
  --analyze
```

| Option | Effect |
|--------|--------|
| `--context / -c` | Pre-settles implementation decisions. Agents won't spec alternatives. |
| `--analyze` | Uses LLM to identify goal-specific concerns instead of static scaffolds |
| `--skip-scaffolds` | No scaffold nodes, pure emergent structure |

### Speculative Tuning

**"Tree is too shallow / not enough detail"**
- Increase `max_pulses`
- Raise `stability_threshold.confidence_min` (nodes need higher confidence to be considered stable)
- Check if Scout is over-flagging (raising conflict on valid nodes)

**"Tree is too deep / over-decomposed"**
- Increase depth penalty in priority calculation
- Run Grazer more frequently (lower maintenance interval)
- Add context constraints to narrow scope

**"Too many duplicates"**
- Run Synthesizer more frequently
- Ensure FlashSpore sees `topLevelConcepts` and `branchMap`
- Check `stig replay --maintenance` for flash_overlap events showing cross-branch overlaps

**"Conflicts not resolving"**
- Lower the conflict density trigger (currently 5%)
- Check conflict_reasons for patterns
- Manual `stig resolve --apply` to force resolution

**"Convergence too slow"**
- Increase parallelism (`--parallel 16`)
- Lower `stability_threshold.need_max`
- Check for gravity wells (one deep branch dominating)

**"API costs too high"**
- Use `--dry-run` for testing
- Lower `max_concurrent_workers`
- Reduce maintenance frequency (edit MAINTENANCE_INTERVAL)

### Manual Intervention Commands

| Command | Purpose |
|---------|---------|
| `stig status` | View tree state with signal indicators |
| `stig show <path>` | Inspect single node with context |
| `stig set <path> need 8` | Manually adjust signals |
| `stig add <parent> <name>` | Manually add a node |
| `stig scout --fix` | Run Scout and apply fixes |
| `stig grazer --prune` | Run Grazer and prune dead nodes |
| `stig resolve --apply` | Run Resolver on conflict nodes |
| `stig verify --path <path>` | Verify specific node stability |
| `stig verify --coverage` | Check coverage across tree |
| `stig synthesize --confirm` | Merge sibling duplicates |
| `stig viz` | Open D3 visualization in browser |
| `stig crystallize --confirm` | Generate specification documents |
| `stig replay` | Timeline view of last run |
| `stig replay --node <path>` | History of events for a specific node |
| `stig replay --pulse <N>` | Detailed view of a specific pulse |
| `stig replay --maintenance` | Only maintenance/ecology events |
| `stig replay --agent <name>` | Filter events by agent name |

### Future Possibilities

**Not implemented, but architecturally possible:**

- **Adaptive maintenance** — Frequency based on tree state, not fixed intervals
- **Human-in-the-loop gates** — Pause at phase transitions for review
- **Multi-goal trees** — Multiple root nodes with shared subtrees
- **Incremental crystallization** — Generate specs for stable branches while others evolve

---

## Quick Reference

### Typical Workflow

```bash
# Initialize
stig init "Build a todo list app" -c "TypeScript" -c "React"

# Run with dry-run first
stig run --dry-run --max-pulses 20

# Real run
stig run --confirm --max-pulses 100

# Check status
stig status

# Visualize
stig viz

# Generate specs when stable
stig crystallize --confirm
```

### Signal Cheat Sheet

| Want to... | Set... |
|------------|--------|
| Force attention to a node | `need: 9` |
| Mark something as done | `confidence: 9, need: 1` |
| Flag a problem | `conflict: 5` |
| Reset a stuck node | `need: 7, confidence: 3, conflict: 0` |

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Same node targeted repeatedly | Gravity well | Check depth, nudge signals |
| No mutations succeeding | All overheated | Wait, or reset signals |
| Tree won't stabilize | Conflict loop | Run `stig resolve --apply` |
| Duplicates appearing | Semantic overlap | Run `stig synthesize --confirm` (same-parent siblings) or check `stig replay --maintenance` for flash_overlap events (cross-branch) |
| Empty nodes with high confidence | Scout missed it | `stig scout --fix` |
