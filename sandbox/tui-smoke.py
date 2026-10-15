"""Host-side PTY check: start the container and open the OpenArms picker."""

import fcntl
import codecs
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import termios
import time

root = Path(__file__).resolve().parent.parent
installed = "--installed" in sys.argv[1:]
synthetic = "--synthetic" in sys.argv[1:]
if synthetic and (installed or not os.environ.get("OPENARMS_BUILD_CONTEXT") or os.environ.get("OPENARMS_LIBRARY_MODE") != "synthetic"):
    raise RuntimeError("Synthetic PTY requires root runner context/image")
name = f"openarms-sandbox-tui-check-{os.getpid()}"
compose = [
    "docker", "compose", "--project-directory", str(root / "sandbox"),
    "-f", str(root / "sandbox/compose.yaml"),
]
if installed:
    compose += ["--project-name", "openarms-sandbox-installed", "-f", str(root / "sandbox/compose.installed.yaml")]
if os.environ.get("OPENARMS_SMOKE_PROJECT"):
    compose += ["--project-name", os.environ["OPENARMS_SMOKE_PROJECT"]]

master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 120, 0, 0))
process = subprocess.Popen(
    compose + ["run", "--rm"] + (["--pull", "never"] if synthetic else []) + ["--name", name, "cli", "node", "/opt/openarms/sandbox/tui-fixture-launch.mjs"],
    stdin=slave, stdout=slave, stderr=slave, cwd=root,
    env={**os.environ, "TERM": "xterm-256color"},
)
os.close(slave)
output = bytearray()
startup_timeout = float(os.environ.get("OPENARMS_TUI_STARTUP_MS", "120000")) / 1000
interaction_timeout = float(os.environ.get("OPENARMS_TUI_INTERACTION_MS", "30000")) / 1000
interrupted = None
cleanup_errors = []
def interrupt(signum, _frame):
    global interrupted
    interrupted = signum
    raise KeyboardInterrupt
signal.signal(signal.SIGTERM, interrupt)
signal.signal(signal.SIGINT, interrupt)
print("STAGE: tui-startup", flush=True)
started = time.monotonic()
typed_at = None
submitted = False
passed = False
phase = "open"
local_cases = [
    ("/skills packages", "Skill Packages", ""),
    ("/skills status", "Skill Status", ""),
    ("/skills list docs", "Docs Skills", ""),
    ("/skills use docs docs-editor", "Skills Enabled", "Selection updated"),
    ("/skills status", "Skill Status", "Selected"),
    ("/arms-test-load", "Synthetic loaded", ""),
    ("/skills status", "Skill Status", "Loaded"),
    ("/skills inspect", "Skill Inspect", "Loaded"),
    ("/skills invalid", "Skill Router Error", ""),
    ("/usage today", "Usage and Budget", "Today"),
    ("/usage invalid", "Usage and Budget", "Usage:"),
    ("/budget", "Budget", "report-only"),
    ("/budget invalid", "Usage and Budget", "Usage:"),
]
local_index = -1
keys = []
next_key_at = 0
cols = 120
screen = [[" "] * cols for _ in range(32)]
backgrounds = [[None] * 120 for _ in range(32)]
background = None
cancel_span = None
row = column = 0
pending = ""
decoder = codecs.getincrementaldecoder("utf-8")("replace")


def update_screen(chunk):
    # OpenTUI sends differential frames: titles need not be contiguous in output.
    global pending, row, column, background
    pending += decoder.decode(chunk)
    if len(pending) > 131072:
        raise RuntimeError("TERMINAL_FRAME_TOO_LARGE: incomplete terminal sequence exceeds bounded parser")
    while pending:
        if pending.startswith("\x1b["):
            match = re.match(r"\x1b\[([0-9;?<>]*)([ -/]*)([@-~])", pending)
            if not match:
                break
            params, _, command = match.groups()
            numbers = [int(value or 0) for value in params.split(";")] if not params.startswith(("?", "<", ">")) else []
            if command in ("H", "f"):
                row = (numbers[0] or 1) - 1 if numbers else 0
                column = (numbers[1] or 1) - 1 if len(numbers) > 1 else 0
            elif command == "J" and numbers == [2]:
                for line in screen:
                    line[:] = [" "] * cols
                for line in backgrounds:
                    line[:] = [None] * cols
            elif command == "m":
                if 0 in numbers or 49 in numbers:
                    background = None
                if 48 in numbers:
                    index = numbers.index(48)
                    background = tuple(numbers[index:index + (5 if numbers[index + 1] == 2 else 3)])
            pending = pending[match.end():]
        elif pending.startswith("\x1b]"):
            match = re.match(r"\x1b\].*?(?:\x07|\x1b\\)", pending, re.S)
            if not match:
                break
            pending = pending[match.end():]
        elif pending.startswith("\x1b"):
            if len(pending) < 2:
                break
            pending = pending[2:]
        else:
            char, pending = pending[0], pending[1:]
            if char == "\r":
                column = 0
            elif char == "\n":
                row += 1
            elif char >= " ":
                if 0 <= row < 32 and 0 <= column < cols:
                    screen[row][column] = char
                    backgrounds[row][column] = background
                column += 1
    return "\n".join("".join(line) for line in screen)


visible = ""
def dialog_geometry(grid, colors, title, labels, adjacent=False):
    def locate(label):
        hits = [(y, ''.join(line).find(label)) for y, line in enumerate(grid) if label in ''.join(line)]
        assert len(hits) == 1, f"Missing/ambiguous text: {label}"
        return hits[0]
    def span(y, x):
        color = colors[y][x]
        assert color is not None, 'Missing rendered background'
        left, right = x, x + 1
        while left and colors[y][left - 1] == color:
            left -= 1
        while right < len(grid[y]) and colors[y][right] == color:
            right += 1
        return left, right
    ty, tx = locate(title)
    panel = span(ty, tx)
    bounds = []
    rows = []
    for label in labels:
        y, x = locate(label)
        bounds.append(span(y, x))
        rows.append(y)
    # The active input/choice must have its own background, not the panel color.
    left, right = bounds[0]
    assert colors[rows[0]][left] != colors[ty][tx], 'No active content background'
    insets = left - panel[0], panel[1] - right
    assert insets[0] == insets[1] and insets[0] > 0, f'Unequal panel insets: {panel}, {bounds}, {insets}'
    if adjacent:
        assert rows[1] - rows[0] == 1, f'Choices are not adjacent: {rows}'
    assert panel[0] < tx < panel[1] and tx == left, f'Title/content alignment: {tx}, {left}'
    return panel, bounds[0], rows, insets


def button_span(label):
    for y, line in enumerate(screen):
        text = "".join(line)
        x = text.find(label)
        if x < 0:
            continue
        color = backgrounds[y][x]
        left, right = x, x + len(label)
        while left > 0 and backgrounds[y][left - 1] == color:
            left -= 1
        while right < cols and backgrounds[y][right] == color:
            right += 1
        return (left, right)
    raise AssertionError("Missing button: " + label)


def measure(title, labels, adjacent=False):
    result = dialog_geometry(screen, backgrounds, title, labels, adjacent)
    print(f'\nPASS: geometry cols={cols} title={title} panel={result[0]} content={result[1]} rows={result[2]} insets={result[3]}', flush=True)
    return result[1]


def dialog_crop(grid, colors, title):
    for y, line in enumerate(grid):
        x = ''.join(line).find(title)
        if x < 0:
            continue
        color = colors[y][x]
        left, right = x, x + len(title)
        while left and colors[y][left - 1] == color:
            left -= 1
        while right < len(line) and colors[y][right] == color:
            right += 1
        return '\n'.join(''.join(line[left:right]) for line in grid)
    return ''


def resize(width):
    global cols, screen, backgrounds, visible
    cols = width
    screen = [[' '] * cols for _ in range(32)]
    backgrounds = [[None] * cols for _ in range(32)]
    visible = ''
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 32, cols, 0, 0))
    subprocess.run(['docker', 'exec', name, 'stty', '-F', '/proc/1/fd/0', 'cols', str(cols), 'rows', '32'], check=True, timeout=10)
stage_started = started
try:
    while time.monotonic() - started < 300 and process.poll() is None:
        ready, _, _ = select.select([master], [], [], 0.5)
        if ready:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            output.extend(chunk)
            del output[:-131072]
            # Full PTY bytes go to the host log sink; they are never echoed by the runner.
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            visible = update_screen(chunk)
            # Minimal terminal responses requested by OpenTUI.
            for request, reply in [
                (b"\x1b[6n", b"\x1b[1;1R"),
                (b"\x1b[c", b"\x1b[?1;2c"),
                (b"\x1b[>c", b"\x1b[>0;0;0c"),
            ]:
                if request in chunk:
                    os.write(master, reply)
        if typed_at is None:
            if b"ctrl+p" in output and time.monotonic() - started > 30:
                os.write(master, b"/skills")
                typed_at = time.monotonic()
                stage_started = typed_at
                print("\nSTAGE: tui-interaction:open", flush=True)
        if typed_at is not None and not submitted and time.monotonic() - typed_at > 2:
            os.write(master, b"\r")
            submitted = True
        now = time.monotonic()
        # Compact confirmation copy starts at column 32 (zero-based 31) in this
        # fixed 120-column
        # viewport. Ignore background chrome outside the dialog when matching
        # wrapped copy; it can remain visible beside differential frames.
        dialog_visible = dialog_crop(screen, backgrounds, 'Change library path?')
        limit = startup_timeout if typed_at is None else interaction_timeout
        if now - stage_started > limit:
            raise TimeoutError(f"TIMEOUT: tui-{'startup' if typed_at is None else 'interaction:' + phase} limit={limit}s")
        if keys and now >= next_key_at:
            os.write(master, keys.pop(0))
            next_key_at = now + 0.3
        if phase == "open" and "Select Action" in visible:
            # Ten local actions plus Done; wrap to status using the real picker.
            output.clear()
            # Keep the pointer over a row while the viewport moves underneath it.
            assert "Grant" not in visible and "Revoke" not in visible
            keys = [b"\x1b[B"] * 11 + [b"\r"]
            next_key_at = now + 1
            phase = "status"
            stage_started = now
            print("\nSTAGE: tui-interaction:status", flush=True)
        elif phase == "status" and "Skill Status" in visible:
            assert "Not configured" in visible
            assert visible.index("Set / edit library path") < visible.index("Not configured")
            output.clear()
            keys = [b"e"]
            next_key_at = now + 1
            phase = "configure"
            stage_started = now
            print("\nSTAGE: tui-interaction:reopen", flush=True)
        elif phase == "configure" and not keys and "Set library path" in visible:
            measure('Set library path', ['Absolute library root'])
            keys = [b"/tmp/openarms-pty-library", b"\r"]
            next_key_at = now + 1
            phase = "configure-confirm"
            stage_started = now
        elif phase == "configure-confirm" and not keys and "Change library path?" in visible:
            measure('Change library path?', ['Cancel', 'Confirm'], True)
            assert "choose" not in dialog_visible and "Default:" not in dialog_visible
            keys = [b"\r"]  # Default Cancel must preserve Not configured.
            next_key_at = now + 1
            phase = "configure-denied"
            stage_started = now
        elif phase == "configure-denied" and not keys and "Skill Status" in visible and "Not configured" in visible:
            resize(80)
            keys = [b"e", b"/tmp/openarms-pty-library", b"\r"]
            next_key_at = now + 1
            phase = "configure-reconfirm"
            stage_started = now
        elif phase == "configure-reconfirm" and not keys and "Change library path?" in visible:
            cancel_span = measure('Change library path?', ['Cancel', 'Confirm'], True)
            keys = [b"\x1b[B"]
            next_key_at = now + 1
            phase = "configure-active"
            stage_started = now
        elif phase == "configure-active" and not keys and button_span("Confirm") == cancel_span:
            assert 0 < cancel_span[1] - cancel_span[0] < 120
            assert "Container paths" not in dialog_visible
            assert "task locks" in dialog_visible and "/new" in dialog_visible
            measure('Change library path?', ['Confirm'])
            keys = [b"\r"]
            next_key_at = now + 1
            phase = "configured"
            stage_started = now
        elif phase == "configured" and not keys and "Skill Status" in visible and "/tmp/openarms-pty-library" in visible:
            keys = [b'e']
            next_key_at = now + 1
            phase = 'narrow-editor'
            stage_started = now
        elif phase == 'narrow-editor' and not keys and 'Set library path' in visible:
            measure('Set library path', ['/tmp/openarms-pty-library'])
            resize(120)
            phase = "local"
            local_index = 0
            keys = [b"\x1b", b"\x1b", local_cases[0][0].encode(), b"\r"]
            next_key_at = now + 1
            stage_started = now
            print("\nSTAGE: tui-local:" + local_cases[0][0], flush=True)
        elif phase == "local" and not keys and local_index >= 0:
            command, title, detail = local_cases[local_index]
            # Differential frames may expose the title before the remaining rows.
            if command in ("/usage", "/usage today", "/budget") and not re.search(r"Timezone\s+:\s+UTC", visible):
                continue
            if command == "/skills status" and "Set / edit library path" not in visible:
                continue  # Footer arrives after the title/skill rows in differential frames.
            if title in visible and (not detail or detail in visible):
                if command == "/skills status":
                    if detail in ("Selected", "Loaded"):
                        assert visible.index("docs-editor") < visible.index("Set / edit library path")
                    else:
                        assert visible.index("Set / edit library path") < visible.index("No skills selected")
                if command in ("/usage", "/usage today", "/budget"):
                    assert not any(debug in visible for debug in ("missing=0", "estimated=false", "__skill_router_home__", '"session":{'))
                    assert re.search(r"Timezone\s+:\s+UTC", visible), "readable aligned metadata missing"
                print("\nPASS: local " + command + " -> " + title, flush=True)
                local_index += 1
                if local_index == len(local_cases):
                    # Type trailing space WITHOUT Enter: public Prompt ref polling
                    # must open the scope picker before any submit path runs.
                    keys = [b"\x1b", b"/usage "]
                    next_key_at = now + 1
                    phase = "usage-typed"
                    stage_started = now
                    print("\nSTAGE: tui-usage:typed-space", flush=True)
                    continue
                # Invalid skills arguments produce a toast, not a dialog. Clear
                # the prompt via the supported ctrl+u binding before the next case.
                keys = ([b"\x1b"] if command not in ("/skills invalid", "/skills use docs docs-editor", "/arms-test-load") else []) + [b"\x15", local_cases[local_index][0].encode(), b"\r"]
                next_key_at = now + 1
                stage_started = now
                print("\nSTAGE: tui-local:" + local_cases[local_index][0], flush=True)
        elif phase == "usage-typed" and not keys and "Usage scope" in visible:
            assert "today" in visible and "model" in visible
            keys = [b"\x1b", b"\x15", b"/budget", b"\r", b"e"]
            next_key_at = now + 1
            phase = "budget-menu"
            stage_started = now
        elif phase == "budget-menu" and not keys and "Project budget" in visible:
            keys = [b"\x1b[B", b"\r", b"2.5", b"\r"]
            next_key_at = now + 1
            phase = "budget-confirm"
            stage_started = now
        elif phase == "budget-confirm" and not keys and "Save project budget?" in visible:
            assert "/workspace/project" in visible
            keys = [b"\x1b[B", b"\r"]
            next_key_at = now + 1
            phase = "budget-saved"
            stage_started = now
        elif phase == "budget-saved" and not keys and "Project budget" in visible:
            keys = [b"\x1b", b"/arms-test-new", b"\r", b"/skills status", b"\r"]
            next_key_at = now + 1
            phase = "home-adopted"
            stage_started = now
        elif phase == "home-adopted" and not keys and "Skill Status" in visible and "docs-editor" in visible:
            print("\nPASS: explicit Home selection adopted by first real root", flush=True)
            keys = [b"\x1b", b"/arms-test-new", b"\r", b"/skills status", b"\r"]
            next_key_at = now + 1
            phase = "inherited"
            stage_started = now
            print("\nSTAGE: tui-selection:automatic", flush=True)
        elif phase == "inherited" and not keys and "Skill Status" in visible and "docs-editor" in visible and "Selected" in visible:
            assert "Loaded" not in visible
            print("\nPASS: same-library roots automatically copy selection, not load history", flush=True)
            keys = [b"\x1b", b"/new", b"\r", b"/skills status", b"\r"]
            next_key_at = now + 1
            phase = "home-preview"
            stage_started = now
        elif phase == "home-preview" and not keys and "Skill Status" in visible and "docs-editor" in visible and "Selected" in visible:
            assert "Loaded" not in visible
            print("\nPASS: actual /new Home immediately previews Selected before ordinary prompt", flush=True)
            keys = [b"e"]
            next_key_at = now + 1
            phase = "switch-edit"
            stage_started = now
        elif phase == "switch-edit" and not keys and "Set library path" in visible:
            keys = [b"\x15", b"/tmp/openarms-pty-other", b"\r"]
            next_key_at = now + 1
            phase = "switch-cancel"
            stage_started = now
        elif phase == "switch-cancel" and not keys and "Change library path?" in visible:
            keys = [b"\x1b", b"e"]
            next_key_at = now + 1
            phase = "switch-reedit"
            stage_started = now
        elif phase == "switch-reedit" and not keys and "Set library path" in visible:
            assert "/tmp/openarms-pty-library" in visible
            keys = [b"\x15", b"/tmp/openarms-pty-other", b"\r"]
            next_key_at = now + 1
            phase = "switch-confirm"
            stage_started = now
        elif phase == "switch-confirm" and not keys and "Change library path?" in visible:
            assert "task locks" in dialog_visible and "/new" in dialog_visible
            keys = [b"\x1b[B", b"\r"]
            next_key_at = now + 1
            phase = "switched"
            stage_started = now
        elif phase == "switched" and not keys and "Skill Status" in visible and "/tmp/openarms-pty-other" in visible:
            assert "docs-editor" not in visible
            passed = True
            break
except KeyboardInterrupt:
    print(f"\nSIGNAL: {interrupted or signal.SIGINT} at tui-interaction:{phase}", file=sys.stderr)
except Exception as error:
    print(f"\n{type(error).__name__}: {error}", file=sys.stderr)
finally:
    try:
        result = subprocess.run(["docker", "stop", "--timeout", "3", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        if result.returncode:
            cleanup_errors.append(f"docker stop exit={result.returncode}")
    except Exception as error:
        cleanup_errors.append(str(error))
    finally:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    os.close(master)
    for error in cleanup_errors:
        print(f"\nCLEANUP_FAILED: {error}", file=sys.stderr)

if passed:
    print("\nPASS: synthetic library Enter/configure/Cancel/Confirm; local selection/load; automatic roots; typed usage picker; budget editor; no provider request or real skill content")
else:
    print(f"FAIL: OpenArms picker keyboard check stalled at {phase} within 300 seconds.", file=sys.stderr)
    print(visible, file=sys.stderr)
    print("Run npm run sandbox -- start and inspect the TUI console (plugin load errors).", file=sys.stderr)
sys.exit(128 + interrupted if interrupted else 0 if passed and not cleanup_errors else 1)
