"""Exercise the actual setup EXE in an isolated fixture, without developer tools on PATH."""
from __future__ import annotations

import argparse
import gzip
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('exe', type=Path)
    parser.add_argument('--source-app', type=Path, help='optional real app directory; ONLY copies frontend files')
    args = parser.parse_args()
    exe = args.exe.resolve(strict=True)
    if os.name != 'nt':
        raise SystemExit('Windows only')
    parent = REPO / 'work' / 'installer-tests'
    parent.mkdir(parents=True, exist_ok=True)
    workspace = Path(tempfile.mkdtemp(prefix='安装测试 ', dir=parent))
    app = workspace / '中文 & 100% space' / 'resources' / 'stm32cubemx-application' / '1.1.1' / 'dist' / 'resources' / 'app'
    front = app / 'lib' / 'frontend'
    front.mkdir(parents=True)
    if args.source_app:
        source = args.source_app / 'lib' / 'frontend'
        for name in ['bundle.js', 'index.html']:
            candidates = [source / (name + '.cubemx2-translator.bak'), source / (name + '.orig'), source / name]
            original = next(p for p in candidates if p.exists())
            shutil.copy2(original, front / name)
    else:
        (front / 'bundle.js').write_text('/* react.production.min */ R.createElement=f;R.createContext=g;R.createRef=h;', encoding='utf-8')
        (front / 'index.html').write_text('<html><script src="./bundle.js"></script></html>', encoding='utf-8')
    original_bundle = (front / 'bundle.js').read_bytes()
    original_html = (front / 'index.html').read_bytes()
    (front / 'bundle.js.gz').write_bytes(gzip.compress(original_bundle))
    (app / 'package.json').write_text('{"version":"1.1.1"}', encoding='utf-8')
    profile = workspace / 'profile'
    local = profile / 'AppData' / 'Local'
    local.mkdir(parents=True)
    env = dict(os.environ)
    for key in list(env):
        if key.lower() in ['path', 'userprofile', 'localappdata', 'appdata', 'stm32cubemx2_path']:
            del env[key]
    env.update(PATH=str(Path(os.environ['SystemRoot']) / 'System32'), USERPROFILE=str(profile),
               LOCALAPPDATA=str(local), APPDATA=str(profile / 'AppData' / 'Roaming'))
    results = []

    def run(action: str, target: Path | None = app, success: bool = True) -> None:
        log = workspace / f'{len(results):02d}-{action}-setup.log'
        command = [str(exe), '/VERYSILENT', '/SUPPRESSMSGBOXES', '/SP-', '/NORESTART',
                   f'/ACTION={action}', '/SKIPLANGPACK=1', f'/LOG={log}',
                   f'/OPLOG={workspace / (str(len(results)) + "-operation.log")}']
        if target is not None:
            command.append(f'/APP={target}')
        result = subprocess.run(command, cwd=workspace, env=env, timeout=240,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        results.append({'action': action, 'exitCode': result.returncode, 'expectedSuccess': success})
        (workspace / 'summary.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        assert (result.returncode == 0) == success, f'{action}: exit {result.returncode}; see {log}'
        print(f'{action}: exit {result.returncode} (expected {"success" if success else "failure"})', flush=True)

    # Auto-discovery uses an explicit fixture environment variable, never the real install.
    env['STM32CUBEMX2_PATH'] = str(workspace / '中文 & 100% space')
    run('install', target=None)
    patched = (front / 'bundle.js').read_bytes()
    assert b'/*cubemx2-translator*/' in patched
    assert b'st-i18n/loader.js' in (front / 'index.html').read_bytes()
    assert (front / 'st-i18n' / 'zh-cn.json').is_file()
    assert gzip.decompress((front / 'bundle.js.gz').read_bytes()) == patched
    run('install')
    assert (front / 'bundle.js').read_bytes() == patched
    assert (front / 'bundle.js.cubemx2-translator.bak').read_bytes() == original_bundle
    run('backup')
    assert list((profile / 'stm32cubemx2-translator-backups').glob('*/backup-info.json'))
    run('doctor')
    run('rollback')
    assert (front / 'bundle.js').read_bytes() == original_bundle
    assert (front / 'index.html').read_bytes() == original_html
    assert gzip.decompress((front / 'bundle.js.gz').read_bytes()) == original_bundle
    run('install', target=workspace / '不存在', success=False)
    run('unknown', success=False)

    # Exercise the process guard using our own renamed, disposable Node process.
    node = REPO / 'work' / 'release-staging' / 'stm32cubemx2-translator-zh-CN-windows-x64' / 'node.exe'
    blocker = workspace / 'cube.exe'
    shutil.copy2(node, blocker)
    process = subprocess.Popen([str(blocker), '-e', 'setInterval(() => {}, 1000)'],
                               env=env, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        run('install', success=False)
        assert (front / 'bundle.js').read_bytes() == original_bundle
    finally:
        process.terminate()
        process.wait(timeout=10)
    logs = list(workspace.glob('*-operation.log'))
    assert any('请先完全退出' in p.read_text(encoding='utf-8-sig') for p in logs)
    assert all('Node 24.' in p.read_text(encoding='utf-8-sig') for p in logs)
    print(f'All installer checks passed. Evidence: {workspace}', flush=True)


if __name__ == '__main__':
    main()
