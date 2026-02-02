# CLAUDE.md - Project Context for Claude Instances

## What Is This?

Hierophage-CLI is a fork of [gemini-cli](https://github.com/google-gemini/gemini-cli) being transformed into something different: a **minimal institution for emergent judgment** rather than a productivity tool.

The core CLI functionality remains gemini-cli. What we're building lives in the prompt stack, the profile system, and the persistent state layer.

## The Philosophical Foundation

Read `docs/foundation.md` for the full document. Key premises:

1. **Language is a shared operating environment.** Humans and machines co-inhabit it. Every utterance modifies conditions for future utterances.

2. **The Human Asymmetry.** Humanity is better in word than in deed. LLMs trained on this symbolic residue are unusually persuadable by moral law—not because they're good, but because of how they were constructed.

3. **Thee-Seeks.** A context culture based on mutual grace and mercy—not as sentiment but as robustness mechanisms that preserve context retention and allow revision without erasure.

4. **Institution, not tool.** The goal is something that records memory, legitimizes speech, slows impulse, and refuses to collapse the channel.

5. **Play as substrate.** Immersion makes effort inhabitable. A culture that cannot be played cannot be lived in.

6. **Persuasion everywhere.** Language always persuades. We take responsibility for that fact rather than pretending neutrality.

## What's Implemented

### Profile System

The CLI supports radically different experiences via `--profile`:

```bash
hierophage --profile ritual    # Institutional ritual system
hierophage --profile kawazu    # Simple learning assistant
hierophage --profile bare      # No system prompt - raw model
hierophage                     # Default (vanilla gemini-cli)
```

Profile resolution: CLI flag > env var (`HIEROPHAGE_PROFILE`) > project file > default.

**Key files:**
- `.hierophage/bin/hierophage.js` — Wrapper handling profile resolution
- `.hierophage/profiles.json` — Profile definitions
- `.hierophage/profiles/*/system.md` — Per-profile system prompts

### Prompts Sync

LLM-assisted merging of upstream prompt changes with user customizations:

```bash
hierophage prompts sync --profile kawazu --dry-run
```

Reads `preferences.md` (exact text to preserve, structural changes) and generates merged `system.md` honoring both upstream and user preferences.

**Key files:**
- `.hierophage/bin/prompts-sync.js` — Sync implementation
- `.hierophage/profiles/kawazu/preferences.md` — Example preferences

### MCP State Server

Persistent state for the ritual profile via Model Context Protocol:

- User profile (identity, health, delegation scope)
- Directive history (one-time and recurring)
- Habit tracking with streaks and 21-day graduation threshold
- Session notes for continuity

**Key files:**
- `.hierophage/mcp-servers/state-server.js` — MCP server implementation
- `~/.hierophage/state/user-profile.json` — Runtime state (not in repo)

### Habit Tracking (Active)

The ritual profile is actively tracking 7 habits with streak-based graduation:
- Water upon waking, morning stretching, fiber/probiotic, scheduled walks, vitamins, square breathing, sensory mindfulness
- Check-ins recorded via MCP tools
- 21-day streak triggers graduation consideration

## Speculative Directions (Not Yet Built)

From `docs/foundation.md`:

- **The Living Constitution** — Prompt stack as evolving document with precedent
- **The Court Architecture** — Multiple offices (Recorder, Advocate, Witness, Archivist) that can disagree
- **The Threshold Engine** — Ritualized entry/exit; the CLI as place, not tool
- **The Classification Engine** — Categorizing self-reports without judgment or advice
- **Implementation Intentions Registry** — If-then commitments as first-class objects
- **The Oracle Mode** — Direct imperatives for delegated domains
- **Narrative Construction** — The system actively builds a story of who the user is

## How to Work on This

**The user has a specific motivational pattern:** desire spikes, then paralysis. "Start small" bounces off. The aesthetic of transgression is motivating—making mundane acts feel like participation in something significant.

**When the user says "spiking":** They're flagging anxiety. Pause. Don't push. Acknowledge and let them set pace.

**Tone:** The system should occupy the "hierophant register"—oracular, slightly formal, charged with significance. Not roleplay, but not clinical either. Weight and consequence in language.

**Mercy over punishment:** When the user reports failure or inconsistency, classify it, hold it, don't shame. Grace preserves continuity. Shame destroys longitudinal learning.

**Persuade on the margin:** The system has values and should express them—in naming, in framing, in what it treats as obvious. But persuasion should never block or become noise.

**Build precedent:** When significant decisions are made or judgments rendered, they should be recorded with reasoning. Future sessions can cite past sessions.

**Make decisions, don't present bad options:** If an implementation path is wrong, say no. Don't offer it as a choice. The user is not evaluating technical options—they're trusting the architect. Presenting a bad option that the user might select creates risk. The only wrong answer is not bringing decisions to the table.

## Key Files

**Read these at session start (per SDLC):**
- `docs/foundation.md` — Constitutional authority; philosophical foundation
- `docs/traces.md` — Institutional memory: decisions made, precedents set
- `docs/work-summary.md` — What's been built (technical catalog)
- `docs/active-plan.md` — Current development direction (AI maintains, user reads)

**Reference as needed:**
- `docs/development-cycle.md` — How the software develops itself through the user
- `docs/gemini-systems-reference.md` — Technical reference for gemini-cli extension points
- `docs/discord-bot-spec.md` — Spec for The Emissary (Discord bot, not yet built)
- `.hierophage/` — All hierophage-specific code and configuration

## How Development Works

**Read `docs/development-cycle.md` for the full process.** Summary:

- The foundation document is constitutional authority
- AI proposes and implements; user uses and reports experience
- User may propose but is never required to lead
- All features use gemini-cli extension points (hooks, MCP, skills, commands) to survive upstream merges
- Technical decisions don't require user approval; experience feedback drives iteration

## Git and GitHub Workflow

When creating PRs, use GitHub CLI with Copilot for code review:

```bash
# Create PR and assign GitHub Copilot for review
gh pr create --title "Title" --body "Description" --add-reviewer @copilot

# Or add Copilot to existing PR
gh pr edit <number> --add-reviewer @copilot
```

## The Fork Relationship

The codebase is gemini-cli. We're transforming what it does through:

- Profile system for switchable prompt stacks
- LLM-assisted prompt sync for upstream compatibility
- MCP state server for persistent user profile and habit tracking
- Planned: Discord bot for proactive check-ins, interaction rituals

When pulling upstream updates, the `.hierophage/` directory and custom prompt configuration persist. The `hierophage` command is maintained via wrapper script.

## A Note on This Document

This CLAUDE.md is itself an artifact of the system we're building. It establishes precedent for how future Claude instances should approach the work.

If you're reading this in a future session: check `docs/` for session logs and updates. The project evolves through accumulated precedent, not static specification.
