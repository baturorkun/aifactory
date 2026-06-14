import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import type { Requirement } from '@aifactory/contracts';

// ============================================================
// PUBLIC API
// ============================================================

export function parseRequirement(requirementId: string, requirementsDir: string): Requirement {
  const dir = resolve(requirementsDir);
  const filePath = findRequirementFile(requirementId, dir);

  if (!filePath) {
    throw new Error(
      `Requirement file not found for ID "${requirementId}" in ${dir}.\n` +
        `Create: requirements/${requirementId}.md`,
    );
  }

  const rawMarkdown = readFileSync(filePath, 'utf8');
  return parseMarkdown(requirementId, rawMarkdown);
}

// ============================================================
// FILE DISCOVERY
// ============================================================

function findRequirementFile(id: string, dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;

  // Exact match
  for (const ext of ['.md', '.markdown']) {
    const p = join(dir, `${id}${ext}`);
    if (existsSync(p)) return p;
  }

  // Prefix match: RQ-0001 → RQ-0001-feature-name.md
  const files = readdirSync(dir);
  const match = files.find(
    (f) => f.startsWith(`${id}-`) && (f.endsWith('.md') || f.endsWith('.markdown')),
  );
  if (match) return join(dir, match);

  return undefined;
}

// ============================================================
// MARKDOWN PARSER
// ============================================================

function parseMarkdown(id: string, markdown: string): Requirement {
  const lines = markdown.split('\n');

  // Title: first H1
  const titleLine = lines.find((l) => l.startsWith('# '));
  const title = titleLine ? titleLine.slice(2).trim() : id;

  const sections = splitSections(lines);

  // Description: intro section (between title and first H2)
  const description = (sections['intro'] ?? '').trim();

  // Acceptance criteria
  const acKey = findSectionKey(sections, [
    'acceptance criteria',
    'acceptance',
    'criteria',
    'ac',
  ]);
  const acceptanceCriteria = extractBullets(sections[acKey] ?? '');

  // NFR
  const nfrKey = findSectionKey(sections, [
    'non-functional requirements',
    'non-functional',
    'nfr',
  ]);
  const nfr = extractBullets(sections[nfrKey] ?? '');

  return { id, title, description, acceptanceCriteria, nfr, rawMarkdown: markdown };
}

function splitSections(lines: string[]): Record<string, string> {
  const sections: Record<string, string> = {};
  let key = 'intro';
  const buf: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      sections[key] = buf.join('\n');
      buf.length = 0;
      key = line.slice(3).toLowerCase().trim();
    } else if (!line.startsWith('# ')) {
      buf.push(line);
    }
  }
  sections[key] = buf.join('\n');
  return sections;
}

function findSectionKey(sections: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (c in sections) return c;
  }
  return '';
}

function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => /^[-*+•]\s/.test(l.trim()))
    .map((l) => l.replace(/^[-*+•]\s+/, '').trim())
    .filter(Boolean);
}
