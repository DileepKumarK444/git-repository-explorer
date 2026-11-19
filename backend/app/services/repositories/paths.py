"""Turn paths typed or picked on Windows into paths the Linux backend can open (WSL)."""
from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
import sys

_UNC_WSL = re.compile(r"^[\\/]{2}(?:wsl\.localhost|wsl\$)[\\/][^\\/]+(?P<rest>.*)$", re.IGNORECASE)
_DRIVE = re.compile(r"^(?P<d>[A-Za-z]):(?P<rest>[\\/].*|)$")


def is_wsl() -> bool:
    return sys.platform.startswith("linux") and (
        bool(os.environ.get("WSL_DISTRO_NAME")) or "microsoft" in platform.uname().release.lower()
    )


def normalize_path(raw: str) -> str:
    """\\\\wsl.localhost\\Ubuntu\\home\\me\\app -> /home/me/app; C:\\Users\\me\\app -> /mnt/c/Users/me/app (WSL only)."""
    p = raw.strip().strip("\"'")
    if sys.platform.startswith("win"):
        return p
    m = _UNC_WSL.match(p)
    if m:
        return m.group("rest").replace("\\", "/") or "/"
    m = _DRIVE.match(p)
    if m and is_wsl():
        rest = m.group("rest").replace("\\", "/").rstrip("/")
        return f"/mnt/{m.group('d').lower()}{rest}"
    return p


def pick_folder() -> str | None:
    """Open a native folder dialog. Returns None if cancelled; raises NotImplementedError if unavailable."""
    if sys.platform == "darwin":
        script = 'POSIX path of (choose folder with prompt "Choose a Git repository")'
        proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=300)
        return proc.stdout.strip().rstrip("/") or None if proc.returncode == 0 else None

    if is_wsl():
        if not shutil.which("powershell.exe"):
            raise NotImplementedError("powershell.exe is not reachable from WSL. Paste the path instead.")
        start = subprocess.run(["wslpath", "-w", os.path.expanduser("~")], capture_output=True, text=True).stdout.strip()
        ps = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$d.Description = 'Choose a Git repository'; $d.ShowNewFolderButton = $false; "
            f"$d.SelectedPath = '{start.replace(chr(39), chr(39) * 2)}'; "
            "if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }"
        )
        proc = subprocess.run(["powershell.exe", "-NoProfile", "-STA", "-Command", ps],
                              capture_output=True, text=True, timeout=300)
        chosen = proc.stdout.strip()
        return normalize_path(chosen) if chosen else None

    if sys.platform.startswith("linux") and shutil.which("zenity"):
        proc = subprocess.run(["zenity", "--file-selection", "--directory", "--title=Choose a Git repository"],
                              capture_output=True, text=True, timeout=300)
        return proc.stdout.strip().rstrip("/") or None if proc.returncode == 0 else None

    raise NotImplementedError("No native folder picker is available here. Paste the path instead.")
