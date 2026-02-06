# Prompt Stack Map

Everything that reaches the model as input context.

---

## The Three Channels

When Gemini receives a request, context arrives through three channels:

```
┌─────────────────────────────────────────────────────────────┐
│                      API Request                            │
├─────────────────────────────────────────────────────────────┤
│  1. System Instruction    (who you are, how to behave)      │
│  2. Tool Declarations     (what you can do)                 │
│  3. Conversation History  (what's happened so far)          │
└─────────────────────────────────────────────────────────────┘
```

---

## Channel 1: System Instruction

The foundational prompt. This is what `GEMINI_WRITE_SYSTEM_MD` captures.

### Composed Sections (in order)

| Section | What It Contains | Toggle |
|---------|------------------|--------|
| **Preamble** | "You are an interactive CLI agent..." | `GEMINI_PROMPT_PREAMBLE=0` |
| **Core Mandates** | Conventions, comments policy, safety rules | `GEMINI_PROMPT_COREMANDATES=0` |
| **Agent Contexts** | Sub-agent directory (codebase_investigator, etc.) | `GEMINI_PROMPT_AGENTCONTEXTS=0` |
| **Agent Skills** | Available skills XML list | `GEMINI_PROMPT_AGENTSKILLS=0` |
| **Hook Context** | Rules for handling `<hook_context>` tags | `GEMINI_PROMPT_HOOKCONTEXT=0` |
| **Primary Workflows** | Software engineering steps, New Applications flow | `GEMINI_PROMPT_PRIMARYWORKFLOWS=0` |
| **Operational Guidelines** | Tone, shell efficiency, tool usage rules | `GEMINI_PROMPT_OPERATIONALGUIDELINES=0` |
| **Sandbox** | Sandbox awareness (macOS seatbelt, generic, or none) | `GEMINI_PROMPT_SANDBOX=0` |
| **Git Repo** | Git workflow rules (only if in a git repo) | `GEMINI_PROMPT_GIT=0` |
| **Final Reminder** | "Keep going until resolved" | `GEMINI_PROMPT_FINALREMINDER=0` |

### Appended After Base Prompt

| Section | What It Contains |
|---------|------------------|
| **User Memory** | Contents of GEMINI.md files (hierarchical merge) |
| **MCP Instructions** | Instructions from connected MCP servers |
| **Plan Mode** | If in plan mode: available tools, workflow phases, constraints |

### Override Path

Setting `GEMINI_SYSTEM_MD=/path/to/system.md` replaces the entire composed prompt with your file. Substitutions are still applied:
- `${AgentSkills}` → rendered skills XML
- `${SubAgents}` → agent directory
- `${AvailableTools}` → tool list
- `${toolName_ToolName}` → individual tool names

---

## Channel 2: Tool Declarations

JSON schemas for every tool the model can call. Sent in the `tools` field, separate from system instruction.

### Tool Sources

| Source | Examples |
|--------|----------|
| **Built-in tools** | `read_file`, `edit_file`, `run_shell_command`, `glob`, `grep` |
| **Agent tools** | `codebase_investigator`, `cli_help` |
| **Skill tool** | `activate_skill` (lists available skill names dynamically) |
| **Memory tool** | `save_memory` (writes to GEMINI.md) |
| **MCP tools** | Whatever MCP servers expose |

### What a Tool Declaration Looks Like

```json
{
  "name": "read_file",
  "description": "Read the contents of a file at the specified path...",
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "The file path to read" }
    },
    "required": ["path"]
  }
}
```

The descriptions here are prompt content — they guide the model on when/how to use each tool.

---

## Channel 3: Conversation History

The message turns sent in the `contents` field.

### Turn Structure

```
[user]    → User's request
[model]   → Model's response (may include tool calls)
[user]    → Tool results (functionResponse)
[model]   → Model continues...
```

### Context Injected Into Turns

| Injection | When | What |
|-----------|------|------|
| **IDE Context** | First turn + changes | Active file, cursor position, selected text |
| **Directory Context** | Session start | Workspace structure overview |
| **Skill Activation** | When skill is activated | `<activated_skill>` XML with instructions |
| **Hook Context** | Per-turn via hooks | `<hook_context>` tags with external data |
| **Tool Results** | After tool execution | What the tool returned |

### Compression

When history gets too long, it's compressed into a structured summary using a separate model call. The summary replaces the original history.

---

## The Hook Layer (Meta-Injection)

Hooks can modify any of the three channels before the API call:

| Hook Event | What It Can Modify |
|------------|-------------------|
| **BeforeModel** | System instruction, tool config, message contents |
| **BeforeToolSelection** | Which tools are available |
| **AfterModel** | Can synthesize/modify responses |
| **BeforeAgent** | Can inject `additionalContext` |

Hooks are the extension point for external systems to inject context without modifying core code.

---

## Visual Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SYSTEM INSTRUCTION                          │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Preamble → Core Mandates → Agent Contexts → Skills →          │  │
│  │ Hook Context → Workflows → Guidelines → Sandbox → Git →       │  │
│  │ Final Reminder                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ User Memory (GEMINI.md hierarchy)                             │  │
│  │ MCP Instructions                                               │  │
│  │ Plan Mode (if active)                                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                         TOOL DECLARATIONS                           │
│  read_file, edit_file, run_shell_command, glob, grep, ...          │
│  codebase_investigator, activate_skill, save_memory, ...           │
│  [MCP tools]                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                       CONVERSATION HISTORY                          │
│  [Previous turns]                                                   │
│  [IDE context delta]                                                │
│  [Current user message]                                             │
│  [Tool results from last turn]                                      │
└─────────────────────────────────────────────────────────────────────┘
         │
         │  ← Hooks can modify any of the above before sending
         ▼
    ┌─────────┐
    │ Gemini  │
    └─────────┘
```

---

## What Hierophage Controls (Currently)

The `hierophage prompts sync` command and profile system currently target:

**Controlled:**
- System instruction (via `GEMINI_SYSTEM_MD` override)
- User memory (via profile-specific GEMINI.md, not yet implemented)
- Section toggles (via `GEMINI_PROMPT_*` env vars)

**Not Yet Controlled:**
- Tool declarations (descriptions are in code)
- Per-turn context injections
- Hook configurations
- Skill content (separate SKILL.md files)

---

## Key Files

| File | What It Does |
|------|--------------|
| `packages/core/src/prompts/promptProvider.ts` | Orchestrates system instruction composition |
| `packages/core/src/prompts/snippets.ts` | Contains all prompt text and render functions |
| `packages/core/src/prompts/utils.ts` | Path resolution, substitutions, section toggles |
| `packages/core/src/tools/tool-registry.ts` | Assembles tool declarations |
| `packages/core/src/core/geminiChat.ts` | Constructs the actual API call |
| `packages/core/src/hooks/hookRegistry.ts` | Hook discovery and execution |
| `packages/core/src/utils/memoryDiscovery.ts` | GEMINI.md file discovery and merging |
