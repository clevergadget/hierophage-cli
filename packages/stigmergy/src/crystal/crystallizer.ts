import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { scanTree } from '../tree/scanner.js';
import {
  CRYSTALLIZER_SYSTEM_PROMPT,
  buildBranchPrompt,
  buildOverviewPrompt,
  formatNodesForPrompt,
  diagnoseTreeHealth,
  formatHealthReport,
} from './prompts.js';
import { groupByBranch } from './mock-crystallizer.js';
import type {
  CrystalResult,
  CrystallizeResult,
  CrystallizerOptions,
} from './mock-crystallizer.js';
import type { AgentCost } from '../agents/agent.js';

/**
 * Crystallizer: reads the specification tree and produces markdown documents
 * using Gemini API. One document per top-level branch + an overview.
 */
export class Crystallizer {
  readonly name = 'Crystallizer';
  readonly isRealAI = true;
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(model = 'gemini-2.5-flash-lite', apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY is required. Set it as an environment variable or pass it to the constructor.',
      );
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  async crystallize(
    stigRoot: string,
    options: CrystallizerOptions = {},
  ): Promise<CrystallizeResult> {
    const workspacePath = join(stigRoot, 'workspace');
    const outputDir = options.outputDir ?? join(stigRoot, 'crystals');

    mkdirSync(outputDir, { recursive: true });

    const allNodes = scanTree(workspacePath);
    const root = allNodes.find((n) => n.path === '.');
    const rootGoal = root?.content ?? 'No goal specified';

    const branchMap = groupByBranch(allNodes, options.branches);

    const results: CrystalResult[] = [];
    const totalCost: AgentCost = { api_calls: 0, input_tokens: 0, output_tokens: 0 };

    for (const [branchName, nodes] of branchMap) {
      const branchNode = nodes[0]; // The top-level branch node
      const formatted = formatNodesForPrompt(nodes, branchName);
      const health = diagnoseTreeHealth(nodes);
      const healthReport = formatHealthReport(health);
      const prompt = buildBranchPrompt(rootGoal, branchNode, formatted, healthReport);

      const { text, cost, error } = await this.callModel(prompt);

      addCost(totalCost, cost);

      const outputPath = join(outputDir, `${branchName}.md`);
      if (text) {
        writeFileSync(outputPath, text, 'utf-8');
      }

      results.push({
        branch: branchName,
        outputPath,
        cost,
        nodeCount: nodes.length,
        error,
      });
    }

    // Overview synthesis
    let overview: CrystallizeResult['overview'];
    if (!options.skipOverview && results.length > 0) {
      const branchSummaries = results
        .filter((r) => !r.error)
        .map((r) => {
          const content = readFirstLines(r.outputPath, 40);
          return { name: r.branch, opening: content };
        });

      if (branchSummaries.length > 0) {
        const allHealth = diagnoseTreeHealth(allNodes);
        const overviewHealthReport = formatHealthReport(allHealth);
        const prompt = buildOverviewPrompt(rootGoal, branchSummaries, overviewHealthReport);
        const { text, cost, error } = await this.callModel(prompt);

        addCost(totalCost, cost);

        const overviewPath = join(outputDir, 'overview.md');
        if (text) {
          writeFileSync(overviewPath, text, 'utf-8');
        }
        overview = { outputPath: overviewPath, cost, error };
      }
    }

    return { branches: results, overview, totalCost };
  }

  private async callModel(
    prompt: string,
  ): Promise<{ text: string; cost: AgentCost; error?: string }> {
    const zeroCost: AgentCost = { api_calls: 1, input_tokens: 0, output_tokens: 0 };

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: CRYSTALLIZER_SYSTEM_PROMPT,
          temperature: 0.2,
        },
      });

      const cost: AgentCost = {
        api_calls: 1,
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };

      return { text: response.text ?? '', cost };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { text: '', cost: zeroCost, error: msg };
    }
  }
}

function addCost(total: AgentCost, add: AgentCost): void {
  total.api_calls += add.api_calls;
  total.input_tokens += add.input_tokens;
  total.output_tokens += add.output_tokens;
}

function readFirstLines(filePath: string, lineCount: number): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').slice(0, lineCount).join('\n');
  } catch {
    return '';
  }
}
