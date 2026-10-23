// The environment an AI provider's process starts with (RQ-0090): this
// process's, without any DEPLOY_* variable. Deploy settings are the
// operator's (`.env`, `deploy/*.env`, CI secrets): a model never sees them,
// not their values and not their names. Everything else passes as before.
export function providerEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !name.toUpperCase().startsWith('DEPLOY_')));
}
