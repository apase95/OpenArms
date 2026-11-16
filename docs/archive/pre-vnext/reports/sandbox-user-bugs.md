# Sandbox user bug repair evidence

Task: `sandbox-user-bugs`. Public host reference: OpenCode v1.18.35,
commit `53d1eabb61e21162157817bf677da0a4ad3332e3`, plugin TUI API,
prompt component and keymap sources listed in `.opencode/handoff.md`.

## Causes and repairs

1. Typed skills arguments bypassed the command-only override through native
   textarea submission. Host `onSubmit` is a post-send notification, not a
   cancellation hook. The public focused base-mode pre-key interceptor consumes local commands
   synchronously and reset before native deferred submission; public slot ref
   submission uses the same decision. Ordinary text retains the host path.
2. Persisted sessions can exist without a task boundary. Coalescing the whole
   session object skipped boundary initialization; the isolated reproduction
   returned `TASK_CHANGED`. Initialize the missing field before capturing the
   transaction boundary, retain race checks, and deny missing session identity.
   This reproduction is **not proof** of the screenshot's exact `INVALID_CONTEXT`
   origin. Exact selected skill IDs and deterministic stop/approval instructions
   are supplied to the model; trust and approval validators are unchanged.
3. `selectionReady` on persisted Home state was incorrectly treated as fresh
   intent. A distinct pending explicit Home selection is consumed atomically
   once, only into an unselected root session. Home startup/return clears stale
   draft intent, preserving project restore history. Resume does not restore;
   new-root restore still defaults No. Child fallback remains isolated.
4. Usage/budget had no discoverable slash registrations and shared the native
   submission bypass. Both are registered and consumed locally, including invalid
   arguments. Bare usage defaults to today; default budget limits remain empty,
   missing usage is not zero, and invalid configuration is never downgraded.

## Evidence and limits

Isolated behavioral file: `tests/sandbox-user-bugs.test.ts`. It exercises local
consume decisions, task initialization, unverified denial, exact-ID guidance,
explicit grants, missing identity denial, Home one-shot adoption, resume,
restore No/Yes and child isolation. Synthetic interfaces are test fixtures only;
they do not approve or change the live library.

RED: isolated runner failed for missing interception export (157 ms), then
behavioral missing-boundary regression failed with `TASK_CHANGED` (204 ms).
GREEN for the initial two cases: 2/2 passed (235 ms).
The first actual-host attempt failed (61,242 ms) because a `registerLayer.target`
Solid accessor is not supported by the standalone API (a concrete Renderable is
required). This was repaired using the public `keymap.intercept("key", ...)`
boundary; no private textarea patching or post-send cancellation is used.

Updated isolated file: 3/3 passed, 402 ms. Syntax: 12/12, 563 ms.
Policy bypass report: zero findings.
Initial full run: 166/167, 15,472 ms; only the mapping expectation failed because
the new state-store regression was correctly included. Both hard-coded expected
lists were updated without removing regression coverage.

Static: 8/8, 490 ms. Runtime: 5/5, 92,919 ms. Actual OpenCode 1.18.35 PTY:
picker navigation and ten typed local-command cases passed, 221,693 ms. PTY log:
`.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-6fe310e3-ee5b-4b94-ad1b-b116ca7e5616.log`.
This is real host evidence, not a JSX/static fixture.

Final completion `verify` passed: syntax 12/12 (524 ms), full 167/167
(15,908 ms), build (86,390 ms), and real PTY (176,937 ms). Static/runtime
reused fingerprinted passes with unchanged inputs. The final PTY exercised
12 typed cases, including real `/skills use docs docs-editor` and subsequent
Status/Inspect displaying `Unverified (UNVERIFIED)`, not `INVALID_CONTEXT`.
No live registry was migrated, approved, rehashed or otherwise altered.
The runner summary reports `checks=4` for the original navigation contract;
the 12 additional cases are individually named in the PTY log.

### Exact completion command and task-owned paths

```bash
node scripts/arms-test.mjs verify --task sandbox-user-bugs \
  --file plugins/skill-router-tui.tsx --file plugins/tui-core.ts \
  --file plugins/skill-router-server.ts --file src/runtime.ts \
  --file src/types.ts --file src/state-schema.ts --file src/state-store.ts \
  --file src/package-loader.ts --file src/usage-query.ts \
  --file tests/sandbox-user-bugs.test.ts --file tests/test-runner.test.mjs \
  --file scripts/test-map.json --file sandbox/tui-smoke.py \
  --file docs/testing/manual-testing.md --file docs/reports/sandbox-user-bugs.md
```

These 15 files are the task-owned edit scope; earlier dirty-tree work is
preserved. One scoped plan was reviewed. The additional runner expectation
repair was included explicitly in completion scope. Full was required for
shared core/state and mapping changes. Related was covered by full; the isolated
file alone was used for RED/GREEN. No unchanged full revision was run twice.

Other executed runner modes used the same explicit task scope (before the
runner expectation repair, without `tests/test-runner.test.mjs`):
`verify --plan`, `syntax`, `full`, `smoke-runtime`, `tui-smoke`.
The isolated command was
`node scripts/arms-test.mjs related --task sandbox-user-bugs --file tests/sandbox-user-bugs.test.ts`.
Automation validation: `npm run test:policy` (zero bypass findings).
`git diff --check -- <the 15 paths above>` passed; untracked files were reviewed
through their named source contents rather than relying on Git diff coverage.

### Full log paths (repository-relative)

- RED missing export: `.openarms/logs/related-63512111b2672f0378fc92ef-d3be792f-2333-4e5a-8483-63eb0bb5a053.log`
- RED boundary assertion: `.openarms/logs/related-63512111b2672f0378fc92ef-d9e79763-b604-4225-b927-5f71d581cbf2.log`
- Initial GREEN: `.openarms/logs/related-63512111b2672f0378fc92ef-77647e63-80f1-4828-b516-10ae45e6d6cd.log`
- Updated isolated GREEN: `.openarms/logs/related-63512111b2672f0378fc92ef-d805de96-b096-4eb4-877d-702c618bd956.log`
- Initial syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-a7a6c1d2-c8c6-43d4-abd3-cf97a25afceb.log`
- Updated syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-49c39c9e-d672-43e0-a699-159f57992f74.log`
- Initial full mapping failure: `.openarms/logs/full-63512111b2672f0378fc92ef-e118f977-ea7f-4aca-b5a8-7e9737799cce.log`
- Static pass: `.openarms/logs/smoke-static-63512111b2672f0378fc92ef-163404bb-395b-472a-9585-9ef9f13e1f5e.log`
- Initial build: `.openarms/logs/build-63512111b2672f0378fc92ef-01ca20cf-0e5a-4755-911d-8279bf47b52e.log`
- Runtime pass: `.openarms/logs/smoke-runtime-63512111b2672f0378fc92ef-49406131-8574-4b11-868b-5b19fae975c7.log`
- Initial PTY failure: `.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-18cb901e-479c-4f0a-996c-6dfe834f6768.log`
- Updated build: `.openarms/logs/build-63512111b2672f0378fc92ef-c486b0c9-7885-40c9-97fe-9aa961f2ae46.log`
- Final syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-910ab3bb-7d44-4432-bcdc-1304ba179ab3.log`
- Final full: `.openarms/logs/full-63512111b2672f0378fc92ef-612b542c-5bfa-42bd-a624-1c4c266aa20f.log`
- Final build: `.openarms/logs/build-63512111b2672f0378fc92ef-66bc4f8c-6d20-4fdc-b619-fc388851671c.log`
- Final PTY: `.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-39439e38-f0a8-496f-9f3e-3180140cb9c5.log`

Diagnostic-only Docker invocation used the fingerprinted image with
`opencode debug config --print-logs`; it confirmed the server config without
reading skill content. An initial invocation using a shortened image tag failed
because Docker requires the full tag, not the displayed fingerprint prefix.
No permission errors or missing Docker/Python/PTY blockers occurred.

### Remaining acceptance and retest

Live `/exit`/resume/`/new` root creation and restore No/Yes were **not** exercised
in the PTY; their state/adapter behavior is covered by isolated and full tests.
No model/provider, live grant/load success, long-output or child-provider test
is claimed. The live library remains Unverified, so successful skill loading
requires separately authorized operator source approval; a UI grant cannot
substitute for that. The screenshot's exact original invalid-context field is
not established by this evidence. No human manual-test completion is claimed.

To rebuild the interactive sandbox, exit it and run `npm run sandbox -- build`,
then `npm run sandbox -- start`. Do not reset volumes. Use the Vietnamese manual
for resume versus genuinely new-session and explicit consent checks. To force a
fresh automated rebuild/retest, use the exact scoped completion command above
with `--rebuild` (intentional cache bypass). Final evidence-only report edits did
not change production/test inputs, so passing checks were not rerun.

No live long-output or child-provider acceptance is claimed. Model/provider
acceptance and the screenshot's original exact identity failure remain distinct
from fixture evidence.
