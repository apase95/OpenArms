# Sprint 5.3 — reviewed operational handoff

## Skill-toggle migration amendment

The current handoff snapshots project enabled IDs (`package/skill`), not a
session-local core/optional selection. Instructions arrive through automatic
system injection; startup prompts no longer request `load_skill`. Safe successful
target injection bound to handoff/hash/revision can acknowledge; failed or wrong-
target injection cannot. No enabled IDs means no activation acknowledgement.
Exclusive-controller ownership, cancellation, durable intent, exactly-once
submission and no threshold-triggered rotation remain unchanged. References to
Selected/core/load tools in the dated baseline below are historical. See
[current skill contract](../../guides/skill-management.md).

## Scope and operator flow

This is an explicit user operation, not automatic threshold rotation or proof of
task completion. Fresh conversation means no copied messages, skill content,
grants or task locks; normal host project/plugin context still applies. No model
or provider is selected or changed by this feature. Source sessions are retained.

1. Have the task owner prepare a short sourced status JSON (never raw conversation,
   logs, credentials or tool output). Use the exact source session ID from OpenCode.
   Example input (replace identity/time and facts before running):

   ```json
   {"id":"handoff-53","sourceSession":"SOURCE_ID","createdAt":"2026-10-16T00:00:00.000Z","fields":{"Objective":[{"text":"Finish reviewed task","source":"owner"}],"Completed":[{"text":"Implementation reviewed","source":"owner"}],"Active":[{"text":"Focused verification pending","source":"owner"}],"Decisions":[{"text":"Keep existing permissions","source":"owner"}],"Verification":[{"text":"No host acceptance yet","source":"owner"}],"Relevant Files":[{"text":"src/example.ts","source":"owner"}],"Next Step":[{"text":"Run focused verification","source":"owner"}]}}
   ```

2. Publish using the existing operator command, from repository root:

   ```sh
   node --experimental-strip-types scripts/session-lifecycle.mjs prepare /absolute/project /trusted/input.json none
   ```

   `none` applies only to the first publication. A replacement requires an archived
   predecessor, its exact hash, a distinct ID and later canonical ISO time. Missing
   sections become placeholders. Seven headings and at most 30 lines are guaranteed;
   sanitizer patterns are conservative, **not universal secret or injection detection**.
   Do not label untrusted model/history/tool content as owner-sourced facts.

3. On that source session wait until idle, finish/cancel all tools, permissions and
   questions, and leave an empty focused non-shell prompt. Open Context meter
   (`Ctrl+Space`), then **Handoff (h)**. Read all seven sections and Selected IDs.
   Explicitly confirm **I own exclusively: create and send once** only when no
   other client, agent or automation can use either session until submission ends.
   Multi-client concurrent usage is unsupported; history/status rechecks are not
   an atomic host reservation. Cancel/Escape causes no SDK effect.
   Do not type or change focus/session while the confirmed transfer is in progress.
4. Expect a new session, exact source Selected state (not another session's defaults),
   and one startup prompt including reviewed progress and Next Step. No input is
   reset/overwritten. Submission toast is **not** activation acknowledgement.
5. Inspect `.openarms/handoff.json`: target/source linkage, lifecycle and attempt
   phase are audit identifiers/status. `acknowledged` requires a real successful
   selected core `load_skill` execution in the matching target and library revision.
   Failed calls, model text, wrong target, unselected skills and topic-only calls
   do not count. With no Selected skills, submission remains `claimed` explicitly.

## Isolated development evidence

```sh
node scripts/arms-test.mjs related --task sprint-5.3 --file tests/auto-session-rotator.test.ts
```

`arms-test.commandFor('related')` passes exact filenames to Node, not a suite glob.
This file uses fake external SDK ports, real atomic publisher and real selection
transactions. Its generated synthetic library is ordinary disposable fixture data;
no installed skill content is read. Cases cover happy transfer, concurrent claims,
reentrancy/restart, all SDK/restore failures, cancellation/source-state/selection
changes, publish failure, file modes, compaction, malicious facts, no-selection
behavior, invalid activation evidence and real server load-result acknowledgement.
The RED run failed before the module existed; the first executable run also exposed
an unsupported TypeScript parameter property, removed for strip-types compatibility.
Another test exposed that inspecting a deliberately nonregular projection correctly
fails closed; the test now removes the injected obstruction before inspecting.
GREEN: 8/8 in 439ms through the runner (before subsequent host-safety refinements).

### Completion verification — 16 October 2026

Implementer: `general`, provider/model `openai/gpt-6.1-sol` (implementer session ID
not exposed in the injected context; no fabricated ID). Inherited scout IDs and
task lock remain as recorded in the controller handoff. No task spawned, skill
package loaded, commit or push performed.

The one reviewed plan used this complete 17-path scope (including inherited work):

```sh
scope=(
  src/auto-session-rotator.ts src/session-handoff.ts src/local-library.ts
  src/progressive-rotation.ts src/usage-runtime.ts
  plugins/skill-router-server.ts plugins/skill-router-tui.tsx plugins/tui-core.ts
  tests/auto-session-rotator.test.ts tests/context-meter.test.ts tests/progressive-rotation.test.ts
  scripts/test-map.json scripts/test-policy.json
  docs/architecture/Architecture.md docs/roadmap/Tasklist_Phase_5.md
  docs/testing/testing.md docs/testing/how_to_test/Sprint_53.md
)
files=(); for file in "${scope[@]}"; do files+=(--file "$file"); done
node scripts/arms-test.mjs verify --plan --task sprint-5.3 --synthetic "${files[@]}"
node scripts/arms-test.mjs syntax --task sprint-5.3 "${files[@]}"
node scripts/arms-test.mjs full --task sprint-5.3 "${files[@]}"
node scripts/arms-test.mjs smoke-runtime --task sprint-5.3 --synthetic "${files[@]}"
node scripts/arms-test.mjs tui-smoke --task sprint-5.3 --synthetic "${files[@]}"
npm run test:policy
git diff --check
```

These spell the executed commands with a reusable scope array; the actual calls
used repeated `--file` arguments. Remaining plan modes were explicit after passing
unchanged syntax; a redundant completion `verify`/T0/T1 was not run.

| Check | Result | Duration |
|---|---|---|
| Plan | Full + static/runtime/TUI required, no needs-review | — |
| Syntax | 13/13 | 445 ms |
| Full (includes the final 10-case isolated file) | 321/321 | 15,314 ms |
| Synthetic static | 8/8 | 406 ms |
| Synthetic build | 1/1 | 12,834 ms |
| Synthetic runtime | 5/5 | 32,031 ms |
| Synthetic TUI | **Failed**, `tui-interaction:open`, 30-second interaction timeout | 62,604 ms |
| Automation policy | 0 bypass findings | runner does not report duration |

The TUI run reused unchanged static/build results. Its visible output showed the
host Skills search dialog instead of the expected OpenArms picker; this is an
observation, not a confirmed root cause. Failure happened before testing the new
handoff action. Full log for **controller-dispatched bounded scout diagnosis**:
`.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-d6532de2-3bad-481f-93ca-5fb168c35d3c.log`.
No raw-log inspection or unchanged retry was performed by this implementer.
Question for the controller: why did the synthetic TUI open the host Skills picker
instead of the plugin picker, and what exact host/fixture change is required?

`git diff --check` initially found a trailing-space markdown line in the updated
roadmap; that line was corrected. Subsequent changes after full/smoke were docs-only.

At completion review one plan with the complete inherited 5.1/5.2 overlapping scope,
new files, docs and both mapping files. Shared publisher/runtime and mapping changes
mandate full; server and TUI seams mandate static/runtime/TUI smoke. Use synthetic
smoke, not real library mode. Syntax after significant edits; if unchanged syntax
passed, run remaining plan modes explicitly rather than duplicating T0. Run
`npm run test:policy` and `git diff --check`. Missing Docker/Python/PTY blocks smoke.

## Recovery and acceptance limits

### Diagnosed fixture deadline / final verification — 16 October 2026

Fresh `general`, `openai/gpt-6.1-sol`; session ID is not exposed. No tasks,
skills, commits or pushes. All inherited 5.1–5.3 work is preserved.
Controller-supplied diagnosis of the preceding RED (321/322, 16,803ms): the
registry fixture's outer 1500ms deadline expired (1521.756ms, null status),
despite four sequential children each allowing 2000ms. The minimal fix allows
12000ms outside, preserves every child guard and reports error/stack, signal and
stderr on failure. No registry production behavior changed.

The final scope is the 19 paths below plus `tests/registry-v2.test.mjs` (20 total).
Exact reproducible commands (the plan used the equivalent scope array above,
extended with `src/types.ts`, `src/state-schema.ts`, `tests/registry-v2.test.mjs`):

```sh
scope=(src/auto-session-rotator.ts src/session-handoff.ts src/local-library.ts src/progressive-rotation.ts src/usage-runtime.ts src/types.ts src/state-schema.ts plugins/skill-router-server.ts plugins/skill-router-tui.tsx plugins/tui-core.ts tests/auto-session-rotator.test.ts tests/context-meter.test.ts tests/progressive-rotation.test.ts tests/registry-v2.test.mjs scripts/test-map.json scripts/test-policy.json docs/architecture/Architecture.md docs/roadmap/Tasklist_Phase_5.md docs/testing/testing.md docs/testing/how_to_test/Sprint_53.md)
files=(); for file in "${scope[@]}"; do files+=(--file "$file"); done
node scripts/arms-test.mjs verify --plan --task sprint-5.3 --synthetic "${files[@]}"
node scripts/arms-test.mjs verify --task sprint-5.3 --synthetic "${files[@]}"
npm run test:policy
git diff --check
```

Run the array setup and command in the same shell invocation: an attempted
standalone `node scripts/arms-test.mjs syntax --task sprint-5.3 "${files[@]}"`
lost the shell-local array and returned `CONFIG_ERROR: Unknown argument:` before
any checks. The final verify used explicit repeated `--file` arguments instead.
Plan had no needs-review; shared/core/test infrastructure requires full, and
integration policy requires static/runtime/TUI. One final verify executed:

| Check | Result | Duration |
|---|---|---|
| Syntax | 16/16 | 511ms |
| Full, including review regressions and registry fixture | **322/322** | 16,599ms |
| Synthetic static | cached previous pass `d5f84ba02fca` | not rerun |
| Synthetic runtime | 5/5 PASS | 61,624ms |
| Synthetic build | 1/1 PASS | 48,489ms |
| Synthetic TUI | **PASS** 1/1 | 188,789ms |
| Automation policy | 0 findings | not reported |
| Diff whitespace | pass | not reported |

### Diagnosed root cause & resolution: host picker conflict (19 October 2026)
- **Root cause:** `scripts/synthetic-context.mjs` was missing `src/auto-session-rotator.ts` and `src/progressive-rotation.ts` in its `contextInputs` manifest. During synthetic container build, these modules were omitted, causing `plugins/skill-router-tui.tsx` to fail module resolution on startup. Consequently, the plugin crashed during TUI initialization and OpenCode fell back to the host's native `/skills` command ("Search skills..."), causing the timeout on expected `Select Action` picker.
- **Resolution:** Added `auto-session-rotator.ts`, `progressive-rotation.ts`, and `sprint45.ts` to `contextInputs` in `scripts/synthetic-context.mjs`. Added regression assertions in `tests/synthetic-context.test.mjs`.
- **Verification:** Rebuilt synthetic Docker image (`4e5fab92beb9`); verified `smoke-runtime` 5/5 PASS, and `tui-smoke` 1/1 PASS (188,789ms, log `.openarms/logs/tui-smoke-63512111b2672f0378fc92ef-96509eb4-a78a-4833-be36-7884a35b09eb.log`). The OpenArms picker opened cleanly and all keyboard interactions passed.

### Review-fix revision — 16 October 2026

Fresh general implementer, `openai/gpt-6.1-sol`; current session ID is not exposed.
No tasks or skills used. Inherited work preserved. The reviewed scope above adds
`src/types.ts` and `src/state-schema.ts` (19 paths total).

Regression RED: exact-file `related --task sprint-5.3 --file
tests/auto-session-rotator.test.ts` failed 2/11 (444ms), demonstrating legacy
acknowledgement bypass and missing post-navigation gate. These assertions now
pass in the full run, along with real state-store explicit-target selection,
approval preservation, known auto-init restore and post-restore mutation cases.
The isolated file uses fake external SDK ports, not mocked production behavior.

Commands after the one 19-path `verify --plan --synthetic`:

| Command (all through `node scripts/arms-test.mjs`, task `sprint-5.3`) | Result | Duration |
|---|---|---|
| `syntax` with complete 19-path scope | 15/15 | 495ms |
| `full` with complete 19-path scope | **321/322**, one registry CLI fixture failure | 16,803ms |
| `smoke-runtime --synthetic --file src/local-library.ts --file src/session-handoff.ts --file src/auto-session-rotator.ts --file src/types.ts --file src/state-schema.ts --file plugins/skill-router-tui.tsx` | 5/5; unchanged static pass reused | 29,548ms |
| prerequisite synthetic build | 1/1 | 12,727ms |
| `npm run test:policy` | 0 findings | duration not reported |
| `git diff --check` | pass | duration not reported |

Full is mandatory for the shared/core/schema scope; full covers related, so no
redundant GREEN isolated rerun. The only failing full case is `CI gate executes
production CLI for valid, byte-drift, symlink and duplicate fixtures`, reporting
`null !== 0`. This is not diagnosed or classified as unrelated/flaky. Controller
must dispatch bounded diagnosis of
`.openarms/logs/full-63512111b2672f0378fc92ef-7f083cda-a873-4cad-abd6-80b31060a1db.log`
and provide the exact cause before an unchanged retry. No raw log inspection here.

Required TUI acceptance remains **blocked**, not passed: the inherited Skills-picker
failure is undiagnosed and no fixture fix was supplied. No blind TUI retry or
redundant completion verify was run. New SDK history/status checks and ownership
wording still need actual host interaction proof. The remaining modes were run
explicitly after syntax; full and terminal acceptance are not green.

`rotation.phase` is durable before irreversible external effects. A `creating`
attempt might have created an unrecorded orphan; a `submitting` attempt might have
delivered its prompt. **Never retry/reset these phases blindly.** Inspect host
session list/history and journal with the owner. No automatic delete, resubmit,
claim reassignment or restart resume exists. `created/restored/navigated` likewise
remain stopped after errors; recovery is deliberate, not an inferred safe retry.

```sh
node --experimental-strip-types scripts/session-lifecycle.mjs inspect /absolute/project
node --experimental-strip-types scripts/session-lifecycle.mjs recover /absolute/project
```

`recover` only republishes the authoritative journal body. Stop all project writers
and back up `.openarms` before owner-reviewed abandoned-lock/corruption repair.
Legacy acknowledge/claim cannot advance rotation records. Rotation archive requires
real bound activation acknowledgement; legacy nonrotation records keep their old flow. The
journal retains the private reviewed body. Audit stages do not retain prompt text
or external exceptions. Trusted cooperating local writers only; no hostile
directory-swap or distributed-filesystem guarantee.

TSK-512 is partial until an actual first target turn reads progress/Next Step,
independently invokes the necessary Selected `load_skill`, receives success and
produces bound acknowledgement. Fake SDK ports and server synthetic integration
do not prove that model behavior. TUI smoke must also exercise the new action;
passing older meter/restore scenarios alone is insufficient. No whole-sprint or
live-provider acceptance claim is made.
