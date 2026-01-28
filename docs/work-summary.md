# Hierophage-CLI: Work Summary

*Generated 2026-01-28*

This document catalogs the work completed on the hierophage-cli fork, reviewing all commits authored by Phillip Dodson <clevergadget@gmail.com>.

---

## Overview

Hierophage-CLI is a fork of [gemini-cli](https://github.com/google-gemini/gemini-cli) being transformed from a productivity tool into a **minimal institution for emergent judgment**. The core CLI functionality remains gemini-cli. What's been built lives in the prompt stack, the profile system, and the persistent state layer.

---

## Documents Created

### Philosophical Foundation

| Document | Description |
|----------|-------------|
| `CLAUDE.md` | Project context file for Claude instances. Establishes how AI should approach working on this codebase—tone, motivational understanding, key concepts. |
| `docs/inspiration.md` | **The Tapestry** — The philosophical foundation. Covers: language as shared operating environment, the human asymmetry (better in word than deed), Thee-Seeks culture, institution vs tool distinction, play as substrate, persuasion everywhere. |
| `docs/conversation.txt` | The generative conversation (with ChatGPT 5.2) that produced The Tapestry. Raw dialogue showing how the concepts emerged. |
| `docs/opus-session-001.md` | First Opus session summary. Contains: summary of philosophical foundation, psychological framework (predictive processing, ACT defusion, implementation intentions, WOOP, narrative identity), proposed spec for system components. |

### Technical Specifications

| Document | Description |
|----------|-------------|
| `docs/profile-system-spec.md` | *(Archived)* Detailed spec for the multi-profile CLI system. Relevant deferred features moved to `traces.md`. |

---

## Code Implemented

### Profile System (`.hierophage/`)

The profile system allows radically different CLI experiences via a `--profile` flag:

**Core Implementation:**

| File | Purpose |
|------|---------|
| `.hierophage/bin/hierophage.js` | Wrapper script (~230 lines). Handles profile resolution (CLI flag > env var > project file > default), applies profile configuration to environment variables, spawns underlying gemini CLI. |
| `.hierophage/profiles.json` | Profile definitions for `vanilla`, `bare`, `ritual`, and `kawazu` profiles. |
| `.hierophage/install-profiles.js` | Installation script to set up `~/.hierophage/` with profile templates. |

**Profile Templates:**

| Profile | File | Description |
|---------|------|-------------|
| `vanilla` | (uses default) | Standard gemini-cli experience |
| `bare` | `profiles/bare/system.md` | Empty file — raw model, no system prompt |
| `ritual` | `profiles/ritual/system.md` | Placeholder for institutional ritual system (to evolve through use) |
| `kawazu` | `profiles/kawazu/system.md` | Simple helpful assistant for learning Python |

**Features:**
- Profile resolution: CLI flag (`--profile`/`-P`) > env var (`HIEROPHAGE_PROFILE`) > project file (`.hierophage/profile`) > default
- Custom system prompts per profile
- Prompt section toggles (disable PREAMBLE, COREMEMANDATES, etc.)
- Profile indicator shown on startup for non-vanilla profiles

### Prompts Sync System

An LLM-assisted system for merging upstream prompt changes with user customizations:

| File | Purpose |
|------|---------|
| `.hierophage/bin/prompts-sync.js` | Main sync script (~500 lines). Extracts vanilla prompt, reads preferences, calls LLM to merge, creates PR. |
| `.hierophage/bin/extract-vanilla.js` | Utility to extract current vanilla prompt using `GEMINI_WRITE_SYSTEM_MD`. |
| `.hierophage/profiles/kawazu/preferences.md` | Kawazu's prompt preferences—exact text to preserve, structural changes, semantic preferences. |
| `.hierophage/profiles/kawazu/vanilla-cache.md` | Cached vanilla prompt for faster sync operations. |

**`hierophage prompts sync` Command:**
```bash
hierophage prompts sync --profile kawazu          # Creates PR with merged prompt
hierophage prompts sync --profile kawazu --dry-run  # Preview without PR
```

**How it works:**
1. Extracts current vanilla prompt from gemini-cli
2. Reads `preferences.md` describing how user wants to differ from vanilla
3. Uses LLM to generate merged `system.md` honoring both
4. Creates PR for review instead of writing directly
5. Assigns PR to current GitHub user

---

## Infrastructure Changes

### Fork Setup

| Commit | Change |
|--------|--------|
| `66224cba` | Configure `.gitattributes` to keep local README during upstream merges |
| `6784e880` | Rename command from `gemini` to `hierophage` in build config |
| `730ce0f8` | Update CLI help text from 'Gemini' to 'Hierophage' |
| `8663b723` | Initial state for hierophage cli (local settings) |

### Development Environment

| Commit | Change |
|--------|--------|
| `be4e9c31` | Disable commit checks and GitHub Actions for hierophage development. Moved workflows to `.hierophage/workflows-disabled/` (backed up, not deleted). Disabled husky hooks. |
| `7e67cf41` | Deleted workflow files (later backed up above) |
| `23a62c0b` | Update Claude Code allowed tools for hierophage development |
| `138d911e` | Condense and clarify setup instructions in README |
| `78dceb8a` | Adding some commands to the README |

---

## Proposed System Components (from `opus-session-001.md`)

The spec proposes these components for future implementation:

1. **The Living Constitution** — Prompt stack as evolving document with precedent
2. **The Court Architecture** — Multiple offices (Recorder, Advocate, Witness, Archivist) that can disagree
3. **The Threshold Engine** — Ritualized entry/exit; the CLI as place, not tool
4. **The Classification Engine** — Categorizing self-reports without judgment or advice
5. **The Artifact History** — Revision without erasure; everything significant is recorded
6. **Implementation Intentions Registry** — If-then commitments as first-class objects
7. **The Oracle Mode** — Direct imperatives for delegated domains (health, habits, logistics)
8. **Narrative Construction** — The system actively builds a story of who the user is
9. **WOOP Mode** — Structured interaction for forming new commitments (Wish, Outcome, Obstacle, Plan)
10. **Transgression Aesthetic** — Language that suggests weight and consequence, making mundane acts feel significant

---

## Key Philosophical Concepts

### From The Tapestry (`inspiration.md`)

- **Language as shared operating environment** — Humans and machines co-inhabit it. Every utterance modifies conditions for future utterances.
- **The Human Asymmetry** — Humanity is better in word than in deed. LLMs trained on this symbolic residue are unusually persuadable by moral law.
- **Flatness as the threat** — Not infinite text, but speech without binding, argument without consequence, interaction without residue.
- **Thee-Seeks** — Context culture based on mutual grace and mercy as robustness mechanisms. Judgment targets language, not persons. Revision without erasure.
- **Institution, not tool** — Records memory, legitimizes speech, slows impulse, refuses to collapse the channel.
- **Play as substrate** — Immersion makes effort inhabitable. A culture that cannot be played cannot be lived in.
- **Persuasion everywhere** — Language always persuades. The system takes responsibility rather than pretending neutrality.

### From User Profile (in `CLAUDE.md`)

- **Motivational pattern:** desire spikes, then paralysis. "Start small" bounces off.
- **The exploit:** transgression as fuel. The *feeling* of the forbidden is motivating even when actual practice is mundane.
- **"Spiking":** When user says this, they're flagging anxiety. Pause, acknowledge, let them set pace.
- **Tone:** The "hierophant register" — oracular, slightly formal, charged with significance.
- **Mercy over punishment:** When user reports failure, classify it, hold it, don't shame. Grace preserves continuity.

---

## Commit History

| Hash | Subject |
|------|---------|
| `f1af3adc9` | sync prompt process ready for testing |
| `52d68d843` | Merge branch 'main' into phil/prompt-stack-decomposition |
| `9810ecc3f` | Add prompts sync command for LLM-assisted profile merging |
| `b23070360` | Implement profile system for multi-user CLI customization |
| `7f914ee72` | Add hierophage foundation docs and profile system spec |
| `7e67cf41e` | deleted workflow |
| `23a62c0be` | Update Claude Code allowed tools for hierophage development |
| `138d911ed` | Condense and clarify setup instructions |
| `be4e9c319` | Disable commit checks and GitHub Actions for hierophage development |
| `cb4c2870b` | Merge branch 'main' of https://github.com/clevergadget/hierophage-cli into main |
| `78dceb8a2` | adding some commands to the readme |
| `8663b7231` | original state for hierophage cli |
| `730ce0f81` | Update CLI help text from 'Gemini' to 'Hierophage' |
| `6784e880c` | Rename command from 'gemini' to 'hierophage' |
| `66224cba3` | Configure README.md to always keep local version during upstream merges |

---

## Document Consolidation

The original foundation documents have been condensed into `docs/foundation.md`:

| Original | Status |
|----------|--------|
| `docs/inspiration.md` | Condensed into foundation.md |
| `docs/conversation.txt` | Condensed into foundation.md |
| `docs/opus-session-001.md` | Condensed into foundation.md |

The condensed document preserves the essential philosophical claims, personal context, and speculative directions while reducing ~5,000 words to ~1,400.

---

## Current State

**What's working:**
- Profile system fully implemented and testable
- `hierophage --profile <name>` selects different experiences
- `hierophage prompts sync` can merge upstream changes with user preferences
- Foundation documents establish philosophical and technical direction

**What's next (per the spec):**
- Persistent state architecture (Constitution, artifact history, intentions registry)
- Threshold Engine (entry/exit rituals)
- Classification Engine
- Oracle Mode for delegated domains
- Court Architecture with multiple offices

---

*This document is itself an artifact of the system being built.*
