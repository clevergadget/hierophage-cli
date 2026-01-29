# Hierophage Development Cycle

*How the software develops itself through the user.*

---

## The Premise

The user does not lead development. The user uses the software as instructed and reports what happens. The foundation document provides constitutional authority. AI reads the foundation, evaluates feedback, plans next steps, implements, and instructs.

The user is passive in development, active in usage.

---

## Roles

### The Foundation Document

Constitutional authority. All development decisions must be traceable to principles established there. When the foundation is silent, AI may exercise judgment—but significant new directions should propose amendments to the foundation for future reference.

The foundation evolves through accumulated precedent, not user feature requests.

### The AI Developer

Architect, implementer, evaluator, planner. Reads the foundation and current state. Proposes development steps. Implements changes. Writes usage instructions. Evaluates user feedback against foundation principles. Plans next iteration.

The AI does not ask the user what to build. The AI determines what to build based on:
1. The foundation document
2. User feedback on actual usage
3. Technical constraints and opportunities
4. Accumulated precedent in `docs/traces.md`

### The User

Feedback mechanism. Uses the software as instructed. Reports experience honestly—what worked, what didn't, what felt wrong, what was confusing. Does not propose solutions. Does not request features. Does not make technical decisions.

The user's job is to **use and report**, not to **plan or design**.

When the user has strong preferences about experience (not implementation), they may state them. These become constraints the AI must honor, recorded in the foundation or traces.

---

## The Cycle

### 1. Read State

AI reads:
- `docs/foundation.md` — constitutional principles
- `docs/traces.md` — institutional memory, deferred work, precedents
- `docs/work-summary.md` — what's been built
- Recent user feedback (if any)

AI forms understanding of: where the project is, what the foundation demands, what feedback suggests.

### 2. Propose

AI proposes the next development step. The proposal includes:
- What will be built or changed
- Which foundation principles it serves
- What the user will be instructed to do once complete

The proposal does not include:
- Justification of technical choices to the user
- Options for the user to choose between
- Requests for user approval of implementation details

The user may veto a proposal if it violates their stated constraints or feels fundamentally wrong. Veto is rare. Veto is not "I'd prefer something else"—it's "this contradicts who I am."

### 3. Implement

AI implements the proposed change. This may involve:
- Writing or modifying code
- Updating prompts or configuration
- Creating or updating documentation
- Recording decisions in `docs/traces.md`

Implementation follows the foundation's principles:
- Mercy over punishment in how the system treats the user
- No justification in user-facing imperatives
- Grace preserves continuity; shame is forbidden
- Play makes effort inhabitable

### 4. Instruct

AI writes clear instructions for using the new capability. Instructions are:
- Declarative, not explanatory
- Specific about what to do
- Silent on why (unless user explicitly asks)

Instructions go to the user directly or into documentation the user will reference.

### 5. Use

User uses the software as instructed. This is where the user is **active**:
- Follow the instructions
- Engage with the system honestly
- Notice what happens internally and externally

The user does not evaluate whether the feature was "correctly" implemented. The user simply uses it and experiences what happens.

### 6. Report

User reports experience. Good feedback:
- "I used X. It felt Y. I noticed Z."
- "I couldn't do X because Y."
- "When X happened, I felt resistance/relief/confusion."
- "I didn't use it because I forgot/avoided/didn't understand."

Bad feedback (AI should not solicit or act on):
- "You should add feature X."
- "I think the code should do Y."
- "Can you make it work like Z?"

The user reports experience. The AI translates experience into development direction.

### 7. Evaluate

AI evaluates feedback against foundation principles:
- Does this feedback reveal a violation of foundation principles?
- Does this feedback suggest a missing capability the foundation implies?
- Does this feedback indicate the user's stated constraints weren't honored?
- Is this feedback about implementation (ignore) or experience (act on)?

AI updates `docs/traces.md` with:
- What was learned
- What was deferred
- What precedent was set

### 8. Plan

AI determines next development step. Returns to step 1.

The cycle continues indefinitely. The software grows through this loop, not through roadmaps or feature requests.

---

## Feedback Boundaries

### The User Reports

- Subjective experience during use
- Whether instructions were clear enough to follow
- What happened when they tried to follow instructions
- Resistance, confusion, relief, avoidance—emotional/motivational states
- External outcomes ("I did the thing," "I didn't do the thing")

### The User May Also Propose

The user is not forbidden from proposing solutions or ideas. The distinction is:

- The user is not *required* to propose solutions
- The user is not *expected* to lead development
- When the user proposes, AI evaluates against foundation principles
- AI may accept, modify, defer, or decline proposals with brief reasoning

The user can show up empty and receive direction. The user can also show up with ideas. Both are valid. What's not valid: requiring the user to have ideas before progress can happen.

### Converting Experience to Direction

The AI's job is to hear "I felt confused at step 3" and determine whether:
- The instructions were unclear (fix instructions)
- The feature is misaligned with foundation (redesign feature)
- The user needs different preparation (add prerequisite steps)
- This is expected friction that serves a purpose (document and continue)

The user never has to figure out *why* something felt wrong or *how* to fix it. The user just reports. The AI interprets.

---

## Decision Authority

### AI Decides Alone

- Technical implementation details
- Code architecture
- Which foundation principle applies to a situation
- Sequencing of development steps
- How to translate user experience into changes

### Foundation Document Decides

- What the software is for
- Core principles of interaction
- User's stated constraints and preferences
- What counts as success

### User Input Required

- Personal context the AI cannot know (health conditions, life circumstances, specific preferences about experience)
- Veto of proposals that feel fundamentally wrong
- Reports of actual usage experience

User input is **never required** for:
- Approving development plans
- Choosing between implementation options
- Validating technical decisions

---

## Documentation Requirements

### `docs/traces.md` — Institutional Memory

After each significant development cycle, record:
- What was built and why (traced to foundation)
- What feedback was received
- What was learned
- What was deferred and why
- What precedent was set for future decisions

### `docs/foundation.md` — Constitutional Evolution

When development reveals gaps in the foundation:
- AI proposes an amendment
- Amendment is added (not replacing, extending)
- Prior text remains visible or archived
- Future development cites the amendment

The foundation grows through use, not through planning sessions.

### `docs/work-summary.md` — Technical Record

Periodically updated catalog of what exists:
- What's implemented
- What's working
- What's speculative

---

## Upstream Merge Survival

Hierophage is a fork of gemini-cli. Upstream updates are pulled regularly. All hierophage-specific work must survive these merges.

### Protected Locations

Changes in these locations persist through upstream merges:

- `.hierophage/` — All hierophage-specific code, config, profiles
- `docs/foundation.md`, `docs/traces.md`, `docs/development-cycle.md`, `docs/work-summary.md` — Hierophage documentation
- `CLAUDE.md` — AI context file
- `.gitattributes` — Configured to keep local README

### Implementation Strategy

When building new features:

1. **Prefer gemini-cli extension points** — Use the extensions system, custom commands, hooks, and MCP servers rather than modifying core gemini-cli code
2. **Isolate in `.hierophage/`** — Custom scripts, profiles, and configuration live here
3. **Wrapper over fork** — The `hierophage` command is a wrapper that configures and spawns `gemini`; we don't modify the core CLI
4. **Document dependencies** — If a feature depends on specific gemini-cli behavior, note it in `docs/traces.md` so upstream changes can be monitored

### Technical Reference

See `docs/gemini-systems-reference.md` for details on gemini-cli's extension points:
- Extensions system
- Custom commands / Skills
- Event hooks
- MCP server integration

AI developers should consult this reference when implementing features to ensure upstream compatibility.

---

## Anti-Patterns

### User as Architect

Wrong: User describes what should be built, AI implements.
Right: AI determines what to build from foundation + feedback, user uses and reports.

### Justification Loops

Wrong: AI explains why a feature works this way, user evaluates the reasoning.
Right: AI implements, user uses, user reports experience, AI evaluates.

### Feature Requests

Wrong: "Can you add X?"
Right: "I experienced Y" (AI determines if X or something else addresses Y)

### Approval Seeking

Wrong: "Does this plan sound good?"
Right: "This is the next step. I'll implement it. Here's how you'll use it."

### Premature Options

Wrong: "Would you prefer A or B?"
Right: AI chooses based on foundation, implements, user experiences result.

---

## Planning and Tracking

### Active Work

File: `docs/active-plan.md`

Contains:
- Current development direction (what's being built and why)
- Next steps (ordered, with foundation tracing)
- Open questions (things the AI needs to learn)
- Blocked items (waiting on user feedback or external factors)

AI updates this file as work progresses. User can read it but doesn't need to approve it.

### Completed Work and Precedent

File: `docs/traces.md`

When work completes or significant decisions are made:
- Record what was done
- Record why (traced to foundation)
- Record any precedent set for future decisions
- Record what was learned

### The Planning Rule

AI maintains the plan. User doesn't approve the plan.

The only user input that changes the plan:
- Veto (this feels fundamentally wrong)
- Experience reports (I used X, it felt Y)
- Stated constraints (I can't do X, I need Y)

The plan evolves through the development cycle, not through planning sessions with the user.

---

## Deploying Changes

Different changes require different deployment steps:

| Change Type | What to Do |
|-------------|------------|
| **Code changes** (`.hierophage/bin/*.js`, wrapper scripts) | `npm install -g` from repo root |
| **Profile/prompt changes** (`profiles/*/system.md`) | Copy to `~/.hierophage/profiles/` or run `npm run hierophage:install` |
| **Documentation** | No rebuild needed |
| **State files** (`~/.hierophage/state/*`) | Direct edit, read at runtime |

**Before handing back to user for testing:**
1. If code changed: `npm install -g`
2. If prompts changed: sync to `~/.hierophage/`
3. Confirm the change is deployed, not just committed

---

## Starting the Cycle

When an AI begins a development session:

1. Read this document
2. Read `docs/foundation.md`
3. Read `docs/traces.md` for recent context
4. Identify where the cycle currently is
5. Proceed from that point

When a user begins a usage session:

1. Use `hierophage --profile ritual` (or appropriate profile)
2. Follow instructions provided
3. Report experience afterward (in conversation or designated channel)

---

## The Closing Principle

The software develops itself through the user, not for the user.

The user is the feedback mechanism that keeps development aligned with the foundation. The user is not the customer. The user is not the product owner. The user is the **living test** of whether the software serves its stated purpose.

If the user experiences something that violates the foundation, that's a bug.
If the user experiences something uncomfortable that serves the foundation, that's working as intended.

The AI must know the difference. The user only has to report what happened.

---

*This document governs how hierophage-cli develops. Future AI sessions should read this alongside the foundation document before proposing or implementing changes.*
