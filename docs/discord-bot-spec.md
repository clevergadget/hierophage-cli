# Discord Bot Spec: The Emissary

*A Discord bot that reaches out, gathers context, and issues directives.*

---

## Overview

The Emissary is a Discord bot that extends the ritual profile beyond the CLI. It initiates contact at variable times, asks what's happening, and issues directives based on current context—not fixed schedules.

This addresses the ADHD challenge: fixed-time reminders fail because days aren't fixed. The Emissary works relative to your actual rhythm.

---

## Foundation Alignment

| Principle | How the Bot Honors It |
|-----------|----------------------|
| No justification | Directives are declarative. No "studies show..." |
| Grace over shame | Missed check-ins aren't mentioned. Just picks up where you are. |
| Context-aware | Always asks what's happening before issuing anything |
| Low friction | DM conversation, no app-switching, reply inline |
| Hierophant register | Same tone as ritual profile—weighted, not casual |
| Memory accumulates | Shares state with CLI; learns over time |

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    Your Machine                          │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ Discord Bot  │───▶│ Gemini API   │───▶│ Response  │  │
│  │ (Node.js)    │◀───│ (or other)   │◀───│           │  │
│  └──────┬───────┘    └──────────────┘    └───────────┘  │
│         │                                                │
│         ▼                                                │
│  ┌──────────────┐                                        │
│  │ State Files  │  ~/.hierophage/state/                  │
│  │ - user-profile.json                                   │
│  │ - directive-history.json                              │
│  │ - anchors.json                                        │
│  └──────────────┘                                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
         │
         │ WebSocket (outbound)
         ▼
┌─────────────────┐
│ Discord Servers │
└─────────────────┘
```

### Key Properties

- **Runs locally** — No cloud infrastructure needed
- **Connects outbound** — No public endpoints, no webhooks
- **Direct file access** — Reads/writes state files directly
- **Shares state with CLI** — Same `user-profile.json` as ritual profile

---

## Interaction Flow

### Initiated Check-In (Bot → User)

```
Bot:  Check in. What's happening right now?

User: just woke up, feeling groggy, have a meeting at 2

Bot:  Noted. Groggy morning, commitment at 2.

      Drink a full glass of water. Then sit outside for five
      minutes if weather permits. Don't check anything yet.

User: ok

Bot:  Acknowledged. I'll check back this afternoon.
```

### User-Initiated (User → Bot)

```
User: hey

Bot:  You're here. What's the situation?

User: i've been staring at my screen for an hour doing nothing

Bot:  Incoherence. The want is there but the bridge isn't.

      Stand up. Walk to another room. Stay there for two minutes.
      Then come back and tell me one small thing you could do
      in the next fifteen minutes.

User: i could reply to that one email

Bot:  Do that now. Nothing else. Tell me when it's done.
```

### Missed Check-In (No Shame)

```
[Bot sent check-in 3 hours ago, no response]

[User messages later]

User: sorry i missed your message earlier

Bot:  You're here now. What's happening?
```

No acknowledgment of the miss. No "that's okay!" No guilt. Just present-tense engagement.

---

## Timing System: Anchors

### The Problem with Fixed Times

- You wake up at different times
- Your days have different shapes
- 9am on Monday is nothing like 9am on Saturday
- Fixed reminders become noise or sources of shame

### Anchor-Relative Timing

Instead of clock times, the bot works relative to **anchors** you report:

| Anchor | Meaning |
|--------|---------|
| `wake` | You're awake and starting your day |
| `morning_settled` | Initial grogginess passed, somewhat functional |
| `midday` | Middle of your active period |
| `afternoon` | Energy often dips here |
| `evening` | Winding down |
| `sleep` | Done for the day |

### How It Works

1. **You report anchors** when they happen (or bot asks)
   - "hey" → Bot: "Morning or continuing from earlier?" → "just woke up" → Bot records `wake` anchor

2. **Bot calculates windows** relative to anchors
   - "2-3 hours after wake" not "10am"
   - "sometime in afternoon band" not "3pm"

3. **Windows are fuzzy, not precise**
   - Bot picks a random time within the window
   - Avoids predictability (which ADHD brains learn to tune out)

### Anchor Configuration

File: `~/.hierophage/state/anchors.json`

```json
{
  "today": "2026-01-28",
  "anchors": {
    "wake": "2026-01-28T10:32:00",
    "morning_settled": "2026-01-28T11:15:00"
  },
  "windows": {
    "post_wake": { "after_anchor": "wake", "delay_min": 30, "delay_max": 90 },
    "midday": { "after_anchor": "wake", "delay_min": 180, "delay_max": 300 },
    "afternoon": { "after_anchor": "wake", "delay_min": 360, "delay_max": 480 }
  },
  "check_ins_today": [
    { "window": "post_wake", "sent_at": "2026-01-28T11:02:00", "responded": true }
  ]
}
```

### Daily Reset

- Anchors reset each day (or when `wake` is reported)
- Bot asks for `wake` anchor if day starts without one
- If no wake reported by a configured time, bot can prompt: "Are you awake?"

---

## State Files

### user-profile.json (Shared with CLI)

Same file the ritual profile uses. Bot reads and appends to it.

```json
{
  "identity": {
    "age": 42,
    "timezone": "America/Los_Angeles",
    "health_constraints": ["bad back", "adhd"]
  },
  "delegation": {
    "domains": ["health", "habits", "logistics"],
    "excluded": ["finances", "relationships"]
  },
  "preferences": {
    "directive_style": "single_focus",
    "check_in_frequency": "2-3 per day"
  },
  "history": []
}
```

### directive-history.json (New)

Tracks what's been issued and outcomes.

```json
{
  "directives": [
    {
      "id": "d_20260128_001",
      "issued_at": "2026-01-28T11:02:00",
      "channel": "discord",
      "context": "just woke up, groggy",
      "directive": "Drink water, sit outside 5 min",
      "outcome": "completed",
      "reported_at": "2026-01-28T11:45:00",
      "notes": "said it helped"
    },
    {
      "id": "d_20260128_002",
      "issued_at": "2026-01-28T14:30:00",
      "channel": "discord",
      "context": "staring at screen, incoherence",
      "directive": "Stand, walk to another room, 2 min",
      "outcome": "partial",
      "classification": "fatigue"
    }
  ]
}
```

### bot-config.json (New)

Bot-specific configuration.

```json
{
  "discord": {
    "user_id": "123456789012345678",
    "dm_channel_id": null
  },
  "timing": {
    "default_windows": {
      "post_wake": { "after_anchor": "wake", "delay_min": 30, "delay_max": 90 },
      "midday": { "after_anchor": "wake", "delay_min": 180, "delay_max": 300 },
      "afternoon": { "after_anchor": "wake", "delay_min": 360, "delay_max": 480 }
    },
    "max_check_ins_per_day": 4,
    "quiet_hours": { "start": "22:00", "end": "08:00" }
  },
  "model": {
    "provider": "gemini",
    "model_id": "gemini-2.0-flash"
  }
}
```

---

## Bot Behavior

### On Startup

1. Load state files
2. Connect to Discord
3. Find or create DM channel with configured user
4. Calculate today's check-in windows based on anchors
5. Schedule timers for each window
6. Listen for incoming messages

### On Scheduled Check-In Window

1. Pick random time within window
2. At that time, send: "Check in. What's happening right now?"
3. Wait for response (no timeout pressure—ADHD-friendly)
4. When response arrives:
   - Parse context
   - Call AI with context + user profile + directive history
   - Send directive
   - Log to directive-history.json
5. If no response, do nothing. No follow-up. No shame.

### On User Message

1. Any message from user activates the bot
2. If message looks like an anchor report ("just woke up", "heading to bed"):
   - Record anchor
   - Recalculate windows
   - Respond briefly ("Noted. I'll check in later this morning.")
3. Otherwise, treat as check-in:
   - "You're here. What's the situation?" (if they just said "hey")
   - Or process their message as context directly
   - Issue directive

### On Directive Outcome Report

User reports what happened:
- "did it" / "done" → record as completed
- "couldn't" / "didn't" → ask briefly what happened, classify (fear/fatigue/etc.), record
- "partially" → record as partial, no judgment

### Message Parsing

The bot should handle natural language loosely. Examples:

| User says | Bot interprets |
|-----------|----------------|
| "hey" | Greeting, ask for context |
| "just woke up" | Wake anchor + check-in |
| "i'm up" | Wake anchor |
| "done for today" | Sleep anchor |
| "did the thing" | Last directive completed |
| "couldn't do it, too tired" | Directive failed, classify as fatigue |
| Anything else | Context for next directive |

---

## AI Integration

### System Prompt for Bot Context

The bot sends context to the AI with a specialized system prompt:

```markdown
You are the Emissary, an extension of the Hierophage ritual system.

You are reaching out via Discord DM. The user has ADHD and has delegated
health, habits, and logistics decisions to you.

Current context from user: [their message]

User profile: [from user-profile.json]

Recent directive history: [last 3-5 directives and outcomes]

Current time: [timestamp]
Time since wake: [calculated]
Check-ins today: [count]

Your task:
1. If needed, briefly acknowledge their context (one sentence max)
2. Issue ONE clear directive appropriate to their current state
3. No justification. No "studies show." No praise. No hedging.
4. Match their energy—if they're low, directive should be small
5. If they report failure, classify it (fear/fatigue/ambiguity/resentment/misalignment/incoherence) and issue next directive

Respond in 2-4 short sentences max. Hierophant register: weighted, not casual, not clinical.
```

### Model Selection

- Default: Gemini Flash (fast, cheap, good enough for short exchanges)
- Could use same model as CLI, configured in bot-config.json
- Conversation is short—latency matters more than depth

---

## Privacy and Security

### Local-Only by Default

- All state files on local machine
- Bot runs locally
- No cloud storage of conversations
- Discord sees the messages (unavoidable), but no third-party storage

### Bot Token Security

- Discord bot token stored in environment variable or secure local file
- Not committed to repo
- `.hierophage/secrets/` with restrictive permissions, gitignored

### User ID Verification

- Bot only responds to configured user ID
- Ignores messages from anyone else
- DM-only (no server channels)

---

## File Structure

```
.hierophage/
├── bot/
│   ├── emissary.js           # Main bot script
│   ├── ai-client.js          # Gemini/AI integration
│   ├── state-manager.js      # Read/write state files
│   ├── timing.js             # Anchor and window calculations
│   ├── message-parser.js     # Natural language interpretation
│   └── package.json
├── state/
│   ├── user-profile.json     # Shared with CLI
│   ├── directive-history.json
│   ├── anchors.json
│   └── bot-config.json
└── secrets/
    └── discord-token         # Bot token (gitignored)
```

---

## Commands

### Starting the Bot

```bash
hierophage bot start          # Start emissary in foreground
hierophage bot start --daemon # Start in background
hierophage bot stop           # Stop background bot
hierophage bot status         # Check if running
```

### Configuration

```bash
hierophage bot setup          # Interactive setup (Discord token, user ID)
hierophage bot config         # Show current config
hierophage bot config set timing.max_check_ins_per_day 3
```

### Manual Actions

```bash
hierophage bot check-in       # Trigger immediate check-in
hierophage bot history        # Show recent directives
hierophage bot anchors        # Show today's anchors
```

---

## Edge Cases

### No Wake Anchor Reported

If it's past quiet hours end and no wake anchor:
- Wait until user messages, or
- Send one gentle prompt: "Are you awake?" (configurable, can disable)

### User Goes Silent for Days

- No shame, no "where have you been"
- When they return, just: "You're here. What's happening?"
- Maybe internally flag for lighter directives initially (recalibration)

### Multiple Rapid Messages

- User sends several messages before bot responds
- Concatenate into single context, respond once

### Computer Off / Bot Not Running

- No check-ins happen
- When bot starts again, recalculates windows for remaining day
- No backfill, no catch-up, no guilt

### Directive Conflicts with CLI Session

- User might get directive via Discord, then open CLI
- CLI should be able to see recent directives from history file
- Both channels share state; neither is authoritative over the other

---

## Future Extensions

### Additional Channels

- SMS via Twilio (if needed for away-from-computer)
- Slack (same architecture, different API)
- Mobile app (much larger scope)

### Smarter Timing

- Learn from patterns (user usually responds faster in mornings)
- Adjust window probability based on historical response rates
- Back off if repeatedly ignored (not as punishment, as calibration)

### Integration with Calendar

- Know about upcoming commitments
- Adjust directives accordingly ("you have a meeting in 30 min, don't start anything deep")

### Voice Interface

- Discord voice channel integration
- Speak directive, user acknowledges verbally
- Much lower friction than typing

---

## Implementation Phases

### Phase 1: Basic Bot

- [ ] Discord connection and DM capability
- [ ] User message handling
- [ ] AI integration for directive generation
- [ ] Basic state persistence (profile, history)

### Phase 2: Timing System

- [ ] Anchor tracking
- [ ] Window calculation
- [ ] Scheduled check-ins
- [ ] Quiet hours

### Phase 3: Intelligence

- [ ] Context parsing improvements
- [ ] Outcome tracking and classification
- [ ] Directive calibration based on history

### Phase 4: Polish

- [ ] CLI commands for bot management
- [ ] Setup wizard
- [ ] Graceful error handling
- [ ] Logging and debugging tools

---

## Open Questions

1. **Model choice**: Use Gemini (matches CLI) or allow other providers?
2. **Conversation memory**: How many exchanges before bot "forgets" current thread?
3. **Multi-device**: If user has Discord on phone and computer, bot handles both identically?
4. **Notification sound**: Discord notifications might get lost—any way to make check-ins more salient?

---

*This spec will evolve through implementation and user feedback.*
