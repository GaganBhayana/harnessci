import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadSkill,
  MAX_DESCRIPTION_LENGTH,
  MAX_SKILL_FILE_LENGTH,
  parseSkillFile,
  validateSkillFrontmatter,
} from './skill.ts';
import type { SkillIssueCode } from './skill.ts';

const fixtures = join(import.meta.dirname, '../../test/fixtures/skills');
const fixture = (name: string): string => readFileSync(join(fixtures, name, 'SKILL.md'), 'utf8');

function issueCodes(text: string, directoryName?: string): SkillIssueCode[] {
  const result = loadSkill(text, directoryName === undefined ? {} : { directoryName });
  assert.equal(result.ok, false);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

function frontmatterOf(text: string) {
  const result = parseSkillFile(text);
  assert.ok(result.ok, JSON.stringify(result));
  return result.value.frontmatter;
}

test('loads a realistic skill with a folded description, a list and a nested map', () => {
  const result = loadSkill(fixture('pdf-forms'), { directoryName: 'pdf-forms' });
  assert.ok(result.ok, JSON.stringify(result));
  const skill = result.value;
  assert.equal(skill.name, 'pdf-forms');
  assert.equal(
    skill.description,
    'Fills and flattens PDF forms. Use when the user asks to fill in a PDF form, read form fields, or flatten a filled form before sending it.',
  );
  assert.equal(skill.frontmatter['license'], 'Apache-2.0');
  assert.deepEqual(skill.frontmatter['allowed-tools'], ['Read', 'Bash(python3 *)']);
  assert.deepEqual(skill.frontmatter['metadata'], { raw: 'author: example\nversion: "1.2"' });
  assert.deepEqual(Object.keys(skill.frontmatter), ['name', 'description', 'license', 'allowed-tools', 'metadata']);
  assert.equal(skill.bodyLine, 14);
  assert.match(skill.body, /^\n# PDF forms\n/);
});

test('reports every malformed line in a broken fixture, with line numbers', () => {
  const result = parseSkillFile(fixture('bad-frontmatter'));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.issues.map((issue) => [issue.code, issue.line]),
    [['malformed-line', 3], ['malformed-line', 4]],
  );
});

test('accepts a byte-order mark and CRLF or CR line endings', () => {
  const lf = '---\nname: my-skill\ndescription: Does a thing. Use when asked.\n---\nline one\nline two\n';
  for (const text of ['﻿' + lf, lf.replace(/\n/g, '\r\n'), lf.replace(/\n/g, '\r')]) {
    const result = loadSkill(text);
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.value.description, 'Does a thing. Use when asked.');
    assert.equal(result.value.body, 'line one\nline two\n');
  }
});

test('reads plain, quoted and commented scalars', () => {
  const fm = frontmatterOf(
    [
      '---',
      '# a comment line',
      'a: plain value # trailing comment',
      "b: 'it''s # not a comment'",
      'c: "tab\\there \\"quoted\\" \\u00e9"',
      'd: C# is fine without a space before the hash',
      'e:',
      'f: "x" # comment after quotes',
      '---',
    ].join('\n'),
  );
  assert.equal(fm['a'], 'plain value');
  assert.equal(fm['b'], "it's # not a comment");
  assert.equal(fm['c'], 'tab\there "quoted" é');
  assert.equal(fm['d'], 'C# is fine without a space before the hash');
  assert.equal(fm['e'], '');
  assert.equal(fm['f'], 'x');
});

test('applies block scalar chomping indicators', () => {
  const fm = frontmatterOf(
    ['---', 'keep: |+', '  one', '  two', '', 'strip: |-', '  one', '  two', 'clip: >', '  one', '  two', '', '  three', '---'].join('\n'),
  );
  assert.equal(fm['keep'], 'one\ntwo\n');
  assert.equal(fm['strip'], 'one\ntwo');
  assert.equal(fm['clip'], 'one two\nthree\n');
});

test('folds a plain value continued on indented lines', () => {
  const fm = frontmatterOf(
    [
      '---',
      'description: Fills PDF forms. Use when',
      '  the user asks to fill one in.',
      '',
      '    Second paragraph. # trailing comment',
      'next: value',
      '---',
    ].join('\n'),
  );
  assert.equal(fm['description'], 'Fills PDF forms. Use when the user asks to fill one in.\nSecond paragraph.');
  assert.equal(fm['next'], 'value');
});

test('rejects a comment inside a multi-line plain value', () => {
  const result = parseSkillFile('---\ndescription: one # c\n  two\n---\n');
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.issues, [{ code: 'malformed-line', message: 'a comment cannot appear inside a multi-line value; quote the value', line: 2 }]);
  assert.equal(parseSkillFile('---\ndescription: one\n  # c\n  two\n---\n').ok, false);
});

test('rejects ": " in a plain value, as YAML does, but not in a quoted one', () => {
  for (const text of ['description: Use when: the user asks', 'description: Use for:', 'description: one\n  two: three', 'tools:\n  - Read: all']) {
    const result = parseSkillFile(`---\n${text}\n---\n`);
    assert.equal(result.ok, false, text);
    if (!result.ok) assert.match(result.issues[0]?.message ?? '', /quote the value/, text);
  }
  const fm = frontmatterOf('---\na: "Use when: the user asks"\nb: \'x: y\'\nc: see https://example.com:8080/x\nd: a:b\n---\n');
  assert.equal(fm['a'], 'Use when: the user asks');
  assert.equal(fm['b'], 'x: y');
  assert.equal(fm['c'], 'see https://example.com:8080/x');
  assert.equal(fm['d'], 'a:b');
});

test('long runs of spaces in a plain value are parsed in linear time', () => {
  const started = performance.now();
  const fm = frontmatterOf(`---\ndescription: x${' '.repeat(200_000)}y\n---\n`);
  assert.ok(performance.now() - started < 500, 'comment stripping must not backtrack');
  assert.equal(fm['description'], `x${' '.repeat(200_000)}y`);
});

test('reads a list written at the key indentation', () => {
  assert.deepEqual(frontmatterOf('---\ntools:\n- Read\n- Grep\n---\n')['tools'], ['Read', 'Grep']);
});

test('frontmatter keys cannot reach Object.prototype', () => {
  const fm = frontmatterOf('---\n__proto__: x\nconstructor: y\n---\n');
  assert.equal(fm['__proto__'], 'x');
  assert.equal(fm['constructor'], 'y');
  assert.equal(Object.getPrototypeOf(fm), null);
});

test('rejects a file without frontmatter', () => {
  assert.deepEqual(issueCodes('# Just markdown\n'), ['no-frontmatter']);
  assert.deepEqual(issueCodes(''), ['no-frontmatter']);
  assert.deepEqual(issueCodes('\n---\nname: x\n---\n'), ['no-frontmatter']);
});

test('rejects unterminated frontmatter', () => {
  assert.deepEqual(issueCodes('---\nname: my-skill\ndescription: x\n'), ['unterminated-frontmatter']);
});

test('rejects duplicate keys and names the line', () => {
  const result = parseSkillFile('---\nname: a\ndescription: x\nname: b\n---\n');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, [{ code: 'duplicate-key', message: '"name" appears more than once', line: 4 }]);
});

test('rejects YAML features outside the subset', () => {
  for (const line of ['a: *alias', 'a: &anchor x', 'a: !!str x', 'a: [x, y]', 'a: {x: 1}', "a: 'open", 'a: "bad \\q escape"', 'a: x\n  b: y']) {
    const result = parseSkillFile(`---\n${line}\n---\n`);
    assert.equal(result.ok, false, line);
    if (!result.ok) assert.equal(result.issues[0]?.code, 'malformed-line', line);
  }
});

test('requires name and description', () => {
  assert.deepEqual(issueCodes('---\n---\n'), ['missing-name', 'missing-description']);
  assert.deepEqual(issueCodes('---\nname: ok-name\n---\n'), ['missing-description']);
});

test('validates the name format', () => {
  const bad = ['My-Skill', 'my_skill', '-lead', 'trail-', 'two--hyphens', 'has space', 'a'.repeat(65), '', 'claude-helper', 'anthropic'];
  for (const name of bad) {
    assert.equal(validateSkillFrontmatter({ name, description: 'x' })[0]?.code, 'invalid-name', name);
  }
  for (const name of ['a', 'pdf-forms', 'v2-tools', 'a'.repeat(64), 'claudette']) {
    assert.deepEqual(validateSkillFrontmatter({ name, description: 'x' }), [], name);
  }
  assert.equal(validateSkillFrontmatter({ name: ['a'], description: 'x' })[0]?.code, 'invalid-name');
});

test('checks the name against the folder when asked', () => {
  const text = '---\nname: pdf-forms\ndescription: x\n---\n';
  assert.deepEqual(issueCodes(text, 'pdf'), ['name-mismatch']);
  assert.equal(loadSkill(text, { directoryName: 'pdf-forms' }).ok, true);
});

test('validates description length and content', () => {
  const at = (description: string) => validateSkillFrontmatter({ name: 'ok', description }).map((issue) => issue.code);
  assert.deepEqual(at('x'.repeat(MAX_DESCRIPTION_LENGTH)), []);
  assert.deepEqual(at('x'.repeat(MAX_DESCRIPTION_LENGTH + 1)), ['description-too-long']);
  assert.deepEqual(at('   '), ['empty-description']);
  assert.deepEqual(at('Use when <b>asked</b>'), ['xml-tag']);
  assert.deepEqual(at('Use when a < b and c > d'), []);
  assert.deepEqual(validateSkillFrontmatter({ name: 'ok', description: { raw: 'a: b' } }).map((i) => i.code), ['invalid-description']);
  assert.deepEqual(validateSkillFrontmatter({ name: 'ok', description: ['a', 'b'] }).map((i) => i.code), ['invalid-description']);
});

test('reports name and description problems together', () => {
  assert.deepEqual(issueCodes('---\nname: Bad Name\ndescription: ""\n---\n'), ['invalid-name', 'empty-description']);
});

test('rejects oversized input before parsing', () => {
  assert.deepEqual(issueCodes('---\n' + 'x'.repeat(MAX_SKILL_FILE_LENGTH)), ['too-large']);
});
