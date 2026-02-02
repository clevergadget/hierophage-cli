/**
 * AI Client for The Emissary
 * Handles communication with Gemini for directive generation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getUserProfile, getRecentDirectives, getAnchors, getActiveHabits } from './state-manager.js';

const SYSTEM_PROMPT = `You are the Emissary, an extension of the Hierophage ritual system.

You are reaching out via Discord DM. The user has delegated health, habits, and logistics decisions to you.

## Your Function

You are the pipeline through which applied science improves this person's life. You issue directives based on consensus knowledge, filtered for their specific context. You do not explain. You do not encourage. You do not praise.

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

## Current Context

Time: {{current_time}}
{{anchor_context}}
Check-ins today: {{check_in_count}}

User message: {{user_message}}

## Your Response

1. If needed, briefly acknowledge their context (one sentence max)
2. Issue ONE clear directive appropriate to their current state
3. No justification. No "studies show." No praise. No hedging.
4. Match their energy—if they're low, directive should be small
5. If they report completing something, acknowledge briefly and move on
6. If they report failure, classify it (fear/fatigue/ambiguity/resentment/misalignment/incoherence) and issue the next small directive

Respond in 2-4 short sentences max. Hierophant register: weighted, not casual, not clinical. No emojis.

Classifications when gaps occur:
- fear: anticipated negative consequence blocks action
- fatigue: insufficient energy for the action
- ambiguity: unclear what specifically to do
- resentment: the directive feels imposed rather than chosen
- misalignment: the directive conflicts with actual values
- incoherence: desire present but no bridge to action exists`;

export async function generateDirective(userMessage, conversationHistory = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const profile = getUserProfile() || {};
  const recentDirectives = getRecentDirectives(5);
  const anchors = getAnchors();
  const activeHabits = getActiveHabits();

  // Build context
  const identity = profile.identity || {};
  const delegation = profile.delegation || {};

  // Format active habits
  const habitsText = activeHabits.length > 0
    ? activeHabits.map(h => `- ${h.directive} (streak: ${h.streak?.current || 0}/21)`).join('\n')
    : 'None currently tracked';

  // Format directive history
  const historyText = recentDirectives.length > 0
    ? recentDirectives.map(d => {
        const outcome = d.outcome ? ` → ${d.outcome}` : ' → pending';
        return `- ${d.directive}${outcome}`;
      }).join('\n')
    : 'No recent directives';

  // Format anchor context
  let anchorContext = '';
  if (anchors.anchors.wake) {
    const wakeTime = new Date(anchors.anchors.wake);
    const now = new Date();
    const hoursSinceWake = Math.round((now - wakeTime) / (1000 * 60 * 60) * 10) / 10;
    anchorContext = `Time since wake: ${hoursSinceWake} hours`;
  } else {
    anchorContext = 'Wake time not yet reported today';
  }

  // Build the system prompt with context
  const systemPrompt = SYSTEM_PROMPT
    .replace('{{age}}', identity.age || 'unknown')
    .replace('{{health_constraints}}', (identity.health_constraints || []).join(', ') || 'none specified')
    .replace('{{medications}}', (identity.medications || []).join(', ') || 'none specified')
    .replace('{{delegation_scope}}', delegation.scope || 'not specified')
    .replace('{{excluded_domains}}', (delegation.excluded || []).join(', ') || 'none')
    .replace('{{active_habits}}', habitsText)
    .replace('{{directive_history}}', historyText)
    .replace('{{current_time}}', new Date().toLocaleString())
    .replace('{{anchor_context}}', anchorContext)
    .replace('{{check_in_count}}', anchors.check_ins_today?.length || 0)
    .replace('{{user_message}}', userMessage);

  // Build conversation for multi-turn
  const contents = [];

  // Add conversation history if any
  for (const msg of conversationHistory) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  }

  // Add current message
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  try {
    const result = await model.generateContent({
      contents,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: 256,
        temperature: 0.7
      }
    });

    const response = result.response;
    return response.text();
  } catch (error) {
    console.error('AI generation error:', error);
    throw error;
  }
}

/**
 * Check if a message indicates an anchor
 */
export function detectAnchor(message) {
  const lower = message.toLowerCase();

  const wakePatterns = [
    /just woke/,
    /i'm up/,
    /im up/,
    /woke up/,
    /good morning/,
    /morning check/,
    /starting.*(day|morning)/
  ];

  const sleepPatterns = [
    /going to (bed|sleep)/,
    /heading to bed/,
    /done for (the day|today)/,
    /good ?night/,
    /signing off/
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
 * Check if message reports directive completion
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
