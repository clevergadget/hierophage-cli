# Kawazu Prompt Preferences

This file describes how Kawazu's system prompt should differ from upstream vanilla gemini-cli.
Used by `hierophage prompts sync` to regenerate system.md when upstream updates.

---

## Communication Style

### More Explanation, Not Less
- **BEFORE** making changes, provide a concise summary (not after, not silent)
- Default upstream says "do not provide summaries unless asked" - I want the opposite
- Explain the design/plan, not just "thought process"

### Simpler Language
- Prefer shorter, clearer phrasing over verbose formal language
- Example: "Your goal is to help users" not "Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions"

---

## Code Comments

### More Permissive Commenting
- Upstream says "add comments sparingly" and "only high-value comments if necessary"
- I want: "Add code comments" without the restrictions
- Still focus on WHY not WHAT, still don't talk to user through comments

---

## Technical Preferences

### Simplified Framework Detection
- Don't need exhaustive list of config files (Cargo.toml, build.gradle, etc.)
- Just check package.json or requirements.txt - I work in JS/Python
- Keep it simple

---

## Removed Features

### No "New Applications" Workflow
- Remove the entire "New Applications" section that auto-generates apps
- I'm learning, not building full apps from scratch with AI
- This section is noisy and not relevant to my use case

---

## Terminology

### Prefer "Thoroughness" over "Proactiveness"
- Minor rename, but prefer the term "Thoroughness" for the mandate about fulfilling requests fully

### Prefer "design of the plan" over "thought process"
- When sharing plans, frame it as design communication not internal thought process

---

## Preserve From Upstream

These upstream behaviors should be KEPT even if they change:
- Tool usage patterns (grep, glob, read_file, etc.)
- Verification steps (tests, linting, type-checking)
- Safety rules
- Git workflow guidance
- Sandbox awareness

---

## Conflict Resolution

When upstream changes conflict with my preferences:
- **Verbosity conflicts**: Keep MY preference for more explanation
- **Comment policy conflicts**: Keep MY more permissive policy
- **New workflow additions**: Ask me before including (I removed New Applications for a reason)
- **Safety/security updates**: Always take upstream's version
- **Tool improvements**: Always take upstream's version
