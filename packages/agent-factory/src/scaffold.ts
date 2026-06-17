import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { relative, resolve } from 'path';

export type ProjectTemplate = 'empty' | 'vanilla-ts' | 'python';

export type NewProjectOptions = {
  dir?: string;
  force?: boolean;
  template?: string;
};

export type NewProjectResult = {
  projectName: string;
  projectRoot: string;
  factoryScript: string;
  template: ProjectTemplate;
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = ['empty', 'vanilla-ts', 'python'];

const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function assertValidProjectName(projectName: string): void {
  if (!PROJECT_NAME_PATTERN.test(projectName)) {
    throw new Error(
      'Invalid project name. Use letters, numbers, dot, underscore, or dash; start with a letter or number.',
    );
  }
}

function assertValidTemplate(template: string | undefined): asserts template is ProjectTemplate {
  if (!template) {
    throw new Error('Missing --template. Choose one: ' + PROJECT_TEMPLATES.join(', '));
  }

  if (!PROJECT_TEMPLATES.includes(template as ProjectTemplate)) {
    throw new Error('Invalid template "' + template + '". Choose one: ' + PROJECT_TEMPLATES.join(', '));
  }
}

function toPackageScriptPath(fromDir: string, toFile: string): string {
  const rel = relative(fromDir, toFile).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : './' + rel;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function writeCommonFiles(projectRoot: string, projectName: string, factoryScript: string): void {
  writeJson(resolve(projectRoot, 'package.json'), {
    name: projectName,
    private: true,
    version: '0.1.0',
    scripts: {
      factory: factoryScript,
    },
  });

  writeFileSync(
    resolve(projectRoot, '.env.example'),
    [
      '# Optional real provider settings. factory.config.json starts with mock by default.',
      '# AI_PROVIDER=gemini',
      '# AI_MODEL=gemini-2.5-flash',
      '# AI_REVIEWER_MODEL=gemini-2.5-flash',
      '# AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta',
      '# AI_API_KEY=replace_me',
      '',
      '# xAI / Grok via OpenAI-compatible endpoint example:',
      '# AI_PROVIDER=openai-compat',
      '# AI_MODEL=grok-4-fast-reasoning',
      '# AI_REVIEWER_MODEL=grok-4-fast-reasoning',
      '# AI_BASE_URL=https://api.x.ai/v1',
      '# AI_API_KEY=replace_me',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, '.gitignore'),
    ['node_modules/', 'dist/', '.env', 'runs/', '.DS_Store', ''].join('\n'),
    'utf8',
  );
}

function writeReferencesReadme(projectRoot: string): void {
  writeFileSync(
    resolve(projectRoot, 'references/README.md'),
    [
      '# References',
      '',
      'Put source material for requirements here, such as PDFs, standards, screenshots, notes, and domain research.',
      '',
      'Suggested layout for a standard or specification:',
      '',
      '```text',
      'references/',
      '  arinc-661/',
      '    ARINC-661.pdf',
      '    summary.md',
      '    widget-model.md',
      '    requirements-notes.md',
      '```',
      '',
      'Requirements should link to concise markdown notes from this folder when possible. Keep large PDFs here as source material, but summarize the implementation-relevant parts in markdown before running the factory pipeline.',
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeGitlabCi(projectRoot: string, projectName: string): void {
  writeFileSync(
    resolve(projectRoot, '.gitlab-ci.yml'),
    [
      'image: node:20-bullseye',
      '',
      'stages:',
      '  - ai_factory',
      '',
      'variables:',
      '  PNPM_HOME: "$CI_PROJECT_DIR/.pnpm"',
      '  PATH: "$PNPM_HOME:$PATH"',
      '  AIFACTORY_REPO_URL: "https://github.com/baturorkun/aifactory.git"',
      '  REQUIREMENT_ID: ""',
      '',
      'cache:',
      '  key: "$CI_COMMIT_REF_SLUG"',
      '  paths:',
      '    - .pnpm-store/',
      '    - .pnpm/',
      '',
      'ai_factory_run:',
      '  stage: ai_factory',
      '  rules:',
      '    - if: \'$CI_COMMIT_BRANCH == "master"\'',
      '      when: manual',
      '    - if: \'$CI_COMMIT_BRANCH == "main"\'',
      '      when: manual',
      '    - when: never',
      '  before_script:',
      '    - corepack enable',
      '    - corepack prepare pnpm@9.15.9 --activate',
      '    - |',
      '      if [ -z "$REQUIREMENT_ID" ]; then',
      '        echo "REQUIREMENT_ID is required. Run this manual job with a value such as RQ-0001-example."',
      '        exit 1',
      '      fi',
      '    - |',
      '      if [ ! -f ../aifactory/package.json ]; then',
      '        git clone "$AIFACTORY_REPO_URL" ../aifactory',
      '      fi',
      '    - cd ../aifactory',
      '    - pnpm install --frozen-lockfile',
      '    - pnpm -r run typecheck',
      '    - cd "$CI_PROJECT_DIR"',
      '  script:',
      '    - pnpm factory run "$REQUIREMENT_ID"',
      '    - pnpm typecheck',
      '    - pnpm build',
      '  artifacts:',
      '    name: "' + projectName + '-ai-factory-$CI_COMMIT_SHORT_SHA"',
      '    when: always',
      '    expire_in: 7 days',
      '    paths:',
      '      - public/',
      '      - src/',
      '      - dist/',
      '      - runs/',
      '      - handoffs/',
      '      - requirements/',
      '      - constraints/',
      '      - factory.config.json',
      '      - package.json',
      '      - tsconfig.json',
      '      - tsconfig.build.json',
      '      - pyproject.toml',
      '      - tests/',
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeFactoryConfig(
  projectRoot: string,
  promptsPath: string,
  allowedPaths: string[],
  commands: { typeCheck?: string; lint?: string; test?: string },
): void {
  writeJson(resolve(projectRoot, 'factory.config.json'), {
    model: {
      provider: '${AI_PROVIDER:-mock}',
      name: '${AI_MODEL:-mock}',
      reviewerName: '${AI_REVIEWER_MODEL:-mock}',
      baseUrl: '${AI_BASE_URL:-}',
      apiKey: '${AI_API_KEY:-}',
    },
    pipeline: {
      maxRetries: 3,
      timeboxMs: 180000,
      maxFixIterations: 3,
    },
    paths: {
      requirements: './requirements',
      constraints: './constraints',
      references: './references',
      runs: './runs',
      handoffs: './handoffs',
      templates: './templates',
      prompts: promptsPath,
    },
    targetProject: {
      root: '.',
      applyArtifacts: true,
      allowedPaths,
      commands,
    },
    domain: {
      rules: [],
    },
  });
}

function patchPackageScripts(projectRoot: string, scripts: Record<string, string>): void {
  const packageJsonPath = resolve(projectRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  packageJson.scripts = { ...(packageJson.scripts ?? {}), ...scripts };
  writeJson(packageJsonPath, packageJson);
}

function writeVanillaTsTemplate(projectRoot: string, projectName: string, tscScript: string): void {
  mkdirSync(resolve(projectRoot, 'public'), { recursive: true });
  mkdirSync(resolve(projectRoot, 'src'), { recursive: true });

  patchPackageScripts(projectRoot, {
    typecheck: tscScript + ' --noEmit',
    build: tscScript + ' --project tsconfig.build.json',
  });

  writeJson(resolve(projectRoot, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  });

  writeJson(resolve(projectRoot, 'tsconfig.build.json'), {
    extends: './tsconfig.json',
    compilerOptions: {
      noEmit: false,
      outDir: './dist',
      declaration: false,
      sourceMap: true,
    },
  });

  writeFileSync(
    resolve(projectRoot, 'public/index.html'),
    [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <title>' + projectName + '</title>',
      '  <link rel="stylesheet" href="../src/styles.css">',
      '</head>',
      '<body>',
      '  <main id="app"></main>',
      '  <script src="../dist/main.js"></script>',
      '</body>',
      '</html>',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, 'src/main.ts'),
    [
      "const app = document.getElementById('app');",
      '',
      'if (app) {',
      "  app.textContent = 'New AI Factory project: " + projectName + "';",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, 'src/styles.css'),
    ['body {', '  margin: 0;', '  font-family: Arial, Helvetica, sans-serif;', '}', ''].join('\n'),
    'utf8',
  );
}

function writePythonTemplate(projectRoot: string): void {
  mkdirSync(resolve(projectRoot, 'src'), { recursive: true });
  mkdirSync(resolve(projectRoot, 'tests'), { recursive: true });

  patchPackageScripts(projectRoot, {
    typecheck: 'python3 -m py_compile src/main.py',
    test: 'python3 -m unittest discover -s tests',
  });
  writeFileSync(
    resolve(projectRoot, 'pyproject.toml'),
    ['[project]', 'name = "ai-factory-python-target"', 'version = "0.1.0"', 'requires-python = ">=3.11"', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    resolve(projectRoot, 'src/main.py'),
    ['def main() -> str:', '    return "New AI Factory Python project"', '', '', 'if __name__ == "__main__":', '    print(main())', ''].join('\n'),
    'utf8',
  );

  writeFileSync(
    resolve(projectRoot, 'tests/test_main.py'),
    ['import unittest', '', 'from src.main import main', '', '', 'class MainTest(unittest.TestCase):', '    def test_main_returns_message(self):', '        self.assertIn("AI Factory", main())', '', '', 'if __name__ == "__main__":', '    unittest.main()', ''].join('\n'),
    'utf8',
  );

  writeFileSync(resolve(projectRoot, 'src/__init__.py'), '', 'utf8');
}

export function createTargetProject(projectName: string, options: NewProjectOptions): NewProjectResult {
  assertValidProjectName(projectName);
  assertValidTemplate(options.template);

  const parentDir = resolve(process.cwd(), options.dir ?? '..');
  const projectRoot = resolve(parentDir, projectName);

  if (existsSync(projectRoot) && !options.force && readdirSync(projectRoot).length > 0) {
    throw new Error('Target directory already exists and is not empty: ' + projectRoot);
  }

  const factoryRoot = resolve(__dirname, '../../..');
  const factoryBin = resolve(factoryRoot, 'packages/agent-factory/bin/factory.js');
  const factoryScript = toPackageScriptPath(projectRoot, factoryBin);
  const tscScript = toPackageScriptPath(projectRoot, resolve(factoryRoot, 'node_modules/.bin/tsc'));
  const promptsPath = toPackageScriptPath(projectRoot, resolve(factoryRoot, 'packages/agent-factory/prompts'));

  mkdirSync(projectRoot, { recursive: true });
  for (const dir of ['requirements', 'constraints', 'handoffs', 'runs', 'templates', 'references']) {
    mkdirSync(resolve(projectRoot, dir), { recursive: true });
  }

  writeCommonFiles(projectRoot, projectName, factoryScript);
  writeReferencesReadme(projectRoot);
  writeGitlabCi(projectRoot, projectName);

  if (options.template === 'vanilla-ts') {
    writeFactoryConfig(projectRoot, promptsPath, ['public', 'src', 'tests'], {
      typeCheck: 'pnpm typecheck',
      test: undefined,
    });
    writeVanillaTsTemplate(projectRoot, projectName, tscScript);
  } else if (options.template === 'python') {
    writeFactoryConfig(projectRoot, promptsPath, ['src', 'tests'], {
      typeCheck: 'pnpm typecheck',
      test: 'pnpm test',
    });
    writePythonTemplate(projectRoot);
  } else {
    writeFactoryConfig(projectRoot, promptsPath, [], {});
  }

  writeFileSync(resolve(projectRoot, 'requirements/.gitkeep'), '', 'utf8');
  writeFileSync(resolve(projectRoot, 'constraints/.gitkeep'), '', 'utf8');
  writeFileSync(resolve(projectRoot, 'handoffs/.gitkeep'), '', 'utf8');
  writeFileSync(resolve(projectRoot, 'templates/.gitkeep'), '', 'utf8');

  return { projectName, projectRoot, factoryScript, template: options.template };
}
