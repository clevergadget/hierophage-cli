# Active Plan

*Current development direction. AI maintains this. User reads but doesn't approve.*

---

## Current Direction

**Two parallel tracks:**

### Track 1: Ritual Profile (CLI)
The ritual profile is the entry point for the feedback loop. User arrives (potentially depleted), system solicits information, builds understanding, issues directives. **Status: Ready for testing.**

### Track 2: Discord Bot ("The Emissary")
Extends ritual profile beyond CLI. Bot initiates contact at variable times (anchor-relative, not clock-based), asks what's happening, issues directives. Addresses ADHD need for flexible, context-aware reminders. **Status: Spec complete, implementation not started.**

See `docs/discord-bot-spec.md` for full spec.

Foundation traces:
- "What This Is For" → the pipeline function, the low-energy entry point
- "The Epistemic Model" → no justification, authority already accepted
- "Oracle Mode" → direct imperectives for delegated domains
- ADHD support → anchor-relative timing, no shame for missed check-ins

---

## Next Steps

### Ritual Profile (CLI)
1. ~~**Create ritual profile system prompt**~~ — Done.
2. ~~**Create state storage**~~ — Done.
3. ~~**Design intake questions**~~ — Done.
4. **Test intake flow** — User runs `hierophage --profile ritual`, experiences intake, reports
5. **Iterate based on feedback** — Adjust prompt, questions, storage based on experience reports

### Discord Bot (The Emissary)
1. ~~**Write spec**~~ — Done. See `docs/discord-bot-spec.md`
2. **Phase 1: Basic bot** — Discord connection, DM handling, AI integration, state persistence
3. **Phase 2: Timing system** — Anchor tracking, window calculation, scheduled check-ins
4. **Phase 3: Intelligence** — Context parsing, outcome tracking, directive calibration
5. **Phase 4: Polish** — CLI commands, setup wizard, error handling

---

## Open Questions

### For Ritual Profile Intake
- Domains, constraints, preferences — gathered through intake conversation

### For Discord Bot
- Model choice: Gemini (matches CLI) or allow other providers?
- Conversation memory: How many exchanges before bot "forgets" current thread?
- Notification salience: Discord notifications might get lost—ways to make check-ins more noticeable?

### For Both
- ADHD noted as health constraint — will inform directive style (smaller chunks, more flexibility)

---

## Blocked Items

None currently.

---

*Last updated: 2026-01-28*
