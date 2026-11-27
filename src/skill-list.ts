import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

export type SkillListOption = { title: string; value: number }
export type SkillListProps = {
  title: string
  placeholder: string
  options: SkillListOption[]
  offValues: ReadonlySet<number>
  onSelect: (option: SkillListOption) => void
}
export type SkillListRenderer = (props: SkillListProps) => ReturnType<TuiPluginApi["ui"]["DialogSelect"]>
export const OFF_SKILL_COLOR = "#ef4444"

/** OFF red takes precedence over selected-row text styling. */
export function skillRowColor<Color>(off: boolean, selected: boolean, normal: Color, highlighted: Color) {
  return off ? OFF_SKILL_COLOR : selected ? highlighted : normal
}

/** Case-insensitive subsequence search, preserving the catalog's Alphabet order. */
export function filterSkillOptions(options: SkillListOption[], query: string) {
  const needle = Array.from(query.trim().toLocaleLowerCase())
  if (!needle.length) return options
  return options.filter(option => {
    let index = 0
    for (const char of option.title.toLocaleLowerCase()) if (char === needle[index]) index++
    return index === needle.length
  })
}

export function moveSkillSelection(index: number, delta: number, count: number) {
  return Math.max(0, Math.min(Math.max(0, count - 1), index + delta))
}

/** Render only a bounded window; source values remain stable after filtering. */
export function skillListWindow(count: number, selected: number, rows: number) {
  const size = Math.max(1, Math.floor(rows))
  const index = moveSkillSelection(selected, 0, count)
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), count - size))
  return { start, end: Math.min(count, start + size) }
}
