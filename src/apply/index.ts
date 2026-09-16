/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 安装 / 回滚 / 体检。
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  statSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Catalog, Installation, RuntimeTable } from '../types.js';
import {
  inject,
  injectHtml,
  rollback as doRollback,
  isInjected,
  i18nDir,
  syncGzip,
  MARKER,
} from '../runtime/inject.js';
import { parsePo, poToRuntimeTable, poStats, pseudoTable } from '../catalog/po.js';

/** 包内 runtime/loader.js 的路径。dist/apply/ -> 包根 */
export function runtimeAssetPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'runtime', 'loader.js');
}

export interface InstallOptions {
  /** 要部署的语言，如 zh-CN。对应 locales/<locale>.po */
  locales: string[];
  localesDir: string;
  /** 给了 catalog 就部署伪翻译而非读 PO，用于验证挂钩与覆盖率 */
  pseudoCatalog?: Catalog;
  dryRun?: boolean;
}

export interface InstallReport {
  deployed: { locale: string; entries: number; translated: number }[];
  injected: boolean;
  /** 实际注入的挂钩点数 */
  sites: number;
  htmlPatched: 'inserted' | 'already';
  foreignPatch: boolean;
  bytesDelta: number;
  i18nPath: string;
}

export function install(install_: Installation, opts: InstallOptions): InstallReport {
  const outDir = i18nDir(install_);
  const deployed: InstallReport['deployed'] = [];

  // 1. 译文表：PO -> 运行时 JSON（伪翻译模式则直接由 catalog 生成）
  const tables: { locale: string; table: RuntimeTable }[] = [];
  for (const locale of opts.locales) {
    if (opts.pseudoCatalog) {
      const table = pseudoTable(opts.pseudoCatalog, locale);
      tables.push({ locale, table });
      const n = Object.keys(table.strings).length;
      deployed.push({ locale, entries: n, translated: n });
      continue;
    }
    const poPath = path.join(opts.localesDir, `${locale}.po`);
    if (!existsSync(poPath)) {
      throw new Error(`未找到译文文件：${poPath}\n  先跑 extract 生成 .pot，再用 Poedit 翻译。`);
    }
    const data = parsePo(readFileSync(poPath));
    const table = poToRuntimeTable(data, locale);
    const stats = poStats(data);
    tables.push({ locale, table });
    deployed.push({ locale, entries: stats.total, translated: stats.translated });
  }

  if (!opts.dryRun) {
    mkdirSync(outDir, { recursive: true });
    for (const { locale, table } of tables) {
      // 文件名统一小写，与 Theia 的 localeId（zh-cn）对齐
      writeFileSync(path.join(outDir, `${locale.toLowerCase()}.json`), JSON.stringify(table), 'utf8');
    }
    copyFileSync(runtimeAssetPath(), path.join(outDir, 'loader.js'));
  }

  // 2. 注入。始终以 .orig 为基准，若已注入过则先原地回滚再注入。
  if (isInjected(install_) && !opts.dryRun) doRollback(install_);
  const injectResult = inject(install_, opts.dryRun ?? false);
  const htmlPatched = injectHtml(install_, opts.dryRun ?? false);

  return {
    deployed,
    injected: true,
    sites: injectResult.sites.length,
    htmlPatched,
    foreignPatch: injectResult.foreignPatch,
    bytesDelta: injectResult.bytesAfter - injectResult.bytesBefore,
    i18nPath: outDir,
  };
}

export function rollback(install_: Installation): {
  bundle: boolean;
  html: boolean;
  hadInjection: boolean;
} {
  const hadInjection = isInjected(install_);
  const r = doRollback(install_);
  return { ...r, hadInjection };
}

export interface DoctorReport {
  install: Installation;
  bundleBytes: number;
  origPresent: boolean;
  ourBackupPresent: boolean;
  injected: boolean;
  foreignPatch: boolean;
  gzPresent: boolean;
  gzStale: boolean;
  htmlPatched: boolean;
  i18nFiles: string[];
  runtimePresent: boolean;
  notes: string[];
}


export function backup(install_: Installation, outDir?: string): { outDir: string; files: string[] } {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dest =
    outDir ??
    path.join(os.homedir(), 'stm32cubemx2-translator-backups', `${install_.version}-${stamp}`);
  mkdirSync(dest, { recursive: true });

  const candidates = [
    install_.bundleJs,
    install_.bundleJs + '.gz',
    install_.bundleJs + '.gz.orig',
    install_.bundleOrig,
    install_.bundleJs + '.cubemx2-translator.bak',
    install_.indexHtml,
    install_.indexHtml + '.gz',
    install_.indexHtml + '.cubemx2-translator.bak',
  ];
  const files: string[] = [];
  for (const src of candidates) {
    if (!existsSync(src)) continue;
    const name = path.basename(src);
    copyFileSync(src, path.join(dest, name));
    files.push(name);
  }
  writeFileSync(
    path.join(dest, 'backup-info.json'),
    JSON.stringify(
      {
        root: install_.root,
        version: install_.version,
        appDir: install_.appDir,
        createdAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  return { outDir: dest, files };
}

export function doctor(install_: Installation): DoctorReport {
  const notes: string[] = [];
  const bundle = readFileSync(install_.bundleJs, 'utf8');
  const injected = bundle.includes(MARKER);
  const origPresent = existsSync(install_.bundleOrig);
  const ourBackup = install_.bundleJs + '.cubemx2-translator.bak';
  const ourBackupPresent = existsSync(ourBackup);

  let foreignPatch = false;
  if (origPresent) {
    const orig = readFileSync(install_.bundleOrig, 'utf8');
    foreignPatch = bundle !== orig && !injected;
    if (!injected && foreignPatch) {
      notes.push(
        '当前 bundle.js 与 .orig 不同，且不含本工具的标记——检测到其它汉化工具的补丁。' +
          '本工具的 install 会以 .orig 为基准重新注入，不会在其上叠加。',
      );
    }
  } else {
    notes.push('未找到 bundle.js.orig。首次 install 会自动建立本工具自己的备份。');
  }

  const gz = install_.bundleJs + '.gz';
  const gzPresent = existsSync(gz);
  let gzStale = false;
  if (gzPresent) {
    gzStale = statSync(gz).mtimeMs + 1000 < statSync(install_.bundleJs).mtimeMs;
    if (gzStale) {
      notes.push('bundle.js.gz 比 bundle.js 旧。后端会优先服务 .gz，界面可能显示的是旧内容。');
    }
  }

  const outDir = i18nDir(install_);
  const i18nFiles = listTables(outDir);
  const runtimePresent = existsSync(path.join(outDir, 'loader.js'));

  const html = existsSync(install_.indexHtml) ? readFileSync(install_.indexHtml, 'utf8') : '';
  const htmlPatched = html.includes('st-i18n/loader.js');

  if (injected && !runtimePresent) {
    notes.push('bundle.js 已注入，但 st-i18n/loader.js 缺失。界面会回落英文，请重新 install。');
  }
  if (injected && !htmlPatched) {
    notes.push('bundle.js 已注入，但 index.html 未加载运行时。请重新 install。');
  }

  return {
    install: install_,
    bundleBytes: Buffer.byteLength(bundle),
    origPresent,
    ourBackupPresent,
    injected,
    foreignPatch,
    gzPresent,
    gzStale,
    htmlPatched,
    i18nFiles,
    runtimePresent,
    notes,
  };
}

/** 列出 st-i18n 下的译文表文件名。 */
function listTables(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

export { syncGzip };
