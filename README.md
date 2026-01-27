# Hierophage CLI

**A fork of [gemini-cli](https://github.com/google-gemini/gemini-cli) exploring AI as institution rather than tool.**

[![License](https://img.shields.io/github/license/google-gemini/gemini-cli)](https://github.com/google-gemini/gemini-cli/blob/main/LICENSE)

---

## What This Is

Hierophage-CLI takes the gemini-cli foundation and transforms it into something different: a **minimal institution for emergent judgment**.

The core CLI functionality—file operations, shell commands, model access—comes entirely from gemini-cli. What we're building lives in the prompt stack, the persistent state layer, and the interaction rituals.

### The Premise

Language is a shared operating environment. Humans and machines co-inhabit it. Most AI tools optimize for task completion. This one optimizes for **context retention, ethical durability under load, and speech that binds**.

Key ideas (see `docs/inspiration.md` for the full framework):

- **Thee-Seeks**: A context culture based on mutual grace and mercy—not sentiment, but robustness mechanisms
- **Court, not judge**: Multiple perspectives that can disagree, with deliberation visible
- **Memory that matters**: Revision without erasure; precedent that accumulates
- **Play as substrate**: Making effort inhabitable through constructed significance

### What We're Adding

- Decomposable, overridable prompt stack
- Persistent state layer (Constitution, artifact history, implementation intentions)
- Interaction rituals (threshold entry/exit, classification without advice)
- Oracle mode for delegated domains
- Narrative construction that shapes future behavior

This is experimental. The spec is in `docs/opus-session-001.md`.

---

## Installation

**Requirements:** Node.js 20+

```bash
git clone https://github.com/clevergadget/hierophage-cli
cd hierophage-cli
npm install              # Sets up upstream remote and builds
npm install -g           # Make 'hierophage' globally available
```

The `postinstall` hook automatically adds the upstream remote and runs the build.

---

## Usage

```bash
hierophage
```

For full CLI documentation (commands, authentication, MCP servers, etc.), see the [gemini-cli docs](https://geminicli.com/docs/).

---

## Profiles

Hierophage supports multiple profiles for radically different use cases:

| Profile | Description |
|---------|-------------|
| `vanilla` | Standard gemini-cli (default) |
| `bare` | No system prompt—raw model |
| `ritual` | Institutional ritual system |
| `kawazu` | Simple learning assistant |

### Setup Profiles

```bash
npm run hierophage:install   # Copy templates to ~/.hierophage/
```

### Select a Profile

```bash
hierophage --profile ritual     # Use ritual profile
hierophage -P kawazu            # Use kawazu profile
hierophage -P bare              # No system prompt
hierophage                      # Default (vanilla)
```

### Profile Resolution Priority

1. `--profile` / `-P` command line flag
2. `HIEROPHAGE_PROFILE` environment variable
3. `.hierophage/profile` file in current directory
4. Default from `~/.hierophage/profiles.json`

### Customize Profiles

Edit `~/.hierophage/profiles.json` to define profiles. Each profile can specify:
- `systemPrompt`: Path to custom system.md, `"default"`, or `"none"`
- `promptSections`: Toggle individual gemini-cli prompt sections
- `settings`: Override CLI settings

See `docs/profile-system-spec.md` for full documentation.

---

## Staying Updated with Upstream

```bash
git fetch upstream
git merge upstream/main
npm install
npm install -g
```

The `.hierophage/` directory persists through merges, keeping customizations intact.

---

## Project Structure

```
docs/
  inspiration.md       # The Tapestry - philosophical foundation
  conversation.txt     # Generative conversation that produced the Tapestry
  opus-session-001.md  # Summary, commentary, and proposed spec
CLAUDE.md              # Context for Claude instances working on this
```

---

## Attribution

This project is built on [gemini-cli](https://github.com/google-gemini/gemini-cli) by Google, licensed under Apache 2.0. The overwhelming majority of the code is their work. We're grateful for the foundation.

What's original here: the philosophical framework, the spec for institutional features, and the prompt/state layers we're building on top.

---

## License

Apache 2.0, inherited from gemini-cli. See [LICENSE](LICENSE).
