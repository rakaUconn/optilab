"""Freeze the engine with PyInstaller into the Tauri sidecar slot.

Output: apps/desktop/src-tauri/binaries/optilab-engine-<rust target triple>[.exe]
Usage:  pip install -e "engine[build]" && python engine/scripts/build_sidecar.py [--target <triple>]
"""
import argparse
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/desktop/src-tauri/binaries"


def host_triple() -> str:
    out = subprocess.check_output(["rustc", "-vV"], text=True)
    return re.search(r"^host: (.+)$", out, re.M).group(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default=None, help="Rust target triple (default: host)")
    triple = ap.parse_args().target or host_triple()
    work = ROOT / "engine/build_sidecar"
    subprocess.check_call([
        sys.executable, "-m", "PyInstaller", "--onefile", "--noconfirm", "--clean",
        "--name", "optilab-engine",
        "--distpath", str(work / "dist"), "--workpath", str(work / "work"), "--specpath", str(work),
        "--collect-submodules", "uvicorn", "--collect-submodules", "optilab",
        "--hidden-import", "uvicorn.logging", "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols.http.auto", "--hidden-import", "uvicorn.lifespan.on",
        str(ROOT / "engine/optilab/__main__.py"),
    ], cwd=ROOT / "engine")
    exe = "optilab-engine.exe" if sys.platform == "win32" else "optilab-engine"
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / (f"optilab-engine-{triple}" + (".exe" if sys.platform == "win32" else ""))
    shutil.copy2(work / "dist" / exe, dest)
    shutil.rmtree(work, ignore_errors=True)
    print("sidecar ->", dest)


if __name__ == "__main__":
    main()
