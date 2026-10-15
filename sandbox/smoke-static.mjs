import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"
import { composeConfig, copySources, dockerIgnore, settings } from "../scripts/smoke-inputs.mjs"
import { root } from "../scripts/test-policy.mjs"

export function validateStatic(directory = root, environment = process.env) {
  const configuration = settings(directory, environment)
  const server = JSON.parse(readFileSync(path.join(directory, "sandbox/config/opencode.json"), "utf8"))
  const tui = JSON.parse(readFileSync(path.join(directory, "sandbox/config/tui.json"), "utf8"))
  for (const [config, file] of [[server, "plugins/skill-router-server.ts"], [tui, "plugins/skill-router-tui.tsx"]]) {
    assert.deepEqual(config.plugin, [`file:///opt/openarms/${file}`], "Unexpected sandbox plugin URL")
    assert.ok(existsSync(path.join(directory, file)), `Missing plugin target: ${file}`)
  }
  assert.equal(server.permission.skill["*"], "deny")
  assert.equal(server.permission.read["*SKILL.md"], "deny")
  const compose = composeConfig(directory)
  for (const service of ["cli", "smoke"]) {
    const entry = compose.services[service]
    assert.equal(entry.build.context, '${OPENARMS_BUILD_CONTEXT:-..}')
    assert.equal(entry.build.dockerfile, "sandbox/Dockerfile")
    assert.equal(entry.build.target, "runtime")
    for (const volume of ["config:/home/node/.config", "state:/home/node/.local/state", "data:/home/node/.local/share", "cache:/home/node/.cache", "project:/workspace/project"]) assert.ok(entry.volumes.includes(volume), `Missing isolated volume: ${volume}`)
  }
  assert.deepEqual(compose.services.smoke.command, ["node", "/opt/openarms/sandbox/smoke-runtime.mjs"])
  const installed = YAML.parse(readFileSync(path.join(directory, "sandbox/compose.installed.yaml"), "utf8"))
  for (const service of ["cli", "smoke"]) {
    assert.equal(installed.services[service].environment.OPENARMS_LIBRARY_ROOT, "/opt/installed-router")
    for (const mount of installed.services[service].volumes) {
      assert.equal(mount.read_only, true)
      assert.equal(mount.bind.create_host_path, false)
      assert.ok(["/opt/installed-router/registry.json", "/opt/installed-router/skills"].includes(mount.target))
    }
  }
  const dockerfile = readFileSync(path.join(directory, "sandbox/Dockerfile"), "utf8")
  for (const [key, expected] of Object.entries({ XDG_CONFIG_HOME: "/home/node/.config", XDG_STATE_HOME: "/home/node/.local/state", XDG_DATA_HOME: "/home/node/.local/share", XDG_CACHE_HOME: "/home/node/.cache" })) assert.ok(dockerfile.includes(`${key}=${expected}`), `Missing expected sandbox path: ${key}`)
  for (const contract of ["NODE_VERSION", "OPENCODE_VERSION", "OPENARMS_BUILD_FINGERPRINT", "org.openarms.build-fingerprint"]) assert.ok(dockerfile.includes(contract), `Missing Docker build contract: ${contract}`)
  for (const file of copySources(directory)) assert.ok(existsSync(path.join(directory, file)), `Missing COPY source: ${file}`)
  assert.ok(existsSync(path.join(directory, `sandbox/fixtures/${configuration.values.SANDBOX_FIXTURE}`)))
  const allow = dockerIgnore(readFileSync(path.join(directory, ".dockerignore"), "utf8"))
  for (const file of ["src/runtime.ts", "plugins/skill-router-server.ts", "plugins/skill-router-tui.tsx", "registry.json", "sandbox/entrypoint.mjs", "sandbox/smoke-runtime.mjs"]) assert.equal(allow(file), true, `Required runtime file excluded from build: ${file}`)
  for (const file of ["sandbox/.env", "sandbox/local/auth.json", "src/node_modules/cache", "src/.git/config", "sandbox/auth.json"]) assert.equal(allow(file), false, `Unexpected build context inclusion: ${file}`)
  const source = readFileSync(path.join(directory, "plugins/skill-router-server.ts"), "utf8")
    assert.match(source, /load_skill\s*:\s*tool\(/, "Missing source tool declaration")
    assert.doesNotMatch(source, /load_verified_skill\s*:/, "Legacy verified tool retained")
   assert.match(source, /skill\s*:\s*tool\.schema\.string\(/, "Missing skill argument declaration")
   assert.doesNotMatch(source, /load_skill_package\s*:/, "Legacy tool retained")
  return { checks: 8, configuration }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const { checks } = validateStatic(); console.log(`PASS: smoke-static ${checks} contract groups (offline; no Docker/OpenCode)`)
  } catch (error) { console.error(`STATIC_SMOKE_FAILED: ${error.message}`); process.exitCode = 1 }
}
