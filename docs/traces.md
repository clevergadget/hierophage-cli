# Traces

*Institutional memory. Decisions made, directions noted, work deferred.*

This document holds what needs to survive between sessions until we have a proper artifact history system.

---

## Deferred Profile Features

From the original profile spec, not yet implemented:

### Extension Enable/Disable

Profiles should be able to specify extensions to activate:

```json
{
  "ritual": {
    "extensions": {
      "enable": ["hierophage-core"],
      "disable": ["*"]
    }
  }
}
```

**Implementation path:** Wrapper could call `hierophage extensions enable/disable` or directly manipulate `~/.gemini-cli/extensions/*/enabled.json`.

### Settings Overrides

Profiles should merge settings at runtime:

```json
{
  "kawazu": {
    "settings": {
      "approvalMode": "auto_edit",
      "model": "gemini-2.0-flash"
    }
  }
}
```

**Implementation path:** Write temp settings file, or pass via env vars (limited), or contribute upstream.

### Profile-Bundled Hooks

The big one for ritual system. Profiles should bundle hooks:

```json
{
  "ritual": {
    "hooks": {
      "SessionStart": [{
        "command": "~/.hierophage/hooks/threshold-entry.sh",
        "description": "Entry ritual - acknowledge arrival"
      }],
      "SessionEnd": [{
        "command": "~/.hierophage/hooks/threshold-exit.sh",
        "description": "Exit ritual - summarize, note commitments"
      }],
      "AfterAgent": [{
        "command": "~/.hierophage/hooks/log-artifact.sh",
        "description": "Record to sediment layer"
      }]
    }
  }
}
```

**Implementation path:** Each profile becomes an extension that bundles hooks, context files, tool exclusions. This may be cleanest—uses existing infrastructure.

### Profile Inheritance

```json
{
  "kawazu-strict": {
    "extends": "kawazu",
    "settings": { "approvalMode": "default" }
  }
}
```

**Implementation path:** Resolve inheritance chain, deep merge configs.

---

## Open Design Questions

From the spec, still unresolved:

1. **Should profiles be shareable?** Define in git repo, install like extensions.

2. **Runtime profile switching?** `/profile ritual` mid-session. Probably not—restart is cleaner.

3. **Finer prompt section manipulation?** Current gemini-cli has fixed sections. Future: split finer, add sections dynamically, manipulate beyond enable/disable.

4. **Self-updating ritual system?** The ritual profile should edit its own prompt files after reflection. Profile is stable pointer; content evolves autonomously.

---

## Precedents Set

Decisions made that should inform future work:

### 2026-01-28: Document Consolidation

The original foundation documents (`inspiration.md`, `conversation.txt`, `opus-session-001.md`) were condensed into `foundation.md`. The originals were deleted. Future philosophical/motivational content belongs in `foundation.md` or documents that cite it.

### 2026-01-28: Profile System Phase 1

Shipped wrapper-based profiles with:
- System prompt override
- Prompt section toggles
- Resolution priority (CLI > env > project > default)

Deferred extensions, settings, hooks to "learn as we go."

### 2026-01-28: Prompts Sync Approach

LLM-assisted merging chosen over manual diff resolution. User defines `preferences.md` with exact text to preserve + semantic preferences. System generates merged prompt, creates PR for review.

---

## Future Traces

When significant decisions are made, record them here with date and reasoning. This is the seed of the precedent system described in `foundation.md`.

Format:
```
### YYYY-MM-DD: Decision Title

What was decided. Why. What it supersedes or builds on.
```
