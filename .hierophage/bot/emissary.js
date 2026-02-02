#!/usr/bin/env node

/**
 * The Emissary - Discord Bot for Hierophage
 *
 * Extends the ritual profile beyond the CLI.
 * Initiates contact, gathers context, issues directives.
 * Uses shared core modules for feature parity with CLI.
 */

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Import shared core modules
import {
  getUserProfile,
  getBotConfig,
  saveBotConfig,
  addDirective,
  updateDirectiveOutcome,
  getPendingDirective,
  getActiveHabits,
  getRecentDirectives,
  recordHabitCheckin,
  setAnchor,
  getAnchors,
  recordScheduledCheckIn,
  markCheckInResponded,
  recordInteraction,
  getTodayInteractions,
  hasInteractedToday,
  addSessionNote
} from '../core/state.js';

import {
  buildEmissaryPrompt,
  detectAnchor,
  detectOutcome,
  looksLikeDirective
} from '../core/prompts.js';

// Conversation memory per user (in-memory, resets on restart)
const conversationMemory = new Map();
const MAX_MEMORY_TURNS = 6;

function getConversation(userId) {
  if (!conversationMemory.has(userId)) {
    conversationMemory.set(userId, []);
  }
  return conversationMemory.get(userId);
}

function addToConversation(userId, role, content) {
  const conv = getConversation(userId);
  conv.push({ role, content, timestamp: Date.now() });

  while (conv.length > MAX_MEMORY_TURNS * 2) {
    conv.shift();
  }
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
    this.genAI = null;

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.once('ready', () => this.onReady());
    this.client.on('messageCreate', (msg) => this.onMessage(msg));
    this.client.on('error', (error) => console.error('Discord error:', error));
  }

  async onReady() {
    console.log(`Emissary online as ${this.client.user.tag}`);

    if (!this.config.discord?.user_id) {
      console.error('No user_id configured. Run setup first.');
      return;
    }

    try {
      const user = await this.client.users.fetch(this.config.discord.user_id);
      const dmChannel = await user.createDM();
      this.config.discord.dm_channel_id = dmChannel.id;
      saveBotConfig(this.config);
      console.log(`DM channel established with user ${user.username}`);
    } catch (error) {
      console.error('Could not establish DM channel:', error.message);
    }

    this.scheduleCheckIns();
  }

  async onMessage(message) {
    if (message.author.bot) return;

    if (message.author.id !== this.config.discord?.user_id) {
      console.log(`Ignoring message from non-configured user: ${message.author.id}`);
      return;
    }

    if (!message.channel.isDMBased()) return;

    console.log(`Message from ${message.author.username}: ${message.content}`);

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

      if (anchor === 'wake') {
        this.scheduleCheckIns();
      }
    }

    // Check for outcome report
    const outcome = detectOutcome(content);
    if (outcome) {
      const pending = getPendingDirective('discord');
      if (pending) {
        updateDirectiveOutcome(pending.id, outcome, content);
        console.log(`Outcome recorded for ${pending.id}: ${outcome}`);
      }
    }

    // Record this interaction
    recordInteraction('discord', 'check-in', content.slice(0, 50));

    // Build context for AI
    const profile = getUserProfile() || {};
    const activeHabits = getActiveHabits();
    const recentDirectives = getRecentDirectives(5);
    const todayInteractions = getTodayInteractions();
    const anchors = getAnchors();

    const systemPrompt = buildEmissaryPrompt({
      profile,
      activeHabits,
      recentDirectives,
      todayInteractions,
      anchors,
      userMessage: content
    });

    // Get conversation history
    const history = getConversation(userId);

    // Generate response
    const response = await this.generateResponse(content, systemPrompt, history);

    // Add to memory
    addToConversation(userId, 'user', content);
    addToConversation(userId, 'assistant', response);

    // Record directive if present
    if (looksLikeDirective(response)) {
      addDirective({
        context: content,
        directive: response,
        type: 'one-time',
        channel: 'discord'
      });
    }

    await message.reply(response);
  }

  async generateResponse(userMessage, systemPrompt, conversationHistory = []) {
    const modelId = this.config.model?.model_id || 'gemini-3-pro-preview';
    const model = this.genAI.getGenerativeModel({ model: modelId });

    const contents = [];

    for (const msg of conversationHistory) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    try {
      const result = await model.generateContent({
        contents,
        systemInstruction: systemPrompt,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7
        }
      });

      return result.response.text();
    } catch (error) {
      console.error('AI generation error:', error);
      throw error;
    }
  }

  scheduleCheckIns() {
    this.scheduledCheckIns.forEach(timeout => clearTimeout(timeout));
    this.scheduledCheckIns = [];

    const anchors = getAnchors();
    const windows = this.config.timing?.default_windows || {};

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

    for (const [windowName, windowConfig] of Object.entries(windows)) {
      const alreadyCheckedIn = anchors.check_ins_today?.some(c => c.window === windowName);
      if (alreadyCheckedIn) continue;

      const minMs = windowConfig.delay_min * 60 * 1000;
      const maxMs = windowConfig.delay_max * 60 * 1000;

      const windowStart = new Date(wakeTime.getTime() + minMs);
      const windowEnd = new Date(wakeTime.getTime() + maxMs);

      if (now > windowEnd) continue;

      const effectiveStart = now > windowStart ? now : windowStart;
      const rangeMs = windowEnd.getTime() - effectiveStart.getTime();
      const randomDelay = Math.random() * rangeMs;
      const checkInTime = new Date(effectiveStart.getTime() + randomDelay);

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

    if (startMinutes > endMinutes) {
      return timeMinutes >= startMinutes || timeMinutes < endMinutes;
    }

    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  }

  async initiateCheckIn(windowName) {
    console.log(`Initiating ${windowName} check-in`);

    const dmChannelId = this.config.discord?.dm_channel_id;
    if (!dmChannelId) {
      console.error('No DM channel configured');
      return;
    }

    try {
      const channel = await this.client.channels.fetch(dmChannelId);

      recordScheduledCheckIn(windowName);

      await channel.send('Check in. What\'s happening right now?');

    } catch (error) {
      console.error('Error sending check-in:', error);
    }
  }

  async start() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.error('DISCORD_TOKEN environment variable not set');
      process.exit(1);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY environment variable not set');
      process.exit(1);
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    const profile = getUserProfile();
    if (!profile) {
      console.warn('Warning: No user profile found. Run ritual profile intake first.');
    }

    if (!this.config.discord?.user_id) {
      console.error('No Discord user ID configured. Run: node setup.js');
      process.exit(1);
    }

    console.log('Starting Emissary...');
    console.log(`Model: ${this.config.model?.model_id || 'gemini-3-pro-preview'}`);
    await this.client.login(token);
  }
}

const emissary = new Emissary();
emissary.start().catch(console.error);

export default Emissary;
