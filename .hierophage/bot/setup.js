#!/usr/bin/env node

/**
 * Setup script for The Emissary
 * Configures Discord user ID and verifies tokens
 */

import { createInterface } from 'readline';
import { getBotConfig, saveBotConfig } from './state-manager.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n=== Hierophage Emissary Setup ===\n');

  const config = getBotConfig();

  // Discord User ID
  console.log('Your Discord User ID is needed so the bot knows who to respond to.');
  console.log('To find it: Discord Settings → Advanced → Enable Developer Mode');
  console.log('Then right-click your username → Copy User ID\n');

  const currentUserId = config.discord?.user_id;
  const userIdPrompt = currentUserId
    ? `Discord User ID [${currentUserId}]: `
    : 'Discord User ID: ';

  const userId = await question(userIdPrompt);
  if (userId.trim()) {
    config.discord = config.discord || {};
    config.discord.user_id = userId.trim();
  }

  // Verify user ID looks valid (Discord IDs are 17-19 digit numbers)
  const finalUserId = config.discord?.user_id;
  if (!finalUserId || !/^\d{17,19}$/.test(finalUserId)) {
    console.log('\nWarning: User ID should be a 17-19 digit number.');
    console.log('Example: 123456789012345678');
  }

  // Check for tokens in environment
  console.log('\n--- Token Check ---');

  if (process.env.DISCORD_TOKEN) {
    console.log('✓ DISCORD_TOKEN is set');
  } else {
    console.log('✗ DISCORD_TOKEN not set');
    console.log('  Set it with: export DISCORD_TOKEN=your_token_here');
  }

  if (process.env.GEMINI_API_KEY) {
    console.log('✓ GEMINI_API_KEY is set');
  } else {
    console.log('✗ GEMINI_API_KEY not set');
    console.log('  Set it with: export GEMINI_API_KEY=your_key_here');
  }

  // Save config
  saveBotConfig(config);
  console.log('\n✓ Configuration saved to ~/.hierophage/state/bot-config.json');

  // Show next steps
  console.log('\n--- Next Steps ---');
  console.log('1. Make sure both environment variables are set');
  console.log('2. Start the bot: npm start (from .hierophage/bot/)');
  console.log('3. Send a DM to your bot on Discord');
  console.log('');

  rl.close();
}

main().catch(console.error);
