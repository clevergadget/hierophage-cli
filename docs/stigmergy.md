# Stigmergy: Specification Through Swarm Behavior

## What is Stigmergy?

Stigmergy is how ants build anthills without a foreman.

No ant knows the whole plan. No ant gives orders to other ants. Each ant leaves chemical traces (pheromones) as it works. Other ants respond to those traces. Drop food here, the trace strengthens. Avoid danger there, the trace fades. Over time, complex structures emerge from simple local rules.

The key insight: **coordination without communication**. The environment itself becomes the communication medium. Work leaves traces. Traces guide future work. No central plan required.

This document proposes using stigmergy for specification work. Instead of one person (or one AI) trying to hold an entire spec in their head, many small workers (cheap model calls) each contribute tiny pieces. Each piece leaves signals. Signals guide what happens next. The spec converges without anyone orchestrating it.

---

## The Problem We're Solving

You have a vague idea: "Build a Discord bot that checks in with me and gives me things to do."

Today's options:

1. **Single expensive model call**: Feed it everything, hope it produces something useful. Often produces verbose garbage. Context limits hit fast. No way to verify intermediate reasoning.

2. **Back-and-forth conversation**: Model asks clarifying questions, you answer, it refines. Works but requires your attention throughout. Doesn't parallelize.

3. **Manual decomposition**: You break it down yourself, assign pieces, integrate results. You become the bottleneck.

What we want: **Give it the vague request. Walk away. Come back to a usable spec.**

The spec should surface the ambiguities it found and the choices it made. You review decisions, not process. If something's wrong, you correct it and the system re-stabilizes.

---

## How Stigmergy Gets Us There

### The Workspace

A directory of markdown files. Each file is a **node**—a single claim, question, or decision. Nodes have **signals** in their frontmatter:

```yaml
---
type: outcome
need: 8
confidence: 2
conflict: 0
---
# Bot reaches out proactively

The bot should initiate contact, not wait for the user.

## Open questions
- What triggers a check-in?
- How often?
- What time of day?
```

Signals are numbers from 0-10:
- **Need**: How important/blocking is this? High need = attend to it.
- **Confidence**: How settled is this? Low confidence = decompose further.
- **Conflict**: Are there contradictions? High conflict = resolve before proceeding.

### The Pulse

A "pulse" is one work cycle. The system:

1. Scans all nodes, finds the highest-priority target (high need + low confidence, or high conflict)
2. Spawns cheap model calls to work on that node
3. Each call produces a small artifact: one acceptance criterion, one example, one question, one interface signature
4. Artifacts are written as new nodes or modifications to existing nodes
5. Signals update based on what was produced

Multiple pulses run until the workspace stabilizes (need drops, confidence rises, conflicts resolve).

### The Swarm

Parallelism comes from independence. If node A and node B don't depend on each other, workers can process them simultaneously. Each worker only sees the node it's working on plus its immediate neighbors.

Cheap models (Gemini Flash, GPT-4o-mini, Haiku) handle the bulk. They're good enough for "write one example" or "identify one risk." They're bad at holding large contexts or making judgment calls.

Expensive models (Gemini 3 Pro, Claude Opus, GPT-4) handle:
- Initial decomposition of the vague request
- Conflict resolution when cheap models disagree
- Final weaving of the spec into readable documents

Cost structure: 100 cheap calls + 3 expensive calls beats 10 expensive calls, both in price and output quality.

### Convergence

The workspace converges when:
- No node has need > 3 and confidence < 7
- No node has conflict > 2
- Every outcome has at least one acceptance criterion
- Every acceptance criterion has at least one example

At that point, the weaver runs: an expensive model reads the entire workspace and produces human-readable documents (SPEC.md, ACCEPTANCE.md, DECISIONS.md).

---

## Architecture for Hierophage

### File Structure

```
.hierophage/
├── stig/
│   ├── workspace/           # Node files live here
│   │   ├── outcome-001.md
│   │   ├── acceptance-001.md
│   │   ├── question-001.md
│   │   └── ...
│   ├── rollups/             # Weaver output
│   │   ├── SPEC.md
│   │   ├── ACCEPTANCE.md
│   │   └── DECISIONS.md
│   ├── config.json          # Model settings, thresholds
│   └── history/             # Past workspaces (for learning)
```

### Node Format

Each node is a markdown file with YAML frontmatter:

```yaml
---
id: outcome-001
type: outcome
created: 2026-02-02T14:30:00Z
modified: 2026-02-02T15:45:00Z
need: 8
confidence: 3
conflict: 0
links:
  - acceptance-001
  - acceptance-002
  - question-001
branches: []
evidence: []
---
# Bot reaches out proactively

The bot initiates contact at intervals relative to the user's wake time.

## Notes
- "Proactively" means the bot messages first, not responding to user input
- Timing should accommodate variable sleep schedules
```

### Signal Update Rules

Signals change based on what happens to a node:

| Event | Need | Confidence | Conflict |
|-------|------|------------|----------|
| Child node created | -1 | — | — |
| Example added | — | +2 | — |
| Acceptance criterion added | — | +1 | — |
| Test case linked | — | +2 | — |
| Contradicting node found | — | — | +3 |
| Contradiction resolved | — | +1 | -5 |
| Upstream dependency changed | — | -2 | — |

These are tunable. We start with these defaults and adjust based on what produces good specs.

### CLI Commands

```bash
# Initialize a workspace from a goal
hierophage stig init "A Discord bot that checks in and issues directives"

# Run one pulse (find target, spawn workers, update signals)
hierophage stig pulse

# Run until stable (max 50 pulses by default)
hierophage stig run

# Show current state (what needs attention, what's stable)
hierophage stig status

# Produce human-readable spec from workspace
hierophage stig weave

# Review a specific node
hierophage stig show outcome-001

# Manually adjust a signal (human override)
hierophage stig set outcome-001 confidence 8
```

### Model Dispatch

The system uses different models for different tasks:

| Task | Model | Why |
|------|-------|-----|
| Initial decomposition | Gemini 3 Pro | Needs to understand vague intent, produce coherent structure |
| Generate one example | Gemini Flash | Simple task, cheap, can run many in parallel |
| Generate one acceptance criterion | Gemini Flash | Same |
| Identify risks | Gemini Flash | Surface-level pattern matching |
| Detect conflicts | Gemini Flash | Compare two nodes, binary output |
| Resolve conflicts | Gemini 3 Pro | Requires judgment, context, foundation alignment |
| Weave final spec | Gemini 3 Pro | Needs to synthesize entire workspace coherently |

Model selection is configurable. The system should work with any provider that supports the Gemini/OpenAI-style API.

### Foundation Alignment Layer

Hierophage has values. The stigmergy system should produce specs that embody those values.

Before any artifact is committed, it passes through a foundation check:

```
Does this artifact:
- Assume trust is pre-established (no justification language)?
- Preserve grace over punishment?
- Keep uncertainty explicit rather than hiding it?
- Avoid premature commitment?
```

The check is a cheap model call with the foundation summary in context. Artifacts that fail get flagged for human review or expensive model revision.

This is how the swarm inherits the culture. Each worker carries a compressed version of the foundation. Divergent artifacts get caught.

---

## Worked Example: Speccing a Feature

### Input

User runs:
```bash
hierophage stig init "Add a command that lets users set daily reminders with custom messages"
```

### Initial Decomposition (Gemini 3 Pro)

The expensive model reads the goal and produces initial nodes:

```
workspace/
├── outcome-001.md    "Users can set daily reminders"
├── outcome-002.md    "Reminders have custom messages"
├── outcome-003.md    "Reminders trigger at specified times"
├── constraint-001.md "Must work within existing CLI architecture"
├── question-001.md   "Where is reminder state stored?"
├── question-002.md   "What happens if the CLI isn't running at reminder time?"
├── question-003.md   "Can users have multiple reminders?"
```

Initial signals: all outcomes have need:7, confidence:2. Questions have need:8, confidence:0.

### Pulse 1

System identifies question-001 as highest priority (need:8, confidence:0).

Spawns 3 cheap model workers in parallel, each proposing an answer:
- Worker A: "Store in ~/.hierophage/state/reminders.json"
- Worker B: "Store in SQLite database"
- Worker C: "Store in the existing user-profile.json"

Workers produce three branch nodes under question-001. Conflict detected (3 incompatible answers), conflict signal rises to 6.

### Pulse 2

System identifies question-001's conflict as highest priority.

Spawns expensive model to adjudicate:
- Reviews hierophage architecture (existing state uses JSON files)
- Reviews constraint-001 (must work within existing architecture)
- Decides: "Store in existing state directory as reminders.json, following pattern of user-profile.json"

Produces decision-001.md with rationale. Supersedes branches B and C. Conflict drops to 0, confidence rises to 7.

### Pulse 3-8

Cheap workers flesh out the outcomes:
- acceptance-001.md: "User can run `hierophage remind add '9am' 'Take medication'`"
- acceptance-002.md: "User can run `hierophage remind list` to see all reminders"
- acceptance-003.md: "User can run `hierophage remind remove <id>` to delete"
- example-001.md: Full CLI session showing add/list/remove flow
- interface-001.md: Data schema for reminders.json
- risk-001.md: "If CLI not running, reminder won't trigger—need daemon or cron"

### Pulse 9

Question-002 ("What if CLI isn't running?") still has need:8, confidence:2.

Cheap workers propose:
- Worker A: "Use system cron job"
- Worker B: "Run hierophage as daemon"
- Worker C: "Integrate with OS notification system"

Conflict rises. Expensive model adjudicates based on constraint-001 (existing architecture). Decides: "Use system cron, provide setup command `hierophage remind install-cron`"

### Stability Check

After 12 pulses:
- All outcomes have confidence ≥ 7
- All questions have decisions
- No conflicts above 2
- Each acceptance criterion has examples

System reports: "Workspace stable. Run `hierophage stig weave` to generate spec."

### Weave Output

SPEC.md:
```markdown
# Daily Reminders Feature

## Overview
Users can set daily reminders with custom messages. Reminders are stored
locally and trigger via system cron.

## Commands
- `hierophage remind add <time> <message>` — Create a reminder
- `hierophage remind list` — Show all reminders
- `hierophage remind remove <id>` — Delete a reminder
- `hierophage remind install-cron` — Set up system cron integration

## Data Storage
Reminders stored in ~/.hierophage/state/reminders.json following
existing state file patterns.

## Decisions Made
1. JSON storage over SQLite (consistency with existing architecture)
2. Cron-based triggering over daemon (simpler, no persistent process)

## Open Items
- [ ] Define notification mechanism when reminder triggers
- [ ] Decide behavior for past-due reminders on system wake
```

ACCEPTANCE.md lists all acceptance criteria with examples.
DECISIONS.md lists all decisions with full rationale.

---

## Why This Works

### Parallelism Without Chaos

Each worker sees only what it needs. No worker tries to hold the whole spec. Conflicts are detected structurally (two nodes claiming incompatible things) not semantically (hoping the model notices a contradiction in its own output).

### Cheap Where Possible, Expensive Where Necessary

The ratio should be ~20:1 cheap to expensive calls. Cheap models do volume work. Expensive models make judgment calls. This inverts the typical pattern of throwing expensive models at everything.

### Decisions Are Explicit

Every choice is recorded with rationale and alternatives considered. Six months later, you can see why the spec says what it says. If circumstances change, you know which decisions to revisit.

### Foundation Travels With the Swarm

Each worker carries the culture. The foundation alignment check means divergent outputs get caught before they pollute the workspace. The spec that emerges reflects hierophage values even though no single worker understood the whole thing.

---

## What We're Betting On

The bet: **swarm behavior can produce better specs than single-threaded reasoning, faster and cheaper.**

"Better" means:
- More complete (parallel workers find more edge cases)
- More consistent (conflicts are surfaced, not buried)
- More trustworthy (every claim has evidence or is marked uncertain)
- More aligned (foundation check on every artifact)

We'll know it works if specs produced this way lead to implementations with fewer surprises. We'll know it fails if the workspace never stabilizes, or stabilizes on garbage, or the overhead exceeds the value.

The only way to find out is to use it.

---

## Implementation Plan

### Phase 1: Manual Stigmergy

Before writing any code, use the concepts manually:
1. Create a workspace directory with markdown files
2. Add frontmatter signals by hand
3. Review signals, pick highest-priority node, write artifacts yourself
4. See if the decomposition/convergence logic produces useful structure

This validates the model before investing in tooling.

### Phase 2: CLI Scaffolding

Build the basic commands:
- `stig init` — parse goal, create initial nodes (can use AI or templates)
- `stig status` — read all nodes, compute priorities, display heatmap
- `stig weave` — concatenate nodes into readable spec (simple version: just cat them together with headers)

No AI in the loop yet. Human does the pulse work manually.

### Phase 3: AI-Assisted Pulses

Add `stig pulse`:
- Select target node based on signals
- Spawn model call(s) to produce artifacts
- Write artifacts as new nodes
- Update signals

Human reviews and commits after each pulse.

### Phase 4: Autonomous Runs

Add `stig run`:
- Loop pulses until stability threshold
- Human reviews final output, not intermediate steps

Add foundation alignment check on artifact commit.

### Phase 5: Parallel Execution

Spawn multiple workers per pulse on independent nodes. Add job queue, result aggregation, conflict detection across concurrent writes.

This is where the cost savings materialize.

---

## Open Questions (For Us to Decide)

1. **What model for initial decomposition?** Currently assuming Gemini 3 Pro. Could test with Claude Opus, GPT-4.

2. **How many cheap workers per pulse?** Starting guess: 3-5 per target node. Tune based on results.

3. **Stability thresholds?** Current proposal: need ≤ 3, confidence ≥ 7, conflict ≤ 2. These are guesses.

4. **Foundation alignment check—how strict?** Too strict and everything gets flagged. Too loose and culture doesn't propagate.

5. **History and learning?** Should past workspaces inform future decomposition? Could train a cheap model on successful specs.

---

## Connection to Hierophage Foundation

This system embodies foundation principles:

**Language as shared environment**: The workspace is language. Nodes are speech acts. Signals are the traces that shape future speech.

**Institution, not tool**: The workspace accumulates precedent, enforces norms (foundation check), maintains memory (history), and legitimizes claims (evidence requirement).

**Mercy over punishment**: Low confidence doesn't mean bad—it means "needs more work." Decomposition gives uncertainty room to resolve. Nothing is deleted for being wrong.

**Persuasion everywhere**: Signals route attention. The decomposition rules embed values about what matters. The foundation check ensures artifacts carry the culture.

**Play as substrate**: Small tasks, clear rules, visible progress. The heatmap cooling as the spec stabilizes is satisfying in the way games are satisfying.

The swarm doesn't replace judgment. It distributes judgment across many small acts, each locally sensible, collectively coherent. That's what institutions do. That's what we're building.

---

*Document version: 2. Expanded with architecture and worked example. Ready for review.*
