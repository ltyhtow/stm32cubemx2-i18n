#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

REPO = Path(__file__).resolve().parent.parent


def npm_exe() -> str:
    for name in ("npm.cmd", "npm"):
        found = shutil.which(name)
        if found:
            return found
    raise FileNotFoundError("npm not found in PATH")


def run(cmd: list[str], cwd: Path) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.check_call(cmd, cwd=cwd)


def main() -> int:
    pkg = json.loads((REPO / 'package.json').read_text(encoding='utf-8'))
    ver = pkg['version']
    stage_parent = REPO / 'work' / 'release-staging'
    stage = stage_parent / 'stm32cubemx2-translator-zh-CN'
    zip_path = REPO / 'work' / f'stm32cubemx2-translator-zh-CN-v{ver}.zip'

    run([npm_exe(), 'run', 'build'], REPO)

    if stage_parent.exists():
        shutil.rmtree(stage_parent)
    stage.mkdir(parents=True)

    copies = [
        ("scripts/Install-ZhCN.ps1", "Install-ZhCN.ps1"),
        ("scripts/INSTALL-ZH-CN.md", "README-INSTALL.md"),
        ("LICENSE", "LICENSE"),
        ("DISCLAIMER.md", "DISCLAIMER.md"),
        ("package.json", "package.json"),
        ("package-lock.json", "package-lock.json"),
        ("runtime/loader.js", "runtime/loader.js"),
        ("locales/zh-CN.po", "locales/zh-CN.po"),
        ("locales/zh-CN.glossary.json", "locales/zh-CN.glossary.json"),
    ]

    for src, dest in copies:
        dst = stage / dest
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / src, dst)

    dist_src = REPO / 'dist'
    for f in dist_src.rglob('*.js'):
        if f.name.endswith('.test.js'):
            continue
        rel = f.relative_to(dist_src)
        dst = stage / 'dist' / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dst)

    print('npm ci --omit=dev in staging', flush=True)
    run([npm_exe(), 'ci', '--omit=dev'], stage)

    if zip_path.exists():
        zip_path.unlink()
    with ZipFile(zip_path, 'w', ZIP_DEFLATED) as zf:
        for f in stage.rglob('*'):
            if f.is_file():
                zf.write(f, f.relative_to(stage.parent))

    print(f'packed {zip_path} ({zip_path.stat().st_size / 1048576:.1f} MB)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
