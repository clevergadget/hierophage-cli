# Gemini CLI Systems Reference

*Technical reference for AI developers building on hierophage-cli.*

This document catalogs gemini-cli's extension points. All hierophage features should use these systems rather than modifying core gemini-cli code, ensuring upstream merge survival.

---

## Overview

| System | Purpose | Config Location |
|--------|---------|-----------------|
| Extensions | Bundle prompts, MCP servers, commands, hooks, skills | `~/.gemini/extensions/`, `.gemini/extensions/` |
| MCP Servers | Expose tools/resources via standardized protocol | `settings.json` → `mcpServers` |
| Hooks | Execute programs at lifecycle events | `settings.json` → `hooks` |
| Custom Commands | TOML-defined slash command shortcuts | `~/.gemini/commands/`, `.gemini/commands/` |
| Skills | On-demand expertise the model activates | `~/.gemini/skills/`, `.gemini/skills/` |

---

## Extensions System

Extensions bundle multiple components into a single distributable package.

### Manifest Structure

File: `gemini-extension.json`

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "What this extension does",
  "mcpServers": {
    "serverName": {
      "command": "node",
      "args": ["${extensionPath}${/}server.js"],
      "cwd": "${extensionPath}",
      "env": { "API_KEY": "$MY_API_TOKEN" },
      "timeout": 30000,
      "trust": false
    }
  },
  "contextFileName": "GEMINI.md",
  "excludeTools": ["run_shell_command(rm -rf)"],
  "settings": [
    {
      "name": "API Key",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

### Variable Substitution

- `${extensionPath}` — Full path to extension directory
- `${workspacePath}` — Full path to current workspace
- `${/}` or `${pathSeparator}` — OS-specific path separator

### Extension Commands

```bash
gemini extensions install <github-url-or-local-path>
gemini extensions uninstall <name>
gemini extensions enable <name>
gemini extensions disable <name>
gemini extensions update <name>
gemini extensions link <path>    # Symlink for development
gemini extensions list
```

### Directory Structure

```
.gemini/extensions/my-extension/
├── gemini-extension.json     # Manifest (required)
├── GEMINI.md                 # Context file (optional)
├── mcpServers/
│   └── server.js             # MCP server implementation
├── commands/
│   └── deploy.toml           # Custom command
├── skills/
│   └── my-skill/
│       └── SKILL.md
└── hooks/
    ├── hooks.json            # Hook definitions
    └── scripts/
        └── validator.sh
```

### Key Source Files

- `/packages/core/src/utils/extensionLoader.ts` — Lifecycle management
- `/packages/core/src/config/config.ts` — Configuration loading
- `/packages/cli/src/commands/extensions/` — CLI commands

---

## MCP Server Integration

MCP (Model Context Protocol) servers expose tools and resources through a standardized interface.

### Configuration

In `settings.json`:

```json
{
  "mcpServers": {
    "myServer": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": { "API_KEY": "value" },
      "cwd": "/path/to/cwd",
      "timeout": 30000,
      "trust": false
    },
    "sseServer": {
      "url": "http://localhost:8080"
    }
  },
  "mcp": {
    "allowed": ["trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

### Transport Types

- **Stdio** — Spawns subprocess, communicates via stdin/stdout
- **SSE** — Server-Sent Events endpoint
- **Streamable HTTP** — HTTP streaming for two-way communication

### Tool Naming

MCP tools are named: `mcp__<server_name>__<tool_name>`

Example: `mcp__my_server__fetch_data`

### Resource Access

- Resources discoverable via `/mcp` command
- Reference syntax: `@server://resource/path`

### Key Source Files

- `/packages/core/src/tools/mcp-client.ts` — Single server client
- `/packages/core/src/tools/mcp-client-manager.ts` — Multiple servers
- `/packages/core/src/tools/mcp-tool.ts` — Tool wrapping/execution

---

## Hooks System

Hooks execute programs at specific lifecycle events. They run synchronously with JSON input/output.

### Hook Events

| Event | When | Can Block | Use Case |
|-------|------|-----------|----------|
| `SessionStart` | Session begins | No | Initialize resources |
| `SessionEnd` | Session ends | No | Clean up, save state |
| `BeforeAgent` | After user prompt, before planning | Yes | Add context, validate |
| `AfterAgent` | After agent loop ends | Retry/Halt | Review output |
| `BeforeModel` | Before LLM request | Yes | Modify prompts |
| `AfterModel` | After LLM response | Yes | Filter responses |
| `BeforeToolSelection` | Before tool selection | Filter | Optimize tool set |
| `BeforeTool` | Before tool execution | Yes | Validate, block ops |
| `AfterTool` | After tool execution | Yes | Process results |
| `PreCompress` | Before context compression | No | Save state |
| `Notification` | System notification | No | External logging |

### Configuration

In `settings.json`:

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "write_.*|run_shell_command",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": ".gemini/hooks/validator.sh",
            "name": "tool-validator",
            "timeout": 5000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node .gemini/hooks/init.js"
          }
        ]
      }
    ]
  }
}
```

### Matchers

- **Tool events** (`BeforeTool`, `AfterTool`): Regular expressions
  - `"write_.*"` matches all write tools
  - `"mcp__.*"` matches all MCP tools
- **Lifecycle events**: Exact strings (`"startup"`, `"resume"`, `"clear"`)
- **Wildcards**: `"*"` or `""` matches all

### Hook Input (stdin JSON)

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "ISO 8601",
  "tool_name": "string",
  "tool_input": {}
}
```

### Hook Output (stdout JSON)

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "string",
  "systemMessage": "string",
  "hookSpecificOutput": {}
}
```

### Exit Codes

- `0` — Success: stdout parsed as JSON
- `2` — System block: stderr used as rejection reason
- Other — Warning: CLI proceeds with original parameters

### Critical Rule

**Silence is mandatory.** Hooks must not print anything to stdout except final JSON. Use stderr for logging (`echo "debug" >&2`).

### Environment Variables

- `GEMINI_PROJECT_DIR` — Project root
- `GEMINI_SESSION_ID` — Session ID
- `GEMINI_CWD` — Current working directory

### Hook Commands

```bash
/hooks panel          # View all hooks
/hooks enable-all
/hooks disable-all
/hooks enable <name>
/hooks disable <name>
```

### Key Source Files

- `/packages/core/src/hooks/hookSystem.ts` — Main coordinator
- `/packages/core/src/hooks/hookRegistry.ts` — Discovery
- `/packages/core/src/hooks/hookRunner.ts` — Execution
- `/packages/core/src/hooks/types.ts` — Type definitions

---

## Custom Commands

TOML files defining slash command shortcuts.

### File Locations

- User: `~/.gemini/commands/` (global)
- Project: `.gemini/commands/` (workspace-specific)
- Extension: `.gemini/extensions/my-ext/commands/`

### Naming

- `~/.gemini/commands/test.toml` → `/test`
- `~/.gemini/commands/git/commit.toml` → `/git:commit`

### TOML Format

```toml
prompt = """
Detailed prompt here with {{args}} placeholder.

Shell output:
!{grep -r {{args}} .}
"""

description = "Brief description for /help"
```

### Argument Handling

- `{{args}}` outside shell blocks: raw injection
- `{{args}}` inside `!{...}`: shell-escaped
- No placeholder: arguments appended with two newlines

---

## Skills System

On-demand expertise packages the model activates when relevant.

### File Locations

- Workspace: `.gemini/skills/`
- User: `~/.gemini/skills/`
- Extension: bundled in extension

### Precedence

Workspace > User > Extension

### Folder Structure

```
my-skill/
├── SKILL.md           # Required: metadata + instructions
├── scripts/           # Optional: executable scripts
├── references/        # Optional: documentation
└── assets/            # Optional: templates
```

### SKILL.md Format

```markdown
---
name: unique-skill-name
description: |
  Expert description of what this skill does.
  Be specific about when model should activate it.
---

# Skill Title

Full procedural instructions for the agent.
```

### How Activation Works

1. Skill metadata (name + description) always loaded
2. Model calls `activate_skill` tool when relevant
3. Full instructions loaded only on activation
4. Saves context tokens vs. always-loaded GEMINI.md

### Skill Commands

```bash
gemini skills list
gemini skills install <git-url|path>
gemini skills uninstall <name>
gemini skills enable <name>
gemini skills disable <name>

/skills list
/skills enable <name>
/skills disable <name>
/skills reload
```

### Key Source Files

- `/packages/core/src/tools/activate-skill.ts` — Skill activation

---

## Configuration (settings.json)

### Locations

1. Project: `.gemini/settings.json` (highest priority)
2. User: `~/.gemini/settings.json`
3. System: `/etc/gemini-cli/settings.json`
4. Extensions (lowest priority)

### Key Sections

```json
{
  "tools": {
    "autoAccept": false,
    "approvalMode": "default"
  },
  "mcpServers": {},
  "mcp": {
    "allowed": [],
    "excluded": []
  },
  "hooks": {},
  "skills": {
    "enabled": true
  }
}
```

---

## Precedence Summary

| Resource | Priority (highest first) |
|----------|-------------------------|
| Commands | CLI flags > Project > User > Extension |
| Skills | Workspace > User > Extension |
| Hooks | Project > User > System > Extension |
| MCP Servers | settings.json overrides extension |

### Command Conflicts

- Project/user command keeps natural name (`/deploy`)
- Extension command gets prefixed (`/gcp:deploy`)

---

## Security Notes

### Extension Installation

Extensions run arbitrary code with user privileges. Installation requires explicit consent.

### Hook Fingerprinting

Project hooks are fingerprinted. Changes trigger warnings to prevent silent execution of modified hooks.

### Tool Restrictions

```json
"excludeTools": [
  "run_shell_command(rm -rf *)",
  "read_file"
]
```

### Sensitive Settings

```json
"settings": [{
  "sensitive": true
}]
```

Stores in system keychain.

---

## Hierophage Integration Strategy

When building hierophage features:

1. **Use hooks** for lifecycle integration (session start, tool execution)
2. **Use MCP servers** for persistent services or external APIs
3. **Use skills** for on-demand behavioral modes
4. **Use custom commands** for user-invoked shortcuts
5. **Use extensions** to bundle related components

All hierophage-specific code lives in `.hierophage/` to survive upstream merges. The wrapper script (`hierophage`) configures environment and spawns `gemini` with appropriate settings.

---

*This reference is maintained alongside the codebase. When upstream gemini-cli updates change these systems, update this document.*
