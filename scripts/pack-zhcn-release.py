#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

REPO = Path(__file__).resolve().parent.parent
NODE_VERSION = '24.21.0'
NODE_SHA256 = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'
CHINESE_SHA256 = '7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278'


def download_verified(url: str, name: str, sha256: str) -> Path:
    cache = REPO / 'work' / 'downloads'
    cache.mkdir(parents=True, exist_ok=True)
    dest = cache / name
    if not dest.exists():
        print(f'downloading {url}', flush=True)
        partial = dest.with_suffix(dest.suffix + '.part')
        with urllib.request.urlopen(url, timeout=120) as response, partial.open('wb') as output:
            shutil.copyfileobj(response, output)
        with partial.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        if digest != sha256:
            partial.unlink()
            raise ValueError(f'SHA256 mismatch: {name}')
        partial.replace(dest)
    with dest.open('rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != sha256:
            raise ValueError(f'SHA256 mismatch in cache: {dest}')
    return dest


def find_iscc(explicit: str | None) -> str:
    candidates = [explicit, os.environ.get('ISCC'), shutil.which('ISCC.exe')]
    for base in [os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramFiles'),
                 str(Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs')]:
        if base:
            candidates.append(str(Path(base) / 'Inno Setup 6' / 'ISCC.exe'))
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    raise FileNotFoundError('Install Inno Setup 6.5+ or pass --iscc C:\\path\\ISCC.exe')


def build_exe(stage: Path, ver: str, compiler: str) -> None:
    name = f'node-v{NODE_VERSION}-win-x64'
    archive = download_verified(f'https://nodejs.org/dist/v{NODE_VERSION}/{name}.zip',
                                name + '.zip', NODE_SHA256)
    with ZipFile(archive) as zf:
        # Do not ship npm or rely on a system-wide Node installation.
        (stage / 'node.exe').write_bytes(zf.read(f'{name}/node.exe'))
        (stage / 'NODE-LICENSE.txt').write_bytes(zf.read(f'{name}/LICENSE'))
    language = download_verified(
        'https://raw.githubusercontent.com/jrsoftware/issrc/is-6_7_1/Files/Languages/Unofficial/ChineseSimplified.isl',
        'ChineseSimplified-6.7.1.isl', CHINESE_SHA256)
    (stage / 'runtime-manifest.json').write_text(json.dumps({
        'node': NODE_VERSION, 'archive': name + '.zip', 'sha256': NODE_SHA256,
    }, indent=2) + '\n', encoding='utf-8')
    output = REPO / 'work'
    run([compiler, '/Qp', f'/DKitDir={stage}', f'/DAppVersion={ver}',
         f'/DOutputDir={output}', f'/DChineseMessages={language}',
         str(REPO / 'scripts' / 'windows-installer.iss')], REPO)
    exe = output / f'stm32cubemx2-translator-zh-CN-v{ver}-windows-x64-setup.exe'
    with exe.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    exe.with_suffix('.exe.sha256').write_text(f'{digest}  {exe.name}\n', encoding='ascii')
    print(f'packed {exe} ({exe.stat().st_size / 1048576:.1f} MB)')


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
    parser = argparse.ArgumentParser(description='Build the script ZIP or self-contained Windows installer')
    parser.add_argument('--exe', action='store_true', help='bundle Node.js and compile a native setup EXE')
    parser.add_argument('--iscc', help='path to Inno Setup ISCC.exe')
    args = parser.parse_args()
    compiler = find_iscc(args.iscc) if args.exe else None
    pkg = json.loads((REPO / 'package.json').read_text(encoding='utf-8'))
    ver = pkg['version']
    stage_parent = REPO / 'work' / 'release-staging'
    stage = stage_parent / ('stm32cubemx2-translator-zh-CN-windows-x64' if args.exe
                            else 'stm32cubemx2-translator-zh-CN')
    zip_path = REPO / 'work' / f'stm32cubemx2-translator-zh-CN-v{ver}.zip'

    run([npm_exe(), 'run', 'build'], REPO)

    if stage.is_symlink() or stage.resolve().parent != stage_parent.resolve():
        raise ValueError(f'Unsafe staging path: {stage}')
    if stage.exists():
        shutil.rmtree(stage)
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

    if args.exe:
        # Installer only runs install/langpack/backup/rollback/doctor. extract
        # still needs typescript, but that command is not part of the EXE flow.
        pruned = []
        for name in ('typescript', '@types'):
            extra = stage / 'node_modules' / name
            if extra.exists():
                shutil.rmtree(extra)
                pruned.append(name)
        bin_dir = stage / 'node_modules' / '.bin'
        if bin_dir.exists():
            for leftover in (*bin_dir.glob('tsc*'), *bin_dir.glob('tsserver*')):
                leftover.unlink()
                pruned.append(leftover.name)
        if pruned:
            print('pruned from EXE payload: ' + ', '.join(pruned), flush=True)
        assert compiler is not None
        build_exe(stage, ver, compiler)
        return 0

    if zip_path.exists():
        zip_path.unlink()
    with ZipFile(zip_path, 'w', ZIP_DEFLATED) as zf:
        for f in sorted(stage.rglob('*')):
            if f.is_file():
                zf.write(f, f.relative_to(stage.parent))

    print(f'packed {zip_path} ({zip_path.stat().st_size / 1048576:.1f} MB)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
