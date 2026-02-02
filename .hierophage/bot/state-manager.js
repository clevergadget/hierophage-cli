/**
 * State Manager for The Emissary
 * Shares state files with the CLI's MCP server
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STATE_DIR = join(homedir(), '.hierophage', 'state');
const USER_PROFILE_PATH = join(STATE_DIR, 'user-profile.json');
const BOT_CONFIG_PATH = join(STATE_DIR, 'bot-config.json');
const ANCHORS_PATH = join(STATE_DIR, 'anchors.json');

// Ensure state directory exists
if (!existsSync(STATE_DIR)) {
  mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * Load user profile (shared with CLI)
 */
export function getUserProfile() {
  if (!existsSync(USER_PROFILE_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(USER_PROFILE_PATH, 'utf-8'));
  } catch (e) {
    console.error('Error reading user profile:', e.message);
    return null;
  }
}

/**
 * Get recent directives from user profile
 */
export function getRecentDirectives(count = 5) {
  const profile = getUserProfile();
  if (!profile?.directive_history) return [];

  return profile.directive_history
    .slice(-count)
    .reverse();
}

/**
 * Get active recurring habits
 */
export function getActiveHabits() {
  const profile = getUserProfile();
  if (!profile?.directive_history) return [];

  return profile.directive_history.filter(d =>
    d.type === 'recurring' && d.status === 'active'
  );
}

/**
 * Add a directive to history (via the shared profile)
 */
export function addDirective(directive) {
  const profile = getUserProfile() || { directive_history: [] };

  const id = `d_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${String(profile.directive_history.length + 1).padStart(3, '0')}`;

  const entry = {
    id,
    issued_at: new Date().toISOString(),
    channel: 'discord',
    ...directive
  };

  profile.directive_history = profile.directive_history || [];
  profile.directive_history.push(entry);

  writeFileSync(USER_PROFILE_PATH, JSON.stringify(profile, null, 2));

  return entry;
}

/**
 * Update directive outcome
 */
export function updateDirectiveOutcome(directiveId, outcome, notes = '') {
  const profile = getUserProfile();
  if (!profile?.directive_history) return false;

  const directive = profile.directive_history.find(d => d.id === directiveId);
  if (!directive) return false;

  directive.outcome = outcome;
  directive.outcome_reported_at = new Date().toISOString();
  if (notes) directive.outcome_notes = notes;

  writeFileSync(USER_PROFILE_PATH, JSON.stringify(profile, null, 2));
  return true;
}

/**
 * Get the most recent pending directive
 */
export function getPendingDirective() {
  const profile = getUserProfile();
  if (!profile?.directive_history) return null;

  // Find most recent directive without an outcome
  for (let i = profile.directive_history.length - 1; i >= 0; i--) {
    const d = profile.directive_history[i];
    if (d.channel === 'discord' && !d.outcome) {
      return d;
    }
  }
  return null;
}

/**
 * Load bot configuration
 */
export function getBotConfig() {
  if (!existsSync(BOT_CONFIG_PATH)) {
    return getDefaultBotConfig();
  }
  try {
    return JSON.parse(readFileSync(BOT_CONFIG_PATH, 'utf-8'));
  } catch (e) {
    console.error('Error reading bot config:', e.message);
    return getDefaultBotConfig();
  }
}

/**
 * Save bot configuration
 */
export function saveBotConfig(config) {
  writeFileSync(BOT_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getDefaultBotConfig() {
  return {
    discord: {
      user_id: null,
      dm_channel_id: null
    },
    timing: {
      default_windows: {
        post_wake: { after_anchor: 'wake', delay_min: 30, delay_max: 90 },
        midday: { after_anchor: 'wake', delay_min: 180, delay_max: 300 },
        afternoon: { after_anchor: 'wake', delay_min: 360, delay_max: 480 }
      },
      max_check_ins_per_day: 4,
      quiet_hours: { start: '22:00', end: '08:00' }
    },
    model: {
      provider: 'gemini',
      model_id: 'gemini-2.0-flash'
    }
  };
}

/**
 * Load today's anchors
 */
export function getAnchors() {
  const today = new Date().toISOString().slice(0, 10);

  if (!existsSync(ANCHORS_PATH)) {
    return { today, anchors: {}, check_ins_today: [] };
  }

  try {
    const anchors = JSON.parse(readFileSync(ANCHORS_PATH, 'utf-8'));

    // Reset if it's a new day
    if (anchors.today !== today) {
      return { today, anchors: {}, check_ins_today: [] };
    }

    return anchors;
  } catch (e) {
    console.error('Error reading anchors:', e.message);
    return { today, anchors: {}, check_ins_today: [] };
  }
}

/**
 * Record an anchor
 */
export function setAnchor(name, timestamp = new Date().toISOString()) {
  const anchors = getAnchors();
  anchors.anchors[name] = timestamp;
  writeFileSync(ANCHORS_PATH, JSON.stringify(anchors, null, 2));
  return anchors;
}

/**
 * Record a check-in
 */
export function recordCheckIn(window, responded = false) {
  const anchors = getAnchors();
  anchors.check_ins_today = anchors.check_ins_today || [];
  anchors.check_ins_today.push({
    window,
    sent_at: new Date().toISOString(),
    responded
  });
  writeFileSync(ANCHORS_PATH, JSON.stringify(anchors, null, 2));
  return anchors;
}

/**
 * Mark last check-in as responded
 */
export function markCheckInResponded() {
  const anchors = getAnchors();
  if (anchors.check_ins_today?.length > 0) {
    anchors.check_ins_today[anchors.check_ins_today.length - 1].responded = true;
    writeFileSync(ANCHORS_PATH, JSON.stringify(anchors, null, 2));
  }
  return anchors;
}
