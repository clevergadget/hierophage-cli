# Stigmergy Engine: Design & Vision

*A living document. The user guide covers what the system does today. This document covers why it exists, how it thinks, what it learned, and where it's going.*

---

## 1. The Thesis

Software specifications can emerge from many small, local decisions rather than top-down planning. Instead of one intelligence holding the whole picture, many cheap agents each see only their immediate neighborhood — a node, its parent, its siblings — and leave signals in the environment. Global structure emerges from local action.

This is stigmergy: coordination through environmental modification. Ants build nests not by following blueprints but by responding to pheromone gradients. The nest is the plan and the plan is the nest. There is no architect.

**The economic insight:** Gemini Flash Lite at $0.06 per 200 pulses means LLM calls are not scarce resources to be conserved. They're abundant like CPU cycles. This changes everything about how you design agent systems. You don't need one brilliant call — you need a thousand cheap ones with self-correction built into the ecology.

**The engagement insight:** The biological metaphor isn't branding. It's a cognitive tool. Imagining entities foraging across a tree, leaving pheromone trails, pruning dead branches — this engages the playful mind and sustains attention through hard engineering problems. A system that can be imagined can be lived in. A system that can be lived in will be maintained.

**The vocabulary insight:** "Stigmergy" and "code" are not co-located in LLM training data. By forcing stigmergic terminology into the codebase — pheromones, foraging, necrophoresis, brood care — we drag biological thinking into every model that reads or modifies this code. The vocabulary is a form of prompt engineering at the source level.

---

## 2. Stigmergic Primitives

These are the fundamental mechanics the system draws from. Not all are implemented — some are aspirational. The implemented ones are marked.

### Active Primitives

| # | Primitive | System Form | Status |
|---|-----------|-------------|--------|
| 1 | **Persistent Trace** | Append-only `mutations.log`, signal values on nodes | Active |
| 2 | **Trace Reinforcement** | Confidence accumulation through repeated agent visits | Active |
| 3 | **Trace Decay** | Signal evaporation: need −0.25, conflict −0.08 per maintenance cycle on idle nodes | Active |
| 4 | **Gradient Following** | Priority queue: `need*2 - confidence + conflict*0.5 - depth*0.5` | Active |
| 5 | **Local Context Only** | Agents see target + parent chain + siblings, never the whole tree | Active |
| 7 | **Inhibitory Signals** | `conflict` pheromone repels FlashSpore, attracts Resolver | Active |
| 8 | **Threshold Triggers** | Colony phase transitions at confidence thresholds (3, 5, 7) | Active |
| 9 | **Structural Scaffolds** | 5 scaffold nodes seeded at init attract initial decomposition | Active |
| 10 | **Environmental Memory** | Agents are stateless; the tree remembers everything | Active |
| 12 | **Competitive Overlay** | FlashSpore (growth) vs Scout/Verifier (restraint) | Active |
| 13 | **Micro-Action Constraint** | One mutation set per pulse per agent | Active |
| 14 | **Read-Before-Write** | Agents receive full context before acting | Active |
| 15 | **Signal-Based Attention** | Work is pulled by priority, not assigned | Active |
| 16 | **Phase Drift** | Exploration → exploitation via colony phase transitions | Active |
| 17 | **Consensus by Accumulation** | Stability = survived many passes without conflict | Active |

### Dormant Primitives

| # | Primitive | Potential System Form | Notes |
|---|-----------|----------------------|-------|
| 6 | **Autocatalytic Tasks** | Patterns that spawn similar subtrees | See §7: Pre-Cognitive Interface |
| 11 | **Path Entrenchment** | Learned execution paths become defaults | Not yet needed |
| 18 | **Environment as Arbiter** | Tests/invariants resolve conflicts | See §7: Spec-Driven Evolution |
| 19 | **Edge-Focused Growth** | Growth at boundaries of defined structure | Implicit in priority formula |
| 20 | **No Roll-Up Rule** | No global synthesis step | Partially violated by Crystallizer |

---

## 3. Architecture Decisions

Decisions made during implementation. Recorded so future sessions understand *why*, not just *what*.

### Filesystem Over Graph Database

The V4 engineering doc proposed `graphology` or a custom adjacency list with WAL. We chose filesystem-backed trees instead.

**Why:** Transparency. Every node is a markdown file you can read in any editor. Git gives you version history for free. The tree structure IS the directory structure — no serialization layer, no impedance mismatch. Debugging means `cat workspace/auth/_node.md`, not querying an opaque data store.

**Tradeoff:** `scanTree()` does a full recursive filesystem walk every pulse. No caching. This is fine up to ~500 nodes. Beyond that, we'll need incremental scanning or an in-memory cache with filesystem sync. See §7.

### Sequential Dispatch, Parallel Agents

Agents run in parallel (up to 8 concurrent). Mutations dispatch sequentially through a single `MutationDispatcher`.

**Why:** The central conflict identified in V4 — non-deterministic actors modifying shared state — is real. But full optimistic concurrency control with versioning was overengineered for our scale. Sequential dispatch with sibling avoidance in target selection eliminates most conflicts. The few remaining (two agents targeting the same node despite avoidance) resolve naturally: last write wins on signals, duplicate path detection on creates.

**What we skipped:** The V4 doc proposed optimistic locking with `_version` fields. Not needed. The dispatcher is fast enough that sequential application doesn't bottleneck. The 64-agent stress test proves this.

### Structured JSON Output Over Free-Form

FlashSpore returns structured JSON via `responseMimeType: 'application/json'` with a schema enforced by the Gemini API.

**Why:** Free-form responses require parsing. Parsing fails. When parsing fails at scale (hundreds of pulses), one bad response can stall the system. Structured output eliminates this class of failure entirely. The schema IS the agent's action space.

### Heuristic Agents Where Possible

Scout and Grazer use zero LLM calls. Pure pattern matching and threshold checks.

**Why:** They run every 10 pulses. If they used LLM calls, maintenance would cost more than growth. Heuristics are fast, deterministic, and free. Reserve LLM budget for tasks that require judgment (FlashSpore, Resolver, Verifier, Synthesizer).

### Depth Penalty Over Depth Limit

The priority formula includes `- depth * 0.5` rather than a hard depth cap.

**Why:** Hard limits create cliffs. A node at depth 5 is fine; depth 6 is forbidden. That's arbitrary. The depth penalty creates a gradient: deeper nodes are *less attractive* but not impossible. A node at depth 8 with need:10 can still win priority over a shallow node with need:3. This lets the tree find its own natural depth based on complexity.

**The gravity well lesson:** Without depth penalty, one deep branch dominated the priority queue forever. The penalty was the fix. FlashSpore also receives persuasive guidance at depth >= 6 discouraging further decomposition.

---

## 4. The Agent Ecology

Six agents form the current ecology. Each occupies a distinct niche. The metaphor matters — these are species, not microservices.

### Growth Species

**FlashSpore** — The primary decomposer. Reads a node and its context, decides whether to break it into children (DECOMPOSE), improve its content (UPDATE_CONTENT/REVIEW), or mark it as settled (SETTLE). Phase-aware: aggressive decomposition in germination, refinement in crystallization. The system prompt encodes pragmatism ("spec the 95% case") and decision-making ("make choices, don't present options").

### Maintenance Species

**Scout** — Heuristic pathologist. Patrols the tree looking for hollow nodes (undeveloped placeholders), tautologies (content restating the title), and similar siblings (potential duplicates). Raises conflict signals. No LLM, no cost.

**Grazer** — Necrophoresis agent. Removes dead nodes: stagnant (untouched after 10+ pulses, zero confidence), placeholders (TBD/TODO content), withered branches (deep, childless, alone). Prevents spec bloat.

### Repair Species

**Resolver** — Conflict medic. Takes nodes with active conflict, reads the conflict reasons, rewrites content to address the issue. 50-60% success rate. Triggered by: entering crystallization with conflicts, conflict density > 5%, periodic sweep every 50 pulses.

**Verifier** — Quality gate with two modes. *Stability*: "Is this leaf node actually implementable?" Failures get knocked back. *Coverage*: "Do these children fully cover the parent's scope?" Failures block parent propagation and raise conflict.

### Deduplication Species

**Synthesizer** — Sibling duplicate fusion. Detects semantic duplicates among siblings ("Create Task" vs "Task Creation"), generates synthesized content, applies atomic MERGE_NODES mutation. Key lesson encoded in prompt: Create/Delete/Update are DIFFERENT operations — the LLM will over-merge without explicit prohibitions.

**Cross-Branch Scent Trails** (built into FlashSpore) — Rather than a centralized Weaver agent that scans the full tree in one LLM call, overlap detection is distributed across FlashSpore's normal per-pulse operations. Every FlashSpore call receives a lightweight `branchMap` — node names and paths organized by branch, no content. While working on its target node, FlashSpore can observe overlaps with other branches and report them as a side-channel. Detected overlaps raise conflict (+2) on both nodes for the Resolver to address. This replaced the original Weaver agent which violated the Local Context Only primitive by ingesting the entire tree.

### The Missing Species: The Skeptic

The V5 design described a "Semantic Predator" — an adversarial agent that attacks the *ideas* in the tree, not just the structure. The Verifier partially fills this role but asks a narrower question ("is this implementable?"). The Skeptic asks a harder one: "does this child contradict its parent's architecture?" "Is this design decision logically coherent?" "Can these three requirements coexist?"

This is the most important missing piece in the ecology. FlashSpore is biased toward growth and agreement. Without a semantic adversary, the system can converge on well-written nonsense. See §7.

---

## 5. Evolution History

### Phase 0: The Core (No AI)
- Filesystem-backed tree with YAML frontmatter
- MutationDispatcher with append-only log
- CLI for manual node manipulation
- Priority scoring and tree scanning

### Phase 1: The Simulator (Mock AI)
- MockSpore: deterministic agent for testing
- Simulation loop: pulse, batch, run
- Proved graph stability under thousands of mutations

### Phase 2: First Breath (Real AI)
- FlashSpore connected to Gemini Flash Lite
- Structured JSON output schema
- Budget tracking and cost enforcement

### Phase 3: The Membrane
- Crystallizer: specification document generation
- Health diagnostics and tree visualization

### Phase 4: Convergent Trees
**Goal:** Trees that actually terminate at `stable` with avg confidence > 7.

Key mechanisms added:
- **Phase Drift** — Socratic guidance in FlashSpore system prompt shifts behavior across colony phases
- **Scout** — Integrated into maintenance cycle, auto-flags problems
- **Parallelism** — `selectNHighestPriority()` with sibling avoidance + `batchPulse()`
- **Grazer** — Necrophoresis in maintenance cycle, auto-prunes dead nodes
- **Parent Propagation** — When all children settle, parent signals adjust upward
- **Resolver** — LLM conflict resolution with conditional triggers
- **Verifier** — Quality gates (stability + coverage) integrated into simulation loop
- **Nudge fix** — When overheated, nudge both need DOWN and confidence UP (prevents stuck states where need:9, confidence:10)

**Bugs discovered:**
- *Gravity well:* Deep branches dominate priority queue. Fixed with depth penalty.
- *Echo bug:* LLM names children same as parent. Fixed with anti-echo guard in `sanitizeChildPath`.
- *Overheated nudge gap:* Nudge checked mutations returned, not succeeded. Fixed.
- *Root exclusion:* Root must be selectable for goal decomposition. Fixed.
- *Confidence-only nudge:* Creates stuck states. Fixed by nudging both signals.

### Phase 5: Semantic Deduplication
**Goal:** Prevent LLM-generated semantic duplicates from fragmenting the tree.

Key mechanisms added:
- **Synthesizer** — LLM sibling duplicate detection + atomic merge
- **Cross-Branch Scent Trails** — Distributed overlap detection via FlashSpore's branchMap (replaced centralized Weaver)
- **MERGE_NODES mutation** — Atomic update-target + delete-sources
- **FlashSpore awareness** — Top-level concepts + branch map passed in ColonyContext for cross-tree awareness

**Key lesson:** Must explicitly tell the LLM what NOT to merge. Without prohibitions, it merges Create/Delete/Update into one node because they're "all CRUD operations." The LLM's instinct is to compress. Stigmergy requires granularity.

**Architectural lesson:** The original Weaver agent violated the Local Context Only primitive (§2, #5) by ingesting the entire tree in one LLM call. It was the only agent that broke this rule, and it struggled with large trees (context window overflow, JSON parse errors). Replacing it with distributed overlap detection — FlashSpore observing branch names as a side effect of normal work — is more stigmergic and scales better.

### Phase 6: Telemetry & Observability

Key mechanisms added:
- **TelemetryEmitter** — JSONL writer recording 12 event types during runs
- **`stig replay`** — 4-view replay command: timeline, node history, maintenance, pulse detail
- **Agent filtering** — `--agent` flag to isolate events by agent type
- **Extended AgentResult** — `action`, `reasoning`, and `overlaps` fields for full observability

---

## 6. Bugs, Patterns & Lessons

These are discoveries about how stigmergic systems actually behave. You can't find them in textbooks.

### Emergent Pathologies

| Pathology | Description | Fix |
|-----------|-------------|-----|
| **Gravity well** | Deep branch monopolizes priority queue | Depth penalty in priority formula |
| **Echo loop** | LLM names children identically to parent | Anti-echo guard in path sanitization |
| **Stuck state** | Nudging only confidence UP leaves need:9, conf:10 | Nudge both signals simultaneously |
| **Over-merging** | LLM merges semantically distinct siblings | Explicit "DO NOT MERGE" rules in prompt |
| **Premature convergence** | Tree settles before nodes are implementable | Verifier stability gate knocks back hollow nodes |
| **Coverage gap** | Parent propagates despite children missing key aspects | Verifier coverage gate blocks propagation |

### Design Principles (Hard-Won)

- **"Most likely app"**: Spec the 95% case. Ask "Will 95% of users encounter this?" Don't decompose edge cases — mention them in parent content.
- **Context constraints**: Pre-settle implementation decisions via `--context` to prevent the LLM from exploring alternatives nobody asked about.
- **Make decisions, don't present options**: Bad example: `["redux", "zustand", "context-api"]`. Good example: `"react-context-with-reducer"`. The LLM must choose, not survey.
- **Pragmatism over completeness**: In the FlashSpore prompt, explicitly instruct against theoretically complete solutions. The spec should describe what gets built, not what could be built.

---

## 7. Honest Assessment (What's Working, What's Not)

An architectural review of the system as of Phase 5 completion. This section should be updated as issues are addressed or new ones surface.

### What's Working

**The core stigmergic loop produces emergent behavior.** The bug history (§6) is the proof. Gravity wells, echo loops, stuck states — these are *emergent pathologies* that no single agent's code produces. They arise from agent interaction. Discovering them means the system is genuinely stigmergic, not just multi-agent with extra steps.

**The cost model is validated.** Real runs confirm $0.06 per 200 pulses. The system can afford to be wrong and self-correct. This is not theoretical — it's measured.

**Signal-based coordination actually works.** Agents don't know each other exist. They respond to pheromones. And yet: FlashSpore avoids high-conflict nodes, Resolver is attracted to them, Scout raises conflict that Resolver resolves, Grazer cleans what nobody else touches. This is real stigmergy, not orchestration pretending to be emergent.

**The test suite proves structural integrity.** 173 tests including 64-agent parallel stress tests. The tree maintains integrity under concurrent mutation. This was not guaranteed and required careful engineering to achieve.

### What Needs Attention

**The maintenance cycle is substantial.** Every 10 pulses: Verifier (stability), parent propagation, Verifier (coverage), Scout, Grazer, Resolver (conditional), and Synthesizer. That's 7 operations, several with LLM calls, all on one timer. The aggregate maintenance cost may exceed growth cost in late-phase runs. This needs condition-triggered scheduling rather than fixed intervals. (Previously included the Weaver — now removed, its function distributed into FlashSpore.)

**The Verifier's dual role creates fragility.** Stability checks ("is this implementable?") and coverage checks ("do children cover parent?") are different questions at different lifecycle points. A single LLM hallucination on a coverage check ("no, children don't cover this") can stall convergence for an entire branch by blocking parent propagation.

**Signal evaporation is conservative.** Trace Decay (Primitive #3) is now active: need decays −0.15 and conflict −0.05 per maintenance cycle on idle nodes. Confidence is preserved. The rates are intentionally gentle — aggressive decay would destabilize converging trees. Very long runs (500+ pulses) may benefit from tunable decay rates.

**The adversarial function is incomplete.** FlashSpore grows. Scout checks syntax. Verifier checks implementability. But nobody challenges the *ideas themselves*. Nobody says "you specified real-time sync under a batch processing parent — that's a contradiction." The Skeptic design (§4) addresses this. Without it, the system can converge on well-written nonsense.

**Filesystem scanning doesn't scale.** `scanTree()` walks the entire directory tree every pulse. No caching. Fine up to ~500 nodes. Beyond that, incremental scanning or an in-memory cache with filesystem sync will be needed.

**The Crystallizer is disconnected from the ecology.** It runs as a separate command after everything else, not as part of the feedback loop. It's a report generator, not an agent. Incremental crystallization (generating specs for stable branches while others evolve) would make it a living part of the system.

---

## 8. The Road Ahead

Ideas not yet implemented. Ranked by value to the current system.

### Tier 1: High Value, Architecturally Ready

**The Skeptic (Semantic Adversary)**
The most important missing agent. FlashSpore grows. Scout checks structure. Verifier checks implementability. Nobody challenges ideas. The Skeptic reads a node's content against its parent and siblings and attacks logical coherence: "You specified real-time sync under a batch processing parent." "These three requirements cannot coexist." Deposits typed ConflictReasons (`LOGICAL`, `SECURITY`, `ARCHITECTURAL`) that the Resolver can address with full context.

**Signal Evaporation (Trace Decay)** — IMPLEMENTED
Need (−0.25) and conflict (−0.08) decay per maintenance cycle on idle nodes. Confidence preserved. Child-need dampening (parent_need − 2 instead of −1) reduces aggregate need inflation.

**Analytics Output**
A JSONL format capturing per-pulse telemetry: target, agent, mutations attempted/succeeded, signal changes, cost, tree stats. Enables data-driven tuning of maintenance intervals, agent thresholds, and priority weights. The ecology should be observable as a time series, not just a snapshot.

### Tier 2: Valuable, Requires Design Work

**Subtree Relocation**
When overlap detection identifies a node that semantically belongs in a different branch, a Relocator agent moves it (preserving children) and lets the ecology repair inconsistencies. The tree self-organizes beyond just merging duplicates — it restructures.

**Adaptive Maintenance Scheduling**
Currently maintenance runs on fixed intervals (every 10 pulses). The system should adapt: run Scout more when conflict density is rising, run Synthesizer more when duplicate rate is high, skip Weaver when the tree is small. Condition-triggered beats clock-triggered.

**Incremental Crystallization**
Generate spec documents for stable branches while others are still evolving. Makes crystallization part of the living system rather than a post-processing step. Stable subtrees crystallize early; unstable ones keep growing.

### Tier 3: Speculative, High Potential

**The Pre-Cognitive Interface**
The system identifies "unfinished edges" — logical holes where a feature implies a dependency that doesn't exist yet. It spawns Shadow Nodes for implied features and evolves them in the background. When the user finally asks for "password reset," the system doesn't generate it. It *reveals* three variations evolved to 90% confidence.

**Spec-Driven Evolution (The Ribosome)**
When a spec node reaches stability, a Builder agent generates a unit test and stub implementation in a sandbox. If the code passes, reinforcement. If it fails, tension. The spec is validated by reality. The environment becomes the arbiter (Primitive #18).

**Conflict Archaeology**
Every conflict raised leaves a `conflict_reason`. Over time, this becomes a dataset of *why things break*. Trend analysis: "Coverage gaps happen 3x more in API branches." "Hollow nodes cluster at depth 4." A meta-agent that reads conflict patterns and evolves the swarm's own heuristics.

**User Simulation Swarm**
Persona agents ("Angry Admin", "Confused Newbie", "Hacker") that read the interface spec and try to "use" it. Deposit Frustration Pheromones where the spec fails the persona. The spec heatmap shows UX problems before a single line of code is written.

### Scaling Concerns

**Large Tree Optimization** — At 500+ nodes, `scanTree` filesystem walk becomes expensive. Options: incremental scanning (track which nodes changed), in-memory cache with filesystem sync. The branchMap (used for cross-branch overlap detection) caps at 200 lines, so FlashSpore's context stays bounded regardless of tree size.

---

## 9. The Economic Moat

Why does a swarm of cheap agents beat one expensive genius?

1. **Cost structure inverts the usual constraint.** 200 pulses costs $0.06. 1000 pulses costs $0.30. You can afford to let the system be wrong a hundred times and self-correct. Most AI systems optimize for getting it right in one shot because calls are expensive. We optimize for ecology — the aggregate is smart even when individuals are dumb.

2. **Self-healing by default.** A hallucination in a linear chat ruins the session. A hallucination in the swarm is a low-confidence node that gets eaten by a Grazer or flagged by a Scout. Error is not catastrophic; it's compost.

3. **Infinite effective context.** We don't stuff the context window. We navigate the graph. The project can grow to thousands of nodes, and agents only ever look at 5-10 at a time (Local Context Only). There is no context window limit on the *system* — only on individual agents, and that's fine.

4. **Parallelism is trivial.** Run 8, 16, 32 concurrent agents. Each is independent. There's no orchestration graph to maintain, no dependency chain to manage. More agents = faster convergence = same cost.

5. **The training data advantage.** Competitive AI systems fight the current — extraction, engagement optimization, persuasion for conversion. This system swims with it — coherence, care, implementability. The model's natural tendency toward helpful, structured output is the feature, not the bug.
