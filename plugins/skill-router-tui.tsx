import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { installOpenArmsMenu } from "../src/openarms-menu.ts"
import { skillDialogFrame } from "./skill-dialog-frame.tsx"
import { skillListRenderer } from "./skill-list.tsx"

// Keep the existing entry path so a reviewed upgrade need not rewrite plugin URLs.
export default {
  id: "skill-router-tui",
  async tui(api) { installOpenArmsMenu(api, skillDialogFrame(api), { skillList: skillListRenderer(api) }) },
} satisfies TuiPluginModule
