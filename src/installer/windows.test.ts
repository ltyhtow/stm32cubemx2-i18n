import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./windows.js', import.meta.url));

test('Windows installer installs, repeats, diagnoses and restores without Node or PowerShell on PATH',
  { skip: process.platform !== 'win32' }, () => {
    const temp = mkdtempSync(path.join(tmpdir(), 'cubemx2 installer 中文 '));
    const app = path.join(temp, '测试 & 100% 空格');
    const front = path.join(app, 'lib', 'frontend');
    mkdirSync(front, { recursive: true });
    const bundle = '/* react.production.min */ R.createElement=f;R.createContext=g;R.createRef=h;';
    const html = '<html><script src="./bundle.js"></script></html>';
    writeFileSync(path.join(app, 'package.json'), '{"version":"1.1.1"}');
    writeFileSync(path.join(front, 'bundle.js'), bundle);
    writeFileSync(path.join(front, 'bundle.js.gz'), gzipSync(bundle));
    writeFileSync(path.join(front, 'index.html'), html);
    const log = path.join(temp, '操作.log');
    const result = path.join(temp, '结果.txt');
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') env[key] = '';
    const run = (action: string, target = app) => spawnSync(process.execPath,
      [runner, '--action', action, '--app', target, '--skip-langpack', '--log', log, '--result', result],
      { env, cwd: temp, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
    try {
      for (const action of ['install', 'install', 'doctor']) {
        const r = run(action);
        assert.equal(r.status, 0, `${r.error ?? r.stderr}\n${readFileSync(result, 'utf8')}`);
        assert.match(readFileSync(path.join(front, 'bundle.js'), 'utf8'), /cubemx2-translator/);
        assert.match(readFileSync(path.join(front, 'index.html'), 'utf8'), /st-i18n\/loader.js/);
        assert.equal(readFileSync(path.join(front, 'bundle.js.cubemx2-translator.bak'), 'utf8'), bundle);
        assert.equal(gunzipSync(readFileSync(path.join(front, 'bundle.js.gz'))).toString(),
          readFileSync(path.join(front, 'bundle.js'), 'utf8'));
      }
      assert.equal(run('rollback').status, 0);
      assert.equal(readFileSync(path.join(front, 'bundle.js'), 'utf8'), bundle);
      assert.equal(readFileSync(path.join(front, 'index.html'), 'utf8'), html);
      assert.equal(gunzipSync(readFileSync(path.join(front, 'bundle.js.gz'))).toString(), bundle);
      assert.equal(run('install', path.join(temp, '不存在')).status, 1);
      assert.match(readFileSync(result, 'utf8'), /未找到 STM32CubeMX2/);
      assert.equal(existsSync(path.join(temp, '不存在')), false);
      assert.equal(run('bad-action').status, 1);
      assert.match(readFileSync(result, 'utf8'), /不支持的操作/);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
