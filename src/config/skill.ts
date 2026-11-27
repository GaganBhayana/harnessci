/**
 * SKILL.md parsing and validation.
 *
 * A SKILL.md file starts with YAML frontmatter between two `---` lines, followed by a Markdown
 * body. Only a small YAML subset is read, enough for real skill files and no more:
 *
 * - `key: value` pairs at the top level; keys are letters, digits, `_` and `-`;
 * - plain, 'single-quoted' and "double-quoted" scalars (plain scalars drop a trailing ` # comment`
 *   and may continue on indented lines, which fold into one line as in YAML; like YAML, a plain
 *   scalar cannot contain `: ` or end with `:`, so such a value must be quoted);
 * - `|` and `>` block scalars, with an optional `-` or `+` chomping indicator (an indentation
 *   indicator is accepted but the block is always dedented by its smallest indent);
 * - a list of scalars (`- item` lines indented under a key with an empty value);
 * - any other indented block under a key with an empty value (for example a `metadata:` map) is
 *   kept as its dedented source text;
 * - blank lines and `#` comment lines.
 *
 * Anything else is reported as an issue rather than guessed at. Inputs are untrusted repository
 * text, so the parser never evaluates tags, anchors or aliases and caps the input size.
 */

/** A frontmatter value: a scalar, a list of scalars, or the raw text of a nested block. */
export type FrontmatterValue = string | readonly string[] | { readonly raw: string };

/** Why a SKILL.md file could not be parsed or does not meet the rules. */
export type SkillIssueCode =
  | 'too-large'
  | 'no-frontmatter'
  | 'unterminated-frontmatter'
  | 'malformed-line'
  | 'duplicate-key'
  | 'missing-name'
  | 'missing-description'
  | 'invalid-name'
  | 'name-mismatch'
  | 'empty-description'
  | 'invalid-description'
  | 'description-too-long'
  | 'xml-tag';

/** One problem found in a SKILL.md file. `line` is 1-based in the original text, when known. */
export interface SkillIssue {
  readonly code: SkillIssueCode;
  readonly message: string;
  readonly line?: number;
}

/** The parts of a SKILL.md file. */
export interface SkillFile {
  /** Frontmatter keys in file order. The object has no prototype, so any key name is safe. */
  readonly frontmatter: Readonly<Record<string, FrontmatterValue>>;
  /** Markdown after the closing `---`, with line endings normalised to `\n`. */
  readonly body: string;
  /** 1-based line number where the body starts. */
  readonly bodyLine: number;
}

/** A SKILL.md file whose frontmatter passed validation. */
export interface Skill extends SkillFile {
  readonly name: string;
  readonly description: string;
}

/** Result of {@link parseSkillFile}. */
export type SkillFileResult =
  | { readonly ok: true; readonly value: SkillFile }
  | { readonly ok: false; readonly issues: readonly SkillIssue[] };

/** Result of {@link loadSkill}. */
export type SkillResult =
  | { readonly ok: true; readonly value: Skill }
  | { readonly ok: false; readonly issues: readonly SkillIssue[] };

/** Options for {@link validateSkillFrontmatter} and {@link loadSkill}. */
export interface SkillValidationOptions {
  /** Name of the folder holding SKILL.md. When given, `name` must equal it. */
  readonly directoryName?: string;
}

/** Largest SKILL.md accepted, in UTF-16 code units. */
export const MAX_SKILL_FILE_LENGTH = 1_000_000;
/** Longest allowed skill name. */
export const MAX_NAME_LENGTH = 64;
/** Longest allowed skill description. */
export const MAX_DESCRIPTION_LENGTH = 1024;

/** Lowercase letters, digits and single hyphens; no hyphen at either end. */
const NAME_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_WORDS = ['anthropic', 'claude'] as const;
const XML_TAG = /<\/?[A-Za-z][^<>]*>/;
const FENCE = /^---[ \t]*$/;
const KEY_LINE = /^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/;

/**
 * Splits a SKILL.md file into frontmatter and body, and parses the frontmatter.
 * Accepts a leading byte-order mark and CRLF or CR line endings.
 */
export function parseSkillFile(text: string): SkillFileResult {
  if (text.length > MAX_SKILL_FILE_LENGTH) {
    return fail({ code: 'too-large', message: `SKILL.md is longer than ${MAX_SKILL_FILE_LENGTH} characters` });
  }
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  if (!FENCE.test(lines[0] ?? '')) {
    return fail({ code: 'no-frontmatter', message: 'SKILL.md must start with a "---" frontmatter line', line: 1 });
  }
  const end = lines.findIndex((line, i) => i > 0 && FENCE.test(line));
  if (end === -1) {
    return fail({ code: 'unterminated-frontmatter', message: 'frontmatter has no closing "---" line', line: 1 });
  }
  const parsed = parseFrontmatter(lines.slice(1, end), 2);
  if (parsed.issues.length > 0) return { ok: false, issues: parsed.issues };
  return { ok: true, value: { frontmatter: parsed.values, body: lines.slice(end + 1).join('\n'), bodyLine: end + 2 } };
}

/** Checks the `name` and `description` rules. Returns an empty list when the frontmatter is valid. */
export function validateSkillFrontmatter(
  frontmatter: Readonly<Record<string, FrontmatterValue>>,
  options: SkillValidationOptions = {},
): SkillIssue[] {
  return [...validateName(frontmatter['name'], options), ...validateDescription(frontmatter['description'])];
}

/** Parses and validates a SKILL.md file in one step. */
export function loadSkill(text: string, options: SkillValidationOptions = {}): SkillResult {
  const parsed = parseSkillFile(text);
  if (!parsed.ok) return parsed;
  const issues = validateSkillFrontmatter(parsed.value.frontmatter, options);
  if (issues.length > 0) return { ok: false, issues };
  const { name, description } = parsed.value.frontmatter as { name: string; description: string };
  return { ok: true, value: { ...parsed.value, name, description } };
}

function validateName(value: FrontmatterValue | undefined, options: SkillValidationOptions): SkillIssue[] {
  if (value === undefined) return [{ code: 'missing-name', message: 'frontmatter has no "name"' }];
  if (typeof value !== 'string') return [{ code: 'invalid-name', message: '"name" must be a single string' }];
  if (value.length === 0 || value.length > MAX_NAME_LENGTH || !NAME_FORMAT.test(value)) {
    return [{
      code: 'invalid-name',
      message: `"name" must be 1-${MAX_NAME_LENGTH} lowercase letters, digits and single hyphens, not starting or ending with a hyphen`,
    }];
  }
  const reserved = RESERVED_WORDS.find((word) => value.split('-').includes(word));
  if (reserved !== undefined) return [{ code: 'invalid-name', message: `"name" must not contain the reserved word "${reserved}"` }];
  if (options.directoryName !== undefined && options.directoryName !== value) {
    return [{ code: 'name-mismatch', message: `"name" is ${JSON.stringify(value)} but the folder is ${JSON.stringify(options.directoryName)}` }];
  }
  return [];
}

function validateDescription(value: FrontmatterValue | undefined): SkillIssue[] {
  if (value === undefined) return [{ code: 'missing-description', message: 'frontmatter has no "description"' }];
  if (typeof value !== 'string') return [{ code: 'invalid-description', message: '"description" must be a single string' }];
  if (value.trim() === '') return [{ code: 'empty-description', message: '"description" is empty' }];
  if (value.length > MAX_DESCRIPTION_LENGTH) {
    return [{ code: 'description-too-long', message: `"description" is ${value.length} characters; the limit is ${MAX_DESCRIPTION_LENGTH}` }];
  }
  if (XML_TAG.test(value)) return [{ code: 'xml-tag', message: '"description" must not contain XML tags' }];
  return [];
}

interface ParsedFrontmatter {
  readonly values: Record<string, FrontmatterValue>;
  readonly issues: SkillIssue[];
}

function parseFrontmatter(lines: readonly string[], firstLine: number): ParsedFrontmatter {
  const values: Record<string, FrontmatterValue> = Object.create(null);
  const issues: SkillIssue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const lineNo = firstLine + i;
    i += 1;
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const match = KEY_LINE.exec(line);
    if (match === null) {
      issues.push({ code: 'malformed-line', message: 'expected "key: value"', line: lineNo });
      continue;
    }
    const key = match[1] ?? '';
    const rest = (match[2] ?? '').trim();
    const block = takeIndented(lines, i);
    i += block.length;
    const value = parseValue(rest, block);
    if (typeof value === 'object' && 'error' in value) {
      issues.push({ code: 'malformed-line', message: value.error, line: lineNo });
    } else if (key in values) {
      issues.push({ code: 'duplicate-key', message: `"${key}" appears more than once`, line: lineNo });
    } else {
      values[key] = value;
    }
  }
  return { values, issues };
}

/**
 * Collects the lines that belong to the key above: indented or blank lines, plus unindented `- `
 * list items (YAML allows a list at the key's own indentation). Trailing blank lines are left out.
 */
function takeIndented(lines: readonly string[], start: number): string[] {
  let end = start;
  let lastContent = start;
  while (end < lines.length && /^([ \t]|-([ \t]|$)|$)/.test(lines[end] ?? '')) {
    end += 1;
    if ((lines[end - 1] ?? '').trim() !== '') lastContent = end;
  }
  return lines.slice(start, lastContent);
}

function parseValue(rest: string, block: readonly string[]): FrontmatterValue | { error: string } {
  const blockHeader = /^([|>])[1-9]?([-+]?)[1-9]?(?:[ \t]+#.*)?$/.exec(rest);
  if (blockHeader !== null) return blockScalar(blockHeader[1] === '>', blockHeader[2] ?? '', block);
  if (rest !== '' && !rest.startsWith('#')) {
    if (block.length === 0) return scalar(rest);
    if (isPlainStart(rest) && block.every((line) => line.trim() === '' || /^[ \t]/.test(line))) return multilinePlain(rest, block);
    return { error: 'a value on the key line cannot be followed by indented lines' };
  }
  const content = dedent(block);
  if (content.length === 0) return '';
  if (content.every((line) => line === '' || /^- /.test(line) || line === '-')) {
    const items: string[] = [];
    for (const line of content) {
      if (line === '') continue;
      const item = scalar(line.slice(1).trim());
      if (typeof item !== 'string') return item;
      items.push(item);
    }
    return items;
  }
  return { raw: content.join('\n') };
}

/**
 * A plain scalar continued on indented lines: lines are joined with spaces and a blank
 * line becomes a newline. Only the last line may end with a ` # comment`.
 */
function multilinePlain(first: string, block: readonly string[]): string | { error: string } {
  const lines = [first, ...dedent(block).map((line) => line.trim())];
  let last = lines.length - 1;
  while (last > 0 && lines[last] === '') last -= 1;
  const pieces: string[] = [];
  for (let i = 0; i <= last; i += 1) {
    const line = lines[i] ?? '';
    const comment = commentStart(line);
    if (line.startsWith('#') || (comment !== -1 && i < last)) {
      return { error: 'a comment cannot appear inside a multi-line value; quote the value' };
    }
    const piece = comment === -1 ? line : line.slice(0, comment).trimEnd();
    if (MAPPING_INDICATOR.test(piece)) return { error: MAPPING_INDICATOR_ERROR };
    pieces.push(piece);
  }
  return fold(pieces);
}

function blockScalar(folded: boolean, chomp: string, block: readonly string[]): string {
  const content = dedent(block);
  let text = folded ? fold(content) : content.join('\n');
  if (chomp === '-') return text;
  text += '\n';
  return chomp === '+' ? text : text.replace(/\n+$/, '\n');
}

/** Joins lines with spaces; blank lines become newlines, as YAML folding does for unindented text. */
function fold(lines: readonly string[]): string {
  let out = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (i === 0) out = line;
    else if (line === '') out += '\n';
    else out += out.endsWith('\n') || out === '' ? line : ` ${line}`;
  }
  return out;
}

function dedent(block: readonly string[]): string[] {
  const indents = block.filter((line) => line.trim() !== '').map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return block.map((line) => (line.trim() === '' ? '' : line.slice(indent).trimEnd()));
}

function scalar(text: string): string | { error: string } {
  if (text.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/.exec(text);
    return match === null ? { error: 'unterminated or malformed single-quoted value' } : (match[1] ?? '').replace(/''/g, "'");
  }
  if (text.startsWith('"')) {
    const match = /^"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/.exec(text);
    if (match === null) return { error: 'unterminated or malformed double-quoted value' };
    return unescapeDouble(match[1] ?? '');
  }
  if (!isPlainStart(text)) {
    return { error: 'anchors, aliases, tags, flow collections and reserved indicators are not supported; quote the value' };
  }
  const comment = commentStart(text);
  const value = (comment === -1 ? text : text.slice(0, comment)).trim();
  if (MAPPING_INDICATOR.test(value)) return { error: MAPPING_INDICATOR_ERROR };
  return value;
}

/** `: ` inside, or `:` at the end of, a plain scalar: YAML reads it as a mapping, not text. */
const MAPPING_INDICATOR = /:(?:[ \t]|$)/;
const MAPPING_INDICATOR_ERROR = 'a plain value cannot contain ": " or end with ":"; quote the value';

/** True when the text can start a plain scalar (no quote, anchor, alias, tag, flow or reserved indicator). */
function isPlainStart(text: string): boolean {
  return !/^[&*!%@`'"[{]/.test(text);
}

/**
 * Index of the space or tab that starts a ` # comment`, or -1. A plain search, because a
 * pattern like `/[ \t]+#.*$/` backtracks quadratically on long runs of spaces.
 */
function commentStart(text: string): number {
  return text.search(/[ \t]#/);
}

const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0', ' ': ' ' };

function unescapeDouble(text: string): string | { error: string } {
  let bad: string | undefined;
  const out = text.replace(/\\(u[0-9A-Fa-f]{4}|.)/g, (_, esc: string) => {
    if (esc.length === 5) return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
    const mapped = ESCAPES[esc];
    if (mapped === undefined) bad ??= esc;
    return mapped ?? '';
  });
  return bad === undefined ? out : { error: `unsupported escape "\\${bad}" in double-quoted value` };
}

function fail(issue: SkillIssue): SkillFileResult {
  return { ok: false, issues: [issue] };
}
