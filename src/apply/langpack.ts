/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 语言包（Tier 1）：激活 Theia 内置的 14 种框架语言。
 *
 * 实测结论（STM32CubeMX2 1.1.1）：
 *   - 后端 registerLocalizationFromRequire() 注册内置翻译时不设 languagePack:true，
 *     前端 I18nPreloadContribution 只装载 languagePack 为真的语言，所以光设
 *     localStorage.localeId 什么都不会发生。
 *   - 任何声明 contributes.localizations 的插件都会把该语言标成 languagePack，
 *     Theia 随即把内置翻译（theia/* 键，约 1300 条）一并激活。
 *   - 但菜单、编辑器、设置等大头走 localizeByDefault()，要查 vscode/* 键——
 *     这些翻译只在微软官方的 VS Code 语言包里（MIT 许可，Open VSX 有）。
 *
 * 所以正确做法就是把微软语言包放进 Theia 的**用户插件目录**（~/.theia-cubemx2/plugins），
 * 不碰 ST 任何文件。放进去之后 theia/* 与 vscode/* 两路键都有了。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import type { Installation } from '../types.js';

export const OPEN_VSX = 'https://open-vsx.org/api';
export const PUBLISHER = 'MS-CEINTL';

/**
 * Theia locale -> 微软语言包名。
 * 微软的命名与 Theia 不完全一致（zh-cn 对应 zh-hans）。
 */
export const PACK_BY_LOCALE: Record<string, string> = {
  'zh-cn': 'vscode-language-pack-zh-hans',
  'zh-tw': 'vscode-language-pack-zh-hant',
  bg: 'vscode-language-pack-bg',
  cs: 'vscode-language-pack-cs',
  de: 'vscode-language-pack-de',
  es: 'vscode-language-pack-es',
  fr: 'vscode-language-pack-fr',
  hu: 'vscode-language-pack-hu',
  it: 'vscode-language-pack-it',
  ja: 'vscode-language-pack-ja',
  ko: 'vscode-language-pack-ko',
  pl: 'vscode-language-pack-pl',
  'pt-br': 'vscode-language-pack-pt-BR',
  ru: 'vscode-language-pack-ru',
  tr: 'vscode-language-pack-tr',
};

export class LangpackError extends Error {}

export function packNameFor(locale: string): string {
  const pack = PACK_BY_LOCALE[locale.toLowerCase()];
  if (!pack) {
    throw new LangpackError(
      `没有 ${locale} 对应的语言包。可用：${Object.keys(PACK_BY_LOCALE).join(', ')}`,
    );
  }
  return pack;
}

/** 从后端产物里读应用内置的 VS Code API 版本。语言包版本要与它对齐。 */
export function detectApiVersion(install: Installation): string | undefined {
  const backend = path.join(install.appDir, 'lib', 'backend', 'main.js');
  if (!existsSync(backend)) return undefined;
  const m = /DEFAULT_SUPPORTED_API_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/.exec(readFileSync(backend, 'utf8'));
  return m?.[1];
}

/**
 * Theia 的配置目录名（本应用是 .theia-cubemx2）。
 * 用户插件目录就在它下面的 plugins/。
 */
export function detectConfigDir(install: Installation): string {
  const backend = path.join(install.appDir, 'lib', 'backend', 'main.js');
  let folder = '.theia';
  if (existsSync(backend)) {
    const m = /configurationFolder\s*:\s*"([^"]+)"/.exec(readFileSync(backend, 'utf8'));
    if (m?.[1]) folder = m[1];
  }
  return path.join(os.homedir(), folder);
}

export function userPluginsDir(install: Installation): string {
  return path.join(detectConfigDir(install), 'plugins');
}

// ------------------------------------------------------------------ 版本解析

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

export function parseSemver(v: string): SemVer | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return undefined;
  return { major: +m[1]!, minor: +m[2]!, patch: +m[3]!, raw: v };
}

function cmp(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * 从可用版本里挑与应用 API 版本最匹配的。
 *
 * 优先级：同一 major.minor 里最高的 patch > 低于目标的最高版本 > 最低的可用版本。
 * 语言包的键会随 VS Code 版本漂移，版本越接近命中越多；宁可略旧不要偏新。
 */
export function pickVersion(available: string[], apiVersion: string | undefined): {
  version: string;
  exact: boolean;
  note?: string;
} {
  const list = available.map(parseSemver).filter((v): v is SemVer => !!v).sort(cmp);
  if (list.length === 0) throw new LangpackError('Open VSX 未返回任何可用版本');

  const target = apiVersion ? parseSemver(apiVersion) : undefined;
  if (!target) {
    const v = list[list.length - 1]!;
    return { version: v.raw, exact: false, note: '未能识别应用的 VS Code API 版本，取最新版' };
  }

  const sameMinor = list.filter((v) => v.major === target.major && v.minor === target.minor);
  if (sameMinor.length) return { version: sameMinor[sameMinor.length - 1]!.raw, exact: true };

  const lower = list.filter((v) => cmp(v, target) < 0);
  if (lower.length) {
    const v = lower[lower.length - 1]!;
    return { version: v.raw, exact: false, note: `没有 ${target.major}.${target.minor}.x，取最接近的较低版本` };
  }

  const v = list[0]!;
  return {
    version: v.raw,
    exact: false,
    note: `可用版本都比应用的 ${apiVersion} 新，取最低版本；部分键可能对不上`,
  };
}

// ------------------------------------------------------------------ 网络

/** Node 的 fetch 不走系统代理；失败时退到 curl（它会）。 */
async function httpGet(url: string): Promise<Buffer> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    try {
      return execFileSync('curl', ['-sL', '--fail', '--max-time', '180', url], {
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      throw new LangpackError(`下载失败：${url}\n  ${(e as Error).message}`);
    }
  }
}

export async function fetchVersions(pack: string): Promise<string[]> {
  const buf = await httpGet(`${OPEN_VSX}/${PUBLISHER}/${pack}/versions`);
  const json = JSON.parse(buf.toString('utf8')) as { versions?: Record<string, string> };
  return Object.keys(json.versions ?? {});
}

export async function fetchMeta(pack: string, version: string): Promise<{ license?: string; engine?: string }> {
  const buf = await httpGet(`${OPEN_VSX}/${PUBLISHER}/${pack}/${version}`);
  const json = JSON.parse(buf.toString('utf8')) as {
    license?: string;
    engines?: { vscode?: string };
  };
  return { license: json.license, engine: json.engines?.vscode };
}

export function vsixFileName(pack: string, version: string): string {
  return `${PUBLISHER}.${pack}-${version}.vsix`;
}

export function vsixUrl(pack: string, version: string): string {
  return `${OPEN_VSX}/${PUBLISHER}/${pack}/${version}/file/${vsixFileName(pack, version)}`;
}

// ------------------------------------------------------------------ 最小 zip 读取

/** 只读一个条目，够校验 package.json 用。不引第三方依赖。 */
export function readZipEntry(zip: Buffer, name: string): Buffer | undefined {
  // End of Central Directory：从尾部往前找签名 50 4b 05 06
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 66000); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return undefined;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return undefined;
    const method = zip.readUInt16LE(p + 10);
    const csize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const entryName = zip.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (entryName !== name) continue;

    if (zip.readUInt32LE(localOff) !== 0x04034b50) return undefined;
    const lNameLen = zip.readUInt16LE(localOff + 26);
    const lExtraLen = zip.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = zip.subarray(start, start + csize);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    return undefined;
  }
  return undefined;
}

/** 校验下载到的确实是一个声明了目标语言的语言包。 */
export function verifyVsix(zip: Buffer, locale: string): { languageId: string; translations: number } {
  if (zip.length < 4 || zip.readUInt32LE(0) !== 0x04034b50) {
    throw new LangpackError('下载内容不是 VSIX（zip）文件');
  }
  const pkg = readZipEntry(zip, 'extension/package.json');
  if (!pkg) throw new LangpackError('VSIX 里没有 extension/package.json');
  const json = JSON.parse(pkg.toString('utf8')) as {
    contributes?: { localizations?: { languageId: string; translations?: unknown[] }[] };
  };
  const loc = json.contributes?.localizations?.find(
    (l) => l.languageId.toLowerCase() === locale.toLowerCase(),
  );
  if (!loc) {
    throw new LangpackError(`VSIX 没有声明 ${locale} 的 contributes.localizations`);
  }
  return { languageId: loc.languageId, translations: loc.translations?.length ?? 0 };
}

// ------------------------------------------------------------------ 安装 / 列表 / 移除

export interface InstalledPack {
  file: string;
  pack: string;
  version: string;
  locale?: string;
}

export function listInstalled(install: Installation): InstalledPack[] {
  const dir = userPluginsDir(install);
  if (!existsSync(dir)) return [];
  const out: InstalledPack[] = [];
  const re = new RegExp(`^${PUBLISHER}\\.(vscode-language-pack-[\\w-]+)-(\\d+\\.\\d+\\.\\d+)\\.vsix$`, 'i');
  for (const f of readdirSync(dir)) {
    const m = re.exec(f);
    if (!m) continue;
    const pack = m[1]!;
    const locale = Object.entries(PACK_BY_LOCALE).find(
      ([, p]) => p.toLowerCase() === pack.toLowerCase(),
    )?.[0];
    out.push({ file: path.join(dir, f), pack, version: m[2]!, ...(locale ? { locale } : {}) });
  }
  return out;
}

export interface InstallPackResult {
  locale: string;
  pack: string;
  version: string;
  exact: boolean;
  note?: string;
  license?: string;
  file: string;
  /** 已存在同版本文件，未重新下载 */
  reused: boolean;
  translations: number;
  removedOld: string[];
}

export async function installPack(
  install: Installation,
  locale: string,
  opts: { version?: string; dryRun?: boolean } = {},
): Promise<InstallPackResult> {
  const pack = packNameFor(locale);
  const api = detectApiVersion(install);

  let version = opts.version;
  let exact = true;
  let note: string | undefined;
  if (!version) {
    const picked = pickVersion(await fetchVersions(pack), api);
    version = picked.version;
    exact = picked.exact;
    note = picked.note;
  }

  const meta = await fetchMeta(pack, version).catch(() => ({}) as { license?: string });
  const dir = userPluginsDir(install);
  const file = path.join(dir, vsixFileName(pack, version));

  // 同一语言的旧版本要清掉，否则 Theia 会同时部署两份
  const removedOld = listInstalled(install)
    .filter((p) => p.pack.toLowerCase() === pack.toLowerCase() && p.file !== file)
    .map((p) => p.file);

  let zip: Buffer;
  let reused = false;
  if (existsSync(file)) {
    zip = readFileSync(file);
    reused = true;
  } else {
    zip = await httpGet(vsixUrl(pack, version));
  }
  const verified = verifyVsix(zip, locale);

  if (!opts.dryRun) {
    mkdirSync(dir, { recursive: true });
    if (!reused) writeFileSync(file, zip);
    for (const old of removedOld) unlinkSync(old);
  }

  return {
    locale,
    pack,
    version,
    exact,
    ...(note ? { note } : {}),
    ...(meta.license ? { license: meta.license } : {}),
    file,
    reused,
    translations: verified.translations,
    removedOld,
  };
}

export function removePack(install: Installation, locale: string): string[] {
  const pack = packNameFor(locale);
  const removed: string[] = [];
  for (const p of listInstalled(install)) {
    if (p.pack.toLowerCase() === pack.toLowerCase()) {
      unlinkSync(p.file);
      removed.push(p.file);
    }
  }
  return removed;
}
