# Phase 4: Convergent Trees

*Engineering design for trees that actually terminate.*

---

## 0. Vocabulary

We use biological terms from stigmergy literature (ant colonies, slime molds, termite mounds) to keep the conceptual frame coherent:

| Term | Meaning in this system |
|------|------------------------|
| **Pheromone** | Signal values (need, confidence, conflict) left on nodes |
| **Foraging** | Exploration phase — decomposing, expanding the tree |
| **Brood care** | Nurturing phase — deepening content, raising confidence |
| **Quorum sensing** | Threshold-based phase transitions |
| **Evaporation** | Trace decay — stale signals weaken over time |
| **Necrophoresis** | Corpse removal — pruning dead/empty nodes (the Grazer) |
| **Recruitment** | Priority signal that attracts agent attention |
| **Scout** | Agent that explores ahead, detects problems (the Skeptic) |
| **Spore** | Reproductive unit that colonizes new territory (FlashSpore) |
| **Crystallization** | Solidification into stable, readable output |

---

## 1. The Problem

Current state: trees grow wide but don't converge. FlashSpore decomposes endlessly, confidence stays low, need stays high. Runs terminate at `max_pulses`, not `stable`. The crystal honestly reports 200+ health issues.

**Root causes:**
1. FlashSpore has one mode: decompose. It never shifts to deepening or settling.
2. No pruning. Weak nodes persist forever.
3. No adversarial pressure. Contradictions go undetected.
4. Sequential pulses. Waiting is painful.

**Success criteria for Phase 4:**
- 100-pulse run terminates at `stable` (not `max_pulses`)
- Average confidence > 7 at termination
- Tree health report shows < 10 issues
- Crystal output is implementable prose

---

## 2. The Four Levers

### A. Parallelism

**Problem:** Single agent per pulse. Long waits.

**Solution:** Select N targets per pulse, run N FlashSpore calls concurrently, dispatch mutations sequentially.

**Implementation:**
```typescript
// In pulse.ts
const targets = selectNHighestPriority(nodes, config.parallel_agents ?? 1);
const results = await Promise.all(
  targets.map(t => agent.run(t.node, t.context, t.children))
);
for (const result of results) {
  dispatcher.dispatch(result.mutations);
}
```

**Constraints:**
- Mutations still dispatch sequentially (no concurrent writes)
- Budget tracks all calls
- If two agents target overlapping nodes, later mutations may fail validation (acceptable — optimistic concurrency)

**Config:**
```json
{ "parallel_agents": 4 }
```

---

### B. Necrophoresis (The Grazer)

**Problem:** Trees bloat with redundant/weak nodes. Empty placeholders persist. Dead matter accumulates.

**Solution:** A corpse-removal agent that implements Evaporation (#3) and Inhibitory Signals (#7). In ant colonies, undertaker ants remove dead bodies to prevent disease. Our Grazer removes dead nodes to prevent bloat.

**Behaviors:**
1. **Remove corpses** — nodes with < 20 chars of content and confidence < 3 (dead on arrival)
2. **Merge redundant workers** — siblings with similar names/content get consolidated
3. **Collapse degenerate chains** — single-child parents absorb their child
4. **Evaporate stale pheromones** — nodes not modified in 10+ pulses get need reduced

**Mutations:**
- `DELETE_NODE` — remove a node (children get reparented or deleted)
- `MERGE_NODES` — combine two siblings into one
- `UPDATE_SIGNALS` — decay need on stale nodes

**Scheduling:**
- Run Grazer every N pulses (e.g., every 5th pulse)
- Or: run when tree size exceeds threshold
- Or: dedicated "cleanup phase" after main growth

**Interface:**
```typescript
interface GrazerResult {
  deleted: string[];
  merged: Array<{ from: string[]; to: string }>;
  decayed: string[];
  cost: AgentCost;
}
```

---

### C. Better Prompts (Quorum-Driven Phase Drift)

**Problem:** FlashSpore always forages. Never shifts to brood care or settling.

**Solution:** Implement Phase Drift (#16). Agent behavior shifts based on colony maturity (quorum sensing).

**The Phases:**

| Colony State | Avg Confidence | Behavior | Biological Analog |
|--------------|----------------|----------|-------------------|
| Germination | < 3 | DECOMPOSE: expand territory | Foraging — scouts fan out |
| Foraging | 3-5 | REVIEW: assess what exists | Recruitment — reinforce good paths |
| Brood Care | 5-7 | UPDATE_CONTENT: nurture depth | Nursing — feed the larvae |
| Crystallization | > 7 | SETTLE: solidify | Pupation — lock in structure |

**Implementation options:**

1. **Dynamic system prompt** — inject tree stats into FlashSpore's system prompt:
   ```
   Current tree state: MATURING (avg confidence: 5.4)
   Preferred action: UPDATE_CONTENT — add substantive detail to existing nodes.
   Avoid: Creating new children unless absolutely necessary.
   ```

2. **Action weighting** — modify the response schema to include recommended actions based on phase.

3. **Separate agents** — different agent classes for each phase (SporeExplorer, SporeRefiner, SporeSettler). Scanner picks agent based on tree state.

**Recommendation:** Option 1 (dynamic prompt injection) is simplest. We already compute tree stats. Inject them into the prompt.

**Additional prompt improvements:**
- Penalize shallow content: "If you cannot add at least 50 words of substantive detail, do not create the node."
- Reward settling: "If a node's children fully cover its scope, SETTLE the parent."
- Explicit confidence guidance: "Confidence 8+ means a developer could implement from this description alone."

---

### D. Scout Patrol (The Skeptic)

**Problem:** Contradictions go undetected. Conflict pheromones stay at 0.

**Solution:** Implement Competitive Overlay (#12). Scout ants explore ahead of the colony, detecting danger and dead ends. Our Scout detects logical hazards.

**Behaviors:**
1. **Detect contradictions** — siblings or cousins that assert incompatible things
2. **Flag impossible combinations** — "real-time" + "batch processing" + "no infrastructure"
3. **Mark hollow nodes** — content that restates the node name without adding detail (tautology)
4. **Signal missing dependencies** — feature implies another feature that doesn't exist

**Output:**
- `UPDATE_SIGNALS` with increased `conflict` on problematic nodes
- Optionally: `UPDATE_CONTENT` to add a "CONFLICT:" annotation

**Scheduling:**
- Run after every N growth pulses
- Or: run on crystallization (pre-flight check)
- Or: continuous — small chance each pulse

**Lightweight version (v1):**
Don't call the LLM. Use heuristics:
- Content length < 20 chars → flag as placeholder
- Content ≈ node name → flag as tautology
- Sibling names too similar → flag for merge review

**Full version (v2):**
LLM-powered contradiction detection. Expensive but thorough.

---

## 3. Existing Levers to Tune

We have knobs that aren't optimized:

### Priority Formula
```typescript
need * 2 - confidence + conflict * 0.5 + scaffold_boost - depth * 0.3
```

**Potential adjustments:**
- Increase depth penalty in later phases (don't keep drilling)
- Add `staleness` factor (untouched nodes get priority boost, then decay)
- Add `content_density` factor (empty nodes get priority)

### Stability Threshold
```json
{ "stability_threshold": { "confidence_min": 8, "need_max": 2 } }
```

Currently: a node is stable if confidence ≥ 8 AND need ≤ 2.

**Consider:** Also require `content.length > 50` or similar quality gate.

### Temperature / Damping
Nodes get "hot" after mutations and cool over pulses.

**Currently:** Prevents rapid re-mutation of same node.

**Could add:** "Cold" bonus — nodes untouched for many pulses get priority boost (force revisit).

### Confidence Nudge
Currently: +2 confidence on parent when children are created.

**Could add:**
- +1 confidence when reviewed with no changes (Consensus by Accumulation)
- +1 confidence when content is substantively updated
- -1 confidence when Skeptic flags issues

---

## 4. Implementation Plan

### Step 1: Parallelism
- Add `selectNHighestPriority(nodes, n)` to scanner
- Modify pulse loop to run N agents concurrently
- Add `parallel_agents` to config
- Update budget tracking for batch calls
- Tests: verify no race conditions, budget correct

### Step 2: Phase Drift Prompts
- Compute tree phase from avg_confidence in pulse loop
- Inject phase context into FlashSpore system prompt
- Add content quality requirements to prompt
- Tests: mock different tree states, verify prompt changes

### Step 3: Grazer Agent (Heuristic v1)
- Implement `Grazer` class with heuristic rules
- Add `DELETE_NODE` mutation type to dispatcher
- Schedule: run every 5 pulses or when tree > 50 nodes
- Tests: verify pruning, verify no orphans

### Step 4: Skeptic Agent (Heuristic v1)
- Implement heuristic checks (placeholder detection, tautology detection)
- Emit `UPDATE_SIGNALS` to raise conflict
- Schedule: run every 5 pulses
- Tests: verify conflict signals raised appropriately

### Step 5: Tune and Iterate
- Run on real goals, observe behavior
- Adjust priority formula weights
- Adjust phase thresholds
- Adjust prompt language

---

## 5. Tactics Implemented

| Tactic | Implementation |
|--------|----------------|
| #2 Trace Reinforcement | Confidence bump on no-change review |
| #3 Trace Decay | Grazer prunes stale nodes |
| #12 Competitive Overlay | Skeptic vs FlashSpore tension |
| #16 Phase Drift | Dynamic prompt based on tree maturity |
| #17 Consensus by Accumulation | Multiple reviews compound confidence |

---

## 6. Risk Mitigation

**Risk:** Grazer too aggressive, kills good nodes.
**Mitigation:** Conservative thresholds. Require multiple signals (stale AND empty AND low confidence).

**Risk:** Phase drift causes premature settling.
**Mitigation:** Phase thresholds tuned empirically. Settling only when avg_confidence genuinely high.

**Risk:** Parallelism causes mutation conflicts.
**Mitigation:** Optimistic concurrency already handles this. Failed mutations are logged, not crashes.

**Risk:** Skeptic raises false conflicts.
**Mitigation:** Start with heuristics (objective). LLM skeptic only in v2.

---

## 7. Success Metrics

After Phase 4, a `stig run --confirm` on "Build a CLI todo app" should:

1. Terminate at `stable` in < 100 pulses
2. Produce a tree with:
   - 30-80 nodes (not 500+)
   - Avg confidence > 7
   - < 10 nodes with confidence < 5
   - < 5 nodes with conflict > 0
3. Crystallize to documents where:
   - Tree Health section reports < 10 issues
   - Content is specific enough to implement from
   - No "placeholder only" warnings
