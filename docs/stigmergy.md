# Stigmergy: Collective Judgment Through Traces

*How many minds converge on specification without direct coordination.*

---

## Why This Matters to Hierophage

The foundation establishes that language is a shared operating environment. Every utterance modifies conditions for future utterances. Speech leaves traces. Traces shape what comes next.

Stigmergy is this principle operationalized for specification work.

The problem: turning an underspecified goal into a trustworthy spec is hard. Single-threaded reasoning (one model, one context window) hits limits. Parallelizing naively produces incoherence. Expensive models with long contexts produce expensive garbage as often as expensive gold.

The insight: ants build cathedrals without architects. They leave pheromones. Other ants respond to the pheromone landscape. No central plan. No direct communication. Coordination emerges from accumulated traces in a shared environment.

We can do this with specification artifacts. Many small contributions, each leaving traces (signals), each responding to the trace landscape. Convergence emerges. The spec stabilizes not because someone declared it done, but because the signals indicate stability.

This is institution-building at the artifact level. The workspace becomes something that records memory, legitimizes speech through evidence, slows impulse through decomposition, and refuses to collapse the channel by keeping uncertainty explicit.

---

## The Connection to Foundation Principles

### Language as Shared Operating Environment

The workspace IS language. Every node is a speech act: a claim, a constraint, a question, a decision. The signals attached to nodes are the "conditions for future utterances" that each utterance creates. High Need attracts attention. High Conflict demands reconciliation. High Confidence permits building upon.

The workspace is not a database. It is a linguistic ecosystem.

### Institution, Not Tool

A tool processes input and produces output. An institution accumulates precedent, maintains memory, enforces norms, and shapes behavior over time.

The stigmergic workspace is an institution:
- **Records memory**: Every artifact persists. Provenance is tracked.
- **Legitimizes speech**: Confidence requires evidence. Claims without backing remain provisional.
- **Slows impulse**: Decomposition rules prevent premature commitment. Uncertainty must be acknowledged before it can be resolved.
- **Refuses to collapse the channel**: Open questions remain visible. Branches coexist until evidence favors one.

### Mercy Over Punishment

When a node has low confidence or high conflict, the system does not punish it. It does not delete it or hide it or shame the contributor. It decomposes it—gives it room to breathe, creates space for the uncertainty to resolve through smaller, more tractable claims.

Revision without erasure. The history of what was believed and why remains visible. Grace preserves continuity.

### The Human Asymmetry

Humanity is better in word than in deed. Specs are words. Implementations are deeds. The gap between a spec and working software is the human asymmetry manifested.

This system addresses the gap by making the spec itself more rigorous. Not through bureaucracy, but through evidence accumulation. A spec backed by examples, acceptance criteria, interface contracts, and test cases is closer to deed than a spec that is just words.

The goal is not to produce more words. The goal is to produce words that bind—words with consequence, words that constrain implementation, words that can be verified.

### Persuasion Everywhere

Every artifact in the workspace is persuasion. A well-written acceptance criterion persuades toward a particular implementation. A risk note persuades toward caution. A decision record persuades future contributors to respect the choice or explicitly overturn it.

The signals themselves are persuasion. High Need says: attend to me. High Conflict says: resolve me before proceeding. Low Volatility says: trust me, I have stabilized.

The system does not pretend neutrality. It routes attention. It shapes behavior. It has values embedded in its decomposition and convergence rules.

### Play as Substrate

Microtasks are moves in a game. The rules are clear: reference one node, produce one artifact, attach one verification hook, update signals. The progress is visible: Need decreases, Confidence increases, the heatmap cools.

Small, achievable moves. Visible progress. Clear feedback. This is play—effort made inhabitable through structure and feedback.

A specification process that feels like drudgery will not be used. A specification process that feels like a game—with levels (decomposition depth), scores (signal values), and completion states (stabilization)—invites return.

---

## The Workspace

### Nodes

A node is a unit of specification. Types:

| Type | Purpose |
|------|---------|
| **Outcome** | What the system should achieve (user-facing) |
| **Acceptance** | How we know an outcome is met (testable) |
| **Interface** | Contract between components (signatures, invariants) |
| **Constraint** | Limitation or requirement that bounds solutions |
| **Decision** | A choice made, with rationale and alternatives |
| **Risk** | Something that could go wrong, with mitigation |
| **Question** | An explicit unknown requiring resolution |
| **Example** | A concrete instance illustrating behavior |

Nodes link to each other. An Outcome links to its Acceptance criteria. An Interface links to its Constraints. A Decision links to the Question it resolved.

### Signals

Signals are traffic signs, not truth. They route attention.

| Signal | Meaning | Range |
|--------|---------|-------|
| **Need (N)** | How blocked/impactful if unresolved | 0-10 |
| **Confidence (C)** | How settled/trustworthy | 0-10 |
| **Conflict (K)** | Whether contradictions exist | 0-10 |
| **Volatility (V)** | How frequently changing | 0-10 |

**Rule**: Confidence cannot increase without evidence. Adding an example, a test case, a verification hook—these increase Confidence. Assertion alone does not.

### Branches

When uncertainty is high, a node may carry multiple branches—alternative interpretations or solutions that coexist until evidence favors one.

Branches are not failure. They are honesty. Premature commitment is the failure mode this prevents.

Branch collapse is a Decision. It must be logged with rationale.

---

## System Behaviors

### Decomposition (When to Split)

A node should decompose when:
- Need is high AND Confidence is low (important but uncertain)
- Conflict is high (contradictory claims need untangling)
- Volatility is high (churn indicates missing structure)
- Many dependents exist but the node remains vague

Decomposition creates tighter claims:
- Outcome → Acceptance criteria + Examples
- Decision → Options + Evaluation criteria + Choice rationale
- Risk → Spike plan + Expected learning + Stop condition
- Interface → Signature + Invariants + Error cases

### Convergence (When to Stop)

A node is stable when:
- Confidence is high (≥7)
- Conflict is low (≤2)
- At least one verification hook exists
- Volatility is low over a defined window

Stabilization is not immutable. It establishes "current best understanding" with hooks for revalidation if upstream changes.

### Conflict Handling

When artifacts contradict:
1. Do not average or smooth over
2. Increase Conflict signal
3. Generate a reconciliation task:
   - Identify the conflict surface
   - Propose resolution paths
   - Require explicit Decision if a choice is made

Conflict is information. It means the problem space has structure we haven't captured yet.

### Evaporation

Confidence decays when:
- Upstream dependencies change
- Time-based assumptions expire
- Related nodes exhibit high volatility

This prevents false stability—nodes that feel settled but are actually stale.

### Weaving

Periodic consolidation produces human-readable documents:
- `SPEC.md` — Narrative specification
- `ACCEPTANCE.md` — Testable criteria with examples
- `DECISIONS.md` — ADR-style decision records
- `RISKS.md` — Known risks and mitigations
- `OPEN.md` — Unresolved questions and active branches

Weaving is not micromanagement. It is the system explaining itself.

---

## Concrete Example: Speccing "The Emissary"

Suppose we use this system to spec the Discord bot before building it.

### Initial Goal (User Input)

> "A Discord bot that extends the ritual profile. It should reach out proactively, ask what's happening, and issue directives based on context."

### First Pass: Top-Level Nodes

The system ingests this and produces initial nodes:

```
[Outcome:001] Bot reaches out proactively
  N:8 C:2 K:0 V:0
  Links: none yet
  Branches: none
  Notes: "proactively" is vague—when? how often? what triggers?

[Outcome:002] Bot asks what's happening
  N:6 C:4 K:0 V:0
  Links: none yet
  Notes: straightforward, but format/tone undefined

[Outcome:003] Bot issues directives based on context
  N:9 C:1 K:0 V:0
  Links: none yet
  Notes: "context" is vague—what context? how used?

[Constraint:001] Must align with foundation principles
  N:7 C:8 K:0 V:0
  Links: Outcome:001, Outcome:002, Outcome:003
  Notes: foundation.md is canonical reference
```

### Decomposition Pass

Outcome:001 has high Need (8) and low Confidence (2). Decompose:

```
[Outcome:001] Bot reaches out proactively
  Status: decomposed into children

  [Question:001] What triggers a proactive check-in?
    N:8 C:0 K:0 V:0
    Branches:
      A: Fixed schedule (9am, 3pm, 9pm)
      B: Anchor-relative (30-90 min after wake)
      C: User-defined windows
    Notes: Branch B aligns with ADHD support in foundation

  [Acceptance:001] Check-in timing is relative to wake anchor
    N:7 C:3 K:0 V:0
    Links: Question:001 (implements Branch B)
    Example: "If wake at 10:32am, first check-in 11:02-12:02am"

  [Constraint:002] No shame for missed check-ins
    N:6 C:9 K:0 V:0
    Links: Constraint:001
    Notes: directly from foundation—grace preserves continuity
```

### Conflict Example

Suppose two contributors produce contradictory acceptance criteria:

```
[Acceptance:003a] Bot should explain why it's issuing a directive
  N:5 C:4 K:0 V:0
  Evidence: "users need to understand rationale"

[Acceptance:003b] Bot should NOT explain directives
  N:7 C:6 K:0 V:0
  Evidence: "foundation says no justification—trust is pre-established"
```

System detects contradiction, sets K:8 on both, generates:

```
[Question:002] Should directives include explanation?
  N:9 C:0 K:8 V:0
  Links: Acceptance:003a, Acceptance:003b
  Resolution needed: check foundation.md

[Decision:001] Directives do not include explanation
  N:0 C:9 K:0 V:0
  Links: Question:002
  Rationale: Foundation §"The Epistemic Model" explicitly states
    "No justification. No encouragement. No persuasion in the moment."
  Alternatives considered: Acceptance:003a
  What would change this: User explicitly requests explanation mode
```

Acceptance:003a is marked superseded. Acceptance:003b becomes canonical.

### Stabilization

After several passes, Outcome:003 looks like:

```
[Outcome:003] Bot issues directives based on context
  N:2 C:8 K:0 V:1
  Status: stable
  Children:
    [Acceptance:005] Directive is single, concrete action (C:9)
    [Acceptance:006] Directive matches user energy level (C:7)
    [Acceptance:007] Failure classification uses foundation categories (C:9)
    [Interface:001] System prompt template with context slots (C:8)
    [Example:001] "User: just woke up, groggy → Directive: drink water" (C:9)
    [Example:002] "User: staring at screen → Directive: stand, walk" (C:9)
  Verification: Examples map to test cases in test/emissary.test.js
```

### Weave Output

The weaver produces `SPEC.md`:

```markdown
# The Emissary: Discord Bot Specification

## Overview
The Emissary extends the Hierophage ritual profile to Discord DMs...

## Proactive Check-Ins
Check-ins are scheduled relative to the wake anchor, not fixed times.
This accommodates variable schedules (ADHD support per foundation).

Window: 30-90 minutes after wake anchor reported.
Randomization: Time is randomized within window to avoid predictability.

## Directive Issuance
Directives are:
- Single, concrete actions
- Matched to user's reported energy level
- Issued without explanation (trust is pre-established)

When user reports failure, classify using foundation categories:
fear, fatigue, ambiguity, resentment, misalignment, incoherence.

## Decisions Made
- [Decision:001] No explanation with directives (foundation alignment)
- [Decision:002] Anchor-relative timing over fixed schedule (ADHD support)
```

---

## Implementation Path

This system can be built incrementally:

**Phase 0: Manual**
Use the concepts with manual markdown files. No tooling. Validate that the decomposition/convergence logic produces useful specs.

**Phase 1: CLI Scaffolding**
`hierophage stig init` — create workspace structure
`hierophage stig status` — show signal heatmap
`hierophage stig weave` — produce roll-up documents

**Phase 2: AI-Assisted Microtasks**
`hierophage stig pulse` — select highest-Need node, generate candidate artifacts, update signals. Human reviews and commits.

**Phase 3: Parallel Execution**
Multiple cheap model calls generate candidates. Verification layer (consistency checks, foundation alignment) filters. Expensive model adjudicates conflicts.

**Phase 4: Autonomous Stabilization**
System runs until stability thresholds met. Human reviews final spec and open questions.

---

## What This Is Not

This is not a replacement for thinking. It is a structure for thinking at scale.

This is not autonomous spec generation. Human intent remains sovereign. The system proposes; humans commit.

This is not bureaucracy. The microtask protocol exists to enable parallelism and verification, not to create paperwork. If it feels like paperwork, it's being used wrong.

---

## The Bet

The bet is this: specification work can be parallelized across many small contributors (human or AI) if coordination happens through artifacts and signals rather than through direct communication.

The workspace becomes a shared mind—not a hive mind that subsumes individuals, but a collective judgment that emerges from accumulated traces.

If this works, it means:
- Specs can be produced faster (parallelism)
- Specs can be produced cheaper (small models for microtasks, big models for adjudication)
- Specs are more trustworthy (evidence-backed, conflict-surfaced, uncertainty-explicit)
- The process embodies hierophage values (grace, precedent, persuasion, play)

If this fails, we will know because the workspace becomes chaotic instead of convergent, or the overhead exceeds the value, or the specs produced are no better than single-threaded reasoning.

We will find out by using it.

---

*This document is itself an artifact in the hierophage workspace. Its signals: N:7, C:4, K:2, V:3. It awaits evidence.*
