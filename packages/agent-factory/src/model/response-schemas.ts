/**
 * Provider-neutral JSON Schema for coder output.
 *
 * Keep this aligned with CodePatchOutputSchema in @aifactory/contracts. The
 * Zod schema remains the final authority; this schema constrains providers
 * that support structured output before their response reaches validation.
 */
export function buildCodePatchResponseSchema(
  exactTargetFiles?: readonly string[],
): Record<string, unknown> {
  const pathSchema = exactTargetFiles?.length
    ? { type: 'string', enum: [...exactTargetFiles] }
    : { type: 'string' };

  return {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      patches: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            path: pathSchema,
            content: { type: 'string' },
            language: { type: 'string' },
            description: { type: 'string' },
            mode: { type: 'string', enum: ['full', 'replace'] },
            find: { type: 'string' },
          },
          required: ['path', 'content', 'language', 'mode'],
        },
      },
      notes: {
        type: 'array',
        items: { type: 'string' },
      },
      dependencies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            dev: { type: 'boolean' },
          },
          required: ['name', 'version', 'dev'],
        },
      },
    },
    required: ['taskId', 'patches', 'notes', 'dependencies'],
  };
}

/** Provider-neutral JSON Schema for tester output. */
export function buildTestOutputResponseSchema(
  exactTargetFiles?: readonly string[],
): Record<string, unknown> {
  const pathSchema = exactTargetFiles?.length
    ? { type: 'string', enum: [...exactTargetFiles] }
    : { type: 'string' };

  return {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      tests: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            path: pathSchema,
            content: { type: 'string' },
            covers: { type: 'array', minItems: 1, items: { type: 'string' } },
            framework: { type: 'string' },
          },
          required: ['name', 'path', 'content', 'covers', 'framework'],
        },
      },
      coverage: { type: 'array', items: { type: 'string' } },
      setupNotes: { type: 'array', items: { type: 'string' } },
    },
    required: ['taskId', 'tests', 'coverage', 'setupNotes'],
  };
}
