# Project skill toggles

The active server injects enabled skill instructions on every
`experimental.chat.system.transform` turn. It does not expose `load_skill` or
`load_skill_package`. Enabling instructions is not a host/OS permission grant.

## Package format

Default root: `<canonical-project>/.openarms/packages`. Each package is a direct
child directory with a minimal `package.json`, for example:

```text
.openarms/packages/writing/package.json
.openarms/packages/writing/edit.md
.openarms/packages/writing/review.md
```

```json
{"skills":{"edit":"edit.md","review":"review.md"}}
```

The resulting IDs are `writing/edit` and `writing/review`. Package and skill
names use lowercase letters/digits separated by hyphens. Manifest paths are
relative to the package; traversal, absolute paths and symlinks are rejected.
No central registry and no core/optional distinction are required. A missing
default root means an empty catalog; invalid manifests appear as ERROR.

## Controls

- `/skills status`, `inspect`, and `list writing`: ON/OFF/ERROR per skill.
- `/skills use writing`: bulk ON for every skill in that package.
- `/skills add writing writing/edit`: turn one skill ON (also works when the
  package was completely OFF).
- `/skills remove writing writing/edit`: turn any skill OFF.
- `/skills disable writing`: bulk OFF; `/skills clear`: all project skills OFF.
- Status → edit directory: confirmed absolute external directory override.
  Cancel preserves the current configuration. A confirmed source switch resets
  all skills to OFF. No implicit environment/global fallback or source merging.

Enabled IDs are project-scoped, not independent per-session choices. New skills
are OFF. The existing private state store persists the canonical project root,
directory/revision and enabled IDs (`lastSelection`, grouped by package); session
selection fields are compatibility snapshots for the TUI and handoff flow.

OFF stops subsequent injection. It does **not** erase instructions already in
conversation history, and toggling does not require `/new`. ON means enabled and
currently readable, not proof the model followed the instructions. ERROR means
the enabled file or package could not be safely read; no fallback is injected.
Reads retain regular-file/no-follow, containment, identity/race, bounded UTF-8
and aggregate output-budget checks. Instructions remain trusted operator input;
this is not a sandbox or a cryptographic content-approval system.

## Migration

Back up the private `$XDG_STATE_HOME/openarms/state.json` (default
`~/.local/state/openarms/state.json`) before upgrading. Existing library roots
are retained as explicit overrides, but the first catalog-format refresh resets
old selection/load/grant/task metadata to OFF; old core IDs are not implicitly
enabled. Convert each old package into a directory and author its minimal
manifest, then explicitly enable wanted IDs. The central v1/v2 registry and
reference/topic layout remain legacy import/export formats, not active runtime
configuration. List any desired reference document as its own independently
toggleable manifest entry. Audited `/skills install` now writes a package manifest
in the same staged transaction as the installed bytes: `<id>/main` and one
`<id>/reference-<reference-id>` entry per reference. Local installs go to
`.openarms/packages`; global installs go to `$XDG_CONFIG_HOME/opencode/packages`
(fallback `~/.config/opencode/packages`). Global use requires an explicit external
root override; installation never silently switches roots or enables skills.
The writer retains a v2 registry beside the packages directory as a compatibility
export for audit tooling. Runtime discovery neither requires nor trusts it.
The low-level scope API retains its legacy layout unless `catalog: true` is set.

## Verification and limitations

`tests/skill-toggle.test.ts` is the isolated automatic-injection happy path and
symlink-escape edge. It uses authored temporary data, not installed skills.
Manual acceptance: enable one synthetic skill, send a turn, turn it OFF, and
send another turn in the same session. Verify no model-facing load tool exists,
and test another session/project, restart, malformed manifest, missing file,
invalid UTF-8 and output-budget errors. Do not infer context erasure from OFF.

The migrated local-runtime/adapter fixtures, audited install/export bridge and
rotation acknowledgement pass offline tests. Generated-data Docker runtime and
PTY checks also pass; these do not prove live-model instruction following or
comparative token savings. Existing historical sprint results are not evidence
of this new contract.
