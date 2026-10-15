# Single local library: current user contract

Each canonical project has exactly **one** library root. It starts **Not
configured**; bundled files, installed mounts and environment variables do not
automatically choose it. Libraries are not merged.

## Choose a library

1. Open `/skills` → **Status**. The library path editor is at the **top** when
   selection is empty, and at the **bottom** when selection is populated.
2. Enter an absolute folder path containing both `registry.json` and `skills/`.
   Registry entries identify content such as `skills/<id>/SKILL.md`; do not read
   those files directly to discover or load skills.
3. Review the change confirmation. **Cancel is the default** and preserves the
   existing root and state. Confirm only when you intend to replace the project
   source: prior selection, load markers and other prior source state are cleared
   throughout that project.
4. Start `/new` after a confirmed change. Clearing router state cannot retract
   instructions already present in an old model conversation.

Local v1/v2 metadata is supported. Migration, approved registry hashes and
Grant/Revoke are not prerequisites or actions in the current user flow.

| Source | Root to choose in sandbox | Notes |
|---|---|---|
| Repository bundle | `/opt/openarms` | Snapshot in the repository sandbox image |
| External installed library | `/opt/installed-router` | Requires `--installed`; read-only host mount |
| Project library | Absolute project folder containing both required entries | Must be accessible to the running process |

Outside Docker, choose the actual accessible absolute folder. A host path is not
accessible inside Docker unless mounted; exposing a mount does not select it.
Do not substitute or merge another source when the chosen folder fails.

## Use, Ask, and status

- **Use** selects a package's core IDs and chosen optional IDs from this library.
  `/skills packages` and `/skills list <package>` show its metadata, not a second
  source or permission grant.
- **Ask** for an exact selected skill ID when a task needs its content. The sole
  server content tool is `load_skill({skill: "<selected-id>"})`; it accepts no
  workflow/reference selector, arbitrary path or package-wide load.
- **Selected** means selected but not loaded. **Loaded** records a successful
  router load, not proof the model followed the instructions. **Missing** means
  the ID is unavailable/unselected or a library error prevents status; consult
  the accompanying error and do not treat it as a successful load.
- Selection and loading do not grant host shell, read or external-directory
  rights. OpenCode/OS permissions remain independent.

New real root sessions automatically inherit the latest selection in the same
canonical project and library identity/revision, as **Selected** only. No Restore
dialog exists. Load history, grants, task locks and used markers never transfer.
Immediately after `/new`, Home shows the latest same-project/library selection
as **Selected**, before an ordinary prompt creates a real session; never as Loaded.
Reading this preview creates neither an explicit Home draft nor a provider request.
An explicit Home draft (including clear) takes precedence exactly once; reopening
an existing real session preserves its independent choices. Children start empty.
Source changes invalidate prior-source state; projects/sources never share it.

## Failure and recovery

- **Not configured:** choose a root in Status; no automatic environment fallback.
- **Invalid/unavailable folder:** check the absolute path, `registry.json`,
  `skills/`, mount and process permissions; edit the path in Status. Cancelling
  an edit leaves the previous configuration unchanged.
- **Unknown/not selected ID:** use metadata from the chosen library, select the
  exact ID, then ask again. Do not search the filesystem/web for a replacement.
- **Missing/read/encoding/output errors:** repair the chosen library with its
  owner's authority. Do not hand-edit state to pretend a load succeeded.
- **Unsafe path or concurrent change:** content must remain inside the chosen
  `skills/` tree, including resolved symlinks. Stabilize the library and refresh
  selection; do not bypass containment or retry an old confirmation blindly.

## Validation and evidence

Happy path: configure a synthetic library, select an exact ID, load through the
registered tool, then observe Loaded. Critical edge: cancel a source change and
verify the prior root/selection are unchanged; confirm a change separately and
verify old-source state is cleared. Also check unavailable folders and containment.
Tests must generate synthetic content under session authority, not inspect real
skill files. A tool-ID endpoint or picker screenshot does not prove a model load.

For current dialog geometry, safe confirmation, Home preview, usage and budget
checks, see [New features — separate manual checklist](../manual-testing.md#các-tính-năng-mới--kiểm-thử-riêng).
Record commands, results, durations and blockers for the scope actually tested;
this guide records the contract, not completed execution evidence.
