/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Invoked by the native installer using its private, bundled node.exe.
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { locate } from '../locate.js';
import { doctor } from '../apply/index.js';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values } = parseArgs({ options: {
  action: { type: 'string', default: 'install' },
  app: { type: 'string' },
  'skip-langpack': { type: 'boolean', default: false },
  log: { type: 'string' },
  result: { type: 'string' },
} });

function log(message: string): void {
  if (values.log) appendFileSync(values.log, message + '\n', 'utf8');
  else console.log(message);
}

function assertStopped(): void {
  if (process.platform !== 'win32') throw new Error('此入口仅支持 Windows。');
  const tasklist = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tasklist.exe');
  const result = spawnSync(tasklist, ['/FO', 'CSV', '/NH'], {
    encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  if (result.error || result.status !== 0) throw new Error('无法检查应用进程，请关闭 CubeMX2 后重试。');
  const running = result.stdout.split(/\r?\n/)
    .filter(line => /^"(?:cube|stm32cubemx2)\.exe",/i.test(line));
  if (running.length) throw new Error('请先完全退出 STM32CubeMX2，再重试。\n' + running.join('\n'));
}

function run(args: string[], app: string): void {
  log('\n> cubemx2-translator ' + args.join(' '));
  const fd = values.log ? openSync(values.log, 'a') : undefined;
  try {
    const result = spawnSync(process.execPath, [path.join(kit, 'dist', 'cli.js'), ...args, '--app', app], {
      cwd: kit, windowsHide: true, timeout: 10 * 60_000,
      stdio: ['ignore', fd ?? 'inherit', fd ?? 'inherit'],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${args[0]} 执行失败（退出码 ${result.status}）。`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function main(): { code: number; message: string } {
  if (values.log) {
    mkdirSync(path.dirname(values.log), { recursive: true });
    writeFileSync(values.log, '\uFEFF', 'utf8');
  }
  log(`STM32CubeMX2 中文工具 | ${new Date().toISOString()} | Node ${process.versions.node}`);
  const action = values.action!;
  if (!['install', 'backup', 'rollback', 'doctor'].includes(action)) {
    throw new Error(`不支持的操作：${action}`);
  }
  if (action === 'install' || action === 'rollback') assertStopped();
  const app = locate(values.app?.trim() || undefined);
  log(`操作：${action}\n安装目录：${app.root}\n应用版本：${app.version}`);
  if (action !== 'install') {
    run([action], app.root);
    const note = action === 'rollback' ? '\n还原仅撤销本工具的注入，不移除框架语言包。' : '';
    return { code: 0, message: `${{ backup: '备份', rollback: '还原', doctor: '检查' }[action]}完成。\n详细结果见操作日志。${note}` };
  }

  let warning = '';
  if (!values['skip-langpack']) {
    try {
      run(['langpack', 'install', '--locale', 'zh-cn'], app.root);
    } catch (error) {
      warning = '框架中文语言包下载或安装失败。ST 界面译文已部署；若语言列表没有简体中文，请联网后重新运行安装。';
      log(`[警告] 框架语言包安装失败，将继续尝试部署 ST 界面译文。\n${(error as Error).message}`);
    }
  }
  // Downloads can take time; the user might have reopened CubeMX2 meanwhile.
  assertStopped();
  run(['install', '--locale', 'zh-CN'], app.root);
  run(['doctor'], app.root);
  const state = doctor(app);
  if (!state.injected || !state.htmlPatched || !state.runtimePresent ||
      !state.i18nFiles.includes('zh-cn.json') || state.gzStale) {
    throw new Error('安装后的检查未通过，请查看日志；可重新运行本程序选择“还原”。');
  }
  const next = '启动 STM32CubeMX2，按 F1 → Configure Display Language → 简体中文 (zh-cn)，然后重载。';
  return { code: warning ? 2 : 0, message: warning ? `${warning}\n\n${next}` : `中文译文安装完成。\n\n${next}` };
}

let outcome: { code: number; message: string };
try {
  outcome = main();
} catch (error) {
  let detail = '';
  try { if (values.log) detail = readFileSync(values.log, 'utf8').slice(-1800); } catch { /* log unavailable */ }
  outcome = { code: 1, message: `${(error as Error).message}\n\n${detail}` };
}
try {
  log('\n' + outcome.message);
  if (values.result) writeFileSync(values.result, outcome.message, 'utf8');
} catch (error) {
  console.error(error);
  outcome.code = 1;
}
process.exitCode = outcome.code;
