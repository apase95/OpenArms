# Local usage and budget UX

All actions are **report-only / do not block requests**. There is no optimization
advice, ask/block enforcement or automatic model switch in this UI.

## Usage steps

Type `/usage ` (including trailing space) in the focused normal main prompt.
The supported public Prompt ref is sampled every 75ms while visible/enabled and
no dialog is open; the SDK has no change callback. The timer is unref'd and disposed
with the prompt/plugin. Escape leaves the typed command visible, does not submit,
and suppresses reopening until the text changes. Select today/session/project/model
by keyboard or mouse. Model opens a second picker of recorded model IDs for this
project only, with an honest empty-list message; no provider network enumeration.
Direct `/usage today|session [id]|project|model <id>` syntax remains available.
Both public ref submission and the public pre-key interceptor consume local commands.

## Dashboard and project editor

`/budget` shows project path/ID, policy, timezone, mode, today/project and active
session usage, relevant limits, remaining and percentage. Home has no active
session, but the day/project report still works. Context utilization is a fraction
in storage and a percentage in the UI; it is the maximum sample, never a sum.
No data is not zero. Partial/missing metrics never show an available balance or
progress; estimated complete metrics are explicitly approximate. Measured means
local recorded host usage, not independently reconciled provider billing. Legacy
`hard` flags are diagnostic only and never enforced.

Press **e** / click **Edit project budget** for the menu: day cost USD, session cost
USD (applies independently to every project session), warning percentages, or remove
either selected cost limit. Inputs must be finite positive USD ≤ 1,000,000;
percentages are sorted/unique, `0 < n ≤ 100`. Selecting warning percentages explicitly
sets `mode: warn`; default `observe` reports only. Save requires confirmation with
project path, default **Cancel**; Escape/Enter on Cancel makes no write.

Only `<project>/.openarms/budget-policy.json` is written, via a cooperative writer
lock, validated merge, exclusive temporary file, fsync and atomic rename. Global
policy is untouched. Confirmation fingerprints both global/project files and the
library revision; stale confirmations fail visibly. Malformed config/storage errors
do not silently fallback. Symlinked project policy folders/files are rejected for
editing. External editors should avoid concurrent writes: the fingerprint is
reread immediately before publication, but external processes do not share the lock.

Precedence remains defaults < global < project < session override. In override
metric maps, **null is a tombstone**: e.g. `scopes.day.costUSD: null` disables an
inherited global day cost limit. Complete effective policies never contain null.
Other metrics, scopes, timezone and unrelated policy settings are preserved.
Unsupported `ask`/`enforce` configuration is rejected, never written by this editor.

## Domain-aware compactor savings

`/usage session` and `/usage project` show **Compactor savings** for that scope;
project means all retained local records for this project, not all projects or a
provider account lifetime. `/budget` shows today, active session, and the retained
project lifetime savings. Home never substitutes the project total for a session.

This is an estimate of net avoided output tokens: `max(0, sum(rawBytes) -
sum(compactedBytes)) / 4`. Compacted bytes are final model-visible UTF-8 bytes,
including full-log references, omission markers and failure warnings. Expanding
outputs offset reductions before the nonnegative display clamp. The stored ratio
is `(rawBytes - compactedBytes) / rawBytes` (zero for zero raw bytes); negative
ratios are valid. These are not tokenizer counts, billed-token reductions, cache
replay savings or USD credits; existing host token/cost accounting is unchanged.

Only explicit validated domain measurements contribute. Older records still load
but display unknown savings, or mark the measured subtotal partial when mixed.
Overflowed totals show unknown rather than an imprecise savings claim. Telemetry
stores domain enum and numeric sizes/ratio, never command, raw text or log paths.

## Proactive warnings

A bounded 1-second local-store poll delivers warnings in `warn` mode only, with
cleanup/unref and no provider calls. Completed message events and existing tool
telemetry feed the store. Notifications distinguish cost/output/context and say
approximate when estimated and always say they do not block requests. Missing,
partial or in-progress message samples cannot produce confident threshold toasts.
Crossed thresholds in one update consolidate. Identity includes full policy
fingerprint, project, scope/ID, metric and threshold. A persisted atomic claim under
the usage writer lock prevents duplicate delivery across messages/TUI instances and
restarts. Claims are at-most-once: a crash after claim can lose a toast, but cannot
replay it; the local dashboard remains the durable view. Old-policy, wrong-project,
wrong-session and prior-day alerts are suppressed. Task thresholds remain audit
data, not unsolicited notifications because the active task has no verified UI ID.

Synthetic tests prove these local contracts, not live provider billing/accounting.
Rebuild runtime after source edits: `npm run sandbox -- build cli`, then start.
Installed counterpart: `npm run sandbox -- build --installed cli`. Do not reset
auth/config/state simply to test the new UI.
