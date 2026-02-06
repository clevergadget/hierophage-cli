# Asynchronous Ecology: From Phasic Maintenance to Independent Organisms

*Design document. Not yet implemented. The Termite redesign is the entry point.*

---

## The Problem With the Current Model

The maintenance cycle is a lie. Every 10 pulses, the simulation pauses and runs seven agents in fixed sequence:

```
Verifier → Propagation → Evaporation → Scout → Grazer → Resolver → Synthesizer → Termite
```

This is a cron job wearing a biology costume. Real ant colonies don't pause foraging every 10 minutes to run a maintenance batch. Scouts patrol continuously. Grazers consume dead material as they encounter it. Termites inspect tunnels during their normal movement through the mound. The organisms are always present, always working, interleaved with growth — not sequenced after it.

**Specific failures of the phasic model:**

1. **Temporal blindness.** The Termite runs 2 inspections per maintenance cycle. With 73 nodes across 5 branches, it checks 20 random pairs in 100 pulses and misses 6 real duplicates. The problem isn't the agent — it's that 20 samples from a maintenance timer can't cover the space. A Termite that walks continuously between pulses would accumulate far more coverage.

2. **Wasted work.** Every maintenance cycle runs all agents regardless of need. At pulse 10 with 8 nodes, the Synthesizer scans for duplicates that can't exist yet. At pulse 90 with 73 nodes and zero conflict, the Resolver still checks. Clock-triggered beats condition-triggered in simplicity but loses in efficiency. *Caveat: this overstates the problem slightly. Heuristic agents (Scout, Grazer) are O(n) filesystem scans, not LLM calls — cheap to run on nothing. The LLM agents (Resolver, Verifier) already have internal guards (Resolver checks for conflict > 0, Verifier checks for stable-looking nodes). The real waste is in the scheduling overhead, not wasted API calls.*

3. **Phase transitions are imposed, not detected.** Colony phases (germination → foraging → brood-care → crystallization) are derived from aggregate confidence thresholds. This is observation, which is fine. But the *response* to phases is encoded in FlashSpore's system prompt — "you are in brood-care, prefer UPDATE over DECOMPOSE." The phase doesn't emerge from organism behavior; it's announced by a narrator. In a real colony, workers shift behavior because the environmental signals change, not because someone told them the season changed.

4. **No population dynamics.** There is exactly one Scout, one Grazer, one Termite. The simulation can't have more Scouts when conflict is rising or fewer Grazers when the tree is healthy. Population is hardcoded at 1 per species. In biology, organism populations respond to resource availability. More food → more ants. More dead material → more decomposers. Our "resources" are signal gradients, and nothing responds to them by scaling population.

5. **Stateless agents can't learn within a run.** The current Termite samples random pairs with no memory of what it already checked. The Scout re-scans every node every cycle, rediscovering the same hollow nodes. Agents forget everything between maintenance cycles. A walking Termite that remembers what it's seen — and forgets over time — is fundamentally more capable per LLM call than a stateless sampler.

---

## The Vision: Signal-Driven Asynchronous Ecology

### Core Principle

Every organism is an independent async worker that:
- **Activates** based on signal conditions, not timers
- **Moves** through the tree on its own trajectory
- **Accumulates** sparse local memory that decays over time
- **Acts** when it detects something, not when it's scheduled to

The simulation loop becomes a **scheduler** that manages a pool of workers, not a sequential pipeline that calls agents in order.

### What Changes

| Aspect | Current (Phasic) | Proposed (Async) |
|--------|------------------|------------------|
| Activation | Fixed interval (every 10 pulses) | Signal-driven (conditions met) |
| Execution | Sequential batch, all agents | Independent, interleaved with pulses |
| State | Stateless between cycles | Persistent memory with decay |
| Population | 1 per species, hardcoded | Tunable, responsive to signals |
| Movement | Random sampling or full scan | Walking, wandering, jumping |
| Phase response | System prompt injection | Emergent from signal gradients |

### What Doesn't Change

- **Agents are still stateless across runs.** Memory persists within a run, not between runs. The tree remains the only durable state.
- **Mutations still dispatch sequentially.** The MutationDispatcher is the serialization point. Agents run concurrently but mutations apply one at a time.
- **The priority formula stays.** `need*2 - confidence + conflict*0.5 - depth*0.5` still selects FlashSpore's targets.
- **Signals are still the coordination mechanism.** Conflict, need, confidence — the pheromone vocabulary doesn't change.

---

## The Termite Redesign: Prototype for the Async Model

The Termite is the first agent to transition because its problem — cross-branch duplicate detection — is inherently ill-suited to the phasic model. Random pair sampling from a timer can't cover the combinatorial space. A walking inspector with memory can.

### Walking Memory

The Termite maintains a **TermiteMemory** — a sparse map of nodes it has visited:

```typescript
interface TermiteMemoryEntry {
  path: string;
  name: string;
  summary: string;       // LLM-generated, ~15 words
  branch: string;        // top-level branch for quick cross-branch checks
  confidence: number;    // node confidence when visited
  seenAtPulse: number;   // when this memory was formed
}
```

**Key properties:**
- **Sparse.** The memory holds at most ~30 entries. Not the whole tree. Just what the Termite has personally visited. *Note: "sparse" is relative — 30 entries in a 73-node tree is 40% coverage, which is dense. In a 300-node tree it's 10%, which is genuinely sparse. The fixed cap means coverage percentage drops as the tree grows. Consider: should `maxEntries` scale with tree size (e.g., `min(30, total_nodes * 0.15)`)? Needs experimentation.*
- **Summarized.** Each entry is a 15-word LLM-generated summary, not the full node content. This keeps the prompt compact — 30 entries ≈ 400-500 tokens. *Risk: summary compression may lose the signal needed for accurate equivalence detection. "Persists user session token to localStorage" vs "Manages user authentication state" — are these duplicates? Full node content (which v1 uses) gives the LLM more to work with per comparison. The tradeoff is volume vs accuracy-per-comparison. Net effective comparison rate (accuracy × volume) is probably 5-10x v1, not 20-30x. Must validate empirically.*
- **Decaying.** Entries older than N pulses are forgotten. The Termite's mental map evaporates, just like pheromone trails. If a node was important, the Termite will revisit it eventually and re-form the memory.
- **Cross-branch aware.** Each entry records which branch it came from. The Termite preferentially compares new nodes against memories from *other* branches.

**Staleness risk:** Memories describe nodes as they were when visited. If the Grazer prunes a node, or FlashSpore rewrites its content, the memory is stale. The Termite might flag an overlap with a node that no longer exists or whose content has changed. Mitigation: before raising conflict, verify the target node still exists and the memory summary still roughly matches. This adds a filesystem check per overlap (cheap) but prevents ghost conflicts.

### Walk Pattern

Each time the Termite acts, it takes several steps through the tree:

```
jump → wander → wander → jump → wander → wander
```

- **Jump**: Move to a random node in a different branch from the current position. Weighted toward low-confidence (recently created) nodes. Ensures cross-branch coverage. *Note: confidence-weighting biases toward new shallow nodes. Deep high-confidence leaves are practically invisible to jumps — they can only be reached by wandering, which is breadth-biased (siblings/children, not parents).*
- **Wander**: Move to a sibling or child of the current position. Explores the local neighborhood. Builds contextual understanding of a branch before jumping away.

This alternation means the Termite sees both breadth (jumps across branches) and depth (wanders within a branch), accumulating memory from both.

*The jump:wander ratio of 1:2 is ad hoc. Why not 1:1 or 1:3? This needs tuning data. Also, wandering to siblings/children creates breadth-first bias — the Termite explores laterally within a branch rather than descending into it. A "descend" movement type (move to a child, preferring the lowest-confidence child) might improve depth coverage.*

### The Walk Call

Each step is one LLM call. The prompt carries the full memory:

```
## Your Memory (galleries you've visited recently)
- auth/login: "Email/password login form with validation" [branch: auth]
- data/user-store: "Persists user session to localStorage" [branch: data]
- ui/header: "Top navigation bar with logo and user menu" [branch: ui]
... (up to ~30 entries)

## Current Gallery
Name: persistence/session-handler
Branch: persistence
Content:
Manages user session persistence between page loads. Stores session
token in localStorage and restores on app init...

## Instructions
1. Does this gallery overlap with anything in your memory? If yes, which one(s)?
2. Summarize this gallery in under 15 words for your memory.
```

The LLM returns:

```json
{
  "overlaps": [
    {"path": "data/user-store", "reasoning": "Both persist user session data to localStorage"}
  ],
  "summary": "Persists user session token to localStorage across page loads"
}
```

**Value per call:** Instead of comparing 1 pair, each call compares 1 node against 20-30 remembered nodes. The *effective* coverage improvement depends on summary accuracy — if summaries preserve enough signal for the LLM to detect equivalence, this is 20-30x more comparisons per call. Realistically, compressed summaries will miss some equivalences that full content would catch, so **expect 5-10x effective improvement until validated.**

**Honest cost per call:** 30 memory entries × ~15 words ≈ 450 tokens + node content ~200 tokens + system prompt ~200 tokens ≈ **850 tokens input**, not the ~500 claimed by a naive estimate. This grows as memory fills — an empty memory is ~400 tokens, a full memory is ~850. At $0.10/1M input tokens, a full-memory call costs ~$0.00009 (still cheap, but 30% more than v1's ~$0.00007). 6 steps per maintenance cycle ≈ $0.0005 per cycle.

### Memory Evaporation

Before each walk cycle, the Termite forgets:

```typescript
forget(currentPulse: number): void {
  for (const [path, entry] of this.entries) {
    const age = currentPulse - entry.seenAtPulse;
    if (age > this.maxAge) {
      this.entries.delete(path);
    }
  }
  // If still over capacity, drop oldest
  while (this.entries.size > this.maxEntries) {
    // ... drop the entry with the oldest seenAtPulse
  }
}
```

The `maxAge` controls how far back the Termite remembers. Too long and the memory fills with stale entries from a tree that has evolved. Too short and the Termite can't accumulate enough cross-branch context. Default: ~50 pulses (5 maintenance cycles worth of memory at current 10-pulse intervals, but this decouples naturally when we move to async).

**Walk frequency vs growth rate:** At 6 steps per maintenance cycle (every 10 pulses), the Termite visits 0.6 nodes per pulse. The tree grows at 2-3 nodes per pulse. The Termite permanently falls behind — its memory samples from an ever-growing tree with declining coverage percentage. This is acceptable if the goal is patrol, not census. But it means cross-branch duplicates created between maintenance cycles can only be detected if the Termite happens to jump to one of them. More steps per cycle or more frequent activation (Step 2) helps, but the fundamental rate mismatch should be acknowledged: the Termite will never see every node.

### Conflict Raising

When the Termite detects an overlap, it raises conflict on both nodes — same as today:

```typescript
// On the node just visited
conflict += 2, conflict_reason = `Cross-branch duplicate: equivalent to "${overlap.name}" (${overlap.path})`

// On the remembered node
conflict += 2, conflict_reason = `Cross-branch duplicate: equivalent to "${current.name}" (${current.path})`
```

The existing ecology handles resolution. The Resolver reads the conflict reasons and rewrites content. Evaporation decays the conflict if nobody acts. FlashSpore sees the conflict and avoids the node. The Termite just detects and marks — it never resolves.

---

## Transition Path: From Phasic to Async

The Termite is step 1. The full transition happens incrementally, agent by agent. Each step is independently valuable and independently shippable.

### Step 1: Termite Walking Memory (This Design)

**What changes:**
- Termite gets `TermiteMemory` class, `walk()` method, walk pattern
- Still triggered by the maintenance cycle (every 10 pulses) — same hook, different internals
- The memory persists across maintenance cycles within a run
- Remove `sampleCrossBranchPairs` (random pair sampling)

**What this proves:**
- A stateful walking agent with decaying memory is more effective per call than stateless random sampling
- The LLM can hold 30 sparse memories and compare accurately
- Memory evaporation works as a self-regulating mechanism

### Step 2: Signal-Gated Activation

**Concept:** Instead of running all maintenance agents every 10 pulses, each agent has an **activation condition** — a signal predicate that determines whether it should run.

```typescript
interface ActivationCondition {
  shouldActivate(stats: TreeStats, pulsesSinceLast: number): boolean;
}
```

Examples:
- **Scout**: Activate when `total_nodes` has grown by 5+ since last patrol, or when `avg_confidence < 3` (lots of new, unverified content)
- **Grazer**: Activate when `pulsesSinceLast >= 15` AND there are nodes with `confidence <= 1`
- **Resolver**: Activate when `nodes_in_conflict / total_nodes > 0.05` (current trigger, but checked every pulse instead of every 10)
- **Termite**: Activate when `total_nodes >= 10` AND `pulsesSinceLast >= 5` (needs enough tree to be useful, runs more frequently than other maintenance agents because its calls are so cheap)
- **Synthesizer**: Activate when `pulsesSinceLast >= 10` AND there are sibling groups with 3+ children
- **Verifier**: Activate when `stable_count` has increased since last check

The simulation loop becomes:

```
while (pulses < max_pulses):
    if tree is stable: return "stable"

    // Growth
    run FlashSpore batch (parallel)

    // Ecology — check each organism's activation condition
    for each organism:
        if organism.shouldActivate(stats, pulsesSinceLast):
            run organism
```

**What this proves:**
- Agents can be decoupled from a fixed timer
- Signal conditions are sufficient to trigger appropriate maintenance
- The maintenance cycle naturally adapts to tree state

**Honest assessment:** This is still synchronous polling, not truly event-driven. The loop `for each organism: if organism.shouldActivate(stats)` checks every organism every pulse. The improvement is real — agents skip when not needed — but it's variable-interval polling, not an architectural shift to async. Also, computing `TreeStats` every pulse requires an O(n) tree scan. Currently this scan only happens every 10 pulses. If stats computation is expensive on large trees (500+ nodes), the per-pulse overhead may negate the savings from skipping unnecessary agents. Consider: cache stats and invalidate on mutation, rather than recomputing every pulse.

### Step 3: Interleaved Execution

**Concept:** Maintenance organisms don't run as a batch after N pulses. They run *alongside* FlashSpore pulses, interleaved in the work queue.

The simulation loop manages a **work pool**:

```
WorkPool:
  - 4 FlashSpore workers (parallel growth)
  - 1 Termite worker (walking patrol)
  - 1 Scout/Grazer worker (heuristic patrol)
  - Resolver/Synthesizer/Verifier spawn on demand
```

Each "tick" of the simulation pulls the next available worker and runs it. FlashSpore workers take pulses. The Termite takes walk steps. Scout scans a batch of nodes. They're all in the same pool, competing for execution time.

**Population control** enters here: the ratio of FlashSpore workers to maintenance workers IS the ecological balance. More FlashSpore = faster growth, less quality control. More maintenance = slower growth, higher quality. The user controls this ratio as a lever:

```json
{
  "workers": {
    "flash_spore": 4,
    "termite": 1,
    "patrol": 1,
    "resolver": 0
  }
}
```

Setting `resolver: 0` means conflicts only resolve through evaporation and FlashSpore seeing them. Setting `termite: 2` means two Termites walking independently, each with their own memory, covering more ground.

**What this proves:**
- Multiple organisms can coexist in a shared work pool
- Population ratios are a meaningful tuning lever
- Growth and maintenance happen concurrently, not sequentially

**Critical risk — mutation ordering becomes non-deterministic.** In the current model, all growth happens (pulses 1-10), then all maintenance — deterministic ordering within each batch. With interleaved workers, mutation order depends on which worker finishes first. Concrete failure modes:
- A Termite raises conflict on a node that FlashSpore is currently mutating → wasted pulse, or worse, the conflict gets immediately overwritten
- A Grazer prunes a node that FlashSpore selected as its target → FlashSpore's mutation fails on a missing node
- Two FlashSpore workers target sibling nodes, one decomposes while the other settles the parent → parent signals become inconsistent

The MutationDispatcher serializes mutations, but the *selection* of targets is not serialized. Workers choose their targets from a tree snapshot that may be stale by the time their mutation dispatches. This isn't a bug — it's a fundamental property of concurrent systems. But it means runs become non-reproducible and debugging requires understanding interleaved execution traces. The replay system (designed for sequential event streams) will need significant redesign.

**Worker pool vs API concurrency:** The worker ratio is bounded by LLM API concurrency, not by configuration. If we have 4 concurrent API slots and 6 configured workers, workers queue anyway. The ratio matters less than the total budget. Consider framing this as "attention budget" (total concurrent slots) with proportional allocation, not as discrete worker counts.

### Step 4: Emergent Phase Behavior

**Concept:** Remove explicit phase detection from the simulation loop. Instead, each organism responds to signal gradients directly.

Currently, FlashSpore receives phase guidance via its system prompt: "You are in brood-care. Prefer UPDATE over DECOMPOSE." This is a narrator telling the agent what season it is.

In the async model, FlashSpore's behavior shifts because the *signals it encounters* change:
- Early tree: most nodes have high need, low confidence → FlashSpore naturally decomposes (high-need nodes attract it, decomposition is the obvious action)
- Late tree: most nodes have low need, high confidence → FlashSpore naturally refines (the only remaining high-priority targets are ones needing deepening)
- Conflict-heavy tree: FlashSpore avoids conflicted nodes (they're already being handled by Resolver) → it works on clean territory

Phase labels become *observations about aggregate signal state*, not *instructions that change behavior*. The dashboard can still display "this tree is in brood-care" as a diagnostic label. But no agent reads that label to decide what to do.

**This step directly contradicts validated experiment results.** The 11-experiment tuning campaign proved that explicit phase guidance improves outcomes: brood-care SETTLE boost raised UPDATE mutations from 37% to 53%. Removing phase guidance reverts a validated improvement.

The core problem: FlashSpore doesn't inherently know that `confidence=7` means "stop decomposing." That mapping is encoded in the phase-guided prompt. Without it, the LLM sees a node with `need=4, confidence=7` and might still decompose it — nothing in the raw signal values says "this is settled, refine only." The signals *inform* the phase label, but the phase label *translates* signals into behavioral guidance the LLM can follow.

**The honest test:** Run the same goal with and without phase guidance. This is proposed as validation but should be flagged as a **known risk** — we already have data showing guidance helps. The question is whether signal-only behavior can match it with better prompt engineering (e.g., explicitly teaching FlashSpore signal semantics: "confidence above 6 means the content is mature — prefer UPDATE or SETTLE over DECOMPOSE"). This is a different prompt, not the absence of a prompt. Emergent phase behavior may require more explicit signal education, not less prompt guidance.

---

## Population Dynamics (Future)

The endgame is population that responds to environmental pressure, not configuration.

**Resource model:** The tree has a finite "attention budget" per tick (the work pool size). Organisms compete for this budget. An organism that produces results (conflict found, duplicates merged, dead nodes pruned) gets more "spawn pressure." An organism that runs and finds nothing gets less.

```
spawn_pressure(organism) = results_per_activation / cost_per_activation
```

A Termite that finds 3 overlaps in its last walk has high spawn pressure — maybe the system spawns a second Termite. A Resolver that failed to resolve anything in 3 consecutive activations has low spawn pressure — it gets deactivated until conflict density rises again.

This is genuinely emergent population dynamics. The "number of each organism" isn't configured — it's an output of the ecology. The only configured input is the total work pool size (how much compute budget is available).

**Not yet designed.** This requires careful thought about known hard problems:

- **Spawn pressure is circular.** `results_per_activation / cost_per_activation` assumes "results" are measurable and comparable across agent types. What counts as a "result" for the Scout (flagging problems) vs the Termite (finding overlaps) vs the Grazer (pruning)? These are qualitatively different. Worse: a Scout that correctly finds zero problems in a healthy tree has zero results. Despawning it punishes correct behavior. The formula must distinguish "nothing to find" from "failed to find."
- **Predator-prey oscillation.** Resolver spawns because conflict is high → resolves conflicts → gets despawned because results drop to zero → conflicts return because no Resolver → Resolver respawns. This is a classic Lotka-Volterra oscillation, a known hard problem in ecology and control theory. Dampening mechanisms (minimum population floors, hysteresis thresholds, rolling averages) are required but add complexity that erodes the "emergent" claim.
- How organisms are despawned (graceful? immediate?)
- Whether organisms can specialize (a Termite that patrols auth branches vs one that patrols UI branches)
- Stability guarantees — without them, population dynamics may be fun to watch but unreliable for production use

---

## Configuration Changes

### Current

```json
"cross_check": {
  "pairs_per_pulse": 2,
  "min_tree_depth": 2
}
```

### After Termite Redesign (Step 1)

```json
"cross_check": {
  "steps_per_cycle": 6,
  "min_tree_depth": 2,
  "memory_max_age": 50,
  "memory_max_entries": 30
}
```

### After Signal-Gated Activation (Step 2)

The `cross_check` config stays but the maintenance interval becomes per-organism:

```json
"ecology": {
  "termite": {
    "steps_per_activation": 6,
    "min_tree_depth": 2,
    "memory_max_age": 50,
    "memory_max_entries": 30,
    "min_pulse_interval": 5
  },
  "scout": {
    "min_pulse_interval": 8,
    "min_new_nodes": 5
  },
  "resolver": {
    "conflict_density_trigger": 0.05,
    "max_per_activation": 5
  }
}
```

### After Interleaved Execution (Step 3)

Workers replace maintenance intervals:

```json
"workers": {
  "flash_spore": 4,
  "termite": 1,
  "patrol": 1
},
"ecology": {
  "termite": { "memory_max_age": 50, "memory_max_entries": 30 },
  "resolver": { "conflict_density_trigger": 0.05 }
}
```

---

## Telemetry Changes

### Termite Event (Step 1)

Replace the pair-based event:

```typescript
// Old
{ type: 'termite'; node_a: string; node_b: string; equivalent: boolean; reasoning?: string }

// New
{ type: 'termite'; timestamp: string; pulse: number;
  node: string;           // node visited this step
  action: 'jump' | 'wander';
  memory_size: number;    // how many entries in memory
  overlaps_found: number; // how many memories matched
  overlaps?: Array<{ path: string; reasoning: string }>;
}
```

### Activation Events (Step 2)

New event type for organism activation decisions:

```typescript
{ type: 'activation'; timestamp: string; pulse: number;
  organism: string;
  activated: boolean;
  reason: string;  // "conflict_density: 0.08 > 0.05" or "min_interval not reached"
}
```

---

## What This Means for the Codebase

### Files That Change for Step 1 (Termite Redesign Only)

| File | Change |
|------|--------|
| `src/agents/termite.ts` | Rewrite: TermiteMemory class, walk() method, walk helpers, remove pair sampling |
| `src/simulation/pulse.ts` | TermiteMemory lifecycle in run(), walk-based integration replacing pair loop |
| `src/types.ts` | Updated termite telemetry event, cross_check config fields |
| `tests/termite.test.ts` | Rewrite: memory tests, walk pattern tests, evaporation tests |
| `src/cli/replay-cmd.ts` | Updated termite event formatting |
| Web dashboard files | Updated event display |
| Docs | Updated user guide, design doc, this document |

### Files That Change for Step 2+ (Broader Async Transition)

| File | Change |
|------|--------|
| `src/simulation/pulse.ts` | Major rewrite: activation conditions, per-organism scheduling |
| `src/types.ts` | New config shape (ecology section), activation telemetry |
| `src/agents/*.ts` | Each agent gets an `ActivationCondition` |
| All CLI and web files | Updated for new telemetry events and config |

---

## Open Questions

1. **Should the Termite's memory be visible in the tree?** Currently it's ephemeral runtime state. But if we wrote a `_termite_memory.json` in the workspace, other organisms could read it — the Synthesizer could use the Termite's overlap detections to prioritize which cross-branch pairs to investigate for merging. This would be true stigmergic coordination: the Termite leaving traces in the environment that other organisms respond to.

2. **How do walking organisms interact?** If two Termites are walking simultaneously, should they share memory or keep independent memories? Independent is simpler and more biologically accurate (individual termites don't share neural state). But they might waste calls inspecting the same nodes. Maybe they coordinate through the environment — a visited node gets a transient marker that makes other Termites less likely to visit it.

3. **Does FlashSpore need memory too?** FlashSpore currently receives `topLevelConcepts` as a lightweight reminder of what exists. But if FlashSpore had walking memory like the Termite, it could avoid creating duplicates of nodes it recently saw in other branches. This is closer to how real foraging works — an ant that recently visited a food source doesn't revisit it immediately.

4. **What's the evaporation rate for Termite memory?** Too aggressive and the Termite can't accumulate enough context for cross-branch comparisons. Too gentle and the memory fills with stale entries. The right answer is probably proportional to tree growth rate — a tree adding 5 nodes per cycle needs faster memory refresh than one adding 1 node per cycle. This could be adaptive.

5. **Do we need the maintenance cycle at all after Step 3?** If all organisms run as independent workers in a shared pool, the concept of a "maintenance cycle" dissolves. There's just a work pool with different organisms pulling tasks. The maintenance interval becomes an emergent property — how often each organism type gets CPU time — rather than a configured parameter.

---

## Validation Criteria and Rollback Thresholds

Each step must be validated before proceeding to the next. If a step fails validation, revert it — the current phasic system is well-tested (188 tests, 11-experiment validation campaign) and should not be degraded for architectural aesthetics.

### Step 1: Termite Walking Memory

**Success criteria:**
- Walking Termite detects at least as many cross-branch duplicates as v1 on the same 100-pulse todo app run (baseline: 0/20 — low bar, but v1 set it)
- Run the same goal 3 times: walking Termite should detect duplicates in at least 2/3 runs (statistical coverage)
- Memory evaporation doesn't cause memory to empty out before cross-branch context accumulates (check memory_size in telemetry stays above 10 after pulse 30)
- No false positives from stale memories (ghost conflicts on pruned nodes)

**Rollback trigger:** If summary compression causes >50% of detected overlaps to be false positives (verified by manual inspection), revert to v1's full-content comparison and reconsider the memory design.

### Step 2: Signal-Gated Activation

**Success criteria:**
- Same convergence quality as phasic model (avg confidence, stable count, total pulses to converge) within 10% on 3 repeated runs
- Total LLM calls reduced (agents should skip when not needed)
- No agent starves (every agent activates at least once per 50 pulses on a tree that needs it)

**Rollback trigger:** If convergence quality degrades by >15% (measured by avg confidence at pulse 100 and stable node count), revert to fixed-interval maintenance.

### Step 3: Interleaved Execution

**Success criteria:**
- Convergence quality matches Step 2 within 10%
- No mutation failures from stale target selection (FlashSpore targeting a pruned node, etc.)
- Replay system can reconstruct causality from interleaved events

**Rollback trigger:** If mutation failure rate exceeds 5% (mutations that fail because the target was modified by another worker), the concurrency model needs redesign. If replay becomes uninterpretable, the debugging cost outweighs the architectural benefit.

### Step 4: Emergent Phase Behavior

**Success criteria:**
- Signal-only FlashSpore converges as well as phase-guided FlashSpore on 5 repeated goals
- UPDATE mutation rate in late-stage trees stays above 45% (current phase-guided rate is 53%)
- Trees don't regress to over-decomposition in brood-care equivalent conditions

**Rollback trigger:** If UPDATE rate drops below 35% (the pre-tuning baseline), phase guidance is load-bearing and cannot be removed without a fundamentally different approach to signal education.

### Debugging the Async Model

The current telemetry produces a clean sequential narrative: 10 pulses, maintenance block, 10 pulses. With interleaved execution, the timeline becomes a jumble of mixed events from simultaneous workers. Answering "why did this node get pruned?" requires correlating events across concurrent workers.

Before Step 3, the replay system must be extended with:
- **Causal chains**: link each mutation to the worker that produced it and the tree snapshot it read
- **Worker lanes**: display parallel workers as swim lanes, not a single timeline
- **Conflict visualization**: highlight when two workers targeted the same node or overlapping subtrees

---

## Summary

The Termite's walking memory is the entry point to a broader architectural shift: from centrally scheduled maintenance batches to independently activated organisms with decaying state. Each step of the transition is independently valuable — and each step has real risks that must be validated before proceeding:

1. **Termite walking memory** — estimated 5-10x more effective comparisons per LLM call (pending empirical validation of summary accuracy), catches duplicates that random sampling misses. Low risk, high confidence.
2. **Signal-gated activation** — agents run when needed, not on a timer. Moderate risk: O(n) stats computation per pulse, still polling not truly async.
3. **Interleaved execution** — growth and maintenance happen concurrently. High risk: non-deterministic mutation ordering, race conditions on target selection, replay system redesign required.
4. **Emergent phases** — remove explicit phase guidance, let signals drive behavior. High risk: contradicts validated experiment results. May require "signal education" prompts rather than removal of guidance. Needs careful A/B testing.
5. **Population dynamics** — organism counts respond to environmental pressure. Speculative: spawn pressure formula is circular, predator-prey oscillation is a known hard problem. Interesting to explore but far from production-ready.

The biological metaphor isn't just vocabulary anymore. It's the architecture. But biological systems took millions of years to stabilize. We're building this in weeks. Each step should be validated against the phasic baseline before the next step begins — the current system works, and working beats elegant.
