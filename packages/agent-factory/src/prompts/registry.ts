import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { AgentRole } from '@aifactory/contracts';

/**
 * Loads versioned prompt files from the prompts directory.
 * File naming: <role>.md  (e.g. planner.md, coder.md)
 * Caches in memory for the lifetime of the process.
 */
export class PromptRegistry {
  private readonly cache = new Map<string, string>();

  constructor(private readonly promptsDir: string) {}

  get(role: AgentRole): string {
    if (this.cache.has(role)) return this.cache.get(role)!;

    const filePath = resolve(join(this.promptsDir, `${role}.md`));
    if (!existsSync(filePath)) {
      throw new Error(
        `Prompt file not found: ${filePath}\n` +
          `Expected: packages/agent-factory/prompts/${role}.md`,
      );
    }

    const content = readFileSync(filePath, 'utf8');
    this.cache.set(role, content);
    return content;
  }

  /** Force reload a prompt (e.g. after editing during development). */
  invalidate(role?: AgentRole): void {
    if (role) {
      this.cache.delete(role);
    } else {
      this.cache.clear();
    }
  }
}
