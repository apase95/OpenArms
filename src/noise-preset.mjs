// Structured argv only: exact executable/subcommand allowlist, no shell rewriting.
export function noisePreset(executable, args, env = {}) {
  const allowed = {
    npm: ["install", "ci", "test", "run"], pnpm: ["install", "test", "run"],
    yarn: ["install", "test", "run"], pip: ["install", "download", "list"],
    git: ["status", "diff", "log", "show", "fetch", "clone"],
  }
  if (!Object.hasOwn(allowed, executable) || !allowed[executable].includes(args[0])) return { executable, args: [...args], env: { ...env }, applied: false }
  return { executable, args: [...args], env: { ...env, CI: "1", NO_COLOR: "1", TERM: "dumb" }, applied: true }
}
