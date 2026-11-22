# HarnessCI

**You test your code. Now test your agent setup.**

CI for agent configs. HarnessCI tests changes to skills, AGENTS.md and MCP configs against tasks mined from your own repo's history, and reports pass rate, cost and behaviour changes on the PR.

> Status: pre-alpha, built in public. Follow progress in [docs/TASKS.md](docs/TASKS.md); the full plan is in [docs/PLAN.md](docs/PLAN.md).

## Development

Requires Node 22.18 or newer. No build step is needed for development: Node runs the TypeScript sources directly.

```sh
npm install
npm run check   # type-check + tests
```

## How this project is built

Work is planned in [docs/TASKS.md](docs/TASKS.md) and delivered in small, reviewed pull requests by an autonomous Claude pipeline that the owner supervises. See [oss-autopilot](https://github.com/GaganBhayana/oss-autopilot). AI involvement is disclosed on every commit.

## License

Apache-2.0
