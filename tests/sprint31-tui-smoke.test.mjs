import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { execFileSync } from "node:child_process"

const plugin = readFileSync(new URL("../plugins/skill-router-tui.tsx", import.meta.url), "utf8")
const harness = readFileSync(new URL("../sandbox/tui-smoke.py", import.meta.url), "utf8")
const actions = [...plugin.split("const actions: PickerOption[] = [")[1].split("].map(")[0].matchAll(/value: "([^"]+)"/g)].map(match => match[1])
const counts = [...harness.matchAll(/keys = \[b"\\x1b\[B"\] \* (\d+)/g)].map(match => Number(match[1]))

test("PTY downward traversal wraps the complete production picker to status", () => {
  assert.equal(counts.length, 1)
  assert.equal(counts[0], actions.length)
  assert.equal(actions[counts[0] % actions.length], "status")
})

test("synthetic PTY explicitly configures, loads and switches without grant actions", () => {
  assert.equal(actions.at(-1), "__done__")
  assert.ok(!actions.includes("grant") && !actions.includes("revoke"))
  for (const phase of ["configure", "configure-confirm", "switch-cancel", "switch-confirm", "switched"]) {
    assert.ok(harness.includes(`phase == "${phase}"`))
  }
  assert.ok(harness.includes('("/arms-test-load", "Synthetic loaded", "")'))
  assert.ok(harness.includes('("/skills inspect", "Skill Inspect", "Loaded")'))
})

test("PTY compact confirmations test Cancel by behavior and cover typed-space and editor", () => {
  execFileSync('python3', ['-c', `compile(${JSON.stringify(harness)}, 'tui-smoke.py', 'exec')`])
  for (const phase of ["configure-denied", "usage-typed", "budget-confirm", "inherited"]) assert.ok(harness.includes(`phase == "${phase}"`))
})

test("rendered geometry rejects overflow and separated choices, accepts symmetric adjacent cells", () => {
  execFileSync("python3", ["-c", `
import ast
tree = ast.parse(${JSON.stringify(harness)})
helper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'dialog_geometry')
scope = {}
exec(compile(ast.Module(body=[helper], type_ignores=[]), 'geometry', 'exec'), scope)
def fixture(right=28, confirm_y=5):
    grid = [[' '] * 40 for _ in range(10)]
    colors = [['chrome'] * 40 for _ in range(10)]
    for y in range(1, 8): colors[y][10:30] = ['panel'] * 20
    for y, x, text in [(2,12,'Title'), (4,13,'Cancel'), (confirm_y,13,'Confirm')]:
        grid[y][x:x+len(text)] = text
    colors[4][12:right] = ['active'] * (right-12)
    return grid, colors
good = fixture()
assert scope['dialog_geometry'](*good, 'Title', ['Cancel','Confirm'], True)[3] == (2,2)
# Model the two renderer hazards in the current JSX: percentage children of a
# padded width owner overflow, and the choices inherit the outer spacing.
confirmation = ${JSON.stringify(plugin.split('function ConfirmationDialog')[1].split('function BudgetInputDialog')[0])}
scope['dialog_geometry'](*fixture(30 if 'padding={1} width="100%"' in confirmation else 28,
    5 if 'gap={0}' in confirmation else 6), 'Title', ['Cancel','Confirm'], True)
for bad in [fixture(30), fixture(confirm_y=6)]:
    try: scope['dialog_geometry'](*bad, 'Title', ['Cancel','Confirm'], True)
    except AssertionError: pass
    else: raise AssertionError('Bad renderer grid accepted')
`])
})

test("PTY confirmation crop preserves compact left-edge copy and excludes background chrome", () => {
  execFileSync("python3", ["-c", `
import ast, re
tree = ast.parse(${JSON.stringify(harness)})
assignment = next(n for n in ast.walk(tree) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "dialog_visible" for t in n.targets))
screen = [[" "] * 120 for _ in range(32)]
backgrounds = [['chrome'] * 120 for _ in range(32)]
for line in backgrounds: line[30:90] = ['panel'] * 60
screen[12][31:51] = 'Change library path?'
for row, text in [(13, "already"), (14, "injected content cannot be retracted.")]:
    screen[row][31:31 + len(text)] = text
screen[14][0:10] = "BACKGROUND"
helper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'dialog_crop')
scope = {'screen':screen, 'backgrounds':backgrounds}
exec(compile(ast.Module(body=[helper], type_ignores=[]), 'crop-helper', 'exec'), scope)
visible = eval(compile(ast.Expression(assignment.value), "crop", "eval"), scope)
assert re.search(r"already\\s+injected content", visible), repr(visible)
assert "BACKGROUND" not in visible
`])
})
