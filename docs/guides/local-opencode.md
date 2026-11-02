# Optional local OpenCode profile

OpenArms is a local plugin/customization layer, not a vendored OpenCode distribution.
Upstream OpenCode owns the CLI, provider transport and agent execution. OpenArms
owns `src/`, its server/TUI adapters and the portable prompts in `prompts/`.
Notifier, Herdr and Kaggle integrations are optional third-party tools, not
OpenArms dependencies. No third-party plugin code is copied here.

The minimal server and separate TUI registration in the root README is sufficient
for skill toggles. The optional `examples/local-opencode/opencode.json` additionally
shows a controller (`build`), read-only scout (`explore`) and scoped implementer
(`general`). The controller prompt describes the handoff workflow; the implementer
prompt bounds implementation/review and verification. Enabled skills arrive through
automatic system injection, not a skill-loading tool.

## Manual setup only

1. Install this repository's dependencies. Keep the checkout in a stable location.
2. Review the example files; manually merge only wanted fields into your OpenCode
   configuration. Nothing in this repository overwrites `~/.config/opencode`.
3. Replace the plugin URI placeholders with absolute file URIs to your checkout.
   Keep the TUI plugin in `tui.json`, separately from the server plugin.
4. Replace `YOUR_PROVIDER/...` with models available in your own provider config.
   The observed local profile used `openai/gpt-6.1-sol` for build/general and
   `openai/gpt-6-luna-fast` for explore; these are examples, not requirements.
   An alternative profile can pair `explore-claude` / `general-claude` with your
   chosen provider/models. Configure that pair explicitly in the controller's
   profile instructions; never silently switch a selected root model.
5. Rewrite `{file:...}` paths relative to the destination config file (or use
   absolute prompt paths). The checked-in relative paths resolve only from the
   example's location. Select the scout/implementer pair in your controller profile.
6. Keep credentials and private endpoints in your own provider setup. A custom
   Anthropic-compatible provider may use `@ai-sdk/anthropic` and an environment
   key such as `MWAPI_API_KEY`; neither its private endpoint nor personal permissions
   belong in this example. Review permissions yourself; prompts are not OS grants.

No credentials, host database/state, private endpoints, personal math/skill rules
or machine-specific config are imported. Only portable workflow instructions and
configuration structure were reconciled from local additions.

## Provenance and limits

The handoff records installed OpenCode `1.19.3` and byte-identical local runtime
`src/` and `plugins/` at reconciliation start (HEAD `2b85743`). This is provenance,
not a live compatibility certification. The dependency lock remains authoritative
for this checkout. Host Node checks validate source/config contracts; no installed
OpenCode session or provider call is exercised by those checks.

Normal `verify` and pre-push are host-only. Sandbox files remain historical/reference
fixtures; explicit smoke commands are opt-in and their absence is not a smoke pass.
Session creation refreshes the library and initializes local session state; it does
not prune the OpenCode database or delete other sessions' state/usage files.
