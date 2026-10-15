// Invoked only by the runner's disposable PTY project, never the user's container.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
const config = path.join(process.env.XDG_CONFIG_HOME, "opencode")
// Generated ordinary test data only; never configure or read the installed library.
for (const root of ["/tmp/openarms-pty-library", "/tmp/openarms-pty-other"]) {
  await mkdir(path.join(root, "skills"), { recursive: true })
  await writeFile(path.join(root, "skills/example.md"), "Synthetic PTY example, not an enabled skill.")
  await writeFile(path.join(root, "skills/editor.md"), "Synthetic PTY editor, not an enabled skill.")
  await writeFile(path.join(root, "registry.json"), JSON.stringify({ version: 1,
    packages: { docs: { core: ["example"], optional: ["docs-editor"], detect: {} } },
    skills: { example: "skills/example.md", "docs-editor": "skills/editor.md" },
  }))
}
await mkdir(config, { recursive: true })
// Real processes in the disposable project; test reporter format is synthetic,
// while assertion, compiler failure and Git diff are actually executed.
const project = "/workspace/project"
await writeFile(path.join(project, "package.json"), JSON.stringify({ scripts: { test: "node acceptance-test.cjs", build: "g++ -Wall -fsyntax-only acceptance.cpp" } }))
await writeFile(path.join(project, "acceptance-test.cjs"), `const assert = require('node:assert/strict');\nfor(let i=0;i<800;i++) console.log('PASS tests/ok.test.ts');\ntry { assert.equal(1,2,'PTY_ASSERTION_FAILURE') } catch(e) { console.log('FAIL tests/bad.test.ts\\n'+e.stack+'\\nTests: 1 failed, 800 passed'); process.exitCode=7 }\n`)
await writeFile(path.join(project, "acceptance.cpp"), `int main() {\n${Array.from({length: 100}, (_, i) => `int unused_${i};`).join("\n")}\nPTY_BUILD_FAILURE;\n}\n`)
await writeFile(path.join(project, "package-lock.json"), "old\n")
await writeFile(path.join(project, "acceptance-source.ts"), "export const value = 1\n")
execFileSync("git", ["init", project])
execFileSync("git", ["-C", project, "add", "package-lock.json", "acceptance-source.ts"])
await writeFile(path.join(project, "package-lock.json"), "generated lock entry\n".repeat(1000))
await writeFile(path.join(project, "acceptance-source.ts"), "export const value = 'PTY_SOURCE_EVIDENCE'\n")
// Only the model transport is synthetic. OpenCode owns bash execution and hooks.
const provider = createServer(async (request, response) => {
  try {
    let body = ""
    for await (const chunk of request) { body += chunk; if (body.length > 1048576) throw Error("PROVIDER_REQUEST_TOO_LARGE") }
    const input = JSON.parse(body), messages = input.messages ?? []
    const user = [...messages].reverse().find(message => message.role === "user")
    const text = typeof user?.content === "string" ? user.content : JSON.stringify(user?.content)
    const command = ["npm test", "git diff", "g++ -Wall -fsyntax-only acceptance.cpp"].find(command => text?.includes(`acceptance: ${command}`))
    const call = command && messages.at(-1)?.role !== "tool" && input.tools?.some(tool => tool.function?.name === "bash")
    const message = call ? { role: "assistant", content: null, tool_calls: [{ id: `fixture_${Date.now()}`, type: "function", function: { name: "bash", arguments: JSON.stringify({ command, description: "Disposable PTY domain acceptance" }) } }] } : { role: "assistant", content: "Acceptance command complete" }
    if (input.stream) {
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      const delta = call ? { role: "assistant", tool_calls: message.tool_calls.map((tool, index) => ({ index, ...tool })) } : message
      response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
      response.end(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: call ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`)
    } else {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: "fixture", choices: [{ index: 0, message, finish_reason: call ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
    }
  } catch (error) { response.writeHead(500); response.end(String(error)) }
})
await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve))
provider.unref()
const serverConfig = JSON.parse(await readFile("/opt/openarms/sandbox/config/opencode.json", "utf8"))
serverConfig.model = "openarms-fixture/fixture"
serverConfig.small_model = "openarms-fixture/fixture"
serverConfig.provider = { "openarms-fixture": { npm: "@ai-sdk/openai-compatible", name: "Synthetic local acceptance", options: { baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKey: "synthetic-not-a-credential" }, models: { fixture: { name: "Synthetic fixture", tool_call: true, limit: { context: 128000, output: 4096 } } } } }
await writeFile(path.join(config, "opencode.json"), JSON.stringify(serverConfig))
await writeFile(path.join(config, "tui.json"), JSON.stringify({ plugin: [
  "file:///opt/openarms/plugins/skill-router-tui.tsx",
  "file:///opt/openarms/sandbox/tui-fixture.ts",
] }))
process.argv = [process.argv[0], "/opt/openarms/sandbox/entrypoint.mjs", "opencode", "/workspace/project"]
await import("./entrypoint.mjs")
