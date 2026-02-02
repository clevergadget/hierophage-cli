/**
 * Hierophage Core State Module
 *
 * Shared state management for CLI (MCP server) and Discord bot.
 * Single source of truth for habit tracking, directives, cross-channel awareness.
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

// ============================================
// Profile Management
// ============================================

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

export function saveUserProfile(profile) {
  writeFileSync(USER_PROFILE_PATH, JSON.stringify(profile, null, 2));
}

export function updateUserProfile(updates) {
  const profile = getUserProfile() || {};
  Object.assign(profile, updates);
  saveUserProfile(profile);
  return profile;
}

// ============================================
// Cross-Channel Awareness
// ============================================

export function getLastInteraction(channel = null) {
  const profile = getUserProfile();
  if (!profile?.interactions) return null;

  if (channel) {
    return profile.interactions[channel] || null;
  }

  // Return most recent across all channels
  let latest = null;
  for (const [ch, data] of Object.entries(profile.interactions)) {
    if (!latest || new Date(data.timestamp) > new Date(latest.timestamp)) {
      latest = { channel: ch, ...data };
    }
  }
  return latest;
}

export function recordInteraction(channel, type, summary = '') {
  const profile = getUserProfile() || {};
  profile.interactions = profile.interactions || {};

  profile.interactions[channel] = {
    timestamp: new Date().toISOString(),
    type,
    summary
  };

  saveUserProfile(profile);
  return profile.interactions[channel];
}

export function hasInteractedToday(channel = null) {
  const today = new Date().toISOString().slice(0, 10);

  if (channel) {
    const interaction = getLastInteraction(channel);
    return interaction && interaction.timestamp.startsWith(today);
  }

  // Check any channel
  const profile = getUserProfile();
  if (!profile?.interactions) return false;

  for (const data of Object.values(profile.interactions)) {
    if (data.timestamp.startsWith(today)) return true;
  }
  return false;
}

export function getTodayInteractions() {
  const today = new Date().toISOString().slice(0, 10);
  const profile = getUserProfile();
  if (!profile?.interactions) return [];

  const result = [];
  for (const [channel, data] of Object.entries(profile.interactions)) {
    if (data.timestamp.startsWith(today)) {
      result.push({ channel, ...data });
    }
  }
  return result.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// ============================================
// Directive Management
// ============================================

export function getDirectives(options = {}) {
  const profile = getUserProfile();
  if (!profile?.directive_history) return [];

  let directives = profile.directive_history;

  if (options.type) {
    directives = directives.filter(d => d.type === options.type);
  }

  if (options.status) {
    directives = directives.filter(d => d.status === options.status);
  }

  if (options.channel) {
    directives = directives.filter(d => d.channel === options.channel);
  }

  if (options.limit) {
    directives = directives.slice(-options.limit);
  }

  return directives;
}

export function getActiveHabits() {
  return getDirectives({ type: 'recurring', status: 'active' });
}

export function getRecentDirectives(count = 5) {
  return getDirectives({ limit: count }).reverse();
}

export function addDirective(directive) {
  const profile = getUserProfile() || { directive_history: [] };
  profile.directive_history = profile.directive_history || [];

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `d_${dateStr}_${String(profile.directive_history.length + 1).padStart(3, '0')}`;

  const entry = {
    id,
    issued_at: new Date().toISOString(),
    ...directive
  };

  // Set defaults based on type
  if (entry.type === 'recurring') {
    entry.status = entry.status || 'active';
    entry.graduation_threshold = entry.graduation_threshold || 21;
    entry.streak = entry.streak || {
      current: 0,
      longest: 0,
      total_checkins: 0,
      total_done: 0,
      history: []
    };
  } else {
    entry.type = entry.type || 'one-time';
    entry.outcome = entry.outcome || 'pending';
  }

  profile.directive_history.push(entry);
  saveUserProfile(profile);

  return entry;
}

export function getPendingDirective(channel = null) {
  const profile = getUserProfile();
  if (!profile?.directive_history) return null;

  for (let i = profile.directive_history.length - 1; i >= 0; i--) {
    const d = profile.directive_history[i];
    if (d.type !== 'recurring' && !d.outcome) {
      if (!channel || d.channel === channel) {
        return d;
      }
    }
  }
  return null;
}

export function updateDirectiveOutcome(directiveId, outcome, notes = '') {
  const profile = getUserProfile();
  if (!profile?.directive_history) return false;

  const directive = profile.directive_history.find(d => d.id === directiveId);
  if (!directive) return false;

  directive.outcome = outcome;
  directive.outcome_reported_at = new Date().toISOString();
  if (notes) directive.outcome_notes = notes;

  saveUserProfile(profile);
  return true;
}

// ============================================
// Habit Check-in (Streak Tracking)
// ============================================

export function recordHabitCheckin(directiveId, done, classification = 'success', notes = '') {
  const profile = getUserProfile();
  if (!profile?.directive_history) return { error: 'No profile found' };

  const directive = profile.directive_history.find(d => d.id === directiveId);
  if (!directive) return { error: 'Directive not found' };
  if (directive.type !== 'recurring') return { error: 'Not a recurring directive' };

  const today = new Date().toISOString().slice(0, 10);

  // Check for same-day duplicate
  const lastCheckin = directive.streak?.history?.slice(-1)[0];
  if (lastCheckin && lastCheckin.date.startsWith(today)) {
    return {
      error: 'Already checked in today',
      streak: directive.streak
    };
  }

  // Initialize streak if needed
  directive.streak = directive.streak || {
    current: 0,
    longest: 0,
    total_checkins: 0,
    total_done: 0,
    history: []
  };

  // Record the check-in
  directive.streak.history.push({
    date: new Date().toISOString(),
    done,
    classification,
    notes
  });

  directive.streak.total_checkins++;

  if (done) {
    directive.streak.current++;
    directive.streak.total_done++;
    if (directive.streak.current > directive.streak.longest) {
      directive.streak.longest = directive.streak.current;
    }
  } else {
    directive.streak.current = 0;
  }

  directive.last_checkin = new Date().toISOString();

  saveUserProfile(profile);

  return {
    done,
    streak: directive.streak
  };
}

export function graduateHabit(directiveId, notes = '') {
  const profile = getUserProfile();
  if (!profile?.directive_history) return { error: 'No profile found' };

  const directive = profile.directive_history.find(d => d.id === directiveId);
  if (!directive) return { error: 'Directive not found' };
  if (directive.type !== 'recurring') return { error: 'Not a recurring directive' };

  directive.status = 'graduated';
  directive.graduated_at = new Date().toISOString();
  if (notes) directive.graduation_notes = notes;

  saveUserProfile(profile);

  return { graduated: true, directive };
}

// ============================================
// Session Notes
// ============================================

export function addSessionNote(type, notes, channel = 'cli') {
  const profile = getUserProfile() || {};
  profile.session_history = profile.session_history || [];

  profile.session_history.push({
    date: new Date().toISOString(),
    type,
    notes,
    channel
  });

  saveUserProfile(profile);
  return profile.session_history.slice(-1)[0];
}

// ============================================
// Bot Config
// ============================================

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
      model_id: 'gemini-2.5-pro'
    }
  };
}

// ============================================
// Anchors (Time-relative scheduling)
// ============================================

export function getAnchors() {
  const today = new Date().toISOString().slice(0, 10);

  if (!existsSync(ANCHORS_PATH)) {
    return { today, anchors: {}, check_ins_today: [] };
  }

  try {
    const anchors = JSON.parse(readFileSync(ANCHORS_PATH, 'utf-8'));

    // Reset if new day
    if (anchors.today !== today) {
      return { today, anchors: {}, check_ins_today: [] };
    }

    return anchors;
  } catch (e) {
    console.error('Error reading anchors:', e.message);
    return { today, anchors: {}, check_ins_today: [] };
  }
}

export function setAnchor(name, timestamp = new Date().toISOString()) {
  const anchors = getAnchors();
  anchors.anchors[name] = timestamp;
  writeFileSync(ANCHORS_PATH, JSON.stringify(anchors, null, 2));
  return anchors;
}

export function recordScheduledCheckIn(window, responded = false) {
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

export function markCheckInResponded() {
  const anchors = getAnchors();
  if (anchors.check_ins_today?.length > 0) {
    anchors.check_ins_today[anchors.check_ins_today.length - 1].responded = true;
    writeFileSync(ANCHORS_PATH, JSON.stringify(anchors, null, 2));
  }
  return anchors;
}
