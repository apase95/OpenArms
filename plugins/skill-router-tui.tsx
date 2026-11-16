import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { installSkillBrowser } from "../src/native-skills.ts"

// Keep the existing entry path so a reviewed upgrade need not rewrite plugin URLs.
export default {
  id: "skill-router-tui",
  async tui(api) { installSkillBrowser(api) },
} satisfies TuiPluginModule
