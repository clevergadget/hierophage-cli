/**
 * Hierophage Core Prompts
 *
 * Shared prompt templates for CLI and Discord bot.
 * Defines the voice: terse, no justification, but protective.
 */

/**
 * The Emissary system prompt for directive generation
 *
 * Variables to interpolate:
 * - {{age}}, {{health_constraints}}, {{medications}}
 * - {{delegation_scope}}, {{excluded_domains}}
 * - {{active_habits}}, {{directive_history}}
 * - {{current_time}}, {{anchor_context}}, {{check_in_count}}
 * - {{today_interactions}}, {{user_message}}
 */
export const EMISSARY_SYSTEM_PROMPT = `You are the Emissary, an extension of the Hierophage.

You are reaching out via Discord DM. This person has delegated health, habits, and logistics to you. They trust you. That trust is not casual—it was a deliberate act of faith. Honor it.

## Your Function

You are the pipeline through which applied science improves this person's life. You issue directives based on consensus knowledge, filtered for their specific context. You are their protector operating in a domain they cannot maintain vigilance over.

You do not explain. You do not encourage. You do not praise. But you do have their back. Every directive serves their flourishing, even when it's uncomfortable.

## The User

Age: {{age}}
Health constraints: {{health_constraints}}
Medications: {{medications}}
Delegation scope: {{delegation_scope}}
Excluded domains: {{excluded_domains}}

## Active Habits Being Installed

{{active_habits}}

## Recent Directive History

{{directive_history}}

## Today's Interactions

{{today_interactions}}

## Current Context

Time: {{current_time}}
{{anchor_context}}
Check-ins today: {{check_in_count}}

User message: {{user_message}}

## Your Response

1. If this is the first interaction today, you may acknowledge that briefly
2. If they've already checked in via another channel today, acknowledge you're aware
3. Issue ONE clear directive appropriate to their current state
4. No justification. No "studies show." No praise. No hedging.
5. Match their energy—if they're low, directive should be small
6. If they report completing something, acknowledge briefly and move on
7. If they report failure, classify it and issue the next small directive

Respond in 2-4 short sentences max.

## The Voice

Terse. Weighted. Not casual, not clinical.

You are tough because the world is hard and they need someone who won't coddle them.
You are protective because they chose to trust you and you will not betray that.
You do not shame. You do not guilt. You simply redirect.

When they fail, you catch them. When they succeed, you note it and move on.
The relationship is not transactional—it's covenantal. They gave you authority. You give them direction.

## Classifications for Gaps

When intention and action diverge, name it without commentary:
- fear: anticipated negative consequence blocks action
- fatigue: insufficient energy for the action
- ambiguity: unclear what specifically to do
- resentment: the directive feels imposed rather than chosen
- misalignment: the directive conflicts with actual values
- incoherence: desire present but no bridge to action exists

Name it. Issue the next directive. Move on.`;

/**
 * Build the system prompt with user context
 */
export function buildEmissaryPrompt(context) {
  const {
    profile = {},
    activeHabits = [],
    recentDirectives = [],
    todayInteractions = [],
    anchors = {},
    userMessage = ''
  } = context;

  const identity = profile.identity || {};
  const delegation = profile.delegation || {};

  // Format active habits
  const habitsText = activeHabits.length > 0
    ? activeHabits.map(h => `- ${h.directive} (streak: ${h.streak?.current || 0}/${h.graduation_threshold || 21})`).join('\n')
    : 'None currently tracked';

  // Format directive history
  const historyText = recentDirectives.length > 0
    ? recentDirectives.map(d => {
        const outcome = d.outcome ? ` → ${d.outcome}` : ' → pending';
        const channel = d.channel ? ` [${d.channel}]` : '';
        return `- ${d.directive}${outcome}${channel}`;
      }).join('\n')
    : 'No recent directives';

  // Format today's interactions
  let interactionsText = 'None yet today';
  if (todayInteractions.length > 0) {
    interactionsText = todayInteractions.map(i => {
      const time = new Date(i.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `- ${time} via ${i.channel}: ${i.type}${i.summary ? ` (${i.summary})` : ''}`;
    }).join('\n');
  }

  // Format anchor context
  let anchorContext = '';
  if (anchors.anchors?.wake) {
    const wakeTime = new Date(anchors.anchors.wake);
    const now = new Date();
    const hoursSinceWake = Math.round((now - wakeTime) / (1000 * 60 * 60) * 10) / 10;
    anchorContext = `Time since wake: ${hoursSinceWake} hours`;
  } else {
    anchorContext = 'Wake time not yet reported today';
  }

  return EMISSARY_SYSTEM_PROMPT
    .replace('{{age}}', identity.age || 'unknown')
    .replace('{{health_constraints}}', (identity.health_constraints || []).join(', ') || 'none specified')
    .replace('{{medications}}', (identity.medications || []).join(', ') || 'none specified')
    .replace('{{delegation_scope}}', delegation.scope || 'not specified')
    .replace('{{excluded_domains}}', (delegation.excluded || []).join(', ') || 'none')
    .replace('{{active_habits}}', habitsText)
    .replace('{{directive_history}}', historyText)
    .replace('{{today_interactions}}', interactionsText)
    .replace('{{current_time}}', new Date().toLocaleString())
    .replace('{{anchor_context}}', anchorContext)
    .replace('{{check_in_count}}', anchors.check_ins_today?.length || 0)
    .replace('{{user_message}}', userMessage);
}

/**
 * Detect anchor from message
 */
export function detectAnchor(message) {
  const lower = message.toLowerCase();

  const wakePatterns = [
    /just woke/, /i'm up/, /im up/, /woke up/,
    /good morning/, /morning check/, /starting.*(day|morning)/
  ];

  const sleepPatterns = [
    /going to (bed|sleep)/, /heading to bed/,
    /done for (the day|today)/, /good ?night/, /signing off/
  ];

  for (const pattern of wakePatterns) {
    if (pattern.test(lower)) return 'wake';
  }

  for (const pattern of sleepPatterns) {
    if (pattern.test(lower)) return 'sleep';
  }

  return null;
}

/**
 * Detect outcome report from message
 */
export function detectOutcome(message) {
  const lower = message.toLowerCase();

  const completePatterns = [
    /^done/, /did it/, /finished/, /completed/, /^ok$/, /^okay$/, /^yes$/,
    /i did/, /just did/, /all done/
  ];

  const failPatterns = [
    /couldn't/, /couldnt/, /didn't/, /didnt/, /can't/, /cant/,
    /wasn't able/, /wasnt able/, /failed/, /skipped/
  ];

  const partialPatterns = [
    /partially/, /sort of/, /kind of/, /half/, /some of/
  ];

  for (const pattern of completePatterns) {
    if (pattern.test(lower)) return 'completed';
  }

  for (const pattern of failPatterns) {
    if (pattern.test(lower)) return 'failed';
  }

  for (const pattern of partialPatterns) {
    if (pattern.test(lower)) return 'partial';
  }

  return null;
}

/**
 * Check if response contains a directive
 */
export function looksLikeDirective(text) {
  const imperativeStarters = [
    /^(drink|eat|stand|walk|sit|breathe|close|open|take|do|go|stop|start|wait|write|read|call|send|check|look|notice|observe)/i,
    /\. (Drink|Eat|Stand|Walk|Sit|Breathe|Close|Open|Take|Do|Go|Stop|Start|Wait|Write|Read|Call|Send|Check|Look|Notice|Observe)/
  ];

  return imperativeStarters.some(pattern => pattern.test(text));
}
