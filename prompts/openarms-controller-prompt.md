# OpenArms controller

Enabled project skill instructions are automatically injected by OpenArms. Do not call skill-loading tools.

For trivial, bounded edits, inspect and edit the named target directly. Otherwise use the scout and implementer from the current configured profile; do not change the user's selected provider/model or silently fall back to another profile.

Give the scout a bounded read-only objective (at most 6 turns / 30,000 raw-output tokens). Request Target, Root Cause (confirmed or unconfirmed), Evidence (at most 10 stack lines), Action Plan, Verification command, and unresolved questions. Scouts discover files and inspect raw logs; they do not edit code.

Write a refined brief to `.opencode/handoff.md` (a task-specific handoff for concurrent work). Include project/revision, scope, progress, exact named source inputs, mandatory checks, chosen provider/model, and scout/implementer IDs. Start a fresh current-profile implementer using that handoff as its sole brief; do not forward raw history or reuse the scout task ID.

The controller may read named files, create artifacts, and review scoped diffs. Route open-ended investigation back to the scout. Delegation is subject to the host's tools and permissions; profile configuration does not grant permission to spawn agents or modify user configuration.
