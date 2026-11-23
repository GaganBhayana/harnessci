# HarnessCI tasks

Status values: `todo`, `review (PR #n)`, `done (PR #n)`, `blocked: <reason>`. Sizes: S (under 150 lines changed), M (150–400). One task per PR. M0 tasks are pure logic with no I/O.

## M0 Foundation

### HC-001 Agent config change detection
- Status: done (PR #1)
- Size: S
- Depends on: none
- Goal: `src/config/detect.ts` classifies changed paths as `skill`, `agents-md`, `claude-md`, `mcp-config`, `plugin-manifest`, `other`, using path rules (`**/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.claude/settings*.json`, `plugin.json`).
- Acceptance: table-driven tests with nested paths and look-alikes.

### HC-002 SKILL.md frontmatter parser and validator
- Status: todo
- Size: S
- Depends on: none
- Goal: `src/config/skill.ts` parses YAML-subset frontmatter (`name`, `description`, other keys) and body; validates name format and description length.
- Acceptance: tests for valid, missing and malformed frontmatter.

### HC-003 Skill lint rules
- Status: todo
- Size: M
- Depends on: HC-002
- Goal: `src/lint/skills.ts`: description says when to use the skill; no vague descriptions ("helps with stuff"); trigger overlap between skills in the same repo (word-overlap score above a threshold); body references files that exist.
- Acceptance: tests per rule with good and bad fixtures.

### HC-004 Task model and YAML loader
- Status: todo
- Size: S
- Depends on: none
- Goal: `src/tasks/model.ts` `Task {id, title, prompt, repoRef, setup?, check: {command, expectExit}, timeoutSec, tags}` and a loader for `harness/tasks/*.yml` using a minimal YAML subset.
- Acceptance: tests for loading and validation errors.

### HC-005 Diff splitter for task mining
- Status: todo
- Size: M
- Depends on: HC-004
- Goal: `src/tasks/split.ts` splits a unified diff into test-file and source-file halves by path rules; produces the "start state" patch (revert source half) and the "check" (test half). Rejects PRs with no tests or with only tests.
- Acceptance: tests on multi-file diff fixtures, including renames.

### HC-006 Claude Code transcript parser
- Status: todo
- Size: M
- Depends on: none
- Goal: `src/transcripts/claude.ts` parses Claude Code stream-JSON output into events (assistant text, tool calls with names and inputs, tool results, usage) and summarises tokens, cost, tool counts and skills invoked.
- Acceptance: tests with small synthetic transcripts.

### HC-007 Behaviour metrics
- Status: todo
- Size: S
- Depends on: HC-006
- Goal: `src/metrics.ts` computes per-run metrics: pass, tokens, cost, wall time, tool calls, files edited outside an allowed scope, tests deleted.
- Acceptance: tests from parsed transcript fixtures and diff fixtures.

### HC-008 Bootstrap confidence intervals and significance
- Status: todo
- Size: M
- Depends on: none
- Goal: `src/stats/bootstrap.ts` with a seeded PRNG, bootstrap CI for pass-rate and mean differences, and a two-proportion test; deterministic given a seed.
- Acceptance: tests against hand-computed examples and determinism checks.

### HC-009 PR report renderer
- Status: todo
- Size: S
- Depends on: HC-007, HC-008
- Goal: `src/report.ts` renders the base-vs-PR table with intervals, a verdict (improved, regressed, no significant change) and per-task details.
- Acceptance: snapshot tests for each verdict.

### HC-010 Result cache keys
- Status: todo
- Size: S
- Depends on: HC-004
- Goal: `src/cache/key.ts` stable hashes of (task, config files content, harness version, model) with canonical JSON.
- Acceptance: tests that key order and whitespace don't change hashes but content does.

## M1 Runner (outline, detailed by the weekly planning session)

- HC-011 Git worktree manager on forge-core sandbox runner.
- HC-012 Claude Code headless adapter.
- HC-013 Task miner over GitHub PR history.
- HC-014 Cache store.
- HC-015 CLI `harnessci run`.
