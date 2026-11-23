import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath, detectConfigChanges, normalizePath } from './detect.ts';
import type { ConfigKind } from './detect.ts';

const cases: ReadonlyArray<readonly [string, ConfigKind]> = [
  ['SKILL.md', 'skill'],
  ['.claude/skills/review/SKILL.md', 'skill'],
  ['plugins/lint/skills/fix-imports/SKILL.md', 'skill'],
  ['AGENTS.md', 'agents-md'],
  ['packages/api/AGENTS.md', 'agents-md'],
  ['CLAUDE.md', 'claude-md'],
  ['.claude/CLAUDE.md', 'claude-md'],
  ['services/web/CLAUDE.local.md', 'claude-md'],
  ['.mcp.json', 'mcp-config'],
  ['tools/.mcp.json', 'mcp-config'],
  ['.claude/settings.json', 'mcp-config'],
  ['.claude/settings.local.json', 'mcp-config'],
  ['apps/a/.claude/settings.json', 'mcp-config'],
  ['.claude-plugin/plugin.json', 'plugin-manifest'],
  ['.claude-plugin/marketplace.json', 'plugin-manifest'],
  ['plugins/lint/.claude-plugin/plugin.json', 'plugin-manifest'],
  ['.claude/settings-old.json', 'mcp-config'],
  ['.claude//settings.json', 'mcp-config'],
  ['.claude/./settings.json', 'mcp-config'],
  // look-alikes
  ['skill.md', 'other'],
  ['SKILL.md.bak', 'other'],
  ['docs/SKILLS.md', 'other'],
  ['skills/review/reference.md', 'other'],
  ['agents.md', 'other'],
  ['AGENTS.md/notes.txt', 'other'],
  ['docs/CLAUDE.md.example', 'other'],
  ['mcp.json', 'other'],
  ['.mcp.json.example', 'other'],
  ['config/settings.json', 'other'],
  ['.claude/nested/settings.json', 'other'],
  ['.claude/settings.yaml', 'other'],
  ['plugin.json', 'other'],
  ['grafana/plugin.json', 'other'],
  ['.claude-plugin/README.md', 'other'],
  ['.claude-plugin/sub/plugin.json', 'other'],
  ['.claude/settings.json.bak', 'other'],
  ['SKILL.MD', 'other'],
  ['CLAUDE.MD', 'other'],
  ['.claude', 'other'],
  ['src/index.ts', 'other'],
  ['', 'other'],
];

for (const [path, kind] of cases) {
  test(`classifyPath(${JSON.stringify(path)}) is ${kind}`, () => {
    assert.equal(classifyPath(path), kind);
  });
}

test('classifyPath accepts Windows separators and a leading ./', () => {
  assert.equal(classifyPath('.\\.claude\\skills\\x\\SKILL.md'), 'skill');
  assert.equal(classifyPath('./AGENTS.md'), 'agents-md');
  assert.equal(classifyPath('/.claude/settings.json'), 'mcp-config');
});

test('normalizePath fixes separators and drops empty and . segments', () => {
  assert.equal(normalizePath('a\\b\\c.md'), 'a/b/c.md');
  assert.equal(normalizePath('././x'), 'x');
  assert.equal(normalizePath('dir/./x'), 'dir/x');
  assert.equal(normalizePath('//a//b/'), 'a/b');
  assert.equal(normalizePath('../x'), '../x');
  assert.equal(normalizePath(''), '');
});

test('detectConfigChanges keeps config paths in order, grouped by kind', () => {
  const result = detectConfigChanges([
    'src/app.ts',
    'CLAUDE.md',
    '.claude/skills/a/SKILL.md',
    'README.md',
    '.mcp.json',
    '.claude/skills/b/SKILL.md',
  ]);
  assert.deepEqual(result.changes, [
    { path: 'CLAUDE.md', kind: 'claude-md' },
    { path: '.claude/skills/a/SKILL.md', kind: 'skill' },
    { path: '.mcp.json', kind: 'mcp-config' },
    { path: '.claude/skills/b/SKILL.md', kind: 'skill' },
  ]);
  assert.deepEqual(result.byKind, {
    skill: ['.claude/skills/a/SKILL.md', '.claude/skills/b/SKILL.md'],
    'agents-md': [],
    'claude-md': ['CLAUDE.md'],
    'mcp-config': ['.mcp.json'],
    'plugin-manifest': [],
  });
});

test('detectConfigChanges drops duplicates after normalising and skips empty paths', () => {
  const result = detectConfigChanges(['AGENTS.md', './AGENTS.md', '', 'docs\\AGENTS.md', 'docs/AGENTS.md']);
  assert.deepEqual(result.changes.map((c) => c.path), ['AGENTS.md', 'docs/AGENTS.md']);
});

test('detectConfigChanges counts a config file renamed away when both sides are passed', () => {
  const result = detectConfigChanges(['.claude/skills/old/SKILL.md', '.claude/skills/old/NOTES.md']);
  assert.deepEqual(result.changes, [{ path: '.claude/skills/old/SKILL.md', kind: 'skill' }]);
});

test('detectConfigChanges with no config paths is empty', () => {
  const result = detectConfigChanges(['src/a.ts', 'package.json']);
  assert.equal(result.changes.length, 0);
  assert.ok(Object.values(result.byKind).every((paths) => paths.length === 0));
});
