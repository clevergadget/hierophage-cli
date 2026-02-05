# Stigmergy V5: The Cognitive Ecology

*Moving from a system that grows text to a system that grows intelligence.*

Current State (V4):
- **Growth:** Excellent (`FlashSpore`). The system expands rapidly.
- **Hygiene:** Basic (`Scout`, `Grazer`). The system removes empty/dead nodes.
- **Intelligence:** Missing. The system cannot distinguish between a "well-written bad idea" and a "good idea". It lacks lateral connectivity and semantic resistance.

V5 introduces three new biological entities to close the cognitive loop.

---

## 1. The Semantic Predator: "The Skeptic"

**Role:** Active Adversary / Quality Control
**Biological Analog:** The Immune System (specifically T-Cells)

The `FlashSpore` is designed to be a "Yes Man" (Growth biased). The `Skeptic` is designed to be a "No Man" (Truth biased). Its goal is to stop hallucinations from reaching Crystallization.

### Logic & Trigger
*   **Trigger:** Runs on nodes with `Confidence > 7` during `Foraging` and `Brood Care` phases.
*   **Input:** Target Node + Parent Node + (Optional) Grandparent.
*   **Prompt Strategy:** "You are a Senior Architect reviewing a junior's spec. Find logical contradictions, security flaws, or implementation impossibilities. Be harsh."

### The Mechanism: Semantic Inhibition
Unlike the `Scout` (which checks syntax), the `Skeptic` reads meaning.
1.  **Reads** the `content` of the node.
2.  **Validates** against the `evidence` (Acceptance Criteria).
3.  **Attacks** the logic.
    *   *Example:* Spec says "Real-time sync" but Parent says "Batch processing architecture".
    *   *Example:* Spec says "Store passwords in local storage".
4.  **Action:**
    *   If Flaw Found: It does **not** edit the content.
    *   It **Updates Signals**: Checks `Conflict` signal.
    *   It **Deposits Toxin**: Adds a structured `ConflictReason` to `evidence.conflict_reasons`.
        *   `{ type: "SEMANTIC", severity: "HIGH", message: "Security Validation: Cannot store cleartext pws." }`

### Ecology Interaction
*   **vs FlashSpore:** A node attacked by the `Skeptic` drops in `Confidence`. `FlashSpore` is repelled by the high `Conflict` signal.
*   **vs Resolver:** The `Resolver` is attracted to the `Conflict` signal. It reads the `Skeptic`'s specific complaint and edits the content to fix the flaw.

---

## 2. The Mycelial Network: "The Weaver"

**Role:** Lateral Connector / Silo Breaker
**Biological Analog:** Mycelial fungal networks (resource transport)

Current Stigmergy is hierarchical (Tree). Real software is a Graph. The `Weaver` creates horizontal highways between vertical silos.

### Logic & Trigger
*   **Trigger:** Periodic execution during `Foraging` phase (when the map is expanding).
*   **Input:** Embedding vectors of Node Titles/Summaries (or lightweight keyword sets).
*   **Process:**
    *   Scans for **Semantic Overlap** between distant branches.
    *   *Scenario:* Branch A (Frontend) mentions "User Object". Branch B (DB Schema) mentions "User Table".
    *   Calculates Cosine Similarity or checks Shared Glossary terms.

### The Mechanism: Pheromone Diffusion
1.  **Identify:** Finds Node A and Node B that are high-similarity but `distance > 3` hops.
2.  **Action:** It creates a **Lateral Link** (a new property on `StigNode`).
    *   `StigNode.params.related_links = ["path/to/other/node"]`
3.  **Trace:** It leaves a specific `WeaverTrace` in the `evidence`.

### Ecology Interaction
*   **vs FlashSpore:** When `FlashSpore` next visits Node A, the Context Window now *includes* the summary of the laterally linked Node B (even though it's not a parent/child).
*   **Emergent Result:** The "Frontend" starts respecting the "Database" constraints without a human coordinating them.

---

## 3. The Digestive System: "The Synthesizer"

**Role:** Consolidation / Merger
**Biological Analog:** Digestion / Fusion

`FlashSpore` creates messy, overlapping children. `Scout` flags them as "Similar Siblings". Currently, the only solution is manual deletion. The `Synthesizer` turns redundancy into density.

### Logic & Trigger
*   **Trigger:** High `Similar Sibling` counts in `Scout` reports.
*   **Input:** A cluster of 2-4 Sibling Nodes identified as redundant.
*   **Prompt Strategy:** "Here are 3 different ways we described 'Error Handling'. Merge them into one comprehensive Canon node. Discard the fluff."

### The Mechanism: Atomic Fusion
This requires a new atomic operation: `MERGE_NODES`.
1.  **Read:** Ingests Content of Node A, B, C.
2.  **Synthesize:** Generates `Content D` (The Super-Node).
3.  **Transmute:**
    *   Updates Node A to become Node D (inheriting the best stats).
    *   **Consumes** Node B and Node C (Deletes key, or converts to redirects).
4.  **Signal:** Sets `Confidence` of Node D to `max(A, B, C) + boost`.

### Ecology Interaction
*   **vs Grazer:** Prevents `Grazer` from just killing off "stagnant" duplicates. Instead, their value is harvested.
*   **vs Memory:** This reduces the total token count of the tree while increasing its information density.

---

## Implementation Roadmap

To support these entities, the `StigNode` schema and `Mutation` types need modest expansion:

### 1. Schema Extensions (`types.ts`)
*   **Conflict Reason:** Structured object for the `Skeptic`.
    ```typescript
    type ConflictType = 'LOGICAL' | 'SECURITY' | 'ARCHITECTURAL' | 'TEMPORAL';
    interface ConflictReason {
      agent: string; // "Skeptic"
      type: ConflictType;
      message: string; // "Contradicts parent on auth strategy"
      severity: number; // 0-10
    }
    ```
*   **Lateral Links:** For the `Weaver`.
    ```typescript
    interface StigNode {
      // ... existing props
      links: string[]; // Paths to related nodes
    }
    ```

### 2. New Mutations (`mutations.ts`)
*   `ADD_LINK`: Connects two nodes `(source, target)`.
*   `MERGE_NODES`: Complex atomic operation `(sources: [], target, newContent)`.

### 3. Agent Development Order
1.  **The Skeptic:** Highest value. Prevents the "Hallucination Loop".
2.  **The Weaver:** High value for checking consistency.
3.  **The Synthesizer:** Optimization. Can be done later once the tree gets too big.
