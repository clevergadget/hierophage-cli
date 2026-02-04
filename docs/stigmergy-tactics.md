# Stigmergic System Primitives (Rattle Deck)

## 1. **Persistent Trace**

**Mechanic:**
Agents leave durable marks in the environment.

**System Form:**

* Append-only logs
* Markers on nodes / edges
* Weighted annotations on artifacts

**Rule:**

> Work leaves evidence. Evidence influences later work.

**Use when:**
You want memory without memory-holding agents.

---

## 2. **Trace Reinforcement**

**Mechanic:**
Repeated interaction strengthens a trace.

**System Form:**

* Incrementing counters
* Increasing weights / scores
* Confidence boosts from reuse

**Rule:**

> Success makes itself more likely.

**Use when:**
You want convergence without voting or arbitration.

---

## 3. **Trace Decay**

**Mechanic:**
Unused traces weaken or disappear over time.

**System Form:**

* Time-based TTL
* Exponential decay on scores
* Garbage collection of inactive markers

**Rule:**

> What isn’t used is forgotten.

**Use when:**
You want adaptability and avoidance of dead paths.

---

## 4. **Gradient Following**

**Mechanic:**
Agents move toward stronger signals.

**System Form:**

* Priority queues
* Heatmaps
* Softmax over weighted choices

**Rule:**

> Don’t choose the best thing. Drift uphill.

**Use when:**
You want agents to coordinate without exact agreement.

---

## 5. **Local Context Only**

**Mechanic:**
Agents see only nearby or directly linked traces.

**System Form:**

* Neighborhood graphs
* Bounded context windows
* One-hop dependency views

**Rule:**

> Global order from local sight.

**Use when:**
You want scalability and parallelism without synchronization.

---

## 6. **Autocatalytic Tasks**

**Mechanic:**
Doing a task makes the same task easier or more attractive later.

**System Form:**

* Templates that spawn similar tasks
* Pattern extraction after success
* Automatic task cloning

**Rule:**

> Work begets work of its own kind.

**Use when:**
You want useful patterns to self-replicate.

---

## 7. **Inhibitory Signals**

**Mechanic:**
Some traces repel rather than attract.

**System Form:**

* Locks
* Saturation flags
* Negative weights

**Rule:**

> Prevent crowding by pushing others away.

**Use when:**
You want to avoid redundant or conflicting work.

---

## 8. **Threshold Triggers**

**Mechanic:**
A trace only matters once it crosses a critical level.

**System Form:**

* Quorum counters
* Confidence thresholds
* Escalation gates

**Rule:**

> Nothing happens… until suddenly it does.

**Use when:**
You want phase changes without coordination.

---

## 9. **Structural Scaffolds**

**Mechanic:**
Partial structures attract completion.

**System Form:**

* Stub files
* Empty interfaces
* TODO anchors

**Rule:**

> Incompleteness is a signal.

**Use when:**
You want decomposition without planning.

---

## 10. **Environmental Memory**

**Mechanic:**
The environment stores history, not agents.

**System Form:**

* Versioned artifacts
* Immutable event logs
* State snapshots

**Rule:**

> Agents forget; the world remembers.

**Use when:**
You want cheap, disposable agents.

---

## 11. **Path Entrenchment**

**Mechanic:**
Frequently used routes become default.

**System Form:**

* Recommended workflows
* Auto-suggested sequences
* Learned execution paths

**Rule:**

> Repetition becomes infrastructure.

**Use when:**
You want standards without enforcement.

---

## 12. **Competitive Overlay**

**Mechanic:**
Constructive and destructive actions coexist.

**System Form:**

* Edit vs revert agents
* Proposal vs critique agents
* Red/blue teams

**Rule:**

> Stability comes from tension, not harmony.

**Use when:**
You want resilience against bad contributions.

---

## 13. **Micro-Action Constraint**

**Mechanic:**
Each agent can only do one tiny thing.

**System Form:**

* One edit per turn
* Single-claim outputs
* Atomic commits

**Rule:**

> Big things grow from small moves.

**Use when:**
You want emergent structure, not monolithic output.

---

## 14. **Read-Before-Write Enforcement**

**Mechanic:**
Agents must observe state before acting.

**System Form:**

* Mandatory context fetch
* Precondition checks
* Diff-based writes

**Rule:**

> You must see the world you’re changing.

**Use when:**
You want coherence without reviews.

---

## 15. **Signal-Based Attention Routing**

**Mechanic:**
Work is pulled, not assigned.

**System Form:**

* Agents scan for high-need markers
* Priority emerges from traces
* No explicit task assignment

**Rule:**

> Attention follows signal, not command.

**Use when:**
You want self-directed decomposition.

---

## 16. **Phase Drift (Exploration → Exploitation)**

**Mechanic:**
Signal density shifts agent behavior over time.

**System Form:**

* Low-signal = explore
* High-signal = refine
* Automatic behavior switch

**Rule:**

> First find shape, then sharpen it.

**Use when:**
You want convergence without a “final pass”.

---

## 17. **Consensus by Accumulation**

**Mechanic:**
Agreement emerges from repeated reinforcement.

**System Form:**

* Majority traces
* Confidence accumulation
* Survivor artifacts

**Rule:**

> What survives many passes becomes truth.

**Use when:**
You want decisions without meetings.

---

## 18. **Environment as Arbiter**

**Mechanic:**
Conflicts are resolved by state, not debate.

**System Form:**

* Tests
* Invariants
* Constraint checks

**Rule:**

> The world decides who’s wrong.

**Use when:**
You want objective resolution.

---

## 19. **Edge-Focused Growth**

**Mechanic:**
Work happens at boundaries.

**System Form:**

* Interfaces
* Open questions
* Failing tests

**Rule:**

> Growth happens where structure is thin.

**Use when:**
You want controlled expansion.

---

## 20. **No Roll-Up Rule**

**Mechanic:**
There is never a global synthesis step.

**System Form:**

* Continuous integration only
* Always-live artifacts
* No “final summary” phase

**Rule:**

> The system is always already integrated.

**Use when:**
You want perpetual coherence.

