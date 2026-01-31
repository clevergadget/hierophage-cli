# Active Plan

*Current development direction. AI maintains this. User reads but doesn't approve.*

---

## Current Direction

**Two parallel tracks:**

### Track 1: Ritual Profile (CLI)
The ritual profile is the entry point for the feedback loop. User arrives (potentially depleted), system solicits information, builds understanding, issues directives.

**Status: Active. Habit tracking system working. 7 habits being tracked.**

Recent work:
- Added foundation summary to system prompt (model knows WHY)
- Added self-monitoring checks (model verifies its own alignment)
- Created MCP server for state persistence (guaranteed writes)
- First intake session completed, user profile populated
- Implemented directive types: one-time vs recurring (habits)
- Added streak tracking for habit installation (21-day graduation threshold)
- Updated install script to handle MCP server deployment and configuration

### Track 2: Discord Bot ("The Emissary")
Extends ritual profile beyond CLI. Bot initiates contact at variable times (anchor-relative, not clock-based), asks what's happening, issues directives. Addresses ADHD need for flexible, context-aware reminders.

**Status: Spec complete, implementation not started.**

See `docs/discord-bot-spec.md` for full spec.

Foundation traces:
- "What This Is For" → the pipeline function, the low-energy entry point
- "The Epistemic Model" → no justification, authority already accepted
- "Oracle Mode" → direct imperatives for delegated domains
- ADHD support → anchor-relative timing, no shame for missed check-ins

---

## Completed This Session

1. ~~**Add foundation context to ritual prompt**~~ — Done. Model now knows the philosophical basis.
2. ~~**Add self-monitoring section**~~ — Done. Model has explicit checks for drift detection.
3. ~~**Fix state persistence issue**~~ — Done. Created MCP server with dedicated tools:
   - `hierophage_get_profile` — Load profile at session start
   - `hierophage_update_profile` — Update user info
   - `hierophage_add_directive` — Record issued directives
   - `hierophage_update_directive_outcome` — Record completion/failure
   - `hierophage_add_session_note` — Record session summaries
   - `hierophage_add_system_note` — Record self-monitoring observations
4. ~~**Populate user profile manually**~~ — Done. Intake data preserved.
5. ~~**Add deploying changes section to SDLC**~~ — Done. Documents when npm install -g vs file sync needed.
6. ~~**Write Discord bot spec**~~ — Done. See `docs/discord-bot-spec.md`.
7. ~~**Implement habit tracking**~~ — Done. MCP server v1.1.0 with:
   - Directive types: one-time vs recurring
   - Streak tracking with 21-day graduation threshold
   - New tools: `hierophage_record_habit_checkin`, `hierophage_graduate_habit`, `hierophage_get_active_habits`
   - Updated system prompt with directive type explanation

---

## Next Steps

### Ritual Profile (CLI)
1. ~~**Verify MCP persistence works**~~ — Confirmed working, 7 habits tracking with streaks
2. **Iterate based on feedback** — Adjust prompt, directive style based on experience reports
3. **Build pattern analysis** — Analyze compliance data over time to calibrate directives

### Discord Bot (The Emissary)
1. **Phase 1: Basic bot** — Discord connection, DM handling, AI integration, state persistence
2. **Phase 2: Timing system** — Anchor tracking, window calculation, scheduled check-ins
3. **Phase 3: Intelligence** — Context parsing, outcome tracking, directive calibration
4. **Phase 4: Polish** — CLI commands, setup wizard, error handling

### Infrastructure
1. ~~**Update install script**~~ — Done. Now copies MCP servers, runs npm install, configures gemini settings
2. **Document MCP server setup** — Add to README or separate doc

---

## Known Issues

- **Message duplication in ritual output** — Observed in first intake session. Likely gemini-cli display issue or model retry. Monitor.

---

## Open Questions

### For Ritual Profile
- Does the MCP server work reliably in practice?
- Is the directive style appropriate (single directive, no justification)?
- How often should self-monitoring verification happen?

### For Discord Bot
- Model choice: Gemini (matches CLI) or allow other providers?
- Conversation memory: How many exchanges before bot "forgets" current thread?
- Notification salience: Discord notifications might get lost—ways to make check-ins more noticeable?

### User Context (From Intake)
- Age: 43
- Health: ADHD, bipolar, medications (Ritalin, Ambien, Lamictal)
- Delegation: Broad scope, excludes things directly impacting girlfriend, THC for now
- Active habits (7 total):
  - Water upon waking (3/21 streak)
  - Morning stretching (2/21 streak)
  - Fiber and probiotic (2/21 streak)
  - 10am/3pm screen-free walks (1/21 streak)
  - Vitamin D, fish oil, multivitamin (1/21 streak)
  - Square breathing (1/21 streak)
  - Sensory mindfulness (0/21 streak)

---

## Files Changed This Session

- `docs/foundation.md` — Added "What This Is For" section
- `docs/development-cycle.md` — Added "Planning and Tracking", "Deploying Changes"
- `docs/active-plan.md` — This file
- `docs/discord-bot-spec.md` — New: Discord bot specification
- `.hierophage/profiles/ritual/system.md` — Foundation context, self-monitoring, MCP tools
- `.hierophage/mcp-servers/state-server.js` — State management MCP server v1.1.0 with habit tracking
- `.hierophage/mcp-servers/package.json` — MCP server dependencies
- `.hierophage/install-profiles.js` — Updated: Now handles MCP server installation and gemini config
- `~/.hierophage/state/user-profile.json` — Populated with intake data, 7 active habits

---

*Last updated: 2026-01-31*
