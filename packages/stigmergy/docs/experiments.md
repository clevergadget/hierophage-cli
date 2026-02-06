# 5 Experiments on Emergence

These experiments traverse from "mechanical baseline" to "complex emergent properties," designed to be run in sequence.

### Experiment 1: The Control (Deterministic Growth)
**Hypothesis:** Without LLM variability, the tree should grow in a perfectly predictable fractal pattern.

1.  **Initialize**: `node dist/src/cli/cli.js init "Build a CLI todo app" --skip-scaffolds`
2.  **Run**: `node dist/src/cli/cli.js run --dry-run --max-pulses 50`
3.  **Analyze**:
    Run `node dist/src/cli/cli.js replay`.
    *   **Look for:** The "MockSpore" agent.

### Experiment 2: Genesis (The First 50 Pulses)
**Hypothesis:** The "Germination" phase favors aggressive breadth-first decomposition over depth.

1.  **Reset**: Wipe the workspace (`rm -rf ~/.hierophage/stig`).
2.  **Initialize**: `node dist/src/cli/cli.js init "Build a CLI todo app"` (let it use default scaffolds this time).
3.  **Run**: `node dist/src/cli/cli.js run --max-pulses 50 --confirm`
4.  **Analyze**:
    Run `node dist/src/cli/cli.js replay`.
    *   **Focus:** Look at pulses 1-20 vs 30-50.

### Experiment 3: The Immune System (Maintenance Cycles)
**Hypothesis:** Entropy (bad nodes) accumulates naturally and requires active pruning.

1.  **Continue**: Use the workspace from Exp 2.
2.  **Run**: `node dist/src/cli/cli.js run --max-pulses 20 --confirm` (Total 70).
3.  **Analyze**:
    Run `node dist/src/cli/cli.js replay --maintenance`.
    *   **Focus:** This filters the view to show only the "hidden" turns that happen every 10 pulses.

### Experiment 4: The Crowd (Parallelism & Overlap)
**Hypothesis:** Parallel agents will accidentally target the same conceptual areas, but the `branchMap` prevents conflicting writes.

1.  **Reset**: Wipe the workspace (`rm -rf ~/.hierophage/stig`).
2.  **Initialize**: `node dist/src/cli/cli.js init "Design a complex MMORPG economy"` (A broad goal encourages fan-out).
3.  **Run**: `node dist/src/cli/cli.js run --max-pulses 50 --parallel 4 --confirm`
4.  **Analyze**:
    Run `node dist/src/cli/cli.js replay` and grep or scan for "overlap".

### Experiment 5: The Phase Shift (Germination → Foraging)
**Hypothesis:** As average confidence rises, the colony naturally shifts behavior from expansion to refinement.

1.  **Reset**: Wipe the workspace (`rm -rf ~/.hierophage/stig`).
2.  **Initialize**: `node dist/src/cli/cli.js init "Simple calculator"` (Small goal to reach maturity fast).
3.  **Run**: `node dist/src/cli/cli.js run --max-pulses 100 --confirm`
4.  **Analyze**:
    Run `node dist/src/cli/cli.js replay`.
    *   **Focus:** Scroll through the log looking for the `PHASE CHANGE` header.
    *   **Deep Dive:** Pick a specific pulse from the transition era: `node dist/src/cli/cli.js replay --pulse [N]`.
