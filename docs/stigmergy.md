# Stigmergy: Specification Through Swarm Behavior

## What is Stigmergy?

Stigmergy is how ants build anthills without a foreman.

No ant knows the whole plan. No ant gives orders to other ants. Each ant leaves chemical traces (pheromones) as it works. Other ants respond to those traces. Drop food here, the trace strengthens. Avoid danger there, the trace fades. Over time, complex structures emerge from simple local rules.

The key insight: **coordination without communication**. The environment itself becomes the communication medium. Work leaves traces. Traces guide future work. No central plan required.

---

## The Problem

You have a vague idea. You want a buildable spec.

Today you either spend hours in conversation with a model that keeps asking follow-up questions, or you throw money at a frontier model and hope the context window holds. Both approaches put all the cognitive weight on a single thread. When that thread gets confused or runs out of context, the whole thing falls apart.

We're building something different: **a swarm of cheap, fast model calls that collectively produce a spec no single call could have written.** No powerful model in the loop. No synthesis step. No roll-up. The spec is always already integrated because each piece was built with awareness of its neighbors and its lineage.

The constraint is deliberate: **every call uses Gemini 2.5 Flash.** If the tasks are small enough, the context is right, and the coherence checks are clever enough, you don't need a frontier model. You need a thousand ants.

---

## The Tree

### Root Node

The user's initial statement is the first node. Everything grows from it.

```
"Build a multiplayer word game for mobile"
```

That's the root. It contains the original intent. Every descendant node inherits this context.

### Foundation Context

The foundation document (or any governing context) is prepended to the root. Every node in the tree inherits it through the parent chain. This is how values travel without explicit enforcement—they're in the water supply.

```
[foundation context]
  └─ [user's goal]
       └─ [everything else]
```

### Branching: The Lister

The first operation after the root is a set of parallel Flash calls called **listers**. Each lister independently asks: "What are the top-level concerns needed to turn this into a buildable, deployable, usable thing?"

Multiple listers run simultaneously. Their outputs are compared. Overlapping concerns become nodes. Unique concerns become nodes too—disagreement is information.

For "Build a multiplayer word game for mobile":

```
Lister A: platform, game engine, word database, multiplayer backend, UI
Lister B: platform, gameplay mechanics, networking, monetization, art style
Lister C: tech stack, game rules, matchmaking, deployment, testing
```

Overlaps cluster. The tree grows its first branches:

```
"Build a multiplayer word game for mobile"
├── Platform
├── Game Engine / Tech Stack
├── Gameplay / Word Mechanics
├── Multiplayer / Networking
├── UI / Art Direction
├── Deployment
├── Testing
└── Monetization (flagged: 2 of 3 listers mentioned it)
```

### Cumulative Context

Each node carries the context chain from root to itself. When a Flash call works on a node, it sees:

```
[foundation context]
[root: "Build a multiplayer word game for mobile"]
[branch: Platform]
[sub-branch: Target OS]
[this node: iOS vs Android vs Cross-platform]
```

Context accumulates downward. A leaf node deep in the tree knows the full lineage of decisions that led to it. This is how coherence propagates without a synthesizer—every node was born knowing where it came from.

### Pre-Built Scaffold Nodes

Some concerns are universal. Every software project needs deployment, testing, error handling, CI/CD. These can be pre-seeded as scaffold nodes—empty structures that attract completion (tactic: **Structural Scaffolds**).

```
"Build a multiplayer word game for mobile"
├── Platform
├── Game Engine / Tech Stack
├── ...
├── [scaffold] Deployment
│   ├── [scaffold] Build Pipeline
│   ├── [scaffold] Release Process
│   └── [scaffold] Rollback Strategy
├── [scaffold] Testing
│   ├── [scaffold] Unit Tests
│   ├── [scaffold] Integration Tests
│   └── [scaffold] Acceptance Criteria
└── [scaffold] Error Handling
```

Scaffolds have high Need and zero Confidence. The swarm fills them in.

---

## The Pulse

A pulse is one work cycle. During a pulse:

1. Scan all nodes. Find the highest-priority target: high Need, low Confidence, or high Conflict.
2. Build the context chain for that node (root → parent → ... → target).
3. Spawn Flash calls to work on it. Each call does exactly one thing (tactic: **Micro-Action Constraint**):
   - List sub-concerns for this node
   - Write one acceptance criterion
   - Write one example
   - Identify one risk
   - Propose one interface
   - Flag one contradiction with a neighbor

4. Write outputs as new child nodes or annotations on existing nodes.
5. Update signals.

Each Flash call sees only the context chain plus immediate neighbors (tactic: **Local Context Only**). This keeps the context window small enough for Flash to handle reliably.

### What a Single Call Looks Like

```
System: You are a specification worker. You will see a context chain
(a lineage of decisions from a high-level goal down to a specific concern)
and a task. Do EXACTLY the task. Produce ONLY the requested artifact.
Nothing else.

Context chain:
- Foundation: [compressed foundation principles]
- Goal: "Build a multiplayer word game for mobile"
- Branch: Multiplayer / Networking
- Sub-branch: Connection handling

Neighbors:
- [sibling] Matchmaking: "Players matched by skill rating, 2-4 players per game"
- [sibling] Latency requirements: "< 200ms round trip for word submission"

Task: Write one acceptance criterion for connection handling.

Output format:
CRITERION: [one sentence, testable]
EXAMPLE: [concrete scenario]
```

Flash can do this. The context is small. The task is atomic. The output is constrained.

---

## Coherence Without a Synthesizer

This is the hard part. Without a powerful model reading the whole workspace and smoothing contradictions, how do we ensure the spec hangs together?

Three mechanisms:

### 1. Context Chain Inheritance

Every node knows its full lineage. A decision made at the Platform level ("cross-platform with React Native") propagates downward because every child node sees it in its context chain. A node deep in the UI branch won't propose native iOS APIs because it knows the platform decision.

This handles vertical coherence—parent decisions constrain children.

### 2. Neighbor Verification

After a node stabilizes, a Flash call compares it to each sibling. The call sees both nodes and asks: "Are these consistent? Do they contradict? Do they depend on each other in ways neither acknowledges?"

```
System: You are a consistency checker. Compare these two sibling nodes
and report any contradiction, missing dependency, or implicit assumption
that should be made explicit.

Node A: [matchmaking node content]
Node B: [connection handling node content]

Output: CONSISTENT / CONTRADICTION / DEPENDENCY
If not consistent, explain in one sentence.
```

This handles horizontal coherence—siblings don't contradict each other.

### 3. Random Cross-Tree Pairing

Periodically, the system picks two leaf nodes from different branches of the tree and asks Flash to check consistency between them. The nodes might be "word validation rules" from the Gameplay branch and "API response format" from the Networking branch.

These random pairings catch the subtle integration failures that neighbor checking misses. A word validation rule might assume synchronous checking, while the networking spec assumes async. Neither node's immediate neighbors would catch this, but a cross-tree pairing would.

```
System: These two nodes come from different parts of the same spec.
Check whether they make compatible assumptions.

Node A (Gameplay > Word Validation): [content + context chain]
Node B (Networking > API Design): [content + context chain]

Output: COMPATIBLE / INCOMPATIBLE
If incompatible, explain in one sentence.
```

The number of random pairings scales with tree size. Not exhaustive—just enough to catch structural fractures. Tactic: **Competitive Overlay** applied to the spec itself.

---

## Signals and Behaviors

### Signal Set

| Signal | Meaning | Updated by |
|--------|---------|------------|
| **Need** | How important/blocking | Decreases as children are created |
| **Confidence** | How settled | Increases with evidence (examples, criteria, checks) |
| **Conflict** | Contradictions present | Set by neighbor/cross-tree checks |
| **Depth** | How deep in the tree | Structural, not computed |

### Behaviors Mapped to Tactics

| Behavior | Trigger | Tactic |
|----------|---------|--------|
| Decompose | Need high, Confidence low | Structural Scaffolds, Edge-Focused Growth |
| Reinforce | Same conclusion from multiple workers | Trace Reinforcement, Consensus by Accumulation |
| Inhibit | Node already has 3+ workers on it | Inhibitory Signals |
| Decay | No activity on node for N pulses | Trace Decay |
| Stabilize | Confidence ≥ 7, Conflict ≤ 2 | Threshold Triggers |
| Explore | Few nodes in region, low signal density | Phase Drift (explore mode) |
| Refine | Many nodes, high signal density | Phase Drift (exploit mode) |
| Verify | Node just stabilized | Read-Before-Write, Environment as Arbiter |
| Cross-check | Random periodic selection | Competitive Overlay |
| Entrench | Same path chosen repeatedly | Path Entrenchment |

### The Always-Integrated Property

There is no synthesis step (tactic: **No Roll-Up Rule**). The tree IS the spec. At any point you can walk the tree and read the spec as it currently stands. Nodes that have stabilized are trustworthy. Nodes still in flux are marked. Open questions are visible.

If someone needs a narrative document, a Flash call can serialize a subtree into prose. But this is a view, not a step. The tree doesn't change. The serialization is disposable. The tree is canonical.

---

## Architecture for Hierophage

### File Structure

```
.hierophage/stig/
├── workspace/
│   ├── root.md                    # User's goal + foundation context
│   ├── platform/
│   │   ├── _node.md               # This node's content + signals
│   │   ├── target-os/
│   │   │   └── _node.md
│   │   └── cross-platform-framework/
│   │       └── _node.md
│   ├── gameplay/
│   │   ├── _node.md
│   │   ├── word-validation/
│   │   │   └── _node.md
│   │   └── scoring/
│   │       └── _node.md
│   └── ...
├── config.json                    # Thresholds, model config, pulse settings
└── checks/                        # Cross-tree pairing results
    ├── check-001.md
    └── check-002.md
```

The directory structure IS the tree. No separate graph database. `_node.md` files contain content and frontmatter signals. The filesystem is the environment (tactic: **Environmental Memory**).

### Node Format

```yaml
---
need: 7
confidence: 3
conflict: 0
workers_active: 0
last_pulse: 2026-02-03T14:30:00Z
evidence:
  - acceptance-criteria: 2
  - examples: 1
  - risks: 0
---
# Cross-Platform Framework

React Native selected for cross-platform mobile development.

## Acceptance Criteria
1. Single codebase produces iOS and Android builds
2. Native performance for text rendering and input

## Examples
- Word input field with autocomplete uses native keyboard

## Open Questions
- Web support needed? (not in original goal, but low cost to add)
```

### Context Chain Assembly

When a worker needs to operate on a node, the system walks from root to that node, concatenating `_node.md` content:

```python
def build_context(node_path):
    chain = []
    current = root
    for segment in node_path.parts:
        chain.append(read(current / '_node.md'))
        current = current / segment
    chain.append(read(current / '_node.md'))
    return '\n---\n'.join(chain)
```

This is the node's full inherited context. It's what gets sent to Flash.

### CLI Commands

```bash
# Initialize workspace from a goal
hierophage stig init "Build a multiplayer word game for mobile"

# Run one pulse
hierophage stig pulse

# Run until stable (configurable max)
hierophage stig run --max-pulses 100

# Show tree with signal heatmap
hierophage stig status

# Show a specific node with its context chain
hierophage stig show gameplay/word-validation

# Run coherence checks (neighbor + random cross-tree)
hierophage stig check

# Serialize a subtree to readable markdown
hierophage stig read gameplay

# Override a signal manually
hierophage stig set gameplay/scoring confidence 8
```

### Model Configuration

```json
{
  "model": "gemini-2.5-flash",
  "max_concurrent_workers": 10,
  "workers_per_target": 3,
  "max_pulses": 100,
  "stability_threshold": {
    "need_max": 3,
    "confidence_min": 7,
    "conflict_max": 2
  },
  "cross_check": {
    "pairs_per_pulse": 2,
    "min_tree_depth": 3
  },
  "context_budget_tokens": 8000,
  "foundation_path": "docs/foundation.md"
}
```

One model. One tier. The constraint is the innovation.

---

## Worked Example: 6 Pulses

### Input

```bash
hierophage stig init "CLI tool that converts CSV files to formatted PDF reports"
```

### Pulse 0: Initialization

3 listers run in parallel. Each gets:
```
[foundation context]
Goal: "CLI tool that converts CSV files to formatted PDF reports"
Task: List the 5-8 top-level concerns needed to make this buildable and deployable.
```

Lister outputs:
```
A: CSV parsing, PDF generation, formatting/layout, CLI interface, error handling, testing
B: input validation, template system, output customization, CLI args, installation, docs
C: data parsing, report layout, styling, command interface, edge cases, packaging
```

System clusters overlaps, creates tree:
```
root: "CLI tool: CSV → PDF reports"
├── Input Handling (CSV parsing + validation)
├── Report Layout (formatting + templates)
├── PDF Generation (rendering engine)
├── CLI Interface (args, flags, help)
├── [scaffold] Error Handling
├── [scaffold] Testing
└── [scaffold] Packaging / Installation
```

All nodes: need:7, confidence:1.

### Pulse 1

Highest priority: Input Handling (need:7, confidence:1).

3 workers spawn:
- Worker A writes acceptance criterion: "Tool reads CSV with headers and produces one PDF page per data group"
- Worker B identifies sub-concern: "What delimiter? Comma only or configurable?"
- Worker C writes example: "invoice.csv with columns Date, Item, Amount → PDF grouped by Date"

New nodes created under Input Handling. Need drops to 5, confidence rises to 3.

### Pulse 2

Highest priority: Report Layout (need:7, confidence:1).

Workers produce:
- Acceptance: "User can specify which columns appear in the report"
- Sub-concern: "Built-in templates or user-defined?"
- Risk: "Complex layouts may exceed Flash's ability to reason about spatial positioning"

Need drops, confidence rises. Risk node created with need:6.

### Pulse 3

Two targets processed in parallel (independent branches):

**PDF Generation** — Workers identify library choice as key question. Three branches proposed: puppeteer/HTML-to-PDF, pdfkit direct, LaTeX compilation. Conflict:0 because these are branches, not contradictions.

**CLI Interface** — Workers produce acceptance criteria for basic args: `csv2pdf input.csv -o report.pdf --template invoice`

### Pulse 4: Neighbor Check

System runs neighbor verification between Input Handling and Report Layout.

Flash detects: Input Handling assumes "one PDF page per data group" but Report Layout hasn't defined what a "group" is. Dependency flagged. New node created: "Grouping Logic" under Input Handling, need:8.

### Pulse 5: Cross-Tree Check

Random pairing: "CLI Interface" leaf (expects `--template` flag) paired with "Report Layout" leaf (mentions "built-in templates or user-defined").

Flash detects: CLI assumes templates exist but Report Layout hasn't decided if templates are built-in, user files, or both. Conflict set on both nodes.

Next pulse will resolve this: worker proposes "templates are markdown files in ~/.csv2pdf/templates/, three built-in templates ship with install." Both nodes updated, conflict clears.

### After 6 Pulses

```
root: "CLI tool: CSV → PDF reports"
├── Input Handling          C:5 ✓
│   ├── CSV Parsing         C:7 ✓ stable
│   ├── Delimiter Config    C:6
│   └── Grouping Logic      C:3 ← needs work
├── Report Layout           C:4
│   ├── Template System     C:5 ← conflict just resolved
│   └── Column Selection    C:6
├── PDF Generation          C:2
│   ├── [branch] HTML→PDF   C:3
│   ├── [branch] pdfkit     C:2
│   └── [branch] LaTeX      C:1 ← losing, low reinforcement
├── CLI Interface           C:6
│   ├── Basic Args          C:7 ✓ stable
│   └── Template Flag       C:5 ← updated after cross-check
├── Error Handling          C:1 ← scaffold, untouched
├── Testing                 C:0 ← scaffold, untouched
└── Packaging               C:0 ← scaffold, untouched
```

The spec is already taking shape. No model saw the whole thing. Each Flash call saw at most 8K tokens of context chain plus one small task. Coherence emerged from structure.

---

## Why No Roll-Up

The traditional approach: many workers produce fragments, then a powerful model reads everything and writes a coherent document. This is the bottleneck we're eliminating.

Problems with roll-up:
- The synthesizer becomes a single point of failure
- Context window limits cap how much it can hold
- The synthesizer can silently drop or distort details from the fragments
- It's expensive
- It doesn't scale—doubling the spec size doesn't just double the cost, it breaks the approach entirely

Our approach: the tree is always readable. Walk any branch from root to leaves and you have a coherent narrative because each node was built with its parent chain in context. Coherence is structural, not imposed after the fact.

The tree doesn't need to be "compiled" into a spec. It IS the spec.

---

## Implementation Plan

### Phase 1: Prove the Tree

Build `stig init` and `stig status`. User manually creates nodes, manually runs Flash calls, manually updates signals. Validate that the tree structure with context chain inheritance produces coherent decomposition.

### Phase 2: Automate the Pulse

Build `stig pulse`. System selects target, assembles context chain, spawns Flash call, writes output as node, updates signals. Human reviews after each pulse.

### Phase 3: Coherence Checking

Build `stig check`. Neighbor verification and random cross-tree pairing. This is where we find out if Flash can reliably detect inconsistencies between nodes.

### Phase 4: Autonomous Runs

Build `stig run`. Loop pulses and checks until stability. Human reviews final tree, not intermediate steps.

### Phase 5: Parallelism

Multiple workers per pulse on independent branches. Job queue. Concurrent writes with conflict detection. This is where the speed advantage materializes.

---

## The Bet

No frontier model. No synthesis step. No roll-up. Just Flash, structure, and signals.

The bet is that intelligence doesn't have to be concentrated in one powerful call. It can be distributed across many small ones if:
- Each call gets the right context (parent chain)
- Each call does one small thing (micro-action)
- Coherence is checked structurally (neighbors + random cross-tree)
- The environment remembers what agents forget (the tree)
- Values travel through inheritance, not enforcement (foundation in the root)

If this works, specification becomes cheap, fast, and arbitrarily scalable. A spec that would take a senior engineer a week to write gets produced in minutes for pennies. Not because any single call is smart, but because the structure makes dumb calls collectively intelligent.

If it doesn't work, we'll know because the tree never stabilizes, or stabilizes on garbage, or the cross-tree checks find contradictions faster than they can be resolved.

We're going to find out.

---

*Document version: 3. Restructured around Flash-only constraint, tree architecture, and coherence-without-synthesis. Incorporates stigmergy tactics as operational primitives.*
