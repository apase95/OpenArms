import assert from "node:assert/strict"
import { test } from "node:test"
import { filterSkillOptions, moveSkillSelection, OFF_SKILL_COLOR, skillListWindow, skillRowColor } from "../src/skill-list.ts"

const options = [
  { title: "docs-editor", value: 0 },
  { title: "document-service", value: 1 },
  { title: "paper-writing", value: 2 },
]

test("OFF skill names stay red in both normal and selected rows; ON uses host theme colors", () => {
  assert.equal(skillRowColor(true, false, "normal", "selected"), OFF_SKILL_COLOR)
  assert.equal(skillRowColor(true, true, "normal", "selected"), OFF_SKILL_COLOR)
  assert.equal(skillRowColor(false, false, "normal", "selected"), "normal")
  assert.equal(skillRowColor(false, true, "normal", "selected"), "selected")
})

test("skill filtering keeps Alphabet order and stable values for OFF styling and selection", () => {
  assert.equal(filterSkillOptions(options, ""), options)
  assert.deepEqual(filterSkillOptions(options, " DOC "), options.slice(0, 2))
  assert.deepEqual(filterSkillOptions(options, "DOCSERV"), [options[1]])
  assert.deepEqual(filterSkillOptions(options, "missing"), [])
  assert.deepEqual(options.map(option => option.value), [0, 1, 2])
  const off = new Set([1])
  assert.equal(off.has(filterSkillOptions(options, "document")[0].value), true)
})

test("large catalogs have bounded keyboard/page/wheel selection and visible selected rows", () => {
  assert.equal(moveSkillSelection(0, -3, 1000), 0)
  assert.equal(moveSkillSelection(999, 10, 1000), 999)
  assert.equal(moveSkillSelection(0, 10, 1000), 10)
  assert.equal(moveSkillSelection(0, 1, 0), 0)
  assert.deepEqual(skillListWindow(0, 0, 20), { start: 0, end: 0 })
  for (const count of [1, 5, 1000]) {
    for (const selected of [0, Math.floor(count / 2), count - 1]) {
      const window = skillListWindow(count, selected, 12)
      assert.ok(window.end - window.start <= 12)
      assert.ok(window.start <= selected && selected < window.end)
    }
  }
})
