import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import {
  RequirementLifecycleSchema,
  type Requirement,
  type RequirementLifecycle,
} from '@aifactory/contracts';

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

export function findRequirementFile(id: string, dir: string): string | undefined {
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

export function parseRequirementMarkdown(id: string, markdown: string): Requirement {
  const { body, metadata } = splitFrontmatter(markdown);
  const lines = body.split('\n');

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

  return {
    id,
    title,
    description,
    acceptanceCriteria,
    nfr,
    lifecycle: parseLifecycle(id, metadata),
    rawMarkdown: markdown,
  };
}

function parseMarkdown(id: string, markdown: string): Requirement {
  return parseRequirementMarkdown(id, markdown);
}

export function updateRequirementMetadata(
  markdown: string,
  updates: Partial<RequirementLifecycle>,
): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error('Requirement lifecycle metadata is missing.');
  }
  const lines = match[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}:`));
    const serialized = serializeMetadataValue(key, value);
    if (index < 0) {
      const anchor = key === 'pipelineFast'
        ? lines.findIndex((line) => line.startsWith('executionMode:'))
        : lines.findIndex((line) => line.startsWith('createdFromCommit:'));
      lines.splice(anchor >= 0 ? anchor + 1 : lines.length, 0, `${key}: ${serialized}`);
    } else {
      lines[index] = `${key}: ${serialized}`;
    }
  }
  return `---\n${lines.join('\n')}\n---\n${markdown.slice(match[0].length)}`;
}

function serializeMetadataValue(key: string, value: unknown): string {
  if (typeof value !== 'string') return String(value);
  if (key === 'status' || key === 'executionMode' || key === 'repositoryProvider') {
    return value;
  }
  return JSON.stringify(value);
}

function splitFrontmatter(markdown: string): {
  body: string;
  metadata?: Record<string, string>;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: markdown };
  const metadata: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (!key) continue;
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try {
        metadata[key] = JSON.parse(raw) as string;
        continue;
      } catch {
        // Keep the literal value so validation can report a useful error below.
      }
    }
    metadata[key] = raw;
  }
  return { body: markdown.slice(match[0].length), metadata };
}

function parseLifecycle(
  requirementId: string,
  metadata?: Record<string, string>,
): RequirementLifecycle | undefined {
  if (!metadata) return undefined;
  const metadataId = metadata.id?.toUpperCase();
  if (metadataId !== requirementId.toUpperCase()) {
    throw new Error(
      `Requirement metadata ID "${metadata.id ?? ''}" does not match "${requirementId}".`,
    );
  }
  return RequirementLifecycleSchema.parse({
    status: metadata.status,
    executionMode: metadata.executionMode,
    pipelineFast:
      metadata.pipelineFast === undefined
        ? false
        : metadata.pipelineFast === 'true'
          ? true
          : metadata.pipelineFast === 'false'
            ? false
            : metadata.pipelineFast,
    createdByName: metadata.createdByName ?? '',
    createdByEmail: metadata.createdByEmail ?? '',
    createdAt: metadata.createdAt ?? '',
    branch: metadata.branch ?? '',
    createdFromCommit: metadata.createdFromCommit ?? '',
    repositoryProvider: metadata.repositoryProvider || undefined,
    gitlabIssueIid: parseOptionalPositiveInteger(metadata.gitlabIssueIid),
    gitlabIssueUrl: metadata.gitlabIssueUrl || undefined,
    gitlabMergeRequestIid: parseOptionalPositiveInteger(metadata.gitlabMergeRequestIid),
    gitlabMergeRequestUrl: metadata.gitlabMergeRequestUrl || undefined,
  });
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  return Number(value);
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
