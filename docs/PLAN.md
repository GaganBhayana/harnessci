# HarnessCI plan

**You test your code. Now test your agent setup.**

HarnessCI is a CLI and GitHub Action that tests changes to agent configuration (skills, AGENTS.md or CLAUDE.md, MCP configs, plugins) against tasks mined from the repo's own history, and reports quality, cost and behaviour differences on the PR.

## Why

Teams change SKILL.md and AGENTS.md weekly with no idea whether their agents got better or worse. Early tools evaluate skills alone, or benchmark agents on a repo, but none gates config changes in CI across harnesses.

## Functional requirements

MVP (launch 20 Sep 2027):

1. **Detect config changes** in a PR: SKILL.md files, AGENTS.md/CLAUDE.md, `.mcp.json` and similar, plugin manifests.
2. **Task mining:** turn merged PRs that include tests into tasks (goal from PR description and linked issue, check = those tests, start state = parent commit with the source half of the diff reverted). Add hand-written YAML tasks.
3. **Runs:** execute Claude Code headless first (then Codex, OpenCode) in throwaway worktrees with the base config and the PR's config, N repeats each, within a budget.
4. **Measure:** pass rate, tokens, cost, wall time, tool and skill invocations, out-of-scope file edits, deleted tests.
5. **Report:** a PR comment with a diff table and confidence intervals; fail the check only on a statistically significant regression.
6. **Cache:** results keyed by (task, config hash, harness version, model).

Later: replay cassettes for free repeats; a skill linter (description quality, trigger overlap); a monthly public leaderboard of popular skills and plugins.

## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Cost | Hard budget per PR; smoke mode (3 tasks, 1 repeat) by default |
| Statistics | Never claim a win from one run; report intervals |
| Security | Agents run with no secrets in throwaway worktrees |
| Neutrality | Adapter interface for every harness |

## Architecture

```
PR ─► config diff ─► task set (mined + YAML) ─► runner (worktree × harness × config × repeat) ─► transcript parser ─► metrics ─► stats ─► PR report
```

Pure logic in `src/config/`, `src/tasks/`, `src/transcripts/`, `src/stats/`, `src/report/`; runs on forge-core sandboxes.

## Milestones

| Milestone | Target | Scope |
| --- | --- | --- |
| M0 Foundation | Feb–Jul 2027 (rotation) | Config change detection, task model + YAML, diff splitting for task mining, transcript parsers, metrics, bootstrap intervals and significance, report renderer, skill lint rules |
| M1 Runner | Aug 2027 | Worktree runner, Claude Code adapter, cache, CLI |
| M2 Launch | 20 Sep 2027 | Action, Codex/OpenCode adapters, leaderboard v1, launch |
