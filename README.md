# OpenArms

OpenArms is a local verified-skill router and runtime-governance layer for
[OpenCode](https://github.com/anomalyco/opencode). It keeps skill content out of
the model context until a task needs it, stores selection per project/session,
and prevents unregistered skill files from bypassing the registry.

## Current Scope

- Intercepts `/skills` in the OpenCode TUI.
- Detects relevant packages from project files and dependencies.
- Loads only enabled packages through `load_skill_package`.
- Restricts skill paths to a registry-controlled local library.
- Uses atomic state updates and a per-task package lock.
- Bundles only skills with an explicit license. Each bundled skill retains its
  own license file.

OpenArms v2 will expand this foundation with usage telemetry, compact test
output, per-skill verified loading, budget warnings, and session lifecycle
controls. Enforcement remains opt-in until telemetry is reliable.

## Development

Requirements: Node.js 22 or newer.

```bash
npm ci
npm test
```

Install the dependencies, then reference both plugin entry points from your
OpenCode configuration:

```json
{
  "plugin": [
    "file:///absolute/path/to/OpenArms/plugins/skill-router-server.ts",
    "file:///absolute/path/to/OpenArms/plugins/skill-router-tui.tsx"
  ]
}
```

OpenArms writes runtime state to `~/.local/state/openarms/state.json`. This file
is never part of the repository.

The source repository intentionally excludes OpenCode runtime data, auth files,
databases, logs, backups, local state, and skills without verified licensing.

## OpenCode Fork

Compatibility work is tracked separately in
[`apase95/opencode`](https://github.com/apase95/opencode), a fork of the MIT
licensed upstream project. Keeping the fork separate allows OpenArms to remain
a focused plugin rather than a full OpenCode distribution.

## License

OpenArms engine code is released under the MIT License. Bundled skills are
distributed under the license contained in each skill directory.
