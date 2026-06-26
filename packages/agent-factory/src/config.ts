import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

// ============================================================
// MODEL CONFIG — discriminated union so TypeScript can narrow
// ============================================================

const OllamaModelSchema = z.object({
  provider: z.literal('ollama'),
  name: z.string(),
  reviewerName: z.string().optional(),
  baseUrl: z.string().optional(),
  timeoutMs: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const OpenAICompatModelSchema = z.object({
  provider: z.literal('openai-compat'),
  name: z.string(),
  reviewerName: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  timeoutMs: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const GeminiModelSchema = z.object({
  provider: z.literal('gemini'),
  name: z.string(),
  reviewerName: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  apiKeyEnv: z.string().default('GEMINI_API_KEY'),
  timeoutMs: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const MockModelSchema = z.object({
  provider: z.literal('mock'),
  name: z.string().default('mock'),
  reviewerName: z.string().optional(),
});

const ModelConfigSchema = z.discriminatedUnion('provider', [
  OllamaModelSchema,
  OpenAICompatModelSchema,
  GeminiModelSchema,
  MockModelSchema,
]);

// ============================================================
// FULL CONFIG SCHEMA
// ============================================================

const PipelineConfigSchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(3),
  timeboxMs: z.number().default(180_000),
  maxFixIterations: z.number().int().min(1).max(10).default(3),
});

const PathsConfigSchema = z.object({
  requirements: z.string().default('./requirements'),
  constraints: z.string().default('./constraints'),
  references: z.string().default('./references'),
  runs: z.string().default('./runs'),
  handoffs: z.string().default('./handoffs'),
  templates: z.string().default('./templates'),
  prompts: z.string().default('./packages/agent-factory/prompts'),
});

const DomainRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  pattern: z.string().optional(),
  forbidden: z.array(z.string()).optional(),
});

const DomainConfigSchema = z.object({
  rules: z.array(DomainRuleSchema).default([]),
});

const TargetCommandsSchema = z.object({
  typeCheck: z.string().optional(),
  lint: z.string().optional(),
  test: z.string().optional(),
});

const TargetProjectSchema = z.object({
  root: z.string().optional(),
  applyArtifacts: z.boolean().default(false),
  allowedPaths: z.array(z.string()).default([]),
  commands: TargetCommandsSchema.default({}),
});

const RagSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('filesystem').default('filesystem'),
  rootPath: z.string().min(1),
  include: z
    .array(z.string())
    .default([
      '**/*.txt',
      '**/*.md',
      '**/*.json',
      '**/*.csv',
      '**/*.html',
      '**/*.htm',
      '**/*.pdf',
      '**/*.docx',
      '**/*.pptx',
    ]),
  exclude: z.array(z.string()).default(['**/~$*', '**/.DS_Store']),
});

const RagConfigSchema = z.object({
  database: z
    .object({
      connectionString: z
        .string()
        .default('postgresql://aifactory_rag:aifactory_rag@localhost:5432/aifactory_rag'),
    })
    .default({}),
  sources: z.array(RagSourceSchema).default([]),
  ingest: z
    .object({
      chunkSize: z.number().int().positive().default(1200),
      chunkOverlap: z.number().int().min(0).default(150),
      batchSize: z.number().int().positive().default(50),
    })
    .default({}),
  embedding: z
    .object({
      provider: z.enum(['openai', 'gemini', 'ollama']).default('openai'),
      model: z.string().default('text-embedding-3-small'),
      dimensions: z.number().int().positive().default(1536),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .default({}),
  llm: z
    .object({
      provider: z.enum(['openai', 'claude', 'gemini', 'ollama']).default('openai'),
      model: z.string().default('gpt-4o-mini'),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      temperature: z.number().min(0).max(2).default(0.1),
    })
    .default({}),
  retrieval: z
    .object({
      topK: z.number().int().positive().default(6),
      minScore: z.number().optional(),
    })
    .default({}),
  auth: z
    .object({
      provider: z.enum(['none', 'entra']).default('none'),
      enabled: z.boolean().default(false),
      tenantId: z.string().optional(),
      audience: z.string().optional(),
      issuer: z.string().optional(),
    })
    .default({}),
  api: z
    .object({
      host: z.string().default('127.0.0.1'),
      port: z.number().int().positive().default(8765),
    })
    .default({}),
});

export const FactoryConfigSchema = z.object({
  model: ModelConfigSchema,
  pipeline: PipelineConfigSchema.default({}),
  paths: PathsConfigSchema.default({}),
  domain: DomainConfigSchema.default({}),
  targetProject: TargetProjectSchema.default({}),
  rag: RagConfigSchema.default({}),
});

export type FactoryConfig = z.infer<typeof FactoryConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type DomainRule = z.infer<typeof DomainRuleSchema>;
export type TargetProjectConfig = z.infer<typeof TargetProjectSchema>;

// ============================================================
// ENV
// ============================================================

function loadEnvFile(cwd: string): void {
  const envPath = resolve(cwd, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    process.env[key] = value;
  }
}

function expandEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gi, (_match, name: string, defaultValue: string | undefined) => {
      const envValue = process.env[name];
      if (envValue !== undefined && envValue !== '') {
        return envValue;
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Environment variable not set: ${name}`);
    });
  }

  if (Array.isArray(value)) {
    return value.map(expandEnvVars);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, expandEnvVars(entry)]),
    );
  }

  return value;
}

// ============================================================
// LOADER
// ============================================================

const CONFIG_FILENAME = 'factory.config.json';

export function loadConfig(cwd: string = process.cwd()): FactoryConfig {
  loadEnvFile(cwd);
  const configPath = resolve(cwd, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}\n` +
        `Run: pnpm factory -- init`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: ${String(err)}`);
  }

  const expanded = expandEnvVars(raw);
  const result = FactoryConfigSchema.safeParse(expanded);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid factory.config.json:\n${issues}`);
  }

  return result.data;
}
