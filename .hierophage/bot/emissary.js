#!/usr/bin/env node

/**
 * The Emissary - Discord Bot for Hierophage
 *
 * Extends the ritual profile beyond the CLI.
 * Initiates contact, gathers context, issues directives.
 */

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import {
  getBotConfig,
  saveBotConfig,
  getUserProfile,
  addDirective,
  updateDirectiveOutcome,
  getPendingDirective,
  setAnchor,
  getAnchors,
  recordCheckIn,
  markCheckInResponded
} from './state-manager.js';
import { generateDirective, detectAnchor, detectOutcome } from './ai-client.js';

// Conversation memory per user (in-memory, resets on restart)
const conversationMemory = new Map();
const MAX_MEMORY_TURNS = 6;

/**
 * Get or create conversation history for a user
 */
function getConversation(userId) {
  if (!conversationMemory.has(userId)) {
    conversationMemory.set(userId, []);
  }
  return conversationMemory.get(userId);
}

/**
 * Add to conversation history, maintaining max length
 */
function addToConversation(userId, role, content) {
  const conv = getConversation(userId);
  conv.push({ role, content, timestamp: Date.now() });

  // Keep only recent turns
  while (conv.length > MAX_MEMORY_TURNS * 2) {
    conv.shift();
  }
}

/**
 * Clear conversation (e.g., when topic changes significantly)
 */
function clearConversation(userId) {
  conversationMemory.set(userId, []);
}

/**
 * Main bot class
 */
class Emissary {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
      ],
      partials: [Partials.Channel, Partials.Message]
    });

    this.config = getBotConfig();
    this.scheduledCheckIns = [];

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.once('ready', () => this.onReady());
    this.client.on('messageCreate', (msg) => this.onMessage(msg));
    this.client.on('error', (error) => console.error('Discord error:', error));
  }

  async onReady() {
    console.log(`Emissary online as ${this.client.user.tag}`);

    // Verify we have a configured user
    if (!this.config.discord?.user_id) {
      console.error('No user_id configured. Run setup first.');
      return;
    }

    // Try to establish DM channel
    try {
      const user = await this.client.users.fetch(this.config.discord.user_id);
      const dmChannel = await user.createDM();
      this.config.discord.dm_channel_id = dmChannel.id;
      saveBotConfig(this.config);
      console.log(`DM channel established with user ${user.username}`);
    } catch (error) {
      console.error('Could not establish DM channel:', error.message);
    }

    // Schedule check-ins based on anchors
    this.scheduleCheckIns();
  }

  async onMessage(message) {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only respond to configured user
    if (message.author.id !== this.config.discord?.user_id) {
      console.log(`Ignoring message from non-configured user: ${message.author.id}`);
      return;
    }

    // Only respond in DMs
    if (!message.channel.isDMBased()) return;

    console.log(`Message from ${message.author.username}: ${message.content}`);

    // Mark any pending check-in as responded
    markCheckInResponded();

    try {
      await this.handleUserMessage(message);
    } catch (error) {
      console.error('Error handling message:', error);
      await message.reply('Something went wrong. Try again.');
    }
  }

  async handleUserMessage(message) {
    const content = message.content.trim();
    const userId = message.author.id;

    // Check for anchor
    const anchor = detectAnchor(content);
    if (anchor) {
      setAnchor(anchor);
      console.log(`Anchor recorded: ${anchor}`);

      // Reschedule check-ins if wake anchor
      if (anchor === 'wake') {
        this.scheduleCheckIns();
      }
    }

    // Check for outcome report
    const outcome = detectOutcome(content);
    if (outcome) {
      const pending = getPendingDirective();
      if (pending) {
        updateDirectiveOutcome(pending.id, outcome, content);
        console.log(`Outcome recorded for ${pending.id}: ${outcome}`);
      }
    }

    // Get conversation history
    const history = getConversation(userId);

    // Generate response
    const response = await generateDirective(content, history);

    // Add to memory
    addToConversation(userId, 'user', content);
    addToConversation(userId, 'assistant', response);

    // Extract and record any directive from the response
    // (Simple heuristic: if response contains an imperative, it's a directive)
    if (this.looksLikeDirective(response)) {
      addDirective({
        context: content,
        directive: response,
        type: 'one-time'
      });
    }

    // Send response
    await message.reply(response);
  }

  /**
   * Simple heuristic to detect if response contains a directive
   */
  looksLikeDirective(text) {
    // Directives typically start with verbs or contain imperative language
    const imperativeStarters = [
      /^(drink|eat|stand|walk|sit|breathe|close|open|take|do|go|stop|start|wait|write|read|call|send|check|look|notice|observe)/i,
      /\. (Drink|Eat|Stand|Walk|Sit|Breathe|Close|Open|Take|Do|Go|Stop|Start|Wait|Write|Read|Call|Send|Check|Look|Notice|Observe)/
    ];

    return imperativeStarters.some(pattern => pattern.test(text));
  }

  /**
   * Schedule check-ins based on anchors and config
   */
  scheduleCheckIns() {
    // Clear existing schedules
    this.scheduledCheckIns.forEach(timeout => clearTimeout(timeout));
    this.scheduledCheckIns = [];

    const anchors = getAnchors();
    const windows = this.config.timing?.default_windows || {};

    // If no wake anchor, can't schedule relative check-ins
    if (!anchors.anchors.wake) {
      console.log('No wake anchor yet. Waiting for user to report.');
      return;
    }

    const wakeTime = new Date(anchors.anchors.wake);
    const now = new Date();
    const checkInsToday = anchors.check_ins_today?.length || 0;
    const maxCheckIns = this.config.timing?.max_check_ins_per_day || 4;

    if (checkInsToday >= maxCheckIns) {
      console.log(`Already hit max check-ins (${maxCheckIns}) for today`);
      return;
    }

    // Schedule each window that hasn't passed
    for (const [windowName, windowConfig] of Object.entries(windows)) {
      // Skip if this window already had a check-in
      const alreadyCheckedIn = anchors.check_ins_today?.some(c => c.window === windowName);
      if (alreadyCheckedIn) continue;

      // Calculate window time range
      const minMs = windowConfig.delay_min * 60 * 1000;
      const maxMs = windowConfig.delay_max * 60 * 1000;

      const windowStart = new Date(wakeTime.getTime() + minMs);
      const windowEnd = new Date(wakeTime.getTime() + maxMs);

      // Skip if window has passed
      if (now > windowEnd) continue;

      // Pick random time within remaining window
      const effectiveStart = now > windowStart ? now : windowStart;
      const rangeMs = windowEnd.getTime() - effectiveStart.getTime();
      const randomDelay = Math.random() * rangeMs;
      const checkInTime = new Date(effectiveStart.getTime() + randomDelay);

      // Check quiet hours
      if (this.isQuietHours(checkInTime)) {
        console.log(`Skipping ${windowName} - falls in quiet hours`);
        continue;
      }

      const delayMs = checkInTime.getTime() - now.getTime();

      console.log(`Scheduling ${windowName} check-in for ${checkInTime.toLocaleTimeString()} (in ${Math.round(delayMs / 60000)} min)`);

      const timeout = setTimeout(() => {
        this.initiateCheckIn(windowName);
      }, delayMs);

      this.scheduledCheckIns.push(timeout);
    }
  }

  /**
   * Check if a time falls within quiet hours
   */
  isQuietHours(time) {
    const quietHours = this.config.timing?.quiet_hours;
    if (!quietHours) return false;

    const hours = time.getHours();
    const minutes = time.getMinutes();
    const timeMinutes = hours * 60 + minutes;

    const [startH, startM] = quietHours.start.split(':').map(Number);
    const [endH, endM] = quietHours.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startMinutes > endMinutes) {
      return timeMinutes >= startMinutes || timeMinutes < endMinutes;
    }

    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  }

  /**
   * Initiate a scheduled check-in
   */
  async initiateCheckIn(windowName) {
    console.log(`Initiating ${windowName} check-in`);

    const dmChannelId = this.config.discord?.dm_channel_id;
    if (!dmChannelId) {
      console.error('No DM channel configured');
      return;
    }

    try {
      const channel = await this.client.channels.fetch(dmChannelId);

      // Record check-in
      recordCheckIn(windowName);

      // Send check-in message
      await channel.send('Check in. What\'s happening right now?');

    } catch (error) {
      console.error('Error sending check-in:', error);
    }
  }

  /**
   * Start the bot
   */
  async start() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.error('DISCORD_TOKEN environment variable not set');
      console.error('Set it with: export DISCORD_TOKEN=your_token_here');
      process.exit(1);
    }

    // Verify Gemini API key
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY environment variable not set');
      console.error('Set it with: export GEMINI_API_KEY=your_key_here');
      process.exit(1);
    }

    // Verify user profile exists
    const profile = getUserProfile();
    if (!profile) {
      console.warn('Warning: No user profile found. Run ritual profile intake first.');
    }

    // Verify config has user ID
    if (!this.config.discord?.user_id) {
      console.error('No Discord user ID configured.');
      console.error('Run: node setup.js');
      process.exit(1);
    }

    console.log('Starting Emissary...');
    await this.client.login(token);
  }
}

// Run if executed directly
const emissary = new Emissary();
emissary.start().catch(console.error);

export default Emissary;
