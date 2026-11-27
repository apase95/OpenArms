import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { installOpenArmsMenu } from "../src/openarms-menu.ts"
import { featureEnabled, projectFeatures } from "../src/project-features.ts"

const transcriptBridge = Symbol.for("openarms.compact-transcript.v1")
import { skillDialogFrame } from "./skill-dialog-frame.tsx"
import { skillListRenderer } from "./skill-list.tsx"

// Keep the existing entry path so a reviewed upgrade need not rewrite plugin URLs.
export default {
  id: "skill-router-tui",
  async tui(api) {
    installOpenArmsMenu(api, skillDialogFrame(api), { skillList: skillListRenderer(api) })
    const host = globalThis as typeof globalThis & Record<symbol, unknown>
    const read = (root: string) => featureEnabled(projectFeatures(root), "compact-transcript")
    host[transcriptBridge] = read
    api.lifecycle.onDispose(() => { if (host[transcriptBridge] === read) delete host[transcriptBridge] })
  },
} satisfies TuiPluginModule
