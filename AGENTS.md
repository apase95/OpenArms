# Repository development guidance

OpenArms has native skills, output compaction and an optional compact transcript host patch.
The explicit project-skill decision permits deny-only ON/OFF preferences in
`.openarms/skills.json`, native in-memory permission denies and a skill before-hook.
ON removes only OpenArms restrictions; it never grants host permission. This does not
permit a grants/approval engine, global config writes or legacy state migration.
Project-level feature controls are explicitly permitted in `.openarms/features.json`:
skills-management, output-compaction and compact-transcript, default ON when supported.
The Features menu must remain reachable with all features OFF. Disabling skills-management suspends OpenArms skill restrictions;
it must not remove user-native denies or delete saved skill choices. Output OFF is a
complete passthrough with no new raw-output artifacts.
Do not reintroduce usage/budget, installers, session lifecycle, multi-agent workflow,
permission/grant engines or automatic skill injection without a new explicit decision.

## Small host checks

Run from the repository root with a Node.js version allowed by `package.json` engines.
The pinned SDK's transitive dependencies require newer patch releases than Node 22.19:

1. `npm ci` when dependencies change.
2. Review one task scope: `node scripts/arms-test.mjs verify --plan --task <id>`.
   Repeated `--file <path>` replaces Git discovery; include removed paths. Use
   `--base <revision>` for a committed scope, not together with `--file`.
3. After significant code edits: `node scripts/arms-test.mjs syntax` (`npm run check`).
4. At completion: `node scripts/arms-test.mjs verify` (`npm test`). If syntax already
   passed with unchanged code/test inputs, use `full` for the remaining unit suite.
5. Run `npm run test:policy` when automation changes. Unknown scope is `needs-review`:
   add a reviewed rule rather than omitting paths. Read failures before retrying;
   do not repeatedly run unchanged failing checks.

`arms-test.mjs` is a thin entrypoint: TypeScript, local imports, active docs links,
and the complete small Node unit suite. There are no test tiers, selective mappings,
cache, smoke modes, Docker/Python/PTY prerequisites, acceptance ledgers or Git hooks.
`full` runs only the unit suite; it is not live OpenCode acceptance. No checks contact
providers or operate on the user's OpenCode database/configuration.

## Safety and upgrade boundaries

- Preserve host tool title/metadata; never invent exit codes or rewrite native skill results.
- Read skills through the host catalog; host owns loading and permissions.
- Do not reset/auto-submit the user's draft or replace the host prompt component.
- Logs are private observed-output artifacts, not usage telemetry. Never edit `.gitignore`
  or delete conversation/state data as a side effect of running a tool.
- Do not modify `~/.config/opencode`, install Git hooks, or deploy automatically.
- Docs are flat and topic-owned: use [the docs index](docs/README.md) to choose the
  canonical page. Do not add duplicate overviews, sprint reports or archive folders.
- Historical contracts are available through Git history, not current setup instructions.
  Keep implemented behavior in the topic guides, checks/evidence in
  [verification](docs/verification.md), and contributor workflow in
  [development](docs/development.md).
