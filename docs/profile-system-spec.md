# Profile System Spec

## Scope & Design Principles

This spec must accommodate **radically different uses of the same CLI**, coexisting via a `--profile` flag:

1. **Phil's hierophage system** — sprawling, complex, evolving. Hooks, rituals, persistent state, custom prompt stack. Will shift and grow. The profile system must not constrain this.

2. **Kawazu's restructured prompts** — not just edits to gemini's sections, but potentially **redefined sections**. Different organization of the prompt, different emphasis. TBD.

3. **Default gemini-cli** — vanilla behavior, no extras.

4. **Blank system prompt** — literally nothing besides the input sent to the model.

**Key principle:** Profiles are *maximally flexible*. A profile can:
- Replace the entire system prompt with a custom file
- Disable all default sections and define new ones
- Bundle hooks that fire on any event
- Enable/disable extensions
- Override any setting

The profile system is a **dispatch mechanism**, not a constraint. It says "when `--profile X` is passed, activate configuration bundle X." What's *in* that bundle is unbounded.

**Shared changes** (build system, CLI infrastructure, upstream merges) are orthogonal to profiles. Profiles only govern prompt stack, hooks, extensions, and settings.

---

## Problem

Two (or more) users sharing the same CLI need radically different experiences:

| Profile | Description |
|---------|-------------|
| `vanilla` | Traditional gemini-cli, no extras |
| `bare` | Literally no prompt at all—raw model, nothing added |
| `ritual` | Phil's institutional/ritual system |
| `kawazu` | Kawazu learning Python—simple, helpful, no weird stuff |

The underlying gemini-cli already supports all of this through scattered mechanisms. What's missing is a unified way to activate a named configuration.

---

## What Already Exists

**1. Complete system prompt override:**
```bash
GEMINI_SYSTEM_MD=/path/to/system.md hierophage
```
- If the file exists, it replaces the entire built-in prompt
- Set to `0` or `false` to disable override

**2. Partial prompt section disable:**
```bash
GEMINI_PROMPT_PREAMBLE=0 GEMINI_PROMPT_COREMEMANDATES=0 hierophage
```
- Any section can be disabled: PREAMBLE, COREMEMANDATES, PRIMARYWORKFLOWS_PREFIX, PRIMARYWORKFLOWS_SUFFIX, OPERATIONALGUIDELINES, SANDBOX, GIT, FINALREMINDER

**3. Extension system:**
- Extensions bundle: MCP servers, context files (GEMINI.md), tool exclusions, hooks
- Stored in `~/.gemini-cli/extensions/`
- Enabled/disabled per user or workspace
- CLI: `hierophage extensions install|enable|disable|list`

**4. User memory:**
- `~/.gemini-cli/gemini.md` appended to system prompt
- Per-project `.gemini.md` files

**5. Settings system:**
- `~/.gemini-cli/settings.json` (user level)
- `.gemini/settings.json` (project level)
- Supports model, tools, approval modes, etc.

---

## Proposed: Profile Layer

A profile is a named bundle that activates a combination of:
- System prompt (override path or "default" or "none")
- Prompt section toggles
- Extensions to enable
- Extensions to disable
- Settings overrides
- Environment variables

### Profile Definition

**Location:** `~/.hierophage/profiles.json` (or `~/.gemini-cli/profiles.json`)

```json
{
  "profiles": {
    "vanilla": {
      "description": "Standard gemini-cli experience",
      "systemPrompt": "default",
      "extensions": {
        "enable": [],
        "disable": ["*"]
      }
    },

    "bare": {
      "description": "No system prompt at all—raw model",
      "systemPrompt": "none",
      "promptSections": {
        "PREAMBLE": false,
        "COREMEMANDATES": false,
        "PRIMARYWORKFLOWS_PREFIX": false,
        "PRIMARYWORKFLOWS_SUFFIX": false,
        "OPERATIONALGUIDELINES": false,
        "SANDBOX": false,
        "GIT": false,
        "FINALREMINDER": false
      },
      "extensions": {
        "disable": ["*"]
      },
      "userMemory": false
    },

    "ritual": {
      "description": "Institutional ritual system for Phil",
      "systemPrompt": "~/.hierophage/system.md",
      "extensions": {
        "enable": ["hierophage-core"]
      },
      "settings": {
        "approvalMode": "default"
      }
    },

    "kawazu": {
      "description": "Simple helpful assistant for Kawazu learning Python",
      "systemPrompt": "~/.hierophage/profiles/learner/system.md",
      "extensions": {
        "enable": [],
        "disable": ["hierophage-core"]
      },
      "settings": {
        "approvalMode": "auto_edit"
      }
    }
  },

  "default": "vanilla"
}
```

### Profile Selection

**Command line:**
```bash
hierophage --profile ritual 
hierophage --profile kawazu
hierophage -P bare
hierophage  # uses "default" profile
```

**Environment variable:**
```bash
HIEROPHAGE_PROFILE=kawazu hierophage
```

**Project-level default:**
`.hierophage/profile` or `.gemini/profile` file containing profile name

**Priority:** CLI flag > env var > project file > global default

---

## Implementation Options

### Option A: Wrapper Script (Simplest)

The existing `.hierophage/bin/hierophage.js` wrapper already exists. Extend it:

```javascript
// Pseudocode
const profile = resolveProfile(args, env, projectFile, globalDefault);
const config = loadProfileConfig(profile);

// Set environment variables based on profile
if (config.systemPrompt === 'none') {
  process.env.GEMINI_SYSTEM_MD = '0';
} else if (config.systemPrompt !== 'default') {
  process.env.GEMINI_SYSTEM_MD = resolvePath(config.systemPrompt);
}

for (const [section, enabled] of Object.entries(config.promptSections || {})) {
  if (!enabled) {
    process.env[`GEMINI_PROMPT_${section}`] = '0';
  }
}

if (config.userMemory === false) {
  // Needs core support or workaround
}

// Pass through to actual CLI
require('../bundle/hierophage.js');
```

**Pros:**
- No gemini-cli core changes
- Can ship immediately
- Easy to understand

**Cons:**
- Extension enable/disable requires additional work (calling CLI commands or manipulating enablement files)
- Settings overrides need similar workaround

### Option B: Settings Integration

Add profiles to the settings schema in gemini-cli itself:

```json
// settings.json
{
  "profiles": { ... },
  "activeProfile": "hierophage"
}
```

**Pros:**
- Native integration
- Profile settings merge cleanly with other settings

**Cons:**
- Requires modifying gemini-cli core
- May conflict with upstream updates

### Option C: Extension as Profile Loader (Hybrid)

Create a "profile-loader" extension that:
1. Reads `profiles.json` on load
2. Activates other extensions based on profile
3. Sets up context files that include profile-specific prompts

**Pros:**
- Uses existing extension infrastructure
- No core changes

**Cons:**
- Can't truly override system prompt from an extension
- More complex

---

## Recommended Approach: Option A with Growth Path

**Phase 1: Wrapper Script**

1. Extend `.hierophage/bin/hierophage.js` to read profiles.json
2. Set env vars for system prompt and section toggles
3. Add `--profile`/`-P` argument parsing
4. Ship it—you can start using profiles immediately

**Phase 2: Extension Enablement**

1. Profiles can specify extensions to enable/disable
2. Wrapper calls `hierophage extensions enable/disable` as needed OR
3. Wrapper directly manipulates `~/.gemini-cli/extensions/*/enabled.json`

**Phase 3: Settings Merge**

1. Profile settings merge into runtime settings
2. Requires either:
   - Passing settings via env vars (limited)
   - Writing temp settings file (hacky but works)
   - Contributing profiles feature upstream

---

## Profile Directory Structure

```
~/.hierophage/
  profiles.json              # Profile definitions
  profiles/
    ritual/
      system.md              # System prompt for phil
      GEMINI.md              # Additional context
    kawazu/
      system.md              # System prompt for kawazu
    bare/
      # Empty or minimal
```

---

## The "Bare" Profile

Special case: literally no prompt. This requires:

```json
{
  "bare": {
    "systemPrompt": "~/.hierophage/profiles/bare/empty.md",
    "promptSections": { all: false },
    "userMemory": false
  }
}
```

Where `empty.md` exists but contains only whitespace or a single newline.

**Alternative:** Modify gemini-cli to accept `GEMINI_SYSTEM_MD=none` as a directive to send no system prompt. This would be a small upstream-compatible change.

---

## Migration Path

1. Users can continue using gemini-cli env vars directly—profiles are opt-in
2. Existing `.gemini/` and `~/.gemini-cli/` configurations remain authoritative
3. Profiles layer on top, don't replace

---

## Hooks Integration

The gemini-cli hooks system is event-driven and perfect for hierophage rituals. Profiles can bundle hook configurations.

### Available Hook Events

| Event | When It Fires | Hierophage Use Case |
|-------|---------------|---------------------|
| **SessionStart** | Session begins | Threshold entry ritual, load Constitution |
| **SessionEnd** | Session ends | Exit ritual, save to artifact history |
| **BeforeAgent** | After user submits, before planning | Inject precedent, classification context |
| **AfterAgent** | Agent loop ends | Log to sediment layer, narrative update |
| **BeforeModel** | Before sending to LLM | Inject Constitution into context |
| **AfterModel** | After LLM response | Filter, log interactions |
| **BeforeToolSelection** | Before LLM picks tools | Restrict tools per profile |
| **BeforeTool** | Before tool executes | Validate, block dangerous ops |
| **AfterTool** | After tool executes | Process results, trigger side effects |
| **PreCompress** | Before context compression | Save state before compression |
| **Notification** | Permission requests, etc. | Auto-approve in yolo profiles |

### Hook Mechanics

- Hooks are shell commands receiving JSON on stdin
- Exit 0 = success, Exit 2 = block/deny
- Can return JSON to modify behavior (inject context, change inputs)
- Matchers filter when hooks fire (e.g., `"write_file|replace"` for specific tools)

### Profile-Specific Hooks

Profiles can define hooks in their config:

```json
{
  "profiles": {
    "hierophage": {
      "systemPrompt": "~/.hierophage/system.md",
      "hooks": {
        "SessionStart": [
          {
            "matcher": "startup",
            "hooks": [{
              "name": "threshold-entry",
              "type": "command",
              "command": "~/.hierophage/hooks/threshold-entry.sh",
              "description": "Entry ritual - acknowledge arrival, retrieve context"
            }]
          }
        ],
        "SessionEnd": [
          {
            "hooks": [{
              "name": "threshold-exit",
              "type": "command",
              "command": "~/.hierophage/hooks/threshold-exit.sh",
              "description": "Exit ritual - summarize, note commitments"
            }]
          }
        ],
        "BeforeAgent": [
          {
            "hooks": [{
              "name": "inject-precedent",
              "type": "command",
              "command": "~/.hierophage/hooks/inject-precedent.sh",
              "description": "Add relevant precedent to context"
            }]
          }
        ],
        "AfterAgent": [
          {
            "hooks": [{
              "name": "log-artifact",
              "type": "command",
              "command": "~/.hierophage/hooks/log-artifact.sh",
              "description": "Record significant interactions to sediment layer"
            }]
          }
        ]
      }
    },
    "bare": {
      "systemPrompt": "none",
      "hooks": {}
    }
  }
}
```

### Implementation Note

The wrapper script would need to either:
1. Write profile hooks to a temp settings file that gets merged
2. Set hooks via the extension system (extensions can define hooks)
3. Directly manipulate `~/.gemini-cli/settings.json` on profile switch

Option 2 (extension per profile) may be cleanest—each profile becomes an extension that bundles its hooks, context files, and tool exclusions.

---

## Open Questions

1. **Should profiles be shareable?** Could define profiles in a git repo and "install" them like extensions.

2. **Per-project profiles?** A `.hierophage/profile` file that auto-selects profile based on directory.

3. **Profile inheritance?** A profile extending another:
   ```json
   {
     "kawazu-strict": {
       "extends": "kawazu",
       "settings": { "approvalMode": "default" }
     }
   }
   ```

4. **Runtime profile switching?** `/profile ritual` command to switch mid-session. Probably not—restart is cleaner.

5. **Finer-grained prompt section manipulation?** The current gemini-cli prompt system (`packages/core/src/core/prompts.ts`) has pre-defined sections (PREAMBLE, COREMEMANDATES, etc.). Future work should support:
   - Splitting into finer sections
   - Dynamically adding new sections at runtime
   - Section manipulation beyond just enable/disable

   This is orthogonal to the profile system but profiles should be able to leverage it when it exists.

6. **Self-updating ritual system?** Phil's ritual profile should be autonomous from day 1—the system will edit its own prompt files after reflection or interviewing Phil for information. The profile is a stable pointer; the content it points to evolves autonomously. This is ritual system behavior, not profile system behavior.

---

## Summary

The infrastructure exists. We need:

1. `profiles.json` format definition (this doc)
2. ~50 lines in the wrapper script to read profiles and set env vars
3. Profile-specific prompt files in `~/.hierophage/profiles/`

That's it for Phase 1. Everything else is iteration.
