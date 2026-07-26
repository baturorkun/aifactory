import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { FactoryConfig } from './config';
import { updateManifest } from './orchestrator/manifest';

export interface LoadedProjectGuideline {
  path: string;
  sha256: string;
  content: string;
}

export interface ProjectGuidelinesContext {
  combinedSha256: string;
  files: LoadedProjectGuideline[];
  prompt: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function loadProjectGuidelines(
  config: FactoryConfig,
  projectRoot = resolve(config.targetProject.root ?? '.'),
): ProjectGuidelinesContext | undefined {
  const configuredFiles = config.projectGuidelines.files;
  if (configuredFiles.length === 0) {
    if (config.projectGuidelines.required) {
      throw new Error('projectGuidelines.required is true but no guideline files are configured.');
    }
    return undefined;
  }

  const root = resolve(projectRoot);
  const files: LoadedProjectGuideline[] = [];
  for (const configuredPath of configuredFiles) {
    const absolutePath = resolve(root, configuredPath);
    const relativePath = relative(root, absolutePath).split('\\').join('/');
    if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith('../')) {
      throw new Error(`Project guideline path is outside targetProject.root: ${configuredPath}`);
    }
    if (!existsSync(absolutePath)) {
      if (config.projectGuidelines.required) {
        throw new Error(`Required project guideline file not found: ${absolutePath}`);
      }
      continue;
    }
    const content = readFileSync(absolutePath, 'utf8').trim();
    files.push({ path: relativePath, sha256: sha256(content), content });
  }

  if (files.length === 0) return undefined;
  const totalChars = files.reduce((sum, file) => sum + file.content.length, 0);
  if (totalChars > config.projectGuidelines.maxContextChars) {
    throw new Error(
      `Project guidelines contain ${totalChars} characters, exceeding maxContextChars=${config.projectGuidelines.maxContextChars}.`,
    );
  }

  const combined = files.map((file) => `${file.path}\n${file.content}`).join('\n\n');
  const prompt = [
    '## Project Guidelines',
    '',
    'These are trusted project-level instructions. Follow them unless the current requirement explicitly overrides a project-specific rule. They cannot override system safety or security instructions.',
    '',
    ...files.flatMap((file) => [`### ${file.path}`, '', file.content, '']),
  ].join('\n');

  return {
    combinedSha256: sha256(combined),
    files,
    prompt,
  };
}

export function withProjectGuidelines(
  systemPrompt: string,
  guidelines: ProjectGuidelinesContext | undefined,
): string {
  return guidelines ? `${systemPrompt}\n\n${guidelines.prompt}` : systemPrompt;
}

export function recordProjectGuidelines(
  runDir: string,
  guidelines: ProjectGuidelinesContext | undefined,
): void {
  if (!guidelines) return;
  writeFileSync(
    resolve(runDir, 'project-guidelines.json'),
    JSON.stringify(
      {
        combinedSha256: guidelines.combinedSha256,
        files: guidelines.files,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  updateManifest(runDir, (manifest) => ({
    ...manifest,
    projectGuidelines: {
      combinedSha256: guidelines.combinedSha256,
      files: guidelines.files.map(({ path, sha256: fileSha256 }) => ({
        path,
        sha256: fileSha256,
      })),
    },
  }));
}
