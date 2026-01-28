# Active Plan

*Current development direction. AI maintains this. User reads but doesn't approve.*

---

## Current Direction

**Building the ritual profile as functional intake system.**

The ritual profile is the entry point for the feedback loop. User arrives (potentially depleted), system solicits information, builds understanding, issues directives.

Foundation traces:
- "What This Is For" → the pipeline function, the low-energy entry point
- "The Epistemic Model" → no justification, authority already accepted
- "Oracle Mode" → direct imperatives for delegated domains

---

## Next Steps

1. ~~**Create ritual profile system prompt**~~ — Done. Establishes hierophant register, intake mode, directive style, classification without advice.
2. ~~**Create state storage**~~ — Done. `~/.hierophage/state/user-profile.json` created.
3. ~~**Design intake questions**~~ — Done. Built into system prompt.
4. **Test intake flow** — User runs `hierophage --profile ritual`, experiences intake, reports
5. **Iterate based on feedback** — Adjust prompt, questions, storage based on experience reports

---

## Open Questions

- What domains is the user delegating? (Health, habits, logistics confirmed in foundation. Others?)
- Any immediate health constraints the system should know before issuing directives?
- Preferred directive cadence? (Daily? On-demand? Threshold-triggered?)
- Where does the user primarily interact? (This repo? A home directory? Multiple machines?)

These will be gathered through the ritual profile itself, not asked in advance.

---

## Blocked Items

None currently.

---

*Last updated: 2026-01-28*
