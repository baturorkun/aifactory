import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HELP = `Usage: node scripts/template-check.mjs [--strict] [--all]

The files the aifactory template owns (the deploy scripts and their test,
the CI file, Dockerfile, nginx.conf, AGENTS.md, ...), as the last template
update delivered them (.factory/template.lock.json, RQ-0087, RQ-0089).
Changing one to try something is fine; on main it is either the
template's again or marked as the project's:

  revert it, or
  pnpm factory -- template override <path> --reason "<why>"

which records it in factory.config.json and proposes the change to
aifactory, so the next template update keeps it instead of overwriting it.

  --strict  exit 1 on a changed or missing file, or merge conflict markers
            (the merge request pipeline); without it the check only reports
  --all     list the files in sync too`;

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOCK = '.factory/template.lock.json';
const CONFLICT_MARKERS = /^<{7}( |$)[\s\S]*?^>{7}( |$)/m;

// As aifactory hashes them (template-lock.ts): line endings normalised for
// text, AGENTS.md without its Coding Standard section, which is the project's.
export function contentHash(path, data) {
  let text = data.includes(0) ? data : Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  if (path === 'AGENTS.md' && !text.includes(0)) {
    text = Buffer.from(text.toString('utf8').replace(/^## Coding Standard\n[\s\S]*?(?=^## |(?![\s\S]))/m, '').replace(/\n*$/, '\n'), 'utf8');
  }
  return createHash('sha256').update(text).digest('hex');
}

// Every file of the lock: in sync, changed, overridden, conflict or missing.
export function templateStatus(root = ROOT) {
  const lockPath = join(root, LOCK);
  if (!existsSync(lockPath)) return undefined;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const configPath = join(root, 'factory.config.json');
  const overrides = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')).targetProject?.templateOverrides ?? {} : {};
  return Object.entries(lock.files ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([path, hash]) => {
    const full = join(root, path);
    const override = overrides[path];
    if (!existsSync(full)) return { path, state: 'missing', override };
    const data = readFileSync(full);
    if (!data.includes(0) && CONFLICT_MARKERS.test(data.toString('utf8'))) return { path, state: 'conflict', override };
    if (contentHash(path, data) === hash) return { path, state: 'in sync', override };
    return { path, state: override ? 'overridden' : 'changed', override };
  });
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const strict = argv.includes('--strict');
  const files = templateStatus();
  if (!files) {
    console.log(`TEMPLATE: no ${LOCK}; the next template update writes it.`);
    return 0;
  }
  for (const file of files) {
    if (file.state === 'in sync' && !argv.includes('--all')) continue;
    const why = file.override ? `  (${file.override.reason}${file.override.issue ? `, ${file.override.issue}` : ''})` : '';
    console.log(`  ${file.state.padEnd(10)} ${file.path}${why}`);
  }
  const wrong = files.filter((file) => ['changed', 'missing', 'conflict'].includes(file.state));
  const overridden = files.filter((file) => file.state === 'overridden').length;
  if (wrong.length === 0) {
    console.log(`TEMPLATE: ${files.length} template-owned file(s), ${overridden} overridden, none changed unmarked.`);
    return 0;
  }
  console.log(`TEMPLATE: ${wrong.length} template-owned file(s) changed without an override or left with conflict markers: resolve a conflict; revert a change, or`);
  console.log('  pnpm factory -- template override <path> --reason "<why>"');
  console.log('  which keeps the change through template updates and proposes it to aifactory.');
  return strict ? 1 : 0;
}

// The real path: Node resolves symlinks (macOS /var -> /private/var) for
// import.meta.url but not for argv[1].
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  process.exitCode = main(process.argv.slice(2));
}
