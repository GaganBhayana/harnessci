/** Kinds of agent configuration HarnessCI tracks, plus `other` for everything else. */
export const CONFIG_KINDS = ['skill', 'agents-md', 'claude-md', 'mcp-config', 'plugin-manifest', 'other'] as const;

/** One of {@link CONFIG_KINDS}. */
export type ConfigKind = (typeof CONFIG_KINDS)[number];

/** A {@link ConfigKind} other than `other`: a file that is part of the agent setup. */
export type AgentConfigKind = Exclude<ConfigKind, 'other'>;

/** A changed path and its kind. */
export interface ConfigChange {
  readonly path: string;
  readonly kind: AgentConfigKind;
}

/** The agent-config part of a PR's changed paths. */
export interface ConfigChangeSet {
  /** Agent-config paths in input order, without duplicates. `other` paths are left out. */
  readonly changes: readonly ConfigChange[];
  /** Agent-config paths grouped by kind. */
  readonly byKind: Readonly<Record<AgentConfigKind, readonly string[]>>;
}

/** Same as the glob `settings*.json`. */
const SETTINGS_FILE = /^settings[^/]*\.json$/;

/**
 * Classifies one repository path. File names are matched exactly (case-sensitive), at any depth:
 * `SKILL.md` is a skill; `AGENTS.md` is agents-md; `CLAUDE.md` and `CLAUDE.local.md` are claude-md;
 * `.mcp.json` and `.claude/settings*.json` are mcp-config; `.claude-plugin/plugin.json` and
 * `.claude-plugin/marketplace.json` are plugin-manifest. A bare `plugin.json` is `other`, because
 * other ecosystems use that name too.
 *
 * Settings files count as mcp-config because they decide which tools the agent may use: they
 * enable or disable `.mcp.json` servers (`enabledMcpjsonServers`, `enableAllProjectMcpServers`)
 * and hold permission rules and hooks.
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

/**
 * Picks the agent-config changes out of a PR's changed paths.
 * @param paths Changed paths as listed by GitHub or git. For a renamed file, pass both the old and
 *   the new path, so a config file renamed to a non-config name still counts as a change.
 */
export function detectConfigChanges(paths: readonly string[]): ConfigChangeSet {
  const changes: ConfigChange[] = [];
  const byKind: Record<AgentConfigKind, string[]> = {
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

/** Uses forward slashes and drops empty and `.` segments, including a leading `./` or `/`. */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}
