# Stigmergic Specification V4: Engineering Design & Implementation Strategy

*Staff Engineer Analysis of the "Cytoplasmic Computer" Architecture.*

---

## 1. Executive Summary & Hard Realities

The V3 vision (RAM-based biological swarm) is compelling but introduces significant engineering peril. We are effectively building a **distributed database** where the active nodes are non-deterministic (LLMs).

**The central conflict:**
*   **Vision:** "1,000 independent agents evolving ideas in parallel."
*   **Reality:** Distributed state with non-deterministic actors = Chaos. Race conditions, infinite loops, and cost explosions are the default state.

This roadmap moves from "biological metaphor" to "engineering constraints."

---

## 2. Core Technical Risks

### A. The Concurrency "Read-Modify-Write" Hazard
**Scenario:**
1. Agent A reads Node `User_Auth`.
2. Agent B reads Node `User_Auth`.
3. Agent A decides `User_Auth` is redundant and issues `DELETE`.
4. Agent B decides `User_Auth` needs a child and issues `ADD_CHILD`.

**Result:** Crash, data corruption, or "Zombies" (children attached to dead parents).
**Mitigation:**
*   **Synchronous State Machine (The Redux Pattern):** The Graph State is never mutated directly by agents. Agents return *Intent Actions*. A central `Dispatcher` applies them sequentially.
*   **Optimistic Concurrency Control:** Every node has a `_version`. If Agent B tries to modify `User_Auth` (v1) but current state is v2 (or deleted), the mutation is rejected.

### B. The "Cost Explosion" Loop
**Scenario:**
Two agents get into an argument.
*   Agent A: "Add Redis."
*   Agent B (Safety): "Remove Redis (too expensive)."
*   Agent A: "Add Redis (needed for speed)."
*   *Repeat 1,000 times in 1 minute.*

**Result:** You burn $500 in 10 minutes.
**Mitigation:**
*   **Ghost Nodes (Immunity):** As defined in V3, but with hard enforcement. Recreating a killed node IDs requires significant "activation energy."
*   **Global Entropy Budget:** The system has a "token bucket" for API calls. When empty, the swarm sleeps.
*   **Damping Factors:** Every mutation to a node increases its `Temperature`. High temperature nodes become readonly/locked until they cool down.

### C. Context Window Fragmentation
**Scenario:**
To make a good decision, an agent needs context. But the graph is huge.
*   If we send too little context: Hallucinations/inconsistency.
*   If we send neighbors + parents + goals: We hit token limits or high latency.
**Mitigation:**
*   **The "Pheromone" Summary:** Every node must maintain a <50 token cached summary. Agents read summaries of neighbors, not full content.

---

## 3. The Data Structure (Concrete Implementation)

We cannot use plain Javascript Objects for a graph of 100k nodes efficiently if we need graph traversal.

**Recommendation: `graphology` or custom Adjacency List.**

```typescript
// The "Cytoplasm" State Container
class GraphDatabase {
  // Primary Storage
  nodes: Map<string, NodeData>;
  edges: Map<string, EdgeData>;
  
  // Indices for fast lookup
  index_by_type: Map<NodeType, Set<string>>;
  vector_index: HNSW; // Vector search index for semantic linking/dedup

  // The WAL (Write Ahead Log) for crash safety
  wal: WriteStream;

  applyMutation(mutation: SpecMutation) {
    // 1. Verify preconditions (optimistic locking)
    // 2. Apply atomic change
    // 3. Update indices
    // 4. Emit event for UI/CLI
  }
}
```

**Persistence:**
We do not write JSON dumps constantly. We use **Append-Only Logs (AOF)**.
*   Startup: Read `snapshot.json` (fast) + replay `events.aof` (recent changes).
*   Runtime: `fs.appendFile` for every mutation.
*   Shutdown: Write new `snapshot.json`.

---

## 4. MVP Definition: The "Walking Skeleton"

We strip the "Vector Space" and "Real-time" aspects for version 0.1.

**Scope:**
1.  **State:** In-Memory Graph (no vector DB yet).
2.  **Concurrency:** Single-turn loop (Turn-based, not specific real-time).
    *   Tick 1: Select 5 nodes.
    *   Tick 2: Run 5 Agents in parallel.
    *   Tick 3: Apply results.
3.  **Agents:**
    *   `Spore` (Expand).
    *   `Crystallizer` (Save to file).
    *   *(Cut Grazer and Weaver for MVP - humans can prune).*
4.  **Interface:** CLI only. `hierophage inject "goal"`, `hierophage tick`.

**Why:** This proves the *Data Structure* and *Prompt Architecture* without fighting async race conditions or vector math.

---

## 5. Performance & Testing Strategy

### A. The "Mock Swarm" (Zero-Cost Testing)
We cannot unit test this with real LLMs (too slow/expensive/nondeterministic).
We build a **Deterministic Simulator**.

```typescript
// The Mock Agent
class MockSpore implements Agent {
  async run(context) {
    // Deterministic scripted behavior
    if (context.node.content.includes("error")) {
      return { type: "KILL", nodeId: context.node.id };
    }
    return { type: "SPLIT", parentId: context.node.id, newNodes: [...] };
  }
}
```

**Stress Test:**
Run the Mock Swarm with 10,000 ticks.
*   Does the memory leak?
*   Does the graph maintain integrity (no orphan edges)?
*   Does the WAL replay correctly restore state?

### B. "Red Teaming" the Prompts
We need a suite of **Evals** specifically for the agents.
*   **Input:** A specific graph state (e.g., "A contradictory login spec").
*   **Task:** Run the `Grazer` agent.
*   **Pass:** Agent identifies the conflict.
*   **Fail:** Agent hallucinates a new feature or ignores conflict.

This must be part of CI/CD.

---

## 6. The "Staff Engineer" Blindspots (Unknown Unknowns)

### A. Observability is the Kill-Chain
You cannot debug a swarm by reading logs. It's too noisy.
**Requirement:** We need a **Visualizer** from Day 1.
*   Dump graph to JSON.
*   Load into a simple D3.js or Cytoscape.js web page.
*   Color nodes by "Tension" or "Activity".
*   *Without this, we are flying blind.*

### B. Determining "Done"
How does the system stop?
*   **Naive:** When "Pending Work" queue is empty.
*   **Problem:** Infinite loops (A deletes, B adds).
*   **Solution:** **Global Energy Decay.** The system starts with 10,000 "Action Points". Every micro-task costs 1 point. When 0, it stops. The user must inject more "Energy" (and review) to continue. This puts a hard cap on runaway costs.

---

## 7. Packaging Strategy: The Symbiote

We reject the choice between "Integration" and "Microservice". We choose **Internal Isolation**.

The Cytoplasmic Computer will live in `packages/stigmergy` within the monorepo.

**Rationale:**
1.  **Shared DNA:** It needs access to the "Foundation" documents in the root.
2.  **Dependency Isolation:** It requires heavy dependencies (`graphology`, vector libs) that should not bloat the main `hierophage` CLI binary.
3.  **Strict Membrane:** By forcing it into a separate package, we physically enforce the API boundary. The CLI (host) can only talk to the Stigmergy Engine (symbiote) via defined IPC or function calls, preventing spaghetti code.

## 8. Implementation Plan

1.  **Phase 0: The Core (No AI)**
    *   **Scaffold `packages/stigmergy`**.
    *   Implement `GraphDatabase` (In-memory + WAL).
    *   Implement `MutationDispatcher` (The Redux logic).
    *   CLI to manually `addNode`, `linkNode`.
    *   Visualizer (export to local `.html` file).

2.  **Phase 1: The Simulator (Mock AI)**
    *   Implement `Agent` interface.
    *   Create `MockSpore` that blindly splits nodes.
    *   Run simulation loop. Verify graph stability.

3.  **Phase 2: The First Breath (Real AI)**
    *   Connect `Spore` to Gemini Flash.
    *   Implement Prompts.
    *   Run on simple goal: "Design a Todo List App."

4.  **Phase 3: The Membrane**
    *   Implement `Crystallizer` logic.
    *   Implement Markdown generation.
    *   Write files to disk.
