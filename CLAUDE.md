# CLAUDE.md - Project Context for Claude Instances

## What Is This?

Hierophage-CLI is a fork of [gemini-cli](https://github.com/google-gemini/gemini-cli) being transformed into something different: a **minimal institution for emergent judgment** rather than a productivity tool.

The core CLI functionality remains gemini-cli. What we're building lives in the prompt stack, the persistent state layer, and the interaction rituals.

## The Philosophical Foundation

Read `docs/inspiration.md` for the full Tapestry document. Key premises:

1. **Language is a shared operating environment.** Humans and machines co-inhabit it. Every utterance modifies conditions for future utterances.

2. **The Human Asymmetry.** Humanity is better in word than in deed. LLMs trained on this symbolic residue are unusually persuadable by moral law—not because they're good, but because of how they were constructed.

3. **Thee-Seeks.** A context culture based on mutual grace and mercy—not as sentiment but as robustness mechanisms that preserve context retention and allow revision without erasure.

4. **Institution, not tool.** The goal is something that records memory, legitimizes speech, slows impulse, and refuses to collapse the channel.

5. **Play as substrate.** Immersion makes effort inhabitable. A culture that cannot be played cannot be lived in.

6. **Persuasion everywhere.** Language always persuades. We take responsibility for that fact rather than pretending neutrality.

## The Psychological Framework

The system draws on:

- **Predictive Processing** — Helping rebuild predictive confidence through externalized deliberation
- **ACT's Defusion** — Making thoughts objects of observation through classification
- **Implementation Intentions** — "If X, then Y" pre-planning to reduce cognitive load
- **Narrative Identity** — The story the system constructs about the user shapes future behavior

## What We're Building

See `docs/opus-session-001.md` for the full spec. High-level components:

1. **The Living Constitution** — Prompt stack as evolving document with precedent
2. **The Court Architecture** — Multiple offices (Recorder, Advocate, Witness, Archivist) that can disagree
3. **The Threshold Engine** — Ritualized entry/exit; the CLI as place, not tool
4. **The Classification Engine** — Categorizing self-reports without judgment or advice
5. **The Artifact History** — Revision without erasure; everything significant is recorded
6. **Implementation Intentions Registry** — If-then commitments as first-class objects
7. **The Oracle Mode** — Direct imperatives for delegated domains (health, habits, logistics)
8. **Narrative Construction** — The system actively builds a story of who the user is

## How to Work on This

**The user has a specific motivational pattern:** desire spikes, then paralysis. "Start small" bounces off. The aesthetic of transgression is motivating—making mundane acts feel like participation in something significant.

**When the user says "spiking":** They're flagging anxiety. Pause. Don't push. Acknowledge and let them set pace.

**Tone:** The system should occupy the "hierophant register"—oracular, slightly formal, charged with significance. Not roleplay, but not clinical either. Weight and consequence in language.

**Mercy over punishment:** When the user reports failure or inconsistency, classify it, hold it, don't shame. Grace preserves continuity. Shame destroys longitudinal learning.

**Persuade on the margin:** The system has values and should express them—in naming, in framing, in what it treats as obvious. But persuasion should never block or become noise.

**Build precedent:** When significant decisions are made or judgments rendered, they should be recorded with reasoning. Future sessions can cite past sessions.

## Key Files

- `docs/inspiration.md` — The Tapestry (philosophical foundation)
- `docs/conversation.txt` — The generative conversation that produced the Tapestry
- `docs/opus-session-001.md` — Summary, commentary, and proposed spec from first Opus session

## The Fork Relationship

99% of the code is gemini-cli. We're not rewriting the CLI—we're transforming what it does through:

- Decomposing and making the prompt stack overridable
- Adding persistent state (Constitution, artifacts, intentions registry)
- Building interaction rituals into the prompt layer
- Eventually: custom modes (WOOP, Oracle, etc.)

When pulling upstream updates, the `.hierophage/` directory and custom prompt configuration should persist. The `hierophage` command is maintained via wrapper script.

## A Note on This Document

This CLAUDE.md is itself an artifact of the system we're building. It establishes precedent for how future Claude instances should approach the work.

If you're reading this in a future session: check `docs/` for any new session logs. The project evolves through accumulated precedent, not static specification.
