# Single local library redesign — completion evidence

## Canonical root identity P1 follow-up (2026-10-12)

Task `skill-library-root-identity` compares both canonical root and registry hash
on refresh. Either change uses the existing revision-CAS configuration transaction
to retire selections, Home pending selection, loaded IDs/history and task state
across project sessions before using the new source. Initial symlink configuration
still persists the canonical target. An unchanged root/hash preserves the revision.
Loads revalidate both identities inside the locked transaction before reading and
before publishing; captured loads cannot publish through a root retarget. The
existing persisted revision guard also rejects concurrent explicit configuration.

Generated-only regression: A/B have byte-identical registries and different
synthetic content. Rename A, replace its old canonical path with a symlink to B,
then exercise a captured load, another runtime's refresh, cleared state, stale
revision rejection and explicit reselection/loading of B. A separate happy path
checks first-time alias configuration and unchanged refresh.

`node scripts/arms-test.mjs related --task skill-library-root-identity --file
tests/local-library.test.ts`: RED **6/7**, 292 ms (`UNSAFE_PATH` rather than
`LIBRARY_CHANGED` during the captured load); GREEN **7/7**, 293 ms. The complete
RED log was read before fixing the missing root identity checks. Logs relative to
`.openarms/logs/`:

- RED: `related-63512111b2672f0378fc92ef-81e56822-4073-49d6-b8e9-ab61eced6699.log`
- GREEN: `related-63512111b2672f0378fc92ef-f7783ab6-6a4c-4055-937e-b23a8e8f3ca6.log`

Follow-up scope: `src/local-library.ts`, `tests/local-library.test.ts`,
`scripts/test-policy.json`, this report, and the approved controller docs
`.opencode/handoff-library-review.md` / `.opencode/handoff-library-root-fix.md`.
The latter two get exact docs classifications, not a wildcard; their contents
are unchanged. Mandatory scoped verification results are recorded below.

One reviewed plan and one execution used these exact commands from the root:

```sh
node scripts/arms-test.mjs verify --plan --synthetic --task skill-library-root-identity --file src/local-library.ts --file tests/local-library.test.ts --file scripts/test-policy.json --file docs/reports/skill-library-redesign.md --file .opencode/handoff-library-review.md --file .opencode/handoff-library-root-fix.md
node scripts/arms-test.mjs verify --synthetic --task skill-library-root-identity --file src/local-library.ts --file tests/local-library.test.ts --file scripts/test-policy.json --file docs/reports/skill-library-redesign.md --file .opencode/handoff-library-review.md --file .opencode/handoff-library-root-fix.md
npm run test:policy
```

The plan had no unknown mappings: syntax recommended; full, static and runtime
required; related covered by full; PTY not affected. `verify` executed syntax
first, then the remaining required stages, avoiding a duplicate T0 invocation.

| Stage | Actual result | Duration | Log under `.openarms/logs/` |
| --- | --- | --- | --- |
| syntax | **3/3** | 543 ms | `syntax-63512111b2672f0378fc92ef-d54fb326-e928-4db7-8968-797cc9c2aff0.log` |
| full | **181/181** | 15824 ms | `full-63512111b2672f0378fc92ef-0df849f0-bd81-4aa8-835a-bfd6875c3f1e.log` |
| static | unchanged passing fingerprint `1d348857c21b` reused | no execution | inherited pass cache |
| generated build | **1/1** | 100666 ms | `build-63512111b2672f0378fc92ef-647e77af-15c9-49f3-a712-c1db384b637e.log` |
| synthetic runtime | **5/5** | 114505 ms | `smoke-runtime-63512111b2672f0378fc92ef-e426644b-9ca1-4bb0-9d91-0b81e0ab8263.log` |
| policy bypass report | **0 findings** | not emitted | stdout only |

No verification blocker or cleanup error was reported. No unchanged full rerun,
normal library fingerprint/build, PTY run, user sandbox write, commit or push.
Own changed files are the source, test, policy JSON and this report listed above;
controller handoff files and inherited dirty changes were preserved.

Limits: generated fixtures only, no real library/provider acceptance. Canonical
path plus registry bytes is source identity, not inode/content authentication or
an atomic filesystem snapshot against arbitrary concurrent external mutations.
Previously delivered model content cannot be withdrawn; `/new` remains advised.

## Contract

Each canonical project persists one explicit library record `{root, revision,
registryHash}` in the shared router state. Initially unset; no environment or
bundled fallback. The active adapter exposes only `load_skill({skill})` for
skill content, with selected-ID authorization and local v1/v2 metadata support.
Legacy verified APIs remain isolated compatibility interfaces.

Confirmation clears source-dependent state across project sessions; cancellation
preserves it. Restoring same-library selections defaults to No and does not
restore loaded history or task locks. Existing model content cannot be withdrawn:
the UI recommends `/new`. Other projects and usage/budget storage are separate.

## Scope and test method

Completion adds active adapter coverage, deterministic captured-revision
load/switch regression, and explicit invalid-context errors. PTY setup generates
two disposable libraries, configures one through the real Enter-based editor,
checks top/bottom status controls, selection and synthetic loading, same-source
restore, cancellation and confirmed source switching. No real skill content or
provider request is authorized or used by these checks.

Isolated RED: local-library test expected `INVALID_CONTEXT`, received
`READ_ERROR` (231 ms; 4 passed, 1 failed). Diagnosed from the complete runner log;
loader now validates the session context explicitly. GREEN: local-library and
server files, 8/8 passed in 335 ms. Logs:

- `.openarms/logs/related-63512111b2672f0378fc92ef-5a87bc34-3bfd-49f7-85a2-655088674ba7.log`
- `.openarms/logs/related-63512111b2672f0378fc92ef-f88b5ecc-0172-4d63-bba1-4e4656e099ac.log`

## Combined verification

One combined `verify --plan --task skill-library-redesign` reviewed 32 supplied
paths, with no `needs-review` entries. It required syntax, full, static, runtime,
and PTY smoke; related was covered by full. Three additional changed test paths
were added to subsequent commands after diagnosed failures (listed below).
Existing exact test-file classification covers them; no second plan was run.

| Command through root runner | Result | Duration |
| --- | --- | --- |
| `related --file tests/server.test.ts` | 2/2 legacy checks passed, before new adapter coverage | 211 ms |
| `related --file tests/local-library.test.ts` | RED: 4/5, invalid context misclassified | 231 ms |
| `related --file tests/local-library.test.ts --file tests/server.test.ts` | GREEN: 8/8 | 335 ms |
| `verify` with combined explicit scope | Syntax 16/16; full 170/175; stopped before integration | 2436 / 15729 ms |
| `syntax` with all 19 changed TS/TSX/MJS/JSON inputs | 19/19 | 508 ms |
| `full` with expanded combined scope | 174/175; synthetic v2 fixture used overlapping roots | 14904 ms |
| `syntax --file tests/sprint32.test.ts` after dedicated-root fixture repair | 1/1 | 437 ms |
| `full` with expanded combined scope, changed test revision | **175/175** | **16159 ms** |
| `smoke-static` with expanded combined scope | **8/8**, offline, cache miss | **438 ms** |
| `npm run test:policy` | 0 bypass findings | duration not emitted |

All runner commands above use `node scripts/arms-test.mjs` and
`--task skill-library-redesign`. No unchanged failing command was retried.
Legacy hash, once-grant, registry-change, unsafe-reference and strict-request
assertions remain exercised through explicit legacy APIs. Active adapter tests
use `load_skill`, explicit local configuration and independent child selections.
The initial five stale failures and the subsequent invalid synthetic v2 fixture
were diagnosed from complete logs before editing.

### Full logs (relative to repository root)

- Initial syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-7ed35e4e-bd42-44dd-9e00-2d30567bebac.log`
- First full failure: `.openarms/logs/full-63512111b2672f0378fc92ef-99737ad7-6e21-4e03-9bb3-2a18672602c7.log`
- Expanded syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-37ee7524-6feb-49e4-b4d5-5f7868ee4432.log`
- Second full failure: `.openarms/logs/full-63512111b2672f0378fc92ef-86e690bc-2157-4d59-93a5-08898a03e1a2.log`
- Final changed-test syntax: `.openarms/logs/syntax-63512111b2672f0378fc92ef-1d9b7c52-faf3-4cee-8fb7-200bf006616a.log`
- Final full pass: `.openarms/logs/full-63512111b2672f0378fc92ef-d9ee8536-427a-464a-9fc6-6d0a0bdd6863.log`
- Static smoke pass: `.openarms/logs/smoke-static-63512111b2672f0378fc92ef-787b6bd6-a50f-4817-bced-3fb3fe0c7b73.log`

## Synthetic infrastructure follow-up — acceptance completed

### Synthetic infrastructure follow-up

Implemented explicit root-runner `--synthetic` for verify/runtime/PTY. Exact
controller inventory supplies ordinary context files; real registry/skills are
never inputs. Generated registry/content replace them. Synthetic fingerprints
include fixture output, generator and host runner dependencies, configuration,
and build definitions, with separate image labels/cache/build-lock identity.
Installed combinations and non-smoke modes reject the flag. Build context is
temporary; runtime/PTY use inspected isolated images with `--pull never`, no
`--build` flag, and a removed context so an implicit rebuild fails closed.

Isolated RED: 0/2 (unknown synthetic flag), 110 ms; GREEN: 3/3, 513 ms.
Sentinel coverage forbids registry/skills access and enumeration, checks source,
fixture/config invalidation, mode separation and symlink rejection. Full/runtime/
PTY acceptance for this follow-up is recorded below.

Historical blocker: before synthetic mode, runtime/PTY were not executed because
normal fingerprints/builds include real library bytes. `ROUTER_LIBRARY` alone
does not make repository/installed builds safe. That restriction remains for
normal modes; the generated-only mode resolves this task's integration blocker.

### Resumed final checks (2026-10-12)

Reviewed one complete follow-up `verify --plan --synthetic --task
skill-library-redesign-synthetic` with 43 explicit paths: the combined scope
below plus `scripts/synthetic-context.mjs`, `tests/synthetic-context.test.mjs`,
`scripts/arms-test.mjs`, `scripts/smoke-inputs.mjs`, `scripts/test-policy.mjs`,
`sandbox/manage.mjs`, `sandbox/compose.yaml`, and
`.opencode/handoff-synthetic-acceptance.md`. No unknown mappings. Ran the same
scope with `verify --synthetic` (without `--plan`). Full was mandatory because
this is test infrastructure; Docker/PTY were mandatory by classifier and user.

| Root runner command (all use the follow-up task ID) | Actual result | Duration |
| --- | --- | --- |
| `verify --synthetic` with the complete repeated `--file` scope | syntax **25/25**, full **178/178**, static reused **8/8**, generated build passed, runtime **5/5**; stopped at PTY assertion | 600 / 15894 / 0 / 51432 / 62791 ms |
| `related --file tests/sprint31-tui-smoke.test.mjs` after first harness repair | **2/2** | 100 ms |
| `syntax --file tests/sprint31-tui-smoke.test.mjs` after regression addition | **1/1** | 463 ms |
| `related --file tests/sprint31-tui-smoke.test.mjs` with wrapped-copy regression | **3/3**, includes Python compile of harness | 122 ms |
| `related --file tests/sprint31-tui-smoke.test.mjs` after final footer/empty-status repairs | **3/3**, final Python harness compiles | 138 ms |
| `tui-smoke --synthetic --file sandbox/tui-smoke.py --file tests/sprint31-tui-smoke.test.mjs` final revision | **1/1 live PTY**, all 14 local command cases plus lifecycle/path checks | **187703 ms** (build 87948 ms separately) |
| `smoke-runtime --synthetic --file sandbox/tui-smoke.py --file tests/sprint31-tui-smoke.test.mjs` final context fingerprint | **5/5**, inspected synthetic image reused | **8614 ms** |
| `npm run test:policy` | **0 bypass findings** | duration not emitted |

Four PTY RED runs were diagnosed from their full logs, not blindly retried:
wrapped `Default: Cancel` (42300 ms), background chrome between wrapped lines
(132977 ms), empty-selection status incorrectly subjected to bottom-control
assertion (145133 ms), and differential skill rows arriving before footer
(178111 ms). Fixes only change the harness: project the fixed-width dialog text,
check top placement for empty selection, and wait for footer before checking
bottom placement. A 122 ms isolated regression exercises unwrapped/wrapped
Cancel and rejects Confirm default even when background says Cancel. No product
source changes were needed. Earlier synthetic infrastructure RED/GREEN is
inherited evidence, not re-executed here.

The final live PTY log verifies picker and typed local commands, initially unset
root, Enter-based configuration, Cancel default, Selected/Loaded status, top and
bottom editor placement, generated local loading, Home adoption, same-library
restore Yes without loaded history, restore Esc with Yes highlighted, path-change
Cancel retaining the old root, Confirm clearing selection, and `/new` advice.
No provider request or real library load was made. Runtime has a non-fatal host
background npm-install warning in the first log; plugin registration still passed.

Full was not repeated after PTY-only harness/test repairs: the affected isolated
test file and live PTY were checked instead, per the handoff. All product and
synthetic orchestration code remains at the passing 178-test revision; the added
PTY regression is separately green. Static reused its unchanged fingerprint.
Cleanup completed without reported errors; only disposable runner resources
were targeted. No active user sandbox mutation, commit, or push.

### Follow-up logs

All paths below are relative to `.openarms/logs/`:

- Syntax: `syntax-63512111b2672f0378fc92ef-3a50c227-fa2d-4405-887d-7af3300db4a2.log`
- Full: `full-63512111b2672f0378fc92ef-8e5f1b06-aedd-45a0-8359-80e205b02f57.log`
- Initial build: `build-63512111b2672f0378fc92ef-74a3f22c-4804-4ba4-9c59-8ae88d44690c.log`
- Initial runtime: `smoke-runtime-63512111b2672f0378fc92ef-89060609-1948-4cf3-abc0-b492aec9ac7e.log`
- PTY RED 1: `tui-smoke-63512111b2672f0378fc92ef-bec940ef-6b2a-4b2d-8912-873d717f9787.log`
- PTY RED 2: `tui-smoke-63512111b2672f0378fc92ef-6c57e63f-525a-45af-89e8-3c6c03ec8c41.log`
- PTY RED 3: `tui-smoke-63512111b2672f0378fc92ef-e580dac5-dcd6-43e2-a458-db4027a5288b.log`
- PTY RED 4: `tui-smoke-63512111b2672f0378fc92ef-95540f3a-1830-497d-b077-ad7716f22a9e.log`
- Regression syntax: `syntax-63512111b2672f0378fc92ef-b84fe5d4-dc9c-444f-8d37-0cc13caf7e57.log`
- Regression GREEN: `related-63512111b2672f0378fc92ef-9c08ff1f-deda-48ec-8cbf-e3c8cff77f1e.log`
- Final harness contract GREEN: `related-63512111b2672f0378fc92ef-7af10cd1-6b0e-4570-8632-8ea4ea66fe02.log`
- Final build: `build-63512111b2672f0378fc92ef-a1b4c6cc-f11c-48ff-9521-bfb6115a7096.log`
- Live PTY GREEN: `tui-smoke-63512111b2672f0378fc92ef-f54ef173-6ea8-466f-8776-089dbf8b22b6.log`
- Final runtime GREEN: `smoke-runtime-63512111b2672f0378fc92ef-8a4bb072-0b2d-4ec1-adc2-3eda205c03ab.log`

Remaining acceptance limits: generated data proves host API/UI/local loader
behavior, not actual library integrity, installed mounts, provider/model skill
use, or arbitrary terminal sizes. Outside this restricted session, a user may
run `npm run sandbox -- build` then `npm run sandbox -- start` (or their supported
installed mount), select the container-visible root explicitly in Status, and
repeat Cancel/Confirm/restore/load with authorized real content. Those normal
commands were deliberately not run here.

## Explicit combined scope

Each path below was supplied as its own repeated `--file` argument to final
`full` and `smoke-static` commands. The first plan/verify omitted only the three
test files added as diagnosed repairs: `tests/sprint23.test.ts`,
`tests/sprint32.test.ts`, and `tests/sprint31-tui-smoke.test.mjs`.

```text
src/local-library.ts
src/types.ts
src/state-store.ts
src/state-schema.ts
src/governance-hooks.ts
src/skills-service.ts
plugins/skill-router-server.ts
plugins/skill-router-tui.tsx
tests/local-library.test.ts
tests/server.test.ts
tests/sprint23.test.ts
tests/sprint32.test.ts
tests/sprint31-tui-smoke.test.mjs
scripts/test-map.json
scripts/test-policy.json
sandbox/smoke-static.mjs
sandbox/smoke-runtime.mjs
sandbox/tui-smoke.py
sandbox/tui-fixture.ts
sandbox/tui-fixture-launch.mjs
docs/testing/manual-testing.md
README.md
docs/README.md
docs/architecture/OpenArms Overview.md
docs/testing/testing.md
docs/testing/how_to_test/Sandbox.md
sandbox/README.md
docs/testing/how_to_test/Sprint_23.md
docs/testing/how_to_test/Sprint_24.md
docs/testing/how_to_test/Sprint_31.md
docs/testing/how_to_test/Sprint_32.md
docs/testing/how_to_test/Single_Library.md
docs/reports/skill-library-redesign.md
.opencode/handoff.md
.opencode/handoff-library-docs.md
```

Own completion edits: `src/local-library.ts`, the five tests in this scope,
`sandbox/tui-smoke.py`, `sandbox/tui-fixture.ts`,
`sandbox/tui-fixture-launch.mjs`, `scripts/test-policy.json` (exact docs handoff
mapping), and this report. Other listed changes were inherited and preserved.
No commit, push, reset, hook installation or global configuration change.

Own resumed continuation edits: `sandbox/tui-smoke.py`,
`tests/sprint31-tui-smoke.test.mjs`, `docs/testing/testing.md`, and this report.
The already-implemented synthetic mode and prior product changes were preserved,
not duplicated. `git diff --check` on these four paths passed; documentation
evidence was checked against the actual runner summaries and named full logs.
