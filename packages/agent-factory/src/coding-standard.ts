import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { loadStandard, renderIndex, selectRules, type Standard } from './standards/import';

// A project's coding standard (RQ-0052): which standard, which of its groups
// and how strictly, chosen at `factory new --standard <id> --groups a,b`.
// coding-standard/ in the project holds the choice (standard.json), the
// chosen rules (rules.json, index.md) and the waivers the gate honours
// (waivers.yaml). The full rule text comes from the RAG source
// coding-standards, filtered to the chosen groups.

export const PROFILES = ['default', 'dal-a'] as const;
export type Profile = (typeof PROFILES)[number];

export type CodingStandard = {
  id: string;
  version: string;
  groups: string[];
  profile: Profile;
  rules: number;
};

export const CODING_STANDARD_DIRECTORY = 'coding-standard';
export const CODING_STANDARDS_SOURCE = 'coding-standards';

export type ChosenStandard = { standard: Standard; groups: string[]; profile: Profile };

export function chooseStandard(options: { standard?: string; groups?: string[]; profile?: string; standardsPath?: string }): ChosenStandard | undefined {
  if (!options.standard) {
    if (options.groups && options.groups.length > 0) throw new Error('--groups chooses groups of a standard: add --standard <id>.');
    if (options.profile) throw new Error('--profile applies to a coding standard: add --standard <id>.');
    return undefined;
  }
  const standard = loadStandard(options.standard, options.standardsPath);
  const groups = options.groups && options.groups.length > 0 ? options.groups : Object.keys(standard.groups);
  selectRules(standard, groups); // refuses an unknown group
  const profile = (options.profile ?? 'default') as Profile;
  if (!PROFILES.includes(profile)) throw new Error(`Profile "${options.profile}": one of ${PROFILES.join(', ')}.`);
  return { standard, groups, profile };
}

const WAIVERS = `# Deviations from the coding standard (RQ-0052). A finding the gate reports
# is either fixed or recorded here with its reason; a waiver missing a field
# is refused. Profile dal-a: every waiver names its reviewer and review_date.
schema: 1
required_fields: [rule_id, file, line, rationale, reviewer, review_date, waiver_id, validity]
waivers: []
`;

export function codingStandardRecord(chosen: ChosenStandard): CodingStandard {
  return {
    id: chosen.standard.id,
    version: chosen.standard.version,
    groups: chosen.groups,
    profile: chosen.profile,
    rules: selectRules(chosen.standard, chosen.groups).length,
  };
}

export function writeCodingStandard(projectRoot: string, chosen: ChosenStandard): CodingStandard {
  const rules = selectRules(chosen.standard, chosen.groups);
  const directory = resolve(projectRoot, CODING_STANDARD_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const record = codingStandardRecord(chosen);
  writeFileSync(join(directory, 'standard.json'), JSON.stringify(record, null, 2) + '\n', 'utf8');
  writeFileSync(join(directory, 'rules.json'), JSON.stringify({ ...chosen.standard, groups: Object.fromEntries(chosen.groups.map((name) => [name, chosen.standard.groups[name]])), rules }, null, 2) + '\n', 'utf8');
  writeFileSync(join(directory, 'index.md'), renderIndex(chosen.standard, rules, chosen.groups), 'utf8');
  if (!existsSync(join(directory, 'waivers.yaml'))) writeFileSync(join(directory, 'waivers.yaml'), WAIVERS, 'utf8');
  return record;
}

export function readCodingStandard(projectRoot: string): CodingStandard | undefined {
  const path = resolve(projectRoot, CODING_STANDARD_DIRECTORY, 'standard.json');
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as CodingStandard;
}

// The rule files of the groups the project did not choose, left out of its
// retrieval (rag.grounding.excludePaths).
export function excludedRuleFiles(chosen: ChosenStandard): string[] {
  return Object.keys(chosen.standard.groups)
    .filter((name) => !chosen.groups.includes(name))
    .map((name) => `${chosen.standard.id}/${name}.rules.md`);
}

export function describeCodingStandard(record: CodingStandard): string {
  return `${record.id} ${record.version}, groups ${record.groups.join(', ')}, profile ${record.profile} (${record.rules} rules)`;
}

// The AGENTS.md section of a project with a coding standard.
export function codingStandardGuidelines(record: CodingStandard): string[] {
  return [
    '## Coding Standard',
    '',
    `- This project follows the coding standard ${describeCodingStandard(record)}. \`coding-standard/index.md\` lists every rule in force (id, class, groups, one line); the full text of a rule, with its rationale and example, is in the RAG source \`${CODING_STANDARDS_SOURCE}\` (ask for the rule by id, e.g. "C-045"). The other groups of the standard are not in force here and are left out of retrieval.`,
    '- Write to the rules from the first line. Before finishing a requirement, read `coding-standard/index.md` once and check the code against the rules its change touches.',
    `- A rule that cannot be kept is recorded in \`coding-standard/waivers.yaml\` with every field (rule_id, file, line, rationale, reviewer, review_date, waiver_id, validity)${record.profile === 'dal-a' ? '; under profile dal-a every rule is mandatory and a waiver needs its reviewer and review date before the gate accepts it' : ''}. Never silence a finding with a suppression comment or a tool flag.`,
    '- `pnpm standard` (the `codingStandard` gate, run after the build) checks the code with cppcheck\'s MISRA addon and the lexical checks and writes `out/coding-standard/report.md`; a rule the index marks `manual review` is checked by a reviewer, not a tool. Run it before `handoff-finish`; an unwaived violation fails the gate.',
    '- Changing the groups or the profile is a requirement of its own: it changes what the gate enforces.',
    '',
  ];
}
