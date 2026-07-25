#!/usr/bin/env python3
"""
VRClaudeInterface launcher — starts the Node web server (server.js), streams
its output, and cleanly stops it on Ctrl+C.

Usage:
    python run.py                          # start; prompts for API key if needed
    python run.py --api-key sk-ant-...     # pass API key directly
    python run.py --api-key-file key.txt   # read API key from a file
    python run.py start                    # same as bare 'python run.py'
    python run.py stop                     # kill server from a previous run
    python run.py status                   # show whether the recorded PID is alive
    python run.py restart                  # stop then start

Claude API key resolution order (first one wins):
    1. --api-key CLI argument
    2. --api-key-file CLI argument (path; whitespace stripped)
    3. CLAUDE_API_KEY environment variable
    4. Interactive hidden prompt (getpass)

The resolved key is passed to the Node child via its env only — it is never
written to the PID file, logged, or exported into the parent shell.

Env vars honored:
    CLAUDE_API_KEY         — fallback source for the key (see above)
    PORT                   — port for the Node web server (default 3000)
"""

import argparse
import getpass
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE_DIR = ROOT / "site-source"
PID_FILE = ROOT / ".vrclaude.pids"

IS_WINDOWS = sys.platform == "win32"

# ANSI colors. On Windows 10+, calling os.system("") flips the console into
# VT100 processing mode so these render correctly in cmd.exe.
if IS_WINDOWS:
    os.system("")
RESET = "\033[0m"
NODE_COL = "\033[36m"   # cyan
ERR_COL = "\033[31m"    # red
OK_COL = "\033[32m"     # green
DIM = "\033[2m"


def cprint(color, msg):
    print(f"{color}{msg}{RESET}", flush=True)


def stream_output(proc, prefix, color):
    """Pump a child process's combined stdout/stderr to our stdout, line by line."""
    try:
        for raw in iter(proc.stdout.readline, b""):
            text = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            sys.stdout.write(f"{color}[{prefix}]{RESET} {text}\n")
            sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(f"{ERR_COL}[{prefix}] stream error: {e}{RESET}\n")


def write_pids(pids: dict):
    PID_FILE.write_text(json.dumps(pids))


def read_pids():
    if not PID_FILE.exists():
        return None
    try:
        return json.loads(PID_FILE.read_text())
    except Exception:
        return None


def is_alive(pid):
    if not pid:
        return False
    try:
        if IS_WINDOWS:
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True, text=True
            )
            return str(pid) in out.stdout
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def kill_pid(pid):
    """Best-effort terminate. On Windows uses taskkill /T to also kill children."""
    if not pid or not is_alive(pid):
        return False
    try:
        if IS_WINDOWS:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        else:
            os.kill(pid, signal.SIGTERM)
            for _ in range(20):
                time.sleep(0.1)
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    return True
            os.kill(pid, signal.SIGKILL)
        return True
    except Exception:
        return False


def resolve_api_key(arg_key, arg_key_file):
    """Resolve the Claude API key from the available sources.

    Priority: --api-key > --api-key-file > $CLAUDE_API_KEY > interactive prompt.
    Returns the key as a string, or None if the user aborts the prompt.
    The key is NEVER written to disk, logged, or echoed.
    """
    if arg_key:
        return arg_key.strip()

    if arg_key_file:
        path = Path(arg_key_file).expanduser()
        if not path.is_file():
            cprint(ERR_COL, f"--api-key-file: {path} does not exist or is not a file")
            return None
        try:
            content = path.read_text(encoding="utf-8")
        except Exception as e:
            cprint(ERR_COL, f"--api-key-file: failed to read {path}: {e}")
            return None
        # Take the first non-empty, non-comment line so KEY=VAL or plain-text both work.
        for raw in content.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line and line.split("=", 1)[0].strip().upper() in (
                "CLAUDE_API_KEY", "ANTHROPIC_API_KEY"
            ):
                line = line.split("=", 1)[1].strip().strip('"').strip("'")
            return line
        cprint(ERR_COL, f"--api-key-file: {path} contained no usable key")
        return None

    env_key = os.environ.get("CLAUDE_API_KEY")
    if env_key:
        return env_key.strip()

    # Interactive fallback. getpass hides input and works on Windows + POSIX.
    if not sys.stdin.isatty():
        cprint(ERR_COL,
               "No API key supplied and stdin is not a TTY — pass --api-key, "
               "--api-key-file, or set CLAUDE_API_KEY.")
        return None
    print(f"{DIM}Enter your Claude API key (input hidden). Leave blank to abort.{RESET}")
    try:
        entered = getpass.getpass("CLAUDE_API_KEY: ").strip()
    except (KeyboardInterrupt, EOFError):
        print()
        return None
    return entered or None


def spawn(cmd, cwd, env_extra=None):
    """Spawn a child with merged stdout/stderr and a new process group on Windows."""
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    if env_extra:
        env.update(env_extra)

    kwargs = dict(
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        bufsize=0,
    )
    if IS_WINDOWS:
        # Detach from our console group so Ctrl+C in our shell doesn't race
        # the child to death — we want to terminate it ourselves.
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    return subprocess.Popen(cmd, **kwargs)


def cmd_start(api_key=None, api_key_file=None):
    if not SITE_DIR.is_dir():
        cprint(ERR_COL, f"site-source directory not found at {SITE_DIR}")
        return 1
    server_js = SITE_DIR / "server.js"
    if not server_js.is_file():
        cprint(ERR_COL, f"server.js missing at {server_js}")
        return 1
    if shutil.which("node") is None:
        cprint(ERR_COL, "'node' not found on PATH — install Node.js.")
        return 1

    resolved_key = resolve_api_key(api_key, api_key_file)
    if not resolved_key:
        cprint(ERR_COL, "No Claude API key supplied — aborting.")
        return 1

    existing = read_pids()
    if existing and is_alive(existing.get("node")):
        cprint(ERR_COL,
               f"Server already appears to be running (see {PID_FILE.name}). "
               "Run 'python run.py stop' first.")
        return 1

    cprint(OK_COL, "Starting Node web server...")
    # Pass the API key only to the Node child, not to anything we log. The
    # key never lives in the parent's exported env beyond what was already there.
    node_proc = spawn(
        ["node", "server.js"],
        cwd=SITE_DIR,
        env_extra={"CLAUDE_API_KEY": resolved_key},
    )
    threading.Thread(
        target=stream_output, args=(node_proc, "node", NODE_COL), daemon=True
    ).start()

    write_pids({"launcher": os.getpid(), "node": node_proc.pid})

    print()
    cprint(OK_COL, "Server launched. Press Ctrl+C to stop.")
    print(f"  {DIM}Node PID: {node_proc.pid}{RESET}")
    print()

    shutting_down = {"flag": False}

    def shutdown(*_):
        if shutting_down["flag"]:
            return
        shutting_down["flag"] = True
        print()
        cprint(OK_COL, "Shutting down...")

        if node_proc.poll() is None:
            try:
                if IS_WINDOWS:
                    # taskkill /T also kills any grandchildren
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(node_proc.pid)],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                    )
                else:
                    node_proc.terminate()
            except Exception as e:
                cprint(ERR_COL, f"  node: terminate failed: {e}")

        try:
            node_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cprint(ERR_COL, "  node: didn't exit, killing")
            try:
                node_proc.kill()
            except Exception:
                pass

        if PID_FILE.exists():
            try:
                PID_FILE.unlink()
            except Exception:
                pass
        cprint(OK_COL, "Done.")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"):
        try:
            signal.signal(signal.SIGTERM, shutdown)
        except Exception:
            pass

    # Babysit: if the child dies on its own, tear down so the user notices
    # instead of leaving a stale PID file.
    try:
        while True:
            if node_proc.poll() is not None:
                cprint(ERR_COL,
                       f"Node server exited with code {node_proc.returncode}.")
                shutdown()
            time.sleep(0.5)
    except KeyboardInterrupt:
        shutdown()


def cmd_stop():
    pids = read_pids()
    if not pids:
        print("No PID file found — nothing to stop.")
        return 0
    pid = pids.get("node")
    stopped = pid and kill_pid(pid)
    try:
        PID_FILE.unlink()
    except Exception:
        pass
    if stopped:
        cprint(OK_COL, f"Stopped: node (pid {pid})")
    else:
        print("Recorded PID was already gone.")
    return 0


def cmd_status():
    pids = read_pids()
    if not pids:
        print("No PID file — launcher hasn't been used yet (or stop was already run).")
        return 0
    pid = pids.get("node")
    if not pid:
        print("  node: no PID recorded")
        return 0
    alive = is_alive(pid)
    col = OK_COL if alive else ERR_COL
    state = "running" if alive else "not running"
    print(f"  node: pid {pid} — {col}{state}{RESET}")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Start/stop the VRClaudeInterface server.",
    )
    parser.add_argument(
        "action", nargs="?", default="start",
        choices=["start", "stop", "status", "restart"],
        help="What to do (default: start)",
    )
    parser.add_argument(
        "--api-key",
        help="Claude API key. Takes priority over --api-key-file and $CLAUDE_API_KEY.",
    )
    parser.add_argument(
        "--api-key-file",
        help="Path to a file containing the Claude API key (plain or KEY=VAL).",
    )
    args = parser.parse_args()

    if args.action == "start":
        return cmd_start(api_key=args.api_key, api_key_file=args.api_key_file)
    if args.action == "stop":
        return cmd_stop()
    if args.action == "status":
        return cmd_status()
    if args.action == "restart":
        cmd_stop()
        time.sleep(0.5)
        return cmd_start(api_key=args.api_key, api_key_file=args.api_key_file)


if __name__ == "__main__":
    sys.exit(main() or 0)
