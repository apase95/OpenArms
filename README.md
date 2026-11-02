<p align="center">
  <img src="docs/assets/openarms-logo.svg" alt="OpenArms logo" width="560">
</p>

### Opt-in verification before push / CI

Use `npm run test:pre-push -- --base <revision> --plan`, then the same command
without `--plan`. Replace `<revision>` with the reviewed base commit, such as
`origin/main`. Full host Node tests run once; sandbox is not scheduled. CI uses
`CI=true npm run test:pre-push -- --base <revision>` with enough Git history.
Docker/Python/PTY are needed only for explicit legacy smoke requests, not normal
verification. No hook is installed automatically.
See [commands](docs/testing/testing.md) and [Sprint 0.4](docs/testing/how_to_test/Sprint_04.md).

OpenArms provides project skill toggles and runtime governance for
[OpenCode](https://github.com/anomalyco/opencode). Enabled instructions are
automatically injected each turn; every skill is independently ON/OFF.
See the [current format, commands and migration guide](docs/guides/skill-management.md).

## Current Scope

Sprint 4.5 is **partial**, not accepted: [KPI protocol and remaining work](docs/testing/how_to_test/Sprint_45.md).
`/skills install [--local|--global] [--overwrite] <https-github-url>` now runs the
audited fetch/decompile/register pipeline with an explicitly entered provider/model,
separate source-send/write consent and optional confirmed library switch. Use the
`install` menu action for interactive URL entry. No model or library fallback.
The paired UsageStore reporting API does not prove live savings; Routing Index and
50 real comparative tasks remain outstanding.

- Intercepts `/skills` in the OpenCode TUI.
- Defaults to `.openarms/packages` within the canonical project, with a confirmed external-directory override in Status.
- Discovers minimal per-package manifests; no central registry is needed.
- Injects ON skill instructions automatically every turn; no model-facing skill load tools.
- Shows ON/OFF/ERROR. Packages provide bulk toggles, not an authorization layer.
- Persists project-scoped enabled IDs with cooperative state transactions and safe contained reads.
- Bundles only skills with an explicit license. Each bundled skill retains its
  own license file.

Use turns skills ON; remove/disable/clear turns them OFF for future injection.
Old conversation content remains; toggles do not require a new session.
Directory changes default to Cancel; confirming resets project toggles to OFF.
See the [skill-management guide](docs/guides/skill-management.md), including the
explicit migration and remaining verification limitations.
Sprint 2.3/2.4 guides retain historical verified-loader evidence, not required
current setup. The migration has passed offline full tests and generated-data
Docker runtime/TUI smoke. This does not establish live-provider instruction
following or the independent comparative-savings acceptance targets.

## Development

Requirements: Node.js 22 or newer.

```bash
npm ci
npm run test:plan
npm test -- --task task-123
```

`npm test` uses the unified runner to select host syntax and related/full Node tests.
Sandbox smoke is never selected automatically. Use repeated `--file <path>`
for an explicit task scope or `--base <revision>` for committed changes.
`npm run test:full` explicitly requests the complete suite. Unknown paths return
`needs-review`. See [test policy and baseline collection](docs/testing/testing.md).

Checks return compact summaries and preserve raw output in `.openarms/logs/`.
Two identical failures on unchanged inputs block a third retry; after diagnosis,
use `--force --reason "<intentional rerun reason>"` to override. See the
[Sprint 0.1–0.3 report](docs/reports/sprints/report_sprint_01_02_03.md) for implementation evidence.

Install the dependencies, then reference the server entry point in your
OpenCode `opencode.json`:

```json
{
  "plugin": [
    "file:///absolute/path/to/OpenArms/plugins/skill-router-server.ts"
  ]
}
```

Register the TUI entry point separately in `tui.json` alongside that config:

```json
{
  "plugin": [
    "file:///absolute/path/to/OpenArms/plugins/skill-router-tui.tsx"
  ]
}
```

Optional [controller/scout/implementer profiles](docs/guides/local-opencode.md)
and portable prompts are provided as manually reviewed examples, not an installer.
Provider/model choices remain yours; no credentials, private endpoints, personal
permissions or installed configuration are copied or overwritten.

OpenArms writes runtime state to `$XDG_STATE_HOME/openarms/state.json`, falling
back to `~/.local/state/openarms/state.json`. This file is never part of the
repository.

## Architecture

Platform-independent core modules live in `src/`. The two entry points in
`plugins/` adapt OpenCode hooks and TUI events to that core. Both adapters use
the local-library runtime to initialize project configuration, package manifests
and state paths. `src/local-library.ts` implements the default/explicit directory,
project toggles and contained reads; `src/skills-service.ts` handles local commands.
The server automatically injects enabled instructions through its system transform;
no model-facing skill-content tool is registered.

See the [`docs` index](docs/README.md) for the user guide, runtime flow, state
model, security boundaries, onboarding, and architecture. Package availability
comes only from the library you choose.

## Sandbox (reference-only, explicit opt-in)

Docker Compose provides isolated OpenCode config, state, databases, cache, and a
disposable project, pinned to the locally verified OpenCode version:

It is retained for historical diagnostics, not the normal development/test path.
Do not start it for ordinary verification. Explicit legacy commands are documented
in [`sandbox/README.md`](sandbox/README.md).

The runner checks static contracts first, reuses fingerprinted pass results and
builds only when the required runtime image has no matching fingerprint label. Explicit
`npm run test:smoke` and `npm run test:tui-smoke` remain available for diagnostics;
do not run all sandbox checks for every edit. `npm run sandbox -- test` is a
low-level diagnostic command.

Use `npm run test:smoke-static` for offline contracts, or add `-- --force` to a
smoke command to rerun with a matching image; `-- --rebuild` also forces a build.
Runner-managed smoke uses temporary isolated volumes and cleans them after each
run. See [smoke contracts and cache](docs/testing/smoke-contract.md).

Add `--installed` to `start` or unified smoke commands to expose the locally installed router's
registry and skill library read-only, with a separate set of sandbox volumes.
Then explicitly choose `/opt/installed-router` in Status; repository sandbox
users can choose `/opt/openarms`, or a valid project library folder. A host path
is not reachable inside the container unless mounted. Mounting is not selection.
See [`sandbox/README.md`](sandbox/README.md) for authentication, fixtures, and reset.

The source repository intentionally excludes OpenCode runtime data, auth files,
databases, logs, backups, local state, and skills without verified licensing.

## OpenCode Fork

Compatibility work is tracked separately in
[`apase95/opencode`](https://github.com/apase95/opencode), a fork of the MIT
licensed upstream project. Keeping the fork separate allows OpenArms to remain
a focused plugin rather than a full OpenCode distribution.

## License

OpenArms engine code is released under the MIT License. Bundled skills are
distributed under the license contained in each skill directory.
