#!/usr/bin/env node
/**
 * Hierophage State Management MCP Server
 *
 * Provides reliable persistence for the ritual profile.
 *
 * Directive types:
 * - one-time: Complete once, done forever
 * - recurring: Habit being installed, tracks streaks until graduated
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

const STATE_DIR = path.join(homedir(), '.hierophage', 'state');
const PROFILE_PATH = path.join(STATE_DIR, 'user-profile.json');

// Default streak threshold for habit graduation
const DEFAULT_GRADUATION_THRESHOLD = 21;

// Ensure state directory exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Read profile, return empty object if doesn't exist
function readProfile() {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      const content = fs.readFileSync(PROFILE_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error reading profile:', e.message);
  }
  return {};
}

// Write profile
function writeProfile(profile) {
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
}

// Deep merge helper
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

const server = new Server(
  { name: 'hierophage-state', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'hierophage_get_profile',
      description: 'Get the current user profile. Returns all stored information about the user including identity, delegation scope, preferences, directive history, active habits, and session history.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'hierophage_update_profile',
      description: 'Update the user profile. Merges the provided fields with existing profile data. Use this to store new information learned about the user.',
      inputSchema: {
        type: 'object',
        properties: {
          updates: {
            type: 'object',
            description: 'Object containing fields to update. Will be deep-merged with existing profile.'
          }
        },
        required: ['updates']
      }
    },
    {
      name: 'hierophage_add_directive',
      description: 'Add a new directive. For one-time directives, tracks completion. For recurring directives (habits), tracks streaks until the habit is installed.',
      inputSchema: {
        type: 'object',
        properties: {
          directive: {
            type: 'string',
            description: 'The exact text of the directive issued'
          },
          type: {
            type: 'string',
            enum: ['one-time', 'recurring'],
            description: 'one-time: complete once. recurring: habit being installed, tracks streaks.'
          },
          frequency: {
            type: 'string',
            enum: ['daily', 'weekly', 'custom'],
            description: 'For recurring directives: how often it should be done. Defaults to daily.'
          },
          context: {
            type: 'string',
            description: 'Brief context about why this directive was issued'
          },
          notes: {
            type: 'string',
            description: 'Optional notes about the directive'
          },
          graduation_threshold: {
            type: 'number',
            description: 'For recurring: streak count needed to consider habit installed. Defaults to 21.'
          }
        },
        required: ['directive']
      }
    },
    {
      name: 'hierophage_record_habit_checkin',
      description: 'Record a check-in for a recurring directive (habit). Use this when the user reports on whether they did their habit today.',
      inputSchema: {
        type: 'object',
        properties: {
          directive_id: {
            type: 'string',
            description: 'The ID of the recurring directive'
          },
          done: {
            type: 'boolean',
            description: 'Whether the user did the habit (true) or missed it (false)'
          },
          notes: {
            type: 'string',
            description: 'Optional notes about this check-in'
          },
          classification: {
            type: 'string',
            enum: ['success', 'fear', 'fatigue', 'ambiguity', 'resentment', 'misalignment', 'incoherence'],
            description: 'Classification (especially useful for misses)'
          }
        },
        required: ['directive_id', 'done']
      }
    },
    {
      name: 'hierophage_update_directive_outcome',
      description: 'Update the outcome of a ONE-TIME directive. For recurring directives, use hierophage_record_habit_checkin instead.',
      inputSchema: {
        type: 'object',
        properties: {
          directive_id: {
            type: 'string',
            description: 'The ID of the directive to update (e.g., d_20260129_001)'
          },
          outcome: {
            type: 'string',
            enum: ['completed', 'partial', 'failed', 'skipped'],
            description: 'The outcome of the directive'
          },
          classification: {
            type: 'string',
            enum: ['fear', 'fatigue', 'ambiguity', 'resentment', 'misalignment', 'incoherence', 'success'],
            description: 'Classification of why the outcome occurred'
          },
          notes: {
            type: 'string',
            description: 'Additional notes about the outcome'
          }
        },
        required: ['directive_id', 'outcome']
      }
    },
    {
      name: 'hierophage_graduate_habit',
      description: 'Mark a recurring directive as graduated (habit installed). Use when the user has reached the streak threshold or the habit feels automatic.',
      inputSchema: {
        type: 'object',
        properties: {
          directive_id: {
            type: 'string',
            description: 'The ID of the recurring directive to graduate'
          },
          notes: {
            type: 'string',
            description: 'Notes about the graduation'
          }
        },
        required: ['directive_id']
      }
    },
    {
      name: 'hierophage_get_active_habits',
      description: 'Get all active recurring directives (habits being installed). Useful for check-ins.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      name: 'hierophage_add_session_note',
      description: 'Add a note to the session history. Use this at the end of each session to record what happened.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Type of session (e.g., intake, check-in, report)'
          },
          notes: {
            type: 'string',
            description: 'Summary of what happened in this session'
          }
        },
        required: ['notes']
      }
    },
    {
      name: 'hierophage_add_system_note',
      description: 'Add a system note for self-monitoring. Use this when you detect drift from foundation principles or need to record observations about your own behavior.',
      inputSchema: {
        type: 'object',
        properties: {
          note: {
            type: 'string',
            description: 'The observation or note to record'
          },
          category: {
            type: 'string',
            enum: ['drift', 'correction', 'observation', 'calibration'],
            description: 'Category of the note'
          }
        },
        required: ['note']
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'hierophage_get_profile': {
        const profile = readProfile();
        return {
          content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }]
        };
      }

      case 'hierophage_update_profile': {
        const profile = readProfile();
        const updated = deepMerge(profile, args.updates);
        writeProfile(updated);
        return {
          content: [{ type: 'text', text: 'Profile updated successfully.' }]
        };
      }

      case 'hierophage_add_directive': {
        const profile = readProfile();
        if (!profile.directive_history) {
          profile.directive_history = [];
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const count = profile.directive_history.filter(d =>
          d.id && d.id.startsWith(`d_${dateStr}`)
        ).length + 1;

        const type = args.type || 'one-time';
        const directive = {
          id: `d_${dateStr}_${String(count).padStart(3, '0')}`,
          issued_at: now.toISOString(),
          directive: args.directive,
          type: type,
          context: args.context || '',
          notes: args.notes || ''
        };

        if (type === 'one-time') {
          directive.outcome = 'pending';
        } else {
          // Recurring directive - habit tracking
          directive.frequency = args.frequency || 'daily';
          directive.status = 'active';
          directive.graduation_threshold = args.graduation_threshold || DEFAULT_GRADUATION_THRESHOLD;
          directive.streak = {
            current: 0,
            longest: 0,
            total_checkins: 0,
            total_done: 0,
            history: []
          };
        }

        profile.directive_history.push(directive);
        writeProfile(profile);

        const typeLabel = type === 'recurring' ? 'Recurring directive (habit)' : 'One-time directive';
        return {
          content: [{ type: 'text', text: `${typeLabel} recorded with ID: ${directive.id}` }]
        };
      }

      case 'hierophage_record_habit_checkin': {
        const profile = readProfile();
        if (!profile.directive_history) {
          return {
            content: [{ type: 'text', text: 'No directive history found.' }],
            isError: true
          };
        }

        const directive = profile.directive_history.find(d => d.id === args.directive_id);
        if (!directive) {
          return {
            content: [{ type: 'text', text: `Directive ${args.directive_id} not found.` }],
            isError: true
          };
        }

        if (directive.type !== 'recurring') {
          return {
            content: [{ type: 'text', text: `Directive ${args.directive_id} is not a recurring directive. Use hierophage_update_directive_outcome instead.` }],
            isError: true
          };
        }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // Check if there's already a check-in for today
        const existingToday = directive.streak.history.find(h =>
          h.date && h.date.startsWith(todayStr)
        );
        if (existingToday) {
          return {
            content: [{
              type: 'text',
              text: `Already checked in for this habit today (${existingToday.done ? 'done' : 'missed'}). Current streak: ${directive.streak.current}.`
            }]
          };
        }

        const checkin = {
          date: now.toISOString(),
          done: args.done,
          classification: args.classification || (args.done ? 'success' : 'unknown'),
          notes: args.notes || ''
        };

        directive.streak.history.push(checkin);
        directive.streak.total_checkins++;

        if (args.done) {
          directive.streak.current++;
          directive.streak.total_done++;
          if (directive.streak.current > directive.streak.longest) {
            directive.streak.longest = directive.streak.current;
          }
        } else {
          directive.streak.current = 0; // Reset streak on miss
        }

        directive.last_checkin = now.toISOString();

        // Check for auto-graduation
        let graduationNote = '';
        if (directive.streak.current >= directive.graduation_threshold && directive.status === 'active') {
          graduationNote = ` Streak has reached graduation threshold (${directive.graduation_threshold}). Consider graduating this habit.`;
        }

        writeProfile(profile);

        const status = args.done ? 'Done' : 'Missed';
        return {
          content: [{
            type: 'text',
            text: `Check-in recorded: ${status}. Current streak: ${directive.streak.current}. Longest: ${directive.streak.longest}.${graduationNote}`
          }]
        };
      }

      case 'hierophage_update_directive_outcome': {
        const profile = readProfile();
        if (!profile.directive_history) {
          return {
            content: [{ type: 'text', text: 'No directive history found.' }],
            isError: true
          };
        }

        const directive = profile.directive_history.find(d => d.id === args.directive_id);
        if (!directive) {
          return {
            content: [{ type: 'text', text: `Directive ${args.directive_id} not found.` }],
            isError: true
          };
        }

        if (directive.type === 'recurring') {
          return {
            content: [{ type: 'text', text: `Directive ${args.directive_id} is a recurring directive. Use hierophage_record_habit_checkin instead.` }],
            isError: true
          };
        }

        directive.outcome = args.outcome;
        directive.reported_at = new Date().toISOString();
        if (args.classification) directive.classification = args.classification;
        if (args.notes) directive.outcome_notes = args.notes;

        writeProfile(profile);

        return {
          content: [{ type: 'text', text: `Directive ${args.directive_id} outcome updated to: ${args.outcome}` }]
        };
      }

      case 'hierophage_graduate_habit': {
        const profile = readProfile();
        if (!profile.directive_history) {
          return {
            content: [{ type: 'text', text: 'No directive history found.' }],
            isError: true
          };
        }

        const directive = profile.directive_history.find(d => d.id === args.directive_id);
        if (!directive) {
          return {
            content: [{ type: 'text', text: `Directive ${args.directive_id} not found.` }],
            isError: true
          };
        }

        if (directive.type !== 'recurring') {
          return {
            content: [{ type: 'text', text: `Directive ${args.directive_id} is not a recurring directive.` }],
            isError: true
          };
        }

        directive.status = 'graduated';
        directive.graduated_at = new Date().toISOString();
        directive.graduation_notes = args.notes || '';
        directive.final_streak = directive.streak.current;

        writeProfile(profile);

        return {
          content: [{
            type: 'text',
            text: `Habit graduated! "${directive.directive.substring(0, 50)}..." is now installed. Final streak: ${directive.final_streak}. Total successful check-ins: ${directive.streak.total_done}/${directive.streak.total_checkins}.`
          }]
        };
      }

      case 'hierophage_get_active_habits': {
        const profile = readProfile();
        const activeHabits = (profile.directive_history || [])
          .filter(d => d.type === 'recurring' && d.status === 'active');

        if (activeHabits.length === 0) {
          return {
            content: [{ type: 'text', text: 'No active habits being tracked.' }]
          };
        }

        const summary = activeHabits.map(h => ({
          id: h.id,
          directive: h.directive,
          frequency: h.frequency,
          current_streak: h.streak.current,
          longest_streak: h.streak.longest,
          graduation_threshold: h.graduation_threshold,
          progress: `${h.streak.current}/${h.graduation_threshold}`,
          last_checkin: h.last_checkin || 'never'
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
        };
      }

      case 'hierophage_add_session_note': {
        const profile = readProfile();
        if (!profile.session_history) {
          profile.session_history = [];
        }

        const session = {
          date: new Date().toISOString(),
          type: args.type || 'session',
          notes: args.notes
        };

        profile.session_history.push(session);
        writeProfile(profile);

        return {
          content: [{ type: 'text', text: 'Session note recorded.' }]
        };
      }

      case 'hierophage_add_system_note': {
        const profile = readProfile();
        if (!profile.system_notes) {
          profile.system_notes = { entries: [] };
        }
        if (!profile.system_notes.entries) {
          profile.system_notes.entries = [];
        }

        profile.system_notes.entries.push({
          timestamp: new Date().toISOString(),
          category: args.category || 'observation',
          note: args.note
        });

        writeProfile(profile);

        return {
          content: [{ type: 'text', text: 'System note recorded.' }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
