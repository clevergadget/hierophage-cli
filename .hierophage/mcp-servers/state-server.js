#!/usr/bin/env node
/**
 * Hierophage State Management MCP Server
 *
 * Provides reliable persistence for the ritual profile.
 * Tools:
 * - hierophage_get_profile: Read current user profile
 * - hierophage_update_profile: Update profile fields (merges)
 * - hierophage_add_directive: Add a directive to history
 * - hierophage_add_session_note: Add a note to session history
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
  { name: 'hierophage-state', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'hierophage_get_profile',
      description: 'Get the current user profile. Returns all stored information about the user including identity, delegation scope, preferences, directive history, and session history.',
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
      description: 'Add a new directive to the directive history. Use this whenever you issue a directive to the user.',
      inputSchema: {
        type: 'object',
        properties: {
          directive: {
            type: 'string',
            description: 'The exact text of the directive issued'
          },
          context: {
            type: 'string',
            description: 'Brief context about why this directive was issued'
          },
          notes: {
            type: 'string',
            description: 'Optional notes about the directive'
          }
        },
        required: ['directive']
      }
    },
    {
      name: 'hierophage_update_directive_outcome',
      description: 'Update the outcome of a previously issued directive. Use this when the user reports on whether they completed a directive.',
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

        const directive = {
          id: `d_${dateStr}_${String(count).padStart(3, '0')}`,
          issued_at: now.toISOString(),
          directive: args.directive,
          context: args.context || '',
          outcome: 'pending',
          notes: args.notes || ''
        };

        profile.directive_history.push(directive);
        writeProfile(profile);

        return {
          content: [{ type: 'text', text: `Directive recorded with ID: ${directive.id}` }]
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

        directive.outcome = args.outcome;
        directive.reported_at = new Date().toISOString();
        if (args.classification) directive.classification = args.classification;
        if (args.notes) directive.outcome_notes = args.notes;

        writeProfile(profile);

        return {
          content: [{ type: 'text', text: `Directive ${args.directive_id} outcome updated to: ${args.outcome}` }]
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
