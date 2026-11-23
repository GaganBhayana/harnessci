/** Kinds of agent configuration HarnessCI tracks, plus `other` for everything else. */
export const CONFIG_KINDS = ['skill', 'agents-md', 'claude-md', 'mcp-config', 'plugin-manifest', 'other'] as const;

/** One of {@link CONFIG_KINDS}. */
export type ConfigKind = (typeof CONFIG_KINDS)[number];

/** A changed path and its kind. */
export interface ConfigChange {
  readonly path: string;
  readonly kind: Exclude<ConfigKind, 'other'>;
}

/** The agent-config part of a PR's changed paths. */
export interface ConfigChangeSet {
  /** Agent-config paths in input order, without duplicates. `other` paths are left out. */
  readonly changes: readonly ConfigChange[];
  /** Agent-config paths grouped by kind. */
  readonly byKind: Readonly<Record<Exclude<ConfigKind, 'other'>, readonly string[]>>;
}

/** Same as the glob `settings*.json`. */
const SETTINGS_FILE = /^settings[^/]*\.json$/;

/**
 * Classifies one repository path. File names are matched exactly (case-sensitive), at any depth:
 * `SKILL.md` is a skill; `AGENTS.md` is agents-md; `CLAUDE.md` and `CLAUDE.local.md` are claude-md;
 * `.mcp.json` and `.claude/settings*.json` are mcp-config; `.claude-plugin/plugin.json` and
 * `.claude-plugin/marketplace.json` are plugin-manifest. A bare `plugin.json` is `other`, because
 * other ecosystems use that name too.
 */
export function classifyPath(path: string): ConfigKind {
  const parts = normalizePath(path).split('/');
  const name = parts.at(-1) ?? '';
  const parent = parts.at(-2);
  if (name === 'SKILL.md') return 'skill';
  if (name === 'AGENTS.md') return 'agents-md';
  if (name === 'CLAUDE.md' || name === 'CLAUDE.local.md') return 'claude-md';
  if (name === '.mcp.json') return 'mcp-config';
  if (parent === '.claude' && SETTINGS_FILE.test(name)) return 'mcp-config';
  if (parent === '.claude-plugin' && (name === 'plugin.json' || name === 'marketplace.json')) return 'plugin-manifest';
  return 'other';
}

/** Picks the agent-config changes out of a PR's changed paths (include both sides of renames). */
export function detectConfigChanges(paths: readonly string[]): ConfigChangeSet {
  const changes: ConfigChange[] = [];
  const byKind: Record<Exclude<ConfigKind, 'other'>, string[]> = {
    skill: [],
    'agents-md': [],
    'claude-md': [],
    'mcp-config': [],
    'plugin-manifest': [],
  };
  const seen = new Set<string>();
  for (const raw of paths) {
    const path = normalizePath(raw);
    if (path === '' || seen.has(path)) continue;
    seen.add(path);
    const kind = classifyPath(path);
    if (kind === 'other') continue;
    changes.push({ path, kind });
    byKind[kind].push(path);
  }
  return { changes, byKind };
}

/** Uses forward slashes and drops a leading `./` or `/`. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(?:\.\/|\/)+/, '');
}
