/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 定位本机的 STM32CubeMX2 安装。
 *
 * 查找顺序：显式 --app > 环境变量 > 常见安装路径 > Windows 注册表。
 * 一个目录只有在能找到 lib/frontend/bundle.js 时才算有效安装。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import type { Installation } from './types.js';

const APP_SUBPATH = ['resources', 'stm32cubemx-application'];

/** 从 app 目录反推出一个完整的 Installation。找不到 bundle.js 则返回 undefined。 */
function fromAppDir(root: string, version: string, appDir: string): Installation | undefined {
  const frontendDir = path.join(appDir, 'lib', 'frontend');
  const bundleJs = path.join(frontendDir, 'bundle.js');
  if (!existsSync(bundleJs)) return undefined;
  return {
    root,
    version,
    appDir,
    frontendDir,
    bundleJs,
    bundleOrig: path.join(frontendDir, 'bundle.js.orig'),
    bundleMap: path.join(frontendDir, 'bundle.js.map'),
    indexHtml: path.join(frontendDir, 'index.html'),
  };
}

/**
 * 探测一个候选根目录。
 * 目录结构是 <root>/resources/stm32cubemx-application/<version>/dist/resources/app，
 * 同一个 root 下可能并存多个版本，取版本号最大的那个。
 */
export function probe(root: string): Installation | undefined {
  if (!existsSync(root) || !statSync(root).isDirectory()) return undefined;

  const appsDir = path.join(root, ...APP_SUBPATH);
  if (!existsSync(appsDir)) return undefined;

  const versions = readdirSync(appsDir)
    .filter((v) => existsSync(path.join(appsDir, v, 'dist', 'resources', 'app')))
    .sort(compareVersionDesc);

  for (const version of versions) {
    const appDir = path.join(appsDir, version, 'dist', 'resources', 'app');
    const found = fromAppDir(root, version, appDir);
    if (found) return found;
  }
  return undefined;
}

/** 版本号降序比较，1.10.0 要排在 1.9.0 前面。 */
function compareVersionDesc(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return b.localeCompare(a);
}

function candidateRoots(): string[] {
  const out: string[] = [];
  const push = (p: string | undefined) => {
    if (p && !out.includes(p)) out.push(p);
  };

  for (const key of ['STM32CUBEMX2_PATH', 'STM32CubeMX2_PATH']) {
    push(process.env[key]);
  }

  const home = os.homedir();
  const localAppData = process.env['LOCALAPPDATA'] ?? path.join(home, 'AppData', 'Local');
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  const st = 'STMicroelectronics';

  // 同一父目录下可能有 STM32CubeMX2_1.1.1、STM32CubeMX2_1.2.0 等多个版本目录
  for (const base of [path.join(localAppData, st), path.join(programFiles, st), path.join(home, st)]) {
    if (!existsSync(base)) continue;
    try {
      for (const name of readdirSync(base)) {
        if (/^STM32CubeMX2/i.test(name)) push(path.join(base, name));
      }
    } catch {
      // 目录不可读则跳过
    }
  }

  if (process.platform === 'darwin') {
    push('/Applications/STM32CubeMX2.app/Contents/Resources');
  } else if (process.platform === 'linux') {
    push(path.join(home, '.local', 'share', st));
    push('/opt/st/stm32cubemx2');
  }

  return out;
}

/** 从 Windows 卸载信息里找安装路径。非 Windows 或查询失败返回空数组。 */
function registryRoots(): string[] {
  if (process.platform !== 'win32') return [];
  const out: string[] = [];
  const hives = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  for (const hive of hives) {
    try {
      const stdout = execFileSync('reg', ['query', hive, '/s', '/f', 'STM32CubeMX2', '/d'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15_000,
        windowsHide: true,
      });
      for (const m of stdout.matchAll(/InstallLocation\s+REG_SZ\s+(.+)/g)) {
        const loc = m[1]?.trim();
        if (loc) out.push(loc);
      }
    } catch {
      // reg 不可用或无匹配项
    }
  }
  return out;
}

export class InstallationNotFoundError extends Error {
  constructor(readonly tried: string[]) {
    super(
      '未找到 STM32CubeMX2 安装目录。\n' +
        '  用 --app <路径> 指定，或设置环境变量 STM32CUBEMX2_PATH。\n' +
        (tried.length ? `  已尝试：\n${tried.map((t) => `    ${t}`).join('\n')}` : ''),
    );
    this.name = 'InstallationNotFoundError';
  }
}

/**
 * 定位安装。
 * @param explicit 用户通过 --app 指定的路径。可以是安装根目录，也可以直接是 app 目录。
 */
export function locate(explicit?: string): Installation {
  if (explicit) {
    const resolved = path.resolve(explicit);
    const direct = probe(resolved);
    if (direct) return direct;

    // 也接受直接指向 .../dist/resources/app 的路径
    if (existsSync(path.join(resolved, 'lib', 'frontend', 'bundle.js'))) {
      const version = readAppVersion(resolved) ?? 'unknown';
      const found = fromAppDir(resolved, version, resolved);
      if (found) return found;
    }
    throw new InstallationNotFoundError([resolved]);
  }

  const tried = [...candidateRoots(), ...registryRoots()];
  for (const root of tried) {
    const found = probe(root);
    if (found) return found;
  }
  throw new InstallationNotFoundError(tried);
}

/** 从 app/package.json 读版本号。 */
function readAppVersion(appDir: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version;
  } catch {
    return undefined;
  }
}

/** 列出所有能找到的安装，供 doctor 展示。 */
export function locateAll(): Installation[] {
  const seen = new Set<string>();
  const out: Installation[] = [];
  for (const root of [...candidateRoots(), ...registryRoots()]) {
    const found = probe(root);
    if (found && !seen.has(found.appDir)) {
      seen.add(found.appDir);
      out.push(found);
    }
  }
  return out;
}
