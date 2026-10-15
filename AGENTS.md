# Repository development guidance

Run checks from the repository root through `node scripts/arms-test.mjs`.

1. Review one plan per task: `node scripts/arms-test.mjs verify --plan`.
   Supply repeated `--file <path>` for a known task scope, or `--base <revision>`
   for committed changes. Explicit files replace Git discovery; include the whole
   task scope, including removed paths.
2. After significant edits use `syntax`; at task completion use `verify` once.
   If T0 already passed with unchanged inputs, use the remaining modes listed in
   the plan explicitly. Run T1 at most once for an unchanged code/test revision.
   Full covers T1: do not run both `related` and `full` for the same revision.
3. Full tests are justified by shared/core or test infrastructure changes, or an
   explicit user request. Smoke is justified only by the integration rules in
   `scripts/test-policy.json`. Do not add sandbox/TUI checks to server-only tasks.
4. `needs-review` is a configuration error: add a reviewed mapping and related
   tests before verification. Never resolve unknown files by silently running all
   modes, or by omitting an affected file from the changed-file list.
5. Do not repeatedly run unchanged failing commands. Diagnose the failure before
   retrying. T0/T1/T2 are not cached; smoke passes are fingerprinted and reused.
   Use `--force` for an intentional smoke rerun, `--rebuild` for image rebuild.
   After two identical failures the runner blocks another unchanged retry;
   override only after diagnosis with `--force --reason "<reason>"`.
   Read the full log referenced by a failure instead of rerunning for more output.
   Do not call static/runtime/TUI independently when one verify plan covers them.
6. Use `npm run test:policy` to report bypasses in changed automation. Legacy
   `test:raw` and `sandbox/manage.mjs` commands are diagnostic escape hatches;
   document the reason when using them. `baseline` is an explicit observation
   exception, not the ordinary verification path.

Do not install Git hooks or change global configuration automatically. See
`docs/testing/testing.md` for opt-in CI/pre-push commands and baseline collection.
Opt in before push with `npm run test:pre-push -- --base <revision>`: full plus
classifier-required smoke in one invocation. CI sets `CI=true` to distrust local
stamps. Missing required Docker/Python/PTY blocks validation. Record real tasks
with `--task <task-id>`; review rollout using `npm run test:acceptance`.
